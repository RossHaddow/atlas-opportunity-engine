# Build 82 — Live Discovery HTTP Adapter

**Version:** 1.51.0  
**Status:** Complete

Build 82 crosses the execution boundary created in Build 81. Atlas can now execute a planned Discovery Job through a configurable HTTP JSON adapter, ingest the returned candidates through the existing Radar pipeline, and persist the final run outcome automatically.

## What changed

- Added `discoveryExecutorConfig()` and `discoveryExecutorStatus()`.
- Added an optional live HTTP JSON executor controlled by environment variables.
- Added `executeDiscoveryJob()` with:
  - bounded request timeout
  - optional bearer-token authentication
  - provider-response validation
  - per-job candidate caps
  - safe provider metadata passthrough
- `radarDiscoveryRunnerAdapter()` now reports either:
  - `external_handoff` when no live adapter is configured, or
  - `live_http` when Atlas can execute the job itself.
- `POST /api/radar/discovery-jobs/run` now supports `execute: true`.
  - Starts and persists the run.
  - Calls the configured live adapter.
  - Feeds returned candidates through Build 78 duplicate detection and normalization.
  - Persists accepted/skipped counts and closes the run.
  - Converts provider failures into persistent Failed runs.
- Added `GET /api/radar/discovery-adapter`.
- `GET /api/radar` now includes `discovery_adapter` readiness.
- Added deployment settings to `.env.example`.

## Adapter contract

Atlas sends a JSON POST containing the job id, source, query, purpose, candidate cap, evidence expectations, and adapter instructions.

The configured endpoint returns JSON shaped like:

```json
{
  "candidates": [
    {
      "name": "Example opportunity",
      "category": "Digital Product",
      "description": "What the opportunity is and who pays for it",
      "evidence": ["Demand signal"],
      "income_potential": 8,
      "speed_to_revenue": 8,
      "startup_cost_score": 9,
      "ongoing_effort_score": 8,
      "scalability_score": 9,
      "automation_potential": 9,
      "atlas_fit": 9,
      "confidence": 7
    }
  ],
  "raw_result_count": 12,
  "provider_metadata": {}
}
```

The provider remains responsible for external search/research. Atlas remains responsible for candidate limits, normalization, evidence scoring, duplicate detection, source history, Radar ranking, and promotion gates.

## Configuration

- `ATLAS_DISCOVERY_HTTP_URL` — live adapter endpoint. Blank keeps Build 81 handoff mode.
- `ATLAS_DISCOVERY_HTTP_TOKEN` — optional bearer token sent only to the adapter.
- `ATLAS_DISCOVERY_HTTP_TIMEOUT_MS` — request timeout, default 30000 ms, bounded from 3000 to 120000 ms.

## Verification

- Full regression suite: **258/258 passing**.
- Build 81 external-handoff behavior remains intact when no adapter is configured.
- New tests cover configuration state, executable runner mode, HTTP payload/authentication, candidate caps, and empty-result rejection.
