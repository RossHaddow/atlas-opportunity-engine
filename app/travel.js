const crypto = require('node:crypto');

const TRAVEL_STATUSES = ['Dreaming', 'Researching', 'Planning', 'Booked', 'Traveling', 'Completed'];


const LIVE_RESEARCH_KINDS = ['flights', 'lodging', 'weather', 'availability'];

function travelProviderStatus(env = process.env) {
  const provider = (kind, envName, keyName) => {
    const name = String(env[envName] || '').trim();
    const keyPresent = Boolean(String(env[keyName] || '').trim());
    return {
      kind,
      provider: name || null,
      configured: Boolean(name && keyPresent),
      status: name && keyPresent ? 'ready' : 'not_connected',
      requires: [envName, keyName]
    };
  };
  const providers = [
    provider('flights', 'ATLAS_TRAVEL_FLIGHTS_PROVIDER', 'ATLAS_TRAVEL_FLIGHTS_API_KEY'),
    provider('lodging', 'ATLAS_TRAVEL_LODGING_PROVIDER', 'ATLAS_TRAVEL_LODGING_API_KEY'),
    provider('weather', 'ATLAS_TRAVEL_WEATHER_PROVIDER', 'ATLAS_TRAVEL_WEATHER_API_KEY'),
    provider('availability', 'ATLAS_TRAVEL_AVAILABILITY_PROVIDER', 'ATLAS_TRAVEL_AVAILABILITY_API_KEY')
  ];
  return {
    providers,
    ready_count: providers.filter(item => item.configured).length,
    total_count: providers.length,
    live_research_ready: providers.some(item => item.configured)
  };
}

function normalizeLiveResearchSnapshot(input = {}) {
  const capturedAt = String(input.captured_at || new Date().toISOString()).trim();
  const source = String(input.source || '').trim();
  const provider = String(input.provider || '').trim();
  const sourceUrl = String(input.source_url || '').trim();
  const expiresAt = String(input.expires_at || '').trim();
  const flightTotal = nonNegative(input.flight_total);
  const lodgingTotal = nonNegative(input.lodging_total);
  const feesTotal = nonNegative(input.fees_total);
  const total = nonNegative(input.total_cost, flightTotal + lodgingTotal + feesTotal);
  return {
    id: input.id || crypto.randomUUID(),
    provider: provider || source || 'External provider',
    source: source || provider || 'External provider',
    source_url: sourceUrl,
    captured_at: capturedAt,
    expires_at: expiresAt,
    currency: String(input.currency || 'USD').trim().toUpperCase(),
    live_data: input.live_data !== false,
    flight_total: flightTotal,
    lodging_total: lodgingTotal,
    fees_total: feesTotal,
    total_cost: total,
    flight_hours: nonNegative(input.flight_hours),
    layovers: Math.max(0, Math.round(nonNegative(input.layovers))),
    weather_score: input.weather_score === undefined || input.weather_score === null || input.weather_score === '' ? null : clamp(input.weather_score),
    availability: String(input.availability || '').trim(),
    confidence: Math.max(0, Math.min(1, Number(input.confidence ?? 0.9) || 0)),
    notes: String(input.notes || '').trim()
  };
}

function liveResearchFreshness(snapshot = {}, now = Date.now()) {
  const captured = Date.parse(snapshot.captured_at || '');
  if (!Number.isFinite(captured)) return { age_hours: null, label: 'unknown', stale: true };
  const ageHours = Math.max(0, (now - captured) / 36e5);
  const expires = Date.parse(snapshot.expires_at || '');
  const expired = Number.isFinite(expires) && now > expires;
  const stale = expired || ageHours > 24;
  return { age_hours: Math.round(ageHours * 10) / 10, label: stale ? 'stale' : ageHours <= 2 ? 'fresh' : 'recent', stale };
}

function applyLiveResearchSnapshot(candidateInput = {}, snapshotInput = {}, preferences = DEFAULT_TRAVEL_PREFERENCES, trip = {}) {
  const snapshot = normalizeLiveResearchSnapshot(snapshotInput);
  const current = normalizeDestinationCandidate(candidateInput, preferences, trip);
  const freshness = liveResearchFreshness(snapshot);
  const merged = {
    ...current,
    estimated_total_cost: snapshot.total_cost || current.estimated_total_cost,
    flight_hours: snapshot.flight_hours || current.flight_hours,
    layovers: snapshot.flight_hours ? snapshot.layovers : current.layovers,
    weather_score: snapshot.weather_score === null ? current.weather_score : snapshot.weather_score,
    source: snapshot.source,
    research_type: 'live_snapshot',
    research_confidence: snapshot.confidence,
    live_data: snapshot.live_data,
    live_research: { ...snapshot, freshness },
    last_live_research_at: snapshot.captured_at
  };
  const normalized = normalizeDestinationCandidate(merged, preferences, trip);
  normalized.research_type = 'live_snapshot';
  normalized.research_confidence = snapshot.confidence;
  normalized.live_data = snapshot.live_data;
  normalized.live_research = { ...snapshot, freshness };
  normalized.last_live_research_at = snapshot.captured_at;
  return normalized;
}

const DEFAULT_TRAVEL_PREFERENCES = Object.freeze({
  home_airport: 'MSP',
  currency: 'USD',
  default_party_size: 2,
  preferred_trip_length_days: 7,
  preferred_max_flight_hours: 7,
  preferred_max_layovers: 1,
  priorities: {
    budget_fit: 25,
    travel_time: 15,
    weather: 15,
    lodging_fit: 15,
    experience_fit: 15,
    simplicity: 10,
    preference_match: 5
  },
  preferences: {
    adults_only: false,
    all_inclusive: false,
    beach: false,
    nightlife: false,
    relaxation: true,
    local_food: true,
    nature: true
  },
  avoid_destinations: [],
  notes: ''
});

function clamp(value, min = 0, max = 10) {
  const number = Number(value);
  if (!Number.isFinite(number)) return min;
  return Math.min(max, Math.max(min, number));
}

function nonNegative(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : fallback;
}

function normalizeStringArray(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map(item => String(item || '').trim()).filter(Boolean))];
}

function normalizeTravelPreferences(input = {}, current = DEFAULT_TRAVEL_PREFERENCES) {
  const mergedPriorities = { ...DEFAULT_TRAVEL_PREFERENCES.priorities, ...(current.priorities || {}), ...(input.priorities || {}) };
  const normalizedPriorities = Object.fromEntries(
    Object.entries(mergedPriorities).map(([key, value]) => [key, Math.max(0, Number(value) || 0)])
  );
  const mergedPreferences = { ...DEFAULT_TRAVEL_PREFERENCES.preferences, ...(current.preferences || {}), ...(input.preferences || {}) };
  return {
    home_airport: String(input.home_airport ?? current.home_airport ?? DEFAULT_TRAVEL_PREFERENCES.home_airport).trim().toUpperCase(),
    currency: String(input.currency ?? current.currency ?? 'USD').trim().toUpperCase(),
    default_party_size: Math.max(1, Math.round(nonNegative(input.default_party_size ?? current.default_party_size, 2))),
    preferred_trip_length_days: Math.max(1, Math.round(nonNegative(input.preferred_trip_length_days ?? current.preferred_trip_length_days, 7))),
    preferred_max_flight_hours: nonNegative(input.preferred_max_flight_hours ?? current.preferred_max_flight_hours, 7),
    preferred_max_layovers: Math.max(0, Math.round(nonNegative(input.preferred_max_layovers ?? current.preferred_max_layovers, 1))),
    priorities: normalizedPriorities,
    preferences: Object.fromEntries(Object.entries(mergedPreferences).map(([key, value]) => [key, Boolean(value)])),
    avoid_destinations: normalizeStringArray(input.avoid_destinations ?? current.avoid_destinations),
    notes: String(input.notes ?? current.notes ?? '').trim()
  };
}

function emptyTravelState() {
  return {
    schema_version: 1,
    preferences: normalizeTravelPreferences(),
    trips: []
  };
}

function normalizeBudget(input = {}, current = {}) {
  return {
    target: nonNegative(input.target ?? current.target),
    estimated: nonNegative(input.estimated ?? current.estimated),
    booked: nonNegative(input.booked ?? current.booked),
    actual: nonNegative(input.actual ?? current.actual)
  };
}

function normalizeDates(input = {}, current = {}) {
  return {
    start: String(input.start ?? current.start ?? '').trim(),
    end: String(input.end ?? current.end ?? '').trim(),
    flexibility_days: Math.max(0, Math.round(nonNegative(input.flexibility_days ?? current.flexibility_days)))
  };
}

function emptyTrip(input = {}, preferences = DEFAULT_TRAVEL_PREFERENCES) {
  const now = new Date().toISOString();
  const status = TRAVEL_STATUSES.includes(input.status) ? input.status : 'Dreaming';
  return {
    id: input.id || crypto.randomUUID(),
    name: String(input.name || '').trim(),
    status,
    travelers: Math.max(1, Math.round(nonNegative(input.travelers, preferences.default_party_size || 2))),
    purpose: String(input.purpose || 'Leisure').trim(),
    origin_airport: String(input.origin_airport || preferences.home_airport || '').trim().toUpperCase(),
    dates: normalizeDates(input.dates),
    budget: normalizeBudget(input.budget),
    destination_candidates: Array.isArray(input.destination_candidates) ? input.destination_candidates : [],
    lodging: Array.isArray(input.lodging) ? input.lodging : [],
    transportation: Array.isArray(input.transportation) ? input.transportation : [],
    activities: Array.isArray(input.activities) ? input.activities : [],
    reservations: Array.isArray(input.reservations) ? input.reservations : [],
    flight_options: Array.isArray(input.flight_options) ? input.flight_options : [],
    resort_options: Array.isArray(input.resort_options) ? input.resort_options : [],
    scenario_plans: Array.isArray(input.scenario_plans) ? input.scenario_plans : [],
    scenario_watchlist: Array.isArray(input.scenario_watchlist) ? input.scenario_watchlist : [],
    travel_actions: normalizeTravelActions(input.travel_actions),
    booking_execution: normalizeBookingExecution(input.booking_execution),
    booking_decision: normalizeBookingDecision(input.booking_decision),
    trip_operations: normalizeTripOperations(input.trip_operations),
    pre_departure: normalizePreDeparture(input.pre_departure),
    live_trip: normalizeLiveTrip(input.live_trip),
    trip_resilience: normalizeTripResilience(input.trip_resilience),
    trip_wrap_up: normalizeTripWrapUp(input.trip_wrap_up),
    notes: String(input.notes || '').trim(),
    review: input.review && typeof input.review === 'object' ? input.review : null,
    created_at: input.created_at || now,
    updated_at: now
  };
}

function budgetFitScore(cost, budget) {
  const target = nonNegative(budget);
  const estimated = nonNegative(cost);
  if (!target || !estimated) return 5;
  if (estimated <= target) {
    const savingsRate = (target - estimated) / target;
    return clamp(9 + Math.min(1, savingsRate * 2));
  }
  const overRate = (estimated - target) / target;
  return clamp(9 - (overRate * 18));
}

function travelTimeScore(hours, preferredMax) {
  const flightHours = nonNegative(hours);
  const maxHours = Math.max(1, nonNegative(preferredMax, 7));
  if (!flightHours) return 5;
  if (flightHours <= maxHours) return clamp(10 - ((flightHours / maxHours) * 2));
  return clamp(8 - (((flightHours - maxHours) / maxHours) * 8));
}

function layoverAdjustment(layovers, preferredMax) {
  const count = Math.max(0, Math.round(nonNegative(layovers)));
  const preferred = Math.max(0, Math.round(nonNegative(preferredMax, 1)));
  return Math.max(-3, Math.min(1, preferred - count));
}

function preferenceMatchScore(candidate = {}, preferences = DEFAULT_TRAVEL_PREFERENCES) {
  const desired = preferences.preferences || {};
  const active = Object.entries(desired).filter(([, enabled]) => enabled).map(([key]) => key);
  if (!active.length) return 7;
  const traits = candidate.traits && typeof candidate.traits === 'object' ? candidate.traits : {};
  let matches = 0;
  for (const key of active) {
    if (traits[key] === true) matches += 1;
  }
  return clamp((matches / active.length) * 10);
}

function normalizeWeights(priorities = {}) {
  const values = Object.fromEntries(Object.entries(DEFAULT_TRAVEL_PREFERENCES.priorities).map(([key, fallback]) => [key, Math.max(0, Number(priorities[key] ?? fallback) || 0)]));
  const total = Object.values(values).reduce((sum, value) => sum + value, 0) || 1;
  return Object.fromEntries(Object.entries(values).map(([key, value]) => [key, value / total]));
}

function destinationScore(candidate = {}, preferences = DEFAULT_TRAVEL_PREFERENCES, trip = {}) {
  const normalizedPreferences = normalizeTravelPreferences(preferences);
  const weights = normalizeWeights(normalizedPreferences.priorities);
  const tripBudget = nonNegative(trip?.budget?.target);
  const cost = nonNegative(candidate.estimated_total_cost);
  const components = {
    budget_fit: budgetFitScore(cost, tripBudget),
    travel_time: clamp(travelTimeScore(candidate.flight_hours, normalizedPreferences.preferred_max_flight_hours) + layoverAdjustment(candidate.layovers, normalizedPreferences.preferred_max_layovers)),
    weather: clamp(candidate.weather_score ?? 5),
    lodging_fit: clamp(candidate.lodging_fit_score ?? 5),
    experience_fit: clamp(candidate.experience_fit_score ?? 5),
    simplicity: clamp(candidate.simplicity_score ?? 5),
    preference_match: preferenceMatchScore(candidate, normalizedPreferences)
  };
  const weighted = Object.entries(components).reduce((sum, [key, value]) => sum + (value * (weights[key] || 0)), 0);
  const atlasFit = Math.round(weighted * 10);
  const warnings = [];
  const label = String(candidate.name || candidate.destination || '').trim();
  const avoided = normalizedPreferences.avoid_destinations.some(item => label.toLowerCase().includes(item.toLowerCase()));
  if (avoided) warnings.push('Destination matches the avoid list.');
  if (tripBudget && cost > tripBudget) warnings.push(`Estimated cost is ${Math.round(((cost - tripBudget) / tripBudget) * 100)}% over target budget.`);
  if (nonNegative(candidate.layovers) > normalizedPreferences.preferred_max_layovers) warnings.push('More layovers than preferred.');
  if (nonNegative(candidate.flight_hours) > normalizedPreferences.preferred_max_flight_hours) warnings.push('Flight time exceeds preferred maximum.');
  return {
    atlas_fit: avoided ? Math.min(atlasFit, 40) : atlasFit,
    components: Object.fromEntries(Object.entries(components).map(([key, value]) => [key, Math.round(value * 10) / 10])),
    weights: Object.fromEntries(Object.entries(weights).map(([key, value]) => [key, Math.round(value * 1000) / 10])),
    warnings
  };
}

function normalizeDestinationCandidate(input = {}, preferences = DEFAULT_TRAVEL_PREFERENCES, trip = {}) {
  const candidate = {
    id: input.id || crypto.randomUUID(),
    name: String(input.name || input.destination || '').trim(),
    city: String(input.city || '').trim(),
    region: String(input.region || '').trim(),
    country: String(input.country || '').trim(),
    estimated_total_cost: nonNegative(input.estimated_total_cost),
    flight_hours: nonNegative(input.flight_hours),
    layovers: Math.max(0, Math.round(nonNegative(input.layovers))),
    weather_score: clamp(input.weather_score ?? 5),
    lodging_fit_score: clamp(input.lodging_fit_score ?? 5),
    experience_fit_score: clamp(input.experience_fit_score ?? 5),
    simplicity_score: clamp(input.simplicity_score ?? 5),
    traits: input.traits && typeof input.traits === 'object' ? Object.fromEntries(Object.entries(input.traits).map(([key, value]) => [key, Boolean(value)])) : {},
    notes: String(input.notes || '').trim(),
    source: String(input.source || '').trim(),
    research_type: String(input.research_type || '').trim(),
    research_confidence: Math.max(0, Math.min(1, Number(input.research_confidence ?? 0) || 0)),
    research_assumptions: String(input.research_assumptions || '').trim(),
    generated_at: String(input.generated_at || '').trim(),
    live_data: Boolean(input.live_data),
    live_research: input.live_research && typeof input.live_research === 'object' ? input.live_research : null,
    last_live_research_at: String(input.last_live_research_at || '').trim(),
    tags: Array.isArray(input.tags) ? input.tags : [],
    updated_at: new Date().toISOString()
  };
  candidate.score = destinationScore(candidate, preferences, trip);
  return candidate;
}


