# Atlas Build 67 — Daily Plan Sequence Learning

Version: **1.36.0**

Build 67 teaches Atlas whether **sequence position** and **work-type transitions** change Daily Work Plan follow-through in the current execution window.

## What changed

- Adds `sequenceEvidenceLevel()` with conservative evidence tiers:
  - Insufficient: <2 resolved outcomes
  - Provisional: 2–3
  - Established: 4–7
  - Strong: 8+
- Adds `dailyPlanSequenceLearning()` over a rolling 56-day window.
- Learns work-type performance by sequence position:
  - First
  - Middle
  - Last
- Learns repeated work-type transitions, such as Research → Review or Setup → Creation.
- Uses only resolved Daily Work Plan outcomes in the **current time-of-day window**.
- Position and transition signals do not affect planning until evidence is Established or Strong.
- Position fit contributes at most ±2; transition fit contributes at most ±1.
- Combined sequence influence is capped at **±3**.
- Adds `dailyPlanSequenceAdjustment()` to refine candidate ordering during Daily Work Plan construction.
- Projects first/middle/last placement while constructing the plan and evaluates the candidate work type against learned position/transition evidence.
- Exposes sequence learning through:
  - `daily_plan_sequence_learning` in Command Center
  - `sequence_learning` in Daily Work Plan
  - per-block `sequence_fit` and `sequence_adjustment`
- Dashboard now shows sequence-baseline/active status and per-block sequence adjustments.
- Does not modify Atlas Score, learned density, user time caps, or strategic recommendations.

## Verification

- `npm run check`: **178/178 tests passing**.
- Runtime smoke test: Atlas reports **v1.36.0** with writable SQLite.
- Clean-seed Daily Work Plan remains sequence-neutral until real position/transition evidence exists.
