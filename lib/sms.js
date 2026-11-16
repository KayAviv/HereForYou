'use strict';
/*
 * SMS adapter (Twilio-shaped, env-gated).
 *
 * Configured  (TWILIO_ACCOUNT_SID + TWILIO_AUTH_TOKEN + TWILIO_FROM_NUMBER):
 *   sends through the Twilio REST API and records provider status.
 * Not configured:
 *   does NOT send — it logs the would-be text and records it in the outbox
 *   with status "logged", so the whole escalation flow is provable at $0.
 * Credentials are never invented; missing env simply means "log mode".
 */
function smsConfigured() {
  return !!(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_FROM_NUMBER);
}

async function sendSms(store, { userId, to, body, kind }) {
  let status = 'logged';
  let providerSid = null;
  let error = null;

  if (!to) {
    status = 'logged-no-contact';
  } else if (smsConfigured()) {
    try {
      const sid = process.env.TWILIO_ACCOUNT_SID;
      const url = `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`;
      const form = new URLSearchParams({ To: to, From: process.env.TWILIO_FROM_NUMBER, Body: body });
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: 'Basic ' + Buffer.from(`${sid}:${process.env.TWILIO_AUTH_TOKEN}`).toString('base64'),
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: form.toString(),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        status = 'sent';
        providerSid = data.sid || null;
      } else {
        status = 'failed';
        error = data.message || `Twilio HTTP ${res.status}`;
      }
    } catch (e) {
      status = 'failed';
      error = e.message;
    }
  }

  const entry = await store.addOutbox({ userId, to: to || '', body, kind, status, providerSid, error });
  if (status === 'logged' || status === 'logged-no-contact') {
    console.log(`[SMS-OUTBOX:${kind}] to=${to || '(no contact)'} :: ${body}`);
  } else {
    console.log(`[SMS:${kind}] to=${to} status=${status}${providerSid ? ' sid=' + providerSid : ''}${error ? ' error=' + error : ''}`);
  }
  return entry;
}

module.exports = { sendSms, smsConfigured };
