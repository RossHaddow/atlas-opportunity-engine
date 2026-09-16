# Atlas Travel Build 8 — Trip Shortlist & Booking Decision

Build 8 turns optimized packages into a controlled booking decision workflow.

## Added
- Persistent package shortlist using deterministic package IDs.
- One separately locked preferred package that survives later package re-ranking.
- Automatic Researching/Dreaming → Planning transition when a package is shortlisted or locked.
- Five required booking-verification gates: flight quote, resort quote, combined availability, cancellation/change terms, and traveler details/documents.
- Ready-to-book state only when a preferred package exists and all required checks are complete.
- Guarded Planning → Booked action that refuses incomplete verification.
- Saved package assumptions for transfers, activities, and other costs.
- GET/PATCH `/api/travel/trips/:tripId/decision` APIs.
- POST `/api/travel/trips/:tripId/book` API.
- Package Optimizer shortlist/preferred controls.
- Final Shortlist & Booking Decision workspace with verification checklist.

## Validation
- Full automated regression suite: 330/330 tests passing.
- Live HTTP workflow: shortlist → Planning → preferred lock → booking blocked → 5/5 verification → Booked.
- Live test package: 88/100 Atlas Package Score, $4,400 total.
