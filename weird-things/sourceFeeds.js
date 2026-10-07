import { submitIntake } from "./intakeReview.js";
import { CATEGORIES } from "./weirdThingsTracker.js";

const DAY_MS = 86_400_000;
const tokens = (value = "") => new Set(value.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter((word) => word.length > 2));
const titleSimilarity = (left, right) => {
  const a = tokens(left); const b = tokens(right);
  const union = new Set([...a, ...b]);
  const shared = [...a].filter((word) => b.has(word));
  return union.size ? shared.length / union.size : 0;
};

function required(value, name) { if (!value) throw new Error(`${name} is required`); }

export class SourceFeedRegistry {
  constructor(tracker, feeds = []) { this.tracker = tracker; this.feeds = new Map(); feeds.forEach((feed) => this.register(feed)); }

  register(feed) {
    required(feed.id, "id"); required(feed.name, "name"); required(feed.url, "url");
    if (!CATEGORIES.includes(feed.category)) throw new Error("category is not supported");
    if (this.feeds.has(feed.id)) throw new Error("source id must be unique");
    const source = { id: feed.id, name: feed.name, url: feed.url, category: feed.category, enabled: feed.enabled !== false, trust_level: feed.trust_level || "reporting", last_ingested_at: null };
    this.feeds.set(source.id, source); return source;
  }

  list() { return [...this.feeds.values()]; }

  findDuplicate(candidate) {
    const occurred = new Date(candidate.occurred_at);
    return this.tracker.listEvents({ category: candidate.category }).map((event) => ({
      event,
      similarity: titleSimilarity(candidate.title, event.title),
      daysApart: Math.abs(new Date(event.occurred_at) - occurred) / DAY_MS,
      sameCountry: event.location.country?.toLowerCase() === candidate.location?.country?.toLowerCase()
    })).filter((comparison) => comparison.sameCountry && comparison.daysApart <= 7 && comparison.similarity >= 0.5)
      .sort((a, b) => b.similarity - a.similarity)[0] || null;
  }

  ingest(sourceId, entries) {
    const source = this.feeds.get(sourceId);
    if (!source) throw new Error("source was not found");
    if (!source.enabled) return { source_id: sourceId, accepted: [], duplicates: [], skipped: entries.length, reason: "source_disabled" };
    const result = { source_id: sourceId, accepted: [], duplicates: [], skipped: 0 };
    entries.forEach((entry, index) => {
      const candidate = {
        id: entry.id || `${sourceId}:${index}:${new Date(entry.published_at || entry.occurred_at).valueOf()}`,
        title: entry.title,
        summary: entry.summary || "",
        category: entry.category || source.category,
        occurred_at: entry.occurred_at || entry.published_at,
        source_url: entry.url,
        source_type: source.trust_level,
        contributor: `source:${source.name}`,
        location: entry.location || { country: "Unknown" },
        tags: entry.tags || []
      };
      const duplicate = this.findDuplicate(candidate);
      if (duplicate) { result.duplicates.push({ candidate_id: candidate.id, likely_event_id: duplicate.event.id, title_similarity: Number(duplicate.similarity.toFixed(2)), days_apart: Number(duplicate.daysApart.toFixed(1)) }); return; }
      try { result.accepted.push(submitIntake(this.tracker, candidate)); } catch (error) { result.skipped += 1; }
    });
    source.last_ingested_at = new Date().toISOString();
    return result;
  }
}
