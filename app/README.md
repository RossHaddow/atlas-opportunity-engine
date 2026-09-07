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
