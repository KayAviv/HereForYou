# HereForYou — Always Here For You

A warm companion app for older people, built for Kay Group:

- **AI companion chat** — voice-friendly, knows the user's own medications,
  contacts and appointments. With an OpenAI key it uses GPT; without one, a
  built-in companion answers from the user's recorded data. It **never gives
  medical advice** — it reminds, encourages, and points to family/doctor.
- **Medication reminders that fire** — a server scheduler creates each dose
  at its set time (in the user's timezone); the app shows a big unmissable
  card, a browser notification and optional spoken alert, with a giant
  "✓ I took it" button. Untaken doses turn "missed" after 2 hours.
- **Daily "I'm OK" check-in** — one huge green button.
- **Doctor notes & appointments** — typed in, saved, and surfaced on the
  home screen on the day (and as "next appointment" before it).
- **Family safety net** — if there's no check-in or deliberate app activity
  for the chosen window, the app texts the family contacts to check up.
  **The window is a choice: 4, 12, 24 or 48 hours (default 24)** — set by
  the elder in *Family & contacts → Safety check timing*, or by family from
  the family view link.
- **Family view** — a private link (`/family.html?code=…`) showing last
  check-in, today's medicines (taken/due/missed) and upcoming appointments.
  Read-only except the safety-check timing, which family may adjust.

Senior-first UI throughout: very large text, giant buttons, high contrast,
one thing per screen, microphone input and read-aloud where the browser
allows.

## Run it

```bash
npm install
npm start          # http://localhost:3000  (PORT env to change)
npm run proof      # full end-to-end proof (see PROOF.md)
```

No configuration is required to run: without a database it uses a local
JSON file store (`data/hereforyou.json`), without Twilio it logs texts to
an **outbox** instead of sending (visible in the server log and via
`GET /api/outbox`), and without an OpenAI key the built-in companion chats.

## Configuration (env vars)

| Var | Purpose |
|---|---|
| `PORT` | Port (Render sets this automatically) |
| `DATABASE_URL` | Postgres connection string. Set → durable Pg store; unset → local file store (data lost on redeploy/restart) |
| `OPENAI_API_KEY` | Enables GPT chat (`OPENAI_MODEL` to override, default `gpt-4o-mini`) |
| `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER` | Enables real SMS. All three required; otherwise outbox-log mode |
| `SILENCE_HOURS` | Default safety window for NEW accounts (one of 4/12/24/48; default 24). Each user can change their own |
| `DOSE_MISSED_AFTER_MIN` | Minutes before an untaken dose is marked missed (default 120) |
| `SCHEDULER_TICK_MS` | Scheduler tick (default 30000) |
| `DATA_FILE` | File-store location (default `./data/hereforyou.json`) |
| `SEED_DEMO` | `1` seeds demo@user.com / demo (local demos only — never in production) |
| `ALLOW_TEST_ENDPOINTS` | `1` enables `POST /api/test/backdate` (proof/testing only — never in production) |

## Architecture

- `server.js` — Express API + auth (scrypt-hashed passwords, bearer
  sessions), settings, family view.
- `lib/store.js` — data layer: Postgres (JSONB collections) when
  `DATABASE_URL` is set, JSON file store otherwise. Same interface.
- `lib/scheduler.js` — medication dose firing, missed marking, and the
  per-user silence-window escalation.
- `lib/sms.js` — Twilio REST adapter, env-gated; outbox logging otherwise.
- `lib/chat.js` — OpenAI chat (env-gated) + built-in companion fallback,
  both bound by the same no-medical-advice system rules.
- `public/` — the senior-first web app + family view page.
- `test/proof.mjs` — the end-to-end proof (results in `PROOF.md`).

**Activity semantics:** only deliberate actions (sign-in, check-in, chat,
marking a dose taken, adding/editing data) count as activity for the safety
window. Passive screen refreshes do not — an app left open can't defeat
the safety net.

## Go-live checklist (Render service `HereForYou`)

1. **Database**: provision a Postgres (Render Postgres or Neon) and set
   `DATABASE_URL` on the service. Until then the file store loses data on
   every restart/redeploy.
2. **Env vars**: set `OPENAI_API_KEY` (real AI chat) and the three
   `TWILIO_*` vars (real family texts) when ready. The app runs safely
   without them (built-in companion + outbox logging).
3. **Plan note**: Render's free tier sleeps when idle, which delays the
   scheduler — a paid always-on instance is recommended before real
   families rely on the safety texts.
4. Never set `ALLOW_TEST_ENDPOINTS` or `SEED_DEMO` in production.