function destinationResearchCompleteness(candidate = {}) {
  const checks = [
    candidate.name,
    Number(candidate.estimated_total_cost) > 0,
    Number(candidate.flight_hours) > 0,
    candidate.weather_score !== undefined,
    candidate.lodging_fit_score !== undefined,
    candidate.experience_fit_score !== undefined,
    candidate.simplicity_score !== undefined,
    candidate.traits && Object.keys(candidate.traits).length > 0
  ];
  const complete = checks.filter(Boolean).length;
  return Math.round((complete / checks.length) * 100);
}

function destinationStrengths(candidate = {}) {
  const score = candidate.score || {};
  const components = score.components || {};
  const labels = { budget_fit: 'Budget fit', travel_time: 'Travel time', weather: 'Weather', lodging_fit: 'Lodging fit', experience_fit: 'Experience fit', simplicity: 'Simplicity', preference_match: 'Preference match' };
  return Object.entries(components)
    .filter(([, value]) => Number(value) >= 8)
    .sort((a, b) => Number(b[1]) - Number(a[1]))
    .slice(0, 3)
    .map(([key]) => labels[key] || key);
}

function compareDestinations(trip = {}, preferences = DEFAULT_TRAVEL_PREFERENCES) {
  const target = nonNegative(trip?.budget?.target);
  const candidates = (Array.isArray(trip.destination_candidates) ? trip.destination_candidates : []).map(item => {
    const candidate = normalizeDestinationCandidate(item, preferences, trip);
    const delta = target ? candidate.estimated_total_cost - target : 0;
    return {
      ...candidate,
      research_completeness: destinationResearchCompleteness(candidate),
      budget_delta: Math.round(delta * 100) / 100,
      budget_delta_percent: target ? Math.round((delta / target) * 1000) / 10 : null,
      strengths: destinationStrengths(candidate)
    };
  }).sort((a, b) => Number(b.score?.atlas_fit || 0) - Number(a.score?.atlas_fit || 0));
  const leader = candidates[0] || null;
  return {
    trip_id: trip.id || null,
    trip_name: trip.name || '',
    target_budget: target,
    candidate_count: candidates.length,
    leader_id: leader?.id || null,
    leader_name: leader?.name || null,
    leader_score: leader?.score?.atlas_fit ?? null,
    score_gap: candidates.length > 1 ? Number(leader.score?.atlas_fit || 0) - Number(candidates[1].score?.atlas_fit || 0) : null,
    candidates
  };
}

function destinationResearchBrief(trip = {}, preferences = DEFAULT_TRAVEL_PREFERENCES) {
  const comparison = compareDestinations(trip, preferences);
  const leader = comparison.candidates[0];
  if (!leader) return { headline: 'Add destination candidates to start research.', recommendation: null, cautions: [], next_research: ['Add at least two destination candidates for a useful comparison.'] };
  const cautions = [...(leader.score?.warnings || [])];
  if (leader.research_completeness < 75) cautions.push('Leading option has incomplete research data.');
  const next = [];
  if (!leader.estimated_total_cost) next.push('Estimate total trip cost.');
  if (!leader.flight_hours) next.push('Confirm flight time and layovers.');
  if (leader.weather_score === 5) next.push('Validate seasonal weather.');
  if (comparison.candidate_count < 3) next.push('Add another viable destination to reduce selection bias.');
  return {
    headline: `${leader.name} currently leads at ${leader.score.atlas_fit}/100 Atlas Fit.`,
    recommendation: leader.id,
    strengths: leader.strengths,
    cautions,
    next_research: next,
    score_gap: comparison.score_gap
  };
}


const DESTINATION_RESEARCH_CATALOG = Object.freeze([
  { name:'Montego Bay, Jamaica', city:'Montego Bay', country:'Jamaica', base_cost_per_person:2150, flight_hours:4.7, layovers:0, weather_score:9, lodging_fit_score:9, experience_fit_score:9, simplicity_score:9, traits:{all_inclusive:true, adults_only:true, beach:true, nightlife:true, relaxation:true, local_food:true, nature:true}, tags:['warm','caribbean','resort','beach'] },
  { name:'Negril, Jamaica', city:'Negril', country:'Jamaica', base_cost_per_person:2250, flight_hours:5.1, layovers:0, weather_score:9, lodging_fit_score:9, experience_fit_score:9, simplicity_score:8, traits:{all_inclusive:true, adults_only:true, beach:true, nightlife:true, relaxation:true, local_food:true, nature:true}, tags:['warm','caribbean','resort','beach'] },
  { name:'Curaçao', city:'Willemstad', country:'Curaçao', base_cost_per_person:2350, flight_hours:6.3, layovers:1, weather_score:9, lodging_fit_score:8, experience_fit_score:9, simplicity_score:7, traits:{all_inclusive:true, adults_only:true, beach:true, nightlife:true, relaxation:true, local_food:true, nature:true}, tags:['warm','caribbean','beach','culture'] },
  { name:'Aruba', city:'Oranjestad', country:'Aruba', base_cost_per_person:2500, flight_hours:6.1, layovers:1, weather_score:9.5, lodging_fit_score:9, experience_fit_score:8.5, simplicity_score:8, traits:{all_inclusive:true, adults_only:true, beach:true, nightlife:true, relaxation:true, local_food:true, nature:false}, tags:['warm','caribbean','beach','resort'] },
  { name:'Riviera Maya, Mexico', city:'Playa del Carmen', country:'Mexico', base_cost_per_person:1900, flight_hours:4.2, layovers:0, weather_score:8.5, lodging_fit_score:9.5, experience_fit_score:9, simplicity_score:9, traits:{all_inclusive:true, adults_only:true, beach:true, nightlife:true, relaxation:true, local_food:true, nature:true}, tags:['warm','mexico','resort','beach'] },
  { name:'Puerto Vallarta, Mexico', city:'Puerto Vallarta', country:'Mexico', base_cost_per_person:2050, flight_hours:4.4, layovers:0, weather_score:9, lodging_fit_score:9, experience_fit_score:9, simplicity_score:9, traits:{all_inclusive:true, adults_only:true, beach:true, nightlife:true, relaxation:true, local_food:true, nature:true}, tags:['warm','mexico','resort','beach'] },
  { name:'Los Cabos, Mexico', city:'Cabo San Lucas', country:'Mexico', base_cost_per_person:2400, flight_hours:4.3, layovers:0, weather_score:9, lodging_fit_score:9, experience_fit_score:8, simplicity_score:9, traits:{all_inclusive:true, adults_only:true, beach:true, nightlife:true, relaxation:true, local_food:true, nature:true}, tags:['warm','mexico','resort','desert'] },
  { name:'Saint Lucia', city:'Soufrière', country:'Saint Lucia', base_cost_per_person:2850, flight_hours:7.2, layovers:1, weather_score:8.5, lodging_fit_score:9, experience_fit_score:10, simplicity_score:7, traits:{all_inclusive:true, adults_only:true, beach:true, nightlife:false, relaxation:true, local_food:true, nature:true}, tags:['warm','caribbean','romantic','nature'] },
  { name:'Nassau, Bahamas', city:'Nassau', country:'Bahamas', base_cost_per_person:2350, flight_hours:5.0, layovers:1, weather_score:8.5, lodging_fit_score:8.5, experience_fit_score:8, simplicity_score:8, traits:{all_inclusive:true, adults_only:true, beach:true, nightlife:true, relaxation:true, local_food:false, nature:false}, tags:['warm','caribbean','beach','resort'] },
  { name:'Guanacaste, Costa Rica', city:'Liberia', country:'Costa Rica', base_cost_per_person:2300, flight_hours:5.5, layovers:1, weather_score:8.5, lodging_fit_score:8, experience_fit_score:10, simplicity_score:7, traits:{all_inclusive:true, adults_only:true, beach:true, nightlife:false, relaxation:true, local_food:true, nature:true}, tags:['warm','nature','adventure','beach'] },
  { name:'Madeira, Portugal', city:'Funchal', country:'Portugal', base_cost_per_person:2600, flight_hours:11.0, layovers:1, weather_score:7, lodging_fit_score:8, experience_fit_score:9, simplicity_score:6, traits:{all_inclusive:false, adults_only:false, beach:false, nightlife:false, relaxation:true, local_food:true, nature:true}, tags:['europe','nature','food','mild'] },
  { name:'Edinburgh, Scotland', city:'Edinburgh', country:'Scotland', base_cost_per_person:2450, flight_hours:9.5, layovers:1, weather_score:5.5, lodging_fit_score:8, experience_fit_score:10, simplicity_score:7, traits:{all_inclusive:false, adults_only:false, beach:false, nightlife:true, relaxation:false, local_food:true, nature:true}, tags:['europe','city','culture','nature'] }
]);

function tripLengthDays(trip = {}, fallback = 7) {
  const start = Date.parse(trip?.dates?.start || '');
  const end = Date.parse(trip?.dates?.end || '');
  if (Number.isFinite(start) && Number.isFinite(end) && end >= start) return Math.max(1, Math.round((end-start)/86400000)+1);
  return Math.max(1, Math.round(nonNegative(fallback, 7)));
}

function seasonalWeatherAdjustment(name, startDate) {
  const month = String(startDate || '').match(/^\\d{4}-(\\d{2})/)?.[1];
  if (!month) return 0;
  const m = Number(month);
  const tropical = /Jamaica|Curaçao|Aruba|Mexico|Saint Lucia|Bahamas|Costa Rica/i.test(name);
  if (tropical && [1,2,3,11,12].includes(m)) return 0.5;
  if (tropical && [8,9,10].includes(m)) return -0.7;
  if (/Scotland/i.test(name) && [6,7,8].includes(m)) return 1;
  if (/Scotland/i.test(name) && [11,12,1,2].includes(m)) return -1;
  return 0;
}

function estimateSeedCost(item, trip = {}, preferences = DEFAULT_TRAVEL_PREFERENCES) {
  const travelers = Math.max(1, Math.round(nonNegative(trip.travelers, preferences.default_party_size || 2)));
  const days = tripLengthDays(trip, preferences.preferred_trip_length_days || 7);
  const lengthFactor = Math.max(0.65, 0.45 + (days / 12.5));
  return Math.round((item.base_cost_per_person * travelers * lengthFactor) / 25) * 25;
}

function automatedDestinationResearch(trip = {}, preferences = DEFAULT_TRAVEL_PREFERENCES, options = {}) {
  const prefs = normalizeTravelPreferences(preferences);
  const limit = Math.max(1, Math.min(12, Math.round(nonNegative(options.limit, 6) || 6)));
  const existingNames = new Set((trip.destination_candidates || []).map(item => String(item.name || '').toLowerCase()));
  const avoided = prefs.avoid_destinations.map(x => x.toLowerCase());
  const candidates = DESTINATION_RESEARCH_CATALOG
    .filter(item => !avoided.some(a => item.name.toLowerCase().includes(a)))
    .map(item => {
      const estimated_total_cost = estimateSeedCost(item, trip, prefs);
      const seed = {
        ...item,
        estimated_total_cost,
        weather_score: clamp(item.weather_score + seasonalWeatherAdjustment(item.name, trip?.dates?.start)),
        source: 'Atlas seed research',
        research_confidence: 0.55,
        research_type: 'seed_estimate',
        research_assumptions: `Planning estimate for ${trip.travelers || prefs.default_party_size || 2} traveler(s), about ${tripLengthDays(trip, prefs.preferred_trip_length_days)} days. Not a live fare or hotel quote.`,
        generated_at: new Date().toISOString()
      };
      const candidate = normalizeDestinationCandidate(seed, prefs, trip);
      candidate.research_confidence = seed.research_confidence;
      candidate.research_type = seed.research_type;
      candidate.research_assumptions = seed.research_assumptions;
      candidate.generated_at = seed.generated_at;
      candidate.tags = item.tags;
      return candidate;
    })
    .filter(item => options.include_existing || !existingNames.has(item.name.toLowerCase()))
    .sort((a,b) => Number(b.score?.atlas_fit||0)-Number(a.score?.atlas_fit||0));
  const selected = candidates.slice(0, limit);
  return {
    generated_at: new Date().toISOString(),
    source: 'Atlas seed research',
    live_data: false,
    origin_airport: trip.origin_airport || prefs.home_airport,
    travelers: trip.travelers || prefs.default_party_size,
    trip_length_days: tripLengthDays(trip, prefs.preferred_trip_length_days),
    target_budget: nonNegative(trip?.budget?.target),
    candidate_count: selected.length,
    candidates: selected,
    note: 'Planning estimates only; verify live flight, lodging, weather, fees, and availability before booking.'
  };
}


function flightPriceScore(totalPrice, targetPerTraveler = 0, travelers = 1) {
  const price = nonNegative(totalPrice);
  if (!price) return 5;
  const target = nonNegative(targetPerTraveler) * Math.max(1, Math.round(nonNegative(travelers, 1)));
  if (!target) return price <= 800 ? 9 : price <= 1400 ? 8 : price <= 2200 ? 6 : 4;
  if (price <= target) return clamp(9 + Math.min(1, (target-price)/target*2));
  return clamp(9 - ((price-target)/target)*15);
}

function flightScheduleScore(option = {}) {
  const depart = String(option.departure_time || option.outbound_departure || '');
  const arrive = String(option.arrival_time || option.outbound_arrival || '');
  let score = 7;
  const dh = depart.match(/T(\d{2}):/)?.[1];
  const ah = arrive.match(/T(\d{2}):/)?.[1];
  if (dh) { const h=Number(dh); if (h < 6) score -= 2; else if (h >= 8 && h <= 14) score += 1; }
  if (ah) { const h=Number(ah); if (h >= 23 || h < 5) score -= 1.5; }
  return clamp(score);
}

function flightAtlasScore(option = {}, preferences = DEFAULT_TRAVEL_PREFERENCES, trip = {}) {
  const travelers = Math.max(1, Math.round(nonNegative(trip.travelers, preferences.default_party_size || 1)));
  const targetTrip = nonNegative(trip?.budget?.target);
  const targetFlight = targetTrip ? (targetTrip * 0.35) : 0;
  const total = nonNegative(option.total_price, nonNegative(option.base_fare)+nonNegative(option.taxes_fees)+nonNegative(option.baggage_fees)+nonNegative(option.seat_fees));
  const duration = nonNegative(option.total_travel_hours || option.duration_hours);
  const stops = Math.max(0, Math.round(nonNegative(option.layovers ?? option.stops)));
  const fees = nonNegative(option.baggage_fees)+nonNegative(option.seat_fees)+nonNegative(option.other_fees);
  const price = flightPriceScore(total, targetFlight ? targetFlight/travelers : 0, travelers);
  const durationScore = travelTimeScore(duration, preferences.preferred_max_flight_hours || 7);
  const stopScore = clamp(10 - stops * 3.5);
  const schedule = flightScheduleScore(option);
  const feeScore = total ? clamp(10 - (fees/total)*20) : 7;
  const flexibility = clamp((option.refundable ? 5 : 0) + (option.changeable ? 4 : 0) + (option.bags_included ? 1 : 0));
  const weights = { price:0.30, duration:0.20, stops:0.20, schedule:0.15, fees:0.10, flexibility:0.05 };
  const components = { price, duration:durationScore, stops:stopScore, schedule, fees:feeScore, flexibility };
  const score = Math.round(Object.entries(weights).reduce((sum,[k,w])=>sum+components[k]*w,0)*10);
  const warnings=[];
  if (stops>1) warnings.push(`${stops} connections`);
  if (duration > (preferences.preferred_max_flight_hours||7)*1.4) warnings.push('Long travel day');
  if (fees > 0 && total && fees/total > .15) warnings.push('High add-on fees');
  return { atlas_flight_score: Math.max(0,Math.min(100,score)), components:Object.fromEntries(Object.entries(components).map(([k,v])=>[k,Math.round(v*10)/10])), weights, warnings };
}

