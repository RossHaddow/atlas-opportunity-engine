# Build 62 — Learned Daily Plan Density Controller

Version: 1.31.0

Build 62 turns Build 61 density observations into a guarded execution policy.

## What changed

- Added `dailyPlanDensityController()` to choose the applied daily planning density.
- Keeps Build 60 rule-based 70/85/100 sizing while evidence is Insufficient or Provisional.
- Allows a learned density to override the rule-based controller only at Established or Strong evidence depth.
- Remembers the most recently applied daily-plan density from focus history.
- Adds stability guardrails: an established prior density is held unless a challenger has comparable evidence and at least a 10-point performance advantage; Strong prior evidence requires a 12-point advantage.
- Exposes controller source, applied density, stability state, evidence, prior density, and rationale through Command Center.
- Daily Work Plan now uses the guarded density controller directly.
- Dashboard shows the applied density and whether Atlas is learning, holding, or accepting a density change.

## Guardrail intent

Atlas should learn the planning density that produces the best execution, but it should not bounce between densities because of a few recent outcomes. Build 62 therefore separates evidence gathering from policy changes.

## Verification

- `npm run check`: 153/153 tests passing.
- Runtime health smoke test confirms v1.31.0.
- SQLite persistence is writable in an isolated runtime directory.
- Clean data keeps the rule-based 100% density while density evidence is insufficient.
