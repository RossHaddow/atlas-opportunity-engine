# Build 87 — Radar Research Action Queue

**Version:** 1.56.0

## Objective

Turn Build 85/86 RESEARCH triage into a concrete, prioritized validation workflow without weakening the promotion approval gate.

## What changed

- Every active Radar candidate triaged as **research** receives one concrete validation task derived from its highest-priority evidence gap.
- Research tasks are prioritized **High**, **Medium**, or **Low** and tracked as **Pending**, **Deferred**, or **Completed**.
- Added a research action queue that ranks pending work before deferred work, then by evidence-gap priority and Radar Score.
- Completing a task records an audit event but does **not** invent evidence, change the Radar stage, or promote the candidate.
- Deferring a task preserves it for later. Reopening is supported by the API.
- Candidate-level research action history records decision, timestamp, actor, note, task, and priority.
- Radar UI now displays each research task, its priority/state, and **Complete research task** / **Defer task** controls.
- Build 86 explicit promotion approval remains authoritative.

## API

- `GET /api/radar/research-queue`
- `POST /api/radar/:id/research-action` with `{ "decision": "complete|defer|reopen", "note": "..." }`

## Governance guardrails

- Task completion means the work was performed; it is not evidence by itself.
- Evidence must still be added through the normal Radar candidate workflow and then re-evaluated.
- Research actions cannot move a candidate into Researching, Testing, Active, or Scaled.
- Promotion-ready candidates still require the Build 86 explicit approval gate.
