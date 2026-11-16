'use strict';
/*
 * HereForYou — server entry point.
 * Warm AI companion for older people: medication reminders, daily "I'm OK"
 * check-ins, doctor notes & appointments, and a family safety net that texts
 * a family member if the person goes quiet for their chosen window
 * (4 / 12 / 24 / 48 hours, default 24).
 */
const path = require('path');
const crypto = require('crypto');
const express = require('express');
const { createStore } = require('./lib/store');
const { startScheduler, localDateStr, ALLOWED_SILENCE_HOURS, defaultSilenceHours, silenceHoursFor } = require('./lib/scheduler');
const { chatReply } = require('./lib/chat');
const { smsConfigured } = require('./lib/sms');

const PORT = parseInt(process.env.PORT || '3000', 10);
const SESSION_DAYS = 30;

/* ---------------- password hashing (scrypt, no extra deps) ---------------- */
function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}
function verifyPassword(password, stored) {
  try {
    const [salt, hash] = stored.split(':');
    const test = crypto.scryptSync(password, salt, 64);
    return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), test);
  } catch { return false; }
}
const newToken = () => crypto.randomBytes(32).toString('hex');
const newFamilyCode = () => crypto.randomBytes(6).toString('hex'); // 12 hex chars

async function main() {
  const store = await createStore();
  const app = express();
  app.use(express.json({ limit: '256kb' }));
  app.use('/icons', express.static(path.join(__dirname, 'icons')));
  app.use(express.static(path.join(__dirname, 'public')));

  /* Optional demo account (only when explicitly seeded). */
  if (process.env.SEED_DEMO === '1' && !(await store.getUserByEmail('demo@user.com'))) {
    await store.createUser({
      email: 'demo@user.com', name: 'Demo User', passwordHash: hashPassword('demo'),
      familyCode: newFamilyCode(), tzOffsetMin: 0, silenceHours: defaultSilenceHours(), lastActivityAt: Date.now(), lastEscalationAt: 0,
    });
    console.log('[seed] demo user demo@user.com / demo created (SEED_DEMO=1)');
  }

  /* ---------------- auth ---------------- */
  async function auth(req, res, next) {
    const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    if (!token) return res.status(401).json({ error: 'Please sign in' });
    const session = await store.getSession(token);
    if (!session || session.expiresAt < Date.now()) return res.status(401).json({ error: 'Session expired — please sign in again' });
    const user = await store.getUserById(session.userId);
    if (!user) return res.status(401).json({ error: 'User not found' });
    req.user = user;
    req.token = token;
    /* Deliberate actions (POST/DELETE: check-in, chat, dose taken, edits)
     * count as activity and re-arm the silence rule. Passive reads (GET —
     * e.g. the home screen auto-refreshing) do NOT: an app left open on a
     * tablet must never defeat the family safety net. */
    if (req.method !== 'GET' && Date.now() - (user.lastActivityAt || 0) > 60000) {
      await store.updateUser(user.id, { lastActivityAt: Date.now() });
      req.user.lastActivityAt = Date.now();
    }
    next();
  }
  const publicUser = (u) => ({ id: u.id, email: u.email, name: u.name, familyCode: u.familyCode, silenceHours: silenceHoursFor(u) });

  /* ---------------- settings: the silence-window choice ---------------- */
  function validateSilenceHours(v) {
    const h = Number(v);
    return ALLOWED_SILENCE_HOURS.includes(h) ? h : null;
  }
  app.patch('/api/settings', auth, async (req, res) => {
    const h = validateSilenceHours((req.body || {}).silenceHours);
    if (h === null) return res.status(400).json({ error: `Safety check timing must be one of: ${ALLOWED_SILENCE_HOURS.join(', ')} hours` });
    const user = await store.updateUser(req.user.id, { silenceHours: h });
    console.log(`[settings] user=${req.user.email} silenceHours=${h}`);
    res.json({ user: publicUser(user) });
  });

  app.post('/api/register', async (req, res) => {
    const { email, password, name, tzOffsetMin } = req.body || {};
    if (!email || !password || !name) return res.status(400).json({ error: 'Name, email and password are all required' });
    if (String(password).length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });
    const cleanEmail = String(email).trim().toLowerCase();
    if (await store.getUserByEmail(cleanEmail)) return res.status(409).json({ error: 'That email already has an account — try signing in' });
    const user = await store.createUser({
      email: cleanEmail, name: String(name).trim(), passwordHash: hashPassword(String(password)),
      familyCode: newFamilyCode(), tzOffsetMin: Number(tzOffsetMin) || 0,
      silenceHours: defaultSilenceHours(),
      lastActivityAt: Date.now(), lastEscalationAt: 0,
    });
    const token = newToken();
    await store.createSession({ token, userId: user.id, expiresAt: Date.now() + SESSION_DAYS * 86400000 });
    res.json({ token, user: publicUser(user) });
  });

  app.post('/api/login', async (req, res) => {
    const { email, password, tzOffsetMin } = req.body || {};
    const user = await store.getUserByEmail(String(email || '').trim().toLowerCase());
    if (!user || !verifyPassword(String(password || ''), user.passwordHash)) {
      return res.status(401).json({ error: 'Email or password not recognised' });
    }
    await store.updateUser(user.id, { lastActivityAt: Date.now(), tzOffsetMin: Number.isFinite(Number(tzOffsetMin)) ? Number(tzOffsetMin) : user.tzOffsetMin });
    const token = newToken();
    await store.createSession({ token, userId: user.id, expiresAt: Date.now() + SESSION_DAYS * 86400000 });
    res.json({ token, user: publicUser(user) });
  });

  app.post('/api/logout', auth, async (req, res) => {
    await store.deleteSession(req.token);
    res.json({ ok: true });
  });

  app.get('/api/me', auth, (req, res) => res.json({ user: publicUser(req.user) }));

  /* ---------------- home / today ---------------- */
  async function todayPayload(storeRef, user) {
    const tz = user.tzOffsetMin || 0;
    const now = Date.now();
    const todayStr = localDateStr(now, tz);
    const tomorrowStr = localDateStr(now + 86400000, tz);
    const [doses, checkins, notes, meds] = await Promise.all([
      storeRef.listDoses(user.id), storeRef.listCheckins(user.id), storeRef.listNotes(user.id), storeRef.listMedications(user.id),
    ]);
    const dayStart = new Date(todayStr + 'T00:00:00Z').getTime() - tz * 60000;
    const todaysDoses = doses
      .filter(d => d.scheduledFor >= dayStart && d.scheduledFor < dayStart + 86400000)
      .sort((a, b) => a.scheduledFor - b.scheduledFor)
      .map(d => ({ ...d, time: new Date(d.scheduledFor + tz * 60000).toISOString().slice(11, 16) }));
    const myCheckins = checkins.sort((a, b) => b.at - a.at);
    const lastCheckin = myCheckins[0] || null;
    const upcoming = notes
      .filter(n => n.kind === 'appointment' && n.date >= todayStr)
      .sort((a, b) => (a.date + (a.time || '')).localeCompare(b.date + (b.time || '')));
    return {
      date: todayStr,
      silenceHours: silenceHoursFor(user),
      checkedInToday: !!lastCheckin && localDateStr(lastCheckin.at, tz) === todayStr,
      lastCheckinAt: lastCheckin ? lastCheckin.at : null,
      lastActivityAt: user.lastActivityAt || null,
      dueDoses: todaysDoses.filter(d => d.status === 'due' || d.status === 'missed'),
      todaysDoses,
      medications: meds,
      appointmentsToday: upcoming.filter(n => n.date === todayStr),
      appointmentsTomorrow: upcoming.filter(n => n.date === tomorrowStr),
      nextAppointment: upcoming[0] || null,
    };
  }

  app.get('/api/today', auth, async (req, res) => res.json(await todayPayload(store, req.user)));

  app.post('/api/checkin', auth, async (req, res) => {
    const at = Date.now();
    await store.addCheckin({ userId: req.user.id, at });
    await store.updateUser(req.user.id, { lastActivityAt: at });
    console.log(`[checkin] user=${req.user.email} at=${new Date(at).toISOString()}`);
    res.json({ ok: true, at, payload: await todayPayload(store, { ...req.user, lastActivityAt: at }) });
  });

  /* ---------------- medications & doses ---------------- */
  app.get('/api/medications', auth, async (req, res) => res.json({ medications: await store.listMedications(req.user.id) }));
  app.post('/api/medications', auth, async (req, res) => {
    const { name, dose, times } = req.body || {};
    if (!name || !Array.isArray(times) || !times.length || !times.every(t => /^\d{2}:\d{2}$/.test(t))) {
      return res.status(400).json({ error: 'A medicine needs a name and at least one time like 08:00' });
    }
    const med = await store.addMedication({ userId: req.user.id, name: String(name).trim(), dose: String(dose || '').trim(), times });
    res.json({ medication: med });
  });
  app.delete('/api/medications/:id', auth, async (req, res) => {
    await store.deleteMedication(req.user.id, req.params.id);
    res.json({ ok: true });
  });
  app.post('/api/doses/:id/taken', auth, async (req, res) => {
    const dose = (await store.listDoses(req.user.id)).find(d => d.id === req.params.id);
    if (!dose) return res.status(404).json({ error: 'Dose not found' });
    const updated = await store.updateDose(dose.id, { status: 'taken', takenAt: Date.now() });
    await store.updateUser(req.user.id, { lastActivityAt: Date.now() });
    console.log(`[dose] TAKEN user=${req.user.email} med="${dose.medName}" at=${new Date().toISOString()}`);
    res.json({ dose: updated });
  });

  /* ---------------- contacts ---------------- */
  app.get('/api/contacts', auth, async (req, res) => res.json({ contacts: await store.listContacts(req.user.id) }));
  app.post('/api/contacts', auth, async (req, res) => {
    const { name, phone, relation } = req.body || {};
    if (!name) return res.status(400).json({ error: 'A contact needs a name' });
    const contact = await store.addContact({ userId: req.user.id, name: String(name).trim(), phone: String(phone || '').trim(), relation: String(relation || '').trim() });
    res.json({ contact });
  });
  app.delete('/api/contacts/:id', auth, async (req, res) => {
    await store.deleteContact(req.user.id, req.params.id);
    res.json({ ok: true });
  });

  /* ---------------- notes & appointments ---------------- */
  app.get('/api/notes', auth, async (req, res) => {
    const notes = (await store.listNotes(req.user.id)).sort((a, b) => (a.date || '').localeCompare(b.date || ''));
    res.json({ notes });
  });
  app.post('/api/notes', auth, async (req, res) => {
    const { kind, title, body, date, time } = req.body || {};
    if (!title || !date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({ error: 'A note needs a title and a date (YYYY-MM-DD)' });
    }
    const note = await store.addNote({
      userId: req.user.id, kind: kind === 'appointment' ? 'appointment' : 'doctor',
      title: String(title).trim(), body: String(body || '').trim(), date, time: String(time || '').trim(),
    });
    res.json({ note });
  });
  app.delete('/api/notes/:id', auth, async (req, res) => {
    await store.deleteNote(req.user.id, req.params.id);
    res.json({ ok: true });
  });

  /* ---------------- chat ---------------- */
  app.post('/api/chat', auth, async (req, res) => {
    const { message, history } = req.body || {};
    if (!message) return res.status(400).json({ error: 'Message required' });
    const reply = await chatReply(store, req.user, String(message), history);
    res.json({ reply });
  });

  /* ---------------- outbox (transparency: texts sent / would-be sent) ---------------- */
  app.get('/api/outbox', auth, async (req, res) => {
    const outbox = (await store.listOutbox(req.user.id)).sort((a, b) => b.createdAt - a.createdAt);
    res.json({ outbox, smsConfigured: smsConfigured() });
  });

  /* ---------------- family view (read-only, by secret code) ---------------- */
  app.get('/api/family/:code', async (req, res) => {
    const user = await store.getUserByFamilyCode(req.params.code);
    if (!user) return res.status(404).json({ error: 'This family link is not recognised' });
    const payload = await todayPayload(store, user);
    const silenceHours = Math.round((Date.now() - (user.lastActivityAt || user.createdAt)) / 360000) / 10;
    res.json({
      elder: { name: user.name },
      lastCheckinAt: payload.lastCheckinAt,
      checkedInToday: payload.checkedInToday,
      lastActivityAt: user.lastActivityAt || null,
      hoursSinceActivity: silenceHours,
      silenceHours: silenceHoursFor(user),
      silenceChoices: ALLOWED_SILENCE_HOURS,
      todaysMedications: payload.todaysDoses.map(d => ({ name: d.medName, dose: d.doseText, time: d.time, status: d.status })),
      appointmentsToday: payload.appointmentsToday,
      nextAppointment: payload.nextAppointment,
    });
  });

  /* Family may adjust ONLY the safety-check timing, via the secret code. */
  app.post('/api/family/:code/settings', async (req, res) => {
    const user = await store.getUserByFamilyCode(req.params.code);
    if (!user) return res.status(404).json({ error: 'This family link is not recognised' });
    const h = validateSilenceHours((req.body || {}).silenceHours);
    if (h === null) return res.status(400).json({ error: `Safety check timing must be one of: ${ALLOWED_SILENCE_HOURS.join(', ')} hours` });
    await store.updateUser(user.id, { silenceHours: h });
    console.log(`[settings] family link changed silenceHours for user=${user.email} to ${h}`);
    res.json({ ok: true, silenceHours: h });
  });

  /* ---------------- test-only helpers (env-gated) ---------------- */
  if (process.env.ALLOW_TEST_ENDPOINTS === '1') {
    app.post('/api/test/backdate', auth, async (req, res) => {
      const hours = Number((req.body || {}).hours || 49);
      const at = Date.now() - hours * 3600000;
      await store.updateUser(req.user.id, { lastActivityAt: at, lastEscalationAt: 0 });
      console.log(`[test] backdated activity for ${req.user.email} by ${hours}h`);
      res.json({ ok: true, lastActivityAt: at });
    });
  }

  app.get('/health', (req, res) => res.json({ ok: true, store: store.kind, sms: smsConfigured() ? 'twilio' : 'outbox-log', ai: process.env.OPENAI_API_KEY ? 'openai' : 'builtin' }));

  startScheduler(store);
  app.listen(PORT, () => console.log(`HereForYou listening on port ${PORT}`));
}

main().catch(e => { console.error('Fatal:', e); process.exit(1); });
