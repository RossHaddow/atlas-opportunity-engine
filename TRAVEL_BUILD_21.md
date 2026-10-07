# Atlas Travel Build 21 — Trip Archive & Rebook Blueprint

Build 21 turns a completed trip into a clean Planning-stage rebook starter. It preserves the source destination, party size, origin airport, tested budget, and optional review takeaways while intentionally excluding bookings, payments, confirmations, and dated reservations.

The archive blueprint is available only after a trip reaches `Completed`; Atlas never treats an unfinished trip as reusable history. The UI can create the new trip directly from a completed trip, and the API exposes `GET`/`POST /api/travel/trips/:tripId/rebook`.
