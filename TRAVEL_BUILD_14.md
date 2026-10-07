# Atlas Travel Build 14 — Travel Watchlist & Recheck Engine

Build 14 turns scenario planning into an ongoing decision watch. A trip can now preserve watched scenarios, target totals, quote observations, price movement, quote freshness, source provenance, pause/resume state, and target-hit status.

## What changed

- Persistent scenario watchlist attached to each trip.
- Target total per watched scenario.
- Up to 30 saved recheck observations per watch item.
- Price change and percentage movement versus the prior check.
- Target-hit detection when the observed total reaches or beats the target.
- Freshness logic: a watch is recheck-due when it has never been checked, the latest observation is older than 24 hours, or the observation has expired.
- Source and `live_data` provenance. A quote cannot be stored as live without a source.
- Pause/resume controls.
- Watchlist REST API for create, read, update, delete, and recheck observations.
- Browser workspace for adding watches, recording rechecks, seeing target delta, freshness, price direction, and source type.

## Guardrail

Atlas does not fetch or fabricate live prices in this build. Recheck status describes the freshness of saved observations. A record is labeled live only when a recheck is explicitly recorded as coming from a live provider/source.
