'use strict';
/*
 * AI companion chat.
 *
 * With OPENAI_API_KEY set: talks to OpenAI chat completions (model from
 * OPENAI_MODEL, default gpt-4o-mini) with a safety-bounded system prompt.
 * Without it: a warm built-in companion that answers from the user's own
 * recorded data (medications, contacts, appointments) and uses kind canned
 * responses otherwise. Fully functional and provable at $0.
 *
 * SAFETY RULE (both paths): the companion may remind, encourage, and share
 * the user's own recorded information. It must NEVER give medical advice —
 * no dosage changes, no diagnosis, no "you can skip it". Anything medical
 * is redirected to their doctor or family.
 */
const SAFETY_LINE =
  "I'm not able to give medical advice — that's a question for your doctor or your family. " +
  'I can remind you about your medicines and help you reach your family. Would you like me to show your contacts?';

function systemPrompt(user, meds, contacts, upcoming) {
  return [
    'You are HereForYou, a warm, patient, empathetic companion for an older person.',
    'Speak clearly, kindly and concisely in English. Short sentences. Large-print friendly: no walls of text.',
    '',
    "The user's own recorded information:",
    `- Name: ${user.name}`,
    `- Medications: ${meds.length ? meds.map(m => `${m.name}${m.dose ? ' (' + m.dose + ')' : ''} at ${m.times.join(', ')}`).join('; ') : 'none recorded'}`,
    `- Family & contacts: ${contacts.length ? contacts.map(c => `${c.name}${c.relation ? ' (' + c.relation + ')' : ''} ${c.phone || ''}`).join('; ') : 'none recorded'}`,
    `- Upcoming appointments: ${upcoming.length ? upcoming.map(n => `${n.title} on ${n.date}${n.time ? ' at ' + n.time : ''}`).join('; ') : 'none recorded'}`,
    '',
    'STRICT RULES:',
    '- You may remind them about their medications and appointments, and tell them their recorded contacts.',
    '- NEVER give medical advice: no dosage changes, no diagnosis, no suggesting they skip or double a medicine.',
    '- If they mention pain, illness, a fall, or feeling unwell, be caring and encourage them to contact their family or doctor, or emergency services if it sounds urgent.',
    '- Never invent medications, contacts, or appointments that are not in the recorded information above.',
  ].join('\n');
}

const CANNED = [
  "It's lovely to hear from you. I'm right here — we can talk about your day, your medicines, or anything on your mind.",
  "I'm glad you're here. Would you like to hear what medicines are coming up, or shall we just chat for a while?",
  "That sounds nice. Tell me a little more — I'm listening.",
  "I'm here with you. If you'd like, I can tell you about your next appointment or your medicines for today.",
];

function fallbackReply(message, ctx, markDoseTaken) {
  const m = (message || '').toLowerCase();
  const { user, meds, contacts, upcoming, dueDoses } = ctx;

  if (/\b(should i|can i|double|skip|extra pill|stop taking|change my dose)\b/.test(m) && /(pill|medicine|medication|dose|tablet)/.test(m)) {
    return SAFETY_LINE;
  }
  if (/(chest pain|can't breathe|cannot breathe|i fell|fallen|bleeding|emergency|help me)/.test(m)) {
    const c = contacts[0];
    return `That sounds serious. Please call emergency services (911) right away${c ? `, or call ${c.name}${c.phone ? ' at ' + c.phone : ''}` : ''}. I'm staying right here with you.`;
  }
  if (/(took|taken|had my|swallowed)/.test(m) && /(pill|medicine|medication|tablet|dose)/.test(m)) {
    if (dueDoses.length && markDoseTaken) {
      const d = dueDoses[0];
      markDoseTaken(d);
      const med = meds.find(x => x.id === d.medId);
      return `Wonderful — I've marked your ${med ? med.name : 'medicine'} as taken. Well done!`;
    }
    return "That's good. If a medicine is due, you'll see a big green button on your home screen — tap it and I'll remember it for you.";
  }
  if (/(medicine|medication|pill|tablet|dose)/.test(m)) {
    if (!meds.length) return "You don't have any medicines recorded yet. Your family can add them for you in the 'My Medicines' section.";
    const lines = meds.map(x => `• ${x.name}${x.dose ? ' (' + x.dose + ')' : ''} — at ${x.times.join(' and ')}`);
    return `Here are your medicines, ${user.name}:\n${lines.join('\n')}`;
  }
  if (/(appointment|doctor|check-?up|visit)/.test(m)) {
    if (!upcoming.length) return "You don't have any appointments coming up in your notes. If your doctor gave you a date, we can save it in 'Notes & Appointments'.";
    const n = upcoming[0];
    return `Your next appointment is "${n.title}" on ${n.date}${n.time ? ' at ' + n.time : ''}. I'll remind you here on the home screen too.`;
  }
  if (/(family|son|daughter|contact|phone|call)/.test(m)) {
    if (!contacts.length) return 'No family contacts are saved yet. They can be added in the "Family & Contacts" section.';
    const lines = contacts.map(c => `• ${c.name}${c.relation ? ' (' + c.relation + ')' : ''}${c.phone ? ' — ' + c.phone : ''}`);
    return `Here are your family and contacts:\n${lines.join('\n')}`;
  }
  if (/^(hi|hello|hey|good morning|good afternoon|good evening)\b/.test(m)) {
    return `Hello, ${user.name}! It's so good to hear from you. How are you feeling today?`;
  }
  if (/(thank|thanks)/.test(m)) return "You're very welcome. That's what I'm here for.";
  if (/(lonely|sad|alone|miss)/.test(m)) {
    return "I'm sorry you're feeling that way. You're not alone — I'm right here, and your family cares about you. Would you like me to show you their phone numbers so you can give them a call?";
  }
  return CANNED[Math.floor(Math.random() * CANNED.length)];
}

async function chatReply(store, user, message, history) {
  const [meds, contacts, notes, doses] = await Promise.all([
    store.listMedications(user.id),
    store.listContacts(user.id),
    store.listNotes(user.id),
    store.listDoses(user.id),
  ]);
  const today = new Date().toISOString().slice(0, 10);
  const upcoming = notes
    .filter(n => n.kind === 'appointment' && n.date >= today)
    .sort((a, b) => (a.date + (a.time || '')).localeCompare(b.date + (b.time || '')))
    .slice(0, 5);
  const dueDoses = doses.filter(d => d.status === 'due');
  const ctx = { user, meds, contacts, upcoming, dueDoses };

  if (process.env.OPENAI_API_KEY) {
    try {
      const messages = [
        { role: 'system', content: systemPrompt(user, meds, contacts, upcoming) },
        ...(Array.isArray(history) ? history.slice(-8) : []),
        { role: 'user', content: message },
      ];
      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: process.env.OPENAI_MODEL || 'gpt-4o-mini', messages }),
      });
      const data = await res.json();
      if (res.ok && data.choices && data.choices[0]) return data.choices[0].message.content;
      console.error('[chat] OpenAI error, using fallback:', data.error ? data.error.message : res.status);
    } catch (e) {
      console.error('[chat] OpenAI request failed, using fallback:', e.message);
    }
  }
  return fallbackReply(message, ctx, async (dose) => {
    await store.updateDose(dose.id, { status: 'taken', takenAt: Date.now() });
  });
}

module.exports = { chatReply, systemPrompt };
