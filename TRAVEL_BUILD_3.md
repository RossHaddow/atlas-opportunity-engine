# Atlas Travel Build 3 — Automated Destination Research

Build 3 adds an automated destination ideation layer on top of the Travel comparison workspace.

## Added
- Seed destination research catalog and deterministic research engine.
- Trip-aware planning estimates using traveler count, trip length, target budget, origin, dates, and saved preferences.
- Seasonal weather adjustment for broad planning.
- Automatic Atlas Fit scoring and ranking before candidates enter the comparison board.
- `POST /api/travel/trips/:id/research` endpoint.
- Generate Candidates controls in the Travel UI.
- Generated candidates are explicitly labeled `Atlas seed research` / `seed_estimate`.
- Generated research records confidence, assumptions, source, timestamp, and a warning that prices/availability are not live.
- Dreaming trips automatically move to Researching when automated candidates are added.

## Guardrail
Build 3 does not fabricate current airfare, hotel availability, or weather. Cost and travel values are planning estimates from the internal seed catalog. Future builds can replace/enrich these through live providers while retaining the same scoring/comparison contracts.
