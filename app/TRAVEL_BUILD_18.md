# Atlas Travel Build 18 — Pre-Departure Command Center

Build 18 adds a final departure-clearance layer between **Booked** and **Traveling**.

## What changed

- Added persistent `pre_departure` state to each trip.
- Added six last-mile departure checks:
  - airline / carrier check-in handled
  - bags packed and baggage rules checked
  - IDs / passports / required documents in hand
  - departure ride / parking / airport plan confirmed
  - arrival access and first-day plan ready
  - home / pets / mail / security plan handled
- Added document, packing, and departure-plan notes.
- Added a departure countdown from the trip start date.
- Added a 0–100 departure-readiness score combining:
  - Booked Trip Operations readiness (40%)
  - Build 18 departure checklist (35%)
  - payment clearance (15%)
  - flight + lodging confirmation evidence (10%)
- Planned payments due on/before departure are blockers; scheduled or paid items are not.
- Flight and lodging confirmation numbers are required for full departure clearance.
- `startTripTraveling()` now requires full Build 18 departure clearance.

## API

- `GET /api/travel/trips/:tripId/pre-departure`
- `PATCH /api/travel/trips/:tripId/pre-departure`

## UI

Added **Travel Build 18 — Pre-Departure Command Center** with countdown, readiness score, blocker list, last-mile checklist, and departure notes.

## Validation

- Full suite: 369/369 tests passing before final package validation.
