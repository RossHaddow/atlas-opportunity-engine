# Build 60 — Adaptive Daily Plan Sizing

Version: 1.29.0

Build 60 closes the loop between Build 59 daily-plan execution learning and Build 58 daily sequencing. Atlas now changes how much of a user-provided daily execution window it schedules based on recent plan follow-through.

## What changed

- Added `dailyPlanAdaptation(summary, requestedMinutes)`.
- The user's selected daily time remains a hard maximum; Atlas only changes planning density inside that limit.
- Adaptation modes:
  - `learning`: 100% of the requested window while evidence is insufficient.
  - `reduce`: about 70% after evidence that recent daily plans are overpacked.
  - `selective`: about 85% when daily-plan fit is mixed.
  - `maintain`: 100% when recent daily plans are fitting well.
- Daily Work Plan now exposes:
  - `planning_target_minutes`
  - `reserved_minutes`
  - `adaptation.mode`
  - `adaptation.label`
  - `adaptation.density_pct`
  - human-readable adaptation reason.
- Reserved time is left intentionally unscheduled rather than represented as a fake reduction in user availability.
- Sequence offsets remain relative to the actual planned work, so reduced-density plans still begin at minute zero.
- Dashboard Daily Work Plan now explains the adaptive plan target and reserved breathing room.

## Guardrails

- Atlas does not schedule beyond the user's requested time.
- Build 59 evidence thresholds remain the gate for plan-size adaptation.
- Learning mode preserves prior Build 58 behavior until enough plan execution evidence exists.
- Adaptation changes planning density, not opportunity Atlas Scores or strategic rankings.

## Verification

- `npm run check`: 143/143 tests passing.
- Runtime smoke test:
  - health reports v1.29.0
  - SQLite writable
  - 90-minute clean-data plan remains three 30-minute blocks
  - adaptive mode is `learning` on clean data
  - Top Focus remains Bar Operations Kit.
