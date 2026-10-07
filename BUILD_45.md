# Atlas Build 45 — Adaptive Action Learning

Status: COMPLETE

Build 45 closes the loop on Build 44 by measuring whether smaller adaptive actions actually improve execution.

## What changed
- Version 1.14.0.
- Focus sessions now persist `action_mode` (`micro` or `standard`) and the adaptive estimated minutes alongside the recorded action.
- Completion and deferral history inherit the action mode from the active focus session, allowing Atlas to measure the outcome of the exact recommendation type it gave.
- Adds a rolling 14-day Adaptive Action Learning comparison.
- Compares micro-action vs standard-action resolved sessions using completion-vs-deferral follow-through.
- Tracks average resolution minutes for each action type when timing data exists.
- Reports micro-action follow-through lift in percentage points once both groups have enough history.
- Requires at least two resolved micro sessions and two resolved standard sessions before claiming a comparative effect.
- Surfaces learning signals: Micro-actions are helping, No clear micro-action advantage, Micro-actions are not helping yet, Adaptive baseline forming, or Not enough adaptive data.
- Adds an Adaptive Action Learning panel to the Executive Briefing.
- Exposes the learning payload through `/api/command-center`.

## Product intent
Build 44 made recommendations smaller when execution friction appeared. Build 45 measures whether that intervention works. This prevents Atlas from assuming that smaller tasks are always better: if micro-actions fail to improve follow-through, Atlas can later reconsider timing, task choice, or the opportunity itself instead of shrinking work indefinitely.

## Verification
- `npm run check` passes.
- 72/72 automated tests pass.
- Comparative claims require sufficient samples in both action modes.
- Existing historical focus events without action-mode metadata are ignored for the comparison rather than guessed.
- Core Atlas opportunity scores remain untouched.