function normalizeFlightOption(input = {}, preferences = DEFAULT_TRAVEL_PREFERENCES, trip = {}) {
  const base = nonNegative(input.base_fare);
  const taxes = nonNegative(input.taxes_fees);
  const bags = nonNegative(input.baggage_fees);
  const seats = nonNegative(input.seat_fees);
  const other = nonNegative(input.other_fees);
  const total = nonNegative(input.total_price, base+taxes+bags+seats+other);
  const option = {
    id: input.id || crypto.randomUUID(),
    destination_id: String(input.destination_id || '').trim(),
    origin_airport: String(input.origin_airport || trip.origin_airport || preferences.home_airport || '').trim().toUpperCase(),
    destination_airport: String(input.destination_airport || '').trim().toUpperCase(),
    airline: String(input.airline || '').trim(),
    flight_number: String(input.flight_number || '').trim(),
    departure_time: String(input.departure_time || '').trim(),
    arrival_time: String(input.arrival_time || '').trim(),
    return_departure_time: String(input.return_departure_time || '').trim(),
    return_arrival_time: String(input.return_arrival_time || '').trim(),
    total_travel_hours: nonNegative(input.total_travel_hours || input.duration_hours),
    layovers: Math.max(0, Math.round(nonNegative(input.layovers ?? input.stops))),
    connection_airports: normalizeStringArray(input.connection_airports),
    cabin: String(input.cabin || 'Economy').trim(),
    base_fare: base, taxes_fees: taxes, baggage_fees: bags, seat_fees: seats, other_fees: other, total_price: total,
    currency: String(input.currency || preferences.currency || 'USD').trim().toUpperCase(),
    bags_included: Boolean(input.bags_included), carry_on_included: input.carry_on_included !== false,
    refundable: Boolean(input.refundable), changeable: Boolean(input.changeable),
    source: String(input.source || '').trim(), provider: String(input.provider || input.source || '').trim(), source_url: String(input.source_url || '').trim(),
    captured_at: String(input.captured_at || '').trim(), live_data: Boolean(input.live_data),
    price_history: Array.isArray(input.price_history) ? input.price_history.map(x=>({captured_at:String(x.captured_at||''), total_price:nonNegative(x.total_price)})).filter(x=>x.total_price>0) : [],
    notes: String(input.notes || '').trim(), updated_at: new Date().toISOString()
  };
  if (option.total_price && option.captured_at && !option.price_history.some(x=>x.captured_at===option.captured_at && x.total_price===option.total_price)) option.price_history.push({captured_at:option.captured_at,total_price:option.total_price});
  option.score = flightAtlasScore(option, preferences, trip);
  return option;
}

function compareFlights(trip = {}, preferences = DEFAULT_TRAVEL_PREFERENCES, destinationId = '') {
  const options = (trip.flight_options || []).filter(x=>!destinationId || x.destination_id===destinationId).map(x=>normalizeFlightOption(x,preferences,trip)).sort((a,b)=>Number(b.score?.atlas_flight_score||0)-Number(a.score?.atlas_flight_score||0));
  const leader=options[0]||null;
  return { count:options.length, leader, runner_up:options[1]||null, score_gap: leader&&options[1] ? leader.score.atlas_flight_score-options[1].score.atlas_flight_score : null, options };
}


function resortTotalCost(input = {}) {
  const nightly = nonNegative(input.nightly_rate);
  const nights = Math.max(1, Math.round(nonNegative(input.nights, 1)));
  const roomSubtotal = nightly * nights;
  const explicit = nonNegative(input.total_stay_cost);
  return explicit > 0 ? explicit : roomSubtotal + nonNegative(input.taxes_fees) + nonNegative(input.resort_fees) + nonNegative(input.other_fees);
}

function resortAtlasScore(option = {}, preferences = DEFAULT_TRAVEL_PREFERENCES, trip = {}) {
  const targetTrip = nonNegative(trip?.budget?.target);
  const flightOptions = (trip.flight_options || []).filter(f => !option.destination_id || f.destination_id === option.destination_id);
  const bestFlight = flightOptions.sort((a,b)=>nonNegative(a.total_price)-nonNegative(b.total_price))[0];
  const lodgingBudget = targetTrip ? Math.max(0, targetTrip - nonNegative(bestFlight?.total_price, targetTrip * 0.30)) : 0;
  const total = resortTotalCost(option);
  const value = budgetFitScore(total, lodgingBudget);
  const review = option.review_score ? clamp(((Number(option.review_score)-3.5)/1.5)*10) : 6;
  const beach = clamp(option.beach_score ?? 5);
  const food = clamp(option.food_score ?? 5);
  const bars = clamp(option.bar_score ?? 5);
  const pools = clamp(option.pool_score ?? 5);
  const room = clamp(option.room_score ?? 5);
  const location = clamp(option.location_score ?? 5);
  let fit = 5;
  const desired = preferences.preferences || {};
  const checks = [];
  if (desired.all_inclusive) checks.push(Boolean(option.all_inclusive));
  if (desired.adults_only) checks.push(Boolean(option.adults_only));
  if (desired.beach) checks.push(beach >= 7);
  if (desired.relaxation) checks.push(Boolean(option.quiet_relaxation) || pools >= 7 || beach >= 7);
  if (desired.nightlife) checks.push(bars >= 7);
  if (desired.local_food) checks.push(food >= 7);
  if (checks.length) fit = clamp((checks.filter(Boolean).length/checks.length)*10);
  const allInclusiveValue = option.all_inclusive ? clamp(6 + (food+bars)/5) : (desired.all_inclusive ? 2 : 6);
  const weights = { value:0.25, fit:0.20, reviews:0.15, beach:0.10, food_bar:0.10, room:0.08, pools:0.05, location:0.05, all_inclusive_value:0.02 };
  const components = { value, fit, reviews:review, beach, food_bar:(food+bars)/2, room, pools, location, all_inclusive_value:allInclusiveValue };
  const score = Math.round(Object.entries(weights).reduce((sum,[k,w])=>sum+(components[k]||0)*w,0)*10);
  const warnings=[];
  if (desired.adults_only && !option.adults_only) warnings.push('Not adults-only');
  if (desired.all_inclusive && !option.all_inclusive) warnings.push('Not all-inclusive');
  if (nonNegative(option.resort_fees) > 250) warnings.push('High resort fees');
  if (option.review_count && Number(option.review_count) < 100) warnings.push('Limited review volume');
  if (beach < 6 && desired.beach) warnings.push('Beach quality below preference');
  return { atlas_resort_score: Math.max(0,Math.min(100,score)), components:Object.fromEntries(Object.entries(components).map(([k,v])=>[k,Math.round(v*10)/10])), weights, warnings };
}

function normalizeResortOption(input = {}, preferences = DEFAULT_TRAVEL_PREFERENCES, trip = {}) {
  const option = {
    id: input.id || crypto.randomUUID(),
    destination_id: String(input.destination_id || '').trim(),
    name: String(input.name || '').trim(),
    brand: String(input.brand || '').trim(),
    room_category: String(input.room_category || '').trim(),
    nights: Math.max(1, Math.round(nonNegative(input.nights, tripLengthDays(trip, preferences.preferred_trip_length_days || 7)-1 || 1))),
    nightly_rate: nonNegative(input.nightly_rate),
    taxes_fees: nonNegative(input.taxes_fees),
    resort_fees: nonNegative(input.resort_fees),
    other_fees: nonNegative(input.other_fees),
    total_stay_cost: 0,
    currency: String(input.currency || preferences.currency || 'USD').trim().toUpperCase(),
    all_inclusive: Boolean(input.all_inclusive), adults_only: Boolean(input.adults_only), quiet_relaxation: Boolean(input.quiet_relaxation),
    beach_score: clamp(input.beach_score ?? 5), pool_score: clamp(input.pool_score ?? 5), food_score: clamp(input.food_score ?? 5), bar_score: clamp(input.bar_score ?? 5), room_score: clamp(input.room_score ?? 5), location_score: clamp(input.location_score ?? 5),
    restaurant_count: Math.max(0, Math.round(nonNegative(input.restaurant_count))), bar_count: Math.max(0, Math.round(nonNegative(input.bar_count))), pool_count: Math.max(0, Math.round(nonNegative(input.pool_count))),
    review_score: Math.max(0, Math.min(5, Number(input.review_score) || 0)), review_count: Math.max(0, Math.round(nonNegative(input.review_count))),
    source: String(input.source || '').trim(), provider: String(input.provider || input.source || '').trim(), source_url: String(input.source_url || '').trim(),
    captured_at: String(input.captured_at || '').trim(), live_data: Boolean(input.live_data), availability: String(input.availability || '').trim(),
    notes: String(input.notes || '').trim(), updated_at: new Date().toISOString()
  };
  option.total_stay_cost = resortTotalCost({ ...option, total_stay_cost: input.total_stay_cost });
  option.score = resortAtlasScore(option, preferences, trip);
  return option;
}

function compareResorts(trip = {}, preferences = DEFAULT_TRAVEL_PREFERENCES, destinationId = '') {
  const options = (trip.resort_options || []).filter(x=>!destinationId || x.destination_id===destinationId).map(x=>normalizeResortOption(x,preferences,trip)).sort((a,b)=>Number(b.score?.atlas_resort_score||0)-Number(a.score?.atlas_resort_score||0));
  const leader=options[0]||null;
  return { count:options.length, leader, runner_up:options[1]||null, score_gap: leader&&options[1] ? leader.score.atlas_resort_score-options[1].score.atlas_resort_score : null, options };
}



function packageAtlasScore(bundle = {}, preferences = DEFAULT_TRAVEL_PREFERENCES, trip = {}) {
  const target = nonNegative(trip?.budget?.target);
  const destination = bundle.destination || {};
  const flight = bundle.flight || {};
  const resort = bundle.resort || {};
  const extras = nonNegative(bundle.transfer_cost) + nonNegative(bundle.activity_allowance) + nonNegative(bundle.other_costs);
  const total = nonNegative(flight.total_price) + resortTotalCost(resort) + extras;
  const value = budgetFitScore(total, target);
  const destinationFit = clamp(nonNegative(destination?.score?.atlas_fit, 50) / 10);
  const flightFit = clamp(nonNegative(flight?.score?.atlas_flight_score, 50) / 10);
  const resortFit = clamp(nonNegative(resort?.score?.atlas_resort_score, 50) / 10);
  let simplicity = 5;
  simplicity += Math.max(0, 2 - nonNegative(flight.layovers) * 1.5);
  if (resort.all_inclusive) simplicity += 1.5;
  if (flight.live_data && resort.live_data) simplicity += 1;
  if (flight.refundable || flight.changeable) simplicity += 0.5;
  simplicity = clamp(simplicity);
  const weights = { value:0.25, destination:0.20, flight:0.20, resort:0.25, simplicity:0.10 };
  const components = { value, destination:destinationFit, flight:flightFit, resort:resortFit, simplicity };
  const score = Math.round(Object.entries(weights).reduce((sum,[k,w])=>sum+(components[k]||0)*w,0)*10);
  const warnings=[];
  if (target && total > target) warnings.push(`Over target budget by $${Math.round(total-target).toLocaleString('en-US')}`);
  if (nonNegative(flight.layovers)>1) warnings.push('Multi-stop flight');
  if (preferences?.preferences?.all_inclusive && !resort.all_inclusive) warnings.push('Resort is not all-inclusive');
  if (preferences?.preferences?.adults_only && !resort.adults_only) warnings.push('Resort is not adults-only');
  if (!flight.live_data || !resort.live_data) warnings.push('Package includes saved/estimated pricing');
  return {
    atlas_package_score: Math.max(0,Math.min(100,score)),
    total_cost: Math.round(total*100)/100,
    budget_target: target,
    budget_delta: target ? Math.round((target-total)*100)/100 : null,
    components:Object.fromEntries(Object.entries(components).map(([k,v])=>[k,Math.round(v*10)/10])),
    weights,
    warnings
  };
}

function optimizeTripPackages(trip = {}, preferences = DEFAULT_TRAVEL_PREFERENCES, options = {}) {
  const destinationId = String(options.destination_id || '').trim();
  const limit = Math.max(1, Math.min(100, Math.round(nonNegative(options.limit, 20))));
  const transferCost = nonNegative(options.transfer_cost);
  const activityAllowance = nonNegative(options.activity_allowance);
  const otherCosts = nonNegative(options.other_costs);
  const destinations = (trip.destination_candidates || []).filter(d=>!destinationId || d.id===destinationId);
  const packages=[];
  for (const destination of destinations) {
    const flights=(trip.flight_options || []).filter(f=>f.destination_id===destination.id).map(f=>normalizeFlightOption(f,preferences,trip));
    const resorts=(trip.resort_options || []).filter(r=>r.destination_id===destination.id).map(r=>normalizeResortOption(r,preferences,trip));
    for (const flight of flights) for (const resort of resorts) {
      const bundle={
        id:`${destination.id}:${flight.id}:${resort.id}`,
        destination,
        flight,
        resort,
        transfer_cost:transferCost,
        activity_allowance:activityAllowance,
        other_costs:otherCosts
      };
      bundle.score=packageAtlasScore(bundle,preferences,trip);
      bundle.total_cost=bundle.score.total_cost;
      bundle.live_data=Boolean(flight.live_data && resort.live_data);
      bundle.source_status=bundle.live_data?'live':'mixed_or_saved';
      packages.push(bundle);
    }
  }
  packages.sort((a,b)=>Number(b.score?.atlas_package_score||0)-Number(a.score?.atlas_package_score||0) || Number(a.total_cost||0)-Number(b.total_cost||0));
  const ranked=packages.slice(0,limit).map((item,index)=>({...item,rank:index+1}));
  const leader=ranked[0]||null;
  const runner=ranked[1]||null;
  return {
    count:packages.length,
    returned_count:ranked.length,
    leader,
    runner_up:runner,
    score_gap:leader&&runner ? leader.score.atlas_package_score-runner.score.atlas_package_score : null,
    packages:ranked,
    missing:{
      destinations_without_flights:destinations.filter(d=>!(trip.flight_options||[]).some(f=>f.destination_id===d.id)).map(d=>d.name),
      destinations_without_resorts:destinations.filter(d=>!(trip.resort_options||[]).some(r=>r.destination_id===d.id)).map(d=>d.name)
    }
  };
}


const BOOKING_VERIFICATION_TEMPLATE = [
  { id: 'flight_quote', label: 'Flight price and itinerary rechecked', required: true },
  { id: 'resort_quote', label: 'Resort total, taxes, and fees rechecked', required: true },
  { id: 'availability', label: 'Flight and resort availability confirmed', required: true },
  { id: 'cancellation_terms', label: 'Cancellation/change terms reviewed', required: true },
  { id: 'traveler_details', label: 'Traveler names and required documents checked', required: true }
];

function normalizeBookingDecision(input = {}) {
  const verificationInput = Array.isArray(input.verification) ? input.verification : [];
  const verification = BOOKING_VERIFICATION_TEMPLATE.map(template => {
    const current = verificationInput.find(item => item && item.id === template.id) || {};
    return { ...template, complete: Boolean(current.complete), completed_at: current.complete ? String(current.completed_at || '') : '', notes: String(current.notes || '').trim() };
  });
  return {
    shortlist_package_ids: [...new Set((Array.isArray(input.shortlist_package_ids) ? input.shortlist_package_ids : []).map(String).filter(Boolean))],
    preferred_package_id: String(input.preferred_package_id || '').trim(),
    preferred_locked_at: String(input.preferred_locked_at || '').trim(),
    package_assumptions: {
      transfer_cost: nonNegative(input.package_assumptions?.transfer_cost),
      activity_allowance: nonNegative(input.package_assumptions?.activity_allowance),
      other_costs: nonNegative(input.package_assumptions?.other_costs)
    },
    verification,
    booked_at: String(input.booked_at || '').trim()
  };
}

function bookingDecisionState(trip = {}, preferences = DEFAULT_TRAVEL_PREFERENCES) {
  const decision = normalizeBookingDecision(trip.booking_decision || {});
  const optimization = optimizeTripPackages(trip, preferences, { ...decision.package_assumptions, limit: 100 });
  const packageMap = new Map(optimization.packages.map(pkg => [pkg.id, pkg]));
  const shortlist = decision.shortlist_package_ids.map(id => packageMap.get(id)).filter(Boolean);
  const preferred = packageMap.get(decision.preferred_package_id) || null;
  const required = decision.verification.filter(item => item.required);
  const completed = required.filter(item => item.complete);
  const missing = required.filter(item => !item.complete);
  const ready_to_book = Boolean(preferred && required.length && missing.length === 0);
  return {
    decision,
    shortlist,
    preferred,
    verification: decision.verification,
    verification_complete_count: completed.length,
    verification_required_count: required.length,
    missing_verification: missing,
    ready_to_book,
    status: trip.status || 'Dreaming',
    package_count: optimization.count
  };
}

