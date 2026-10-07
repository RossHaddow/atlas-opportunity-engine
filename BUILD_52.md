# Atlas Build 52 — Resolution Effectiveness Learning

Status: COMPLETE

Version: 1.21.0

Build 52 closes the loop on Build 51 friction-resolution actions by measuring whether those interventions actually work.

## What changed

- Adds `focusResolutionEffectiveness()` for opportunity-level learning.
- Pairs each `friction_resolution_started` event with the next completed/deferred resolution outcome.
- Tracks completion rate, deferral rate, average resolution time, and performance by friction-response type.
- Adds `focusResolutionEffectivenessSummary()` for portfolio-wide learning.
- New portfolio signals:
  - Resolution actions are helping
  - Mixed resolution effectiveness
  - Resolution actions need refinement
  - Not enough resolution data
- Command Center now exposes `resolution_effectiveness`.
- Execution Friction Diagnosis UI now displays resolution effectiveness, completed/deferred outcomes, and success rate by resolution type.
- Atlas avoids overclaiming before at least three resolved intervention sessions exist.
- Adds four Build 52 regression tests.

## Why it matters

Atlas can now learn whether its own execution interventions are useful instead of assuming that a prescribed blocker, retime, clarify, shrink, or reconsider action is effective merely because it was recommended.

This creates the foundation for future intervention adaptation: preserve resolution types that improve follow-through and revise the ones that repeatedly fail.
