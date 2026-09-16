# Atlas Travel Build 15 — Travel Alerts & Action Queue

Version: 1.74.0

Build 15 converts Travel Watchlist evidence into a prioritized decision queue.

## Added

- `travel_actions` persistent acknowledgement/snooze state on each trip.
- `travelActionQueue()` derives actionable items from saved watchlist evidence.
- Priorities: urgent, high, medium, low.
- Action types:
  - target price hit
  - live-price verification needed
  - meaningful price drop (3%+)
  - quote recheck due
  - meaningful price worsening (5%+)
- Deterministic action IDs (`watchId:type`) so acknowledgement survives refreshes while the underlying condition exists.
- Acknowledge/reopen controls.
- 24-hour snooze support.
- `next_action` identifies the highest-priority open item.
- Live-data guardrail: derived actions never claim a quote is live unless the underlying saved observation was explicitly recorded as live.

## API

- `GET /api/travel/trips/:tripId/actions`
- `PATCH /api/travel/trips/:tripId/actions/:actionId`

PATCH accepts:

- `acknowledged`
- `acknowledged_at`
- `snoozed_until`

## UI

Added **Travel Alerts & Action Queue** with:

- open / urgent / high counts
- dedicated "What deserves attention now?" card
- prioritized queue
- evidence/source labels
- acknowledge/reopen
- snooze 24h

## Validation

- Full automated suite: 357/357 passing.
- Live server workflow verified target-hit generation, manual-quote verification guardrail, deterministic action IDs, persistence, and acknowledgement behavior.
