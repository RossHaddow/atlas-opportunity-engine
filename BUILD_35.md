# Atlas Build 35 — Persistent Live Atlas

Build 35 hardens Atlas for durable daily use.

## What changed

- Version bumped to 1.4.0.
- Atlas now creates a persistent instance sentinel in the configured data directory.
- `/api/health` reports the sentinel ID and creation timestamp so persistence can be verified across restarts/redeploys.
- Existing SQLite state and timestamped JSON backups remain in the same data directory.
- `ATLAS_REQUIRE_PERSISTENCE=true` identifies production deployments that are expected to use durable storage.

## Durable Render configuration

- Paid web service (Starter / 0.5c-512mb or higher)
- 1 GB persistent disk
- Mount path: `/var/data`
- `ATLAS_DATA_DIR=/var/data`
- `ATLAS_BACKUP_LIMIT=50`
- `ATLAS_REQUIRE_PERSISTENCE=true`

## Verification

1. Record `persistence_instance_id` from `/api/health`.
2. Create or update a harmless test opportunity.
3. Confirm a backup is created before the write.
4. Restart/redeploy the service.
5. Confirm the same `persistence_instance_id` remains.
6. Confirm the test change remains.
7. Remove the temporary test change.

Build 35 is production-persistence ready when those checks pass on a mounted persistent disk.
