'use strict';
/* HereForYou client — deliberately simple: one screen at a time, huge
 * buttons, plain language. Talks to the /api on the same origin. */
const $ = (id) => document.getElementById(id);
let token = localStorage.getItem('hfy_token') || '';
let me = null;
let authMode = 'register'; // or 'login'
let chatHistory = [];
let announcedDoses = new Set();

const tzOffsetMin = () => -new Date().getTimezoneOffset();

async function api(path, opts = {}) {
  const res = await fetch(path, {
    ...opts,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}), ...(opts.headers || {}) },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Something went wrong');
  return data;
}

/* ---------------- navigation ---------------- */
function showScreen(name) {
  for (const s of ['home', 'chat', 'meds', 'notes', 'family']) {
    $('screen-' + s).classList.toggle('hidden', s !== name);
  }
  if (name === 'home') refreshHome();
  if (name === 'meds') refreshMeds();
  if (name === 'notes') refreshNotes();
  if (name === 'family') refreshFamily();
  window.scrollTo(0, 0);
}
document.querySelectorAll('[data-nav]').forEach(b => b.addEventListener('click', () => showScreen(b.dataset.nav)));

/* ---------------- auth ---------------- */
function setAuthMode(mode) {
  authMode = mode;
  $('label-name').style.display = mode === 'register' ? '' : 'none';
  $('auth-name').style.display = mode === 'register' ? '' : 'none';
  $('btn-auth').textContent = mode === 'register' ? 'Create my account' : 'Sign in';
  $('btn-auth-toggle').textContent = mode === 'register' ? 'I already have an account — sign in' : 'New here? Create an account';
  $('auth-error').textContent = '';
}
$('btn-auth-toggle').addEventListener('click', () => setAuthMode(authMode === 'register' ? 'login' : 'register'));
$('btn-auth').addEventListener('click', async () => {
  $('auth-error').textContent = '';
  try {
    const body = { email: $('auth-email').value, password: $('auth-password').value, tzOffsetMin: tzOffsetMin() };
    if (authMode === 'register') body.name = $('auth-name').value;
    const data = await api(authMode === 'register' ? '/api/register' : '/api/login', { method: 'POST', body: JSON.stringify(body) });
    token = data.token; me = data.user;
    localStorage.setItem('hfy_token', token);
    enterApp();
  } catch (e) { $('auth-error').textContent = e.message; }
});
$('btn-logout').addEventListener('click', async () => {
  try { await api('/api/logout', { method: 'POST' }); } catch {}
  token = ''; me = null; localStorage.removeItem('hfy_token');
  $('app').classList.add('hidden'); $('screen-auth').classList.remove('hidden');
});

function enterApp() {
  $('screen-auth').classList.add('hidden');
  $('app').classList.remove('hidden');
  showScreen('home');
  /* Ask for notification permission so reminders can pop up. */
  if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission().catch(() => {});
}

