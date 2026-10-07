# Build 90 — Executable Research Assist + Finding Review Gate

**Version:** 1.59.0

## Objective

Execute Build 89 targeted research through the configured OpenAI web-search provider while keeping a human approval boundary between provider output and Atlas evidence.

## What changed

- Research Assist briefs can now execute through the configured OpenAI Responses/web-search provider when `ATLAS_RESEARCH_ASSIST=true`.
- Research output is normalized into a maximum of five source-backed findings.
- Findings are stored as **pending review**, not evidence.
- Radar displays pending findings with **Accept as evidence** and **Reject finding** controls.
- Accepted findings pass through the existing Build 88 evidence-capture function, triggering immediate score/evidence/triage reassessment.
- Rejected findings remain part of the research-run audit trail but do not affect candidate evidence.
- External HTTP providers remain supported as a handoff path rather than being trusted as native evidence executors.

## API

- Existing `POST /api/radar/:id/research-assist` now accepts `{ "execute": true }`.
- `POST /api/radar/:id/research-findings/:findingId` accepts `{ "decision": "accept|reject" }`.

## Governance

Provider output is research, not truth. No finding becomes evidence without explicit acceptance. Accepted evidence can change Atlas's recommendation but cannot bypass the Build 86 promotion approval gate.