function updateBookingDecision(trip = {}, input = {}, preferences = DEFAULT_TRAVEL_PREFERENCES) {
  const decision = normalizeBookingDecision(trip.booking_decision || {});
  const assumptions = input.package_assumptions && typeof input.package_assumptions === 'object' ? {
    transfer_cost: nonNegative(input.package_assumptions.transfer_cost),
    activity_allowance: nonNegative(input.package_assumptions.activity_allowance),
    other_costs: nonNegative(input.package_assumptions.other_costs)
  } : decision.package_assumptions;
  const optimization = optimizeTripPackages(trip, preferences, { ...assumptions, limit: 100 });
  const validIds = new Set(optimization.packages.map(pkg => pkg.id));
  if (input.toggle_shortlist_package_id) {
    const id = String(input.toggle_shortlist_package_id);
    if (!validIds.has(id)) throw new Error('Package is not available in the current optimizer results.');
    decision.shortlist_package_ids = decision.shortlist_package_ids.includes(id) ? decision.shortlist_package_ids.filter(x => x !== id) : [...decision.shortlist_package_ids, id];
  }
  if (Object.prototype.hasOwnProperty.call(input, 'preferred_package_id')) {
    const id = String(input.preferred_package_id || '');
    if (id && !validIds.has(id)) throw new Error('Preferred package is not available in the current optimizer results.');
    decision.preferred_package_id = id;
    decision.preferred_locked_at = id ? new Date().toISOString() : '';
    if (id && !decision.shortlist_package_ids.includes(id)) decision.shortlist_package_ids.push(id);
  }
  if (input.verification_item && typeof input.verification_item === 'object') {
    const item = decision.verification.find(v => v.id === input.verification_item.id);
    if (!item) throw new Error('Unknown booking verification item.');
    item.complete = Boolean(input.verification_item.complete);
    item.completed_at = item.complete ? new Date().toISOString() : '';
    if (Object.prototype.hasOwnProperty.call(input.verification_item, 'notes')) item.notes = String(input.verification_item.notes || '').trim();
  }
  decision.package_assumptions = assumptions;
  trip.booking_decision = decision;
  if ((decision.shortlist_package_ids.length || decision.preferred_package_id) && ['Dreaming','Researching'].includes(trip.status)) trip.status = 'Planning';
  trip.updated_at = new Date().toISOString();
  return bookingDecisionState(trip, preferences);
}

function bookPreferredPackage(trip = {}, preferences = DEFAULT_TRAVEL_PREFERENCES) {
  const state = bookingDecisionState(trip, preferences);
  if (!state.preferred) throw new Error('Choose and lock a preferred package before booking.');
  if (!state.ready_to_book) throw new Error(`Complete booking verification first: ${state.missing_verification.map(item => item.label).join('; ')}`);
  trip.booking_decision = normalizeBookingDecision(trip.booking_decision || {});
  trip.booking_decision.booked_at = new Date().toISOString();
  trip.status = 'Booked';
  trip.updated_at = new Date().toISOString();
  return bookingDecisionState(trip, preferences);
}



const TRIP_READINESS_TEMPLATE = [
  { id: 'flight_confirmation', label: 'Flight confirmation saved', required: true },
  { id: 'lodging_confirmation', label: 'Lodging confirmation saved', required: true },
  { id: 'payments_current', label: 'Required trip payments complete or scheduled', required: true },
  { id: 'travel_documents', label: 'Travel documents checked', required: true },
  { id: 'ground_transport', label: 'Airport / ground transportation plan confirmed', required: true },
  { id: 'itinerary_ready', label: 'Core itinerary and reservation details ready', required: true }
];

function normalizeTripOperations(input = {}) {
  const confirmations = Array.isArray(input.confirmations) ? input.confirmations.map(item => ({
    id: String(item?.id || crypto.randomUUID()),
    type: String(item?.type || 'reservation').trim(),
    name: String(item?.name || '').trim(),
    confirmation_number: String(item?.confirmation_number || '').trim(),
    provider: String(item?.provider || '').trim(),
    date: String(item?.date || '').trim(),
    time: String(item?.time || '').trim(),
    location: String(item?.location || '').trim(),
    notes: String(item?.notes || '').trim(),
    status: String(item?.status || 'confirmed').trim()
  })) : [];
  const payments = Array.isArray(input.payments) ? input.payments.map(item => ({
    id: String(item?.id || crypto.randomUUID()),
    label: String(item?.label || '').trim(),
    amount: nonNegative(item?.amount),
    due_date: String(item?.due_date || '').trim(),
    status: ['planned','scheduled','paid'].includes(item?.status) ? item.status : 'planned',
    paid_at: String(item?.paid_at || '').trim(),
    notes: String(item?.notes || '').trim()
  })) : [];
  const sourceTasks = Array.isArray(input.readiness_tasks) ? input.readiness_tasks : [];
  const readiness_tasks = TRIP_READINESS_TEMPLATE.map(template => {
    const current = sourceTasks.find(item => item && item.id === template.id) || {};
    return { ...template, complete: Boolean(current.complete), completed_at: current.complete ? String(current.completed_at || '') : '', notes: String(current.notes || '').trim() };
  });
  return {
    confirmations,
    payments,
    readiness_tasks,
    itinerary_notes: String(input.itinerary_notes || '').trim(),
    last_updated_at: String(input.last_updated_at || '').trim()
  };
}

function tripOperationsState(trip = {}) {
  const operations = normalizeTripOperations(trip.trip_operations || {});
  const required = operations.readiness_tasks.filter(item => item.required);
  const complete = required.filter(item => item.complete);
  const missing = required.filter(item => !item.complete);
  const paid = operations.payments.filter(item => item.status === 'paid').reduce((sum, item) => sum + nonNegative(item.amount), 0);
  const scheduled = operations.payments.filter(item => item.status === 'scheduled').reduce((sum, item) => sum + nonNegative(item.amount), 0);
  const planned = operations.payments.filter(item => item.status === 'planned').reduce((sum, item) => sum + nonNegative(item.amount), 0);
  const readiness_percent = required.length ? Math.round((complete.length / required.length) * 100) : 0;
  return {
    operations,
    status: trip.status || 'Dreaming',
    confirmations: operations.confirmations,
    payments: operations.payments,
    readiness_tasks: operations.readiness_tasks,
    readiness_complete_count: complete.length,
    readiness_required_count: required.length,
    readiness_percent,
    missing_readiness: missing,
    ready_to_travel: Boolean(trip.status === 'Booked' && required.length && missing.length === 0),
    payment_summary: { paid, scheduled, planned, total: paid + scheduled + planned }
  };
}

function updateTripOperations(trip = {}, input = {}) {
  const operations = normalizeTripOperations(trip.trip_operations || {});
  if (input.confirmation && typeof input.confirmation === 'object') {
    const incoming = input.confirmation;
    const id = String(incoming.id || '').trim();
    if (incoming.delete && id) operations.confirmations = operations.confirmations.filter(item => item.id !== id);
    else {
      const normalized = normalizeTripOperations({ confirmations: [{ ...incoming, id: id || crypto.randomUUID() }] }).confirmations[0];
      const index = operations.confirmations.findIndex(item => item.id === normalized.id);
      if (index >= 0) operations.confirmations[index] = { ...operations.confirmations[index], ...normalized };
      else operations.confirmations.push(normalized);
    }
  }
  if (input.payment && typeof input.payment === 'object') {
    const incoming = input.payment;
    const id = String(incoming.id || '').trim();
    if (incoming.delete && id) operations.payments = operations.payments.filter(item => item.id !== id);
    else {
      const normalized = normalizeTripOperations({ payments: [{ ...incoming, id: id || crypto.randomUUID() }] }).payments[0];
      if (normalized.status === 'paid' && !normalized.paid_at) normalized.paid_at = new Date().toISOString();
      const index = operations.payments.findIndex(item => item.id === normalized.id);
      if (index >= 0) operations.payments[index] = { ...operations.payments[index], ...normalized };
      else operations.payments.push(normalized);
    }
  }
  if (input.readiness_task && typeof input.readiness_task === 'object') {
    const task = operations.readiness_tasks.find(item => item.id === input.readiness_task.id);
    if (!task) throw new Error('Unknown trip readiness task.');
    task.complete = Boolean(input.readiness_task.complete);
    task.completed_at = task.complete ? new Date().toISOString() : '';
    if (Object.prototype.hasOwnProperty.call(input.readiness_task, 'notes')) task.notes = String(input.readiness_task.notes || '').trim();
  }
  if (Object.prototype.hasOwnProperty.call(input, 'itinerary_notes')) operations.itinerary_notes = String(input.itinerary_notes || '').trim();
  operations.last_updated_at = new Date().toISOString();
  trip.trip_operations = operations;
  trip.updated_at = operations.last_updated_at;
  return tripOperationsState(trip);
}



const PRE_DEPARTURE_CHECKLIST = [
  { id: 'online_checkin', label: 'Airline / carrier check-in handled', required: true },
  { id: 'bags_packed', label: 'Bags packed and baggage rules checked', required: true },
  { id: 'documents_in_hand', label: 'IDs / passports / required documents in hand', required: true },
  { id: 'departure_transport', label: 'Ride / parking / airport departure plan confirmed', required: true },
  { id: 'arrival_access', label: 'Arrival access ready (transfer, lodging address, first-day plan)', required: true },
  { id: 'home_ready', label: 'Home / pets / mail / security plan handled', required: true }
];

function normalizePreDeparture(input = {}) {
  const source = Array.isArray(input.checklist) ? input.checklist : [];
  return {
    checklist: PRE_DEPARTURE_CHECKLIST.map(template => {
      const current = source.find(item => item && item.id === template.id) || {};
      return { ...template, complete: Boolean(current.complete), completed_at: current.complete ? String(current.completed_at || '') : '', notes: String(current.notes || '').trim() };
    }),
    document_notes: String(input.document_notes || '').trim(),
    packing_notes: String(input.packing_notes || '').trim(),
    departure_notes: String(input.departure_notes || '').trim(),
    last_updated_at: String(input.last_updated_at || '').trim()
  };
}

function preDepartureState(trip = {}, now = Date.now()) {
  const pre = normalizePreDeparture(trip.pre_departure || {});
  const ops = tripOperationsState(trip);
  const required = pre.checklist.filter(item => item.required);
  const complete = required.filter(item => item.complete);
  const startMs = Date.parse(trip?.dates?.start || '');
  const daysUntil = Number.isFinite(startMs) ? Math.ceil((startMs - now) / 86400000) : null;
  const plannedPayments = ops.payments.filter(item => item.status === 'planned');
  const paymentBlockers = plannedPayments.filter(item => {
    const due = Date.parse(item.due_date || '');
    return !Number.isFinite(startMs) || !Number.isFinite(due) || due <= startMs;
  });
  const hasFlight = ops.confirmations.some(item => item.type === 'flight' && item.confirmation_number);
  const hasLodging = ops.confirmations.some(item => item.type === 'lodging' && item.confirmation_number);
  const confirmationScore = (hasFlight ? 5 : 0) + (hasLodging ? 5 : 0);
  const operationsScore = Math.round((ops.readiness_percent || 0) * 0.4);
  const checklistScore = required.length ? Math.round((complete.length / required.length) * 35) : 0;
  const paymentScore = paymentBlockers.length ? 0 : 15;
  const readinessScore = Math.max(0, Math.min(100, operationsScore + checklistScore + paymentScore + confirmationScore));
  const blockers = [];
  if (trip.status !== 'Booked') blockers.push('Trip must be Booked before departure clearance.');
  blockers.push(...ops.missing_readiness.map(item => item.label));
  blockers.push(...required.filter(item => !item.complete).map(item => item.label));
  if (!hasFlight) blockers.push('Flight confirmation number is missing.');
  if (!hasLodging) blockers.push('Lodging confirmation number is missing.');
  if (paymentBlockers.length) blockers.push(`${paymentBlockers.length} planned payment${paymentBlockers.length === 1 ? '' : 's'} still need action before departure.`);
  const ready = trip.status === 'Booked' && blockers.length === 0 && readinessScore === 100;
  return {
    pre_departure: pre,
    status: trip.status || 'Dreaming',
    days_until_departure: daysUntil,
    readiness_score: readinessScore,
    ready_to_depart: ready,
    checklist_complete_count: complete.length,
    checklist_required_count: required.length,
    checklist: pre.checklist,
    blockers,
    confirmation_summary: { flight: hasFlight, lodging: hasLodging, total: ops.confirmations.length },
    payment_summary: { ...ops.payment_summary, planned_blockers: paymentBlockers.length },
    operations_readiness_percent: ops.readiness_percent
  };
}

function updatePreDeparture(trip = {}, input = {}, now = Date.now()) {
  if (trip.status !== 'Booked') throw new Error('Pre-departure readiness is available after the trip is Booked.');
  const pre = normalizePreDeparture(trip.pre_departure || {});
  if (input.checklist_item && typeof input.checklist_item === 'object') {
    const item = pre.checklist.find(row => row.id === input.checklist_item.id);
    if (!item) throw new Error('Unknown pre-departure checklist item.');
    item.complete = Boolean(input.checklist_item.complete);
    item.completed_at = item.complete ? new Date(now).toISOString() : '';
    if (Object.prototype.hasOwnProperty.call(input.checklist_item, 'notes')) item.notes = String(input.checklist_item.notes || '').trim();
  }
  for (const key of ['document_notes','packing_notes','departure_notes']) if (Object.prototype.hasOwnProperty.call(input, key)) pre[key] = String(input[key] || '').trim();
  pre.last_updated_at = new Date(now).toISOString();
  trip.pre_departure = pre;
  trip.updated_at = pre.last_updated_at;
  return preDepartureState(trip, now);
}

function startTripTraveling(trip = {}) {
  const state = preDepartureState(trip);
  if (trip.status !== 'Booked') throw new Error('Trip must be Booked before it can move to Traveling.');
  if (!state.ready_to_depart) throw new Error(`Complete pre-departure clearance first: ${state.blockers.join('; ')}`);
  trip.status = 'Traveling';
  trip.updated_at = new Date().toISOString();
  return tripOperationsState(trip);
}


function normalizeLiveTrip(input = {}) {
  const itinerary = Array.isArray(input.itinerary) ? input.itinerary.map(item => ({
    id: String(item?.id || crypto.randomUUID()),
    title: String(item?.title || '').trim(),
    type: String(item?.type || 'activity').trim(),
    date: String(item?.date || '').trim(),
    time: String(item?.time || '').trim(),
    end_time: String(item?.end_time || '').trim(),
    location: String(item?.location || '').trim(),
    confirmation_number: String(item?.confirmation_number || '').trim(),
    notes: String(item?.notes || '').trim(),
    status: ['planned','done','changed','cancelled'].includes(item?.status) ? item.status : 'planned'
  })) : [];
  const expenses = Array.isArray(input.expenses) ? input.expenses.map(item => ({
    id: String(item?.id || crypto.randomUUID()),
    label: String(item?.label || '').trim(),
    amount: nonNegative(item?.amount),
    category: String(item?.category || 'other').trim(),
    date: String(item?.date || '').trim(),
    notes: String(item?.notes || '').trim()
  })) : [];
  const issues = Array.isArray(input.issues) ? input.issues.map(item => ({
    id: String(item?.id || crypto.randomUUID()),
    title: String(item?.title || '').trim(),
    severity: ['low','medium','high'].includes(item?.severity) ? item.severity : 'medium',
    status: ['open','resolved'].includes(item?.status) ? item.status : 'open',
    notes: String(item?.notes || '').trim(),
    created_at: String(item?.created_at || new Date().toISOString())
  })) : [];
  return { itinerary, expenses, issues, day_notes: String(input.day_notes || '').trim(), last_updated_at: String(input.last_updated_at || '').trim() };
}