/* ---------------- home ---------------- */
function fmtTime(iso) { return iso; }
async function refreshHome() {
  if (!me) return;
  const hour = new Date().getHours();
  const part = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  $('greeting').textContent = `${part}, ${me.name.split(' ')[0]}!`;
  let t;
  try { t = await api('/api/today'); } catch { return; }

  const btn = $('btn-checkin');
  if (t.checkedInToday) {
    btn.textContent = "✓ You've checked in today";
    btn.classList.add('done');
    $('checkin-status').textContent = 'Wonderful — your family can relax. Tap again any time.';
  } else {
    btn.textContent = "✓ I'm OK";
    btn.classList.remove('done');
    $('checkin-status').textContent = 'Tap the big green button once a day so your family knows you are OK.';
  }

  const appt = $('appt-banner');
  if (t.appointmentsToday && t.appointmentsToday.length) {
    const a = t.appointmentsToday[0];
    appt.textContent = `📅 Today: ${a.title}${a.time ? ' at ' + a.time : ''}`;
    appt.classList.remove('hidden');
  } else if (t.nextAppointment) {
    appt.textContent = `📅 Coming up: ${t.nextAppointment.title} on ${t.nextAppointment.date}${t.nextAppointment.time ? ' at ' + t.nextAppointment.time : ''}`;
    appt.classList.remove('hidden');
  } else appt.classList.add('hidden');

  const due = $('due-banner');
  const dueNow = (t.dueDoses || []).filter(d => d.status === 'due');
  if (dueNow.length) {
    due.textContent = `💊 It's time for your ${dueNow.map(d => d.medName).join(' and ')}.`;
    due.classList.remove('hidden');
    for (const d of dueNow) {
      if (!announcedDoses.has(d.id)) {
        announcedDoses.add(d.id);
        if ('Notification' in window && Notification.permission === 'granted') {
          new Notification('HereForYou — medicine time', { body: `Time for your ${d.medName}${d.doseText ? ' (' + d.doseText + ')' : ''}` });
        }
        if ($('chk-speak') && $('chk-speak').checked) speak(`It's time for your ${d.medName}.`);
      }
    }
  } else due.classList.add('hidden');

  const box = $('today-meds');
  box.innerHTML = '';
  if (!t.todaysDoses.length) {
    box.innerHTML = '<p class="empty-note">No medicines scheduled for today. You can add them under "My medicines".</p>';
    return;
  }
  for (const d of t.todaysDoses) {
    const card = document.createElement('div');
    card.className = 'med-card ' + d.status;
    const pill = d.status === 'taken' ? '<span class="pill pill-taken">Taken ✓</span>'
      : d.status === 'missed' ? '<span class="pill pill-missed">Not taken yet</span>'
      : d.status === 'due' ? '<span class="pill pill-due">Time to take it</span>'
      : '<span class="pill pill-later">Later today</span>';
    card.innerHTML = `<div class="med-name">${escapeHtml(d.medName)}</div>
      <div class="med-meta">${escapeHtml(d.doseText || '')} · at ${fmtTime(d.time)}</div><div>${pill}</div>`;
    if (d.status === 'due' || d.status === 'missed') {
      const b = document.createElement('button');
      b.className = 'btn btn-taken';
      b.textContent = '✓ I took it';
      b.addEventListener('click', async () => { await api(`/api/doses/${d.id}/taken`, { method: 'POST' }); refreshHome(); });
      card.appendChild(b);
    }
    box.appendChild(card);
  }
}
$('btn-checkin').addEventListener('click', async () => {
  await api('/api/checkin', { method: 'POST' });
  refreshHome();
});

/* ---------------- meds ---------------- */
async function refreshMeds() {
  const { medications } = await api('/api/medications');
  const box = $('med-list'); box.innerHTML = '';
  if (!medications.length) box.innerHTML = '<p class="empty-note">No medicines yet — add your first one below.</p>';
  for (const m of medications) {
    const row = document.createElement('div'); row.className = 'row-item';
    row.innerHTML = `<div><div class="row-main">💊 ${escapeHtml(m.name)}</div><div class="row-sub">${escapeHtml(m.dose || '')} · at ${m.times.join(' and ')}</div></div>`;
    const del = document.createElement('button'); del.className = 'btn btn-delete'; del.textContent = 'Remove';
    del.addEventListener('click', async () => { await api(`/api/medications/${m.id}`, { method: 'DELETE' }); refreshMeds(); });
    row.appendChild(del); box.appendChild(row);
  }
}
$('btn-med-add').addEventListener('click', async () => {
  $('med-error').textContent = '';
  const times = $('med-times').value.split(',').map(s => s.trim()).filter(Boolean);
  try {
    await api('/api/medications', { method: 'POST', body: JSON.stringify({ name: $('med-name').value, dose: $('med-dose').value, times }) });
    $('med-name').value = ''; $('med-dose').value = ''; $('med-times').value = '';
    refreshMeds();
  } catch (e) { $('med-error').textContent = e.message; }
});

/* ---------------- notes ---------------- */
async function refreshNotes() {
  const { notes } = await api('/api/notes');
  const box = $('note-list'); box.innerHTML = '';
  if (!notes.length) box.innerHTML = '<p class="empty-note">Nothing saved yet. Doctor notes and appointments you add will appear here.</p>';
  for (const n of notes) {
    const row = document.createElement('div'); row.className = 'row-item';
    row.innerHTML = `<div><div class="row-main">${n.kind === 'appointment' ? '📅' : '🩺'} ${escapeHtml(n.title)}</div>
      <div class="row-sub">${n.date}${n.time ? ' at ' + n.time : ''}${n.body ? ' — ' + escapeHtml(n.body) : ''}</div></div>`;
    const del = document.createElement('button'); del.className = 'btn btn-delete'; del.textContent = 'Remove';
    del.addEventListener('click', async () => { await api(`/api/notes/${n.id}`, { method: 'DELETE' }); refreshNotes(); });
    row.appendChild(del); box.appendChild(row);
  }
}
$('btn-note-add').addEventListener('click', async () => {
  $('note-error').textContent = '';
  try {
    await api('/api/notes', { method: 'POST', body: JSON.stringify({
      kind: $('note-kind').value, title: $('note-title').value, date: $('note-date').value,
      time: $('note-time').value, body: $('note-body').value }) });
    $('note-title').value = ''; $('note-body').value = '';
    refreshNotes();
  } catch (e) { $('note-error').textContent = e.message; }
});

