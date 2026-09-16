# Atlas Travel — Build 4

## Live Research Architecture

Travel Build 4 adds the provider and provenance layer required to move Atlas from planning estimates toward current travel research without allowing estimates to masquerade as live quotes.

### Added
- Provider registry for flights, lodging, weather, and availability.
- Providers report `ready` only when both a provider name and API key are configured.
- `GET /api/travel/providers` exposes connection readiness without exposing secrets.
- `POST /api/travel/trips/:tripId/destinations/:destinationId/live-research` accepts a source-backed provider snapshot.
- Live snapshots store provider/source, capture time, optional expiry, currency, quote components, availability, confidence, and freshness.
- Applying a live snapshot updates the destination research fields and recalculates Atlas Fit.
- Seed estimates remain explicitly separate from `live_snapshot` research.
- Travel UI now displays provider readiness, a verified-snapshot ingestion form, and live freshness badges.

### Data integrity rules
- Atlas never reports an unconfigured provider as live or ready.
- The live-research endpoint requires a provider/source.
- Seed estimates remain labeled as non-live planning research.
- Provider snapshots preserve provenance and freshness metadata for later auditing/research refresh.

### Provider configuration
Optional environment variables are documented in `.env.example` for flights, lodging, weather, and availability providers. Build 4 creates the architecture and ingestion contract; provider-specific network adapters can now be added independently in later builds.

### Validation
- Full test suite: 315/315 passing.
- Live HTTP workflow verified provider status, seed generation, provider-snapshot ingestion, persistence, and Atlas Fit recalculation.
