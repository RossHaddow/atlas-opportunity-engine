# Atlas Travel Build 5 — Flight Research Engine

Build 5 adds destination-linked flight options and an explainable Flight Atlas Score.

## Added
- Flight option model with airports, airline, cabin, travel time, stops, fees, flexibility and provider metadata.
- Flight Atlas Score (0–100): price/value 30%, duration 20%, stops 20%, schedule 15%, fee burden 10%, flexibility 5%.
- Price-history snapshots for saved/provider quotes.
- GET/POST `/api/travel/trips/:tripId/flights` and PATCH/DELETE `/api/travel/trips/:tripId/flights/:flightId`.
- Destination-filtered flight comparison and leader/score-gap output.
- Browser Flight Research Engine workspace integrated with the selected trip/destination.
- Explicit saved-quote vs provider-verified live-quote labeling.

## Guardrail
A flight is only labeled live when `live_data` is explicitly supplied from verified/current provider research. Saved/manual quotes remain saved quotes.
