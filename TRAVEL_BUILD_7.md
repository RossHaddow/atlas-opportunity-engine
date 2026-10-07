# Atlas Travel Build 7 — Trip Package Optimizer

Build 7 combines destination, flight, and resort research into ranked complete-trip packages.

## Added
- Dynamic destination + flight + resort package generation.
- 0–100 Atlas Package Score.
- Package scoring weights: total-trip value 25%, destination fit 20%, flight quality 20%, resort quality 25%, simplicity 10%.
- Total package cost and budget delta.
- Optional airport-transfer, activity, and other-trip-cost allowances.
- Mixed/saved vs fully live pricing indicator.
- Warnings for over-budget packages, multi-stop flights, preference mismatches, and non-live pricing.
- Missing-component diagnostics for destinations without flights or resorts.
- GET `/api/travel/trips/:tripId/packages` API.
- Trip Package Optimizer workspace in the Atlas Travel UI.
- Fix: preserves explicit resort total-stay prices during re-normalization.

## Validation
- Full automated regression suite: 326/326 tests passing.
