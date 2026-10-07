# Atlas Travel Build 13 — Trip Scenario Planner

Build 13 adds persistent what-if scenario planning to the Travel module.

## Added
- Persistent trip scenarios stored on each trip.
- Scenario inputs for destination, budget, cost components, nights, flight burden, lodging quality, and notes.
- 0–100 Atlas Scenario Score balancing budget/value, destination fit, travel burden, lodging quality, and simplicity.
- Ranked scenario comparison with leader, score gap, best-cost, and fastest-travel markers.
- Budget delta and scenario-specific warnings.
- Scenario create, read/compare, update, and delete APIs.
- Travel UI workspace for adding and comparing scenarios.

## Guardrail
Scenario results are planning assumptions, not live availability or bookable quotes. Live flights, lodging, fees, and inventory still require verification through Atlas live-research providers before booking.
