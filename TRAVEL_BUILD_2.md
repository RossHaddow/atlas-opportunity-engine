# Atlas Travel — Build 2

## Destination Research Workspace

Build 2 turns the Travel scoring foundation into an interactive destination comparison workflow.

### Added
- Trip-scoped Destination Research Workspace in the Atlas dashboard.
- Candidate capture for estimated total cost, flight burden, weather, lodging fit, experience fit, simplicity and travel traits.
- Automatic Atlas Fit ranking after each candidate is added.
- Side-by-side comparison board with leader, score gap, budget delta, research completeness, strengths and warnings.
- Research brief helpers that identify the current leader, cautions and next research gaps.
- `GET /api/travel/trips/:tripId/compare` comparison API.
- `PATCH /api/travel/trips/:tripId/destinations/:destinationId` candidate update API.
- `DELETE /api/travel/trips/:tripId/destinations/:destinationId` candidate removal API.
- Tests covering comparison ranking, completeness, research briefing and UI/API mounting.

### Design note
Build 2 uses user-entered/researched values. Live airfare, hotel pricing, weather and travel-search providers are intentionally deferred to later Travel builds so the comparison model remains provider-independent.
