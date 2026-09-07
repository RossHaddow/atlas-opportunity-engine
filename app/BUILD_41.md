# Atlas Build 41 — Daily Focus Plan

Status: COMPLETE

Build 41 is the first feature build on the normalized Atlas source tree. It converts Atlas's ranked intelligence queue into a short, deliberate daily work plan instead of asking Ross to interpret the entire portfolio at once.

## What changed

- Version bumped to 1.8.0.
- Adds `daily-focus.js`, which turns the intelligence queue into one primary objective, up to two supporting moves, and a defer list.
- Adds a three-move daily capacity rule so lower-ranked work does not continuously expand the day's workload.
- Adds a stop rule that keeps Atlas focused on the highest-leverage objective until it is completed, blocked, or deliberately deferred.
- Killed opportunities are excluded from the daily plan.
- Paused and low-priority work can be explicitly surfaced as deferred rather than silently competing for attention.
- Adds authenticated `GET /api/daily-focus`.
- Adds `server-build41.js`, which preserves all existing Atlas routes while intercepting the new Daily Focus endpoint.
- Updates the production start command to the Build 41 server wrapper.
- Adds regression tests for primary selection, supporting moves, killed-work exclusion, defer behavior, and an empty portfolio.
- Adds GitHub Actions application CI so syntax and regression checks run automatically for future `app/**` changes.

## Daily Focus response

`GET /api/daily-focus` returns:

- `headline`
- `primary_objective`
- `supporting_moves`
- `defer`
- `capacity_rule`
- `stop_rule`
- `queue_size`
- `urgent_count`

The plan is generated from the existing Build 38 intelligence ranking, so it inherits Atlas's lifecycle, urgency, profitability, effort, scalability, and live-test signals.

## Product behavior

The intent is simple: Atlas should not merely say what matters; it should reduce the portfolio to the small number of moves Ross should actually act on today.

Build 41 keeps the full intelligence queue available while adding a more decisive operating layer on top of it.
