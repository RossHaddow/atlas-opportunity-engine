import { createWeeklyBriefing } from "./weeklyBriefing.js";

export function buildCommandCenter(tracker, watchlists, referenceDate = new Date()) {
  const briefing = createWeeklyBriefing(tracker, referenceDate);
  const alerts = watchlists ? watchlists.listAlerts().filter((alert) => alert.state === "new") : [];
  const topSignals = briefing.verified_events.slice(0, 5);
  const nextMoves = [
    ...briefing.attention.map((item) => ({ priority: item.priority, action: item.type, title: item.title, detail: item.rationale, event_ids: item.event_ids })),
    ...alerts.map((alert) => ({ priority: "normal", action: "review_alert", title: alert.title, detail: alert.note, event_ids: alert.event_ids }))
  ].sort((a, b) => (a.priority === "high" ? -1 : 1) - (b.priority === "high" ? -1 : 1));
  return { generated_at: new Date(referenceDate).toISOString(), headline: briefing.summary, top_signals: topSignals, review_queue: briefing.review_queue, patterns: briefing.possible_patterns, new_alerts: alerts, next_moves: nextMoves, guardrail: "Atlas surfaces evidence-backed records and review work. It does not claim prediction, risk, or causation from these signals." };
}

export function renderCommandCenter(model) {
  const list = (items, formatter, empty) => items.length ? `<ul>${items.map(formatter).join("")}</ul>` : `<p class="wt-empty">${empty}</p>`;
  return `<section class="wt-command-center" aria-labelledby="wt-command-title"><p class="wt-eyebrow">ATLAS COMMAND CENTER</p><h1 id="wt-command-title">Weird Things: what needs attention</h1><p>${model.headline}</p><div class="wt-grid"><section><h2>Next moves <span>${model.next_moves.length}</span></h2>${list(model.next_moves, (item) => `<li><strong>${item.priority.toUpperCase()} — ${item.title}</strong><br><small>${item.detail}</small></li>`, "No actions right now.")}</section><section><h2>Top verified signals</h2>${list(model.top_signals, (event) => `<li><strong>${event.title}</strong><br><small>${event.category.replaceAll("_", " ")} · reliability ${event.reliability}/5</small></li>`, "No verified signals this week.")}</section></div><div class="wt-grid"><section><h2>Review queue <span>${model.review_queue.length}</span></h2>${list(model.review_queue, (event) => `<li>${event.title}</li>`, "Review queue is clear.")}</section><section><h2>New alerts <span>${model.new_alerts.length}</span></h2>${list(model.new_alerts, (alert) => `<li>${alert.title}</li>`, "No new watchlist alerts.")}</section></div><p class="wt-analysis__guardrail">${model.guardrail}</p></section>`;
}
