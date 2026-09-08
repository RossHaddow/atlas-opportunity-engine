# Atlas Build 46 — Adaptive Strategy Controller

Status: COMPLETE

Build 46 closes the loop on Build 45 by allowing Atlas's measured adaptive-action results to control how future recommendations are packaged.

## What changed
- Version 1.15.0.
- Adds an Adaptive Strategy Controller derived from the rolling 14-day Adaptive Action Learning signal.
- When micro-actions are helping, Atlas continues using micro-actions whenever execution friction appears.
- When there is no clear micro-action advantage, Atlas becomes selective and only shrinks work under strong repeated-deferral friction.
- When micro-actions are not helping, Atlas pauses micro-actions and preserves the strategic recommendation instead of shrinking it again.
- When comparative history is still insufficient, Atlas keeps a conservative learning policy while collecting more evidence.
- The strategy changes recommendation packaging only; it does not modify Atlas Score or the underlying strategic recommendation.
- The Executive Briefing now shows the current adaptive strategy and why Atlas is using it.
- `/api/command-center` exposes `adaptive_action_policy` and applies it to the ranked intelligence queue and Top Focus.

## Product intent
Build 45 learned whether smaller actions work. Build 46 makes Atlas act on that learning. This prevents a failure mode where Atlas keeps generating 10–15 minute micro-actions even after the user's own execution history shows that smaller tasks are not solving the problem. In that case Atlas now preserves the real strategic action and shifts the diagnosis toward timing, task selection, or opportunity priority.

## Verification
- `npm run check` passes.
- 77/77 automated tests pass.
- Adaptive strategy is applied at the portfolio intelligence layer.
- Core Atlas Scores remain untouched.
- Existing direct adaptive-action behavior remains backward-compatible when no portfolio policy is supplied.
