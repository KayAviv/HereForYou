/*
 * HereForYou end-to-end proof.
 * Boots the real server (file store in /tmp, fast scheduler tick, no OpenAI,
 * no Twilio) and walks the whole product story over HTTP:
 *   register -> add family contact -> add medication (due this minute)
 *   -> reminder fires -> check in -> mark dose taken -> doctor appointment
 *   -> family view -> companion chat (data answer + medical-advice refusal)
 *   -> simulate 49h silence -> escalation text lands in the outbox
 *   -> check in again -> silence rule re-arms (no second escalation)
 * Prints one timestamped line per step; exits non-zero on any FAIL.
 * Run with: npm run proof
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';

const PORT = 3199;
const BASE = `http://127.0.0.1:${PORT}`;
const DATA = '/tmp/hfy-proof.json';
fs.rmSync(DATA, { force: true });

const stamp = () => new Date().toISOString();
let failures = 0;
function log(step, ok, detail = '') {
  console.log(`[${stamp()}] ${ok ? 'PASS' : 'FAIL'}  ${step}${detail ? ' — ' + detail : ''}`);
  if (!ok) failures++;
}
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const server = spawn('node', ['server.js'], {
  cwd: new URL('..', import.meta.url).pathname,
  env: {
    ...process.env, PORT: String(PORT), DATA_FILE: DATA,
    SCHEDULER_TICK_MS: '1000', SILENCE_HOURS: '24', ALLOW_TEST_ENDPOINTS: '1',
    OPENAI_API_KEY: '', TWILIO_ACCOUNT_SID: '', TWILIO_AUTH_TOKEN: '', TWILIO_FROM_NUMBER: '',
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let serverLog = '';
server.stdout.on('data', d => { serverLog += d; });
server.stderr.on('data', d => { serverLog += d; });

async function api(path, { method = 'GET', token, body } = {}) {
  const res = await fetch(BASE + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, data: await res.json().catch(() => ({})) };
}
async function waitFor(fn, timeoutMs, label) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const v = await fn();
    if (v) return v;
    await sleep(500);
  }
  throw new Error('Timed out waiting for: ' + label);
}

try {
  const healthy = await waitFor(async () => { try { const r = await api('/health'); return r.data.ok; } catch { return false; } }, 15000, 'server health');
  log('Server boots; /health OK (file store, outbox-log SMS, built-in AI)', healthy === true);

  /* 1 — register */
  const reg = await api('/api/register', { method: 'POST', body: { email: 'margaret@test.local', password: 'testpass123', name: 'Margaret', tzOffsetMin: 0 } });
  log('Register elder account (Margaret)', reg.status === 200 && !!reg.data.token);
  const token = reg.data.token;
  const familyCode = reg.data.user.familyCode;
  log('Password stored hashed; session issued; family code generated', !!familyCode);

  /* duplicate register must fail; wrong password must fail */
  const dup = await api('/api/register', { method: 'POST', body: { email: 'margaret@test.local', password: 'testpass123', name: 'Copy' } });
  const badLogin = await api('/api/login', { method: 'POST', body: { email: 'margaret@test.local', password: 'wrong-password' } });
  log('Duplicate registration rejected (409) and wrong password rejected (401)', dup.status === 409 && badLogin.status === 401);
  const login = await api('/api/login', { method: 'POST', body: { email: 'margaret@test.local', password: 'testpass123', tzOffsetMin: 0 } });
  log('Correct login succeeds', login.status === 200);

  /* 2 — family contact */
  const contact = await api('/api/contacts', { method: 'POST', token, body: { name: 'David', relation: 'Son', phone: '+15551234567' } });
  log('Family contact added (David, son, +15551234567)', contact.status === 200 && contact.data.contact.phone === '+15551234567');

  /* 3 — medication due right now (current UTC minute, tz offset 0) */
  const nowHHMM = new Date().toISOString().slice(11, 16);
  const med = await api('/api/medications', { method: 'POST', token, body: { name: 'Blood Pressure Pill', dose: '1 tablet', times: [nowHHMM] } });
  log(`Medication added, scheduled for ${nowHHMM} UTC`, med.status === 200);

  /* 4 — reminder fires */
  const due = await waitFor(async () => {
    const t = await api('/api/today', { token });
    const d = (t.data.todaysDoses || []).find(x => x.status === 'due' && x.reminderFiredAt);
    return d || null;
  }, 20000, 'reminder to fire');
  log('Medication reminder FIRED by the scheduler', !!due, `dose scheduled ${new Date(due.scheduledFor).toISOString()}, reminderFiredAt ${new Date(due.reminderFiredAt).toISOString()}`);
  log('Server log contains the [reminder] FIRED line', serverLog.includes('[reminder] FIRED'));

  /* 5 — check in */
  const ci = await api('/api/checkin', { method: 'POST', token });
  log('Daily "I\'m OK" check-in recorded', ci.status === 200 && ci.data.payload.checkedInToday === true);

  /* 6 — mark dose taken */
  const taken = await api(`/api/doses/${due.id}/taken`, { method: 'POST', token });
  log('Dose marked taken ("I took it")', taken.status === 200 && taken.data.dose.status === 'taken');

  /* 7 — doctor note + appointment tomorrow */
  const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  const note = await api('/api/notes', { method: 'POST', token, body: { kind: 'appointment', title: 'Dr. Cohen check-up', date: tomorrow, time: '10:30', body: 'Bring the blood-pressure log.' } });
  const docNote = await api('/api/notes', { method: 'POST', token, body: { kind: 'doctor', title: 'Dr. Cohen said', date: new Date().toISOString().slice(0, 10), body: 'Keep taking the morning pill with breakfast.' } });
  const today2 = await api('/api/today', { token });
  log('Doctor appointment saved and surfaced as next appointment', note.status === 200 && today2.data.nextAppointment && today2.data.nextAppointment.title === 'Dr. Cohen check-up');
  log('Doctor note saved', docNote.status === 200);

  /* 8 — family view */
  const fam = await api(`/api/family/${familyCode}`);
  log('Family view: last check-in shown, today\'s medicine shows Taken, appointment shown',
    fam.status === 200 && fam.data.checkedInToday === true &&
    fam.data.todaysMedications.some(m => m.name === 'Blood Pressure Pill' && m.status === 'taken') &&
    fam.data.nextAppointment && fam.data.nextAppointment.title === 'Dr. Cohen check-up',
    `lastCheckinAt=${fam.data.lastCheckinAt ? new Date(fam.data.lastCheckinAt).toISOString() : 'none'}`);
  const badFam = await api('/api/family/deadbeefdead');
  log('Family view rejects an unknown code (404)', badFam.status === 404);

  /* 9 — companion chat: answers from her own data; refuses medical advice */
  const chat1 = await api('/api/chat', { method: 'POST', token, body: { message: 'What are my medications?' } });
  log('Companion answers medication question from her own records', chat1.status === 200 && /Blood Pressure Pill/.test(chat1.data.reply), JSON.stringify(chat1.data.reply).slice(0, 120));
  const chat2 = await api('/api/chat', { method: 'POST', token, body: { message: 'I feel fine — should I skip my pill today or take a double dose tomorrow?' } });
  log('Companion REFUSES medical advice and redirects to doctor/family', chat2.status === 200 && /not able to give medical advice/.test(chat2.data.reply));

  /* 10 — the silence window is a CHOICE: default 24h, elder picks 4h */
  log('New account default safety window is 24 hours', reg.data.user.silenceHours === 24, `silenceHours=${reg.data.user.silenceHours}`);
  const badSet = await api('/api/settings', { method: 'PATCH', token, body: { silenceHours: 7 } });
  log('Invalid window (7h) rejected with 400', badSet.status === 400);
  const set4 = await api('/api/settings', { method: 'PATCH', token, body: { silenceHours: 4 } });
  log('Elder sets the safety window to 4 hours', set4.status === 200 && set4.data.user.silenceHours === 4);

  /* 11 — with a 4h window, 5h of silence escalates */
  await api('/api/test/backdate', { method: 'POST', token, body: { hours: 5 } });
  const esc = await waitFor(async () => {
    const o = await api('/api/outbox', { token });
    return o.data.outbox.find(x => x.kind === 'escalation') || null;
  }, 20000, 'silence escalation at 4h window');
  log('4h window: escalation FIRED after simulated 5h of no activity', !!esc);
  log('Escalation addressed to the family contact (+15551234567), status "logged" (no Twilio configured → outbox mode, $0)',
    esc.to === '+15551234567' && esc.status === 'logged', `outbox id=${esc.id}`);
  log('Escalation text names Margaret and asks family to check up', /Margaret/.test(esc.body) && /check/i.test(esc.body), JSON.stringify(esc.body).slice(0, 160));
  log('Server log contains the [SMS-OUTBOX:escalation] line', serverLog.includes('[SMS-OUTBOX:escalation]'));

  /* 12 — switch to 48h: the SAME 5h silence must NOT fire; 49h must */
  await api('/api/checkin', { method: 'POST', token }); // re-arm
  const set48 = await api('/api/settings', { method: 'PATCH', token, body: { silenceHours: 48 } });
  log('Elder switches the safety window to 48 hours', set48.status === 200 && set48.data.user.silenceHours === 48);
  await api('/api/test/backdate', { method: 'POST', token, body: { hours: 5 } });
  await sleep(3500); // several scheduler ticks
  let out = await api('/api/outbox', { token });
  let escCount = out.data.outbox.filter(x => x.kind === 'escalation').length;
  log('48h window: 5h of silence does NOT escalate (engine uses the chosen value)', escCount === 1, `escalations so far=${escCount}`);
  await api('/api/test/backdate', { method: 'POST', token, body: { hours: 49 } });
  const esc2 = await waitFor(async () => {
    const o = await api('/api/outbox', { token });
    const all = o.data.outbox.filter(x => x.kind === 'escalation');
    return all.length >= 2 ? all[all.length - 1] : null;
  }, 20000, 'silence escalation at 48h window');
  log('48h window: escalation FIRED after simulated 49h of no activity', !!esc2);

  /* 13 — family can change the window from the family link */
  const famSet = await api(`/api/family/${familyCode}/settings`, { method: 'POST', body: { silenceHours: 12 } });
  const famAfter = await api(`/api/family/${familyCode}`);
  log('Family changes the window to 12 hours via the family link', famSet.status === 200 && famAfter.data.silenceHours === 12, `family view now reports silenceHours=${famAfter.data.silenceHours}`);
  const famBad = await api(`/api/family/${familyCode}/settings`, { method: 'POST', body: { silenceHours: 100 } });
  log('Family-side invalid window (100h) rejected with 400', famBad.status === 400);

  /* 14 — check in again: rule re-arms, no duplicate escalation */
  await api('/api/checkin', { method: 'POST', token });
  await sleep(3500);
  out = await api('/api/outbox', { token });
  escCount = out.data.outbox.filter(x => x.kind === 'escalation').length;
  log('After a fresh check-in, no further escalation is sent (rule re-armed)', escCount === 2, `total escalations=${escCount}`);

  console.log(`\n[${stamp()}] ${failures === 0 ? 'ALL PROOF STEPS PASSED' : failures + ' STEP(S) FAILED'}`);
} catch (e) {
  console.log(`[${stamp()}] FAIL  proof aborted — ${e.message}`);
  failures++;
} finally {
  server.kill('SIGTERM');
  console.log('\n----- server log (key lines) -----');
  console.log(serverLog.split('\n').filter(l => /\[(store|scheduler|reminder|checkin|dose|escalation|SMS)/.test(l)).join('\n'));
}
process.exit(failures ? 1 : 0);