function liveTripState(trip = {}, now = new Date()) {
  const live = normalizeLiveTrip(trip.live_trip || {});
  const today = now.toISOString().slice(0,10);
  const timeline = [...live.itinerary].sort((a,b)=>`${a.date}T${a.time||'23:59'}`.localeCompare(`${b.date}T${b.time||'23:59'}`));
  const today_items = timeline.filter(item => item.date === today && item.status !== 'cancelled');
  const nowKey = now.toISOString().slice(0,16);
  const upcoming = timeline.filter(item => item.status === 'planned' && item.date && `${item.date}T${item.time||'23:59'}` >= nowKey)[0] || null;
  const spent = live.expenses.reduce((sum,item)=>sum+nonNegative(item.amount),0);
  const openIssues = live.issues.filter(item=>item.status==='open');
  return {
    live_trip: live,
    status: trip.status || 'Dreaming',
    today,
    today_items,
    next_up: upcoming,
    expense_total: Math.round(spent*100)/100,
    expense_count: live.expenses.length,
    open_issues: openIssues,
    open_issue_count: openIssues.length,
    confirmation_count: normalizeTripOperations(trip.trip_operations || {}).confirmations.length
  };
}

function updateLiveTrip(trip = {}, input = {}) {
  if (trip.status !== 'Traveling') throw new Error('Trip must be Traveling to use the Live Trip Command Center.');
  const live = normalizeLiveTrip(trip.live_trip || {});
  if (input.itinerary_item && typeof input.itinerary_item === 'object') {
    const incoming=input.itinerary_item, id=String(incoming.id||'').trim();
    if(incoming.delete && id) live.itinerary=live.itinerary.filter(x=>x.id!==id);
    else { const item=normalizeLiveTrip({itinerary:[{...incoming,id:id||crypto.randomUUID()}]}).itinerary[0]; const idx=live.itinerary.findIndex(x=>x.id===item.id); if(idx>=0) live.itinerary[idx]={...live.itinerary[idx],...item}; else live.itinerary.push(item); }
  }
  if (input.expense && typeof input.expense === 'object') {
    const incoming=input.expense, id=String(incoming.id||'').trim();
    if(incoming.delete && id) live.expenses=live.expenses.filter(x=>x.id!==id);
    else { const item=normalizeLiveTrip({expenses:[{...incoming,id:id||crypto.randomUUID()}]}).expenses[0]; const idx=live.expenses.findIndex(x=>x.id===item.id); if(idx>=0) live.expenses[idx]={...live.expenses[idx],...item}; else live.expenses.push(item); }
  }
  if (input.issue && typeof input.issue === 'object') {
    const incoming=input.issue, id=String(incoming.id||'').trim();
    if(incoming.delete && id) live.issues=live.issues.filter(x=>x.id!==id);
    else { const item=normalizeLiveTrip({issues:[{...incoming,id:id||crypto.randomUUID()}]}).issues[0]; const idx=live.issues.findIndex(x=>x.id===item.id); if(idx>=0) live.issues[idx]={...live.issues[idx],...item}; else live.issues.push(item); }
  }
  if(Object.prototype.hasOwnProperty.call(input,'day_notes')) live.day_notes=String(input.day_notes||'').trim();
  live.last_updated_at=new Date().toISOString(); trip.live_trip=live; trip.updated_at=live.last_updated_at; return liveTripState(trip);
}


const TRIP_REVIEW_RATING_FIELDS = ['overall','destination','flight','resort','value','ease'];


const RESILIENCE_SEVERITIES = ['low','medium','high','critical'];
const RESILIENCE_STATUSES = ['open','monitoring','resolved'];

function normalizeTripResilience(input = {}) {
  const disruptions = Array.isArray(input.disruptions) ? input.disruptions.map(item => ({
    id: String(item?.id || crypto.randomUUID()),
    title: String(item?.title || '').trim(),
    type: String(item?.type || 'other').trim(),
    severity: RESILIENCE_SEVERITIES.includes(item?.severity) ? item.severity : 'medium',
    status: RESILIENCE_STATUSES.includes(item?.status) ? item.status : 'open',
    occurred_at: String(item?.occurred_at || new Date().toISOString()).trim(),
    provider: String(item?.provider || '').trim(),
    confirmation_number: String(item?.confirmation_number || '').trim(),
    original_plan: String(item?.original_plan || '').trim(),
    current_situation: String(item?.current_situation || '').trim(),
    recovery_plan: String(item?.recovery_plan || '').trim(),
    source: String(item?.source || '').trim(),
    live_data: item?.live_data === true,
    resolved_at: item?.status === 'resolved' ? String(item?.resolved_at || '').trim() : '',
    notes: String(item?.notes || '').trim()
  })) : [];
  const emergency_contacts = Array.isArray(input.emergency_contacts) ? input.emergency_contacts.map(item => ({
    id: String(item?.id || crypto.randomUUID()),
    label: String(item?.label || '').trim(),
    name: String(item?.name || '').trim(),
    phone: String(item?.phone || '').trim(),
    email: String(item?.email || '').trim(),
    notes: String(item?.notes || '').trim()
  })) : [];
  return {
    disruptions,
    emergency_contacts,
    recovery_notes: String(input.recovery_notes || '').trim(),
    last_updated_at: String(input.last_updated_at || '').trim()
  };
}

function disruptionAction(item = {}) {
  if (item.status === 'resolved') return 'Resolved — keep the recovery details for the trip record.';
  if (item.severity === 'critical') return 'Stabilize safety and essential travel first; contact the provider or emergency resource now.';
  if (item.type === 'flight') return 'Confirm the carrier’s current itinerary, protect the next reservation, then record the replacement plan.';
  if (item.type === 'lodging') return 'Confirm a usable room or replacement lodging before giving up the original reservation.';
  if (item.type === 'transfer') return 'Secure the next safe transportation option and update any reservation affected by the delay.';
  if (item.type === 'reservation') return 'Contact the reservation provider, confirm alternatives, and update the itinerary once accepted.';
  if (item.type === 'health') return 'Prioritize appropriate medical or emergency help and adjust the itinerary around safety needs.';
  return 'Confirm what changed, identify the next time-sensitive dependency, and record the recovery plan before changing the itinerary.';
}

function tripResilienceState(trip = {}) {
  const resilience = normalizeTripResilience(trip.trip_resilience || {});
  const active = resilience.disruptions.filter(item => item.status !== 'resolved');
  const critical = active.filter(item => item.severity === 'critical');
  const high = active.filter(item => item.severity === 'high');
  const ranked = [...active].sort((a,b) => {
    const weight={critical:4,high:3,medium:2,low:1};
    return (weight[b.severity]||0)-(weight[a.severity]||0) || String(a.occurred_at).localeCompare(String(b.occurred_at));
  });
  const next = ranked[0] || null;
  return {
    trip_resilience: resilience,
    status: trip.status || 'Dreaming',
    active_count: active.length,
    resolved_count: resilience.disruptions.filter(item => item.status === 'resolved').length,
    critical_count: critical.length,
    high_count: high.length,
    stability: critical.length ? 'critical' : high.length ? 'at_risk' : active.length ? 'monitor' : 'stable',
    next_action: next ? { disruption_id: next.id, title: next.title, severity: next.severity, guidance: disruptionAction(next), source_status: next.live_data && next.source ? 'live-backed' : next.source ? 'source-recorded' : 'user-recorded' } : null,
    emergency_contacts: resilience.emergency_contacts,
    disruptions: resilience.disruptions
  };
}

function updateTripResilience(trip = {}, input = {}, now = Date.now()) {
  if (trip.status !== 'Traveling') throw new Error('Trip resilience tools are available while the trip is Traveling.');
  const resilience = normalizeTripResilience(trip.trip_resilience || {});
  if (input.disruption && typeof input.disruption === 'object') {
    const incoming=input.disruption, id=String(incoming.id||'').trim();
    if (incoming.delete && id) resilience.disruptions=resilience.disruptions.filter(item=>item.id!==id);
    else {
      const existing=resilience.disruptions.find(item=>item.id===id) || {};
      const merged={...existing,...incoming,id:id||crypto.randomUUID()};
      if (merged.live_data === true && !String(merged.source||'').trim()) throw new Error('A source is required before a disruption can be marked live-backed.');
      if (merged.status === 'resolved' && !merged.resolved_at) merged.resolved_at=new Date(now).toISOString();
      const normalized=normalizeTripResilience({disruptions:[merged]}).disruptions[0];
      const index=resilience.disruptions.findIndex(item=>item.id===normalized.id);
      if(index>=0) resilience.disruptions[index]=normalized; else resilience.disruptions.push(normalized);
    }
  }
  if (input.emergency_contact && typeof input.emergency_contact === 'object') {
    const incoming=input.emergency_contact, id=String(incoming.id||'').trim();
    if(incoming.delete && id) resilience.emergency_contacts=resilience.emergency_contacts.filter(item=>item.id!==id);
    else {
      const existing=resilience.emergency_contacts.find(item=>item.id===id)||{};
      const normalized=normalizeTripResilience({emergency_contacts:[{...existing,...incoming,id:id||crypto.randomUUID()}]}).emergency_contacts[0];
      const index=resilience.emergency_contacts.findIndex(item=>item.id===normalized.id);
      if(index>=0) resilience.emergency_contacts[index]=normalized; else resilience.emergency_contacts.push(normalized);
    }
  }
  if(Object.prototype.hasOwnProperty.call(input,'recovery_notes')) resilience.recovery_notes=String(input.recovery_notes||'').trim();
  resilience.last_updated_at=new Date(now).toISOString();
  trip.trip_resilience=resilience; trip.updated_at=resilience.last_updated_at;
  return tripResilienceState(trip);
}


const TRIP_WRAP_UP_CHECKLIST = [
  { id: 'disruptions_closed', label: 'Active disruptions resolved or safely handed off' },
  { id: 'refunds_credits_logged', label: 'Refunds, credits, and reimbursements logged' },
  { id: 'claims_followup_set', label: 'Claims or provider follow-up resolved or scheduled' },
  { id: 'final_expenses_checked', label: 'Final trip expenses reviewed' }
];

function normalizeTripWrapUp(input = {}) {
  const checklistInput = Array.isArray(input.checklist) ? input.checklist : [];
  const byId = new Map(checklistInput.map(item => [String(item.id || ''), item]));
  const normalizeMoneyItem = item => ({
    id: item.id || crypto.randomUUID(),
    type: ['refund','credit','claim','reimbursement','other'].includes(item.type) ? item.type : 'other',
    label: String(item.label || '').trim(),
    amount: nonNegative(item.amount),
    status: ['open','pending','resolved','deferred'].includes(item.status) ? item.status : 'open',
    provider: String(item.provider || '').trim(),
    follow_up_date: String(item.follow_up_date || '').trim(),
    reference: String(item.reference || '').trim(),
    notes: String(item.notes || '').trim(),
    resolved_at: String(item.resolved_at || '').trim()
  });
  return {
    checklist: TRIP_WRAP_UP_CHECKLIST.map(template => {
      const current = byId.get(template.id) || {};
      return { ...template, complete: Boolean(current.complete), completed_at: String(current.completed_at || '').trim() };
    }),
    money_items: Array.isArray(input.money_items) ? input.money_items.map(normalizeMoneyItem).filter(item => item.label) : [],
    closure_notes: String(input.closure_notes || '').trim(),
    last_updated_at: String(input.last_updated_at || '').trim()
  };
}

function tripWrapUpState(trip = {}) {
  const wrap = normalizeTripWrapUp(trip.trip_wrap_up || {});
  const resilience = normalizeTripResilience(trip.trip_resilience || {});
  const activeDisruptions = resilience.disruptions.filter(item => item.status !== 'resolved');
  const blockingMoney = wrap.money_items.filter(item => {
    if (item.status === 'resolved') return false;
    if (item.status === 'deferred' && item.follow_up_date) return false;
    return true;
  });
  const checklistComplete = wrap.checklist.filter(item => item.complete).length;
  const blockers = [];
  if (activeDisruptions.length) blockers.push(`${activeDisruptions.length} active disruption${activeDisruptions.length === 1 ? '' : 's'} still open.`);
  if (blockingMoney.length) blockers.push(`${blockingMoney.length} refund/credit/claim item${blockingMoney.length === 1 ? '' : 's'} still need resolution or a follow-up date.`);
  for (const item of wrap.checklist.filter(item => !item.complete)) blockers.push(item.label);
  const totalChecks = TRIP_WRAP_UP_CHECKLIST.length + 2;
  const passed = checklistComplete + (activeDisruptions.length ? 0 : 1) + (blockingMoney.length ? 0 : 1);
  return {
    trip_wrap_up: wrap,
    status: trip.status || 'Dreaming',
    active_disruption_count: activeDisruptions.length,
    open_money_item_count: blockingMoney.length,
    money_items: wrap.money_items,
    checklist_complete_count: checklistComplete,
    checklist_required_count: TRIP_WRAP_UP_CHECKLIST.length,
    closure_score: Math.round((passed / totalChecks) * 100),
    ready_to_complete: trip.status === 'Traveling' && blockers.length === 0,
    blockers
  };
}

function updateTripWrapUp(trip = {}, input = {}, now = Date.now()) {
  if (!['Traveling','Completed'].includes(trip.status)) throw new Error('Trip wrap-up is available while the trip is Traveling or Completed.');
  const wrap = normalizeTripWrapUp(trip.trip_wrap_up || {});
  if (input.checklist_item && typeof input.checklist_item === 'object') {
    const id = String(input.checklist_item.id || '').trim();
    const item = wrap.checklist.find(row => row.id === id);
    if (!item) throw new Error('Unknown trip wrap-up checklist item.');
    item.complete = Boolean(input.checklist_item.complete);
    item.completed_at = item.complete ? new Date(now).toISOString() : '';
  }
  if (input.money_item && typeof input.money_item === 'object') {
    const incoming = input.money_item;
    const id = String(incoming.id || '').trim();
    if (incoming.delete && id) wrap.money_items = wrap.money_items.filter(item => item.id !== id);
    else {
      const existing = wrap.money_items.find(item => item.id === id) || {};
      const merged = { ...existing, ...incoming, id: id || existing.id || crypto.randomUUID() };
      if (merged.status === 'deferred' && !String(merged.follow_up_date || '').trim()) throw new Error('Deferred follow-up items require a follow-up date.');
      if (merged.status === 'resolved' && !merged.resolved_at) merged.resolved_at = new Date(now).toISOString();
      const normalized = normalizeTripWrapUp({ money_items: [merged] }).money_items[0];
      const index = wrap.money_items.findIndex(item => item.id === normalized.id);
      if (index >= 0) wrap.money_items[index] = normalized; else wrap.money_items.push(normalized);
    }
  }
  if (Object.prototype.hasOwnProperty.call(input, 'closure_notes')) wrap.closure_notes = String(input.closure_notes || '').trim();
  wrap.last_updated_at = new Date(now).toISOString();
  trip.trip_wrap_up = wrap;
  trip.updated_at = wrap.last_updated_at;
  return tripWrapUpState(trip);
}

function normalizeTripReview(input = {}) {
  const ratingsInput = input.ratings && typeof input.ratings === 'object' ? input.ratings : {};
  const ratings = Object.fromEntries(TRIP_REVIEW_RATING_FIELDS.map(key => [key, Math.round(clamp(ratingsInput[key], 0, 10))]));
  const boolOrNull = value => value === true ? true : value === false ? false : null;
  return {
    ratings,
    actual_total_spend: nonNegative(input.actual_total_spend),
    loved: normalizeStringArray(input.loved),
    disliked: normalizeStringArray(input.disliked),
    worth_it: normalizeStringArray(input.worth_it),
    avoid_repeat: normalizeStringArray(input.avoid_repeat),
    would_repeat_trip: boolOrNull(input.would_repeat_trip),
    would_return_destination: boolOrNull(input.would_return_destination),
    notes: String(input.notes || '').trim(),
    completed_at: String(input.completed_at || '').trim(),
    learning_applied_at: String(input.learning_applied_at || '').trim()
  };
}

