import { CATEGORIES } from "./weirdThingsTracker.js";

function required(value, label) {
  if (value === undefined || value === null || String(value).trim() === "") throw new Error(`${label} is required`);
}

function reviewEntry({ action, reviewer, rationale, reviewedAt = new Date().toISOString() }) {
  return { action, reviewer, rationale, reviewed_at: new Date(reviewedAt).toISOString() };
}

/**
 * Adds an untrusted report to the review queue. Intake can never self-verify an event.
 */
export function submitIntake(tracker, input) {
  required(input.id, "id");
  required(input.title, "title");
  required(input.occurred_at, "occurred_at");
  required(input.source_url, "source_url");
  required(input.contributor, "contributor");
  if (!CATEGORIES.includes(input.category)) throw new Error("category is not supported");
  const event = tracker.addEvent({
    ...input,
    status: "needs_review",
    reliability: 1,
    notes: input.notes || "",
    review_history: []
  });
  return tracker.updateEvent(event.id, {
    intake: { contributor: input.contributor, submitted_at: new Date().toISOString(), source_type: input.source_type || "news_report" },
    review_history: []
  });
}

/**
 * Applies a human review. Verification demands both a source and a stated rationale.
 */
export function reviewIntake(tracker, eventId, input) {
  required(input.action, "action");
  required(input.reviewer, "reviewer");
  required(input.rationale, "rationale");
  if (!["verified", "needs_review", "dismissed"].includes(input.action)) throw new Error("review action is not supported");
  const event = tracker.getEvent(eventId);
  if (!event) throw new Error("event was not found");
  if (input.action === "verified" && !(input.primary_source_url || event.primary_source_url || event.source_url)) {
    throw new Error("a source is required to verify an event");
  }
  const history = [...(event.review_history || []), reviewEntry(input)];
  return tracker.updateEvent(eventId, {
    status: input.action,
    reliability: input.reliability ?? (input.action === "verified" ? Math.max(event.reliability, 3) : event.reliability),
    primary_source_url: input.primary_source_url || event.primary_source_url,
    review_history: history,
    notes: input.notes ? `${event.notes}${event.notes ? "\n" : ""}${input.notes}` : event.notes
  });
}

export function buildReviewPanel(tracker, eventId) {
  const event = tracker.getEvent(eventId);
  if (!event) throw new Error("event was not found");
  const source = event.primary_source_url || event.source_url || "No source linked";
  return `<section class="wt-review-panel" aria-labelledby="wt-review-title"><p class="wt-eyebrow">EVIDENCE REVIEW</p><h2 id="wt-review-title">${event.title}</h2><p><strong>Source:</strong> ${source}</p><p><strong>Current status:</strong> ${event.status.replaceAll("_", " ")}</p><form data-event-id="${event.id}"><label>Decision<select name="action"><option value="verified">Verify</option><option value="needs_review">Keep in review</option><option value="dismissed">Dismiss</option></select></label><label>Rationale<textarea name="rationale" required placeholder="What makes this evidence strong, incomplete, or unreliable?"></textarea></label><label>Primary source URL<input name="primary_source_url" type="url" value="${event.primary_source_url || event.source_url || ""}"></label><button type="submit">Save review</button></form><h3>Review history</h3>${(event.review_history || []).length ? `<ol>${event.review_history.map((item) => `<li><strong>${item.action}</strong> — ${item.rationale} <small>(${item.reviewer})</small></li>`).join("")}</ol>` : "<p class=\"wt-empty\">No review decision recorded.</p>"}</section>`;
}
