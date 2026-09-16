# Build 57 — Next Work Block Planner

Version: **1.26.0**

## Purpose
Turn Build 56 capacity awareness into an executable planning layer. Atlas can now answer: **What is the best thing I can realistically do with the time I have right now?**

## What changed
- Added `normalizeWorkBlockMinutes()` with 10–180 minute validation and learned-capacity fallback.
- Added `nextWorkBlockPlan()`.
- Work-block planning ranks active opportunities by strategic work priority plus execution fit.
- Timed adaptive actions are preferred when they fit the requested window.
- Untimed strategic recommendations are converted into bounded, time-boxed work blocks instead of being excluded.
- Active execution loops receive continuity preference.
- Command Center exposes `next_work_block`.
- `/api/command-center?minutes=30` supports an explicit available-time window.
- Dashboard adds a **Next Work Block** panel with 15, 30, 45, 60, 90, and 120 minute choices.
- The selected plan and up to two alternatives can be started directly.
- Starting a planned work block records the exact planned action, duration, `action_mode: work_block`, and `work_block_source: next_work_block` so later effort/capacity learning is based on the work Atlas actually prescribed.

## Guardrails
- Explicit work blocks must be 10–180 minutes.
- Atlas does not invent a completion estimate for untimed strategic work; it creates a bounded work window instead.
- Killed opportunities are excluded from work-block planning.
- Capacity data remains advisory and does not alter the underlying Atlas Score.

## Verification
- Full check: **128/128 tests passing**.
- Runtime smoke test passed.
- `/api/health` reports **v1.26.0**.
- SQLite storage is writable.
- Clean seeded runtime correctly selected **Bar Operations Kit** for a requested 30-minute block.
- Top Focus remained **Bar Operations Kit**.