function tripReviewState(trip = {}, preferences = DEFAULT_TRAVEL_PREFERENCES) {
  const review = normalizeTripReview(trip.review || {});
  const live = normalizeLiveTrip(trip.live_trip || {});
  const decision = bookingDecisionState(trip, preferences);
  const packageCost = nonNegative(decision.preferred?.total_cost);
  const liveSpend = live.expenses.reduce((sum,item)=>sum+nonNegative(item.amount),0);
  const derivedSpend = Math.round((packageCost + liveSpend) * 100) / 100;
  const actualSpend = review.actual_total_spend || derivedSpend;
  const budgetTarget = nonNegative(trip.budget?.target);
  const budgetVariance = budgetTarget ? Math.round((actualSpend-budgetTarget)*100)/100 : null;
  const destinationName = decision.preferred?.destination?.name || (trip.destination_candidates||[])[0]?.name || '';
  const suggestions = [];
  const preferredResort = decision.preferred?.resort || null;
  if (review.ratings.resort >= 8 && preferredResort?.all_inclusive && !preferences.preferences?.all_inclusive) suggestions.push({ id:'all_inclusive', type:'preference', key:'all_inclusive', value:true, reason:'You rated an all-inclusive resort highly.' });
  if (review.ratings.destination >= 8) {
    const destination = (trip.destination_candidates||[]).find(d=>d.id===decision.preferred?.destination?.id) || decision.preferred?.destination || {};
    if (Number(destination.beach_score||0)>=8 && !preferences.preferences?.beach) suggestions.push({ id:'beach', type:'preference', key:'beach', value:true, reason:'You rated a strong beach destination highly.' });
  }
  if (review.would_return_destination === false && destinationName && !(preferences.avoid_destinations||[]).some(x=>x.toLowerCase()===destinationName.toLowerCase())) suggestions.push({ id:`avoid:${destinationName}`, type:'avoid_destination', value:destinationName, reason:'You marked this destination as one you would not return to.' });
  const overallRequired = review.ratings.overall > 0;
  return {
    review,
    status: trip.status || 'Dreaming',
    derived_spend: derivedSpend,
    actual_total_spend: actualSpend,
    budget_target: budgetTarget,
    budget_variance: budgetVariance,
    destination_name: destinationName,
    learning_suggestions: suggestions,
    review_complete: overallRequired,
    expense_count: live.expenses.length
  };
}

function updateTripReview(trip = {}, input = {}, preferences = DEFAULT_TRAVEL_PREFERENCES) {
  if (!['Traveling','Completed'].includes(trip.status)) throw new Error('Trip must be Traveling or Completed to use the Post-Trip Review.');
  const current = normalizeTripReview(trip.review || {});
  const merged = { ...current, ...input, ratings: { ...current.ratings, ...(input.ratings || {}) } };
  trip.review = normalizeTripReview(merged);
  if (trip.review.actual_total_spend > 0) trip.budget = normalizeBudget({ actual: trip.review.actual_total_spend }, trip.budget || {});
  trip.updated_at = new Date().toISOString();
  return tripReviewState(trip, preferences);
}

function completeTripReview(trip = {}, preferences = DEFAULT_TRAVEL_PREFERENCES) {
  if (trip.status !== 'Traveling' && trip.status !== 'Completed') throw new Error('Trip must be Traveling before it can be completed.');
  const state = tripReviewState(trip, preferences);
  if (!state.review_complete) throw new Error('Add an overall trip rating before marking the trip Completed.');
  if (trip.status === 'Traveling') {
    const wrapState = tripWrapUpState(trip);
    if (!wrapState.ready_to_complete) throw new Error(`Trip wrap-up is not complete: ${wrapState.blockers.join(' ')}`);
  }
  trip.review = normalizeTripReview(trip.review || {});
  if (!trip.review.actual_total_spend) trip.review.actual_total_spend = state.derived_spend;
  trip.review.completed_at = trip.review.completed_at || new Date().toISOString();
  trip.budget = normalizeBudget({ actual: trip.review.actual_total_spend }, trip.budget || {});
  trip.status = 'Completed';
  trip.updated_at = new Date().toISOString();
  return tripReviewState(trip, preferences);
}

function applyTripLearning(trip = {}, preferences = DEFAULT_TRAVEL_PREFERENCES, suggestionIds = []) {
  if (trip.status !== 'Completed') throw new Error('Complete the trip before applying travel learning.');
  const state = tripReviewState(trip, preferences);
  const selected = new Set((Array.isArray(suggestionIds) ? suggestionIds : []).map(String));
  let next = normalizeTravelPreferences({}, preferences);
  for (const suggestion of state.learning_suggestions) {
    if (!selected.has(suggestion.id)) continue;
    if (suggestion.type === 'preference') next = normalizeTravelPreferences({ preferences: { [suggestion.key]: suggestion.value } }, next);
    if (suggestion.type === 'avoid_destination') next = normalizeTravelPreferences({ avoid_destinations: [...next.avoid_destinations, suggestion.value] }, next);
  }
  trip.review = normalizeTripReview({ ...(trip.review || {}), learning_applied_at: new Date().toISOString() });
  trip.updated_at = new Date().toISOString();
  return { preferences: next, review: tripReviewState(trip, next), applied_ids: [...selected] };
}


function travelIntelligenceDashboard(state = emptyTravelState(), options = {}) {
  const prefs = normalizeTravelPreferences(state.preferences || {});
  const trips = Array.isArray(state.trips) ? state.trips : [];
  const completed = trips.filter(trip => trip.status === 'Completed');
  const reviewed = completed.map(trip => ({ trip, review: normalizeTripReview(trip.review || {}) })).filter(x => x.review.ratings.overall > 0);
  const round1 = n => Math.round((Number(n) || 0) * 10) / 10;
  const average = values => values.length ? values.reduce((a,b)=>a+b,0) / values.length : 0;
  const counts = values => {
    const map = new Map();
    for (const value of values.filter(Boolean)) map.set(value, (map.get(value) || 0) + 1);
    return [...map.entries()].sort((a,b)=>b[1]-a[1] || a[0].localeCompare(b[0])).map(([label,count])=>({label,count}));
  };
  const actuals = completed.map(trip => nonNegative(trip.review?.actual_total_spend || trip.budget?.actual)).filter(v=>v>0);
  const targets = completed.map(trip => nonNegative(trip.budget?.target)).filter(v=>v>0);
  const variances = completed.map(trip => {
    const actual = nonNegative(trip.review?.actual_total_spend || trip.budget?.actual);
    const target = nonNegative(trip.budget?.target);
    return actual && target ? actual-target : null;
  }).filter(v=>v!==null);
  const ratings = key => reviewed.map(x=>nonNegative(x.review.ratings?.[key])).filter(v=>v>0);
  const returnAnswers = reviewed.map(x=>x.review.would_return_destination).filter(v=>v!==null);
  const repeatAnswers = reviewed.map(x=>x.review.would_repeat_trip).filter(v=>v!==null);
  const completedDestinations = completed.map(trip => {
    const decision = bookingDecisionState(trip, prefs);
    return decision.preferred?.destination?.name || (trip.destination_candidates||[])[0]?.name || '';
  });
  const destinationHistory = new Map();
  completed.forEach(trip => {
    const review = normalizeTripReview(trip.review || {});
    const decision = bookingDecisionState(trip, prefs);
    const name = decision.preferred?.destination?.name || (trip.destination_candidates||[])[0]?.name || '';
    if (!name) return;
    const key=name.toLowerCase(); const current=destinationHistory.get(key)||{name,visits:0,ratings:[],return_yes:0,return_no:0};
    current.visits += 1; if(review.ratings.destination>0) current.ratings.push(review.ratings.destination);
    if(review.would_return_destination===true) current.return_yes += 1; if(review.would_return_destination===false) current.return_no += 1;
    destinationHistory.set(key,current);
  });
  const typicalBudget = nonNegative(options.budget) || (actuals.length ? Math.round(average(actuals)/100)*100 : (targets.length ? Math.round(average(targets)/100)*100 : 5000));
  const hypothetical = emptyTrip({
    name:'Atlas next-trip intelligence',
    budget:{target:typicalBudget},
    travelers:Math.max(1,Math.round(nonNegative(options.travelers,prefs.default_party_size))),
    origin_airport:String(options.origin_airport||prefs.home_airport||'').toUpperCase(),
    dates:{start:String(options.start_date||''),end:String(options.end_date||'')}
  }, prefs);
  const recommendations = DESTINATION_RESEARCH_CATALOG
    .filter(item => !prefs.avoid_destinations.some(a => item.name.toLowerCase().includes(String(a).toLowerCase())))
    .map(item => {
      const candidate = normalizeDestinationCandidate({
        ...item,
        estimated_total_cost: estimateSeedCost(item,hypothetical,prefs),
        source:'Atlas travel intelligence', research_type:'intelligence_recommendation', research_confidence: reviewed.length >= 3 ? .78 : reviewed.length ? .68 : .55
      }, prefs, hypothetical);
      const itemKey=item.name.toLowerCase();
      const hist=destinationHistory.get(itemKey) || [...destinationHistory.entries()].find(([key]) => itemKey.includes(key) || key.includes(itemKey))?.[1];
      let historyAdjustment = hist ? Math.max(-12,Math.min(8,(hist.ratings.length ? (average(hist.ratings)-7)*2 : 0) + hist.return_yes*2 - hist.return_no*5)) : 3;
      const intelligenceScore=Math.max(0,Math.min(100,Math.round(Number(candidate.score?.atlas_fit||0)+historyAdjustment)));
      const reasons=[];
      if(!hist) reasons.push('New destination for Atlas history');
      if(hist?.return_yes) reasons.push('You previously said you would return');
      if(hist?.return_no) reasons.push('Past review said you would not return');
      if(candidate.estimated_total_cost<=typicalBudget) reasons.push('Estimated within next-trip budget');
      if(candidate.score?.components?.preference_match>=8) reasons.push('Strong saved-preference match');
      return { ...candidate, intelligence_score:intelligenceScore, history_adjustment:round1(historyAdjustment), prior_visits:hist?.visits||0, reasons };
    })
    .sort((a,b)=>b.intelligence_score-a.intelligence_score || Number(b.score?.atlas_fit||0)-Number(a.score?.atlas_fit||0))
    .slice(0,Math.max(1,Math.min(10,Math.round(nonNegative(options.limit,5)||5))));
  const currentResearch = trips.filter(t=>t.status!=='Completed').flatMap(trip=>(trip.destination_candidates||[]).map(candidate=>({trip_id:trip.id,trip_name:trip.name,status:trip.status,candidate})))
    .sort((a,b)=>Number(b.candidate.score?.atlas_fit||0)-Number(a.candidate.score?.atlas_fit||0)).slice(0,5);
  return {
    generated_at:new Date().toISOString(),
    completed_trip_count:completed.length,
    reviewed_trip_count:reviewed.length,
    history_confidence: reviewed.length >= 5 ? 'high' : reviewed.length >= 2 ? 'medium' : 'low',
    metrics:{
      average_actual_spend:round1(average(actuals)), average_budget_target:round1(average(targets)), average_budget_variance:round1(average(variances)),
      average_overall_rating:round1(average(ratings('overall'))), average_destination_rating:round1(average(ratings('destination'))),
      average_flight_rating:round1(average(ratings('flight'))), average_resort_rating:round1(average(ratings('resort'))), average_value_rating:round1(average(ratings('value'))),
      return_destination_rate:returnAnswers.length?round1(returnAnswers.filter(Boolean).length/returnAnswers.length*100):null,
      repeat_trip_rate:repeatAnswers.length?round1(repeatAnswers.filter(Boolean).length/repeatAnswers.length*100):null
    },
    learned_signals:{
      loved:counts(completed.flatMap(t=>normalizeTripReview(t.review||{}).loved)).slice(0,8),
      disliked:counts(completed.flatMap(t=>normalizeTripReview(t.review||{}).disliked)).slice(0,8),
      worth_it:counts(completed.flatMap(t=>normalizeTripReview(t.review||{}).worth_it)).slice(0,8),
      avoid_repeat:counts(completed.flatMap(t=>normalizeTripReview(t.review||{}).avoid_repeat)).slice(0,8),
      destinations:counts(completedDestinations).slice(0,8)
    },
    next_trip_profile:{budget:typicalBudget,travelers:hypothetical.travelers,origin_airport:hypothetical.origin_airport,trip_length_days:tripLengthDays(hypothetical,prefs.preferred_trip_length_days)},
    recommendations,
    current_research:currentResearch,
    note:'Recommendations use Atlas seed estimates and saved history, not live bookable prices. Verify live flight, lodging, weather, fees, and availability before booking.'
  };
}


function scenarioRound1(value) { return Math.round((Number(value) || 0) * 10) / 10; }

function scenarioNights(start, end, fallback = 7) {
  const a = Date.parse(start || '');
  const b = Date.parse(end || '');
  if (Number.isFinite(a) && Number.isFinite(b) && b > a) return Math.max(1, Math.round((b - a) / 86400000));
  return Math.max(1, Math.round(nonNegative(fallback, 7)));
}

function normalizeTripScenario(input = {}, trip = {}, preferences = DEFAULT_TRAVEL_PREFERENCES) {
  const prefs = normalizeTravelPreferences(preferences);
  const destinationName = String(input.destination || input.destination_name || '').trim();
  const catalog = DESTINATION_RESEARCH_CATALOG.find(item => {
    const a = item.name.toLowerCase(), b = destinationName.toLowerCase();
    return b && (a === b || a.includes(b) || b.includes(a));
  });
  const start = String(input.start_date ?? input.dates?.start ?? trip.dates?.start ?? '').trim();
  const end = String(input.end_date ?? input.dates?.end ?? trip.dates?.end ?? '').trim();
  const nights = Math.max(1, Math.round(nonNegative(input.nights, scenarioNights(start, end, prefs.preferred_trip_length_days))));
  const travelers = Math.max(1, Math.round(nonNegative(input.travelers, trip.travelers || prefs.default_party_size)));
  const budgetTarget = nonNegative(input.budget_target ?? input.budget ?? trip.budget?.target);
  const flightTotal = nonNegative(input.flight_total);
  const lodgingTotal = nonNegative(input.lodging_total);
  const taxesFees = nonNegative(input.taxes_fees);
  const transfers = nonNegative(input.transfer_cost);
  const activities = nonNegative(input.activity_allowance);
  const other = nonNegative(input.other_costs);
  const explicitTotal = nonNegative(input.total_cost);
  const totalCost = explicitTotal || (flightTotal + lodgingTotal + taxesFees + transfers + activities + other);
  const flightHours = nonNegative(input.flight_hours, catalog?.flight_hours || 0);
  const layovers = Math.max(0, Math.round(nonNegative(input.layovers, catalog?.layovers || 0)));
  const lodgingScore = clamp(input.lodging_score ?? input.resort_score ?? 7);
  const traits = { ...(catalog?.traits || {}), ...(input.traits || {}) };
  if (input.all_inclusive !== undefined) traits.all_inclusive = Boolean(input.all_inclusive);
  if (input.adults_only !== undefined) traits.adults_only = Boolean(input.adults_only);
  if (input.beach !== undefined) traits.beach = Boolean(input.beach);
  const candidate = normalizeDestinationCandidate({
    ...(catalog || {}),
    name: destinationName || catalog?.name || 'Scenario destination',
    estimated_total_cost: totalCost,
    flight_hours: flightHours,
    layovers,
    lodging_fit_score: lodgingScore,
    traits,
    source: 'Atlas scenario planner',
    research_type: 'scenario'
  }, prefs, { ...trip, budget: { ...(trip.budget || {}), target: budgetTarget } });
  const budgetComponent = budgetFitScore(totalCost, budgetTarget);
  const travelComponent = clamp(travelTimeScore(flightHours, prefs.preferred_max_flight_hours) + layoverAdjustment(layovers, prefs.preferred_max_layovers));
  const destinationComponent = clamp(Number(candidate.score?.atlas_fit || 0) / 10);
  const simplicityComponent = clamp(10 - Math.max(0, layovers - prefs.preferred_max_layovers) * 2 - (input.split_stay ? 1.5 : 0));
  const lodgingComponent = lodgingScore;
  const weighted = budgetComponent * .30 + destinationComponent * .25 + travelComponent * .20 + lodgingComponent * .15 + simplicityComponent * .10;
  const score = Math.round(weighted * 10);
  const warnings = [];
  if (budgetTarget && totalCost > budgetTarget) warnings.push(`${Math.round(((totalCost-budgetTarget)/budgetTarget)*100)}% over scenario budget.`);
  if (!totalCost) warnings.push('Total cost is incomplete.');
  if (flightHours > prefs.preferred_max_flight_hours) warnings.push('Flight time exceeds saved preference.');
  if (layovers > prefs.preferred_max_layovers) warnings.push('More layovers than preferred.');
  return {
    id: input.id || crypto.randomUUID(),
    name: String(input.name || destinationName || 'Trip scenario').trim(),
    destination: candidate.name,
    start_date: start,
    end_date: end,
    nights,
    travelers,
    budget_target: budgetTarget,
    flight_total: flightTotal,
    lodging_total: lodgingTotal,
    taxes_fees: taxesFees,
    transfer_cost: transfers,
    activity_allowance: activities,
    other_costs: other,
    total_cost: totalCost,
    flight_hours: flightHours,
    layovers,
    lodging_score: lodgingScore,
    resort_tier: String(input.resort_tier || '').trim(),
    traits,
    split_stay: Boolean(input.split_stay),
    notes: String(input.notes || '').trim(),
    live_data: Boolean(input.live_data),
    source: String(input.source || 'Atlas scenario planner').trim(),
    score: {
      atlas_scenario_score: score,
      components: {
        budget_value: scenarioRound1(budgetComponent),
        destination_fit: scenarioRound1(destinationComponent),
        travel_burden: scenarioRound1(travelComponent),
        lodging_quality: scenarioRound1(lodgingComponent),
        simplicity: scenarioRound1(simplicityComponent)
      },
      budget_delta: budgetTarget ? scenarioRound1(budgetTarget - totalCost) : null,
      warnings
    },
    created_at: input.created_at || new Date().toISOString(),
    updated_at: new Date().toISOString()
  };
}

