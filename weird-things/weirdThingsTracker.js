export const CATEGORIES = [
  "weather", "geology", "animals", "space_aviation", "infrastructure",
  "public_health", "technology", "society", "other"
];

export const STATUSES = ["captured", "needs_review", "verified", "dismissed"];

const DAY_MS = 86_400_000;

function required(value, label) {
  if (value === undefined || value === null || value === "") throw new Error(`${label} is required`);
}

function date(value, label) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.valueOf())) throw new Error(`${label} must be an ISO date`);
  return parsed;
}

function areaKey(event) {
  return [event.location.country || "unknown", event.location.region || "unknown"].join("|").toLowerCase();
}

export class WeirdThingsTracker {
  constructor(seedEvents = []) {
    this.events = new Map();
    seedEvents.forEach((event) => this.addEvent(event));
  }

  addEvent(input) {
    required(input.id, "id");
    required(input.title, "title");
    required(input.occurred_at, "occurred_at");
    if (!CATEGORIES.includes(input.category)) throw new Error("category is not supported");
    if (!STATUSES.includes(input.status || "captured")) throw new Error("status is not supported");
    if (this.events.has(input.id)) throw new Error("id must be unique");
    if (!input.location || (!input.location.country && !input.location.region)) {
      throw new Error("location must include country or region");
    }
    const reliability = input.reliability ?? 1;
    if (!Number.isInteger(reliability) || reliability < 1 || reliability > 5) {
      throw new Error("reliability must be an integer from 1 to 5");
    }

    const event = {
      id: input.id,
      title: input.title,
      summary: input.summary || "",
      category: input.category,
      tags: [...new Set(input.tags || [])],
      occurred_at: date(input.occurred_at, "occurred_at").toISOString(),
      captured_at: (input.captured_at ? date(input.captured_at, "captured_at") : new Date()).toISOString(),
      location: { country: input.location.country || null, region: input.location.region || null, city: input.location.city || null },
      status: input.status || "captured",
      reliability,
      source_url: input.source_url || null,
      primary_source_url: input.primary_source_url || null,
      notes: input.notes || "",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    this.events.set(event.id, event);
    return event;
  }

  getEvent(id) {
    return this.events.get(id) || null;
  }

  updateEvent(id, patch) {
    const existing = this.getEvent(id);
    if (!existing) throw new Error("event was not found");
    if (patch.status && !STATUSES.includes(patch.status)) throw new Error("status is not supported");
    if (patch.reliability !== undefined && (!Number.isInteger(patch.reliability) || patch.reliability < 1 || patch.reliability > 5)) {
      throw new Error("reliability must be an integer from 1 to 5");
    }
    const event = {
      ...existing,
      ...patch,
      location: patch.location ? { ...existing.location, ...patch.location } : existing.location,
      tags: patch.tags ? [...new Set(patch.tags)] : existing.tags,
      updated_at: new Date().toISOString()
    };
    this.events.set(id, event);
    return event;
  }

  listEvents({ category, status, country, from, to } = {}) {
    const start = from ? date(from, "from") : null;
    const end = to ? date(to, "to") : null;
    return [...this.events.values()]
      .filter((event) => !category || event.category === category)
      .filter((event) => !status || event.status === status)
      .filter((event) => !country || event.location.country?.toLowerCase() === country.toLowerCase())
      .filter((event) => !start || new Date(event.occurred_at) >= start)
      .filter((event) => !end || new Date(event.occurred_at) <= end)
      .sort((a, b) => new Date(b.occurred_at) - new Date(a.occurred_at));
  }

  getSummary(referenceDate = new Date()) {
    const reference = date(referenceDate, "referenceDate");
    const cutoff = new Date(reference.valueOf() - 7 * DAY_MS);
    const events = this.listEvents();
    const recent = events.filter((event) => new Date(event.occurred_at) >= cutoff);
    return {
      total_events: events.length,
      verified_events: events.filter((event) => event.status === "verified").length,
      needs_review: events.filter((event) => event.status === "needs_review").length,
      last_7_days: recent.length,
      by_category: CATEGORIES.reduce((counts, category) => ({ ...counts, [category]: events.filter((event) => event.category === category).length }), {}),
      possible_patterns: this.detectPatterns(reference).length
    };
  }

  detectPatterns(referenceDate = new Date()) {
    const reference = date(referenceDate, "referenceDate");
    const cutoff = new Date(reference.valueOf() - 14 * DAY_MS);
    const groups = new Map();
    this.listEvents({ status: "verified" })
      .filter((event) => new Date(event.occurred_at) >= cutoff)
      .forEach((event) => {
        const key = `${event.category}|${areaKey(event)}`;
        groups.set(key, [...(groups.get(key) || []), event]);
      });
    return [...groups.values()]
      .filter((events) => events.length >= 2)
      .map((events) => ({
        type: "possible_cluster",
        confidence: events.length >= 4 ? "medium" : "low",
        category: events[0].category,
        area: events[0].location,
        event_count: events.length,
        window_days: 14,
        event_ids: events.map((event) => event.id),
        note: "Temporal/geographic clustering only. Review underlying evidence; do not infer causation."
      }))
      .sort((a, b) => b.event_count - a.event_count);
  }
}
