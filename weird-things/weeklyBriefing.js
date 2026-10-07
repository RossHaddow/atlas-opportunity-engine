const DAY_MS = 86_400_000;

function date(value) { return new Date(value); }
function inRange(event, start, end) { const occurred = date(event.occurred_at); return occurred >= start && occurred <= end; }

function actionForPattern(pattern) {
  return {
    priority: pattern.confidence === "medium" ? "high" : "normal",
    type: "investigate_cluster",
    title: `${pattern.event_count} ${pattern.category.replaceAll("_", " ")} events may be clustering`,
    rationale: `Review the underlying ${pattern.event_count} verified records in ${[pattern.area.region, pattern.area.country].filter(Boolean).join(", ")}. This is a correlation prompt, not evidence of a common cause.`,
    event_ids: pattern.event_ids
  };
}

export function createWeeklyBriefing(tracker, referenceDate = new Date()) {
  const end = date(referenceDate); const start = new Date(end.valueOf() - 7 * DAY_MS);
  const allEvents = tracker.listEvents();
  const week = allEvents.filter((event) => inRange(event, start, end));
  const verified = week.filter((event) => event.status === "verified").sort((a, b) => b.reliability - a.reliability || date(b.occurred_at) - date(a.occurred_at));
  const reviewQueue = tracker.listEvents({ status: "needs_review" });
  const patterns = tracker.detectPatterns(end);
  const actions = [
    ...patterns.map(actionForPattern),
    ...(reviewQueue.length ? [{ priority: reviewQueue.length >= 10 ? "high" : "normal", type: "clear_review_queue", title: `${reviewQueue.length} item${reviewQueue.length === 1 ? "" : "s"} need${reviewQueue.length === 1 ? "s" : ""} review`, rationale: "Verify, hold, or dismiss newly captured reports so only evidence-backed events influence pattern detection.", event_ids: reviewQueue.map((event) => event.id) }] : [])
  ].sort((a, b) => (a.priority === "high" ? -1 : 1) - (b.priority === "high" ? -1 : 1));
  const categories = [...new Set(week.map((event) => event.category))];
  const summary = verified.length
    ? `${verified.length} verified event${verified.length === 1 ? "" : "s"} entered the tracker this week across ${categories.length} categor${categories.length === 1 ? "y" : "ies"}.`
    : "No newly verified events entered the tracker this week.";
  return {
    period: { starts_at: start.toISOString(), ends_at: end.toISOString() },
    summary,
    verified_events: verified,
    possible_patterns: patterns,
    review_queue: reviewQueue,
    attention: actions,
    safeguards: ["Only verified records contribute to possible patterns.", "Clusters identify where to inspect evidence; they do not establish a cause.", "Repeated news coverage is not counted as separate underlying events."]
  };
}

export function renderWeeklyBriefingMarkdown(briefing) {
  const lines = ["# Atlas Weird Things — Weekly Briefing", "", `**Period:** ${new Date(briefing.period.starts_at).toLocaleDateString("en-US")}–${new Date(briefing.period.ends_at).toLocaleDateString("en-US")}`, "", briefing.summary, "", "## What needs attention", ""];
  lines.push(...(briefing.attention.length ? briefing.attention.map((item) => `- **${item.priority.toUpperCase()} — ${item.title}:** ${item.rationale}`) : ["- No action items right now."]));
  lines.push("", "## Verified this week", "", ...(briefing.verified_events.length ? briefing.verified_events.map((event) => `- **${event.title}** — ${event.category.replaceAll("_", " ")}; reliability ${event.reliability}/5.`) : ["- None."]));
  lines.push("", "## Guardrails", "", ...briefing.safeguards.map((item) => `- ${item}`));
  return lines.join("\n");
}
