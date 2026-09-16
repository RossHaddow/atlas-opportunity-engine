# Build 72 — Opportunity Radar Foundation

**Version:** 1.41.0

Build 72 pivots Atlas back toward its core money-making mission by adding a separate candidate-discovery funnel before ideas enter the active Opportunity Engine.

## What changed

- Added persistent `radar_candidates` state alongside the existing opportunity portfolio.
  - Existing opportunity data remains unchanged.
  - Radar candidates live separately until explicitly promoted.
- Added an Atlas-specific Radar Score using:
  - income potential
  - speed to revenue
  - low startup cost
  - low ongoing effort
  - scalability
  - automation potential
  - Atlas fit
  - confidence
- Added evidence-aware candidate stages:
  - New
  - Worth Investigating
  - Atlas Recommended
  - Ready to Test
  - Dismissed
  - Promoted
- Added automatic stage recommendations from score + evidence.
- Added Opportunity Radar API:
  - `GET /api/radar`
  - `POST /api/radar`
  - `PATCH /api/radar/:id`
  - `POST /api/radar/:id/promote`
- Promotion creates a normal `Researching` opportunity without retyping the idea.
  - carries source/evidence into opportunity notes
  - preserves a `radar_origin_id`
  - maps Radar fit signals into the existing opportunity fields
- Added Dashboard Candidate Pipeline:
  - add candidates manually
  - view Radar Score and stage
  - see evidence count and source
  - dismiss weak ideas
  - promote worthwhile candidates into Researching

## Radar Score

The weighted score is intentionally different from Atlas Score. Radar Score is designed for pre-portfolio triage and emphasizes economics, speed, scalability, automation, low effort/cost, and fit.

Weights:
- Income potential: 18%
- Speed to revenue: 14%
- Low startup cost: 12%
- Low ongoing effort: 12%
- Scalability: 14%
- Automation potential: 12%
- Atlas fit: 12%
- Confidence: 6%

## Stage guardrails

- Ready to Test requires Radar Score >=80 and at least 2 evidence items.
- Atlas Recommended requires score >=72 and at least 1 evidence item.
- Worth Investigating begins at score >=60.
- Lower-scoring candidates remain New.
- Manual valid stages can still be preserved when the user intentionally overrides the automatic stage.

## Verification

- Full regression suite: **203/203 passing**
- Runtime smoke test: passed
- SQLite: writable
- `/api/health`: version **1.41.0**
- Radar persistence: passed
- Candidate scoring/staging: passed
- Candidate promotion to Researching: passed
- Production deployment: not performed
