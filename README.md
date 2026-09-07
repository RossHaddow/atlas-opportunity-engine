# Atlas Opportunity Engine

Atlas is a personal opportunity engine for evaluating, testing, tracking, and scaling income opportunities.

## Current build state

- Application payload: Atlas Build 38 / v1.7.0.
- Repository reliability tooling: Atlas Build 39 — Payload Recovery & Integrity.
- Build 39 adds deterministic restore tooling, payload verification, and automatic GitHub Actions integrity checks without changing application behavior.

## Verify the Atlas payload

```bash
bash scripts/verify-atlas.sh .
```

## Restore the Atlas source

```bash
bash scripts/restore-atlas.sh . atlas-restored
```

See `BUILD_39.md` for the full Build 39 record.
