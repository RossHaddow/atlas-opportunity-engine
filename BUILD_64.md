# Build 64 — Time-Window-Aware Daily Plan Priority

Version: 1.33.0

Build 64 turns Build 63's time-of-day learning into a conservative Daily Work Plan ordering signal.

## What changed

- Added `opportunityTimeWindowFit()` to measure each opportunity's Daily Work Plan execution history in the current Atlas-local time window.
- Current-window evidence is opportunity-specific and uses a rolling 42-day history.
- Time-window priority remains neutral until an opportunity has at least four resolved blocks in the same window (`Established` evidence).
- Established strong fit adds a modest +4 planning adjustment; Strong evidence can add +6.
- Established weak fit applies the matching negative adjustment so repeatedly stalled work is less likely to crowd the top of the current plan.
- These adjustments affect only Daily Work Plan ordering. The underlying Atlas Score and strategic recommendation remain unchanged.
- Added `dailyPlanTimeWindowPriority()` to summarize the current window, adjusted opportunities, strongest fit, weakest fit, and evidence.
- `nextWorkBlockPlan()` accepts an optional planning context so Daily Work Plan sequencing can apply time-window fit without changing standalone Next Work Block behavior.
- Command Center exposes `daily_plan_time_window_priority`.
- Dashboard shows whether current-window prioritization is still learning or actively adjusting the plan, and labels adjusted blocks with their time-window fit.

## Verification

- Full check: 163/163 tests passing.
- Runtime smoke test passed on a clean temporary data directory.
- `/api/health` reports version 1.33.0 with writable SQLite storage.
- Clean execution history keeps time-window priority neutral instead of inventing a preference.
- Atlas Score remains untouched by time-window planning adjustments.
