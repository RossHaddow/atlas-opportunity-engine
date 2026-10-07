const SOURCE_POINTS = { official: 4, primary: 4, academic: 4, local_reporting: 2, reporting: 2, social: 1, unknown: 0 };
const sourceKind = (url = "") => url.includes(".gov") ? "official" : "reporting";
const distinctDomains = (urls) => new Set(urls.filter(Boolean).map((url) => { try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return url; } })).size;

export function assessEvidence(event, corroboratingSources = []) {
  const allSources = [event.primary_source_url || event.source_url, ...corroboratingSources.map((source) => source.url)].filter(Boolean);
  const primaryKind = event.source_kind || sourceKind(event.primary_source_url || event.source_url);
  const primary = SOURCE_POINTS[primaryKind] ?? 0;
  const domains = distinctDomains(allSources);
  const corroboration = Math.min(2, Math.max(0, domains - 1));
  const review = event.review_history?.some((item) => item.action === "verified") ? 1 : 0;
  const score = Math.min(5, primary + corroboration + review);
  return { event_id: event.id, score, score_out_of: 5, source_kind: primaryKind, independent_domains: domains, corroborating_sources: corroboratingSources.length, reviewed: Boolean(review), explanation: [primary ? `${primaryKind} primary source` : "unclassified primary source", corroboration ? `${domains} independent domains` : "no independent corroboration", review ? "verification review recorded" : "no verification review recorded"], caution: "This is an evidence-quality aid, not a statement that the event is true, false, important, or causal." };
}

export function buildEvidenceComparison(tracker, eventId, corroboratingSources = []) {
  const event = tracker.getEvent(eventId); if (!event) throw new Error("event was not found");
  const assessment = assessEvidence(event, corroboratingSources);
  return { event, assessment, sources: [{ url: event.primary_source_url || event.source_url, role: "primary" }, ...corroboratingSources.map((source) => ({ ...source, role: "corroborating" }))] };
}

export function renderEvidenceComparison(comparison) {
  const { event, assessment, sources } = comparison;
  return `<section class="wt-evidence"><p class="wt-eyebrow">EVIDENCE COMPARISON</p><h2>${event.title}</h2><p><strong>Evidence quality:</strong> ${assessment.score}/${assessment.score_out_of}</p><ul>${assessment.explanation.map((item) => `<li>${item}</li>`).join("")}</ul><h3>Sources</h3><ol>${sources.map((source) => `<li>${source.role}: ${source.url || "No URL"}</li>`).join("")}</ol><p class="wt-analysis__guardrail">${assessment.caution}</p></section>`;
}
