# Atlas Travel Build 16 — Decision & Booking Readiness Center

Travel Build 16 converts watchlist evidence and Travel Build 15 actions into an explicit booking recommendation for each watched scenario.

## Added

- Decision & Booking Readiness Center UI.
- `travelBookingReadinessCenter()` derived decision engine.
- `GET /api/travel/trips/:tripId/readiness`.
- Per-scenario readiness score from target-price status, live verification, quote freshness, trip-budget fit, and scenario quality.
- Explicit decisions: `book_now`, `verify_now`, `recheck_now`, `consider_now`, `wait`, and `paused`.
- Human-readable blockers and recommendations.
- Open Travel Build 15 actions linked into each readiness candidate.

## Guardrails

Atlas only emits `book_now` when the scenario target is hit on a fresh quote explicitly marked as live-backed. A target hit from a manual/saved quote becomes `verify_now`; stale or expired evidence becomes `recheck_now`. Final price, availability, itinerary, and terms still require review before purchase.

## Validation

- Full suite: 361/361 tests passed.
- Live HTTP workflow: $4,475 live-backed Jamaica quote against $4,500 target produced `book_now` with 99/100 readiness.

Package version: 1.75.0.
