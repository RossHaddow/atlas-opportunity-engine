# Atlas Build 39 — Intelligence Command Layer

Status: COMPLETE

Build 39 moves Atlas intelligence from an API payload into Ross's primary operating dashboard.

## What changed
- Version 1.8.0.
- Adds a prominent Top Focus card to the Daily Executive Briefing.
- Shows Atlas's 0–100 work-priority score, concrete recommendation, and top ranking reasons.
- Shows lifecycle status, Atlas score, and test health context when available.
- Adds a Priority Queue containing the next four intelligence-ranked opportunities.
- Clicking a Testing priority opens its Testing Workspace.
- Clicking a non-Testing priority opens the opportunity editor.
- Fixes the pre-existing Executive Briefing non-Testing click path, which referenced a nonexistent `openEdit()` function.
- Adds regression coverage proving the intelligence UI is mounted and wired to the Build 38 payload.
