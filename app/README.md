# Atlas Opportunity Engine

Recovered Opportunity Engine with Builds 1 through 10 completed.

## Run on Windows

1. Extract the ZIP.
2. Open the extracted `atlas-recovered` folder.
3. Click the File Explorer address bar, type `powershell`, and press Enter.
4. Run `npm start`.
5. Open http://localhost:3000.

No `npm install` is required. The project uses Node.js built-in modules only.

## Build 1

- Paused appears in status selectors, filters, and status counts.
- Entering Paused records the timestamp and creates a review date 30 days later.
- Paused cards display the review date, remaining days, and overdue state.
- Leaving Paused clears the paused review fields.
- API status validation includes Paused.

## Build 2

- Every Testing opportunity has an interactive Testing Workspace.
- Tracks demand evidence, the exact offer, sales channel, dates, budget, launch tasks, hours, revenue, expenses, customer response, and notes.
- A start date automatically proposes an end date 30 days later when the end date is blank.
- Setup progress and missing required information appear directly on Testing cards.
- Spending above the standard $25 limit shows an approval warning until Ross's approval is recorded.
- Experiment revenue and expenses update the opportunity's actual revenue and cash profit.

## Build 3

- Adds four structured weekly checkpoint records to every 30-day experiment.
- Tracks weekly views, visits, favorites, orders, revenue, expenses, hours, customer questions, feedback, problems, changes, and notes.
- Each checkpoint records a Continue, Adjust, or Recommend Early Termination decision.
- Weekly revenue, expenses, and hours automatically roll up into experiment and portfolio totals.
- Testing cards show completed checkpoint count, the next checkpoint date, and overdue warnings.

## Build 4

- Calculates cash profit and labor-adjusted profit using the approved $25 hourly labor value.
- Determines when an experiment is ready for its final decision.
- Recommends Active, Revise and Retest, Pause, or Kill with a written rationale.
- A second failed test normally triggers a Kill recommendation.
- Records whether the opportunity received a fair test.
- Requires a documented reason when Ross overrides Atlas's recommendation.
- Finalizing applies the correct status, preserves experiment history, and displays the final result on the opportunity card.
- Revise and Retest archives the completed test and creates a clean new 30-day experiment cycle.

## Build 5

- Adds a Needs Attention queue for incomplete setups, overdue checkpoints, ready decisions, and early-termination reviews.
- Gives every opportunity a clear next action and relevant date.
- Adds portfolio search and sorting by next action, score, profit, status, or name.
- Restores full opportunity editing without disturbing experiment history.
- Prevents Testing opportunities from bypassing the Day-30 decision workflow.
- Requires positive labor-adjusted profit before an Active opportunity can move to Scaled.
- Improves responsive dashboard and card layout for faster daily use.


## Build 6

- Adds a Live Product Tests dashboard for the full 30-day Etsy testing portfolio.
- Rolls up visits, favorites, orders, conversion rate, test revenue, expenses, and cash profit across all Testing opportunities.
- Shows each live product's days remaining, next checkpoint, metrics, and current Atlas next action.
- Adds `/api/portfolio-summary` for a reusable portfolio rollup.
- Adds Product 003 and Product 004 to the live Testing portfolio using their current Etsy launch state.
- Keeps the existing Testing Workspace as the place to record weekly metrics; the new dashboard updates automatically from those checkpoints.


## Build 7

- Adds automated 0-100 health scoring for every live 30-day test.
- Health uses real test signals: visits, favorites, orders, conversion, cash profit, elapsed test time, budget warnings, and early-termination flags.
- Classifies tests as Strong, Healthy, Developing, Needs Attention, or At Risk.
- Adds Low / Medium / High evidence confidence so Atlas does not treat tiny samples as conclusive.
- Generates a plain-language recommendation and the strongest positive/negative signal for every live product.
- Sorts the live-test dashboard with the weakest tests first so intervention priorities are visible immediately.
- Keeps final Active / Revise / Pause / Kill decisions governed by the existing 30-day experiment rules rather than the health score alone.


