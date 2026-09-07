# Atlas Build 38 — Opportunity Engine Intelligence

Status: COMPLETE

Build 38 upgrades Atlas from surfacing work to ranking what Ross should work on next.

## What changed
- Version 1.7.0.
- Adds a 0–100 work-priority score across the portfolio.
- Combines Atlas score, lifecycle state, urgent/due work, live-test health, actual profit, effort, and scalability.
- Generates a concrete recommendation and reasons for every opportunity.
- Adds `/api/intelligence` with the full ranked queue.
- Adds `top_focus` and the top five intelligence-ranked opportunities to the Executive Briefing payload.
- Killed opportunities stay out of the active work queue.
- Adds regression tests for priority ranking, recommendations, and briefing integration.
