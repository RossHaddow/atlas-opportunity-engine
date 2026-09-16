# Atlas Build 53 — Adaptive Resolution Strategy

Status: COMPLETE

Version: 1.22.0

Build 53 turns Build 52 resolution-effectiveness data into an adaptive intervention policy.

## What changed

- Adds `resolutionStrategyFromEvidence()` to translate effectiveness into action policy.
- Adds `focusResolutionStrategy()` with opportunity-first evidence and portfolio fallback.
- Adds `focusResolutionStrategySummary()` to expose portfolio intervention strategy.
- Strategy modes:
  - `preserve` — keep resolutions completing at least 70% of resolved sessions.
  - `selective` — continue mixed resolutions (40–69%) but watch repeated friction.
  - `refine` — stop blindly repeating resolutions below 40% success after enough evidence.
  - `learning` — preserve default mapping until at least three resolved sessions exist.
- Weak interventions now route to a short "Revise the resolution" action before another attempt.
- Resolution-start history records the strategy mode and evidence scope applied at the time.
- Command Center exposes `resolution_strategy`.
- Execution Friction Diagnosis displays strategy label and evidence depth by resolution type.
- Opportunity friction cards show whether the current resolution is based on opportunity-specific or portfolio evidence.

## Why it matters

Atlas now changes its own execution-support behavior based on observed results. It can preserve interventions that work and revise interventions that repeatedly fail instead of assuming the original friction mapping is always correct.
