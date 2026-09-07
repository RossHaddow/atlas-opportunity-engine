# Atlas Build 44 — Execution Learning

Status: COMPLETE

Build 44 teaches Atlas to learn from the execution feedback introduced in Build 43.

## What changed

- Version bumped to 2.1.0.
- Daily Focus actions now retain a rolling execution history (up to 90 events per opportunity).
- Atlas analyzes the latest 30 execution events per opportunity.
- Detects recurring blockers, repeated deferrals, general execution friction, and reliable completion patterns.
- Adds portfolio-level completion-rate calculation from execution outcomes.
- Adds an `Atlas Execution Learning` summary directly inside Today’s Plan.
- Adds per-move pattern badges when Atlas sees meaningful behavior.
- Adds `GET /api/daily-focus/learning` for execution-learning data.
- Build 43’s daily state behavior remains intact: Completed/Deferred leave today’s active plan; Blocked remains visible.
- Adds regression coverage for blocker detection, deferral detection, completion rate, recommendations, and Daily Focus integration.
- Production startup now uses `server-build44.js`.

## Product behavior

Atlas now distinguishes between what it recommends and what actually happens.

Over repeated use it can identify work that is consistently blocked or deferred and tell Ross when a top-three slot is being wasted by an unresolved dependency or poorly scoped task. It also tracks completion behavior so the daily three-move capacity can eventually be tuned using evidence instead of guesswork.

Build 44 is the first learning loop in Atlas based on Ross's actual execution behavior.
