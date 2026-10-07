# Build 84 — Autonomous Discovery Scheduler

**Version:** 1.53.0

## Objective

Allow Atlas to decide when Opportunity Radar discovery is due and execute configured live discovery jobs automatically, without requiring a manual trigger for every search.

## What changed

- Added opt-in autonomous discovery with `ATLAS_DISCOVERY_AUTORUN=true`.
- Added an in-process scheduler that checks for due discovery work after startup and then on a configurable cadence.
- Enforced a safe minimum 60-minute scheduler interval.
- Added a default one-job-per-cycle budget guardrail, configurable up to five jobs.
- Added a per-source/query cooldown so failed or duplicate-only searches do not run repeatedly every cycle.
- Autonomous jobs use the existing Build 83 provider layer and therefore support OpenAI web search or the generic HTTP adapter.
- Autonomous results continue through existing Radar normalization, evidence, scoring, duplicate detection, and SQLite run history.
- Discovery run records identify autonomous runs without storing provider secrets.
- Added `GET /api/radar/discovery-autonomy` for scheduler status.
- Added `POST /api/radar/discovery-autonomy/run` for an immediate autonomous cycle using the same eligibility rules.
- Added autonomy status to the Radar dashboard.
- Manual discovery execution and external handoff remain available.

## Configuration

```env
ATLAS_DISCOVERY_AUTORUN=false
ATLAS_DISCOVERY_AUTORUN_INTERVAL_MINUTES=60
ATLAS_DISCOVERY_AUTORUN_COOLDOWN_HOURS=24
ATLAS_DISCOVERY_AUTORUN_MAX_JOBS=1
```

Autonomous discovery requires a live provider from Build 82/83. It remains disabled by default so deployment cannot unexpectedly create API usage or cost.

## Verification

Build 84 adds tests covering opt-in behavior, provider readiness, scheduler interval limits, cooldown suppression, and secret safety.
