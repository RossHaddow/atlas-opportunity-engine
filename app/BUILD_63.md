# Build 63 — Daily Plan Time-of-Day Learning

Version: 1.32.0

Build 63 adds a conservative time-of-day execution-learning layer to the Daily Work Plan.

## What changed

- Daily-plan focus starts now record the Atlas-local execution window in `plan_time_window` and preserve it through completion or deferral.
- Atlas separates execution into four windows: Morning, Afternoon, Evening, and Late night.
- `dailyPlanTimeWindowLearning()` compares follow-through and resolution performance across a rolling 28-day window.
- Evidence remains conservative: Insufficient (<2 resolved), Provisional (2–3), Established (4–7), Strong (8+).
- Atlas surfaces a preferred execution window only after at least two resolved blocks exist in a window.
- The Daily Work Plan exposes the time-window learning result and mentions the current preferred window in guidance when evidence exists.
- The preference is advisory only; it never overrides the time the user says is available.
- Command Center exposes `daily_plan_time_window_learning`.
- Dashboard displays the time-of-day baseline or leading execution window.

## Verification

- Full check: 158/158 tests passing.
- Runtime smoke test passed on a clean temporary data directory.
- `/api/health` reported version 1.32.0 and writable SQLite storage.
- A clean 90-minute Daily Work Plan still sequenced three priority blocks and correctly reported `Time-of-day baseline forming` with no invented preferred window.
