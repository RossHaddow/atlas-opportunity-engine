# Atlas Build 40 — Normalized Source Tree

Status: COMPLETE

Build 40 converts Atlas from a packed deployment artifact into a normal, inspectable repository source tree while preserving the Build 38 / v1.7.0 application payload as the source of truth.

## What changed

- Adds an automated source-normalization workflow.
- Verifies the 16-part packed payload before restoration.
- Restores the current Atlas application source from the verified payload.
- Commits the restored application into the first-class `app/` directory on `main`.
- Keeps the packed payload temporarily as a recovery/reference artifact so normalization is reversible.
- Makes future Atlas builds editable as ordinary repository files rather than requiring Base64/gzip payload surgery.
- Retains Build 39 integrity tooling as a safety net during the transition.

## Source of truth

Beginning with Build 40, `app/` is the maintainable application source tree for future development. The segmented `atlas34.part.*` files are legacy recovery artifacts and should not be used for new application edits.

## Safety model

Normalization is generated from the exact verified payload already used by Atlas. The workflow fails before writing `app/` if payload verification or restoration fails. The legacy payload remains in the repository until a later cleanup build confirms that normal-source deployment is stable.

## Verification

Build 40 is complete when:

1. Payload integrity verification succeeds.
2. The payload restores successfully.
3. `app/` contains the reconstructed Atlas source files.
4. The normalized source is committed to `main`.
5. Future application work can target files under `app/` directly.

## Application version

The normalized source represents the current Atlas Build 38 / v1.7.0 application behavior. Build 40 changes repository architecture, not user-facing Atlas behavior.
