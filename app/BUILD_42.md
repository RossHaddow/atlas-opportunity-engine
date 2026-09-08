# Atlas Build 42 — 7-Day Focus Scorecard

Status: COMPLETE

Build 42 turns the daily execution history from Builds 40–41 into a short rolling execution-learning view.

## What changed
- Version 1.11.0.
- Adds a 7-Day Focus Scorecard beneath Today’s Focus Review.
- Shows focus-active days, completion vs deferral follow-through, tracked focus minutes, and completed/ deferred counts.
- Shows the opportunities that received the most tracked focus time during the rolling window.
- Adds an execution signal that distinguishes strong follow-through, repeated deferral, open execution loops, and insufficient history.
- Adds plain-language guidance tied to the observed execution pattern.
- Exposes `focus_scorecard` through `/api/command-center`.
- Uses the existing opportunity-embedded focus history and `ATLAS_TIME_ZONE`; no second analytics store is introduced.

## Product intent
Build 41 answers “What did I do today?” Build 42 begins answering “Is Atlas actually helping turn recommendations into completed work, and where is my execution time going?” The scorecard deliberately avoids an arbitrary productivity score and instead reports observable behavior.

## Verification
- `npm run check` passes.
- Seven-day filtering respects Atlas’s configured local-day boundary.
- Follow-through is based on completed vs deferred resolved focus sessions.
- Repeated deferral behavior is surfaced as a specific execution signal.
- Command Center exposes the scorecard payload.
- 7-Day Focus Scorecard UI is mounted in the Executive Briefing.
