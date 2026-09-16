# Atlas Travel Build 10 — Live Trip Command Center

Adds on-trip execution tools for Traveling trips: today timeline, next-up event, live expense logging, issue/change tracking, daily notes, confirmation count carry-forward, and guarded live-trip updates.

## API
- `GET /api/travel/trips/:id/live`
- `PATCH /api/travel/trips/:id/live`

## Guardrails
Live trip mutations are accepted only while the trip status is `Traveling`. Build 10 does not fabricate live travel-provider data; it operates on saved trip/reservation information and user-entered on-trip updates.
