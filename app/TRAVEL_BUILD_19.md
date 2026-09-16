# Atlas Travel Build 19 — Live Trip Resilience Center

Build 19 extends the Traveling phase with a disruption and recovery workspace.

## What changed

- Adds persistent `trip_resilience` state to every trip.
- Captures disruptions with type, severity, status, provider, confirmation number, original plan, current situation, recovery plan, source, and notes.
- Prioritizes the most urgent open disruption and provides deterministic recovery guidance.
- Adds emergency/recovery contacts and durable recovery notes.
- Keeps resolved disruptions in the trip record rather than deleting the history.
- Enforces Traveling-only resilience edits.
- Requires a source before a disruption can be marked live-backed.
- Adds `GET/PATCH /api/travel/trips/:tripId/resilience`.
- Adds the Live Trip Resilience Center UI with resolve/remove actions.

## Stability states

- `stable` — no active disruptions
- `monitor` — active low/medium disruption
- `at_risk` — active high-severity disruption
- `critical` — active critical disruption

## Safety / truthfulness guardrail

Atlas does not claim live disruption data unless the record is explicitly marked `live_data: true` and includes a source. User-entered disruptions remain user-recorded.

## Validation

Full Atlas suite: 374/374 passing.
