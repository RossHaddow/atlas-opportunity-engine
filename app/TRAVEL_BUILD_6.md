# Atlas Travel Build 6 — Hotel / Resort Research Engine

Build 6 adds destination-linked hotel and resort research to Atlas Travel.

## Added
- Resort option persistence on each trip
- Total-stay pricing with nightly rate, taxes, resort fees, and other fees
- All-inclusive, adults-only, and relaxation-fit attributes
- Beach, pool, food, bar, room, and location quality scores
- Review score and review-volume signals
- Restaurant/bar/pool counts and room category metadata
- Provider/source, live quote flag, capture time, and availability fields
- 0–100 Atlas Resort Score with explainable components and warnings
- Destination-filtered resort comparison API and UI
- Create/update/delete resort endpoints

## Resort score weights
- Value: 25%
- Preference fit: 20%
- Reviews: 15%
- Beach: 10%
- Food + bars: 10%
- Room: 8%
- Pools: 5%
- Location: 5%
- All-inclusive value: 2%

## Guardrails
Saved manually entered pricing is not labeled live unless live_data is explicitly supplied. Source metadata is preserved for later provider integrations.
