# Atlas Build 49 — Adaptive Strategy Stability Guardrails

Status: COMPLETE

Build 49 adds hysteresis and strategy memory to the opportunity-aware adaptive controller so established execution strategies do not flip because of a small short-term swing in the rolling evidence window.

## What changed
- Version 1.18.0.
- Adds explicit strategy snapshots to future `Start Focus` history events: applied adaptive strategy mode, scope, and evidence tier.
- Adds `lastAdaptiveStrategySnapshot()` so Atlas can compare the newest candidate policy with the last strategy actually used for execution.
- Adds `adaptiveStrategyGuardrail()` to protect Established and Strong opportunity-specific strategies from weak contradictory swings.
- A durable prior strategy now requires contradictory evidence of at least equal evidence depth before Atlas will consider changing it.
- Strategy reversals also require a stronger performance swing than the normal learning threshold:
  - switching to `use_micro` requires at least +30 percentage points of micro follow-through lift;
  - switching to `pause_micro` requires at least -30 points;
  - switching to `selective_micro` requires the comparison to settle within +/-10 points.
- Provisional strategies remain flexible while Atlas is still learning.
- The Top Focus Adaptive Action Learning panel now shows Strategy stability and explains whether the prior strategy is being held or a change has been accepted.
- Fixes strategy-context consistency so `Start Focus` and `/api/intelligence` use the same opportunity-aware adaptive policy shown in the Command Center instead of recalculating without it.

## Product intent
Build 48 made evidence depth visible, but visibility alone did not stop a rolling 14-day sample from changing an established strategy too easily. Build 49 adds the missing stability layer. Atlas can still learn and reverse course, but a durable strategy now requires durable contradictory evidence before it flips.

This preserves the underlying Atlas Score and strategic recommendation. The guardrail only stabilizes how Atlas packages work for execution.

## Verification
- `npm run check` passes.
- 91/91 automated tests pass.
- Established strategies are held through small contradictory swings.
- Stronger contradictory evidence can still reverse the strategy.
- Future focus starts persist the strategy actually applied.
- Command Center, Start Focus, and standalone intelligence use the same adaptive strategy context.