function compareTripScenarios(trip = {}, preferences = DEFAULT_TRAVEL_PREFERENCES) {
  const scenarios = (trip.scenario_plans || []).map(item => normalizeTripScenario(item, trip, preferences))
    .sort((a,b) => Number(b.score?.atlas_scenario_score||0) - Number(a.score?.atlas_scenario_score||0) || Number(a.total_cost||0)-Number(b.total_cost||0));
  const leader = scenarios[0] || null;
  const runnerUp = scenarios[1] || null;
  const scoreGap = leader && runnerUp ? Number(leader.score.atlas_scenario_score) - Number(runnerUp.score.atlas_scenario_score) : null;
  const cheapest = [...scenarios].filter(x=>x.total_cost>0).sort((a,b)=>a.total_cost-b.total_cost)[0] || null;
  const fastest = [...scenarios].filter(x=>x.flight_hours>0).sort((a,b)=>a.flight_hours-b.flight_hours || a.layovers-b.layovers)[0] || null;
  return {
    count: scenarios.length,
    leader,
    score_gap: scoreGap,
    cheapest_scenario_id: cheapest?.id || null,
    fastest_scenario_id: fastest?.id || null,
    scenarios: scenarios.map((item,index)=>({
      ...item,
      rank:index+1,
      badges:[item.id===cheapest?.id?'Best cost':'',item.id===fastest?.id?'Fastest travel':'',index===0?'Atlas leader':''].filter(Boolean)
    })),
    note:'Scenario scores compare assumptions, not live availability. Verify current flight, lodging, fees, and inventory before booking.'
  };
}


function watchRound1(value) { return Math.round((Number(value) || 0) * 10) / 10; }

function normalizeScenarioWatch(input = {}, trip = {}, preferences = DEFAULT_TRAVEL_PREFERENCES) {
  const scenarioId = String(input.scenario_id || '').trim();
  const scenario = (trip.scenario_plans || []).find(item => item.id === scenarioId);
  const snapshots = Array.isArray(input.snapshots) ? input.snapshots.map(item => ({
    id: item.id || crypto.randomUUID(),
    total_cost: nonNegative(item.total_cost),
    source: String(item.source || 'Manual recheck').trim(),
    live_data: Boolean(item.live_data),
    checked_at: String(item.checked_at || new Date().toISOString()).trim(),
    expires_at: String(item.expires_at || '').trim(),
    notes: String(item.notes || '').trim()
  })).filter(item => item.total_cost > 0).slice(-30) : [];
  return {
    id: input.id || crypto.randomUUID(),
    scenario_id: scenarioId,
    label: String(input.label || scenario?.name || 'Watched scenario').trim(),
    target_total: nonNegative(input.target_total),
    notes: String(input.notes || '').trim(),
    paused: Boolean(input.paused),
    snapshots,
    created_at: input.created_at || new Date().toISOString(),
    updated_at: new Date().toISOString()
  };
}

function travelWatchlistState(trip = {}, preferences = DEFAULT_TRAVEL_PREFERENCES, now = Date.now()) {
  const scenarios = new Map((trip.scenario_plans || []).map(item => {
    const normalized = normalizeTripScenario(item, trip, preferences);
    return [normalized.id, normalized];
  }));
  const watches = (trip.scenario_watchlist || []).map(raw => normalizeScenarioWatch(raw, trip, preferences)).map(watch => {
    const scenario = scenarios.get(watch.scenario_id) || null;
    const latest = watch.snapshots.at(-1) || null;
    const previous = watch.snapshots.length > 1 ? watch.snapshots.at(-2) : null;
    const observedTotal = nonNegative(latest?.total_cost, nonNegative(scenario?.total_cost));
    const targetHit = Boolean(watch.target_total && observedTotal && observedTotal <= watch.target_total);
    const checkedMs = Date.parse(latest?.checked_at || '');
    const ageHours = Number.isFinite(checkedMs) ? Math.max(0, (now - checkedMs) / 36e5) : null;
    const expiresMs = Date.parse(latest?.expires_at || '');
    const expired = Number.isFinite(expiresMs) && now > expiresMs;
    const recheckDue = !watch.paused && (!latest || expired || (ageHours !== null && ageHours > 24));
    const changeAmount = latest && previous ? latest.total_cost - previous.total_cost : null;
    const changePct = latest && previous && previous.total_cost ? (changeAmount / previous.total_cost) * 100 : null;
    const status = watch.paused ? 'paused' : targetHit ? 'target_hit' : recheckDue ? 'recheck_due' : 'watching';
    return {
      ...watch, scenario, current_total: observedTotal, target_hit: targetHit, recheck_due: recheckDue, status,
      latest_check: latest, age_hours: ageHours === null ? null : watchRound1(ageHours),
      change_amount: changeAmount === null ? null : watchRound1(changeAmount),
      change_percent: changePct === null ? null : watchRound1(changePct),
      live_data: Boolean(latest?.live_data),
      source: latest?.source || (scenario ? 'Scenario assumption' : ''),
      target_delta: watch.target_total && observedTotal ? watchRound1(watch.target_total - observedTotal) : null
    };
  });
  const active = watches.filter(item => !item.paused);
  return {
    count: watches.length,
    active_count: active.length,
    target_hit_count: active.filter(item => item.target_hit).length,
    recheck_due_count: active.filter(item => item.recheck_due).length,
    watches: watches.sort((a,b) => Number(b.target_hit) - Number(a.target_hit) || Number(b.recheck_due) - Number(a.recheck_due) || Number(a.current_total||Infinity)-Number(b.current_total||Infinity)),
    note: 'Watchlist status is based on saved observations. Atlas only labels a quote live when the recorded check came from a live provider.'
  };
}

function addScenarioWatch(trip = {}, input = {}, preferences = DEFAULT_TRAVEL_PREFERENCES) {
  const scenarioId = String(input.scenario_id || '').trim();
  if (!scenarioId) throw new Error('Scenario is required.');
  if (!(trip.scenario_plans || []).some(item => item.id === scenarioId)) throw new Error('Scenario not found.');
  trip.scenario_watchlist = Array.isArray(trip.scenario_watchlist) ? trip.scenario_watchlist : [];
  const existing = trip.scenario_watchlist.find(item => item.scenario_id === scenarioId);
  if (existing) throw new Error('Scenario is already on the watchlist.');
  const watch = normalizeScenarioWatch(input, trip, preferences);
  trip.scenario_watchlist.push(watch);
  trip.updated_at = new Date().toISOString();
  return watch;
}

function updateScenarioWatch(trip = {}, watchId, input = {}, preferences = DEFAULT_TRAVEL_PREFERENCES) {
  const list = Array.isArray(trip.scenario_watchlist) ? trip.scenario_watchlist : [];
  const index = list.findIndex(item => item.id === watchId);
  if (index < 0) throw new Error('Watch item not found.');
  const current = list[index];
  const next = normalizeScenarioWatch({ ...current, ...input, id: current.id, created_at: current.created_at, snapshots: current.snapshots }, trip, preferences);
  list[index] = next; trip.scenario_watchlist = list; trip.updated_at = new Date().toISOString();
  return next;
}

function recordScenarioWatchCheck(trip = {}, watchId, input = {}, preferences = DEFAULT_TRAVEL_PREFERENCES) {
  const list = Array.isArray(trip.scenario_watchlist) ? trip.scenario_watchlist : [];
  const index = list.findIndex(item => item.id === watchId);
  if (index < 0) throw new Error('Watch item not found.');
  const current = normalizeScenarioWatch(list[index], trip, preferences);
  const total = nonNegative(input.total_cost);
  if (!total) throw new Error('Observed total cost is required.');
  const source = String(input.source || '').trim();
  if (input.live_data && !source) throw new Error('A source is required for live quote checks.');
  const snapshot = {
    id: crypto.randomUUID(), total_cost: total, source: source || 'Manual recheck', live_data: Boolean(input.live_data),
    checked_at: String(input.checked_at || new Date().toISOString()).trim(), expires_at: String(input.expires_at || '').trim(), notes: String(input.notes || '').trim()
  };
  current.snapshots = [...current.snapshots, snapshot].slice(-30);
  current.updated_at = new Date().toISOString();
  list[index] = current; trip.scenario_watchlist = list; trip.updated_at = new Date().toISOString();
  return snapshot;
}


function normalizeTravelActions(input = {}) {
  const acknowledgements = input && typeof input.acknowledgements === 'object' && input.acknowledgements ? input.acknowledgements : {};
  return {
    acknowledgements: Object.fromEntries(Object.entries(acknowledgements).map(([key, value]) => [String(key), {
      acknowledged: Boolean(value?.acknowledged),
      acknowledged_at: String(value?.acknowledged_at || '').trim(),
      snoozed_until: String(value?.snoozed_until || '').trim()
    }]))
  };
}

function travelActionQueue(trip = {}, preferences = DEFAULT_TRAVEL_PREFERENCES, now = Date.now()) {
  const watchState = travelWatchlistState(trip, preferences, now);
  const actionState = normalizeTravelActions(trip.travel_actions);
  const actions = [];
  const priorityRank = { urgent: 4, high: 3, medium: 2, low: 1 };
  const add = (watch, type, priority, title, detail, recommended_action) => {
    const id = `${watch.id}:${type}`;
    const ack = actionState.acknowledgements[id] || {};
    const snoozeMs = Date.parse(ack.snoozed_until || '');
    const snoozed = Number.isFinite(snoozeMs) && now < snoozeMs;
    actions.push({ id, watch_id: watch.id, scenario_id: watch.scenario_id, type, priority, title, detail, recommended_action, acknowledged: Boolean(ack.acknowledged), acknowledged_at: ack.acknowledged_at || '', snoozed, snoozed_until: ack.snoozed_until || '', current_total: watch.current_total, target_total: watch.target_total, change_amount: watch.change_amount, change_percent: watch.change_percent, live_data: watch.live_data, source: watch.source });
  };
  for (const watch of watchState.watches.filter(item => !item.paused)) {
    if (watch.target_hit) {
      add(watch, 'target_hit', 'urgent', `${watch.label}: target price hit`, `${watch.scenario?.destination || 'Scenario'} is ${watch.target_delta >= 0 ? '$' + Math.round(watch.target_delta) + ' below' : 'at'} the saved target at $${Math.round(watch.current_total)}.`, watch.live_data ? 'Review the quote and decide whether to book.' : 'Verify the price live before booking.');
      if (!watch.live_data) add(watch, 'verification_needed', 'high', `${watch.label}: verify before booking`, 'The saved price meets the target but is not marked as a live provider quote.', 'Recheck with a live provider and record the source.');
    }
    if (watch.change_percent !== null && watch.change_percent <= -3 && !watch.target_hit) add(watch, 'meaningful_drop', 'high', `${watch.label}: meaningful price drop`, `Price improved ${Math.abs(watch.change_percent)}% (${Math.abs(watch.change_amount)}).`, 'Recheck availability and compare against your target.');
    if (watch.recheck_due) add(watch, 'recheck_due', 'medium', `${watch.label}: quote needs recheck`, watch.age_hours === null ? 'This scenario has never had a recorded price recheck.' : `Latest saved observation is ${watch.age_hours} hours old or expired.`, 'Refresh the quote before making a decision.');
    if (watch.change_percent !== null && watch.change_percent >= 5) add(watch, 'price_worsened', 'low', `${watch.label}: price moved higher`, `Price increased ${watch.change_percent}% (${watch.change_amount}).`, 'Keep watching unless timing or availability makes waiting risky.');
  }
  actions.sort((a,b) => priorityRank[b.priority]-priorityRank[a.priority] || Number(a.acknowledged)-Number(b.acknowledged) || Number(a.snoozed)-Number(b.snoozed) || a.title.localeCompare(b.title));
  const open = actions.filter(item => !item.acknowledged && !item.snoozed);
  return {
    generated_at: new Date(now).toISOString(),
    count: actions.length,
    open_count: open.length,
    urgent_count: open.filter(item => item.priority === 'urgent').length,
    high_count: open.filter(item => item.priority === 'high').length,
    actions,
    next_action: open[0] || null,
    note: 'Actions are derived from saved watchlist evidence. Atlas does not claim a price is live unless the underlying watch observation was explicitly recorded as live.'
  };
}

function updateTravelAction(trip = {}, actionId, input = {}, preferences = DEFAULT_TRAVEL_PREFERENCES, now = Date.now()) {
  const currentQueue = travelActionQueue(trip, preferences, now);
  if (!currentQueue.actions.some(item => item.id === actionId)) throw new Error('Travel action not found.');
  const state = normalizeTravelActions(trip.travel_actions);
  const current = state.acknowledgements[actionId] || {};
  const acknowledged = input.acknowledged === undefined ? Boolean(current.acknowledged) : Boolean(input.acknowledged);
  const snoozedUntil = input.snoozed_until === undefined ? String(current.snoozed_until || '') : String(input.snoozed_until || '').trim();
  state.acknowledgements[actionId] = {
    acknowledged,
    acknowledged_at: acknowledged ? String(input.acknowledged_at || current.acknowledged_at || new Date(now).toISOString()) : '',
    snoozed_until: snoozedUntil
  };
  trip.travel_actions = state;
  trip.updated_at = new Date(now).toISOString();
  return travelActionQueue(trip, preferences, now);
}


