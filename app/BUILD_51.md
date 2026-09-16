# Atlas Build 51 — Friction Resolution Actions

Status: COMPLETE

Build 51 turns Build 50's execution-friction diagnosis into executable, trackable resolution actions.

## What changed

- Version bumped to 1.20.0.
- Adds `focusFrictionResolution()`.
- Maps diagnosed friction to a concrete response:
  - action-size friction → shrink the current next step
  - clarity friction → rewrite one concrete deliverable
  - dependency friction → identify and act on the blocker
  - timing/capacity friction → re-time the work
  - priority mismatch → keep, demote, pause, or kill review
  - other/mixed friction → short structured review
- Friction summaries now expose a resolution action for each opportunity when evidence is sufficient.
- Adds `POST /api/opportunities/:id/friction-resolution`.
- Starting a resolution creates a tracked focus session with `action_mode: resolution`.
- Resolution history records the friction response and dominant reason that caused the intervention.
- The Executive Briefing friction panel now shows the prescribed action and a **Start resolution** control.
- No resolution is invented when Atlas lacks enough diagnosed friction.

## Guardrails

- Build 51 does not change the underlying Atlas Score.
- Blocked work is not incorrectly shrunk.
- Timing/capacity problems are re-timed rather than treated as bad opportunities.
- Priority mismatch explicitly opens the door to demoting, pausing, or killing work.
- Clean portfolios with no friction history remain unchanged.

## Verification

- Full check suite: 100/100 passing.
- Syntax checks passed for server, storage, and frontend runtime.
- Clean-seed smoke test confirms Atlas v1.20.0 starts normally and does not invent friction resolutions.
