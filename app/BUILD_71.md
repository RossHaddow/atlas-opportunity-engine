# Build 71 — Actual-Duration Block Calibration

**Version:** 1.40.0

Build 71 closes the loop on Build 70 by comparing planned block minutes with the time completed work actually takes. This prevents Atlas from treating an apparently successful duration as optimal when the estimate itself is consistently too optimistic or too generous.

## What changed

- Added `dailyPlanBlockSizeOutcomeLearning()`.
  - Learns separately for early blocks (positions 1–2) and deep blocks (position 3+).
  - Uses resolved Daily Work Plan outcomes from the current execution window.
  - Tracks planned minutes, actual minutes, duration accuracy, on-time completion, follow-through, efficiency, and evidence.
- Added `dailyPlanBlockSizeOutcomeController()`.
  - Requires Established evidence before actual-duration calibration can shorten a target.
  - Trims a target by only 5 minutes when actual duration is at least 130% of plan and follow-through is below 80%.
  - Expands a target by only 5 minutes when Strong evidence shows work finishing within 85% of plan with at least 80% follow-through.
  - Never overrides the user's hard time cap, learned density, plan-depth protection, or Atlas Score.
- Daily Work Plan exposes outcome-calibrated early/deep targets.
- Command Center exposes block-outcome learning.
- Dashboard shows planned-versus-actual calibration status.

## Stability guardrails

Build 71 does not react to a few unusually long or short sessions. Shortening requires Established evidence; expansion requires Strong evidence. Each outcome-based adjustment is capped at five minutes and is layered on top of Build 70's already bounded block-size controller.

## Verification

- Full regression suite: **198/198 passing**
- Runtime smoke test: passed
- SQLite: writable
- `/api/health`: version **1.40.0**
- Clean-data behavior: no actual-duration adjustment is invented before execution evidence exists.
