import { CATEGORIES } from "./weirdThingsTracker.js";

function required(value, label) { if (value === undefined || value === null || value === "") throw new Error(`${label} is required`); }
const matchesRegion = (event, rule) => !rule.country || event.location.country?.toLowerCase() === rule.country.toLowerCase();

export class WatchlistService {
  constructor(tracker, watchlists = []) { this.tracker = tracker; this.watchlists = new Map(); this.alerts = new Map(); watchlists.forEach((rule) => this.add(rule)); }

  add(rule) {
    required(rule.id, "id"); required(rule.name, "name"); required(rule.type, "type");
    if (this.watchlists.has(rule.id)) throw new Error("watchlist id must be unique");
    if (!['category', 'region', 'cluster'].includes(rule.type)) throw new Error("watchlist type is not supported");
    if (rule.type === 'category' && !CATEGORIES.includes(rule.category)) throw new Error("category is not supported");
    if (rule.type === 'region' && !rule.country) throw new Error("country is required for a region watchlist");
    if (rule.type === 'cluster' && (!Number.isInteger(rule.minimum_events) || rule.minimum_events < 2)) throw new Error("minimum_events must be at least 2");
    const watchlist = { id: rule.id, name: rule.name, type: rule.type, category: rule.category || null, country: rule.country || null, minimum_events: rule.minimum_events || null, enabled: rule.enabled !== false, created_at: new Date().toISOString() };
    this.watchlists.set(watchlist.id, watchlist); return watchlist;
  }

  listWatchlists() { return [...this.watchlists.values()]; }
  listAlerts() { return [...this.alerts.values()].sort((a, b) => new Date(b.created_at) - new Date(a.created_at)); }

  evaluate(referenceDate = new Date()) {
    const alerts = [];
    const verified = this.tracker.listEvents({ status: "verified" });
    const patterns = this.tracker.detectPatterns(referenceDate);
    this.listWatchlists().filter((rule) => rule.enabled).forEach((rule) => {
      if (rule.type === "category" || rule.type === "region") {
        verified.filter((event) => (rule.type !== "category" || event.category === rule.category) && (rule.type !== "region" || matchesRegion(event, rule))).forEach((event) => {
          const fingerprint = `${rule.id}:event:${event.id}`;
          if (!this.alerts.has(fingerprint)) alerts.push(this.createAlert(fingerprint, rule, `Verified ${event.category.replaceAll("_", " ")} event: ${event.title}`, [event.id]));
        });
      }
      if (rule.type === "cluster") {
        patterns.filter((pattern) => pattern.event_count >= rule.minimum_events && (!rule.category || pattern.category === rule.category) && (!rule.country || pattern.area.country?.toLowerCase() === rule.country.toLowerCase())).forEach((pattern) => {
          const fingerprint = `${rule.id}:cluster:${pattern.event_ids.join(",")}`;
          if (!this.alerts.has(fingerprint)) alerts.push(this.createAlert(fingerprint, rule, `Possible ${pattern.category.replaceAll("_", " ")} cluster: ${pattern.event_count} verified events`, pattern.event_ids));
        });
      }
    });
    return alerts;
  }

  createAlert(id, watchlist, title, eventIds) {
    const alert = { id, watchlist_id: watchlist.id, title, event_ids: eventIds, delivery: "in_app_only", state: "new", created_at: new Date().toISOString(), note: "An alert identifies a matching record or possible cluster. It does not establish risk or cause." };
    this.alerts.set(id, alert); return alert;
  }
}
