# Build 77 — Radar Refresh Cadence

**Version:** 1.46.0

Build 77 prevents Opportunity Radar from becoming a static pile of old ideas. Atlas now assigns review intervals, identifies stale candidates, and maintains a refresh queue.

## What changed
- Added `radarReviewCadence()`.
  - Ready to Test: every 3 days.
  - Worth Investigating / Atlas Recommended: every 7 days.
  - New baseline candidates: every 14 days.
  - Low-priority candidates: every 30 days.
  - Dismissed / Promoted: no recurring review.
- Added `radarRefreshQueue()` for overdue candidates.
- Added `radarPortfolioRefresh()` for Radar-wide refresh status and next review.
- Added `GET /api/radar/refresh`.
- Added `POST /api/radar/:id/review`.
- `GET /api/radar` now exposes review cadence and refresh status.
- Radar cards show when each candidate is next due for review.
- Added **Reviewed** action to reset the candidate's evidence/recommendation review clock.

## Why it matters
Radar can now retain promising ideas without either forgetting them or constantly surfacing them. Strong candidates stay on a short leash; weak candidates are parked and revisited less often.

## Verification
- Full regression suite: **228/228 passing**
- Runtime smoke test: passed
- SQLite: writable
- `/api/health`: version **1.46.0**
- Ready candidate received a 3-day review cadence.
- Review endpoint persisted `last_reviewed_at` and reset the review clock.
- Production deployment: not performed
