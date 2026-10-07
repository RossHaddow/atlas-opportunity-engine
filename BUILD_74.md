# Build 74 — Radar Next-Action Recommendations

**Version:** 1.43.0

Build 74 turns Opportunity Radar from a scoring board into an active recommendation engine. Atlas now diagnoses what is missing from each candidate and tells the user what to do next before promotion.

## What changed

- Added `radarEvidenceGaps()`.
  - Diagnoses missing customer-demand proof.
  - Diagnoses missing external market validation.
  - Flags weak economics, slow speed to revenue, startup cost, ongoing effort, and automation gaps.
- Added `radarCandidateRecommendation()`.
  - Produces a candidate state, readiness flag, reason, next action, and evidence-gap list.
  - Recommendation states include:
    - validate demand
    - validate market
    - investigate
    - duplicate review
    - low priority
    - ready to test
- Added `radarRecommendationQueue()`.
  - Ranks the most important candidate action across the Radar pipeline.
  - Ready-to-advance candidates rise to the top.
  - Duplicate review can interrupt unnecessary research.
- `GET /api/radar` now returns:
  - enriched candidate recommendations
  - evidence gaps
  - a portfolio-level recommendation queue
- Dashboard Radar cards now display:
  - Atlas next action
  - why Atlas recommends it
  - Ready to advance state when validation is sufficient
- Radar header surfaces the next candidate that deserves attention.

## Recommendation guardrails

- High Radar Score alone is not enough to advance.
- Weak demand evidence causes a demand-validation recommendation even when economics look excellent.
- Customer interest without market proof produces a market-validation recommendation.
- Likely duplicates are reviewed before additional research.
- Ready to Test requires strong economics, sufficient weighted evidence, and no high-priority customer/market validation gaps.

## Verification

- Full regression suite: **214/214 passing**
- Runtime smoke test: passed
- SQLite: writable
- `/api/health`: version **1.43.0**
- High-score/weak-evidence smoke candidate correctly recommended demand validation.
- Strong validated candidate correctly returned `ready_to_test`.
- Recommendation queue correctly prioritized the validated candidate.
- Production deployment: not performed
