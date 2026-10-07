import { WeirdThingsTracker } from "./weirdThingsTracker.js";
import { SourceFeedRegistry } from "./sourceFeeds.js";
import { WatchlistService } from "./watchlists.js";
import { submitIntake, reviewIntake } from "./intakeReview.js";
import { buildCommandCenter } from "./commandCenter.js";
import { buildWeirdThingsDashboard } from "./dashboard.js";

export const MODULE_MANIFEST = { id: "weird_things_tracker", name: "Weird Things Tracker", version: "1.1.0", lifecycle: "ready", dependencies: ["atlas_core.storage", "atlas_core.dashboard", "atlas_core.tasks", "atlas_core.notifications", "atlas_core.scheduling"], handlers: ["getDashboard", "getCommandCenter", "submitIntake", "reviewEvent", "ingestSource", "evaluateAlerts", "exportState", "restoreState"] };

export class WeirdThingsModule {
  constructor(state = {}) {
    this.tracker = new WeirdThingsTracker();
    this.sources = new SourceFeedRegistry(this.tracker);
    this.watchlists = new WatchlistService(this.tracker);
    if (state.events || state.sources || state.watchlists || state.alerts) this.restoreState(state);
  }
  getDashboard(filters, referenceDate) { return buildWeirdThingsDashboard(this.tracker, filters, referenceDate); }
  getCommandCenter(referenceDate) { return buildCommandCenter(this.tracker, this.watchlists, referenceDate); }
  submitIntake(input) { return submitIntake(this.tracker, input); }
  reviewEvent(eventId, input) { return reviewIntake(this.tracker, eventId, input); }
  ingestSource(sourceId, entries) { return this.sources.ingest(sourceId, entries); }
  evaluateAlerts(referenceDate) { return this.watchlists.evaluate(referenceDate); }
  exportState() { return { schema_version: 1, events: [...this.tracker.events.values()], sources: this.sources.list(), watchlists: this.watchlists.listWatchlists(), alerts: this.watchlists.listAlerts() }; }
  restoreState(state) {
    if (state.schema_version !== undefined && state.schema_version !== 1) throw new Error("unsupported state schema version");
    (state.events || []).forEach((event) => { const { id, created_at, updated_at, ...restoredFields } = event; const created = this.tracker.addEvent(event); this.tracker.updateEvent(created.id, restoredFields); });
    (state.sources || []).forEach((source) => this.sources.register(source));
    (state.watchlists || []).forEach((watchlist) => this.watchlists.add(watchlist));
    (state.alerts || []).forEach((alert) => this.watchlists.alerts.set(alert.id, alert));
    return this;
  }
}
