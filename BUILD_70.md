# Build 70 — Adaptive Work-Block Sizing

**Version:** 1.39.0

Build 70 teaches Atlas whether short, standard, or long Daily Work Plan blocks execute better at different depths of the plan, then lets that evidence gently tune the working block size.

## What changed

- Added `blockSizeBand()` with three practical duration bands:
  - Short: 10–20 minutes
  - Standard: 25–35 minutes
  - Long: 40+ minutes
- Added `dailyPlanBlockSizeLearning()`.
  - Learns separately for early blocks (positions 1–2) and deep blocks (position 3+).
  - Uses only resolved Daily Work Plan outcomes from the current time window.
  - Requires at least Established evidence (4 resolved outcomes) in two comparable size bands.
  - Requires at least a 15-point follow-through advantage before a preferred size becomes actionable.
- Added `dailyPlanBlockSizeController()`.
  - Uses the existing capacity-derived normal block as the baseline.
  - Can move the block target by no more than 15 minutes at a time toward the evidence-backed preferred size.
  - Never changes Atlas Score, plan density, plan-depth protection, or the user's hard time cap.
- Daily Work Plan now records the block-size depth, target minutes, and source for each generated block.
- Command Center exposes block-size learning and early/deep controller state.
- Dashboard displays block-size learning and active early/deep targets.

## Stability guardrails

Atlas stays neutral when only one duration band has enough evidence. It does not assume that shorter or longer blocks are better simply because one band has been used more often. Comparative evidence is required before the controller can act.

## Verification

- Full regression suite: **193/193 passing**
- Runtime smoke test: passed
- SQLite: writable
- `/api/health`: version **1.39.0**
- Clean-data behavior: early and deep targets remain at the 30-minute baseline and block-size learning remains in baseline-forming mode.
