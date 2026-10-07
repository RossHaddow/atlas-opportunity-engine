# Atlas Build 55 — Effort Calibration

Version: **1.24.0**

## Purpose
Build 55 teaches Atlas to compare estimated focus time with actual recorded execution time so short action estimates become more realistic instead of staying fixed forever.

## What changed
- Added 30-day effort calibration from completed/deferred focus outcomes with both an estimate and a non-zero actual duration.
- Tracks calibration separately for `micro`, `resolution`, and `standard` action modes.
- Uses median actual/estimated ratios to reduce the effect of outliers.
- Ignores zero-minute, incomplete, invalid, and extreme (>480 minute) timing records.
- Requires at least 3 valid samples before changing an estimate.
- Evidence tiers: Insufficient (<3), Provisional (3-5), Established (6-11), Strong (12+).
- Bounds calibration factors between 0.5x and 2.5x and rounds adjusted timed actions to practical 5-minute increments.
- Micro-action estimates now calibrate automatically when enough local micro evidence exists.
- Friction-resolution estimates now calibrate automatically when enough local resolution evidence exists.
- Preserves the original estimate as `base_estimated_minutes` and exposes the evidence used as `effort_calibration`.
- Command Center exposes portfolio-level `effort_calibration` with signal, guidance, evidence depth, and per-mode timing baselines.
- Adaptive Action Learning UI now shows Effort Calibration status.

## Guardrails
Atlas does not recalibrate from a single unusual session. It also avoids learning from zero-duration outcomes or incomplete sessions. Changes only activate after the relevant action mode has at least three valid timed outcomes.

## Verification
- `npm run check`: **118/118 tests passing**.
- Runtime smoke test: health endpoint reports **v1.24.0**.
- SQLite persistence is writable.
- Clean seed data reports **Not enough timing data** rather than inventing a calibration.
- Clean seed Top Focus remains **Bar Operations Kit**.
