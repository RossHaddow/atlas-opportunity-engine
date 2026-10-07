# Build 89 — Targeted Radar Research Assist

**Version:** 1.58.0

## Objective

Turn Build 87 evidence-gap tasks into provider-ready research briefs without weakening Build 88's requirement that only concrete, reviewed findings become evidence.

## What changed

- Added a Research Assist queue derived from pending/deferred Radar research actions.
- Each research job targets the candidate's current highest-priority evidence gap.
- Customer-demand gaps route to community research; market-validation gaps route to marketplace research; other gaps route to current-web/search research.
- Jobs carry the candidate, task, query, expected evidence types, adapter instructions, and the exact evidence intake endpoint.
- Added a Radar UI control to prepare the research brief for a candidate.
- Research Assist is opt-in and reports whether the configured discovery provider is executable.
- Provider credentials are never included in research jobs or API status.

## API

- `GET /api/radar/research-assist`
- `POST /api/radar/:id/research-assist`

## Configuration

`ATLAS_RESEARCH_ASSIST=false` by default.

## Governance guardrails

- Research Assist prepares targeted research work; it does not declare findings true.
- No research result is automatically written as evidence.
- A concrete finding must still enter through Build 88 evidence capture.
- Evidence reassessment can recommend promotion but cannot bypass Build 86 explicit approval.
