import { CATEGORIES } from "./weirdThingsTracker.js";

const label = (value) => value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
const escapeHtml = (value) => String(value)
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&#039;");

function eventCard(event) {
  const location = [event.location.city, event.location.region, event.location.country].filter(Boolean).join(", ");
  const source = event.source_url
    ? `<a href="${escapeHtml(event.source_url)}" target="_blank" rel="noreferrer">Source</a>`
    : "No source linked";
  return `<article class="wt-event-card">
    <div class="wt-event-card__meta"><span>${label(event.category)}</span><span>${new Date(event.occurred_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</span></div>
    <h3>${escapeHtml(event.title)}</h3>
    <p>${escapeHtml(event.summary || "No summary yet.")}</p>
    <footer><span>${escapeHtml(location)}</span><span class="wt-status wt-status--${escapeHtml(event.status)}">${label(event.status)}</span><span>${source}</span></footer>
  </article>`;
}

export function buildWeirdThingsDashboard(tracker, filters = {}, referenceDate = new Date()) {
  const events = tracker.listEvents(filters);
  const summary = tracker.getSummary(referenceDate);
  const patterns = tracker.detectPatterns(referenceDate);
  const reviewQueue = tracker.listEvents({ ...filters, status: "needs_review" });
  const activeFilters = {
    category: filters.category || "all",
    country: filters.country || "all",
    status: filters.status || "all"
  };
  const categoryOptions = ["all", ...CATEGORIES].map((category) =>
    `<option value="${category}"${activeFilters.category === category ? " selected" : ""}>${category === "all" ? "All categories" : label(category)}</option>`
  ).join("");
  const countries = [...new Set(tracker.listEvents().map((event) => event.location.country).filter(Boolean))].sort();
  const countryOptions = ["all", ...countries].map((country) =>
    `<option value="${escapeHtml(country)}"${activeFilters.country === country ? " selected" : ""}>${country === "all" ? "Everywhere" : escapeHtml(country)}</option>`
  ).join("");

  const html = `<section class="weird-things-dashboard" aria-labelledby="weird-things-title">
    <header class="wt-header"><div><p class="wt-eyebrow">ATLAS INTELLIGENCE</p><h1 id="weird-things-title">Weird Things Tracker</h1><p>Unusual events worth watching—evidence first, patterns second.</p></div><button type="button" data-action="new-weird-event">Add event</button></header>
    <section class="wt-summary" aria-label="Tracker summary">
      <div><span>Captured</span><strong>${summary.total_events}</strong></div><div><span>Verified</span><strong>${summary.verified_events}</strong></div><div><span>Needs review</span><strong>${summary.needs_review}</strong></div><div><span>Last 7 days</span><strong>${summary.last_7_days}</strong></div>
    </section>
    <form class="wt-filters" aria-label="Filter events"><label>Category<select name="category">${categoryOptions}</select></label><label>Country<select name="country">${countryOptions}</select></label><label>Status<select name="status"><option value="all">All statuses</option><option value="captured"${activeFilters.status === "captured" ? " selected" : ""}>Captured</option><option value="needs_review"${activeFilters.status === "needs_review" ? " selected" : ""}>Needs review</option><option value="verified"${activeFilters.status === "verified" ? " selected" : ""}>Verified</option><option value="dismissed"${activeFilters.status === "dismissed" ? " selected" : ""}>Dismissed</option></select></label></form>
    <div class="wt-grid"><section><h2>Possible patterns <span>${patterns.length}</span></h2>${patterns.length ? patterns.map((pattern) => `<article class="wt-pattern"><strong>${label(pattern.category)} cluster</strong><p>${pattern.event_count} verified events in ${escapeHtml([pattern.area.region, pattern.area.country].filter(Boolean).join(", "))} during the last ${pattern.window_days} days.</p><small>${escapeHtml(pattern.note)}</small></article>`).join("") : "<p class=\"wt-empty\">No verified clusters yet.</p>"}</section>
    <section><h2>Review queue <span>${reviewQueue.length}</span></h2>${reviewQueue.length ? reviewQueue.map(eventCard).join("") : "<p class=\"wt-empty\">Nothing waiting for review.</p>"}</section></div>
    <section><h2>Latest events <span>${events.length}</span></h2><div class="wt-feed">${events.length ? events.map(eventCard).join("") : "<p class=\"wt-empty\">No events match these filters.</p>"}</div></section>
  </section>`;

  return { summary, patterns, reviewQueue, events, activeFilters, html };
}
