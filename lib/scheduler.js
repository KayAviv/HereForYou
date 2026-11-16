'use strict';
/*
 * Reminder + check-in + silence-escalation engine.
 *
 * Ticks every SCHEDULER_TICK_MS (default 30s). On each tick, for each user:
 *  1. Medication doses: for every medication time that has arrived today
 *     (in the user's own timezone) and has no dose record yet, create a dose
 *     with status "due" and reminderFiredAt = now — that IS the reminder
 *     firing: the client polls /api/today and presents it as a big,
 *     unmissable card (with sound/speech where the browser allows).
 *     Doses still untaken after DOSE_MISSED_AFTER_MIN (default 120) become
 *     "missed" (they stay visible and can still be marked taken).
 *  2. Silence rule: if now - lastActivityAt exceeds the user's CHOSEN
 *     silence window (4/12/24/48 hours, default 24) and no escalation has
 *     been sent since that activity, text every family
 *     contact (SMS adapter — real Twilio if configured, outbox-logged if
 *     not) and stamp lastEscalationAt. Any new activity (check-in, chat,
 *     dose taken, any signed-in use) re-arms the rule.
 */
const { sendSms } = require('./sms');

/* The silence window is a per-user CHOICE (Kay's spec): 4, 12, 24 or 48
 * hours without a check-in/response, then the family text fires.
 * Default 24h. SILENCE_HOURS env may set the default for new accounts
 * when it is one of the allowed values. */
const ALLOWED_SILENCE_HOURS = [4, 12, 24, 48];
function defaultSilenceHours() {
  const v = Number(process.env.SILENCE_HOURS || '24');
  return ALLOWED_SILENCE_HOURS.includes(v) ? v : 24;
}
function silenceHoursFor(user) {
  const h = Number(user && user.silenceHours);
  return ALLOWED_SILENCE_HOURS.includes(h) ? h : defaultSilenceHours();
}
const silenceMsFor = (user) => silenceHoursFor(user) * 3600 * 1000;
const missedAfterMs = () => Math.round(parseFloat(process.env.DOSE_MISSED_AFTER_MIN || '120') * 60 * 1000);

/* Local-time helpers. tzOffsetMin = minutes to ADD to UTC to get local time
 * (e.g. UTC-7 -> -420). The client reports it at register/login. */
function localDayStartUtcMs(nowUtcMs, tzOffsetMin) {
  const shifted = nowUtcMs + tzOffsetMin * 60000;
  const dayStartShifted = Math.floor(shifted / 86400000) * 86400000;
  return dayStartShifted - tzOffsetMin * 60000;
}
function localDateStr(nowUtcMs, tzOffsetMin) {
  return new Date(nowUtcMs + tzOffsetMin * 60000).toISOString().slice(0, 10);
}
function scheduledForToday(timeHHMM, nowUtcMs, tzOffsetMin) {
  const [h, m] = timeHHMM.split(':').map(Number);
  return localDayStartUtcMs(nowUtcMs, tzOffsetMin) + (h * 60 + m) * 60000;
}

async function tickUser(store, user, now) {
  const tz = user.tzOffsetMin || 0;
  const meds = await store.listMedications(user.id);

  /* 1 — medication reminders */
  for (const med of meds) {
    for (const t of med.times || []) {
      const sched = scheduledForToday(t, now, tz);
      if (sched > now) continue; // not yet today
      if (sched < now - 24 * 3600 * 1000) continue; // stale
      let dose = await store.findDose(user.id, med.id, sched);
      if (!dose) {
        dose = await store.addDose({
          userId: user.id, medId: med.id, medName: med.name, doseText: med.dose || '',
          scheduledFor: sched, status: 'due', reminderFiredAt: now, takenAt: null,
        });
        console.log(`[reminder] FIRED user=${user.email} med="${med.name}" scheduled=${new Date(sched).toISOString()} at=${new Date(now).toISOString()}`);
      }
      if (dose.status === 'due' && now - dose.scheduledFor > missedAfterMs()) {
        await store.updateDose(dose.id, { status: 'missed' });
        console.log(`[reminder] MISSED user=${user.email} med="${med.name}" scheduled=${new Date(dose.scheduledFor).toISOString()}`);
      }
    }
  }

  /* 2 — silence escalation (window = the user's chosen setting) */
  const lastActivity = user.lastActivityAt || user.createdAt || now;
  const lastEscalation = user.lastEscalationAt || 0;
  if (now - lastActivity > silenceMsFor(user) && lastEscalation < lastActivity) {
    const contacts = (await store.listContacts(user.id)).filter(c => c.phone);
    const hours = Math.round((now - lastActivity) / 3600000);
    const body =
      `HereForYou check-up: ${user.name} hasn't checked in or used the app for about ${hours} hours. ` +
      'This is the gentle alert they asked us to send — please give them a call or pop by to make sure everything is OK.';
    if (!contacts.length) {
      await store.addOutbox({ userId: user.id, to: '', body, kind: 'escalation', status: 'logged-no-contact', providerSid: null, error: null });
      console.log(`[escalation] user=${user.email} has NO family contact with a phone — alert could not be sent`);
    } else {
      for (const c of contacts) {
        await sendSms(store, { userId: user.id, to: c.phone, body, kind: 'escalation' });
      }
      console.log(`[escalation] SENT user=${user.email} contacts=${contacts.length} silenceHours=${hours}`);
    }
    await store.updateUser(user.id, { lastEscalationAt: now });
  }
}

function startScheduler(store) {
  const tickMs = parseInt(process.env.SCHEDULER_TICK_MS || '30000', 10);
  const run = async () => {
    try {
      const now = Date.now();
      const users = await store.listUsers();
      for (const u of users) await tickUser(store, u, now);
    } catch (e) {
      console.error('[scheduler] tick error:', e.message);
    }
  };
  const timer = setInterval(run, tickMs);
  console.log(`[scheduler] ticking every ${tickMs}ms; silence window is per-user (choices ${ALLOWED_SILENCE_HOURS.join('/')}h, default ${defaultSilenceHours()}h)`);
  run(); // immediate first tick
  return timer;
}

module.exports = { startScheduler, tickUser, localDayStartUtcMs, localDateStr, scheduledForToday, ALLOWED_SILENCE_HOURS, defaultSilenceHours, silenceHoursFor };