/* ---------------- family ---------------- */
function paintSilenceChoices() {
  const current = me && me.silenceHours ? me.silenceHours : 24;
  document.querySelectorAll('#silence-choices .btn-choice').forEach(b => {
    b.classList.toggle('selected', Number(b.dataset.silence) === Number(current));
  });
  $('silence-explain').textContent = current + ' hours';
  $('silence-status').textContent = `Right now: we text your family after ${current} hours without a check-in.`;
}
document.querySelectorAll('#silence-choices .btn-choice').forEach(b => b.addEventListener('click', async () => {
  try {
    const data = await api('/api/settings', { method: 'PATCH', body: JSON.stringify({ silenceHours: Number(b.dataset.silence) }) });
    me.silenceHours = data.user.silenceHours;
    paintSilenceChoices();
  } catch (e) { $('silence-status').textContent = e.message; }
}));
async function refreshFamily() {
  try { const data = await api('/api/me'); me = data.user; } catch {}
  paintSilenceChoices();
  const { contacts } = await api('/api/contacts');
  const box = $('contact-list'); box.innerHTML = '';
  if (!contacts.length) box.innerHTML = '<p class="empty-note">No contacts yet — add a family member below so we can reach them if you go quiet.</p>';
  for (const c of contacts) {
    const row = document.createElement('div'); row.className = 'row-item';
    row.innerHTML = `<div><div class="row-main">👤 ${escapeHtml(c.name)}${c.relation ? ' (' + escapeHtml(c.relation) + ')' : ''}</div><div class="row-sub">${escapeHtml(c.phone || 'No phone saved')}</div></div>`;
    const del = document.createElement('button'); del.className = 'btn btn-delete'; del.textContent = 'Remove';
    del.addEventListener('click', async () => { await api(`/api/contacts/${c.id}`, { method: 'DELETE' }); refreshFamily(); });
    row.appendChild(del); box.appendChild(row);
  }
  if (me) $('family-link').textContent = `${location.origin}/family.html?code=${me.familyCode}`;
}
$('btn-contact-add').addEventListener('click', async () => {
  $('contact-error').textContent = '';
  try {
    await api('/api/contacts', { method: 'POST', body: JSON.stringify({
      name: $('contact-name').value, relation: $('contact-relation').value, phone: $('contact-phone').value }) });
    $('contact-name').value = ''; $('contact-relation').value = ''; $('contact-phone').value = '';
    refreshFamily();
  } catch (e) { $('contact-error').textContent = e.message; }
});

/* ---------------- chat ---------------- */
function addMsg(text, who) {
  const div = document.createElement('div');
  div.className = 'msg ' + who; div.textContent = text;
  $('chat-box').appendChild(div);
  div.scrollIntoView({ behavior: 'smooth' });
}
function speak(text) {
  try { const u = new SpeechSynthesisUtterance(text); u.rate = 0.95; speechSynthesis.speak(u); } catch {}
}
async function sendChat() {
  const text = $('chat-text').value.trim();
  if (!text) return;
  $('chat-text').value = '';
  addMsg(text, 'user');
  try {
    const { reply } = await api('/api/chat', { method: 'POST', body: JSON.stringify({ message: text, history: chatHistory }) });
    chatHistory.push({ role: 'user', content: text }, { role: 'assistant', content: reply });
    addMsg(reply, 'bot');
    if ($('chk-speak').checked) speak(reply);
  } catch (e) { addMsg('Sorry — I had a little trouble just then. Please try again.', 'bot'); }
}
$('btn-send').addEventListener('click', sendChat);
$('chat-text').addEventListener('keydown', (e) => { if (e.key === 'Enter') sendChat(); });

/* Voice input where the browser allows it. */
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
if (SR) {
  const rec = new SR();
  rec.lang = 'en-US';
  rec.addEventListener('result', (e) => { $('chat-text').value = e.results[0][0].transcript; sendChat(); });
  rec.addEventListener('end', () => $('btn-mic').classList.remove('recording'));
  $('btn-mic').addEventListener('click', () => { $('btn-mic').classList.add('recording'); try { rec.start(); } catch {} });
} else {
  $('btn-mic').style.display = 'none';
}

/* ---------------- helpers & boot ---------------- */
function escapeHtml(s) {
  return String(s || '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
setInterval(() => { if (me && !$('screen-home').classList.contains('hidden')) refreshHome(); }, 30000);
(async () => {
  if (token) {
    try { const data = await api('/api/me'); me = data.user; enterApp(); return; } catch { token = ''; localStorage.removeItem('hfy_token'); }
  }
  setAuthMode('register');
})();
