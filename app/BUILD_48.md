# Atlas Build 48 — Adaptive Strategy Evidence

Status: COMPLETE

Build 48 adds explicit evidence depth to the opportunity-aware adaptive strategy introduced in Build 47, so Atlas can distinguish an early local signal from a durable execution pattern.

## What changed
- Version 1.17.0.
- Adds `adaptiveStrategyEvidence()` to classify adaptive evidence without inventing a pseudo-statistical confidence percentage.
- Evidence tiers are based on balanced resolved outcomes in both micro and standard action groups:
  - Insufficient: fewer than 2 resolved outcomes in either comparison group.
  - Provisional: at least 2 resolved outcomes in each group.
  - Established: at least 4 resolved outcomes in each group.
  - Strong: at least 8 resolved outcomes in each group.
- Reports exact resolved counts, the current target per action mode, and how many additional micro/standard outcomes are needed for the next durability tier.
- Opportunity-specific strategies now expose both local evidence depth and portfolio evidence depth.
- `/api/command-center` exposes `adaptive_strategy_evidence` plus evidence details inside each `adaptive_strategy_profile` and Top Focus strategy.
- The Adaptive Action Learning panel now shows the Top Focus strategy evidence tier and sample depth.

## Product intent
Build 47 correctly made adaptive strategy local to each opportunity, but a strategy based on only a couple of outcomes should not look as durable as one backed by a deeper execution history. Build 48 makes that distinction explicit while preserving Build 47 behavior: local evidence can still guide execution once comparative history exists, but Atlas clearly marks early conclusions as provisional and shows what evidence is still needed.

## Verification
- `npm run check` passes.
- 86/86 automated tests pass.
- Evidence tiers are deterministic and count-based rather than fake precision.
- Opportunity-specific and portfolio fallback strategies both expose evidence depth.
- Existing Build 47 strategy behavior and API/UI contracts remain compatible.
