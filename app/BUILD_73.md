# Build 73 — Radar Evidence Quality & Duplicate Detection

**Version:** 1.42.0

Build 73 hardens the Opportunity Radar so weak evidence cannot artificially advance a candidate and duplicate ideas do not quietly accumulate across Radar and the active portfolio.

## What changed

- Added structured Radar evidence records with:
  - evidence text
  - evidence type
  - evidence quality
  - source
- Added `radarEvidenceStrength()`.
  - Higher-value signals such as direct customer requests, real sales, competitor sales, marketplace activity, and search activity carry more weight than assumptions.
  - Evidence quality (Low / Medium / High) modifies that weight.
  - Atlas summarizes evidence as None, Weak, Provisional, Established, or Strong.
- Radar stage eligibility now requires evidence strength, not merely evidence count.
  - Ready to Test still requires Radar Score >=80, but now also requires at least two evidence records and >=4 weighted evidence points.
  - Atlas Recommended requires Radar Score >=72 plus at least one record and >=2 evidence points.
  - Weak assumptions alone cannot advance a high-scoring candidate beyond Worth Investigating.
- Added duplicate detection across:
  - existing Radar candidates
  - existing Opportunity Engine portfolio
- Added token-based candidate similarity and duplicate classifications:
  - Likely duplicate
  - Possible duplicate
- Candidate creation/update returns a conflict when a likely duplicate exists unless an explicit duplicate override is supplied.
- Radar cards now show evidence strength and duplicate warnings.
- Radar entry UI now captures evidence type and quality.

## Stability guardrails

- Duplicate detection ignores generic words such as "digital", "product", "template", "bundle", and "service" so matches are driven more by the actual opportunity concept.
- Possible duplicates are surfaced but not blocked.
- Likely duplicates are blocked by default but can still be intentionally overridden through the API.
- Existing Build 72 string evidence remains backward compatible and is normalized as Medium-quality general signal evidence.

## Verification

- Full regression suite: **208/208 passing**
- Runtime smoke test: passed
- SQLite: writable
- `/api/health`: version **1.42.0**
- Strong evidence candidate correctly reached Ready to Test.
- Near-identical second candidate correctly returned HTTP 409 with `Likely duplicate`.
- Duplicate candidate was not added to Radar.
- Production deployment: not performed
