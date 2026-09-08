# Atlas Build 47 — Opportunity-Aware Adaptive Strategy

Status: COMPLETE

Build 47 makes the Adaptive Strategy Controller opportunity-aware so execution learning from one opportunity does not automatically control every other opportunity.

## What changed
- Version 1.16.0.
- Adds an opportunity-specific adaptive strategy resolver on top of Build 46's portfolio controller.
- Each opportunity now gets its own rolling 14-day micro-vs-standard execution comparison.
- When an opportunity has enough comparative evidence, Atlas uses that opportunity's own adaptive policy.
- When local evidence is insufficient, Atlas falls back to the portfolio-wide adaptive policy from Build 46.
- Two opportunities can therefore use different execution packaging at the same time (for example, one may keep micro-actions while another pauses them).
- The underlying Atlas Score and strategic recommendation remain unchanged; the scoped strategy only controls how the next action is packaged.
- `/api/command-center` now exposes `adaptive_strategy_profiles` and each intelligence item exposes its resolved `adaptive_strategy` including scope.
- The Adaptive Action Learning panel now shows both the portfolio strategy and the Top Focus strategy, including whether it came from opportunity-specific evidence or portfolio fallback.

## Product intent
Build 46 correctly closed the adaptive learning loop, but it applied one learned policy across the entire portfolio. Build 47 prevents cross-opportunity contamination. Atlas now learns that a smaller action may help one kind of work while not helping another, and only falls back to portfolio behavior until the individual opportunity has enough evidence to stand on its own.

## Verification
- `npm run check` passes.
- 82/82 automated tests pass.
- Opportunity-specific evidence overrides the portfolio policy only after enough comparable local history exists.
- Insufficient local history cleanly falls back to the portfolio policy.
- Different opportunities can simultaneously resolve to different adaptive strategies.
- Existing Build 46 UI and API contracts remain backward-compatible.
