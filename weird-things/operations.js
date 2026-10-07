export class ModuleOperations {
  constructor(module) { this.module = module; this.audit = []; }
  record(action, detail = {}) { const entry = { id: `wta-${this.audit.length + 1}`, action, detail, occurred_at: new Date().toISOString() }; this.audit.push(entry); return entry; }
  intake(input) { const event = this.module.submitIntake(input); this.record("intake_submitted", { event_id: event.id }); return event; }
  review(eventId, input) { const event = this.module.reviewEvent(eventId, input); this.record("event_reviewed", { event_id: eventId, decision: input.action }); return event; }
  ingest(sourceId, entries) { const result = this.module.ingestSource(sourceId, entries); this.record("source_ingested", { source_id: sourceId, accepted: result.accepted.length, duplicates: result.duplicates.length }); return result; }
  evaluateAlerts(referenceDate) { const alerts = this.module.evaluateAlerts(referenceDate); this.record("alerts_evaluated", { created: alerts.length }); return alerts; }
  health() { const state = this.module.exportState(); const disabled = state.sources.filter((source) => !source.enabled).length; return { status: "healthy", checked_at: new Date().toISOString(), events: { total: state.events.length, needs_review: state.events.filter((event) => event.status === "needs_review").length }, sources: { configured: state.sources.length, disabled }, watchlists: { configured: state.watchlists.length, active: state.watchlists.filter((watch) => watch.enabled).length }, alerts: { new: state.alerts.filter((alert) => alert.state === "new").length }, audit_entries: this.audit.length }; }
}
