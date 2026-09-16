# Build 80 — Discovery Job Planner

**Version:** 1.49.0

Build 80 turns Atlas's Discovery Source Controller into adapter-ready work. Atlas now converts due discovery sources into concrete search jobs that an external runner can execute and return through the existing discovery intake endpoint.

## What changed

- Added `radarDiscoveryAdapterForType()`.
  - maps discovery source families to adapter keys
  - defines execution kind
  - defines expected evidence types
  - provides source-specific search instructions
- Added `radarDiscoveryJobPlan()`.
  - selects due, non-Hold discovery sources
  - respects source priority from Build 79
  - creates concrete search queries
  - assigns batch IDs
  - assigns adapter keys
  - sets source metadata for downstream ingestion
  - adjusts candidate limits by discovery mode
  - provides expected evidence types
  - provides the exact intake endpoint and normalized candidate contract
- Added `GET /api/radar/discovery-jobs`.
  - optional `limit` query parameter
  - bounded to 1–10 jobs
- `GET /api/radar` now exposes discovery jobs alongside the Discovery Controller.
- Dashboard Discovery Controller now shows:
  - number of jobs ready
  - next concrete search query
  - adapter key
  - maximum candidate intake for the job

## Execution model

Build 80 intentionally does not perform external network discovery itself. It produces a deterministic execution contract:

`Discovery Controller → Discovery Job → External Adapter/Search → Normalized Candidates → POST /api/radar/discoveries → Radar`

This keeps Atlas's internal scoring, evidence, duplicate detection, source performance, review cadence, and promotion gates independent from whichever search provider or adapter is connected later.

## Verification

- Full regression suite: **246/246 passing**
- Runtime smoke test: passed
- SQLite: writable
- `/api/health`: version **1.49.0**
- Smoke test generated three adapter-ready jobs from a requested limit of three.
- First smoke job contained:
  - source family
  - adapter key
  - concrete query
  - candidate limit
  - intake endpoint
- `GET /api/radar` also exposed the full discovery job plan.
- Production deployment: not performed
