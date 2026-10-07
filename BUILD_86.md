# Build 86 — Radar Promotion Approval Gate

**Version:** 1.55.0

## Objective

Turn Build 85 promotion recommendations into a controlled approval workflow with a durable audit trail.

## What changed

- Added a promotion approval queue for Radar candidates triaged as **promote**.
- Added explicit **approve**, **defer**, and **reject** promotion-review decisions.
- Approval is the only Build 86 path that moves a recommended candidate into **Researching**.
- Deferred and rejected promotion reviews do not dismiss or delete the Radar candidate.
- Every promotion decision records timestamp, actor, note, Radar score, and triage action in candidate-level history.
- Approved opportunities retain the 30-day test blueprint and record the approval in their notes.
- Existing `/promote` compatibility remains available, but now also records an approval audit event.
- Radar UI shows the approval queue and replaces the ready-candidate promotion action with **Approve → Researching** and **Defer**.

## API

- `GET /api/radar/promotion-queue`
- `POST /api/radar/:id/promotion-review` with `{ "decision": "approve|defer|reject", "note": "..." }`

## Governance guardrails

- Atlas may recommend promotion but cannot approve it autonomously.
- Approval creates a **Researching** opportunity only; it does not enter Testing, Active, or Scaled.
- Rejection is a promotion decision, not deletion or dismissal.
- Existing duplicate and readiness checks still block approval unless the existing force override is deliberately used.
