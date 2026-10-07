# Build 88 — Radar Evidence Capture + Immediate Reassessment

**Version:** 1.57.0

## Objective

Close the loop between Build 87 research tasks and Atlas triage by giving Radar a first-class way to record real validation evidence and immediately reassess the candidate.

## What changed

- Added candidate-level evidence capture from the Radar UI.
- Evidence records include text, evidence type, quality, and optional source/URL.
- Atlas immediately recalculates evidence points, evidence strength, Radar Score, duplicate context, triage, and the next research gap after evidence is recorded.
- Added an evidence audit history that records who added the evidence, when it was added, the linked research gap/task, and the before/after assessment.
- Exact duplicate evidence records are rejected.
- Added Build 88 evidence-capture status to the Radar controller.

## API

- `GET /api/radar/evidence-capture`
- `POST /api/radar/:id/evidence`

Example payload:

```json
{
  "text": "Three target customers requested this workflow.",
  "type": "direct_customer_request",
  "quality": "High",
  "source": "customer interviews"
}
```

## Governance guardrails

- Evidence must be an actual observed fact or signal; completing research alone is not evidence.
- Adding evidence can improve Atlas's recommendation, but it never promotes a candidate automatically.
- Build 86 explicit promotion approval remains authoritative.
- Testing, Active, and Scaled transitions remain governed by the existing portfolio lifecycle rules.