## Build 8

- Adds the Atlas Intervention Engine for live 30-day product tests.
- Diagnoses the most likely bottleneck as Insufficient Evidence, Traffic, Listing Presentation / Positioning, Offer / Price Friction, Conversion Weakness, Early Demand, Healthy Hold, or Decision Ready.
- Recommends one specific intervention instead of a vague "improve the listing" instruction.
- Enforces a one-variable-at-a-time test rule so Atlas can learn what actually caused a result.
- Defines a success metric for every intervention.
- Protects strong listings from unnecessary edits.
- Avoids diagnosing tiny samples too early.
- Adds intervention diagnosis, priority, action, rationale, measurement target, and test rule directly to the Live Product Tests dashboard.


## Build 9

- Turns intervention recommendations into a trackable workflow instead of static advice.
- Adds an Accept Intervention action that captures the recommendation and freezes a baseline of visits, favorites, orders, revenue, and conversion.
- Allows only one active intervention per product at a time to preserve clean experiments.
- Adds Complete & Evaluate, capturing the current result metrics and comparing them with the intervention baseline.
- Automatically classifies intervention outcomes as Improved, Inconclusive, or Worse using order and conversion movement.
- Stores intervention history inside each opportunity's experiment record.
- Shows the active intervention and the most recent intervention result directly on the Live Product Tests dashboard.
- Preserves the Build 8 one-variable-at-a-time discipline so Atlas can learn which changes actually work.


## Build 10
- Adds the Atlas Command Center CEO view.
- Shows live tests, attention, active interventions, decision-ready tests, revenue, and profit.
- Adds prioritized What Needs You and Next 3 Moves queues.
- Links command items directly to the relevant workspace.
- Establishes the live-environment checkpoint build.

## Build 33 — Production Readiness

- Replaces direct writes to `data/opportunities.json` with SQLite-backed persistent runtime storage.
- Automatically seeds the SQLite database from the existing opportunity data on first launch, preserving the current Atlas portfolio.
- Supports `ATLAS_DATA_DIR` so hosted environments can place the database on persistent storage instead of an ephemeral deploy filesystem.
- Creates a timestamped JSON backup before every data mutation and retains the newest 50 backups by default.
- Adds `/api/health`, including a live SQLite read check and opportunity count for deployment health monitoring.
- Adds production request logging, safer production error responses, baseline security headers, and graceful SIGTERM/SIGINT shutdown.
- Adds `.env.example`, `.gitignore`, Dockerfile, and Render Blueprint configuration.
- Render is configured to mount a 1 GB persistent disk at `/var/data` and use `/api/health` as its health check.
- Requires Node.js 22.5+ because Build 33 uses the built-in `node:sqlite` module and adds no third-party runtime dependencies.
- Adds `npm run check` for syntax validation plus the complete automated test suite.

### Local Run After Build 33

```powershell
npm start
```

Atlas will create `runtime-data/atlas.sqlite` automatically and seed it from `data/opportunities.json` the first time it starts.

### Production Data Safety

The bundled `data/opportunities.json` file is now a seed/migration source only. Live edits are stored in SQLite. Before each mutation Atlas exports the current opportunity state to `runtime-data/backups/` (or the configured persistent data directory).

### Render Deployment Contract

The included `render.yaml` expects a paid Render web-service plan that supports a persistent disk. Atlas writes all live state beneath `/var/data`, so redeploying the application does not overwrite the database. The web service listens on Render's supplied `PORT` and binds to `0.0.0.0`.

## Build 36 — Live Access Protection

