# Atlas Weird Things Tracker — Live Integration

This release integrates Weird Things Tracker Build 15 into Atlas.

## Included

- Persistent `weird_things_tracker` module state stored in the existing Atlas SQLite database.
- API routes for events, summary, patterns, intake, review, source ingestion, alerts, dashboard, and command-center data.
- Focused child workspace at `/weird-things.html`.
- A homepage link to the new workspace.

## Guardrails

- New reports begin in `needs_review`.
- Verification requires a reviewer, written rationale, and linked source.
- Cluster Watch is a prompt for investigation, never a causal claim.
- No external alerts or automatic feed ingestion are enabled by this release.

## Verification

- Existing Atlas test suite: passing.
- Weird Things Tracker Build 15 test suite: 14 files passing.
