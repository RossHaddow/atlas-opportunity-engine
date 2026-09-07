# Atlas Build 34 — Live Deployment

Build 34 is the deployment release for Atlas Opportunity Engine.

## Release status

Application: ready for live deployment.
Source: Build 33 production-ready application.
Runtime: Node.js 22+
Health check: `/api/health`
Persistent data path: `/var/data`
Recommended Render service plan: Starter
Persistent disk: 1 GB mounted at `/var/data`

## Render configuration

- Service name: `atlas-opportunity-engine`
- Runtime: Node
- Region: Ohio
- Build command: `npm install --ignore-scripts`
- Start command: `npm start`
- Health check: `/api/health`
- Environment variables:
  - `NODE_ENV=production`
  - `ATLAS_DATA_DIR=/var/data`
  - `ATLAS_BACKUP_LIMIT=50`
- Persistent disk:
  - Name: `atlas-data`
  - Mount path: `/var/data`
  - Size: 1 GB

## Verification checklist

1. Deploy succeeds.
2. `GET /api/health` returns healthy status.
3. Existing four Atlas opportunities are present.
4. Create/update test succeeds.
5. Service restart preserves the change.
6. Backup file is created before mutation.
7. Public Atlas URL loads the dashboard.

## Deployment note

The included `render.yaml` contains the required persistent-disk configuration and is the preferred deployment path when creating the service from a connected Git repository using Render Blueprint.
