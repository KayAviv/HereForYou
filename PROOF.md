# HereForYou — Proof of the full product flow

Automated end-to-end proof (`npm run proof`, script: `test/proof.mjs`) run
against the real server on 2026-11-16. Configuration for the run: local file
store (no database), scheduler tick 1s, **no OpenAI key** (built-in companion
answered), **no Twilio credentials** (SMS in outbox-log mode, $0), test
endpoints enabled so silence could be simulated by backdating activity.

Test persona: **Margaret** (elder) · family contact **David (son),
+15551234567** · medicine **Blood Pressure Pill, 1 tablet**.

## Results — ALL 30 STEPS PASSED (run finished 2026-11-16T21:50:11Z)

| Time (UTC) | Step | Result |
|---|---|---|
| 21:50:01 | Server boots; `/health` OK (file store, outbox-log SMS, built-in AI) | PASS |
| 21:50:02 | Register elder account (Margaret) | PASS |
| 21:50:02 | Password stored hashed (scrypt); session issued; family code generated | PASS |
| 21:50:02 | Duplicate registration rejected (409); wrong password rejected (401) | PASS |
| 21:50:02 | Correct login succeeds | PASS |
| 21:50:02 | Family contact added (David, son, +15551234567) | PASS |
| 21:50:02 | Medication added, scheduled for 21:50 UTC | PASS |
| 21:50:02 | **Medication reminder FIRED by the scheduler** — dose scheduled 21:50:00, reminderFiredAt 21:50:02.508 | PASS |
| 21:50:02 | Server log contains the `[reminder] FIRED` line | PASS |
| 21:50:02 | Daily "I'm OK" check-in recorded | PASS |
| 21:50:02 | Dose marked taken ("I took it") | PASS |
| 21:50:02 | Doctor appointment (Dr. Cohen check-up, next day 10:30) saved and surfaced as next appointment | PASS |
| 21:50:02 | Doctor note saved | PASS |
| 21:50:02 | Family view shows last check-in, today's medicine = Taken, and the appointment | PASS |
| 21:50:02 | Family view rejects an unknown code (404) | PASS |
| 21:50:02 | Companion answers "What are my medications?" from her own records | PASS |
| 21:50:02 | Companion **refuses medical advice** ("should I skip / double dose") and redirects to doctor/family | PASS |
| 21:50:02 | New account's default safety window is **24 hours** | PASS |
| 21:50:02 | Invalid window (7h) rejected with 400 | PASS |
| 21:50:02 | Elder sets the safety window to **4 hours** | PASS |
| 21:50:03 | **4h window: escalation FIRED after simulated 5h of silence** | PASS |
| 21:50:03 | Escalation addressed to +15551234567, status `logged` (outbox mode), outbox id `e5879bd4-edae-4e51-b907-5bb097ee1316` | PASS |
| 21:50:03 | Escalation text names Margaret and asks family to check up | PASS |
| 21:50:03 | Server log contains the `[SMS-OUTBOX:escalation]` line | PASS |
| 21:50:03 | Elder switches the safety window to **48 hours** | PASS |
| 21:50:07 | **48h window: the same 5h silence does NOT escalate** (engine uses the chosen value) | PASS |
| 21:50:07 | **48h window: escalation FIRED after simulated 49h of silence** | PASS |
| 21:50:07 | **Family changes the window to 12 hours via the family link**; family view reports 12 | PASS |
| 21:50:07 | Family-side invalid window (100h) rejected with 400 | PASS |
| 21:50:11 | After a fresh check-in, no further escalation (rule re-armed) — exactly 2 escalations total | PASS |

## Key server-log evidence

```
[store] using file store
[scheduler] ticking every 1000ms; silence window is per-user (choices 4/12/24/48h, default 24h)
[reminder] FIRED user=margaret@test.local med="Blood Pressure Pill" scheduled=2026-11-16T21:50:00.000Z at=2026-11-16T21:50:02.508Z
[checkin] user=margaret@test.local at=2026-11-16T21:50:02.847Z
[dose] TAKEN user=margaret@test.local med="Blood Pressure Pill" at=2026-11-16T21:50:02.851Z
[SMS-OUTBOX:escalation] to=+15551234567 :: HereForYou check-up: Margaret hasn't checked in or used the app for about 5 hours. This is the gentle alert they asked us to send — please give them a call or pop by to make sure everything is OK.
[escalation] SENT user=margaret@test.local contacts=1 silenceHours=5
[SMS-OUTBOX:escalation] to=+15551234567 :: HereForYou check-up: Margaret hasn't checked in or used the app for about 49 hours. …
[escalation] SENT user=margaret@test.local contacts=1 silenceHours=49
```

## Design point proven along the way

Passive reads (the home screen auto-refreshing) do **not** count as
"activity" — only deliberate actions (check-in, chat, marking a dose taken,
signing in, edits) re-arm the safety window. An app left open on a tablet
can therefore never defeat the family safety net. (This was caught and
fixed during the first proof run.)

## Not covered by this proof

- Real Twilio delivery (no credentials exist yet — by design, the outbox
  mode records exactly what would be sent, to whom, and when).
- OpenAI-backed chat (no key configured; the built-in companion was proven
  instead, including the medical-advice refusal).
- The Postgres store path (same code paths/interface as the file store;
  needs a `DATABASE_URL` to exercise — see README go-live list).
