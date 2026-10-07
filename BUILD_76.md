# Build 76 — Unified Money-Move Queue

**Version:** 1.45.0

Build 76 connects Opportunity Radar to the existing Atlas operating system. Radar is no longer a separate island: Atlas now ranks Radar work and active-portfolio work together.

## What changed
- Added `radarOperatingBrief()` with counts and queues for ready candidates, demand validation, market validation, duplicate review, and low-priority ideas.
- Added `atlasUnifiedNextMoves()`.
  - combines active portfolio attention with Radar recommendations
  - preserves urgent portfolio work above Radar work
  - ranks ready Radar candidates above ordinary non-urgent investigation
- Added `GET /api/radar/brief`.
- Added `GET /api/next-moves`.
- Dashboard adds **Atlas Priority Queue — Next Money Moves** above Opportunity Radar.
- Each move identifies whether it comes from Opportunity Radar or the Active Portfolio, its priority, recommended action, and reason.
- Radar changes refresh the unified queue immediately.

## Verification
- Full regression suite: **223/223 passing**
- Runtime smoke test: passed
- SQLite: writable
- `/api/health`: version **1.45.0**
- Radar operating brief correctly identified a ready candidate.
- Unified queue correctly surfaced that candidate as the next money move when the portfolio had no more urgent work.
- Production deployment: not performed
