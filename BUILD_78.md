# Build 78 — Discovery Intake & Source Performance

**Version:** 1.47.0

Build 78 creates the intake layer that future live-search adapters can use to feed Opportunity Radar safely. Atlas can now accept structured discovery batches, preserve source/query metadata, reject likely duplicates during ingestion, and learn which discovery sources actually produce worthwhile opportunities.

## What changed

- Added structured discovery-source normalization:
  - source type
  - source name
  - source URL
  - discovery query
  - batch ID
- Added discovery metadata to imported Radar candidates:
  - source type/name
  - discovery query
  - batch ID
  - discovered timestamp
- Added `radarDiscoveryBatch()`.
  - accepts up to 50 candidates per batch
  - validates required candidate fields
  - checks duplicates against existing Radar candidates and the active portfolio
  - skips likely duplicates by default
  - keeps valid non-duplicates from the same batch
  - supports explicit duplicate override
- Added `POST /api/radar/discoveries`.
- Added `GET /api/radar/sources`.
- Added `radarSourcePerformance()`.
  - candidate count
  - active candidates
  - Ready to Test count
  - promoted count
  - dismissed count
  - average Radar Score
  - promotion rate
  - ready-or-promoted rate
  - dismissal rate
  - revenue/profit traced back through `radar_origin_id`
  - source Yield Score
  - last discovery timestamp
- `GET /api/radar` now includes source performance.
- Dashboard now includes a **Discovery Sources** panel showing each source's Yield Score, average Radar Score, candidate volume, and ready/promoted rate.

## Why it matters

Atlas now has a clean ingestion contract for external discovery. Future marketplace, search, community, local-business, or AI discovery adapters can feed candidate batches into one guarded pipeline without bypassing Radar's duplicate detection, scoring, evidence rules, review cadence, or promotion gates.

Source performance also creates a learning loop: Atlas can eventually spend more discovery effort on sources that produce strong candidates and reduce effort on noisy sources.

## Verification

- Full regression suite: **234/234 passing**
- Runtime smoke test: passed
- SQLite: writable
- `/api/health`: version **1.47.0**
- Smoke discovery batch submitted 2 candidates:
  - 1 accepted
  - 1 likely duplicate skipped
- Discovery source performance returned successfully with Yield Score and candidate metrics.
- Production deployment: not performed
