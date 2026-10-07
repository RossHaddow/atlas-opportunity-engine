# Build 56 — Execution Capacity Fit

Version: 1.25.0

## Goal
Use Atlas's learned timing history to judge whether a recommended action fits the size of focus block the user actually completes.

## Added
- `focusCapacityProfile()` learns a recent 30-day execution-capacity profile from resolved timed focus sessions.
- Requires at least 3 valid timed outcomes before capacity judgments become active.
- Tracks typical focus-block minutes, upper recent block size, evidence tier, and guidance.
- `capacityFitForAction()` classifies timed recommendations as:
  - Fits typical capacity
  - Needs a larger block
  - Exceeds typical capacity
  - Capacity learning
  - No time estimate
- Capacity fit can modestly adjust near-term work priority without changing the underlying Atlas Score.
- Top Focus exposes capacity-fit guidance for timed recommendations.
- Adaptive Action Learning now includes an Execution Capacity card.
- Command Center exposes portfolio `capacity_profile`; intelligence items expose opportunity-specific `capacity_fit` and `capacity_profile`.

## Guardrails
- No capacity judgment before 3 timed resolved sessions.
- Invalid, zero-minute, and implausibly long sessions are excluded.
- Capacity changes near-term execution priority only; Atlas Score and strategic opportunity value remain unchanged.
- Oversized work is flagged for a dedicated block or split rather than silently rewritten.

## Verification
- Full check suite: 123/123 passing.
- Added Build 56 regression coverage for capacity learning, fit, oversized work, insufficient evidence, and Command Center/UI exposure.
