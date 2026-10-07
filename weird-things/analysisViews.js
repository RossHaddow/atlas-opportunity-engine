const isoDay = (value) => new Date(value).toISOString().slice(0, 10);
const readableCategory = (value) => value.replaceAll("_", " ");

function verifiedInWindow(tracker, { from, to }) {
  return tracker.listEvents({ status: "verified", from, to });
}

export function geographicRollup(tracker, filters = {}) {
  const events = verifiedInWindow(tracker, filters);
  const rows = new Map();
  events.forEach((event) => {
    const country = event.location.country || "Unknown";
    const region = event.location.region || "Unspecified";
    const key = `${country}|${region}`;
    const current = rows.get(key) || { country, region, total_events: 0, categories: {}, average_reliability: 0, _reliability_sum: 0, event_ids: [] };
    current.total_events += 1;
    current.categories[event.category] = (current.categories[event.category] || 0) + 1;
    current._reliability_sum += event.reliability;
    current.average_reliability = Number((current._reliability_sum / current.total_events).toFixed(1));
    current.event_ids.push(event.id);
    rows.set(key, current);
  });
  return [...rows.values()].map(({ _reliability_sum, ...row }) => row).sort((a, b) => b.total_events - a.total_events || b.average_reliability - a.average_reliability);
}

export function timelineRollup(tracker, filters = {}) {
  const events = verifiedInWindow(tracker, filters);
  const rows = new Map();
  events.forEach((event) => {
    const day = isoDay(event.occurred_at);
    const row = rows.get(day) || { date: day, total_events: 0, categories: {}, event_ids: [] };
    row.total_events += 1;
    row.categories[event.category] = (row.categories[event.category] || 0) + 1;
    row.event_ids.push(event.id);
    rows.set(day, row);
  });
  return [...rows.values()].sort((a, b) => a.date.localeCompare(b.date));
}

export function renderAnalysisPanel(tracker, filters = {}) {
  const geography = geographicRollup(tracker, filters);
  const timeline = timelineRollup(tracker, filters);
  const categorySummary = (categories) => Object.entries(categories).map(([category, count]) => `${count} ${readableCategory(category)}`).join(", ");
  return `<section class="wt-analysis" aria-labelledby="wt-analysis-title"><p class="wt-eyebrow">ANALYSIS VIEWS</p><h2 id="wt-analysis-title">Where and when verified events are appearing</h2><p class="wt-analysis__guardrail">These counts show recorded verified events, not a measured risk level or a causal relationship.</p><div class="wt-grid"><section><h3>Geographic rollup</h3>${geography.length ? `<table><thead><tr><th>Area</th><th>Events</th><th>Categories</th><th>Reliability</th></tr></thead><tbody>${geography.map((row) => `<tr><td>${row.region}, ${row.country}</td><td>${row.total_events}</td><td>${categorySummary(row.categories)}</td><td>${row.average_reliability}/5</td></tr>`).join("")}</tbody></table>` : "<p class=\"wt-empty\">No verified events in this period.</p>"}</section><section><h3>Timeline</h3>${timeline.length ? `<table><thead><tr><th>Date</th><th>Events</th><th>Categories</th></tr></thead><tbody>${timeline.map((row) => `<tr><td>${row.date}</td><td>${row.total_events}</td><td>${categorySummary(row.categories)}</td></tr>`).join("")}</tbody></table>` : "<p class=\"wt-empty\">No verified events in this period.</p>"}</section></div></section>`;
}
