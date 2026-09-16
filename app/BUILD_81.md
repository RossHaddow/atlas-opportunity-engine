# Build 81 — Discovery Runner

**Version:** 1.50.0  
**Status:** Complete

Build 81 turns Build 80 discovery jobs into persistent execution runs without coupling Atlas to a specific search provider.

## What changed

- Added a provider-neutral Discovery Runner contract.
- Discovery runs move through `Running`, `Completed`, `Failed`, or `Skipped` states.
- Added persistent SQLite-backed discovery-run history.
- Added external execution handoff metadata so ChatGPT, a plugin, or a future search API can execute a job without changing Atlas scoring logic.
- Successful run completion feeds normalized candidates through the existing Build 78 discovery intake and duplicate detection pipeline.
- Run records track raw results, normalized candidates, accepted candidates, skipped candidates, timestamps, adapter, query, and errors.
- Opportunity Radar now exposes Discovery Runner activity and accepted-candidate totals.

## API

- `POST /api/radar/discovery-jobs/run` — starts a discovery run from a due job or supplied job specification.
- `GET /api/radar/discovery-runs` — returns recent run history and aggregate status.
- `POST /api/radar/discovery-runs/:id/complete` — completes, fails, or skips a run; successful completions ingest returned candidates into Radar.
- `GET /api/radar` now includes `discovery_runs`.

## Architectural decision

Atlas still does not pretend the Node process has a built-in general web-search provider. Build 81 creates the stable runner boundary needed for live adapters later. External providers can execute a job and return results while Atlas retains source control, evidence standards, duplicate detection, scoring, history, and learning.

## Verification

- Full regression suite: **253/253 passing**.
- SQLite discovery-run persistence covered by tests.
- Runtime smoke test verifies v1.50.0 and the new discovery-run API flow.
