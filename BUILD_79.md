# Build 79 — Discovery Source Controller

**Version:** 1.48.0

Build 79 teaches Atlas where to look next for new money-making opportunities. It adds a discovery-source controller that balances source quality, freshness, and exploration needs so future live discovery adapters can run in a deliberate order instead of searching everything equally.

## What changed

- Added default discovery source profiles for:
  - Marketplace Demand
  - Search & Trend Signals
  - Community Pain Points
  - Local Opportunity Scan
  - AI & Automation Opportunities
- Added `radarDiscoveryCadenceForSource()`.
  - Explore: new or under-sampled sources
  - Exploit: proven high-yield sources
  - Maintain: useful established sources
  - Probe: mixed-quality sources
  - Hold: weak sources
- Discovery cadence automatically adjusts:
  - Exploit: every 3 days
  - Explore/Maintain: every 7 days
  - Probe: every 14 days
  - Hold: every 30 days
- Added `radarDiscoverySourceController()`.
  - source yield
  - source freshness
  - exploration boost for under-sampled sources
  - overdue-search boost
  - mode-specific priority
  - next-run timestamp
  - due status
  - recommended next discovery source
- Added `GET /api/radar/discovery-plan`.
- `GET /api/radar` now exposes the complete discovery plan.
- Dashboard now shows a **Discovery Controller** with:
  - next source to search
  - operating mode
  - source priority
  - number of sources currently due

## Why it matters

Build 78 gave Atlas a safe intake pipe. Build 79 gives it a search strategy.

Once live source adapters are connected, Atlas will already know whether it should explore a new source, exploit a proven one, maintain a useful one, probe a mixed source, or largely stop wasting time on a weak source.

This also preserves discovery diversity: brand-new sources receive an exploration boost so Atlas does not prematurely overfit to the first source that happens to perform well.

## Verification

- Full regression suite: **240/240 passing**
- Runtime smoke test: passed
- SQLite: writable
- `/api/health`: version **1.48.0**
- With no history, all five source families correctly entered Explore mode.
- After three marketplace candidates were ingested, Marketplace Demand moved to a lower-frequency Probe cycle based on observed yield rather than remaining blindly prioritized.
- Atlas correctly shifted the next discovery recommendation to an under-sampled source.
- Production deployment: not performed