- Adds single-user Basic authentication for the live Atlas dashboard, static assets, and API.
- Keeps `/api/health` public so hosting health checks continue to work.
- Uses `ATLAS_ACCESS_USERNAME` and secret `ATLAS_ACCESS_PASSWORD` environment variables.
- Supports `ATLAS_REQUIRE_AUTH=true` so a production deployment cannot silently start without access protection.
- Uses timing-safe credential comparison and exposes only auth enabled/required status through health output.
- Render Blueprint requests the password as a non-synced secret environment variable.


## Build 37 — Daily Executive Briefing

The live dashboard now opens with a Daily Executive Briefing that converts portfolio state into a short operating agenda: current KPIs, work requiring attention, and the next three highest-leverage moves.


## Build 39 — Intelligence Command Layer

- Promotes Atlas's #1 intelligence-ranked opportunity into a prominent Top Focus card in the Daily Executive Briefing.
- Shows the 0–100 work-priority score, recommendation, ranking reasons, lifecycle status, Atlas score, and live-test health when applicable.
- Adds a compact Priority Queue for the next four highest-leverage opportunities.
- Makes intelligence cards actionable: Testing work opens the Testing Workspace; all other work opens the opportunity editor.
- Reuses the Build 38 intelligence contract already delivered through the Command Center instead of creating a second ranking system.
- Fixes the existing Executive Briefing click path for non-Testing opportunities by routing it through the real edit workflow.


## Build 40 — Focus Execution Layer

- Turns Top Focus into an execution workflow with Start Focus, Complete for Today, and Defer 1 Day.
- Persists focus state and a compact action history directly on each opportunity.
- Keeps started work prioritized for continuity instead of reshuffling the queue mid-action.
- Completing or deferring a focus temporarily promotes the next-highest intelligence item.
- Automatically returns held work to the active intelligence queue after its hold expires.

## Build 41 — Daily Focus Review

- Adds a Daily Focus Review directly beneath the Intelligence Command Layer.
- Summarizes today's starts, completions, deferrals, active focus state, and tracked focus minutes.
- Shows recent focus activity so Atlas recommendations can be compared with actual execution.
- Calculates completed/deferred session duration automatically from Start Focus timestamps.
- Exposes the execution summary through the Command Center API without creating a separate task or timer system.
- Uses the configurable `ATLAS_TIME_ZONE` boundary (default `America/Chicago`) so daily review rollovers match the user rather than the host server.


## Build 42 — 7-Day Focus Scorecard

- Adds a rolling 7-day execution scorecard beneath the Daily Focus Review.
- Shows focus-active days, completion-vs-deferral follow-through, tracked minutes, and completed work.
- Identifies which opportunities received the most tracked focus time.
- Surfaces execution signals such as Strong follow-through, Deferral pattern, Open execution loop, or Building execution history.
- Gives plain-language guidance from observed behavior without inventing a generic productivity score.
- Exposes the scorecard through the Command Center API using the same persisted focus history and local-time boundary.

## Build 43 — Recommendation Feedback Loop

- Uses the last 7 days of focus completion/deferral history to gently tune near-term work priority.
- Preserves the underlying Atlas opportunity score; execution behavior only adjusts the short-term work-priority score.
- Gives strong follow-through a small confidence boost and repeated deferrals a bounded penalty so Atlas does not keep forcing ignored work.
- Recommends shrinking the next action when execution friction is detected.
- Adds a Recommendation Feedback panel showing the observed signal, follow-through, completed/deferred actions, guidance, and temporary priority adjustment.
- Exposes recommendation feedback through the Command Center and intelligence payloads using the existing persisted focus history.

## Build 44 — Adaptive Next Action

- Converts negative execution feedback into a concrete smaller next step instead of stopping at “shrink the action.”
- Preserves the strategic recommendation while adding a separate adaptive execution action.
- Creates status-aware 10–15 minute micro-actions for Researching, Testing, Active, Scaled, and Paused opportunities when recent deferrals indicate friction.
- Shows the adaptive step and estimated time directly in Top Focus and uses it in the Priority Queue.
- Start Focus records the adaptive step, allowing Atlas to learn whether the smaller action improves follow-through.
- Leaves recommendations unchanged when there is no evidence that action size is causing execution friction.

