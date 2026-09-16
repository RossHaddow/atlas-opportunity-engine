# Build 85 — Autonomous Radar Triage

**Version:** 1.54.0

## Objective

Turn autonomous discovery results into an immediate decision queue. Atlas now classifies each Radar candidate as **promote**, **research**, or **suppress** using the existing score, evidence, duplicate, and governance rules.

## What changed

- Added zero-cost automatic candidate triage after discovery ingestion.
- Added three action classes:
  - **Promote** — candidate is ready to move to Researching and a 30-day test blueprint.
  - **Research** — candidate needs a specific demand, market, or validation gap closed first.
  - **Suppress** — candidate is a likely duplicate or too weak to deserve near-term attention.
- Suppression is non-destructive: candidates remain in Radar and can be revisited.
- Atlas does **not** auto-promote, auto-dismiss, move anything to Testing/Active, or spend money.
- Added persisted `triage` metadata to discovered candidates.
- Added `GET /api/radar/autotriage` for current decision status.
- Added `POST /api/radar/autotriage/run` to re-evaluate and persist all current Radar decisions.
- Build 84 autonomous discovery now applies triage immediately to accepted candidates.
- Manual live discovery execution also applies the same triage policy.

## Configuration

```env
ATLAS_RADAR_AUTOTRIAGE=true
ATLAS_RADAR_AUTOTRIAGE_SUPPRESS_LOW_PRIORITY=true
ATLAS_RADAR_AUTOTRIAGE_SUPPRESS_DUPLICATES=true
```

Automatic triage is enabled by default because it is local, deterministic, and creates no provider/API cost. It changes priority metadata only; portfolio-changing actions remain deliberate.

## Governance guardrails

- Promotion to Researching is recommended, not executed automatically.
- Testing/Active/Scaled transitions remain under the established Atlas lifecycle rules.
- Low-priority suppression never deletes or dismisses a candidate.
- Duplicate suppression never overwrites an existing opportunity.
