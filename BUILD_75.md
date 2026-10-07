# Build 75 — Candidate-to-Test Blueprint

**Version:** 1.44.0

Build 75 connects Opportunity Radar recommendations to Atlas's existing 30-day experiment discipline. Ready candidates now arrive in Researching with a concrete, bounded test blueprint instead of a blank opportunity record.

## What changed

- Added `radarTestBlueprint()`.
  - 30-day experiment objective.
  - minimum viable offer.
  - fastest likely sales channel.
  - evidence carried forward.
  - approved test budget.
  - launch target.
  - weekly hour cap.
  - success criteria.
  - first-week tasks.
  - early stop conditions.
- Test constraints adapt to Radar economics:
  - low-cost candidates default to the existing $25 Atlas test budget.
  - slower or costlier concepts receive explicit larger planning estimates rather than hidden assumptions.
  - faster-to-revenue candidates receive tighter launch targets.
  - lower-effort concepts receive smaller weekly hour caps.
- Added `GET /api/radar/:id/test-blueprint`.
- Radar cards display the candidate's proposed test envelope.
- Promotion now carries `radar_test_blueprint` into the new Researching opportunity.
- Promotion is guarded:
  - Ready candidates can promote normally.
  - Candidates with unresolved validation gaps return HTTP 409 instead of entering the portfolio prematurely.
  - API supports an explicit `force` override when the user intentionally wants to bypass readiness.
- Promoted opportunity notes include Radar score, evidence, budget, and launch target.

## Verification

- Full regression suite: **219/219 passing**
- Runtime smoke test: passed
- SQLite: writable
- `/api/health`: version **1.44.0**
- Ready candidate generated a 30-day / $25 / 7-day-launch blueprint and promoted to Researching with the blueprint intact.
- Weak-evidence candidate promotion correctly returned HTTP 409 with `validate_demand`.
- Production deployment: not performed
