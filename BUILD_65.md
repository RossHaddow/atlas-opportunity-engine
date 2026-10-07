# Atlas Build 65 — Time-Window Work-Type Fit Learning

Version: **1.34.0**

Build 65 extends Atlas's execution learning from opportunity-specific time-window fit into work-type fit. Atlas now classifies Daily Work Plan actions as Research, Creation, Editing, Setup, Review, Outreach, or General and learns whether those task types perform differently in the current execution window.

## What changed

- Added `workTypeForAction()` and human-readable work-type labels.
- Added `dailyPlanWorkTypeLearning()` with a 42-day learning window.
- Work-type evidence is scoped to the current Atlas time window: morning, afternoon, evening, or late night.
- A work type must have at least four resolved Daily Work Plan blocks in the current window before it can affect priority.
- Established fit can adjust planning priority by ±3; Strong evidence can adjust by ±4.
- These are planning-only adjustments. Atlas Score is unchanged.
- Daily Work Plan block starts persist `plan_work_type`, and completion/deferral preserves that attribution.
- Daily Work Plan sequencing can combine opportunity-specific time-window fit and global work-type fit.
- Command Center exposes `daily_plan_work_type_learning`.
- Dashboard shows current-window work-type learning and any evidence-backed adjustment.

## Guardrails

- No adjustment from Insufficient or Provisional work-type evidence.
- Work-type influence is intentionally smaller than Build 64's opportunity-specific time-window adjustment.
- The user's available time remains authoritative.
- Existing adaptive-action, density, capacity, and Atlas Score logic remain intact.

## Verification

- Full check: **168/168 tests passing**.
- Runtime smoke test completed with temporary writable SQLite data.
- `/api/health` reports **1.34.0**.
