const $ = (selector) => document.querySelector(selector);
const escapeHtml = (value = "") => String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
const nice = (value = "") => String(value).replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
const location = (event) => [event.location?.city, event.location?.region, event.location?.country].filter(Boolean).join(", ") || "Location not set";

function eventCard(event, showReview = false) {
  const source = event.primary_source_url || event.source_url;
  return `<article class="wt-event-card"><div class="wt-event-card__meta"><span>${nice(event.category)}</span><span>${new Date(event.occurred_at).toLocaleDateString()}</span><span class="wt-status wt-status--${escapeHtml(event.status)}">${nice(event.status)}</span></div><h3>${escapeHtml(event.title)}</h3><p>${escapeHtml(event.summary || "No summary recorded.")}</p><footer><span>${escapeHtml(location(event))}</span>${source ? `<a href="${escapeHtml(source)}" target="_blank" rel="noreferrer">Source</a>` : ""}</footer>${showReview ? `<div class="wt-review-actions"><button data-review="verified" data-event="${escapeHtml(event.id)}">Verify</button><button class="secondary" data-review="dismissed" data-event="${escapeHtml(event.id)}">Dismiss</button></div>` : ""}</article>`;
}

async function request(path, options) {
  const response = await fetch(path, options);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Atlas could not complete that request.");
  return data;
}

async function loadTracker() {
  const [dashboard, events] = await Promise.all([request("/api/weird-things/dashboard"), request("/api/weird-things/events")]);
  $("#wt-updated").textContent = `Updated ${new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`;
  $("#wt-summary").innerHTML = [["Captured", dashboard.summary.total_events], ["Verified", dashboard.summary.verified_events], ["Needs review", dashboard.summary.needs_review], ["Last 7 days", dashboard.summary.last_7_days]].map(([label, value]) => `<div><span>${label}</span><strong>${value}</strong></div>`).join("");
  $("#wt-review-count").textContent = `${dashboard.reviewQueue.length} open`;
  $("#wt-pattern-count").textContent = `${dashboard.patterns.length} found`;
  $("#wt-event-count").textContent = `${events.events.length} records`;
  $("#wt-review-queue").innerHTML = dashboard.reviewQueue.length ? dashboard.reviewQueue.map((event) => eventCard(event, true)).join("") : '<p class="wt-empty">Nothing waiting for review.</p>';
  $("#wt-patterns").innerHTML = dashboard.patterns.length ? dashboard.patterns.map((pattern) => `<article class="wt-pattern"><strong>${nice(pattern.category)} cluster</strong><p>${pattern.event_count} verified events in ${escapeHtml([pattern.area.region, pattern.area.country].filter(Boolean).join(", "))} in ${pattern.window_days} days.</p><small>${escapeHtml(pattern.note)}</small></article>`).join("") : '<p class="wt-empty">No verified clusters yet.</p>';
  $("#wt-events").innerHTML = events.events.length ? events.events.map((event) => eventCard(event)).join("") : '<p class="wt-empty">No events logged yet.</p>';
  document.querySelectorAll("[data-review]").forEach((button) => button.addEventListener("click", async () => {
    const action = button.dataset.review;
    button.disabled = true;
    try { await request(`/api/weird-things/events/${encodeURIComponent(button.dataset.event)}/review`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, reviewer: "Atlas owner", rationale: action === "verified" ? "Reviewed and verified in Atlas." : "Dismissed after review." }) }); await loadTracker(); }
    catch (error) { alert(error.message); button.disabled = false; }
  }));
}

$("#wt-intake-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const status = $("#wt-form-status"); status.textContent = "Adding…";
  const payload = { id: `wt-${Date.now()}`, title: $("#wt-title").value.trim(), category: $("#wt-category").value, occurred_at: $("#wt-date").value, source_url: $("#wt-source").value.trim(), contributor: "Atlas owner", location: { country: $("#wt-country").value.trim(), region: $("#wt-region").value.trim() }, summary: $("#wt-summary-text").value.trim() };
  try { await request("/api/weird-things/intake", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }); event.target.reset(); status.textContent = "Added to review."; await loadTracker(); }
  catch (error) { status.textContent = error.message; }
});

$("#wt-date").value = new Date().toISOString().slice(0, 10);
loadTracker().catch((error) => { $("#wt-updated").textContent = error.message; });
