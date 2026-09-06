# Atlas Build 36 — Live Access Protection

Status: COMPLETE

Build 36 protects the live Atlas dashboard and API before additional personal intelligence is added.

## What changed

- Version bumped to 1.5.0.
- Adds single-user HTTP Basic authentication using Node.js built-ins only.
- Protects the dashboard, static assets, and all Atlas API routes except `/api/health`.
- Uses timing-safe credential comparisons.
- Local development remains unlocked when `ATLAS_ACCESS_PASSWORD` is blank.
- `ATLAS_REQUIRE_AUTH=true` makes production fail startup when no password is configured.
- `/api/health` reports only whether authentication is enabled/required; credentials are never returned.
- Render Blueprint now requires a secret `ATLAS_ACCESS_PASSWORD` and enables authentication by default.
- Adds automated tests for disabled local auth, valid/invalid credentials, and fail-closed production configuration.

## Live configuration

- `ATLAS_ACCESS_USERNAME=atlas` (changeable)
- `ATLAS_ACCESS_PASSWORD=<strong unique secret>`
- `ATLAS_REQUIRE_AUTH=true`

Render terminates HTTPS for the service, so Basic credentials are protected in transit when Atlas is accessed through its HTTPS URL.

## Verification

1. Deploy Build 36 with `ATLAS_ACCESS_PASSWORD` set as a secret.
2. Confirm `/api/health` returns 200 without credentials.
3. Confirm opening the Atlas URL requests credentials.
4. Confirm invalid credentials return 401.
5. Confirm valid credentials load the dashboard and API data.
6. Restart/redeploy and confirm both the persistence sentinel and protected access remain intact.
