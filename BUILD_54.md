# Atlas Build 54 — Resolution Strategy Stability Guardrails

Status: COMPLETE

Version: 1.23.0

Build 54 adds hysteresis and strategy memory to Build 53's adaptive friction-resolution controller so Atlas does not flip intervention policy because of small rolling-window swings.

## What changed

- Adds explicit resolution-strategy evidence tiers:
  - Insufficient: fewer than 3 resolved sessions.
  - Provisional: 3–5 resolved sessions.
  - Established: 6–11 resolved sessions.
  - Strong: 12+ resolved sessions.
- Adds `lastResolutionStrategySnapshot()` to remember the resolution strategy actually applied when a friction-resolution session started.
- Adds `resolutionStrategyGuardrail()` and `resolutionPolicyForMode()`.
- Established `preserve` and `refine` strategies now receive stability protection.
- Contradictory evidence must be at least as deep as the evidence that established the prior strategy before Atlas will consider reversing it.
- Strong reversal thresholds prevent small swings from changing behavior:
  - established preserve → refine requires success of 25% or less;
  - established refine → preserve requires success of 80% or more;
  - preserve/refine → selective requires a meaningful move toward the middle rather than a one-point threshold crossing.
- Provisional strategies remain flexible so Atlas can learn quickly before evidence becomes durable.
- Resolution-start history now snapshots strategy mode, scope, evidence tier, resolved sample count, success rate, and stability state.
- Execution Friction Diagnosis shows whether a strategy is stable, being held, or whether a change was accepted.
- Fixes the Build 53 friction-resolution endpoint so it computes the adaptive resolution strategy before starting and recording a resolution session.

## Why it matters

Build 53 made Atlas adaptive. Build 54 makes that adaptation durable. Atlas can now learn from new evidence without oscillating between intervention policies every time a rolling success rate crosses a threshold by a few points.
