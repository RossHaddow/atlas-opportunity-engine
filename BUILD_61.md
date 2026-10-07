# Build 61 — Daily Plan Density Learning

Version: 1.30.0

## Purpose
Build 60 adapts daily plan size using fixed 70%, 85%, and 100% density rules. Build 61 adds the evidence layer needed to learn which of those densities actually produces the best execution outcomes before Atlas changes the controller itself.

## Added
- Persists `plan_density_pct` on Daily Work Plan starts and their completion/deferral outcomes.
- Adds `dailyPlanDensityLearning()` with a 28-day evidence window.
- Separately measures 70% (Lighter), 85% (Conservative), and 100% (Full) density.
- Tracks starts, resolved blocks, completions, deferrals, follow-through, execution rate, evidence depth, and a bounded performance score.
- Evidence tiers: Insufficient, Provisional, Established, Strong.
- Command Center exposes `daily_plan_density_learning`.
- Daily Work Plan UI shows the currently leading density and evidence depth.
- Build 60 controller remains unchanged until enough comparative evidence exists.

## Verification
- 148/148 tests passing.
- Node syntax checks pass.
- SQLite persistence smoke-tested.
- Clean data produces `Density baseline forming` rather than inventing a winner.