## Build 45 — Adaptive Action Learning

- Measures whether Build 44's micro-actions actually improve execution instead of assuming smaller is always better.
- Records each future focus session as a `micro` or `standard` action and carries that label through completion or deferral.
- Adds a rolling 14-day comparison of micro-action and standard-action follow-through plus resolution time.
- Requires enough outcomes in both groups before Atlas claims an effect.
- Shows whether micro-actions are helping, neutral, not helping, or still building a baseline.
- Exposes the learning signal through the Command Center and Executive Briefing.

## Build 46 — Adaptive Strategy Controller

- Turns Build 45's adaptive-action learning into an actual recommendation policy.
- Keeps micro-actions active when they materially improve follow-through.
- Uses them selectively when the evidence shows no clear advantage.
- Pauses micro-actions when they are not improving execution and redirects Atlas toward questioning timing, task choice, or priority.
- Keeps the underlying strategic recommendation and Atlas Score unchanged.
- Shows the current adaptive strategy in the Executive Briefing.
- Exposes and applies `adaptive_action_policy` through the Command Center intelligence queue.

## Build 47 — Opportunity-Aware Adaptive Strategy

- Makes the adaptive strategy opportunity-aware instead of applying one portfolio-wide execution policy to every item.
- Uses each opportunity's own rolling 14-day micro-vs-standard results once there is enough comparative history.
- Falls back to the Build 46 portfolio strategy while an individual opportunity is still building its local evidence base.
- Allows different opportunities to use different execution packaging at the same time without changing Atlas Scores or strategic recommendations.
- Exposes per-opportunity strategy profiles and strategy scope through the Command Center.
- Shows whether Top Focus is using opportunity-specific evidence or the portfolio fallback in the Adaptive Action Learning panel.

## Build 48 — Adaptive Strategy Evidence

- Adds explicit evidence depth to the opportunity-aware adaptive strategy controller.
- Labels local adaptive evidence as Insufficient, Provisional, Established, or Strong based on balanced resolved micro and standard outcomes.
- Shows exactly how many outcomes support the current Top Focus strategy and what additional evidence is needed for the next durability tier.
- Keeps early opportunity-specific strategies usable while clearly distinguishing provisional signals from durable patterns.
- Exposes strategy evidence through the Command Center and Adaptive Action Learning panel without changing the underlying Atlas Score or strategic recommendation.

## Build 49 — Adaptive Strategy Stability Guardrails

- Remembers the opportunity-specific adaptive strategy that was actually applied when a focus session starts.
- Prevents Established or Strong local strategies from flipping because of a small short-term swing in the rolling 14-day evidence window.
- Requires contradictory evidence of at least equal depth plus a stronger performance margin before Atlas reverses a durable strategy.
- Keeps Provisional strategies flexible while evidence is still forming.
- Shows whether Top Focus is stable, being held by the guardrail, or has accepted a genuine strategy change.
- Aligns Start Focus and `/api/intelligence` with the same opportunity-aware strategy context used by the Command Center.

## Build 50 — Execution Friction Diagnosis

- Adds optional structured reasons when Top Focus is deferred so Atlas can learn why work moved instead of treating every deferral identically.
- Distinguishes timing/capacity, dependency blockers, oversized actions, unclear next steps, priority mismatch, and other friction.
- Adds a 14-day Execution Friction Diagnosis panel to the Executive Briefing.
- Uses friction type to tune near-term priority feedback: blockers and timing issues receive lighter penalties, while repeated priority mismatch receives a stronger one.
- Keeps micro-actions for genuine action-size friction, creates a clarification micro-step for unclear work, and avoids shrinking work when the real problem is a blocker, timing, or weak priority pull.
- Preserves legacy focus history and keeps defer reasons optional.
