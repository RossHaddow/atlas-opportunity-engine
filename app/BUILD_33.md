# Atlas Build 33 — Production Readiness

Status: COMPLETE

## Completed

- SQLite persistent storage layer using Node.js built-in `node:sqlite`
- Automatic migration/seed from the existing `data/opportunities.json`
- Environment-configurable persistent data directory (`ATLAS_DATA_DIR`)
- Automatic pre-write JSON snapshots with retention controls
- SQLite WAL + FULL synchronous durability configuration
- `/api/health` deployment health endpoint with live storage verification
- Production-safe error responses and structured request/error logging
- Basic response security headers
- Graceful SIGTERM/SIGINT shutdown
- Render Blueprint with persistent disk and health check
- Dockerfile for portable deployment
- `.env.example` and `.gitignore`
- Node.js engine requirement updated for built-in SQLite
- Storage-specific automated tests
- Full test suite: 38/38 passing
- Production smoke test: health, seed migration, API read, API write, backup creation, graceful shutdown all passed

## Production Contract

Build 33 intentionally separates bundled seed data from live data. `data/opportunities.json` is never the production write target. At first launch, Atlas imports it into SQLite. Thereafter the live database and backup snapshots live under `ATLAS_DATA_DIR`.

For Render, `render.yaml` mounts a 1 GB persistent disk at `/var/data` and sets `ATLAS_DATA_DIR=/var/data`. The app binds to `0.0.0.0` and respects Render's `PORT` environment variable.

## Build 34

Deploy this package to the selected live hosting environment, provision the persistent disk, confirm the public/private URL, run a post-deploy health check, and verify persistence across a redeploy/restart.