function travelBookingReadinessCenter(trip = {}, preferences = DEFAULT_TRAVEL_PREFERENCES, now = Date.now()) {
  const watchState = travelWatchlistState(trip, preferences, now);
  const actionQueue = travelActionQueue(trip, preferences, now);
  const budgetTarget = nonNegative(trip?.budget?.target);
  const actionByWatch = new Map();
  for (const action of actionQueue.actions || []) {
    if (!actionByWatch.has(action.watch_id)) actionByWatch.set(action.watch_id, []);
    actionByWatch.get(action.watch_id).push(action);
  }
  const decisionRank = { book_now: 5, verify_now: 4, recheck_now: 3, consider_now: 2, wait: 1, paused: 0 };
  const candidates = watchState.watches.map(watch => {
    const scenario = watch.scenario || {};
    const scenarioScore = Number(scenario.score?.atlas_scenario_score || 0);
    const fresh = Boolean(watch.latest_check) && !watch.recheck_due;
    const liveVerified = Boolean(watch.live_data);
    const withinTripBudget = !budgetTarget || (watch.current_total > 0 && watch.current_total <= budgetTarget);
    const targetHit = Boolean(watch.target_hit);
    const meaningfulDrop = Number(watch.change_percent || 0) <= -3;
    const blockers = [];
    if (watch.paused) blockers.push('Watch is paused.');
    if (!watch.latest_check) blockers.push('No price recheck has been recorded.');
    else if (watch.recheck_due) blockers.push('Saved quote is stale or expired.');
    if (!liveVerified) blockers.push('Price is not verified by a live provider/source.');
    if (!targetHit && watch.target_total) blockers.push(`Price is still $${Math.round(Math.max(0, watch.current_total - watch.target_total))} above the saved target.`);
    if (!withinTripBudget && budgetTarget) blockers.push(`Current total is $${Math.round(watch.current_total - budgetTarget)} above the trip budget.`);

    let decision = 'wait';
    let recommendation = 'Keep watching for a better price or stronger evidence.';
    if (watch.paused) { decision = 'paused'; recommendation = 'Resume the watch before making a booking decision.'; }
    else if (targetHit && liveVerified && fresh) { decision = 'book_now'; recommendation = 'Target is hit on a fresh live-backed quote. Review final terms and book if the itinerary still fits.'; }
    else if (targetHit && !liveVerified && fresh) { decision = 'verify_now'; recommendation = 'The target is hit, but verify the exact live price and availability before booking.'; }
    else if (watch.recheck_due) { decision = 'recheck_now'; recommendation = 'Refresh the quote before making a decision.'; }
    else if (meaningfulDrop && withinTripBudget) { decision = 'consider_now'; recommendation = 'Price movement is favorable. Compare this option against your best alternative now.'; }

    let readiness = 0;
    if (targetHit) readiness += 30;
    else if (!watch.target_total || (watch.current_total && watch.target_total && watch.current_total <= watch.target_total * 1.05)) readiness += 15;
    if (liveVerified) readiness += 25;
    if (fresh) readiness += 20;
    if (withinTripBudget) readiness += 15;
    readiness += Math.min(10, Math.round(scenarioScore / 10));
    if (watch.paused) readiness = Math.min(readiness, 25);
    readiness = Math.max(0, Math.min(100, readiness));

    return {
      watch_id: watch.id,
      scenario_id: watch.scenario_id,
      label: watch.label,
      destination: scenario.destination || '',
      scenario_name: scenario.name || '',
      current_total: watch.current_total,
      target_total: watch.target_total,
      target_hit: targetHit,
      target_delta: watch.target_delta,
      trip_budget_target: budgetTarget,
      within_trip_budget: withinTripBudget,
      live_verified: liveVerified,
      fresh_quote: fresh,
      source: watch.source,
      scenario_score: scenarioScore,
      readiness_score: readiness,
      decision,
      recommendation,
      blockers,
      open_actions: (actionByWatch.get(watch.id) || []).filter(item => !item.acknowledged && !item.snoozed).map(item => ({ id: item.id, type: item.type, priority: item.priority, title: item.title })),
      change_amount: watch.change_amount,
      change_percent: watch.change_percent
    };
  }).sort((a,b) => (decisionRank[b.decision] - decisionRank[a.decision]) || b.readiness_score - a.readiness_score || b.scenario_score - a.scenario_score || Number(a.current_total||Infinity)-Number(b.current_total||Infinity));

  const leader = candidates[0] || null;
  return {
    count: candidates.length,
    book_now_count: candidates.filter(x => x.decision === 'book_now').length,
    verify_now_count: candidates.filter(x => x.decision === 'verify_now').length,
    recheck_now_count: candidates.filter(x => x.decision === 'recheck_now').length,
    leader,
    candidates,
    recommendation: leader ? leader.recommendation : 'Add a scenario to the watchlist to generate booking readiness guidance.',
    note: 'Booking readiness is derived from saved evidence. “Book now” requires a fresh quote explicitly marked live-backed; Atlas still expects a final human review of price, availability, and terms.'
  };
}


const BOOKING_EXECUTION_CHECKLIST = Object.freeze([
  { id: 'final_quote', label: 'Final live price rechecked', required: true },
  { id: 'availability', label: 'Availability confirmed', required: true },
  { id: 'itinerary', label: 'Exact itinerary / room details confirmed', required: true },
  { id: 'cancellation_terms', label: 'Cancellation and change terms reviewed', required: true },
  { id: 'traveler_details', label: 'Traveler names and document details checked', required: true },
  { id: 'payment_ready', label: 'Payment method and total charge approved', required: true }
]);

function normalizeBookingExecution(input = {}) {
  const checklistInput = Array.isArray(input.checklist) ? input.checklist : [];
  const checklist = BOOKING_EXECUTION_CHECKLIST.map(template => {
    const current = checklistInput.find(item => item && item.id === template.id) || {};
    return { ...template, complete: Boolean(current.complete), completed_at: String(current.completed_at || '').trim(), note: String(current.note || '').trim() };
  });
  const quote = input.final_quote && typeof input.final_quote === 'object' ? input.final_quote : {};
  const purchase = input.purchase && typeof input.purchase === 'object' ? input.purchase : {};
  return {
    watch_id: String(input.watch_id || '').trim(),
    scenario_id: String(input.scenario_id || '').trim(),
    started_at: String(input.started_at || '').trim(),
    decision_snapshot: input.decision_snapshot && typeof input.decision_snapshot === 'object' ? input.decision_snapshot : null,
    final_quote: {
      total_cost: nonNegative(quote.total_cost),
      currency: String(quote.currency || 'USD').trim().toUpperCase(),
      source: String(quote.source || '').trim(),
      source_url: String(quote.source_url || '').trim(),
      live_data: Boolean(quote.live_data),
      captured_at: String(quote.captured_at || '').trim(),
      expires_at: String(quote.expires_at || '').trim()
    },
    checklist,
    purchase: {
      provider: String(purchase.provider || '').trim(),
      confirmation_number: String(purchase.confirmation_number || '').trim(),
      amount_paid: nonNegative(purchase.amount_paid),
      payment_status: ['planned','scheduled','paid'].includes(String(purchase.payment_status || '').toLowerCase()) ? String(purchase.payment_status).toLowerCase() : 'planned',
      booked_at: String(purchase.booked_at || '').trim(),
      notes: String(purchase.notes || '').trim()
    },
    completed_at: String(input.completed_at || '').trim(),
    last_updated_at: String(input.last_updated_at || '').trim()
  };
}

function bookingExecutionState(trip = {}, preferences = DEFAULT_TRAVEL_PREFERENCES, now = Date.now()) {
  const execution = normalizeBookingExecution(trip.booking_execution || {});
  const readiness = travelBookingReadinessCenter(trip, preferences, now);
  const candidate = readiness.candidates.find(item => item.watch_id === execution.watch_id) || readiness.candidates.find(item => item.scenario_id === execution.scenario_id) || null;
  const required = execution.checklist.filter(item => item.required);
  const completeCount = required.filter(item => item.complete).length;
  const quote = execution.final_quote;
  const quoteFreshness = quote.captured_at ? liveResearchFreshness(quote, now) : { age_hours: null, label: 'unknown', stale: true };
  const quoteVerified = Boolean(quote.total_cost > 0 && quote.live_data && quote.source && !quoteFreshness.stale);
  const confirmationReady = Boolean(execution.purchase.confirmation_number);
  const paymentReady = ['scheduled','paid'].includes(execution.purchase.payment_status);
  const canFinalize = Boolean(execution.started_at && quoteVerified && completeCount === required.length && confirmationReady && paymentReady && !execution.completed_at);
  const blockers = [];
  if (!execution.started_at) blockers.push('Booking execution has not started.');
  if (!quote.total_cost) blockers.push('Final quote total is missing.');
  else if (!quote.live_data || !quote.source) blockers.push('Final quote is not live-verified with a source.');
  else if (quoteFreshness.stale) blockers.push('Final quote is stale or expired.');
  for (const item of required.filter(item => !item.complete)) blockers.push(item.label);
  if (!confirmationReady) blockers.push('Purchase confirmation number is missing.');
  if (!paymentReady) blockers.push('Payment must be scheduled or paid.');
  return {
    execution,
    candidate,
    started: Boolean(execution.started_at),
    checklist_complete_count: completeCount,
    checklist_required_count: required.length,
    checklist_percent: required.length ? Math.round((completeCount / required.length) * 100) : 100,
    final_quote_verified: quoteVerified,
    quote_freshness: quoteFreshness,
    confirmation_ready: confirmationReady,
    payment_ready: paymentReady,
    can_finalize: canFinalize,
    blockers,
    status: execution.completed_at ? 'completed' : canFinalize ? 'ready_to_finalize' : execution.started_at ? 'in_progress' : 'not_started'
  };
}

function startBookingExecution(trip = {}, input = {}, preferences = DEFAULT_TRAVEL_PREFERENCES, now = Date.now()) {
  const readiness = travelBookingReadinessCenter(trip, preferences, now);
  const watchId = String(input.watch_id || readiness.leader?.watch_id || '').trim();
  const candidate = readiness.candidates.find(item => item.watch_id === watchId);
  if (!candidate) throw new Error('Choose a watched scenario before starting booking execution.');
  if (!['book_now','verify_now'].includes(candidate.decision)) throw new Error('Booking execution can only start from a BOOK or VERIFY recommendation.');
  const current = normalizeBookingExecution(trip.booking_execution || {});
  if (current.started_at && !current.completed_at && current.watch_id !== watchId) throw new Error('Finish or clear the current booking execution before starting another scenario.');
  const observed = (trip.scenario_watchlist || []).find(item => item.id === watchId)?.snapshots || [];
  const latest = observed.length ? observed[observed.length - 1] : {};
  trip.booking_execution = normalizeBookingExecution({
    ...current,
    watch_id: watchId,
    scenario_id: candidate.scenario_id,
    started_at: current.started_at || new Date(now).toISOString(),
    decision_snapshot: { decision: candidate.decision, readiness_score: candidate.readiness_score, current_total: candidate.current_total, target_total: candidate.target_total, label: candidate.label, captured_at: new Date(now).toISOString() },
    final_quote: current.final_quote?.total_cost ? current.final_quote : { total_cost: candidate.current_total, currency: preferences.currency || 'USD', source: latest.source || candidate.source || '', live_data: Boolean(latest.live_data), captured_at: latest.checked_at || '', expires_at: latest.expires_at || '' },
    last_updated_at: new Date(now).toISOString()
  });
  if (['Dreaming','Researching'].includes(trip.status)) trip.status = 'Planning';
  trip.updated_at = new Date(now).toISOString();
  return bookingExecutionState(trip, preferences, now);
}

function updateBookingExecution(trip = {}, input = {}, preferences = DEFAULT_TRAVEL_PREFERENCES, now = Date.now()) {
  const execution = normalizeBookingExecution(trip.booking_execution || {});
  if (!execution.started_at) throw new Error('Start booking execution first.');
  if (input.final_quote && typeof input.final_quote === 'object') execution.final_quote = normalizeBookingExecution({ final_quote: { ...execution.final_quote, ...input.final_quote } }).final_quote;
  if (input.checklist_item && typeof input.checklist_item === 'object') {
    const item = execution.checklist.find(row => row.id === input.checklist_item.id);
    if (!item) throw new Error('Unknown booking checklist item.');
    item.complete = Boolean(input.checklist_item.complete);
    item.completed_at = item.complete ? String(input.checklist_item.completed_at || new Date(now).toISOString()) : '';
    if (input.checklist_item.note !== undefined) item.note = String(input.checklist_item.note || '').trim();
  }
  if (input.purchase && typeof input.purchase === 'object') execution.purchase = normalizeBookingExecution({ purchase: { ...execution.purchase, ...input.purchase } }).purchase;
  execution.last_updated_at = new Date(now).toISOString();
  trip.booking_execution = execution;
  trip.updated_at = new Date(now).toISOString();
  return bookingExecutionState(trip, preferences, now);
}

function finalizeBookingExecution(trip = {}, preferences = DEFAULT_TRAVEL_PREFERENCES, now = Date.now()) {
  const state = bookingExecutionState(trip, preferences, now);
  if (!state.can_finalize) throw new Error(`Booking execution is not ready to finalize: ${state.blockers.join(' ')}`);
  const execution = state.execution;
  execution.completed_at = new Date(now).toISOString();
  execution.purchase.booked_at = execution.purchase.booked_at || execution.completed_at;
  trip.booking_execution = execution;
  trip.status = 'Booked';
  trip.budget = normalizeBudget({ ...trip.budget, booked: execution.final_quote.total_cost }, trip.budget || {});
  const operations = normalizeTripOperations(trip.trip_operations || {});
  if (!operations.confirmations.some(item => item.confirmation_number === execution.purchase.confirmation_number)) {
    operations.confirmations.push({
      id: crypto.randomUUID(), type: 'reservation', name: execution.decision_snapshot?.label || 'Booked travel scenario',
      confirmation_number: execution.purchase.confirmation_number, provider: execution.purchase.provider || execution.final_quote.source,
      date: '', time: '', location: '', notes: execution.purchase.notes, status: 'confirmed'
    });
  }
  if (execution.purchase.amount_paid > 0 && !operations.payments.some(item => item.notes === `Booking execution ${execution.watch_id}`)) {
    operations.payments.push({ id: crypto.randomUUID(), label: 'Trip booking payment', amount: execution.purchase.amount_paid, due_date: '', status: execution.purchase.payment_status, paid_at: execution.purchase.payment_status === 'paid' ? execution.purchase.booked_at : '', notes: `Booking execution ${execution.watch_id}` });
  }
  operations.last_updated_at = new Date(now).toISOString();
  trip.trip_operations = operations;
  trip.updated_at = new Date(now).toISOString();
  return bookingExecutionState(trip, preferences, now);
}

function travelSummary(state = emptyTravelState()) {
  const trips = Array.isArray(state.trips) ? state.trips : [];
  const status_counts = Object.fromEntries(TRAVEL_STATUSES.map(status => [status, trips.filter(trip => trip.status === status).length]));
  const active = trips.filter(trip => !['Completed'].includes(trip.status));
  const upcoming = [...active]
    .filter(trip => trip.dates?.start)
    .sort((a, b) => String(a.dates.start).localeCompare(String(b.dates.start)))[0] || null;
  return {
    trip_count: trips.length,
    active_trip_count: active.length,
    status_counts,
    upcoming_trip: upcoming ? { id: upcoming.id, name: upcoming.name, status: upcoming.status, start: upcoming.dates.start } : null
  };
}

module.exports = {
  TRAVEL_STATUSES,
  DEFAULT_TRAVEL_PREFERENCES,
  emptyTravelState,
  normalizeTravelPreferences,
  emptyTrip,
  normalizeDestinationCandidate,
  destinationScore,
  travelSummary,
  budgetFitScore,
  travelTimeScore,
  preferenceMatchScore,
  destinationResearchCompleteness,
  destinationStrengths,
  compareDestinations,
  destinationResearchBrief,
  DESTINATION_RESEARCH_CATALOG,
  tripLengthDays,
  estimateSeedCost,
  automatedDestinationResearch,
  LIVE_RESEARCH_KINDS,
  travelProviderStatus,
  normalizeLiveResearchSnapshot,
  liveResearchFreshness,
  applyLiveResearchSnapshot,
  flightPriceScore,
  flightScheduleScore,
  flightAtlasScore,
  normalizeFlightOption,
  compareFlights,
  resortTotalCost,
  resortAtlasScore,
  normalizeResortOption,
  compareResorts,
  packageAtlasScore,
  optimizeTripPackages,
  BOOKING_VERIFICATION_TEMPLATE,
  normalizeBookingDecision,
  bookingDecisionState,
  updateBookingDecision,
  bookPreferredPackage,
  TRIP_READINESS_TEMPLATE,
  normalizeTripOperations,
  tripOperationsState,
  updateTripOperations,
  startTripTraveling,
  PRE_DEPARTURE_CHECKLIST,
  normalizePreDeparture,
  preDepartureState,
  updatePreDeparture,
  normalizeLiveTrip,
  liveTripState,
  updateLiveTrip,
  normalizeTripResilience,
  tripResilienceState,
  updateTripResilience,
  TRIP_WRAP_UP_CHECKLIST,
  normalizeTripWrapUp,
  tripWrapUpState,
  updateTripWrapUp,
  TRIP_REVIEW_RATING_FIELDS,
  normalizeTripReview,
  tripReviewState,
  updateTripReview,
  completeTripReview,
  applyTripLearning,
  travelIntelligenceDashboard,
  normalizeTripScenario,
  compareTripScenarios,
  normalizeScenarioWatch,
  travelWatchlistState,
  addScenarioWatch,
  updateScenarioWatch,
  recordScenarioWatchCheck,
  normalizeTravelActions,
  travelActionQueue,
  updateTravelAction,
  travelBookingReadinessCenter,
  BOOKING_EXECUTION_CHECKLIST,
  normalizeBookingExecution,
  bookingExecutionState,
  startBookingExecution,
  updateBookingExecution,
  finalizeBookingExecution
};
