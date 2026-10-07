# Atlas Travel — Build 1: Travel Core & Decision Engine

**Atlas version:** 1.60.0  
**Baseline:** Atlas Build 90 (v1.59.0)

## Objective

Add a durable Travel domain to Atlas so trips can be tracked from idea through completion and destination options can be compared with an explainable Atlas Fit score.

## Travel lifecycle

- Dreaming
- Researching
- Planning
- Booked
- Traveling
- Completed

## Core records

Each trip can store:

- trip identity, purpose, travelers, origin airport, dates, and notes
- target / estimated / booked / actual budget
- destination candidates
- lodging
- transportation
- activities
- reservations
- post-trip review

Travel preferences persist separately and include home airport, default party size, preferred trip length, flight / layover tolerances, priority weights, trip-style preferences, avoided destinations, and notes.

## Decision engine

Destination candidates receive an explainable 0–100 Atlas Fit score. Build 1 weighs:

- Budget fit — 25%
- Travel time — 15%
- Weather — 15%
- Lodging fit — 15%
- Experience fit — 15%
- Simplicity — 10%
- Preference match — 5%

Weights are saved in Travel preferences and can be changed later without rebuilding the engine. Scores retain component values, normalized weights, and warnings so recommendations can be explained rather than treated as a black box.

An avoided destination is capped at 40/100 and explicitly flagged. Budget overruns, excessive flight time, and excessive layovers also generate warnings.

## Persistence

Travel state is stored in the existing SQLite `atlas_state` store under the `travel` key. It is initialized automatically for existing Atlas installations and survives restarts without changing the existing opportunity, Radar, or discovery records.

## API

- `GET /api/travel` — complete Travel state, lifecycle statuses, and summary
- `PATCH /api/travel/preferences` — update persistent Travel preferences
- `POST /api/travel/score` — score a destination candidate without saving it
- `POST /api/travel/trips` — create a trip
- `PATCH /api/travel/trips/:id` — update a trip
- `POST /api/travel/trips/:id/destinations` — add and score a destination candidate

## UI

The main Atlas dashboard now includes **Atlas Travel — Trip Command Center** with:

- active / total trip summary
- status counts
- create-trip form
- core travel preference controls
- trip cards
- ranked destination candidates with Atlas Fit score, cost, flight time, and warnings

## Guardrails

Build 1 ranks and explains; it does not book, purchase, or automatically commit to travel. External live pricing and travel-provider integrations are intentionally deferred to later Travel builds.

## Verification

- Existing Atlas regression suite passes.
- Travel lifecycle, preference normalization, decision scoring, avoid-list behavior, candidate normalization, summary logic, UI mount, persistence, and API behavior are covered by tests/checks.
