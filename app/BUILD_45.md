# Atlas Build 45 — Adaptive Daily Capacity

Status: COMPLETE

Build 45 uses Atlas execution history to set a realistic daily workload instead of always assuming three meaningful moves.

## What changed

- Version bumped to 2.2.0.
- Adds `adaptiveCapacity()` to the Daily Focus engine.
- Daily capacity can now be 1, 2, or 3 meaningful moves.
- Atlas keeps the three-move default until at least five execution outcomes exist.
- Strong completion history keeps capacity at three.
- Mixed completion/friction history reduces capacity to two.
- High execution friction can reduce capacity to one.
- Recurring blockers and repeated deferrals influence capacity decisions.
- Today’s Plan now displays the current adaptive capacity and why Atlas selected it.
- Work outside the current capacity is deliberately held in the defer column instead of competing for attention.
- Execution Learning now exposes the adaptive-capacity decision and confidence level.
- Adds regression tests for learning mode, 1/2/3 move capacity, and Daily Focus enforcement.
- Production startup now uses `server-build45.js`.

## Current rules

Atlas needs at least five execution outcomes before adapting the default workload.

- Completion rate 75% or higher with no recurring friction: 3 moves.
- Completion rate 50–74%, or meaningful recurring friction: 2 moves.
- Completion rate below 50%, or recurring friction combined with weak completion: 1 move.

These rules are intentionally conservative. Build 45 is meant to protect focus, not punish a single bad day.

Build 45 is the first Atlas build where historical execution behavior directly changes tomorrow’s workload.
