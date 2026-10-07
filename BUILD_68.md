# Atlas Build 68 — Daily Plan Depth & Fatigue Learning

Version: 1.37.0

Build 68 extends Atlas's Daily Work Plan learning from sequence fit into plan-depth fatigue detection.

## What changed

- Added `dailyPlanDepthLearning()` to compare resolved Daily Work Plan blocks 1–2 against blocks 3+ in the current execution window.
- Added evidence tiers for depth learning: Insufficient, Provisional, Established, Strong.
- Atlas activates a fatigue signal only when both early and deep bands have Established-or-better evidence, early follow-through is at least 75%, deep follow-through is at most 55%, and the gap is at least 20 percentage points.
- Added `dailyPlanDepthController()`.
  - No evidence-backed decay: baseline maximum remains 5 blocks.
  - Established decay: cap Daily Work Plan at 3 blocks.
  - Strong evidence on both bands: cap at 2 blocks.
- The controller never raises the existing maximum and does not change Atlas Score, learned density, strategic priority, or the user's time cap.
- Command Center now exposes `daily_plan_depth_learning` and `daily_plan_depth_controller`.
- Daily Work Plan payload exposes `depth_learning` and `depth_controller`.
- UI displays whether Atlas is still comparing blocks 1–2 vs 3+ or actively limiting plan depth.

## Verification

- Full check: 183/183 tests passing.
- Added five Build 68 regression tests covering established fatigue, shallow evidence, strong caps, plan shortening, and Command Center/UI exposure.
