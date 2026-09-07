# Atlas Build 39 — Payload Recovery & Integrity

Status: COMPLETE

Build 39 makes the current Atlas deployment artifact easier to recover, audit, and safely advance.

The application payload itself remains Atlas Build 38 / v1.7.0. Build 39 is an infrastructure and repository-reliability build; it does not change Atlas application behavior.

## What changed

- Adds `scripts/restore-atlas.sh` to reconstruct the current application source from the segmented payload.
- Adds `scripts/verify-atlas.sh` to validate that every expected segment exists, decodes successfully, passes gzip integrity checks, and contains archive entries.
- Adds a GitHub Actions workflow that runs payload verification on pushes to `main` and on pull requests.
- Uses the current 16-part payload layout: `atlas34.part.00` through `atlas34.part.15`.
- Fails fast when a payload segment is missing or empty, Base64 decoding fails, gzip validation fails, or the reconstructed archive is empty.
- Temporary reconstructed archives are deleted automatically after verification or restoration.
- Supports `ATLAS_PAYLOAD_PREFIX` and `ATLAS_EXPECTED_PARTS` overrides so the tooling can survive a future payload naming or segmentation change.

## Verify the current payload

```bash
bash scripts/verify-atlas.sh .
```

A successful verification reports that all expected segments decoded, gzip integrity passed, and the archive contains files.

## Restore the current application source

```bash
bash scripts/restore-atlas.sh . atlas-restored
```

The reconstructed source is extracted into `atlas-restored/`.

## Why this build matters

Builds 37 and 38 advanced Atlas through a segmented deployment payload. That format works, but it is harder to inspect and recover than a normal source tree. Build 39 adds a repeatable recovery path and an automated integrity gate before further application changes.

This creates a safer foundation for a future build that can normalize the packed application back into first-class repository source files without risking loss of the current working Atlas build.

## Verification notes

- The shell scripts were syntax-checked before being committed.
- GitHub Actions now performs payload integrity verification automatically on repository pushes and pull requests.
- Build 39 does not claim or require a new application version because the application payload remains v1.7.0.
