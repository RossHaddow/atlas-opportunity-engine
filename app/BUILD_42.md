# Atlas Build 42 — Today’s Plan Dashboard

Status: COMPLETE

Build 42 makes Build 41’s Daily Focus Plan visible and usable from the Atlas dashboard.

## What changed

- Version bumped to 1.9.0.
- Adds a top-level `Today’s Plan` dashboard panel.
- Shows one primary objective, up to two supporting moves, and deliberately deferred work.
- Displays the Daily Focus capacity rule and stop rule directly in the UI.
- Shows current queue size and urgent-work count.
- Daily Focus items can route into the existing Atlas command-center/open-work flow.
- Adds responsive styling for desktop and smaller screens.
- Adds frontend regression coverage to confirm the panel, assets, endpoint usage, and core plan fields stay wired together.
- Extends `npm run check` to syntax-check the new dashboard client.

## Product behavior

Build 41 gave Atlas a concise operating plan through the API. Build 42 puts that plan at the top of the working dashboard so Ross does not have to interpret the full portfolio before deciding what to do.

The operating sequence is now:

1. Open Atlas.
2. Read the primary objective.
3. Work the supporting moves only after the primary objective is completed, blocked, or deliberately deferred.
4. Leave lower-priority work in the defer column instead of allowing it to expand the day.

This preserves the full Executive Briefing and Opportunity Engine underneath the focused operating layer.
