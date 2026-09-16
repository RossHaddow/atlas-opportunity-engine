const http = require("node:http");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { createStorage } = require("./storage");
const { URL } = require("node:url");
const { TRAVEL_STATUSES, emptyTravelState, normalizeTravelPreferences, emptyTrip, normalizeDestinationCandidate, destinationScore, travelSummary, compareDestinations, destinationResearchBrief, automatedDestinationResearch, travelProviderStatus, applyLiveResearchSnapshot, normalizeFlightOption, compareFlights, normalizeResortOption, compareResorts, optimizeTripPackages, bookingDecisionState, updateBookingDecision, bookPreferredPackage, tripOperationsState, updateTripOperations, startTripTraveling, liveTripState, updateLiveTrip, tripResilienceState, updateTripResilience, tripWrapUpState, updateTripWrapUp, tripReviewState, updateTripReview, completeTripReview, applyTripLearning, travelIntelligenceDashboard, normalizeTripScenario, compareTripScenarios, travelWatchlistState, addScenarioWatch, updateScenarioWatch, recordScenarioWatchCheck, travelActionQueue, updateTravelAction, travelBookingReadinessCenter, bookingExecutionState, startBookingExecution, updateBookingExecution, finalizeBookingExecution, preDepartureState, updatePreDeparture } = require("./travel");

const PORT = Number(process.env.PORT || 3000);
const PUBLIC_DIR = path.join(__dirname, "public");
const storage = createStorage();
const STARTED_AT = Date.now();
const APP_VERSION = require("./package.json").version;
const VALID_STATUSES = ["Researching", "Testing", "Active", "Scaled", "Paused", "Killed"];
const DAY_MS = 24 * 60 * 60 * 1000;
const LABOR_RATE = 25;
const EXPERIMENT_REQUIRED_FIELDS = ["demand_evidence", "offer", "sales_channel", "start_date", "end_date", "approved_budget"];
const FINAL_DECISIONS = ["Move to Active", "Revise and Retest", "Pause", "Kill"];
const ATLAS_TIME_ZONE = process.env.ATLAS_TIME_ZONE || "America/Chicago";
const FOCUS_DEFER_REASONS = {
  timing: "Bad timing / not today",
  capacity: "Not enough time / energy",
  blocked: "Blocked / waiting on something",
  too_big: "Action is too big",
  unclear: "Next step is unclear",
  low_priority: "Does not feel worth prioritizing",
  other: "Other"
};

function authConfig(env = process.env) {
  const password = String(env.ATLAS_ACCESS_PASSWORD || "");
  return {
    username: String(env.ATLAS_ACCESS_USERNAME || "atlas"),
    password,
    enabled: password.length > 0,
    required: String(env.ATLAS_REQUIRE_AUTH || "").toLowerCase() === "true"
  };
}

function timingSafeTextEqual(left, right) {
  const a = Buffer.from(String(left));
  const b = Buffer.from(String(right));
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

function isAuthorized(req, config = authConfig()) {
  if (!config.enabled) return true;
  const header = String(req.headers?.authorization || "");
  if (!header.startsWith("Basic ")) return false;
  try {
    const decoded = Buffer.from(header.slice(6), "base64").toString("utf8");
    const separator = decoded.indexOf(":");
    if (separator < 0) return false;
    const username = decoded.slice(0, separator);
    const password = decoded.slice(separator + 1);
    return timingSafeTextEqual(username, config.username) && timingSafeTextEqual(password, config.password);
  } catch {
    return false;
  }
}

function requireValidAuthConfig(config = authConfig()) {
  if (config.required && !config.enabled) {
    throw new Error("ATLAS_REQUIRE_AUTH=true requires ATLAS_ACCESS_PASSWORD to be set.");
  }
  return config;
}

function unauthorized(res) {
  res.writeHead(401, {
    "Content-Type": "text/plain; charset=utf-8",
    "WWW-Authenticate": 'Basic realm="Atlas", charset="UTF-8"',
    "Cache-Control": "no-store"
  });
  res.end("Authentication required.");
}

function readData() {
  return storage.read();
}

function writeData(data) {
  storage.write(data);
}

function readRadar() {
  return storage.readRadar();
}

function writeRadar(data) {
  storage.writeRadar(data);
}

function readDiscoveryRuns() {
  return storage.readDiscoveryRuns();
}

function writeDiscoveryRuns(data) {
  storage.writeDiscoveryRuns(data);
}

function readTravel() {
  return storage.readTravel();
}

function writeTravel(data) {
  storage.writeTravel(data);
}

const RADAR_STAGES = ["New", "Worth Investigating", "Atlas Recommended", "Ready to Test", "Dismissed", "Promoted"];

function pausedFields(status, previous = {}) {
  if (status !== "Paused") {
    return { paused_at: null, paused_review_date: null };
  }
  const pausedAt = previous.paused_at || new Date().toISOString();
  const reviewDate = previous.paused_review_date || new Date(Date.parse(pausedAt) + 30 * DAY_MS).toISOString();
  return { paused_at: pausedAt, paused_review_date: reviewDate };
}

function emptyExperiment() {
  return {
    demand_evidence: "",
    offer: "",
    sales_channel: "",
    start_date: "",
    end_date: "",
    approved_budget: 25,
    budget_approval_confirmed: false,
    launch_tasks: [],
    hours_worked: 0,
    revenue: 0,
    expenses: 0,
    customer_response: "",
    notes: "",
    weekly_checkpoints: [1, 2, 3, 4].map(emptyCheckpoint),
    fair_test_exposure_met: false,
    failed_test_count: 0,
    interventions: []
  };
}

function emptyCheckpoint(week) {
  return {
    week,
    completed: false,
    checkpoint_date: "",
    views: 0,
    visits: 0,
    favorites: 0,
    orders: 0,
    revenue: 0,
    expenses: 0,
    hours_worked: 0,
    customer_questions: 0,
    customer_feedback: "",
    major_problem: "",
    change_made: "",
    decision: "Continue",
    notes: ""
  };
}

function normalizeCheckpoints(input = []) {
  const byWeek = new Map((Array.isArray(input) ? input : []).map(item => [Number(item.week), item]));
  return [1, 2, 3, 4].map(week => {
    const checkpoint = { ...emptyCheckpoint(week), ...(byWeek.get(week) || {}), week };
    ["views", "visits", "favorites", "orders", "revenue", "expenses", "hours_worked", "customer_questions"].forEach(field => {
      checkpoint[field] = Math.max(0, Number(checkpoint[field] || 0));
    });
    checkpoint.completed = Boolean(checkpoint.completed);
    if (!['Continue', 'Adjust', 'Recommend Early Termination'].includes(checkpoint.decision)) checkpoint.decision = "Continue";
    return checkpoint;
  });
}

function rollupCheckpointMetrics(experiment) {
  const checkpoints = normalizeCheckpoints(experiment.weekly_checkpoints);
  const checkpointActivity = checkpoints.some(checkpoint => checkpoint.completed || checkpoint.revenue || checkpoint.expenses || checkpoint.hours_worked);
  if (!checkpointActivity) return { ...experiment, weekly_checkpoints: checkpoints };
  return {
    ...experiment,
    weekly_checkpoints: checkpoints,
    revenue: checkpoints.reduce((sum, checkpoint) => sum + checkpoint.revenue, 0),
    expenses: checkpoints.reduce((sum, checkpoint) => sum + checkpoint.expenses, 0),
    hours_worked: checkpoints.reduce((sum, checkpoint) => sum + checkpoint.hours_worked, 0)
  };
}

function normalizeExperiment(input = {}, current = {}) {
  const experiment = { ...emptyExperiment(), ...current, ...input };
  experiment.approved_budget = Number(experiment.approved_budget || 0);
  experiment.hours_worked = Number(experiment.hours_worked || 0);
  experiment.revenue = Number(experiment.revenue || 0);
  experiment.expenses = Number(experiment.expenses || 0);
  experiment.budget_approval_confirmed = Boolean(experiment.budget_approval_confirmed);
  experiment.fair_test_exposure_met = Boolean(experiment.fair_test_exposure_met);
  experiment.failed_test_count = Math.max(0, Number(experiment.failed_test_count || 0));
  experiment.launch_tasks = Array.isArray(experiment.launch_tasks)
    ? experiment.launch_tasks.map(task => ({
        id: String(task.id || `${Date.now()}-${Math.random()}`),
        text: String(task.text || "").trim(),
        completed: Boolean(task.completed)
      })).filter(task => task.text)
    : [];
  experiment.weekly_checkpoints = normalizeCheckpoints(experiment.weekly_checkpoints);
  experiment.interventions = normalizeInterventions(experiment.interventions);
  if (experiment.start_date && !experiment.end_date) {
    const start = Date.parse(`${experiment.start_date}T00:00:00Z`);
    if (!Number.isNaN(start)) experiment.end_date = new Date(start + 30 * DAY_MS).toISOString().slice(0, 10);
  }
  return experiment;
}

function decisionState(experiment, earlyTerminationRecommended = false) {
  const cashProfit = Number(experiment.revenue || 0) - Number(experiment.expenses || 0);
  const laborCost = Number(experiment.hours_worked || 0) * LABOR_RATE;
  const laborAdjustedProfit = cashProfit - laborCost;
  const endReached = Boolean(experiment.end_date) && Date.parse(`${experiment.end_date}T23:59:59Z`) <= Date.now();
  const checkpointsComplete = experiment.weekly_checkpoints.filter(checkpoint => checkpoint.completed).length === 4;
  const decisionReady = endReached || checkpointsComplete || earlyTerminationRecommended;
  const projectedFailures = experiment.failed_test_count + (decisionReady && cashProfit <= 0 ? 1 : 0);
  let recommendation = "Continue Test";
  let rationale = "The experiment is still in progress.";
  if (decisionReady) {
    if (cashProfit > 0 && experiment.fair_test_exposure_met) {
      recommendation = "Move to Active";
      rationale = "The test produced positive cash profit after receiving a fair market test.";
    } else if (projectedFailures >= 2) {
      recommendation = "Kill";
      rationale = "This would be the second failed test, which normally triggers a Kill recommendation.";
    } else if (earlyTerminationRecommended) {
      recommendation = "Pause";
      rationale = "A weekly checkpoint recommends ending the current test early for review.";
    } else {
      recommendation = "Revise and Retest";
      rationale = experiment.fair_test_exposure_met
        ? "The first test did not produce positive cash profit. One focused revision is permitted before a Kill recommendation."
        : "The opportunity did not receive a fair test, so the evidence is insufficient for a final rejection.";
    }
  }
  return {
    cash_profit: cashProfit,
    labor_rate: LABOR_RATE,
    labor_cost: laborCost,
    labor_adjusted_profit: laborAdjustedProfit,
    scaled_profitability_eligible: cashProfit > 0 && laborAdjustedProfit > 0,
    decision_ready: decisionReady,
    projected_failed_test_count: projectedFailures,
    atlas_recommendation: recommendation,
    recommendation_rationale: rationale
  };
}

function experimentState(opportunity) {
  if (opportunity.status !== "Testing") {
    return { ...opportunity, experiment_missing_fields: [], experiment_progress: null, experiment_budget_warning: false };
  }
  const experiment = normalizeExperiment(opportunity.experiment || {});
  const missing = EXPERIMENT_REQUIRED_FIELDS.filter(field => {
    if (field === "approved_budget") return experiment.approved_budget < 0;
    return !String(experiment[field] ?? "").trim();
  });
  if (!experiment.launch_tasks.length) missing.push("launch_tasks");
  const total = EXPERIMENT_REQUIRED_FIELDS.length + 1;
  const progress = Math.round(((total - missing.length) / total) * 100);
  const completedCheckpoints = experiment.weekly_checkpoints.filter(checkpoint => checkpoint.completed).length;
  const earlyTerminationRecommended = experiment.weekly_checkpoints.some(checkpoint => checkpoint.decision === "Recommend Early Termination");
  const decision = decisionState(experiment, earlyTerminationRecommended);
  const nextCheckpoint = experiment.weekly_checkpoints.find(checkpoint => !checkpoint.completed) || null;
  let nextCheckpointDate = null;
  let checkpointOverdue = false;
  if (nextCheckpoint && experiment.start_date) {
    const start = Date.parse(`${experiment.start_date}T00:00:00Z`);
    if (!Number.isNaN(start)) {
      const offset = nextCheckpoint.week === 4 ? 30 : nextCheckpoint.week * 7;
      nextCheckpointDate = new Date(start + offset * DAY_MS).toISOString().slice(0, 10);
      checkpointOverdue = Date.parse(`${nextCheckpointDate}T23:59:59Z`) < Date.now();
    }
  }
  return {
    ...opportunity,
    experiment,
    experiment_missing_fields: missing,
    experiment_progress: progress,
    experiment_budget_warning: experiment.approved_budget > 25 && !experiment.budget_approval_confirmed,
    completed_checkpoints: completedCheckpoints,
    next_checkpoint_week: nextCheckpoint ? nextCheckpoint.week : null,
    next_checkpoint_date: nextCheckpointDate,
    checkpoint_overdue: checkpointOverdue,
    early_termination_recommended: earlyTerminationRecommended,
    ...decision
  };
}

function nextActionState(opportunity) {
  let next_action = "Review opportunity";
  let next_action_date = null;
  let attention_level = "normal";
  if (opportunity.status === "Researching") next_action = "Validate customer demand and define the test offer";
  if (opportunity.status === "Testing") {
    if ((opportunity.experiment_missing_fields || []).length) {
      next_action = "Complete the required Testing setup";
      attention_level = "due";
    } else if (opportunity.decision_ready) {
      next_action = "Complete the Day-30 decision";
      attention_level = "urgent";
    } else if (opportunity.checkpoint_overdue) {
      next_action = `Complete overdue Week ${opportunity.next_checkpoint_week} checkpoint`;
      next_action_date = opportunity.next_checkpoint_date;
      attention_level = "urgent";
    } else {
      next_action = `Complete Week ${opportunity.next_checkpoint_week} checkpoint`;
      next_action_date = opportunity.next_checkpoint_date;
    }
    if (opportunity.early_termination_recommended) {
      next_action = "Review the early-termination recommendation";
      attention_level = "urgent";
    }
  }
  if (opportunity.status === "Paused") {
    next_action = opportunity.paused_review_overdue ? "Review overdue Paused opportunity" : "Review Paused opportunity";
    next_action_date = opportunity.paused_review_date;
    attention_level = opportunity.paused_review_overdue ? "urgent" : "normal";
  }
  if (opportunity.status === "Active") next_action = "Complete monthly performance review";
  if (opportunity.status === "Scaled") next_action = "Complete monthly profitability and workload review";
  if (opportunity.status === "Killed") { next_action = "No action required"; attention_level = "none"; }
  return { ...opportunity, next_action, next_action_date, attention_level };
}

function withReviewState(opportunity) {
  if (opportunity.status !== "Paused" || !opportunity.paused_review_date) {
    return nextActionState(experimentState({ ...opportunity, paused_review_overdue: false, paused_review_days_remaining: null }));
  }
  const remaining = Math.ceil((Date.parse(opportunity.paused_review_date) - Date.now()) / DAY_MS);
  return nextActionState(experimentState({
    ...opportunity,
    paused_review_overdue: remaining < 0,
    paused_review_days_remaining: remaining
  }));
}

function json(res, status, body) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
}

function body(req) {
  return new Promise((resolve, reject) => {
    let value = "";
    req.on("data", chunk => {
      value += chunk;
      if (value.length > 1_000_000) reject(new Error("Request body too large"));
    });
    req.on("end", () => {
      try { resolve(value ? JSON.parse(value) : {}); }
      catch { reject(new Error("Invalid JSON")); }
    });
    req.on("error", reject);
  });
}



function experimentHealth(opportunity, now = Date.now()) {
  const experiment = normalizeExperiment(opportunity.experiment || {});
  const checkpoints = normalizeCheckpoints(experiment.weekly_checkpoints || []);
  const total = field => checkpoints.reduce((sum, checkpoint) => sum + Number(checkpoint[field] || 0), 0);
  const visits = total("visits");
  const favorites = total("favorites");
  const orders = total("orders");
  const revenue = Number(experiment.revenue || total("revenue") || 0);
  const expenses = Number(experiment.expenses || total("expenses") || 0);
  const cashProfit = revenue - expenses;
  const start = experiment.start_date ? Date.parse(`${experiment.start_date}T00:00:00Z`) : NaN;
  const daysElapsed = Number.isNaN(start) ? 0 : Math.max(0, Math.floor((now - start) / DAY_MS));
  const conversionRate = visits > 0 ? (orders / visits) * 100 : 0;
  const favoriteRate = visits > 0 ? (favorites / visits) * 100 : 0;

  let score = 50;
  const reasons = [];
  const warnings = [];

  // Demand and conversion signals.
  if (orders >= 3) { score += 22; reasons.push("Multiple orders show repeatable demand."); }
  else if (orders >= 1) { score += 15; reasons.push("At least one order confirms buyer demand."); }
  else if (daysElapsed >= 14) { score -= 22; warnings.push("No orders after two weeks."); }
  else if (daysElapsed >= 7) { score -= 10; warnings.push("No orders after the first week."); }

  if (cashProfit > 0) { score += 14; reasons.push("The test is cash-profitable so far."); }
  else if (revenue > 0 && cashProfit <= 0) { score += 3; warnings.push("Revenue exists, but the test is not yet cash-profitable."); }

  if (visits >= 50) { score += 10; reasons.push("The listing has meaningful visit volume."); }
  else if (visits >= 20) { score += 6; reasons.push("The listing has enough traffic to begin reading conversion signals."); }
  else if (daysElapsed >= 14 && visits < 10) { score -= 15; warnings.push("Traffic is too low to judge the offer fairly."); }
  else if (daysElapsed >= 7 && visits < 5) { score -= 10; warnings.push("Very little traffic has reached the listing."); }

  if (conversionRate >= 3) { score += 12; reasons.push("Conversion is at or above 3%."); }
  else if (conversionRate >= 1.5) { score += 7; reasons.push("Conversion is producing a positive signal."); }
  else if (visits >= 20 && orders === 0) { score -= 12; warnings.push("Traffic is arriving without converting."); }

  if (favoriteRate >= 5 && favorites >= 2) { score += 5; reasons.push("Favorite activity suggests buyer interest."); }
  else if (favorites >= 1) { score += 2; }

  if (opportunity.early_termination_recommended) {
    score -= 25;
    warnings.push("A checkpoint recommends early termination.");
  }
  if (opportunity.experiment_budget_warning) {
    score -= 5;
    warnings.push("The test budget requires approval.");
  }

  score = Math.max(0, Math.min(100, Math.round(score)));

  let label = "Developing";
  if (score >= 85) label = "Strong";
  else if (score >= 70) label = "Healthy";
  else if (score >= 50) label = "Developing";
  else if (score >= 35) label = "Needs Attention";
  else label = "At Risk";

  const confidence = visits >= 50 || orders >= 5 ? "High" : visits >= 20 || orders >= 2 ? "Medium" : "Low";
  let recommendation = "Keep collecting data.";
  if (label === "Strong") recommendation = "Protect the listing and avoid unnecessary changes while the signal is strong.";
  else if (label === "Healthy") recommendation = "Continue the test and watch the next checkpoint for confirmation.";
  else if (label === "Needs Attention") recommendation = visits < 10
    ? "Focus on qualified traffic before changing the product."
    : "Review the listing offer, images, title, price, and conversion friction.";
  else if (label === "At Risk") recommendation = orders === 0 && visits >= 20
    ? "Plan a focused revision rather than making multiple changes at once."
    : "Review whether the test has enough exposure and consider intervention.";
  else if (daysElapsed < 7 && visits < 10) recommendation = "Do not overreact yet; the test is still early and evidence is limited.";

  return {
    health_score: score,
    health_label: label,
    health_confidence: confidence,
    health_recommendation: recommendation,
    health_reasons: reasons.slice(0, 3),
    health_warnings: warnings.slice(0, 3),
    health_metrics: {
      days_elapsed: daysElapsed,
      visits,
      favorites,
      orders,
      revenue,
      expenses,
      cash_profit: cashProfit,
      conversion_rate: conversionRate,
      favorite_rate: favoriteRate
    }
  };
}



function emptyIntervention() {
  return {
    id: "",
    category: "",
    diagnosis: "",
    action: "",
    rationale: "",
    success_metric: "",
    change_limit: "",
    accepted_at: "",
    status: "Active",
    baseline: { visits: 0, favorites: 0, orders: 0, revenue: 0, conversion_rate: 0 },
    result: { visits: 0, favorites: 0, orders: 0, revenue: 0, conversion_rate: 0 },
    outcome: "",
    notes: "",
    completed_at: ""
  };
}

function normalizeInterventions(items) {
  if (!Array.isArray(items)) return [];
  return items.map(item => ({
    ...emptyIntervention(),
    ...item,
    baseline: { ...emptyIntervention().baseline, ...(item.baseline || {}) },
    result: { ...emptyIntervention().result, ...(item.result || {}) }
  }));
}

function interventionEvaluation(record) {
  const baseline = record?.baseline || {};
  const result = record?.result || {};
  const delta = field => Number(result[field] || 0) - Number(baseline[field] || 0);
  const conversionDelta = delta("conversion_rate");
  let outcome = "Inconclusive";
  if (delta("orders") > 0 || conversionDelta >= 0.5) outcome = "Improved";
  else if (delta("visits") > 0 && delta("orders") <= 0 && conversionDelta < 0) outcome = "Worse";
  return {
    outcome,
    delta_visits: delta("visits"),
    delta_favorites: delta("favorites"),
    delta_orders: delta("orders"),
    delta_revenue: delta("revenue"),
    delta_conversion_rate: conversionDelta
  };
}

function interventionPlan(opportunity, now = Date.now()) {
  const health = experimentHealth(opportunity, now);
  const m = health.health_metrics;
  const days = Number(m.days_elapsed || 0);
  const visits = Number(m.visits || 0);
  const favorites = Number(m.favorites || 0);
  const orders = Number(m.orders || 0);
  const conversion = Number(m.conversion_rate || 0);
  const favoriteRate = Number(m.favorite_rate || 0);

  let diagnosis = "Insufficient Evidence";
  let category = "insufficient_evidence";
  let priority = "Observe";
  let action = "Keep the listing unchanged until it has enough qualified traffic to judge.";
  let rationale = "The sample is still too small to distinguish a traffic problem from a conversion problem.";
  let success_metric = "Reach at least 20 visits before making a major listing change.";
  let change_limit = "No major change yet.";

  if (opportunity.decision_ready) {
    diagnosis = "Decision Ready";
    category = "decision_ready";
    priority = "Decide";
    action = "Use the completed 30-day experiment evidence to make the Active / Revise / Pause / Kill decision.";
    rationale = "The experiment has reached the decision stage, so another listing tweak would delay the required portfolio decision.";
    success_metric = "Record the final experiment decision.";
    change_limit = "Do not start another intervention until the decision is recorded.";
  } else if (health.health_label === "Strong" || (orders >= 3 && conversion >= 3)) {
    diagnosis = "Healthy — Hold";
    category = "hold";
    priority = "Protect";
    action = "Do not change the listing right now; keep collecting evidence while the current version is working.";
    rationale = "Orders and conversion are producing a strong enough signal that unnecessary edits could destroy a winning baseline.";
    success_metric = "Maintain positive conversion through the next checkpoint.";
    change_limit = "Zero listing changes unless a clear defect appears.";
  } else if (visits < 10 && days >= 7) {
    diagnosis = "Traffic Problem";
    category = "traffic";
    priority = "High";
    action = "Test one traffic intervention: improve the primary search phrase in the Etsy title and first tags while leaving price and images unchanged.";
    rationale = "Too few shoppers are reaching the listing, so conversion cannot be judged fairly yet.";
    success_metric = "Increase qualified visits by the next weekly checkpoint.";
    change_limit = "Change search positioning only; do not change price or listing graphics in the same test.";
  } else if (visits < 20) {
    diagnosis = "Insufficient Evidence";
    category = "insufficient_evidence";
    priority = "Observe";
    action = "Keep the listing stable and collect more qualified visits before intervening.";
    rationale = "There is not enough traffic to confidently identify the bottleneck.";
    success_metric = "Reach 20 visits or the next checkpoint, whichever comes first.";
    change_limit = "Avoid simultaneous listing changes.";
  } else if (orders === 0 && favoriteRate >= 5 && favorites >= 2) {
    diagnosis = "Offer / Price Friction";
    category = "offer_price";
    priority = "High";
    action = "Test one offer change: adjust the price or launch promotion while keeping the title, tags, and listing images unchanged.";
    rationale = "Shoppers are showing interest by favoriting the product, but that interest is not turning into purchases.";
    success_metric = "Generate the first order or materially improve conversion at the next checkpoint.";
    change_limit = "Change price/offer only so Atlas can measure whether it caused the result.";
  } else if (orders === 0 && visits >= 20 && favorites < 2) {
    diagnosis = "Listing Presentation / Positioning";
    category = "presentation";
    priority = "High";
    action = "Test one presentation change: replace the primary Etsy listing image with a clearer benefit-led cover while leaving price and search terms unchanged.";
    rationale = "Traffic is arriving, but shoppers are neither favoriting nor buying, which points to weak first-impression positioning.";
    success_metric = "Increase favorites and/or produce the first order at the next checkpoint.";
    change_limit = "Change the lead image only; preserve the rest of the listing as the control.";
  } else if (orders > 0 && conversion < 1.5 && visits >= 20) {
    diagnosis = "Conversion Weakness";
    category = "conversion";
    priority = "Medium";
    action = "Test one conversion change: strengthen the first paragraph and image sequence around exactly what the buyer receives.";
    rationale = "The listing can sell, but the current conversion rate suggests too many interested shoppers still leave without purchasing.";
    success_metric = "Lift conversion rate at the next checkpoint.";
    change_limit = "Change conversion copy/presentation only; keep price and search positioning stable.";
  } else if (orders === 0 && visits >= 20) {
    diagnosis = "Conversion Problem";
    category = "conversion";
    priority = "High";
    action = "Run one focused conversion test on the listing rather than rebuilding the product.";
    rationale = "Enough shoppers have visited to show that traffic exists, but none have purchased.";
    success_metric = "Produce the first order or improve engagement at the next checkpoint.";
    change_limit = "Change one conversion variable only.";
  } else if (orders >= 1) {
    diagnosis = "Early Demand Signal";
    category = "early_demand";
    priority = "Observe";
    action = "Hold the current version through the next checkpoint before making a major change.";
    rationale = "A purchase confirms real demand, but the sample is not yet large enough to optimize confidently.";
    success_metric = "Confirm the demand signal with another order or stronger conversion.";
    change_limit = "Avoid major changes until the next checkpoint.";
  }

  return {
    intervention_category: category,
    intervention_diagnosis: diagnosis,
    intervention_priority: priority,
    intervention_action: action,
    intervention_rationale: rationale,
    intervention_success_metric: success_metric,
    intervention_change_limit: change_limit
  };
}



function normalizeDeferReason(value) {
  const key = String(value || "").trim().toLowerCase();
  return Object.prototype.hasOwnProperty.call(FOCUS_DEFER_REASONS, key) ? key : "";
}

function normalizeFocusState(focus = {}, now = Date.now()) {
  const history = Array.isArray(focus.history) ? focus.history : [];
  const deferredUntil = focus.deferred_until || null;
  let status = ["idle", "active", "deferred", "completed"].includes(focus.status) ? focus.status : "idle";
  if (["deferred", "completed"].includes(status) && deferredUntil && Date.parse(deferredUntil) <= now) status = "idle";
  return {
    status,
    action: String(focus.action || ""),
    started_at: focus.started_at || null,
    deferred_until: deferredUntil,
    completed_at: focus.completed_at || null,
    action_mode: focus.action_mode || null,
    estimated_minutes: focus.estimated_minutes == null ? null : Number(focus.estimated_minutes),
    work_block_source: focus.work_block_source || null,
    plan_date: focus.plan_date || null,
    plan_sequence: focus.plan_sequence == null ? null : Number(focus.plan_sequence),
    plan_total_minutes: focus.plan_total_minutes == null ? null : Number(focus.plan_total_minutes),
    plan_density_pct: focus.plan_density_pct == null ? null : Number(focus.plan_density_pct),
    plan_time_window: focus.plan_time_window || null,
    plan_work_type: focus.plan_work_type || null,
    plan_composition_mode: focus.plan_composition_mode || null,
    defer_reason: normalizeDeferReason(focus.defer_reason),
    history
  };
}

function focusStateForOpportunity(opportunity, now = Date.now()) {
  return normalizeFocusState(opportunity.focus || {}, now);
}



function effortEvidenceLevel(samples) {
  const n = Number(samples || 0);
  if (n < 3) return "Insufficient";
  if (n < 6) return "Provisional";
  if (n < 12) return "Established";
  return "Strong";
}

function median(values = []) {
  const rows = values.filter(Number.isFinite).sort((a,b) => a-b);
  if (!rows.length) return null;
  const mid = Math.floor(rows.length / 2);
  return rows.length % 2 ? rows[mid] : (rows[mid - 1] + rows[mid]) / 2;
}

function focusEffortCalibration(opportunity, now = Date.now(), days = 30) {
  const cutoff = now - days * DAY_MS;
  const history = Array.isArray(opportunity?.focus?.history) ? opportunity.focus.history : [];
  const samples = history.filter(event => {
    const at = Date.parse(event.at || "");
    const estimate = Number(event.estimated_minutes);
    const actual = Number(event.duration_minutes);
    return ["completed", "deferred"].includes(event.event) && Number.isFinite(at) && at >= cutoff && at <= now && Number.isFinite(estimate) && estimate > 0 && Number.isFinite(actual) && actual > 0 && actual <= 480;
  }).map(event => ({
    mode: String(event.action_mode || "standard"),
    estimated_minutes: Number(event.estimated_minutes),
    actual_minutes: Number(event.duration_minutes),
    ratio: Number(event.duration_minutes) / Number(event.estimated_minutes)
  }));

  const summarize = rows => {
    const count = rows.length;
    const ratio = median(rows.map(row => row.ratio));
    const factor = count >= 3 && ratio != null ? Math.max(0.5, Math.min(2.5, ratio)) : 1;
    return {
      samples: count,
      evidence_level: effortEvidenceLevel(count),
      median_estimated_minutes: count ? Math.round(median(rows.map(row => row.estimated_minutes))) : null,
      median_actual_minutes: count ? Math.round(median(rows.map(row => row.actual_minutes))) : null,
      calibration_factor: Number(factor.toFixed(2)),
      adjustment_active: count >= 3
    };
  };

  const byMode = {};
  for (const mode of ["micro", "resolution", "standard"]) byMode[mode] = summarize(samples.filter(row => row.mode === mode));
  const overall = summarize(samples);
  let signal = "Not enough timing data";
  let guidance = "Complete or defer timed focus sessions so Atlas can compare estimated and actual effort.";
  if (overall.samples >= 3) {
    const pct = Math.round((overall.calibration_factor - 1) * 100);
    if (pct >= 20) { signal = "Work is taking longer than estimated"; guidance = "Atlas will raise timed-action estimates where enough mode-specific evidence exists."; }
    else if (pct <= -20) { signal = "Work is taking less time than estimated"; guidance = "Atlas will lower timed-action estimates where enough mode-specific evidence exists."; }
    else { signal = "Time estimates are reasonably calibrated"; guidance = "Actual effort is close enough to current estimates that Atlas should avoid unnecessary changes."; }
  }
  return { window_days: days, samples: overall.samples, evidence_level: overall.evidence_level, signal, guidance, overall, modes: byMode };
}

function calibrateTimedAction(action, estimatedMinutes, mode, calibration) {
  const base = Number(estimatedMinutes);
  if (!Number.isFinite(base) || base <= 0) return { action, estimated_minutes: estimatedMinutes, base_estimated_minutes: estimatedMinutes, effort_calibration: null };
  const modeStats = calibration?.modes?.[mode];
  const stats = modeStats?.adjustment_active ? modeStats : null;
  if (!stats) return { action, estimated_minutes: base, base_estimated_minutes: base, effort_calibration: modeStats || null };
  const adjusted = Math.max(5, Math.round((base * Number(stats.calibration_factor || 1)) / 5) * 5);
  const revisedAction = adjusted === base ? action : String(action || "").replace(/Spend \d+ minutes/i, `Spend ${adjusted} minutes`).replace(/in \d+ minutes or less/i, `in ${adjusted} minutes or less`);
  return { action: revisedAction, estimated_minutes: adjusted, base_estimated_minutes: base, effort_calibration: stats };
}


function percentile(values = [], p = 0.5) {
  const rows = values.filter(Number.isFinite).sort((a,b) => a-b);
  if (!rows.length) return null;
  const index = Math.max(0, Math.min(rows.length - 1, Math.ceil(rows.length * p) - 1));
  return rows[index];
}

function focusCapacityProfile(opportunity, now = Date.now(), days = 30) {
  const cutoff = now - days * DAY_MS;
  const history = Array.isArray(opportunity?.focus?.history) ? opportunity.focus.history : [];
  const durations = history.filter(event => {
    const at = Date.parse(event.at || "");
    const actual = Number(event.duration_minutes);
    return ["completed", "deferred"].includes(event.event) && Number.isFinite(at) && at >= cutoff && at <= now && Number.isFinite(actual) && actual > 0 && actual <= 480;
  }).map(event => Number(event.duration_minutes));
  const samples = durations.length;
  const medianMinutes = samples ? Math.round(median(durations)) : null;
  const p75Minutes = samples ? Math.round(percentile(durations, 0.75)) : null;
  const active = samples >= 3;
  const typicalBlock = active ? Math.max(5, Math.round(medianMinutes / 5) * 5) : null;
  const upperBlock = active ? Math.max(typicalBlock, Math.round(p75Minutes / 5) * 5) : null;
  let signal = "Not enough capacity data";
  let guidance = "Resolve a few timed focus sessions so Atlas can learn the size of work blocks you realistically complete.";
  if (active) {
    signal = `Typical focus block is about ${typicalBlock} minutes`;
    guidance = `Atlas will flag recommendations that are materially larger than your recent ${typicalBlock}-${upperBlock} minute execution range.`;
  }
  return { window_days: days, samples, evidence_level: effortEvidenceLevel(samples), active, typical_block_minutes: typicalBlock, upper_block_minutes: upperBlock, signal, guidance };
}

function capacityFitForAction(action = {}, profile = null) {
  const estimate = Number(action?.estimated_minutes);
  if (!Number.isFinite(estimate) || estimate <= 0) return { status: "unknown", label: "No time estimate", estimated_minutes: null, score_adjustment: 0, guidance: "Atlas does not yet have a timed estimate for this action." };
  if (!profile?.active) return { status: "learning", label: "Capacity learning", estimated_minutes: estimate, score_adjustment: 0, guidance: "Atlas needs at least three timed outcomes before judging whether this fits your normal execution window." };
  const typical = Number(profile.typical_block_minutes || 0);
  const upper = Math.max(typical, Number(profile.upper_block_minutes || typical));
  if (estimate <= typical) return { status: "fit", label: "Fits typical capacity", estimated_minutes: estimate, score_adjustment: 2, guidance: `This ${estimate}-minute action fits inside your typical ${typical}-minute focus block.` };
  if (estimate <= Math.max(upper, typical * 1.5)) return { status: "stretch", label: "Needs a larger block", estimated_minutes: estimate, score_adjustment: -2, guidance: `Reserve about ${estimate} minutes; this is larger than your typical ${typical}-minute focus block but still near your recent range.` };
  return { status: "oversized", label: "Exceeds typical capacity", estimated_minutes: estimate, score_adjustment: -6, guidance: `This ${estimate}-minute action is well above your recent ${typical}-${upper} minute execution range. Schedule a dedicated block or split it before starting.` };
}


function normalizeWorkBlockMinutes(value, profile = null) {
  const parsed = Number(value);
  if (Number.isFinite(parsed) && parsed >= 10 && parsed <= 180) return Math.round(parsed / 5) * 5;
  if (profile?.active && Number(profile.typical_block_minutes) > 0) return Number(profile.typical_block_minutes);
  return 30;
}

function nextWorkBlockPlan(opportunities = [], now = Date.now(), requestedMinutes = null, excludedIds = [], planningContext = {}) {
  const history = opportunities.flatMap(item => Array.isArray(item.focus?.history) ? item.focus.history : []);
  const capacityProfile = focusCapacityProfile({ focus: { history } }, now);
  const availableMinutes = normalizeWorkBlockMinutes(requestedMinutes, capacityProfile);
  const source = Number.isFinite(Number(requestedMinutes)) && Number(requestedMinutes) >= 10 ? "requested" : (capacityProfile.active ? "learned_capacity" : "default");
  const adaptiveContext = adaptiveStrategyContext(opportunities, now);
  const ranked = intelligenceQueue(opportunities, now, opportunity => adaptiveContext.byId.get(String(opportunity.id)) || adaptiveContext.portfolioPolicy)
    .filter(item => item.status !== "Killed" && !new Set((excludedIds || []).map(String)).has(String(item.id)));

  const candidates = ranked.map(item => {
    const adaptive = item.adaptive_next_action || {};
    const estimate = Number(adaptive.estimated_minutes);
    const hasEstimate = Number.isFinite(estimate) && estimate > 0;
    const fits = !hasEstimate || estimate <= availableMinutes;
    let action = adaptive.action || item.strategic_recommendation || item.recommendation || "Review opportunity";
    let plannedMinutes = hasEstimate ? estimate : availableMinutes;
    let mode = hasEstimate ? (adaptive.mode || "timed") : "timeboxed_standard";
    let fitLabel = hasEstimate ? (fits ? "Fits this block" : "Too large for this block") : "Time-boxed to this block";
    let planningScore = Number(item.work_priority_score || 0);
    const windowFit = Array.isArray(planningContext?.time_window_priority?.items)
      ? planningContext.time_window_priority.items.find(entry => String(entry.id) === String(item.id))
      : null;
    const windowAdjustment = Number(windowFit?.score_adjustment || 0);
    const workType = workTypeForAction(action);
    const workTypeFit = Array.isArray(planningContext?.work_type_learning?.types)
      ? planningContext.work_type_learning.types.find(entry => entry.work_type === workType)
      : null;
    const workTypeAdjustment = Number(workTypeFit?.score_adjustment || 0);
    const selectedWorkTypes = Array.isArray(planningContext?.selected_work_types) ? planningContext.selected_work_types : [];
    const compositionAdjustment = dailyPlanCompositionAdjustment(workType, selectedWorkTypes, planningContext?.composition_learning || {});
    const sequenceFit = dailyPlanSequenceAdjustment(workType, planningContext?.projected_position || (selectedWorkTypes.length ? "middle" : "first"), selectedWorkTypes, planningContext?.sequence_learning || {});
    if (windowAdjustment) planningScore += windowAdjustment;
    if (workTypeAdjustment) planningScore += workTypeAdjustment;
    if (compositionAdjustment) planningScore += compositionAdjustment;
    if (sequenceFit.adjustment) planningScore += sequenceFit.adjustment;
    if (hasEstimate && fits) planningScore += Math.max(1, Math.min(6, Math.round((availableMinutes - estimate) / 10) + 3));
    if (hasEstimate && !fits) planningScore -= 15;
    if (item.focus?.status === "active") planningScore += 8;
    if (!hasEstimate) {
      action = `Spend ${availableMinutes} minutes advancing this recommendation: ${action}`;
      plannedMinutes = availableMinutes;
    }
    return {
      id: item.id, name: item.name, status: item.status, work_priority_score: item.work_priority_score, planning_score: Math.max(0, Math.min(120, planningScore)),
      action, estimated_minutes: plannedMinutes, original_estimated_minutes: hasEstimate ? estimate : null, mode, fits, fit_label: fitLabel, time_window_fit: windowFit || null, work_type: workType, work_type_fit: workTypeFit || null, composition_adjustment: compositionAdjustment, sequence_fit: sequenceFit, sequence_adjustment: sequenceFit.adjustment,
      reason: item.focus?.status === "active" ? "Continue the work you already started before opening a new execution loop." : (workTypeAdjustment > 0 ? `This ${workTypeLabel(workType).toLowerCase()} work has established evidence of stronger follow-through in the current time window.` : (workTypeAdjustment < 0 ? `This ${workTypeLabel(workType).toLowerCase()} work has established evidence of weaker follow-through in the current time window, so Atlas reduced its near-term planning priority.` : (windowAdjustment > 0 ? `This work has established evidence of stronger follow-through in the current ${windowFit.label.toLowerCase()} window.` : (windowAdjustment < 0 ? `This work has established evidence of weaker follow-through in the current ${windowFit.label.toLowerCase()} window, so Atlas reduced its near-term planning priority.` : (hasEstimate && fits ? "High-priority work that fits inside the available block." : (!hasEstimate ? "High-priority work converted into a bounded execution block." : "Strategically important, but it needs more time than this block allows."))))))
    };
  }).sort((a,b) => (Number(b.fits)-Number(a.fits)) || b.planning_score-a.planning_score || b.work_priority_score-a.work_priority_score);

  const usable = candidates.filter(item => item.fits).slice(0, 3);
  const selected = usable[0] || candidates[0] || null;
  return {
    available_minutes: availableMinutes, source, capacity_profile: capacityProfile,
    signal: selected ? `Best use of the next ${availableMinutes} minutes: ${selected.name}` : "No executable work block available",
    guidance: selected ? "Atlas ranked work by strategic priority and whether it can realistically fit inside this execution window." : "Add or reopen an opportunity to create an executable work block.",
    selected, alternatives: usable.slice(1, 3), considered: candidates.length
  };
}


function normalizeDailyPlanMinutes(value) {
  const parsed = Number(value);
  if (Number.isFinite(parsed) && parsed >= 30 && parsed <= 360) return Math.round(parsed / 15) * 15;
  return 90;
}

function dailyPlanAdaptation(summary = {}, requestedMinutes = 90) {
  const totalMinutes = normalizeDailyPlanMinutes(requestedMinutes);
  const adjustment = summary?.adjustment || "learning";
  let density = 1;
  let mode = "learning";
  let label = "Learning plan fit";
  let reason = "Atlas does not have enough daily-plan evidence yet, so it will use the full requested window while learning.";
  if (adjustment === "reduce") {
    density = 0.7;
    mode = "reduce";
    label = "Lighter plan";
    reason = "Recent daily plans look overpacked, so Atlas is intentionally leaving more breathing room.";
  } else if (adjustment === "selective") {
    density = 0.85;
    mode = "selective";
    label = "Conservative plan";
    reason = "Daily-plan fit is mixed, so Atlas is reserving part of the available window instead of filling it completely.";
  } else if (adjustment === "maintain") {
    density = 1;
    mode = "maintain";
    label = "Full plan";
    reason = "Recent daily plans are fitting well, so Atlas will use the full requested execution window.";
  }
  const targetMinutes = Math.max(30, Math.min(totalMinutes, Math.round((totalMinutes * density) / 15) * 15));
  return { mode, label, density_pct: Math.round(density * 100), requested_minutes: totalMinutes, target_minutes: targetMinutes, reserved_minutes: totalMinutes - targetMinutes, reason };
}

function dailyPlanDensityLearning(opportunities = [], now = Date.now(), days = 28) {
  const cutoff = now - days * DAY_MS;
  const events = opportunities.flatMap(opportunity => (Array.isArray(opportunity.focus?.history) ? opportunity.focus.history : []).map(event => ({ ...event, opportunity_id: opportunity.id })));
  const starts = events.filter(event => event.event === "started" && event.work_block_source === "daily_work_plan" && Number.isFinite(Number(event.plan_density_pct)) && Number.isFinite(Date.parse(event.at || "")) && Date.parse(event.at) >= cutoff && Date.parse(event.at) <= now);
  const outcomes = events.filter(event => ["completed", "deferred"].includes(event.event) && event.work_block_source === "daily_work_plan" && Number.isFinite(Number(event.plan_density_pct)) && Number.isFinite(Date.parse(event.at || "")) && Date.parse(event.at) >= cutoff && Date.parse(event.at) <= now);
  const bands = [70, 85, 100].map(density => {
    const bandStarts = starts.filter(event => Number(event.plan_density_pct) === density);
    const bandOutcomes = outcomes.filter(event => Number(event.plan_density_pct) === density);
    const completed = bandOutcomes.filter(event => event.event === "completed").length;
    const deferred = bandOutcomes.filter(event => event.event === "deferred").length;
    const resolved = completed + deferred;
    const follow = resolved ? Math.round(completed / resolved * 100) : null;
    const execution = bandStarts.length ? Math.round(resolved / bandStarts.length * 100) : null;
    const evidence = resolved >= 8 ? "Strong" : resolved >= 4 ? "Established" : resolved >= 2 ? "Provisional" : "Insufficient";
    const score = resolved >= 2 ? Math.round(((follow || 0) * 0.7) + ((execution || 0) * 0.3)) : null;
    return { density_pct: density, label: density === 70 ? "Lighter" : density === 85 ? "Conservative" : "Full", started: bandStarts.length, resolved, completed, deferred, follow_through_pct: follow, execution_pct: execution, evidence, performance_score: score };
  });
  const eligible = bands.filter(band => band.resolved >= 2 && band.performance_score != null).sort((a,b) => b.performance_score - a.performance_score || b.resolved - a.resolved);
  const best = eligible[0] || null;
  let signal = "Density baseline forming";
  let guidance = "Resolve daily-plan blocks at different planning densities so Atlas can learn which schedule density produces the best follow-through.";
  if (best) {
    signal = `${best.label} density is leading`;
    guidance = best.evidence === "Provisional" ? `Early evidence favors ${best.density_pct}% planning density, but Atlas needs more resolved blocks before adapting the controller.` : `${best.density_pct}% planning density currently has the strongest execution evidence. Keep collecting outcomes before making permanent controller changes.`;
  }
  return { window_days: days, signal, guidance, best_density_pct: best?.density_pct ?? null, best_evidence: best?.evidence || "Insufficient", bands };
}

function densityEvidenceRank(evidence = "Insufficient") {
  return { Insufficient: 0, Provisional: 1, Established: 2, Strong: 3 }[evidence] || 0;
}

function lastDailyPlanDensitySnapshot(opportunities = [], now = Date.now(), days = 60) {
  const cutoff = now - days * DAY_MS;
  const starts = opportunities.flatMap(opportunity => (Array.isArray(opportunity.focus?.history) ? opportunity.focus.history : []).map(event => ({ ...event, opportunity_id: opportunity.id })))
    .filter(event => event.event === "started" && event.work_block_source === "daily_work_plan" && [70, 85, 100].includes(Number(event.plan_density_pct)) && Number.isFinite(Date.parse(event.at || "")) && Date.parse(event.at) >= cutoff && Date.parse(event.at) <= now)
    .sort((a,b) => Date.parse(b.at) - Date.parse(a.at));
  if (!starts.length) return null;
  return { density_pct: Number(starts[0].plan_density_pct), at: starts[0].at, opportunity_id: starts[0].opportunity_id };
}

function dailyPlanDensityController(opportunities = [], now = Date.now(), requestedMinutes = 90, executionSummary = null, learning = null) {
  const summary = executionSummary || dailyPlanExecutionSummary(opportunities, now);
  const learned = learning || dailyPlanDensityLearning(opportunities, now);
  const baseline = dailyPlanAdaptation(summary, requestedMinutes);
  const prior = lastDailyPlanDensitySnapshot(opportunities, now);
  const byDensity = new Map((learned.bands || []).map(band => [Number(band.density_pct), band]));
  const candidate = learned.best_density_pct == null ? null : byDensity.get(Number(learned.best_density_pct));
  const priorBand = prior ? byDensity.get(Number(prior.density_pct)) : null;
  let density = baseline.density_pct;
  let source = "rule_based";
  let stability = "Learning density";
  let reason = baseline.reason;

  if (candidate && densityEvidenceRank(candidate.evidence) >= 2) {
    let accept = true;
    if (priorBand && priorBand.density_pct !== candidate.density_pct && densityEvidenceRank(priorBand.evidence) >= 2) {
      const evidenceOk = densityEvidenceRank(candidate.evidence) >= densityEvidenceRank(priorBand.evidence);
      const requiredLead = priorBand.evidence === "Strong" ? 12 : 10;
      const lead = Number(candidate.performance_score || 0) - Number(priorBand.performance_score || 0);
      accept = evidenceOk && lead >= requiredLead;
      if (!accept) {
        density = priorBand.density_pct;
        source = "learned_stable";
        stability = "Learned density held for stability";
        reason = `Atlas is holding the previously used ${priorBand.density_pct}% density because the challenger does not yet have comparable evidence plus a ${requiredLead}-point performance advantage.`;
      }
    }
    if (accept) {
      density = candidate.density_pct;
      source = "learned";
      stability = prior && prior.density_pct !== candidate.density_pct ? "Learned density change accepted" : "Learned density active";
      reason = `${candidate.density_pct}% planning density has ${candidate.evidence.toLowerCase()} evidence and the strongest observed execution performance, so Atlas is using it as the planning target.`;
    }
  } else if (priorBand && densityEvidenceRank(priorBand.evidence) >= 2) {
    density = priorBand.density_pct;
    source = "learned_stable";
    stability = "Learned density held for stability";
    reason = `Atlas is preserving the previously learned ${priorBand.density_pct}% density while new density evidence develops.`;
  }

  const totalMinutes = normalizeDailyPlanMinutes(requestedMinutes);
  const targetMinutes = Math.max(30, Math.min(totalMinutes, Math.round((totalMinutes * density / 100) / 15) * 15));
  const label = source.startsWith("learned") ? `Learned ${density}% plan` : baseline.label;
  const mode = source.startsWith("learned") ? "learned" : baseline.mode;
  return { ...baseline, mode, label, density_pct: density, target_minutes: targetMinutes, reserved_minutes: totalMinutes - targetMinutes, source, stability, reason, prior_density_pct: prior?.density_pct ?? null, evidence: candidate?.evidence || "Insufficient", performance_score: candidate?.performance_score ?? null };
}


function localHour(timestamp, timeZone = ATLAS_TIME_ZONE) {
  const date = new Date(timestamp);
  if (!Number.isFinite(date.getTime())) return null;
  try {
    const parts = new Intl.DateTimeFormat("en-US", { timeZone, hour: "2-digit", hourCycle: "h23" }).formatToParts(date);
    const value = Number(parts.find(part => part.type === "hour")?.value);
    return Number.isFinite(value) ? value : null;
  } catch {
    return date.getUTCHours();
  }
}

function executionTimeWindow(timestamp, timeZone = ATLAS_TIME_ZONE) {
  const hour = localHour(timestamp, timeZone);
  if (hour == null) return null;
  if (hour >= 5 && hour < 12) return "morning";
  if (hour >= 12 && hour < 17) return "afternoon";
  if (hour >= 17 && hour < 22) return "evening";
  return "late_night";
}

function timeWindowEvidenceLevel(resolved) {
  const n = Number(resolved || 0);
  if (n >= 8) return "Strong";
  if (n >= 4) return "Established";
  if (n >= 2) return "Provisional";
  return "Insufficient";
}

function dailyPlanTimeWindowLearning(opportunities = [], now = Date.now(), days = 28) {
  const cutoff = now - days * DAY_MS;
  const events = opportunities.flatMap(opportunity => (Array.isArray(opportunity.focus?.history) ? opportunity.focus.history : []).map(event => ({ ...event, opportunity_id: opportunity.id })));
  const valid = event => event.work_block_source === "daily_work_plan" && Number.isFinite(Date.parse(event.at || "")) && Date.parse(event.at) >= cutoff && Date.parse(event.at) <= now;
  const starts = events.filter(event => event.event === "started" && valid(event));
  const outcomes = events.filter(event => ["completed", "deferred"].includes(event.event) && valid(event));
  const definitions = [
    ["morning", "Morning"],
    ["afternoon", "Afternoon"],
    ["evening", "Evening"],
    ["late_night", "Late night"]
  ];
  const windows = definitions.map(([key, label]) => {
    const started = starts.filter(event => (event.plan_time_window || executionTimeWindow(event.at)) === key);
    const resolvedEvents = outcomes.filter(event => (event.plan_time_window || null) === key);
    const completed = resolvedEvents.filter(event => event.event === "completed").length;
    const deferred = resolvedEvents.filter(event => event.event === "deferred").length;
    const resolved = completed + deferred;
    const followThrough = resolved ? Math.round(completed / resolved * 100) : null;
    const execution = started.length ? Math.round(resolved / started.length * 100) : null;
    const performance = resolved >= 2 ? Math.round(((followThrough || 0) * 0.75) + ((execution || 0) * 0.25)) : null;
    return { window: key, label, started: started.length, resolved, completed, deferred, follow_through_pct: followThrough, execution_pct: execution, evidence: timeWindowEvidenceLevel(resolved), performance_score: performance };
  });
  const eligible = windows.filter(item => item.resolved >= 2 && item.performance_score != null).sort((a,b) => b.performance_score - a.performance_score || b.resolved - a.resolved);
  const best = eligible[0] || null;
  let signal = "Time-of-day baseline forming";
  let guidance = "Complete or defer Daily Work Plan blocks at different times so Atlas can learn when planned work is most likely to get finished.";
  if (best) {
    signal = `${best.label} execution is leading`;
    guidance = best.evidence === "Provisional"
      ? `Early evidence favors ${best.label.toLowerCase()} work, but Atlas needs more resolved blocks before treating that as a preferred execution window.`
      : `${best.label} currently has the strongest daily-plan follow-through. Atlas will surface this preference without overriding the time you actually have available.`;
  }
  return { window_days: days, signal, guidance, preferred_window: best?.window || null, preferred_label: best?.label || null, preferred_evidence: best?.evidence || "Insufficient", windows };
}


function opportunityTimeWindowFit(opportunity = {}, now = Date.now(), days = 42) {
  const currentWindow = executionTimeWindow(now);
  const labelMap = { morning: "Morning", afternoon: "Afternoon", evening: "Evening", late_night: "Late night" };
  const cutoff = now - days * DAY_MS;
  const history = Array.isArray(opportunity.focus?.history) ? opportunity.focus.history : [];
  const valid = event => event.work_block_source === "daily_work_plan" && (event.plan_time_window || executionTimeWindow(event.at)) === currentWindow && Number.isFinite(Date.parse(event.at || "")) && Date.parse(event.at) >= cutoff && Date.parse(event.at) <= now;
  const starts = history.filter(event => event.event === "started" && valid(event));
  const outcomes = history.filter(event => ["completed", "deferred"].includes(event.event) && valid(event));
  const completed = outcomes.filter(event => event.event === "completed").length;
  const deferred = outcomes.filter(event => event.event === "deferred").length;
  const resolved = completed + deferred;
  const followThrough = resolved ? Math.round(completed / resolved * 100) : null;
  const execution = starts.length ? Math.round(resolved / starts.length * 100) : null;
  const performance = resolved >= 2 ? Math.round(((followThrough || 0) * 0.75) + ((execution || 0) * 0.25)) : null;
  const evidence = timeWindowEvidenceLevel(resolved);
  let scoreAdjustment = 0;
  let fit = "learning";
  if (["Established", "Strong"].includes(evidence) && performance != null) {
    const magnitude = evidence === "Strong" ? 6 : 4;
    if (performance >= 80) { scoreAdjustment = magnitude; fit = "strong_fit"; }
    else if (performance <= 50) { scoreAdjustment = -magnitude; fit = "weak_fit"; }
    else fit = "neutral_fit";
  }
  return {
    id: opportunity.id,
    name: opportunity.name,
    window: currentWindow,
    label: labelMap[currentWindow] || "Current",
    started: starts.length,
    resolved,
    completed,
    deferred,
    follow_through_pct: followThrough,
    execution_pct: execution,
    performance_score: performance,
    evidence,
    fit,
    score_adjustment: scoreAdjustment
  };
}

function dailyPlanTimeWindowPriority(opportunities = [], now = Date.now(), days = 42) {
  const currentWindow = executionTimeWindow(now);
  const labelMap = { morning: "Morning", afternoon: "Afternoon", evening: "Evening", late_night: "Late night" };
  const items = opportunities.filter(item => item.status !== "Killed").map(item => opportunityTimeWindowFit(item, now, days));
  const active = items.filter(item => item.score_adjustment !== 0);
  const positive = active.filter(item => item.score_adjustment > 0).sort((a,b) => b.performance_score - a.performance_score || b.resolved - a.resolved);
  const negative = active.filter(item => item.score_adjustment < 0).sort((a,b) => a.performance_score - b.performance_score || b.resolved - a.resolved);
  let signal = `${labelMap[currentWindow] || "Current"} prioritization learning`;
  let guidance = "Atlas will keep time-of-day priority neutral until an individual opportunity has at least four resolved Daily Work Plan blocks in this same execution window.";
  if (active.length) {
    signal = `${labelMap[currentWindow] || "Current"} execution fit is active`;
    guidance = `Atlas is modestly adjusting today's planning order for ${active.length} opportunit${active.length === 1 ? "y" : "ies"} with established time-window evidence. Atlas Score itself is unchanged.`;
  }
  return {
    window_days: days,
    current_window: currentWindow,
    current_label: labelMap[currentWindow] || "Current",
    signal,
    guidance,
    adjusted_count: active.length,
    positive_count: positive.length,
    negative_count: negative.length,
    strongest_fit: positive[0] || null,
    weakest_fit: negative[0] || null,
    items
  };
}


function workTypeForAction(action = "") {
  const text = String(action || "").toLowerCase();
  const rules = [
    ["research", ["research", "validate", "investigate", "compare", "analyze", "analyse", "find", "market", "demand"]],
    ["create", ["create", "build", "draft", "write", "design", "make", "produce"]],
    ["edit", ["edit", "revise", "polish", "update", "improve", "refine"]],
    ["setup", ["setup", "set up", "configure", "connect", "publish", "launch", "upload", "install"]],
    ["review", ["review", "check", "audit", "evaluate", "decision", "checkpoint"]],
    ["outreach", ["contact", "email", "message", "call", "pitch", "outreach", "follow up", "follow-up"]]
  ];
  for (const [type, keywords] of rules) if (keywords.some(keyword => text.includes(keyword))) return type;
  return "general";
}

function workTypeLabel(type) {
  return ({ research: "Research", create: "Creation", edit: "Editing", setup: "Setup", review: "Review", outreach: "Outreach", general: "General" })[type] || "General";
}

function dailyPlanWorkTypeLearning(opportunities = [], now = Date.now(), days = 42) {
  const cutoff = now - days * DAY_MS;
  const currentWindow = executionTimeWindow(now);
  const events = opportunities.flatMap(opportunity => (Array.isArray(opportunity.focus?.history) ? opportunity.focus.history : []).map(event => ({ ...event, opportunity_id: opportunity.id })));
  const valid = event => event.work_block_source === "daily_work_plan" && (event.plan_time_window || executionTimeWindow(event.at)) === currentWindow && Number.isFinite(Date.parse(event.at || "")) && Date.parse(event.at) >= cutoff && Date.parse(event.at) <= now;
  const starts = events.filter(event => event.event === "started" && valid(event));
  const outcomes = events.filter(event => ["completed", "deferred"].includes(event.event) && valid(event));
  const types = ["research", "create", "edit", "setup", "review", "outreach", "general"].map(type => {
    const started = starts.filter(event => (event.plan_work_type || workTypeForAction(event.action)) === type);
    const resolvedEvents = outcomes.filter(event => (event.plan_work_type || workTypeForAction(event.action)) === type);
    const completed = resolvedEvents.filter(event => event.event === "completed").length;
    const deferred = resolvedEvents.filter(event => event.event === "deferred").length;
    const resolved = completed + deferred;
    const followThrough = resolved ? Math.round(completed / resolved * 100) : null;
    const execution = started.length ? Math.round(resolved / started.length * 100) : null;
    const performance = resolved >= 2 ? Math.round(((followThrough || 0) * 0.75) + ((execution || 0) * 0.25)) : null;
    const evidence = timeWindowEvidenceLevel(resolved);
    let scoreAdjustment = 0;
    let fit = "learning";
    if (["Established", "Strong"].includes(evidence) && performance != null) {
      const magnitude = evidence === "Strong" ? 4 : 3;
      if (performance >= 80) { scoreAdjustment = magnitude; fit = "strong_fit"; }
      else if (performance <= 50) { scoreAdjustment = -magnitude; fit = "weak_fit"; }
      else fit = "neutral_fit";
    }
    return { work_type: type, label: workTypeLabel(type), started: started.length, resolved, completed, deferred, follow_through_pct: followThrough, execution_pct: execution, performance_score: performance, evidence, fit, score_adjustment: scoreAdjustment };
  });
  const active = types.filter(item => item.score_adjustment !== 0);
  const best = types.filter(item => ["Established", "Strong"].includes(item.evidence) && item.performance_score != null).sort((a,b) => b.performance_score - a.performance_score || b.resolved - a.resolved)[0] || null;
  const labelMap = { morning: "Morning", afternoon: "Afternoon", evening: "Evening", late_night: "Late night" };
  let signal = `${labelMap[currentWindow] || "Current"} work-type learning`;
  let guidance = "Atlas needs at least four resolved blocks of the same work type in this time window before using task-type fit to influence the Daily Work Plan.";
  if (active.length) {
    signal = `${labelMap[currentWindow] || "Current"} work-type fit is active`;
    guidance = `Atlas has established evidence for ${active.length} work type${active.length === 1 ? "" : "s"} in this time window and can apply a small planning-priority adjustment without changing Atlas Score.`;
  }
  return { window_days: days, current_window: currentWindow, current_label: labelMap[currentWindow] || "Current", signal, guidance, adjusted_count: active.length, strongest_type: best, types };
}


function compositionEvidenceLevel(planDays) {
  const n = Number(planDays || 0);
  if (n >= 6) return "Strong";
  if (n >= 3) return "Established";
  if (n >= 2) return "Provisional";
  return "Insufficient";
}

function dailyPlanCompositionLearning(opportunities = [], now = Date.now(), days = 56) {
  const cutoff = now - days * DAY_MS;
  const currentWindow = executionTimeWindow(now);
  const events = opportunities.flatMap(opportunity => (Array.isArray(opportunity.focus?.history) ? opportunity.focus.history : []).map(event => ({ ...event, opportunity_id: opportunity.id })));
  const valid = event => event.work_block_source === "daily_work_plan" && (event.plan_time_window || executionTimeWindow(event.at)) === currentWindow && Number.isFinite(Date.parse(event.at || "")) && Date.parse(event.at) >= cutoff && Date.parse(event.at) <= now;
  const outcomes = events.filter(event => ["completed", "deferred"].includes(event.event) && valid(event));
  const byDay = new Map();
  for (const event of outcomes) {
    const key = event.plan_date || localDateKey(event.at);
    if (!key) continue;
    if (!byDay.has(key)) byDay.set(key, []);
    byDay.get(key).push(event);
  }
  const planDays = [...byDay.entries()].map(([date, dayEvents]) => {
    const completed = dayEvents.filter(event => event.event === "completed").length;
    const deferred = dayEvents.filter(event => event.event === "deferred").length;
    const resolved = completed + deferred;
    const types = [...new Set(dayEvents.map(event => event.plan_work_type || workTypeForAction(event.action)))];
    const composition = types.length >= 2 ? "mixed" : "focused";
    const followThrough = resolved ? Math.round(completed / resolved * 100) : null;
    return { date, composition, resolved, completed, deferred, follow_through_pct: followThrough, work_types: types };
  }).filter(day => day.resolved >= 2);

  const modes = ["mixed", "focused"].map(mode => {
    const matching = planDays.filter(day => day.composition === mode);
    const resolved = matching.reduce((sum, day) => sum + day.resolved, 0);
    const completed = matching.reduce((sum, day) => sum + day.completed, 0);
    const deferred = matching.reduce((sum, day) => sum + day.deferred, 0);
    const followThrough = resolved ? Math.round(completed / resolved * 100) : null;
    const averageDay = matching.length ? Math.round(matching.reduce((sum, day) => sum + Number(day.follow_through_pct || 0), 0) / matching.length) : null;
    const performance = matching.length >= 2 ? Math.round((Number(averageDay || 0) * 0.7) + (Number(followThrough || 0) * 0.3)) : null;
    return { mode, label: mode === "mixed" ? "Mixed work-type plan" : "Focused work-type plan", plan_days: matching.length, resolved, completed, deferred, follow_through_pct: followThrough, average_day_follow_through_pct: averageDay, evidence: compositionEvidenceLevel(matching.length), performance_score: performance };
  });
  const mixed = modes.find(item => item.mode === "mixed");
  const focused = modes.find(item => item.mode === "focused");
  let mode = "learning";
  let preferred = null;
  const bothComparable = compositionEvidenceLevel(mixed.plan_days) !== "Insufficient" && compositionEvidenceLevel(focused.plan_days) !== "Insufficient";
  const winner = [...modes].filter(item => ["Established", "Strong"].includes(item.evidence) && item.performance_score != null).sort((a,b) => b.performance_score - a.performance_score || b.plan_days - a.plan_days)[0] || null;
  const other = winner ? modes.find(item => item.mode !== winner.mode) : null;
  if (winner && bothComparable && other?.performance_score != null && winner.performance_score - other.performance_score >= 10) {
    mode = winner.mode;
    preferred = winner;
  }
  const labelMap = { morning: "Morning", afternoon: "Afternoon", evening: "Evening", late_night: "Late night" };
  let signal = `${labelMap[currentWindow] || "Current"} plan-mix baseline forming`;
  let guidance = "Atlas is comparing focused plans with mixed work-type plans. It needs at least three days for a winning pattern, at least two days of comparison evidence, and a meaningful performance gap before shaping the plan mix.";
  if (preferred) {
    signal = `${preferred.label} is leading in ${labelMap[currentWindow] || "this window"}`;
    guidance = `Atlas has enough comparative evidence to gently favor ${preferred.mode === "mixed" ? "a varied work-type mix" : "work-type continuity"} in this time window. The adjustment is small and never changes Atlas Score or your available-time cap.`;
  }
  return { window_days: days, current_window: currentWindow, current_label: labelMap[currentWindow] || "Current", signal, guidance, mode, preferred_mode: preferred?.mode || null, preferred_label: preferred?.label || null, preferred_evidence: preferred?.evidence || "Insufficient", performance_gap: preferred && other?.performance_score != null ? preferred.performance_score - other.performance_score : null, modes, plan_days: planDays.length };
}

function dailyPlanCompositionAdjustment(workType, selectedWorkTypes = [], composition = {}) {
  if (!["mixed", "focused"].includes(composition?.mode) || !selectedWorkTypes.length) return 0;
  const first = selectedWorkTypes[0];
  if (composition.mode === "mixed") return selectedWorkTypes.includes(workType) ? -2 : 2;
  return workType === first ? 2 : -2;
}


function sequenceEvidenceLevel(resolved) {
  const n = Number(resolved || 0);
  if (n >= 8) return "Strong";
  if (n >= 4) return "Established";
  if (n >= 2) return "Provisional";
  return "Insufficient";
}

function dailyPlanSequenceLearning(opportunities = [], now = Date.now(), days = 56) {
  const cutoff = now - days * DAY_MS;
  const currentWindow = executionTimeWindow(now);
  const events = opportunities.flatMap(opportunity => (Array.isArray(opportunity.focus?.history) ? opportunity.focus.history : []).map(event => ({ ...event, opportunity_id: opportunity.id })));
  const valid = event => event.work_block_source === "daily_work_plan" && (event.plan_time_window || executionTimeWindow(event.at)) === currentWindow && Number.isFinite(Date.parse(event.at || "")) && Date.parse(event.at) >= cutoff && Date.parse(event.at) <= now;
  const outcomes = events.filter(event => ["completed", "deferred"].includes(event.event) && valid(event) && Number(event.plan_sequence || 0) >= 1);
  const byDay = new Map();
  for (const event of outcomes) {
    const date = event.plan_date || localDateKey(event.at);
    if (!date) continue;
    if (!byDay.has(date)) byDay.set(date, []);
    byDay.get(date).push(event);
  }
  const positioned = [];
  const transitions = [];
  for (const [date, dayEvents] of byDay.entries()) {
    const ordered = [...dayEvents].sort((a,b) => Number(a.plan_sequence || 0) - Number(b.plan_sequence || 0));
    const maxSequence = ordered.reduce((m,e) => Math.max(m, Number(e.plan_sequence || 0)), 0);
    for (let i = 0; i < ordered.length; i++) {
      const event = ordered[i];
      const sequence = Number(event.plan_sequence || 0);
      const position = sequence === 1 ? "first" : (sequence === maxSequence && maxSequence > 1 ? "last" : "middle");
      const workType = event.plan_work_type || workTypeForAction(event.action);
      positioned.push({ ...event, date, sequence, position, work_type: workType });
      const prior = ordered.slice(0, i).filter(x => Number(x.plan_sequence || 0) < sequence).at(-1);
      if (prior) {
        const from = prior.plan_work_type || workTypeForAction(prior.action);
        const to = workType;
        transitions.push({ date, from, to, key: `${from}>${to}`, event: event.event });
      }
    }
  }
  const workTypes = ["research", "create", "edit", "setup", "review", "outreach", "general"];
  const positionNames = ["first", "middle", "last"];
  const positionFits = [];
  for (const workType of workTypes) {
    for (const position of positionNames) {
      const matching = positioned.filter(item => item.work_type === workType && item.position === position);
      const completed = matching.filter(item => item.event === "completed").length;
      const deferred = matching.filter(item => item.event === "deferred").length;
      const resolved = completed + deferred;
      const followThrough = resolved ? Math.round(completed / resolved * 100) : null;
      const evidence = sequenceEvidenceLevel(resolved);
      let fit = "learning";
      let scoreAdjustment = 0;
      if (["Established", "Strong"].includes(evidence) && followThrough != null) {
        const magnitude = evidence === "Strong" ? 2 : 1;
        if (followThrough >= 80) { fit = "strong_fit"; scoreAdjustment = magnitude; }
        else if (followThrough <= 50) { fit = "weak_fit"; scoreAdjustment = -magnitude; }
        else fit = "neutral_fit";
      }
      positionFits.push({ work_type: workType, work_type_label: workTypeLabel(workType), position, resolved, completed, deferred, follow_through_pct: followThrough, evidence, fit, score_adjustment: scoreAdjustment });
    }
  }
  const transitionKeys = [...new Set(transitions.map(item => item.key))];
  const transitionFits = transitionKeys.map(key => {
    const matching = transitions.filter(item => item.key === key);
    const completed = matching.filter(item => item.event === "completed").length;
    const deferred = matching.filter(item => item.event === "deferred").length;
    const resolved = completed + deferred;
    const followThrough = resolved ? Math.round(completed / resolved * 100) : null;
    const evidence = sequenceEvidenceLevel(resolved);
    let fit = "learning";
    let scoreAdjustment = 0;
    if (["Established", "Strong"].includes(evidence) && followThrough != null) {
      if (followThrough >= 80) { fit = "strong_fit"; scoreAdjustment = 1; }
      else if (followThrough <= 50) { fit = "weak_fit"; scoreAdjustment = -1; }
      else fit = "neutral_fit";
    }
    const [from, to] = key.split(">");
    return { key, from, to, from_label: workTypeLabel(from), to_label: workTypeLabel(to), resolved, completed, deferred, follow_through_pct: followThrough, evidence, fit, score_adjustment: scoreAdjustment };
  });
  const activePositions = positionFits.filter(item => item.score_adjustment !== 0);
  const activeTransitions = transitionFits.filter(item => item.score_adjustment !== 0);
  const labelMap = { morning: "Morning", afternoon: "Afternoon", evening: "Evening", late_night: "Late night" };
  let signal = `${labelMap[currentWindow] || "Current"} sequence baseline forming`;
  let guidance = "Atlas is learning whether specific work types perform differently first, middle, or last, and whether repeated work-type transitions help or hurt follow-through.";
  if (activePositions.length || activeTransitions.length) {
    signal = `${labelMap[currentWindow] || "Current"} sequence fit is active`;
    guidance = `Atlas has evidence-backed sequence signals for ${activePositions.length} position fit${activePositions.length === 1 ? "" : "s"} and ${activeTransitions.length} transition${activeTransitions.length === 1 ? "" : "s"}. Their combined influence is intentionally small and never changes Atlas Score.`;
  }
  return { window_days: days, current_window: currentWindow, current_label: labelMap[currentWindow] || "Current", signal, guidance, adjusted_positions: activePositions.length, adjusted_transitions: activeTransitions.length, positions: positionFits, transitions: transitionFits };
}

function dailyPlanSequenceAdjustment(workType, projectedPosition = "first", selectedWorkTypes = [], learning = {}) {
  const positionFit = Array.isArray(learning?.positions) ? learning.positions.find(item => item.work_type === workType && item.position === projectedPosition) : null;
  const positionAdjustment = Number(positionFit?.score_adjustment || 0);
  const priorType = selectedWorkTypes.length ? selectedWorkTypes[selectedWorkTypes.length - 1] : null;
  const transitionFit = priorType && Array.isArray(learning?.transitions) ? learning.transitions.find(item => item.key === `${priorType}>${workType}`) : null;
  const transitionAdjustment = Number(transitionFit?.score_adjustment || 0);
  return { adjustment: Math.max(-3, Math.min(3, positionAdjustment + transitionAdjustment)), position_adjustment: positionAdjustment, transition_adjustment: transitionAdjustment, position_fit: positionFit || null, transition_fit: transitionFit || null, projected_position: projectedPosition };
}


function depthEvidenceLevel(resolved) {
  const n = Number(resolved || 0);
  if (n >= 8) return "Strong";
  if (n >= 4) return "Established";
  if (n >= 2) return "Provisional";
  return "Insufficient";
}

function dailyPlanDepthLearning(opportunities = [], now = Date.now(), days = 56) {
  const cutoff = now - days * DAY_MS;
  const currentWindow = executionTimeWindow(now);
  const events = opportunities.flatMap(opportunity => (Array.isArray(opportunity.focus?.history) ? opportunity.focus.history : []).map(event => ({ ...event, opportunity_id: opportunity.id })));
  const outcomes = events.filter(event => ["completed", "deferred"].includes(event.event) && event.work_block_source === "daily_work_plan" && Number(event.plan_sequence || 0) >= 1 && (event.plan_time_window || executionTimeWindow(event.at)) === currentWindow && Number.isFinite(Date.parse(event.at || "")) && Date.parse(event.at) >= cutoff && Date.parse(event.at) <= now);
  const summarize = (name, predicate) => {
    const matching = outcomes.filter(predicate);
    const completed = matching.filter(event => event.event === "completed").length;
    const deferred = matching.filter(event => event.event === "deferred").length;
    const resolved = completed + deferred;
    const followThrough = resolved ? Math.round(completed / resolved * 100) : null;
    return { name, resolved, completed, deferred, follow_through_pct: followThrough, evidence: depthEvidenceLevel(resolved) };
  };
  const early = summarize("early", event => Number(event.plan_sequence || 0) <= 2);
  const deep = summarize("deep", event => Number(event.plan_sequence || 0) >= 3);
  const gap = early.follow_through_pct == null || deep.follow_through_pct == null ? null : early.follow_through_pct - deep.follow_through_pct;
  const enough = [early.evidence, deep.evidence].every(level => ["Established", "Strong"].includes(level));
  const decayActive = Boolean(enough && gap >= 20 && early.follow_through_pct >= 75 && deep.follow_through_pct <= 55);
  const strong = decayActive && early.evidence === "Strong" && deep.evidence === "Strong";
  const recommendedMaxBlocks = decayActive ? (strong ? 2 : 3) : 5;
  const labelMap = { morning: "Morning", afternoon: "Afternoon", evening: "Evening", late_night: "Late night" };
  const signal = decayActive ? `${labelMap[currentWindow] || "Current"} plan-depth fatigue detected` : `${labelMap[currentWindow] || "Current"} plan-depth baseline forming`;
  const guidance = decayActive
    ? `Early planned blocks are outperforming blocks three and later by ${gap} points. Atlas will cap this window at ${recommendedMaxBlocks} planned blocks until deeper-block follow-through improves.`
    : "Atlas is learning whether follow-through drops after the first two Daily Work Plan blocks. It will not shorten plans until both early and deeper blocks have established comparative evidence.";
  return { window_days: days, current_window: currentWindow, current_label: labelMap[currentWindow] || "Current", signal, guidance, early, deep, performance_gap_points: gap, decay_active: decayActive, strength: strong ? "Strong" : (decayActive ? "Established" : "Learning"), recommended_max_blocks: recommendedMaxBlocks };
}

function dailyPlanDepthController(learning = {}, baselineMaxBlocks = 5) {
  const max = Math.max(1, Math.min(5, Number(baselineMaxBlocks || 5)));
  if (!learning?.decay_active) return { active: false, max_blocks: max, source: "baseline", reason: "No established plan-depth decay signal is active." };
  const learnedMax = Math.max(2, Math.min(max, Number(learning.recommended_max_blocks || 3)));
  return { active: true, max_blocks: learnedMax, source: "depth_learning", reason: learning.guidance || "Evidence-backed plan-depth fatigue is limiting later blocks." };
}

function dailyPlanDepthRecoveryLearning(opportunities = [], now = Date.now(), historicalLearning = null, days = 14) {
  const cutoff = now - days * DAY_MS;
  const currentWindow = executionTimeWindow(now);
  const historical = historicalLearning || dailyPlanDepthLearning(opportunities, now);
  const events = opportunities.flatMap(opportunity => (Array.isArray(opportunity.focus?.history) ? opportunity.focus.history : []).map(event => ({ ...event, opportunity_id: opportunity.id })));
  const allDepthOutcomes = events.filter(event => ["completed", "deferred"].includes(event.event) && event.work_block_source === "daily_work_plan" && Number(event.plan_sequence || 0) >= 3 && (event.plan_time_window || executionTimeWindow(event.at)) === currentWindow && Number.isFinite(Date.parse(event.at || "")) && Date.parse(event.at) <= now);
  const recent = events.filter(event => ["completed", "deferred"].includes(event.event) && event.work_block_source === "daily_work_plan" && Number(event.plan_sequence || 0) >= 1 && (event.plan_time_window || executionTimeWindow(event.at)) === currentWindow && Number.isFinite(Date.parse(event.at || "")) && Date.parse(event.at) >= cutoff && Date.parse(event.at) <= now);
  const summarize = predicate => {
    const matching = recent.filter(predicate);
    const completed = matching.filter(event => event.event === "completed").length;
    const deferred = matching.filter(event => event.event === "deferred").length;
    const resolved = completed + deferred;
    return { resolved, completed, deferred, follow_through_pct: resolved ? Math.round(completed / resolved * 100) : null, evidence: depthEvidenceLevel(resolved) };
  };
  const early = summarize(event => Number(event.plan_sequence || 0) <= 2);
  const deep = summarize(event => Number(event.plan_sequence || 0) >= 3);
  const gap = early.follow_through_pct == null || deep.follow_through_pct == null ? null : early.follow_through_pct - deep.follow_through_pct;
  const recovered = Boolean(historical?.decay_active && deep.resolved >= 4 && deep.follow_through_pct >= 70 && (gap == null || gap <= 15));
  const lastDeepAt = allDepthOutcomes.length ? Math.max(...allDepthOutcomes.map(event => Date.parse(event.at))) : null;
  const daysSinceDeep = lastDeepAt == null ? null : Math.floor((now - lastDeepAt) / DAY_MS);
  const strongEarly = early.resolved >= 4 && early.follow_through_pct >= 80;
  const probeDue = Boolean(historical?.decay_active && Number(historical.recommended_max_blocks || 5) <= 2 && strongEarly && deep.resolved === 0 && (lastDeepAt == null || daysSinceDeep >= 7));
  let mode = "learning";
  let signal = `${historical.current_label || "Current"} depth recovery baseline forming`;
  let guidance = "Atlas is watching recent early- and deep-block follow-through so fatigue protection can relax only after execution genuinely rebounds.";
  if (recovered) {
    mode = "recovered";
    signal = `${historical.current_label || "Current"} plan-depth recovery detected`;
    guidance = `Recent deep-block follow-through has recovered to ${deep.follow_through_pct}%. Atlas can cautiously relax the fatigue cap while continuing to watch for renewed decay.`;
  } else if (probeDue) {
    mode = "probe";
    signal = `${historical.current_label || "Current"} recovery probe is due`;
    guidance = "Early-block execution has stayed strong while deep-block evidence has gone quiet. Atlas will temporarily allow one third block so recovery can be tested instead of leaving the strongest fatigue cap stuck on indefinitely.";
  } else if (historical?.decay_active) {
    mode = "protected";
    signal = `${historical.current_label || "Current"} fatigue protection remains active`;
    guidance = "Recent evidence has not yet justified relaxing the plan-depth cap. Atlas will keep protecting against later-block decay while watching for recovery.";
  }
  return { window_days: days, current_window: currentWindow, current_label: historical.current_label || "Current", mode, signal, guidance, recovered, probe_due: probeDue, early, deep, recent_gap_points: gap, days_since_deep_outcome: daysSinceDeep };
}

function dailyPlanDepthRecoveryController(depthController = {}, recoveryLearning = {}, baselineMaxBlocks = 5) {
  const baseline = Math.max(1, Math.min(5, Number(baselineMaxBlocks || 5)));
  const currentMax = Math.max(1, Math.min(baseline, Number(depthController?.max_blocks || baseline)));
  if (!depthController?.active) return { active: false, recovery_active: false, max_blocks: currentMax, source: depthController?.source || "baseline", reason: depthController?.reason || "No fatigue protection needs recovery handling." };
  if (recoveryLearning?.recovered) {
    const relaxed = currentMax <= 2 ? Math.min(baseline, 3) : baseline;
    return { active: relaxed < baseline, recovery_active: true, max_blocks: relaxed, source: "depth_recovery", reason: recoveryLearning.guidance || "Recent deep-block performance supports cautiously relaxing fatigue protection." };
  }
  if (recoveryLearning?.probe_due && currentMax <= 2) {
    return { active: true, recovery_active: true, max_blocks: Math.min(baseline, 3), source: "recovery_probe", reason: recoveryLearning.guidance || "A controlled third-block probe is temporarily allowed to test recovery." };
  }
  return { active: true, recovery_active: false, max_blocks: currentMax, source: depthController?.source || "depth_learning", reason: depthController?.reason || recoveryLearning?.guidance || "Fatigue protection remains active." };
}


function blockSizeEvidenceLevel(resolved) {
  const n = Number(resolved || 0);
  if (n >= 8) return "Strong";
  if (n >= 4) return "Established";
  if (n >= 2) return "Provisional";
  return "Insufficient";
}

function blockSizeBand(minutes) {
  const n = Number(minutes || 0);
  if (n >= 10 && n <= 20) return "short";
  if (n >= 25 && n <= 35) return "standard";
  if (n >= 40) return "long";
  return null;
}

function dailyPlanBlockSizeLearning(opportunities = [], now = Date.now(), days = 56) {
  const cutoff = now - days * DAY_MS;
  const currentWindow = executionTimeWindow(now);
  const events = opportunities.flatMap(opportunity => (Array.isArray(opportunity.focus?.history) ? opportunity.focus.history : []).map(event => ({ ...event, opportunity_id: opportunity.id })));
  const outcomes = events.filter(event => ["completed", "deferred"].includes(event.event) && event.work_block_source === "daily_work_plan" && Number(event.plan_sequence || 0) >= 1 && (event.plan_time_window || executionTimeWindow(event.at)) === currentWindow && Number.isFinite(Date.parse(event.at || "")) && Date.parse(event.at) >= cutoff && Date.parse(event.at) <= now && blockSizeBand(event.estimated_minutes));
  const bandDefs = [
    { key: "short", label: "Short", target_minutes: 20 },
    { key: "standard", label: "Standard", target_minutes: 30 },
    { key: "long", label: "Long", target_minutes: 45 }
  ];
  const summarizeDepth = (depth, predicate) => {
    const matching = outcomes.filter(predicate);
    const bands = bandDefs.map(def => {
      const rows = matching.filter(event => blockSizeBand(event.estimated_minutes) === def.key);
      const completed = rows.filter(event => event.event === "completed").length;
      const deferred = rows.filter(event => event.event === "deferred").length;
      const resolved = completed + deferred;
      const followThrough = resolved ? Math.round(completed / resolved * 100) : null;
      return { ...def, resolved, completed, deferred, follow_through_pct: followThrough, evidence: blockSizeEvidenceLevel(resolved) };
    });
    const established = bands.filter(b => ["Established", "Strong"].includes(b.evidence) && b.follow_through_pct != null);
    const ranked = [...established].sort((a,b) => b.follow_through_pct - a.follow_through_pct || b.resolved - a.resolved);
    const winner = ranked[0] || null;
    const runner = ranked[1] || null;
    const advantage = winner && runner ? winner.follow_through_pct - runner.follow_through_pct : null;
    const actionable = Boolean(winner && runner && advantage >= 15);
    return { depth, bands, preferred_band: actionable ? winner.key : null, preferred_label: actionable ? winner.label : null, preferred_target_minutes: actionable ? winner.target_minutes : null, preferred_evidence: actionable ? winner.evidence : null, advantage_points: actionable ? advantage : null, actionable };
  };
  const early = summarizeDepth("early", event => Number(event.plan_sequence || 0) <= 2);
  const deep = summarizeDepth("deep", event => Number(event.plan_sequence || 0) >= 3);
  const labelMap = { morning: "Morning", afternoon: "Afternoon", evening: "Evening", late_night: "Late night" };
  const active = [early, deep].filter(x => x.actionable);
  const signal = active.length ? `${labelMap[currentWindow] || "Current"} block-size fit is active` : `${labelMap[currentWindow] || "Current"} block-size baseline forming`;
  const guidance = active.length ? `Atlas has comparative evidence for ${active.length} plan-depth band${active.length === 1 ? "" : "s"} and can gently tune block size without changing Atlas Score or the daily time cap.` : "Atlas is comparing short, standard, and long planned blocks separately for early and deep plan positions. It needs two established duration bands and at least a 15-point follow-through gap before tuning block size.";
  return { window_days: days, current_window: currentWindow, current_label: labelMap[currentWindow] || "Current", signal, guidance, early, deep };
}

function dailyPlanBlockSizeController(learning = {}, baselineMinutes = 30, depth = "early") {
  const baseline = Math.max(10, Math.min(90, Math.round(Number(baselineMinutes || 30) / 5) * 5));
  const branch = depth === "deep" ? learning?.deep : learning?.early;
  if (!branch?.actionable || !Number(branch.preferred_target_minutes)) return { active: false, depth, target_minutes: baseline, source: "baseline", reason: "No established comparative block-size advantage is active for this plan depth." };
  const preferred = Number(branch.preferred_target_minutes);
  const delta = Math.max(-15, Math.min(15, preferred - baseline));
  const target = Math.max(10, Math.min(90, Math.round((baseline + delta) / 5) * 5));
  return { active: true, depth, target_minutes: target, preferred_band: branch.preferred_band, preferred_label: branch.preferred_label, preferred_evidence: branch.preferred_evidence, advantage_points: branch.advantage_points, source: "block_size_learning", reason: `${branch.preferred_label} blocks are leading comparable ${depth}-plan durations by ${branch.advantage_points} points; Atlas is moving the normal block target only ${Math.abs(delta)} minutes toward that evidence-backed size.` };
}

function blockSizeOutcomeScore(event = {}) {
  if (event.event !== "completed") return 0;
  const planned = Math.max(1, Number(event.estimated_minutes || 0));
  const actual = Math.max(0, Number(event.duration_minutes || planned));
  const ratio = actual / planned;
  if (ratio <= 1.15) return 100;
  if (ratio <= 1.35) return 85;
  if (ratio <= 1.6) return 70;
  return 55;
}

function dailyPlanBlockSizeOutcomeLearning(opportunities = [], now = Date.now(), days = 56) {
  const cutoff = now - days * DAY_MS;
  const currentWindow = executionTimeWindow(now);
  const events = opportunities.flatMap(opportunity => (Array.isArray(opportunity.focus?.history) ? opportunity.focus.history : []).map(event => ({ ...event, opportunity_id: opportunity.id })));
  const outcomes = events.filter(event => ["completed", "deferred"].includes(event.event) && event.work_block_source === "daily_work_plan" && Number(event.plan_sequence || 0) >= 1 && (event.plan_time_window || executionTimeWindow(event.at)) === currentWindow && Number.isFinite(Date.parse(event.at || "")) && Date.parse(event.at) >= cutoff && Date.parse(event.at) <= now && blockSizeBand(event.estimated_minutes));
  const summarize = (depth, predicate) => {
    const rows = outcomes.filter(predicate);
    const completed = rows.filter(event => event.event === "completed");
    const deferred = rows.filter(event => event.event === "deferred");
    const resolved = rows.length;
    const followThrough = resolved ? Math.round(completed.length / resolved * 100) : null;
    const plannedMinutes = completed.reduce((sum, event) => sum + Math.max(0, Number(event.estimated_minutes || 0)), 0);
    const actualMinutes = completed.reduce((sum, event) => sum + Math.max(0, Number(event.duration_minutes || event.estimated_minutes || 0)), 0);
    const durationAccuracy = plannedMinutes ? Math.round(actualMinutes / plannedMinutes * 100) : null;
    const onTime = completed.filter(event => Number(event.duration_minutes || event.estimated_minutes || 0) <= Number(event.estimated_minutes || 0) * 1.15).length;
    const onTimePct = completed.length ? Math.round(onTime / completed.length * 100) : null;
    const efficiencyScore = completed.length ? Math.round(completed.reduce((sum, event) => sum + blockSizeOutcomeScore(event), 0) / completed.length) : null;
    return { depth, resolved, completed: completed.length, deferred: deferred.length, follow_through_pct: followThrough, planned_minutes: plannedMinutes, actual_minutes: actualMinutes, duration_accuracy_pct: durationAccuracy, on_time_pct: onTimePct, efficiency_score: efficiencyScore, evidence: blockSizeEvidenceLevel(resolved) };
  };
  const early = summarize("early", event => Number(event.plan_sequence || 0) <= 2);
  const deep = summarize("deep", event => Number(event.plan_sequence || 0) >= 3);
  const labelMap = { morning: "Morning", afternoon: "Afternoon", evening: "Evening", late_night: "Late night" };
  const established = [early, deep].filter(branch => ["Established", "Strong"].includes(branch.evidence) && branch.duration_accuracy_pct != null);
  const overrunning = established.filter(branch => branch.duration_accuracy_pct >= 130 && (branch.follow_through_pct ?? 100) < 80);
  const signal = overrunning.length ? `${labelMap[currentWindow] || "Current"} block estimates are running long` : `${labelMap[currentWindow] || "Current"} block-outcome calibration forming`;
  const guidance = overrunning.length ? "Completed blocks are taking materially longer than planned and follow-through is soft. Atlas can cautiously shorten the affected block target while preserving the daily time cap." : "Atlas is comparing planned versus actual minutes alongside completion outcomes so block-size learning can distinguish a truly productive duration from a merely optimistic estimate.";
  return { window_days: days, current_window: currentWindow, current_label: labelMap[currentWindow] || "Current", signal, guidance, early, deep };
}

function dailyPlanBlockSizeOutcomeController(sizeController = {}, outcomeLearning = {}, depth = "early") {
  const baseline = Math.max(10, Math.min(90, Number(sizeController?.target_minutes || 30)));
  const branch = depth === "deep" ? outcomeLearning?.deep : outcomeLearning?.early;
  if (!branch || !["Established", "Strong"].includes(branch.evidence)) return { ...sizeController, outcome_active: false, outcome_source: "learning", outcome_reason: "Actual-duration evidence is not established for this plan depth yet." };
  let adjustment = 0;
  let reason = "Actual duration is close enough to planned duration that no extra calibration is needed.";
  if (branch.duration_accuracy_pct >= 130 && (branch.follow_through_pct ?? 100) < 80) {
    adjustment = -5;
    reason = `Actual duration is ${branch.duration_accuracy_pct}% of planned time with ${branch.follow_through_pct}% follow-through, so Atlas is trimming this target by 5 minutes.`;
  } else if (branch.duration_accuracy_pct <= 85 && branch.follow_through_pct >= 80 && branch.evidence === "Strong") {
    adjustment = 5;
    reason = `Strong evidence shows blocks finishing within ${branch.duration_accuracy_pct}% of planned time with ${branch.follow_through_pct}% follow-through, so Atlas can cautiously add 5 minutes.`;
  }
  const target = Math.max(10, Math.min(90, baseline + adjustment));
  return { ...sizeController, target_minutes: target, outcome_active: adjustment !== 0, outcome_adjustment_minutes: adjustment, outcome_source: adjustment ? "actual_duration_learning" : "stable", outcome_reason: reason };
}

function dailyWorkPlan(opportunities = [], now = Date.now(), requestedMinutes = null) {
  const totalMinutes = normalizeDailyPlanMinutes(requestedMinutes);
  const executionSummary = dailyPlanExecutionSummary(opportunities, now);
  const densityLearning = dailyPlanDensityLearning(opportunities, now);
  const adaptation = dailyPlanDensityController(opportunities, now, totalMinutes, executionSummary, densityLearning);
  const timeWindowLearning = dailyPlanTimeWindowLearning(opportunities, now);
  const timeWindowPriority = dailyPlanTimeWindowPriority(opportunities, now);
  const workTypeLearning = dailyPlanWorkTypeLearning(opportunities, now);
  const compositionLearning = dailyPlanCompositionLearning(opportunities, now);
  const sequenceLearning = dailyPlanSequenceLearning(opportunities, now);
  const depthLearning = dailyPlanDepthLearning(opportunities, now);
  const baseDepthController = dailyPlanDepthController(depthLearning, 5);
  const depthRecoveryLearning = dailyPlanDepthRecoveryLearning(opportunities, now, depthLearning);
  const depthController = dailyPlanDepthRecoveryController(baseDepthController, depthRecoveryLearning, 5);
  const blockSizeLearning = dailyPlanBlockSizeLearning(opportunities, now);
  const blockSizeOutcomeLearning = dailyPlanBlockSizeOutcomeLearning(opportunities, now);
  const history = opportunities.flatMap(item => Array.isArray(item.focus?.history) ? item.focus.history : []);
  const capacityProfile = focusCapacityProfile({ focus: { history } }, now);
  const normalBlock = capacityProfile.active ? Number(capacityProfile.typical_block_minutes || 30) : 30;
  let remaining = adaptation.target_minutes;
  const blocks = [];
  const used = [];
  while (remaining >= 10 && blocks.length < depthController.max_blocks) {
    const blockDepth = blocks.length < 2 ? "early" : "deep";
    const learnedBlockSizeController = dailyPlanBlockSizeController(blockSizeLearning, normalBlock, blockDepth);
    const blockSizeController = dailyPlanBlockSizeOutcomeController(learnedBlockSizeController, blockSizeOutcomeLearning, blockDepth);
    const blockWindow = Math.min(remaining, Math.max(10, blockSizeController.target_minutes));
    const projectedPosition = blocks.length === 0 ? "first" : (remaining <= Math.max(10, normalBlock) ? "last" : "middle");
    const plan = nextWorkBlockPlan(opportunities, now, blockWindow, used, { time_window_priority: timeWindowPriority, work_type_learning: workTypeLearning, composition_learning: compositionLearning, sequence_learning: sequenceLearning, projected_position: projectedPosition, selected_work_types: blocks.map(block => block.work_type) });
    const item = plan.selected;
    if (!item || !item.fits || Number(item.estimated_minutes) > remaining) break;
    blocks.push({
      sequence: blocks.length + 1,
      ...item,
      planned_minutes: Number(item.estimated_minutes),
      start_after_minutes: adaptation.target_minutes - remaining,
      block_size_depth: blockDepth,
      block_size_target_minutes: blockSizeController.target_minutes,
      block_size_source: blockSizeController.source
    });
    used.push(item.id);
    remaining -= Number(item.estimated_minutes);
  }
  const planned = adaptation.target_minutes - remaining;
  const unallocated = totalMinutes - planned;
  return {
    total_minutes: totalMinutes,
    planning_target_minutes: adaptation.target_minutes,
    reserved_minutes: adaptation.reserved_minutes,
    adaptation,
    time_window_learning: timeWindowLearning,
    time_window_priority: timeWindowPriority,
    work_type_learning: workTypeLearning,
    composition_learning: compositionLearning,
    sequence_learning: sequenceLearning,
    depth_learning: depthLearning,
    depth_recovery_learning: depthRecoveryLearning,
    depth_controller: depthController,
    block_size_learning: blockSizeLearning,
    block_size_outcome_learning: blockSizeOutcomeLearning,
    block_size_controller: { early: dailyPlanBlockSizeOutcomeController(dailyPlanBlockSizeController(blockSizeLearning, normalBlock, "early"), blockSizeOutcomeLearning, "early"), deep: dailyPlanBlockSizeOutcomeController(dailyPlanBlockSizeController(blockSizeLearning, normalBlock, "deep"), blockSizeOutcomeLearning, "deep") },
    preferred_time_window: timeWindowLearning.preferred_window,
    normal_block_minutes: normalBlock,
    capacity_profile: capacityProfile,
    planned_minutes: planned,
    remaining_minutes: unallocated,
    utilization_pct: totalMinutes ? Math.round((planned / totalMinutes) * 100) : 0,
    blocks,
    signal: blocks.length ? `${blocks.length} priority block${blocks.length === 1 ? '' : 's'} planned for ${planned} of ${totalMinutes} minutes` : 'No executable daily plan yet',
    guidance: blocks.length ? `${adaptation.reason} Atlas then sequenced distinct high-priority actions inside that planning target.${timeWindowPriority.adjusted_count ? ` ${timeWindowPriority.current_label} execution-fit evidence adjusted the order of ${timeWindowPriority.adjusted_count} opportunity${timeWindowPriority.adjusted_count === 1 ? '' : 'ies'} without changing Atlas Score.` : ''}${workTypeLearning.adjusted_count ? ` Work-type fit also influenced current-window sequencing for ${workTypeLearning.adjusted_count} established task type${workTypeLearning.adjusted_count === 1 ? '' : 's'}.` : ''}${compositionLearning.preferred_mode ? ` Historical plan-mix evidence is gently favoring ${compositionLearning.preferred_mode === 'mixed' ? 'work-type variety' : 'work-type continuity'} in this window.` : ''}${sequenceLearning.adjusted_positions || sequenceLearning.adjusted_transitions ? ` Sequence-fit evidence is gently refining first/middle/last placement and work-type transitions.` : ''}${blockSizeLearning.early.actionable || blockSizeLearning.deep.actionable ? ` Evidence-backed block-size learning is gently tuning early/deep execution windows.` : ''}${blockSizeOutcomeLearning.early.evidence !== "Insufficient" || blockSizeOutcomeLearning.deep.evidence !== "Insufficient" ? ` Planned-versus-actual duration evidence is also calibrating whether those targets are realistic.` : ''}${depthController.source === "recovery_probe" ? ` A controlled third-block recovery probe is temporarily enabled so Atlas can test whether deeper execution has rebounded.` : (depthController.source === "depth_recovery" ? ` Recent deep-block execution is allowing Atlas to cautiously relax the fatigue cap.` : (depthController.active ? ` Plan-depth evidence is limiting this window to ${depthController.max_blocks} blocks because later blocks have been underperforming.` : ''))}${timeWindowLearning.preferred_label ? ` ${timeWindowLearning.preferred_label} currently has the strongest observed follow-through, but Atlas will not override your available time.` : ''}` : 'Add executable opportunities or increase the available time window.'
  };
}


function localDateKey(timestamp, timeZone = process.env.ATLAS_TIME_ZONE || "America/Chicago") {
  const date = new Date(timestamp);
  if (!Number.isFinite(date.getTime())) return "";
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
  } catch {
    return date.toISOString().slice(0, 10);
  }
}

function dailyPlanExecutionSummary(opportunities = [], now = Date.now(), days = 14) {
  const cutoff = now - days * DAY_MS;
  const events = opportunities.flatMap(opportunity => (Array.isArray(opportunity.focus?.history) ? opportunity.focus.history : []).map(event => ({ ...event, opportunity_id: opportunity.id, opportunity_name: opportunity.name })));
  const starts = events.filter(event => event.event === "started" && event.work_block_source === "daily_work_plan" && Number.isFinite(Date.parse(event.at || "")) && Date.parse(event.at) >= cutoff && Date.parse(event.at) <= now);
  const outcomes = events.filter(event => ["completed", "deferred"].includes(event.event) && event.work_block_source === "daily_work_plan" && Number.isFinite(Date.parse(event.at || "")) && Date.parse(event.at) >= cutoff && Date.parse(event.at) <= now);
  const planDates = new Set(starts.map(event => event.plan_date || localDateKey(event.at)).filter(Boolean));
  const plannedMinutes = starts.reduce((sum, event) => sum + Math.max(0, Number(event.estimated_minutes || 0)), 0);
  const actualMinutes = outcomes.reduce((sum, event) => sum + Math.max(0, Number(event.duration_minutes || 0)), 0);
  const completed = outcomes.filter(event => event.event === "completed").length;
  const deferred = outcomes.filter(event => event.event === "deferred").length;
  const resolved = completed + deferred;
  const followThroughPct = resolved ? Math.round((completed / resolved) * 100) : null;
  const executionPct = starts.length ? Math.round((resolved / starts.length) * 100) : null;
  const actualUtilizationPct = plannedMinutes ? Math.round((actualMinutes / plannedMinutes) * 100) : null;
  let signal = "Daily-plan baseline forming";
  let guidance = "Start and resolve planned daily blocks so Atlas can learn whether its sequencing is realistic.";
  let adjustment = "learning";
  if (planDates.size >= 2 && resolved >= 3) {
    if ((followThroughPct ?? 100) < 60 || (executionPct ?? 100) < 65) {
      signal = "Daily plan looks overpacked";
      guidance = "Too many planned blocks are being deferred or left unresolved. Atlas should favor a lighter daily sequence until follow-through improves.";
      adjustment = "reduce";
    } else if ((followThroughPct ?? 0) >= 85 && (executionPct ?? 0) >= 85 && (actualUtilizationPct ?? 0) >= 75) {
      signal = "Daily plan is fitting well";
      guidance = "The planned sequence is translating into completed work. Keep the current planning density and continue learning.";
      adjustment = "maintain";
    } else {
      signal = "Daily plan fit is mixed";
      guidance = "The sequence is partly working, but Atlas should keep the plan conservative until more blocks resolve cleanly.";
      adjustment = "selective";
    }
  }
  const recentPlans = [...planDates].sort().reverse().slice(0, 7).map(date => {
    const dayStarts = starts.filter(event => (event.plan_date || localDateKey(event.at)) === date);
    const dayOutcomes = outcomes.filter(event => (event.plan_date || localDateKey(event.at)) === date);
    const dayCompleted = dayOutcomes.filter(event => event.event === "completed").length;
    const dayDeferred = dayOutcomes.filter(event => event.event === "deferred").length;
    return {
      date,
      planned_blocks: dayStarts.length,
      planned_minutes: dayStarts.reduce((sum, event) => sum + Number(event.estimated_minutes || 0), 0),
      completed: dayCompleted,
      deferred: dayDeferred,
      actual_minutes: dayOutcomes.reduce((sum, event) => sum + Number(event.duration_minutes || 0), 0)
    };
  });
  return {
    window_days: days,
    plan_days: planDates.size,
    planned_blocks: starts.length,
    resolved_blocks: resolved,
    completed,
    deferred,
    planned_minutes: plannedMinutes,
    actual_minutes: actualMinutes,
    follow_through_pct: followThroughPct,
    execution_pct: executionPct,
    actual_utilization_pct: actualUtilizationPct,
    adjustment,
    signal,
    guidance,
    recent_plans: recentPlans
  };
}

function focusFrictionDiagnosis(opportunity, now = Date.now(), days = 14) {
  const cutoff = now - days * DAY_MS;
  const history = Array.isArray(opportunity.focus?.history) ? opportunity.focus.history : [];
  const deferredEvents = history.filter(event => {
    const at = Date.parse(event.at || "");
    return event.event === "deferred" && Number.isFinite(at) && at >= cutoff && at <= now;
  });
  const counts = Object.fromEntries(Object.keys(FOCUS_DEFER_REASONS).map(key => [key, 0]));
  for (const event of deferredEvents) {
    const reason = normalizeDeferReason(event.defer_reason);
    if (reason) counts[reason] += 1;
  }
  const reasoned = Object.values(counts).reduce((sum, value) => sum + value, 0);
  const ranked = Object.entries(counts).sort((a,b) => b[1]-a[1]);
  const [topReason, topCount] = ranked[0] || ["", 0];
  const dominant = reasoned >= 2 && topCount >= 2 && (topCount / reasoned >= 0.5 || topCount >= 3) ? topReason : "";
  let signal = "No friction diagnosis yet";
  let guidance = "Choose a defer reason when useful so Atlas can learn why recommended work is not getting done.";
  let response = "unknown";
  if (reasoned && !dominant) {
    signal = "Mixed execution friction";
    guidance = "Deferrals are coming from different causes. Keep collecting reasons before Atlas changes how it packages this work.";
    response = "mixed";
  } else if (dominant === "too_big") {
    signal = "Action-size friction";
    guidance = "The recommended work is repeatedly feeling too large. Shrink the next step and preserve the strategic recommendation.";
    response = "shrink";
  } else if (dominant === "unclear") {
    signal = "Clarity friction";
    guidance = "The next step is repeatedly unclear. Rewrite it as one concrete deliverable before asking for more execution time.";
    response = "clarify";
  } else if (dominant === "blocked") {
    signal = "Dependency friction";
    guidance = "The work is being deferred because something else must happen first. Resolve or explicitly track the blocker instead of shrinking the task.";
    response = "blocked";
  } else if (["timing", "capacity"].includes(dominant)) {
    signal = "Timing / capacity friction";
    guidance = "The opportunity may still be good, but the work is landing at the wrong time or exceeding available capacity. Re-time it rather than treating the task itself as broken.";
    response = "retime";
  } else if (dominant === "low_priority") {
    signal = "Priority mismatch";
    guidance = "This work repeatedly does not feel worth prioritizing. Atlas should question the near-term ranking or the opportunity itself instead of making the task smaller.";
    response = "reconsider";
  } else if (dominant === "other") {
    signal = "Other execution friction";
    guidance = "Deferrals have a recurring cause that does not fit the current categories. Review the opportunity notes before changing strategy.";
    response = "review";
  }
  return {
    window_days: days,
    total_deferred: deferredEvents.length,
    reasoned_deferred: reasoned,
    unclassified_deferred: Math.max(0, deferredEvents.length - reasoned),
    dominant_reason: dominant || null,
    dominant_label: dominant ? FOCUS_DEFER_REASONS[dominant] : null,
    dominant_count: dominant ? topCount : 0,
    signal,
    response,
    guidance,
    counts
  };
}


function focusFrictionResolution(opportunity, diagnosis = null, adaptiveStrategy = null) {
  const friction = diagnosis || focusFrictionDiagnosis(opportunity);
  const response = friction?.response || "unknown";
  const strategic = String(opportunity.next_action || "Review opportunity");
  const map = {
    shrink: { type: "shrink", label: "Shrink the action", estimated_minutes: 10, action: "Spend 10 minutes rewriting the current next step into one deliverable that can be completed in 15 minutes or less, then start that first step." },
    clarify: { type: "clarify", label: "Clarify the next step", estimated_minutes: 10, action: "Spend 10 minutes rewriting the next step as one concrete deliverable with a clear done condition." },
    blocked: { type: "unblock", label: "Resolve the blocker", estimated_minutes: 10, action: "Spend 10 minutes identifying the blocker, who or what controls it, and one concrete unblock request or action. Record the dependency and the next move." },
    retime: { type: "retime", label: "Re-time the work", estimated_minutes: 5, action: "Spend 5 minutes choosing the next realistic work window for this opportunity based on available time and capacity, then record that timing decision." },
    reconsider: { type: "reconsider", label: "Reconsider priority", estimated_minutes: 10, action: "Spend 10 minutes comparing this opportunity with your current top priorities. Decide keep near the top, move it down, pause it, or kill it, and record why." },
    review: { type: "review", label: "Review the friction", estimated_minutes: 10, action: "Spend 10 minutes reviewing the recent deferrals and opportunity notes, identify the recurring cause, and record one change to make before trying again." },
    mixed: { type: "review", label: "Separate the friction", estimated_minutes: 10, action: "Spend 10 minutes reviewing the recent deferrals, identify the single biggest cause affecting this opportunity now, and record the corresponding next move." }
  };
  let resolution = map[response];
  if (!resolution) return { available: false, type: "none", label: "Keep learning", estimated_minutes: null, action: null, reason: friction?.guidance || "Atlas needs more reasoned deferrals before prescribing a resolution.", strategic_recommendation: strategic, adaptive_strategy: adaptiveStrategy || null };
  if (adaptiveStrategy?.mode === "refine") {
    resolution = {
      type: "review",
      label: "Revise the resolution",
      estimated_minutes: 10,
      action: `Spend 10 minutes reviewing why the previous ${resolution.label.toLowerCase()} approach was still deferred. Choose one different way to address the friction, record it, and try that alternative before repeating the same intervention.`
    };
  }
  const calibration = focusEffortCalibration(opportunity);
  const calibrated = calibrateTimedAction(resolution.action, resolution.estimated_minutes, "resolution", calibration);
  return { available: true, ...resolution, ...calibrated, reason: adaptiveStrategy?.guidance || friction.guidance, friction_response: response, friction_reason: friction.dominant_reason || null, strategic_recommendation: strategic, adaptive_strategy: adaptiveStrategy || null };
}

function focusFrictionSummary(opportunities, now = Date.now(), days = 14) {
  const portfolioEffectiveness = focusResolutionEffectivenessSummary(opportunities, now, 30);
  const diagnoses = opportunities.map(item => {
    const diagnosis = focusFrictionDiagnosis(item, now, days);
    const strategy = focusResolutionStrategy(item, diagnosis, now, 30, portfolioEffectiveness);
    return { id: item.id, name: item.name, ...diagnosis, resolution_strategy: strategy, resolution: focusFrictionResolution(item, diagnosis, strategy) };
  });
  const counts = Object.fromEntries(Object.keys(FOCUS_DEFER_REASONS).map(key => [key, 0]));
  for (const diagnosis of diagnoses) for (const key of Object.keys(counts)) counts[key] += Number(diagnosis.counts?.[key] || 0);
  const reasoned = Object.values(counts).reduce((sum, value) => sum + value, 0);
  const totalDeferred = diagnoses.reduce((sum, item) => sum + Number(item.total_deferred || 0), 0);
  const rankedReasons = Object.entries(counts).filter(([,count]) => count > 0).sort((a,b) => b[1]-a[1]);
  const [dominantReason, dominantCount] = rankedReasons[0] || [null, 0];
  const opportunitiesWithSignal = diagnoses.filter(item => item.reasoned_deferred > 0).sort((a,b) => b.reasoned_deferred-a.reasoned_deferred || b.total_deferred-a.total_deferred).slice(0,5);
  return {
    window_days: days,
    total_deferred: totalDeferred,
    reasoned_deferred: reasoned,
    unclassified_deferred: Math.max(0, totalDeferred - reasoned),
    dominant_reason: dominantReason,
    dominant_label: dominantReason ? FOCUS_DEFER_REASONS[dominantReason] : null,
    dominant_count: dominantCount,
    reasons: rankedReasons.map(([key,count]) => ({ key, label: FOCUS_DEFER_REASONS[key], count })),
    opportunities: opportunitiesWithSignal
  };
}


function focusResolutionEffectiveness(opportunity, now = Date.now(), days = 30) {
  const cutoff = now - days * DAY_MS;
  const history = (Array.isArray(opportunity.focus?.history) ? opportunity.focus.history : [])
    .filter(event => {
      const at = Date.parse(event.at || "");
      return Number.isFinite(at) && at >= cutoff && at <= now;
    })
    .sort((a,b) => Date.parse(a.at)-Date.parse(b.at));
  const sessions = [];
  let open = null;
  for (const event of history) {
    if (event.event === "friction_resolution_started") {
      open = {
        response: event.friction_response || "unknown",
        reason: event.friction_reason || null,
        action: event.action || "",
        started_at: event.at,
        estimated_minutes: event.estimated_minutes == null ? null : Number(event.estimated_minutes)
      };
      continue;
    }
    if (open && ["completed", "deferred"].includes(event.event) && event.action_mode === "resolution") {
      const duration = Number.isFinite(Number(event.duration_minutes)) ? Number(event.duration_minutes) : Math.max(0, Math.round((Date.parse(event.at)-Date.parse(open.started_at))/60000));
      sessions.push({ ...open, outcome: event.event, resolved_at: event.at, duration_minutes: duration, defer_reason: event.defer_reason || null });
      open = null;
    }
  }
  const byResponse = {};
  for (const session of sessions) {
    const key = session.response || "unknown";
    byResponse[key] ||= { response: key, completed: 0, deferred: 0, total: 0, durations: [] };
    byResponse[key].total += 1;
    byResponse[key][session.outcome] += 1;
    if (Number.isFinite(session.duration_minutes)) byResponse[key].durations.push(session.duration_minutes);
  }
  const types = Object.values(byResponse).map(item => ({
    response: item.response,
    completed: item.completed,
    deferred: item.deferred,
    total: item.total,
    success_pct: item.total ? Math.round((item.completed/item.total)*100) : null,
    avg_minutes: item.durations.length ? Math.round(item.durations.reduce((a,b)=>a+b,0)/item.durations.length) : null
  })).sort((a,b) => b.total-a.total || (b.success_pct ?? -1)-(a.success_pct ?? -1));
  const completed = sessions.filter(item => item.outcome === "completed").length;
  const deferred = sessions.filter(item => item.outcome === "deferred").length;
  const total = sessions.length;
  let signal = "Not enough resolution data";
  let guidance = "Complete or defer resolution sessions so Atlas can learn which interventions improve follow-through.";
  if (total >= 3) {
    const pct = Math.round((completed/total)*100);
    if (pct >= 70) { signal = "Resolution actions are helping"; guidance = "Most friction-resolution sessions are being completed. Keep using the current intervention mapping while Atlas gathers deeper type-level evidence."; }
    else if (pct >= 40) { signal = "Mixed resolution effectiveness"; guidance = "Some interventions are helping and some are not. Review the weakest resolution types before changing the overall strategy."; }
    else { signal = "Resolution actions need refinement"; guidance = "Most resolution sessions are still being deferred. Atlas should revise the weakest intervention types rather than simply repeating them."; }
  }
  return {
    window_days: days,
    total,
    completed,
    deferred,
    success_pct: total ? Math.round((completed/total)*100) : null,
    open_resolution: open,
    signal,
    guidance,
    types,
    recent: sessions.slice(-8).reverse()
  };
}

function focusResolutionEffectivenessSummary(opportunities, now = Date.now(), days = 30) {
  const rows = opportunities.map(item => ({ id: item.id, name: item.name, ...focusResolutionEffectiveness(item, now, days) }));
  const typeMap = {};
  let total = 0, completed = 0, deferred = 0;
  for (const row of rows) {
    total += row.total; completed += row.completed; deferred += row.deferred;
    for (const item of row.types) {
      const key = item.response;
      typeMap[key] ||= { response: key, completed: 0, deferred: 0, total: 0, weighted_minutes: 0, timed: 0 };
      const target = typeMap[key];
      target.completed += item.completed; target.deferred += item.deferred; target.total += item.total;
      if (item.avg_minutes != null) { target.weighted_minutes += item.avg_minutes * item.total; target.timed += item.total; }
    }
  }
  const types = Object.values(typeMap).map(item => ({
    response: item.response, completed: item.completed, deferred: item.deferred, total: item.total,
    success_pct: item.total ? Math.round((item.completed/item.total)*100) : null,
    avg_minutes: item.timed ? Math.round(item.weighted_minutes/item.timed) : null
  })).sort((a,b) => b.total-a.total || (b.success_pct ?? -1)-(a.success_pct ?? -1));
  let signal = "Not enough resolution data";
  let guidance = "Atlas will learn whether resolution actions work as completed and deferred outcomes accumulate.";
  if (total >= 3) {
    const pct = Math.round((completed/total)*100);
    if (pct >= 70) { signal = "Resolution actions are helping"; guidance = "Portfolio-wide friction interventions are converting into completed resolution work at a healthy rate."; }
    else if (pct >= 40) { signal = "Mixed resolution effectiveness"; guidance = "Resolution performance varies. Prioritize improving the lowest-success intervention type with enough evidence."; }
    else { signal = "Resolution actions need refinement"; guidance = "Resolution sessions are frequently deferred. Revise intervention design before increasing their use."; }
  }
  return { window_days: days, total, completed, deferred, success_pct: total ? Math.round((completed/total)*100) : null, signal, guidance, types, opportunities: rows.filter(r=>r.total>0).sort((a,b)=>b.total-a.total).slice(0,5) };
}

function resolutionStrategyFromEvidence(response, effectiveness, scope = "portfolio") {
  const type = (effectiveness?.types || []).find(item => item.response === response) || null;
  const resolved = Number(type?.total || 0);
  const success = type?.success_pct == null ? null : Number(type.success_pct);
  let mode = "learning";
  let label = "Keep learning";
  let guidance = "Atlas does not yet have enough resolved sessions for this intervention type, so it will keep the default resolution while gathering evidence.";
  if (resolved >= 3 && success >= 70) {
    mode = "preserve";
    label = "Preserve this resolution";
    guidance = `This resolution is completing ${success}% of the time across ${resolved} resolved sessions. Atlas will keep using it while evidence grows.`;
  } else if (resolved >= 3 && success >= 40) {
    mode = "selective";
    label = "Use selectively";
    guidance = `This resolution has mixed results (${success}% across ${resolved} sessions). Atlas will still use it, but treat repeated deferral as a signal to revise the approach.`;
  } else if (resolved >= 3) {
    mode = "refine";
    label = "Refine this resolution";
    guidance = `This resolution is only completing ${success}% of the time across ${resolved} sessions. Atlas will stop blindly repeating it and route the next attempt through a short intervention review.`;
  }
  return { mode, label, guidance, response, scope, resolved, success_pct: success, evidence_level: resolutionStrategyEvidenceLevel(resolved) };
}

function resolutionStrategyEvidenceRank(level) {
  return ({ Insufficient: 0, Provisional: 1, Established: 2, Strong: 3 })[level] ?? 0;
}

function resolutionStrategyEvidenceLevel(resolved) {
  const n = Number(resolved || 0);
  if (n >= 12) return "Strong";
  if (n >= 6) return "Established";
  if (n >= 3) return "Provisional";
  return "Insufficient";
}

function lastResolutionStrategySnapshot(opportunity, response = null, now = Date.now(), days = 90) {
  const cutoff = now - days * DAY_MS;
  const history = Array.isArray(opportunity.focus?.history) ? opportunity.focus.history : [];
  for (let index = history.length - 1; index >= 0; index -= 1) {
    const event = history[index];
    if (event.event !== "friction_resolution_started") continue;
    if (response && event.friction_response !== response) continue;
    const at = Date.parse(event.at || "");
    if (!Number.isFinite(at) || at < cutoff || at > now) continue;
    if (!event.resolution_strategy_mode) continue;
    const resolved = Number(event.resolution_strategy_resolved || 0);
    return {
      mode: event.resolution_strategy_mode,
      scope: event.resolution_strategy_scope || "portfolio",
      response: event.friction_response || response || "unknown",
      resolved,
      success_pct: event.resolution_strategy_success_pct == null ? null : Number(event.resolution_strategy_success_pct),
      evidence_level: event.resolution_strategy_evidence || resolutionStrategyEvidenceLevel(resolved),
      at: event.at
    };
  }
  return null;
}

function resolutionPolicyForMode(mode, candidate, stability = null) {
  const success = candidate?.success_pct;
  const resolved = Number(candidate?.resolved || 0);
  const response = candidate?.response || "unknown";
  const scope = candidate?.scope || "portfolio";
  let label = "Keep learning";
  let guidance = "Atlas does not yet have enough resolved sessions for this intervention type, so it will keep the default resolution while gathering evidence.";
  if (mode === "preserve") {
    label = "Preserve this resolution";
    guidance = `This resolution is completing ${success == null ? "well" : `${success}% of the time`} across ${resolved} resolved sessions. Atlas will keep using it while evidence grows.`;
  } else if (mode === "selective") {
    label = "Use selectively";
    guidance = `This resolution has mixed results${success == null ? "" : ` (${success}% across ${resolved} sessions)`}. Atlas will still use it, but treat repeated deferral as a signal to revise the approach.`;
  } else if (mode === "refine") {
    label = "Refine this resolution";
    guidance = `This resolution is only completing ${success == null ? "inconsistently" : `${success}% of the time`} across ${resolved} resolved sessions. Atlas will stop blindly repeating it and route the next attempt through a short intervention review.`;
  }
  if (stability?.held) guidance = `${stability.reason} ${guidance}`;
  return { ...candidate, mode, label, guidance, response, scope, evidence_level: candidate?.evidence_level || resolutionStrategyEvidenceLevel(resolved), stability: stability || { status: "stable", held: false, changed: false, reason: "No stability intervention was needed." } };
}

function resolutionStrategyGuardrail(candidate, previous = null) {
  if (!previous) return { strategy: resolutionPolicyForMode(candidate.mode, candidate), status: "stable", held: false, changed: false, reason: "No prior applied resolution strategy exists for this friction type." };
  if (candidate.mode === previous.mode) return { strategy: resolutionPolicyForMode(candidate.mode, candidate), status: "stable", held: false, changed: false, reason: `The current evidence still supports the previously applied ${previous.mode} strategy.` };

  const previousRank = resolutionStrategyEvidenceRank(previous.evidence_level);
  const candidateRank = resolutionStrategyEvidenceRank(candidate.evidence_level);
  const protectedPrior = ["preserve", "refine"].includes(previous.mode) && previousRank >= 2;
  if (!protectedPrior) return { strategy: resolutionPolicyForMode(candidate.mode, candidate), status: "changed", held: false, changed: true, reason: "The prior strategy did not yet have established evidence, so Atlas accepted the new evidence without a stability hold." };

  if (candidateRank < previousRank) {
    const stability = { status: "held", held: true, changed: false, reason: `Atlas is holding the established ${previous.mode} strategy because the contradictory evidence is shallower than the evidence that established it.` };
    return { strategy: resolutionPolicyForMode(previous.mode, candidate, stability), ...stability };
  }

  const success = Number(candidate.success_pct);
  let reversalAccepted = false;
  if (previous.mode === "preserve" && candidate.mode === "refine") reversalAccepted = success <= 25;
  else if (previous.mode === "refine" && candidate.mode === "preserve") reversalAccepted = success >= 80;
  else if (previous.mode === "preserve" && candidate.mode === "selective") reversalAccepted = success <= 55;
  else if (previous.mode === "refine" && candidate.mode === "selective") reversalAccepted = success >= 55;
  else reversalAccepted = true;

  if (!reversalAccepted) {
    const stability = { status: "held", held: true, changed: false, reason: `Atlas is holding the established ${previous.mode} strategy until contradictory performance is strong enough to justify a change.` };
    return { strategy: resolutionPolicyForMode(previous.mode, candidate, stability), ...stability };
  }
  const stability = { status: "changed", held: false, changed: true, reason: `Contradictory evidence reached sufficient depth and strength, so Atlas accepted the change from ${previous.mode} to ${candidate.mode}.` };
  return { strategy: resolutionPolicyForMode(candidate.mode, candidate, stability), ...stability };
}

function focusResolutionStrategy(opportunity, diagnosis = null, now = Date.now(), days = 30, portfolioEffectiveness = null) {
  const friction = diagnosis || focusFrictionDiagnosis(opportunity, now);
  const response = friction?.response || "unknown";
  const local = focusResolutionEffectiveness(opportunity, now, days);
  const localType = (local.types || []).find(item => item.response === response);
  let candidate;
  if (Number(localType?.total || 0) >= 3) candidate = resolutionStrategyFromEvidence(response, local, "opportunity");
  else {
    const portfolio = portfolioEffectiveness || { types: [] };
    candidate = resolutionStrategyFromEvidence(response, portfolio, "portfolio");
  }
  candidate = { ...candidate, evidence_level: resolutionStrategyEvidenceLevel(candidate.resolved) };
  const previous = lastResolutionStrategySnapshot(opportunity, response, now);
  const guarded = resolutionStrategyGuardrail(candidate, previous);
  return { ...guarded.strategy, stability: { status: guarded.status, held: guarded.held, changed: guarded.changed, reason: guarded.reason }, previous_strategy: previous };
}

function focusResolutionStrategySummary(opportunities, now = Date.now(), days = 30) {
  const effectiveness = focusResolutionEffectivenessSummary(opportunities, now, days);
  const responses = [...new Set((effectiveness.types || []).map(item => item.response))];
  const strategies = responses.map(response => resolutionStrategyFromEvidence(response, effectiveness, "portfolio"));
  return {
    window_days: days,
    strategies,
    preserve: strategies.filter(item => item.mode === "preserve").length,
    selective: strategies.filter(item => item.mode === "selective").length,
    refine: strategies.filter(item => item.mode === "refine").length,
    learning: strategies.filter(item => item.mode === "learning").length
  };
}

function focusFeedbackForOpportunity(opportunity, now = Date.now(), days = 7) {
  const formatter = new Intl.DateTimeFormat("en-CA", { timeZone: ATLAS_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" });
  const dateKey = timestamp => formatter.format(new Date(timestamp));
  const keys = new Set(Array.from({ length: days }, (_, index) => dateKey(now - index * DAY_MS)));
  const history = Array.isArray(opportunity.focus?.history) ? opportunity.focus.history : [];
  const recent = history.filter(event => {
    const at = Date.parse(event.at || "");
    return Number.isFinite(at) && keys.has(dateKey(at));
  });
  const completed = recent.filter(event => event.event === "completed").length;
  const deferred = recent.filter(event => event.event === "deferred").length;
  const resolved = completed + deferred;
  const followThrough = resolved ? Math.round(completed / resolved * 100) : null;
  const frictionDiagnosis = focusFrictionDiagnosis(opportunity, now, Math.max(days, 14));
  const frictionResponse = frictionDiagnosis.response;
  let adjustment = 0;
  let signal = "Neutral";
  let guidance = "Not enough recent execution history to change this recommendation.";
  if (deferred >= 3 && deferred > completed) {
    adjustment = -8;
    signal = "Repeatedly deferred";
    guidance = "This opportunity has been deferred repeatedly. Atlas is lowering its near-term work priority slightly; shrink or reconsider the next action before pushing it back to the top.";
    if (frictionResponse === "blocked") {
      adjustment = -2;
      guidance = "Deferrals are primarily blocker-driven. Atlas is applying only a small near-term penalty and will preserve the task while the dependency is resolved.";
    } else if (frictionResponse === "retime") {
      adjustment = -3;
      guidance = "Deferrals are primarily timing/capacity-driven. Atlas is lowering near-term priority modestly without treating the opportunity itself as weak.";
    } else if (frictionResponse === "shrink") {
      adjustment = -5;
      guidance = "Deferrals point to action-size friction. Atlas will lower near-term priority modestly and shrink the next executable step.";
    } else if (frictionResponse === "clarify") {
      adjustment = -5;
      guidance = "Deferrals point to clarity friction. Atlas will lower near-term priority modestly and rewrite the next step as one concrete deliverable.";
    } else if (frictionResponse === "reconsider") {
      adjustment = -10;
      guidance = "Deferrals point to a priority mismatch. Atlas is applying a stronger near-term penalty and should question whether this work belongs near the top of the queue.";
    }
  } else if (resolved >= 2 && followThrough >= 70) {
    adjustment = 4;
    signal = "Strong follow-through";
    guidance = "Recent recommendations on this opportunity are being completed. Atlas is giving it a small execution-confidence boost.";
  } else if (resolved >= 2 && followThrough < 50) {
    adjustment = -4;
    signal = "Low follow-through";
    guidance = "Recent recommended work is more often deferred than completed. Atlas is applying a small near-term penalty until the next action is easier to execute.";
    if (["blocked", "retime"].includes(frictionResponse)) adjustment = -2;
    else if (frictionResponse === "reconsider") adjustment = -6;
  }
  return { window_days: days, completed, deferred, follow_through_pct: followThrough, priority_adjustment: adjustment, signal, guidance, friction_diagnosis: frictionDiagnosis };
}


function adaptiveActionPolicy(learning = {}) {
  const signal = String(learning.signal || "Not enough adaptive data");
  if (signal === "Micro-actions are helping") {
    return {
      mode: "use_micro",
      label: "Use micro-actions when friction appears",
      guidance: "Recent evidence shows smaller actions improve follow-through, so Atlas will continue shrinking friction-heavy work."
    };
  }
  if (signal === "Micro-actions are not helping yet") {
    return {
      mode: "pause_micro",
      label: "Pause micro-actions",
      guidance: "Smaller actions are not improving follow-through. Atlas will keep the strategic action intact and challenge timing, task choice, or priority instead."
    };
  }
  if (signal === "No clear micro-action advantage") {
    return {
      mode: "selective_micro",
      label: "Use micro-actions selectively",
      guidance: "Micro and standard actions are performing similarly. Atlas will only shrink work when deferral friction is strong."
    };
  }
  return {
    mode: "learning",
    label: "Learn before changing strategy",
    guidance: "Atlas will use micro-actions for clear friction while it gathers enough comparative execution data to set a stronger policy."
  };
}



function adaptiveStrategyEvidence(learning = {}) {
  const microResolved = Number(learning.micro?.resolved || 0);
  const standardResolved = Number(learning.standard?.resolved || 0);
  const minGroup = Math.min(microResolved, standardResolved);
  const totalResolved = microResolved + standardResolved;
  let level = "Insufficient";
  let status = "insufficient";
  let guidance = "Atlas needs at least two resolved micro-actions and two resolved standard actions before using local comparative evidence.";
  let targetPerMode = 2;
  if (minGroup >= 8) {
    level = "Strong"; status = "strong"; targetPerMode = 8;
    guidance = "This strategy is supported by a deeper local execution sample and can be treated as durable unless newer outcomes materially change the pattern.";
  } else if (minGroup >= 4) {
    level = "Established"; status = "established"; targetPerMode = 4;
    guidance = "This strategy has enough balanced local outcomes to be treated as established, while Atlas continues monitoring newer execution evidence.";
  } else if (minGroup >= 2) {
    level = "Provisional"; status = "provisional"; targetPerMode = 4;
    guidance = "This local strategy is valid but still provisional. Atlas should keep collecting balanced micro and standard outcomes before treating it as durable.";
  }
  const remainingMicro = Math.max(0, targetPerMode - microResolved);
  const remainingStandard = Math.max(0, targetPerMode - standardResolved);
  return {
    level,
    status,
    micro_resolved: microResolved,
    standard_resolved: standardResolved,
    total_resolved: totalResolved,
    target_per_mode: targetPerMode,
    remaining_micro: remainingMicro,
    remaining_standard: remainingStandard,
    balanced_sample: minGroup >= 2,
    guidance
  };
}

function adaptivePolicyForMode(mode) {
  const policies = {
    use_micro: { mode: "use_micro", label: "Use micro-actions when friction appears", guidance: "Recent execution evidence supports using smaller actions when friction appears." },
    selective_micro: { mode: "selective_micro", label: "Use micro-actions selectively", guidance: "Micro and standard actions are performing similarly. Atlas will only shrink work when deferral friction is strong." },
    pause_micro: { mode: "pause_micro", label: "Pause micro-actions", guidance: "Recent execution evidence does not support shrinking work. Atlas should question timing, task choice, or priority instead." },
    learning: { mode: "learning", label: "Learn before changing strategy", guidance: "Atlas will keep learning before changing how it packages recommendations." }
  };
  return policies[mode] || policies.learning;
}

function lastAdaptiveStrategySnapshot(opportunity = {}) {
  const history = Array.isArray(opportunity.focus?.history) ? opportunity.focus.history : [];
  for (let index = history.length - 1; index >= 0; index -= 1) {
    const event = history[index] || {};
    if (event.event !== "started" || !event.adaptive_strategy_mode) continue;
    return {
      mode: event.adaptive_strategy_mode,
      scope: event.adaptive_strategy_scope || null,
      evidence_level: event.adaptive_strategy_evidence || "Insufficient",
      at: event.at || null
    };
  }
  return null;
}

function adaptiveStrategyGuardrail(opportunity, candidatePolicy, evidence = {}, learning = {}) {
  const previous = lastAdaptiveStrategySnapshot(opportunity);
  const candidate = { ...candidatePolicy };
  const lift = Number.isFinite(Number(learning.micro_follow_through_lift_pct)) ? Number(learning.micro_follow_through_lift_pct) : null;
  const rank = { Insufficient: 0, Provisional: 1, Established: 2, Strong: 3 };
  const currentRank = rank[evidence.level] ?? 0;
  const previousRank = rank[previous?.evidence_level] ?? 0;
  const base = {
    previous_mode: previous?.mode || null,
    previous_evidence: previous?.evidence_level || null,
    candidate_mode: candidate.mode,
    held: false,
    reason: previous ? "The current evidence supports keeping or updating the prior strategy." : "No prior applied strategy exists yet, so Atlas can use the current evidence directly."
  };
  if (!previous || previous.mode === candidate.mode || previous.scope !== "opportunity" || previousRank < 2) return { policy: candidate, stability: base };

  const enoughDepth = currentRank >= previousRank;
  let strongEnoughChange = false;
  if (candidate.mode === "use_micro") strongEnoughChange = lift != null && lift >= 30;
  else if (candidate.mode === "pause_micro") strongEnoughChange = lift != null && lift <= -30;
  else if (candidate.mode === "selective_micro") strongEnoughChange = lift != null && Math.abs(lift) <= 10;
  else strongEnoughChange = currentRank > previousRank;

  if (enoughDepth && strongEnoughChange) return {
    policy: candidate,
    stability: { ...base, reason: `The strategy changed because ${evidence.level.toLowerCase()} evidence now shows a sufficiently strong contradictory pattern.` }
  };

  const heldPolicy = adaptivePolicyForMode(previous.mode);
  return {
    policy: heldPolicy,
    stability: {
      ...base,
      held: true,
      applied_mode: previous.mode,
      reason: !enoughDepth
        ? `Atlas is holding the prior ${previous.evidence_level.toLowerCase()} strategy until contradictory evidence reaches at least the same depth.`
        : "Atlas is holding the prior established strategy because the newer performance swing is not yet strong enough to justify a flip."
    }
  };
}

function adaptiveStrategyForOpportunity(opportunity, portfolioLearning = {}, portfolioPolicy = null, now = Date.now(), days = 14) {
  const localLearning = adaptiveActionLearning([opportunity], now, days);
  const localEvidence = adaptiveStrategyEvidence(localLearning);
  const portfolioEvidence = adaptiveStrategyEvidence(portfolioLearning);
  const definitiveSignals = new Set([
    "Micro-actions are helping",
    "Micro-actions are not helping yet",
    "No clear micro-action advantage"
  ]);
  if (definitiveSignals.has(localLearning.signal)) {
    const candidatePolicy = adaptiveActionPolicy(localLearning);
    const guarded = adaptiveStrategyGuardrail(opportunity, candidatePolicy, localEvidence, localLearning);
    const policy = guarded.policy;
    return {
      ...policy,
      scope: "opportunity",
      scope_label: "Opportunity-specific evidence",
      opportunity_id: opportunity.id,
      local_learning: localLearning,
      portfolio_learning: portfolioLearning,
      evidence: localEvidence,
      portfolio_evidence: portfolioEvidence,
      stability: guarded.stability,
      guidance: `${policy.guidance} This strategy is based on this opportunity's own execution history. Evidence level: ${localEvidence.level}. ${localEvidence.guidance}${guarded.stability.held ? ` Stability guardrail: ${guarded.stability.reason}` : ""}`
    };
  }
  const fallback = portfolioPolicy || adaptiveActionPolicy(portfolioLearning);
  return {
    ...fallback,
    scope: "portfolio",
    scope_label: "Portfolio fallback",
    opportunity_id: opportunity.id,
    local_learning: localLearning,
    portfolio_learning: portfolioLearning,
    evidence: localEvidence,
    portfolio_evidence: portfolioEvidence,
    stability: { previous_mode: lastAdaptiveStrategySnapshot(opportunity)?.mode || null, candidate_mode: fallback.mode, held: false, reason: "Local comparative evidence is not yet sufficient for an opportunity-specific stability decision." },
    guidance: `${fallback.guidance} This opportunity does not yet have enough comparative history, so Atlas is using the portfolio strategy. Local evidence level: ${localEvidence.level}. ${localEvidence.guidance}`
  };
}

function adaptiveStrategyContext(opportunities, now = Date.now()) {
  const learning = adaptiveActionLearning(opportunities, now);
  const portfolioPolicy = adaptiveActionPolicy(learning);
  const strategies = opportunities.map(item => adaptiveStrategyForOpportunity(item, learning, portfolioPolicy, now));
  const byId = new Map(strategies.map(item => [String(item.opportunity_id), item]));
  return { learning, portfolioPolicy, strategies, byId };
}

function adaptiveNextAction(opportunity, strategicRecommendation, executionFeedback, now = Date.now(), policy = null) {
  const item = withReviewState(opportunity, now);
  const adjustment = Number(executionFeedback?.priority_adjustment || 0);
  const friction = adjustment < 0;
  const policyMode = policy?.mode || "legacy";
  const frictionResponse = executionFeedback?.friction_diagnosis?.response || "unknown";
  const nonSizeFriction = ["blocked", "retime", "reconsider", "review"].includes(frictionResponse);
  const shouldShrink = friction && !nonSizeFriction && policyMode !== "pause_micro" && (policyMode !== "selective_micro" || adjustment <= -8 || ["shrink", "clarify"].includes(frictionResponse));
  if (!shouldShrink) {
    let reason = "No recent execution friction requires Atlas to shrink this action.";
    if (frictionResponse === "blocked") reason = "Recent deferrals are blocker-driven, so Atlas is preserving the strategic action and directing attention to the dependency instead of shrinking the task.";
    else if (frictionResponse === "retime") reason = "Recent deferrals are timing/capacity-driven, so Atlas is preserving the strategic action and treating scheduling as the problem.";
    else if (frictionResponse === "reconsider") reason = "Recent deferrals indicate a priority mismatch, so Atlas is preserving the strategic action while questioning whether this work belongs near the top of the queue.";
    else if (friction && policyMode === "pause_micro") reason = "Adaptive learning shows micro-actions are not improving follow-through, so Atlas is preserving the strategic action and reconsidering timing, task choice, or priority instead.";
    else if (friction && policyMode === "selective_micro") reason = "Adaptive learning shows no clear micro-action advantage, so Atlas only shrinks work when deferral friction is strong.";
    return {
      mode: "standard",
      action: strategicRecommendation || item.next_action || "Review opportunity",
      estimated_minutes: null,
      reason,
      policy_mode: policyMode
    };
  }

  let action = "Spend 15 minutes completing the smallest visible piece of this recommendation.";
  let estimatedMinutes = 15;
  if (frictionResponse === "clarify") {
    estimatedMinutes = 10;
    action = "Spend 10 minutes rewriting the next step as one concrete deliverable with a clear done condition.";
  } else if (item.status === "Researching") {
    action = "Spend 15 minutes finding and recording one concrete demand signal.";
  } else if (item.status === "Testing") {
    if (item.decision_ready) action = "Spend 15 minutes reviewing the test results and write the final decision summary.";
    else if (["urgent", "due"].includes(item.attention_level) && item.next_action) action = `Spend 15 minutes completing only this step: ${item.next_action}`;
    else action = "Spend 15 minutes recording the next missing test result or checkpoint in the Testing Workspace.";
  } else if (item.status === "Active") {
    action = "Spend 15 minutes reviewing current revenue and profit, then record one keep-or-adjust decision.";
  } else if (item.status === "Scaled") {
    action = "Spend 15 minutes checking profitability and workload, then record one keep-or-adjust decision.";
  } else if (item.status === "Paused") {
    estimatedMinutes = 10;
    action = "Spend 10 minutes reviewing why this was paused and choose resume, extend, or kill.";
  }

  const calibration = focusEffortCalibration(opportunity, now);
  const calibrated = calibrateTimedAction(action, estimatedMinutes, "micro", calibration);
  return {
    mode: "micro",
    ...calibrated,
    reason: frictionResponse === "clarify" ? "Recent deferrals indicate the next step is unclear, so Atlas is converting it into a short clarification action." : "Recent deferrals suggest the strategic recommendation is too large to execute cleanly in one sitting.",
    strategic_recommendation: strategicRecommendation || item.next_action || "Review opportunity",
    policy_mode: policyMode
  };
}

function opportunityIntelligence(opportunity, now = Date.now(), adaptivePolicy = null) {
  const item = withReviewState(opportunity);
  const health = item.status === "Testing" ? experimentHealth(item, now) : null;
  const focus = focusStateForOpportunity(opportunity, now);
  const executionFeedback = focusFeedbackForOpportunity(opportunity, now);
  const base = Number(item.atlas_score || 0);
  let score = Math.round(base * 0.55);
  const reasons = [];
  if (item.attention_level === "urgent") { score += 30; reasons.push("Urgent action is blocking progress."); }
  else if (item.attention_level === "due") { score += 20; reasons.push("Required work is due."); }
  if (item.status === "Testing") { score += 12; reasons.push("Live tests get priority because they can produce evidence now."); }
  if (health?.health_label === "Strong" || health?.health_label === "Healthy") { score += 8; reasons.push("Current test signals are promising."); }
  if (health?.health_label === "At Risk") { score += 10; reasons.push("The test needs a decision before more time is spent."); }
  if (Number(item.actual_profit || 0) > 0) { score += 8; reasons.push("It is already producing profit."); }
  if (String(item.ongoing_effort || "").toLowerCase() === "low") score += 4;
  if (String(item.scalability || "").toLowerCase() === "high") score += 4;
  if (executionFeedback.priority_adjustment) {
    score += executionFeedback.priority_adjustment;
    reasons.push(executionFeedback.priority_adjustment > 0
      ? "Recent follow-through supports keeping this work near the top."
      : "Recent deferrals reduce its near-term execution priority.");
  }
  if (focus.status === "active") { score += 15; reasons.unshift("You already started this focus action."); }
  score = Math.max(0, Math.min(100, score));
  let strategicRecommendation = item.next_action || "Review opportunity";
  if (item.status === "Researching" && base >= 75) strategicRecommendation = "Finish demand validation and move this toward a 30-day test.";
  if (item.status === "Killed") strategicRecommendation = "Leave closed unless new evidence materially changes the case.";
  const resolvedAdaptivePolicy = typeof adaptivePolicy === "function" ? adaptivePolicy(opportunity) : adaptivePolicy;
  const adaptive = adaptiveNextAction(opportunity, strategicRecommendation, executionFeedback, now, resolvedAdaptivePolicy);
  const capacityProfile = focusCapacityProfile(opportunity, now);
  const capacityFit = capacityFitForAction(adaptive, capacityProfile);
  if (capacityFit.score_adjustment) {
    score += capacityFit.score_adjustment;
    reasons.push(capacityFit.score_adjustment > 0 ? "The recommended action fits your learned execution capacity." : "The recommended action needs a larger-than-usual focus block.");
    score = Math.max(0, Math.min(100, score));
  }
  let recommendation = strategicRecommendation;
  if (executionFeedback.priority_adjustment < 0 && item.status !== "Killed") recommendation = `Shrink the next action, then: ${strategicRecommendation}`;
  return { id:item.id, name:item.name, status:item.status, work_priority_score:score, recommendation, strategic_recommendation: strategicRecommendation, adaptive_next_action: adaptive, adaptive_strategy: resolvedAdaptivePolicy || null, capacity_fit: capacityFit, capacity_profile: capacityProfile, reasons, atlas_score:base, health_label:health?.health_label || null, next_action_date:item.next_action_date || null, focus, execution_feedback: executionFeedback };
}

function intelligenceQueue(opportunities, now = Date.now(), adaptivePolicy = null) {
  return opportunities.map(item => opportunityIntelligence(item, now, adaptivePolicy))
    .filter(item => item.status !== "Killed" && !(["deferred", "completed"].includes(item.focus.status) && item.focus.deferred_until && Date.parse(item.focus.deferred_until) > now))
    .sort((a,b)=>b.work_priority_score-a.work_priority_score || b.atlas_score-a.atlas_score);
}


function focusExecutionSummary(opportunities, now = Date.now()) {
  const dateKey = timestamp => new Intl.DateTimeFormat("en-CA", { timeZone: ATLAS_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(timestamp));
  const todayKey = dateKey(now);
  const events = [];
  for (const opportunity of opportunities) {
    const history = Array.isArray(opportunity.focus?.history) ? opportunity.focus.history : [];
    for (const event of history) {
      const at = Date.parse(event.at || '');
      if (!Number.isFinite(at)) continue;
      events.push({
        opportunity_id: opportunity.id,
        opportunity_name: opportunity.name,
        event: String(event.event || ''),
        action: String(event.action || ''),
        defer_reason: normalizeDeferReason(event.defer_reason),
        at: event.at,
        duration_minutes: Math.max(0, Number(event.duration_minutes || 0))
      });
    }
  }
  const today = events.filter(event => dateKey(Date.parse(event.at)) === todayKey);
  const count = type => today.filter(event => event.event === type).length;
  const focusedMinutes = Math.round(today.reduce((sum, event) => sum + Number(event.duration_minutes || 0), 0));
  const active = opportunities.filter(item => focusStateForOpportunity(item, now).status === 'active').length;
  return {
    date: todayKey,
    started: count('started'),
    completed: count('completed'),
    deferred: count('deferred'),
    focused_minutes: focusedMinutes,
    active,
    recent: events.sort((a,b)=>Date.parse(b.at)-Date.parse(a.at)).slice(0, 8)
  };
}

function focusScorecard(opportunities, now = Date.now(), days = 7) {
  const formatter = new Intl.DateTimeFormat("en-CA", { timeZone: ATLAS_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" });
  const dateKey = timestamp => formatter.format(new Date(timestamp));
  const keys = new Set(Array.from({ length: days }, (_, index) => dateKey(now - index * DAY_MS)));
  const events = [];
  const byOpportunity = new Map();
  for (const opportunity of opportunities) {
    const history = Array.isArray(opportunity.focus?.history) ? opportunity.focus.history : [];
    for (const event of history) {
      const at = Date.parse(event.at || "");
      if (!Number.isFinite(at) || !keys.has(dateKey(at))) continue;
      const normalized = {
        opportunity_id: opportunity.id,
        opportunity_name: opportunity.name,
        event: String(event.event || ""),
        action: String(event.action || ""),
        at: event.at,
        date: dateKey(at),
        duration_minutes: Math.max(0, Number(event.duration_minutes || 0))
      };
      events.push(normalized);
      const row = byOpportunity.get(opportunity.id) || { opportunity_id: opportunity.id, opportunity_name: opportunity.name, starts: 0, completed: 0, deferred: 0, focused_minutes: 0 };
      if (normalized.event === "started") row.starts += 1;
      if (normalized.event === "completed") row.completed += 1;
      if (normalized.event === "deferred") row.deferred += 1;
      row.focused_minutes += normalized.duration_minutes;
      byOpportunity.set(opportunity.id, row);
    }
  }
  const count = type => events.filter(event => event.event === type).length;
  const started = count("started");
  const completed = count("completed");
  const deferred = count("deferred");
  const focusedMinutes = Math.round(events.reduce((sum, event) => sum + event.duration_minutes, 0));
  const resolved = completed + deferred;
  const followThrough = resolved ? Math.round(completed / resolved * 100) : null;
  const activeDays = new Set(events.map(event => event.date)).size;
  const topOpportunities = [...byOpportunity.values()]
    .sort((a,b)=>b.focused_minutes-a.focused_minutes || b.completed-a.completed || b.starts-a.starts)
    .slice(0, 5)
    .map(row => ({ ...row, focused_minutes: Math.round(row.focused_minutes) }));
  let signal = "No focus data yet";
  let guidance = "Use Start Focus when you begin so Atlas can learn from your execution pattern.";
  if (events.length) {
    if (deferred >= 3 && deferred > completed) {
      signal = "Deferral pattern";
      guidance = "Several focus actions are being deferred. Review whether Atlas is ranking the right work or whether the recommended actions are too large.";
    } else if (resolved >= 2 && followThrough >= 70) {
      signal = "Strong follow-through";
      guidance = "Execution is matching Atlas recommendations. Keep the current focus cadence and protect the highest-leverage work.";
    } else if (started >= 2 && resolved === 0) {
      signal = "Open execution loop";
      guidance = "Focus sessions are being started but not closed. Complete or intentionally defer them so Atlas can distinguish progress from abandoned work.";
    } else {
      signal = "Building execution history";
      guidance = "Keep recording focus actions; Atlas needs a few completed or deferred sessions before the pattern is meaningful.";
    }
  }
  return {
    window_days: days,
    started,
    completed,
    deferred,
    focused_minutes: focusedMinutes,
    active_days: activeDays,
    follow_through_pct: followThrough,
    signal,
    guidance,
    top_opportunities: topOpportunities
  };
}


function adaptiveActionLearning(opportunities, now = Date.now(), days = 14) {
  const cutoff = now - days * DAY_MS;
  const resolved = [];
  for (const opportunity of opportunities) {
    const history = Array.isArray(opportunity.focus?.history) ? opportunity.focus.history : [];
    for (const event of history) {
      if (!['completed', 'deferred'].includes(event.event)) continue;
      const at = Date.parse(event.at || '');
      if (!Number.isFinite(at) || at < cutoff || at > now) continue;
      const mode = event.action_mode === 'micro' ? 'micro' : event.action_mode === 'standard' ? 'standard' : null;
      if (!mode) continue;
      resolved.push({
        mode,
        outcome: event.event,
        duration_minutes: Math.max(0, Number(event.duration_minutes || 0)),
        opportunity_id: opportunity.id,
        opportunity_name: opportunity.name,
        at: event.at
      });
    }
  }
  const summarize = mode => {
    const rows = resolved.filter(row => row.mode === mode);
    const completed = rows.filter(row => row.outcome === 'completed').length;
    const deferred = rows.filter(row => row.outcome === 'deferred').length;
    const total = completed + deferred;
    const durations = rows.filter(row => row.duration_minutes > 0).map(row => row.duration_minutes);
    return {
      resolved: total,
      completed,
      deferred,
      follow_through_pct: total ? Math.round(completed / total * 100) : null,
      avg_resolution_minutes: durations.length ? Math.round(durations.reduce((a,b)=>a+b,0) / durations.length) : null
    };
  };
  const micro = summarize('micro');
  const standard = summarize('standard');
  let signal = 'Not enough adaptive data';
  let guidance = 'Atlas will compare adaptive micro-actions with standard actions after each has at least two resolved focus sessions.';
  let micro_effect = null;
  if (micro.resolved >= 2 && standard.resolved >= 2) {
    micro_effect = micro.follow_through_pct - standard.follow_through_pct;
    if (micro_effect >= 20) {
      signal = 'Micro-actions are helping';
      guidance = 'Smaller adaptive actions are producing materially stronger follow-through. Keep using them when execution friction appears.';
    } else if (micro_effect <= -20) {
      signal = 'Micro-actions are not helping yet';
      guidance = 'Shrinking the action has not improved follow-through. Atlas should reconsider the task itself, timing, or opportunity priority instead of shrinking it further.';
    } else {
      signal = 'No clear micro-action advantage';
      guidance = 'Adaptive and standard actions are resolving at similar rates. Keep collecting execution data before changing the strategy.';
    }
  } else if (micro.resolved >= 2 && standard.resolved < 2) {
    signal = 'Adaptive baseline forming';
    guidance = 'Atlas has enough micro-action results to form a baseline, but needs more standard-action outcomes for a fair comparison.';
  }
  return { window_days: days, micro, standard, micro_follow_through_lift_pct: micro_effect, signal, guidance };
}

function commandCenter(opportunities, now = Date.now(), workBlockMinutes = null, dailyPlanMinutes = null) {
  const enriched = opportunities.map(raw => {
    const opportunity = withReviewState(raw, now);
    const action = nextActionState(opportunity, now);
    const experiment = normalizeExperiment(opportunity.experiment || {});
    const health = opportunity.status === "Testing" ? experimentHealth(opportunity, now) : null;
    const plan = opportunity.status === "Testing" ? interventionPlan(opportunity, now) : null;
    const decision = opportunity.status === "Testing" ? decisionState(experiment) : null;
    const activeIntervention = normalizeInterventions(experiment.interventions).find(item => item.status === "Active") || null;
    return { opportunity, action, experiment, health, plan, decision, activeIntervention };
  });

  const priorityRank = { Urgent: 0, High: 1, Medium: 2, Low: 3, None: 4 };
  const priorityFor = row => {
    if (row.decision?.decision_ready) return "Urgent";
    if (row.action.attention_level === "urgent") return "Urgent";
    if (row.action.attention_level === "due") return "High";
    if (row.action.attention_level === "normal") return "Medium";
    return "None";
  };
  const attention = enriched
    .filter(row => ["urgent", "due"].includes(row.action.attention_level) || row.decision?.decision_ready)
    .map(row => ({
      id: row.opportunity.id,
      name: row.opportunity.name,
      status: row.opportunity.status,
      priority: priorityFor(row),
      action: row.decision?.decision_ready ? "Make the 30-day experiment decision." : row.action.next_action,
      due_date: row.action.next_action_date || row.experiment.end_date || "",
      reason: row.decision?.decision_ready ? row.decision.recommendation_reason : "",
      health_label: row.health?.health_label || "",
      health_score: row.health?.health_score ?? null
    }))
    .sort((a,b)=>(priorityRank[a.priority]??9)-(priorityRank[b.priority]??9)||String(a.due_date||"9999").localeCompare(String(b.due_date||"9999")));

  const liveTests=enriched.filter(row=>row.opportunity.status==="Testing");
  const totalRevenue=opportunities.reduce((sum,item)=>sum+Number(item.actual_revenue||0),0);
  const totalProfit=opportunities.reduce((sum,item)=>sum+Number(item.actual_profit||0),0);
  const nextMoves=attention.slice(0,3).map(item=>({id:item.id,name:item.name,priority:item.priority,action:item.action,due_date:item.due_date}));
  if (!nextMoves.length) liveTests.slice(0,3).forEach(row=>nextMoves.push({
    id:row.opportunity.id,name:row.opportunity.name,priority:"Monitor",
    action:row.activeIntervention?`Continue active intervention: ${row.activeIntervention.action}`:row.plan.intervention_action,
    due_date:row.action.next_action_date||row.experiment.end_date||""
  }));

  const adaptiveContext = adaptiveStrategyContext(opportunities, now);
  const adaptiveLearning = adaptiveContext.learning;
  const adaptivePolicy = adaptiveContext.portfolioPolicy;
  const adaptiveStrategies = adaptiveContext.strategies;
  const rankedIntelligence = intelligenceQueue(opportunities, now, opportunity => adaptiveContext.byId.get(String(opportunity.id)) || adaptivePolicy);

  return {
    generated_at:new Date(now).toISOString(),
    headline:attention.length?`${attention.length} item${attention.length===1?"":"s"} need attention.`:(liveTests.length?`${liveTests.length} live test${liveTests.length===1?"":"s"} running with no urgent action.`:"Portfolio is stable."),
    portfolio:{
      total:opportunities.length,
      researching:enriched.filter(r=>r.opportunity.status==="Researching").length,
      testing:liveTests.length,
      active:enriched.filter(r=>r.opportunity.status==="Active").length,
      scaled:enriched.filter(r=>r.opportunity.status==="Scaled").length,
      paused:enriched.filter(r=>r.opportunity.status==="Paused").length,
      killed:enriched.filter(r=>r.opportunity.status==="Killed").length
    },
    money:{total_revenue:Number(totalRevenue.toFixed(2)),total_profit:Number(totalProfit.toFixed(2))},
    operating:{
      needs_attention:attention.length,
      health_at_risk:liveTests.filter(r=>["At Risk","Needs Attention"].includes(r.health?.health_label)).length,
      active_interventions:liveTests.filter(r=>r.activeIntervention).length,
      decisions_ready:liveTests.filter(r=>r.decision?.decision_ready).length
    },
    attention,next_moves:nextMoves,
    focus_execution: focusExecutionSummary(opportunities, now),
    focus_scorecard: focusScorecard(opportunities, now),
    focus_friction: focusFrictionSummary(opportunities, now),
    resolution_effectiveness: focusResolutionEffectivenessSummary(opportunities, now),
    resolution_strategy: focusResolutionStrategySummary(opportunities, now),
    effort_calibration: focusEffortCalibration({ focus: { history: opportunities.flatMap(item => Array.isArray(item.focus?.history) ? item.focus.history : []) } }, now),
    capacity_profile: focusCapacityProfile({ focus: { history: opportunities.flatMap(item => Array.isArray(item.focus?.history) ? item.focus.history : []) } }, now),
    next_work_block: nextWorkBlockPlan(opportunities, now, workBlockMinutes),
    daily_work_plan: dailyWorkPlan(opportunities, now, dailyPlanMinutes),
    daily_plan_execution: dailyPlanExecutionSummary(opportunities, now),
    daily_plan_density_learning: dailyPlanDensityLearning(opportunities, now),
    daily_plan_density_controller: dailyPlanDensityController(opportunities, now, dailyPlanMinutes),
    daily_plan_time_window_learning: dailyPlanTimeWindowLearning(opportunities, now),
    daily_plan_time_window_priority: dailyPlanTimeWindowPriority(opportunities, now),
    daily_plan_work_type_learning: dailyPlanWorkTypeLearning(opportunities, now),
    daily_plan_composition_learning: dailyPlanCompositionLearning(opportunities, now),
    daily_plan_sequence_learning: dailyPlanSequenceLearning(opportunities, now),
    daily_plan_depth_learning: dailyPlanDepthLearning(opportunities, now),
    daily_plan_depth_recovery_learning: dailyPlanDepthRecoveryLearning(opportunities, now, dailyPlanDepthLearning(opportunities, now)),
    daily_plan_depth_controller: dailyPlanDepthRecoveryController(dailyPlanDepthController(dailyPlanDepthLearning(opportunities, now), 5), dailyPlanDepthRecoveryLearning(opportunities, now, dailyPlanDepthLearning(opportunities, now)), 5),
    daily_plan_block_size_learning: dailyPlanBlockSizeLearning(opportunities, now),
    daily_plan_block_size_outcome_learning: dailyPlanBlockSizeOutcomeLearning(opportunities, now),
    daily_plan_block_size_controller: { early: dailyPlanBlockSizeOutcomeController(dailyPlanBlockSizeController(dailyPlanBlockSizeLearning(opportunities, now), focusCapacityProfile({ focus: { history: opportunities.flatMap(item => Array.isArray(item.focus?.history) ? item.focus.history : []) } }, now).typical_block_minutes || 30, "early"), dailyPlanBlockSizeOutcomeLearning(opportunities, now), "early"), deep: dailyPlanBlockSizeOutcomeController(dailyPlanBlockSizeController(dailyPlanBlockSizeLearning(opportunities, now), focusCapacityProfile({ focus: { history: opportunities.flatMap(item => Array.isArray(item.focus?.history) ? item.focus.history : []) } }, now).typical_block_minutes || 30, "deep"), dailyPlanBlockSizeOutcomeLearning(opportunities, now), "deep") },
    adaptive_action_learning: adaptiveLearning,
    adaptive_action_policy: adaptivePolicy,
    adaptive_strategy_evidence: adaptiveStrategyEvidence(adaptiveLearning),
    adaptive_strategy_profiles: adaptiveStrategies,
    recommendation_feedback: opportunities.map(item => ({ id: item.id, name: item.name, ...focusFeedbackForOpportunity(item, now) }))
      .filter(item => item.completed || item.deferred)
      .sort((a,b)=>Math.abs(b.priority_adjustment)-Math.abs(a.priority_adjustment) || (b.completed+b.deferred)-(a.completed+a.deferred))
      .slice(0,5),
    intelligence: rankedIntelligence.slice(0,5),
    top_focus: rankedIntelligence[0] || null
  };
}

function portfolioSummary(opportunities, now = Date.now()) {
  const testing = opportunities.map(withReviewState).filter(item => item.status === "Testing");
  const rows = testing.map(item => {
    const experiment = item.experiment || emptyExperiment();
    const health = experimentHealth(item, now);
    const intervention = interventionPlan(item, now);
    const interventionHistory = normalizeInterventions(experiment.interventions);
    const activeIntervention = interventionHistory.find(record => record.status === "Active") || null;
    const lastIntervention = [...interventionHistory].reverse().find(record => record.status === "Completed") || null;
    const checkpoints = normalizeCheckpoints(experiment.weekly_checkpoints || []);
    const total = field => checkpoints.reduce((sum, checkpoint) => sum + Number(checkpoint[field] || 0), 0);
    const visits = total("visits");
    const orders = total("orders");
    const revenue = Number(experiment.revenue || total("revenue") || 0);
    const expenses = Number(experiment.expenses || total("expenses") || 0);
    const start = experiment.start_date ? Date.parse(`${experiment.start_date}T00:00:00Z`) : NaN;
    const end = experiment.end_date ? Date.parse(`${experiment.end_date}T23:59:59Z`) : NaN;
    const daysElapsed = Number.isNaN(start) ? null : Math.max(0, Math.floor((now - start) / DAY_MS));
    const daysRemaining = Number.isNaN(end) ? null : Math.max(0, Math.ceil((end - now) / DAY_MS));
    return {
      id: item.id, name: item.name,
      start_date: experiment.start_date || "", end_date: experiment.end_date || "",
      days_elapsed: daysElapsed, days_remaining: daysRemaining,
      views: total("views"), visits, favorites: total("favorites"), orders,
      revenue, expenses, cash_profit: revenue - expenses,
      conversion_rate: visits > 0 ? (orders / visits) * 100 : 0,
      completed_checkpoints: item.completed_checkpoints || 0,
      next_checkpoint_week: item.next_checkpoint_week,
      next_checkpoint_date: item.next_checkpoint_date,
      attention_level: item.attention_level,
      next_action: item.next_action,
      health_score: health.health_score,
      health_label: health.health_label,
      health_confidence: health.health_confidence,
      health_recommendation: health.health_recommendation,
      health_reasons: health.health_reasons,
      health_warnings: health.health_warnings,
      intervention_category: intervention.intervention_category,
      intervention_diagnosis: intervention.intervention_diagnosis,
      intervention_priority: intervention.intervention_priority,
      intervention_action: intervention.intervention_action,
      intervention_rationale: intervention.intervention_rationale,
      intervention_success_metric: intervention.intervention_success_metric,
      intervention_change_limit: intervention.intervention_change_limit,
      active_intervention: activeIntervention,
      last_intervention: lastIntervention ? { ...lastIntervention, evaluation: interventionEvaluation(lastIntervention) } : null,
      intervention_count: interventionHistory.length
    };
  });
  const sum = field => rows.reduce((total, row) => total + Number(row[field] || 0), 0);
  const visits = sum("visits");
  const orders = sum("orders");
  return {
    active_tests: rows.length,
    views: sum("views"),
    visits,
    favorites: sum("favorites"),
    orders,
    revenue: sum("revenue"),
    expenses: sum("expenses"),
    cash_profit: sum("cash_profit"),
    conversion_rate: visits > 0 ? (orders / visits) * 100 : 0,
    needs_attention: rows.filter(row => ["urgent", "due"].includes(row.attention_level)).length,
    health_counts: {
      strong: rows.filter(row => row.health_label === "Strong").length,
      healthy: rows.filter(row => row.health_label === "Healthy").length,
      developing: rows.filter(row => row.health_label === "Developing").length,
      needs_attention: rows.filter(row => row.health_label === "Needs Attention").length,
      at_risk: rows.filter(row => row.health_label === "At Risk").length
    },
    intervention_counts: rows.reduce((counts, row) => {
      counts[row.intervention_category] = (counts[row.intervention_category] || 0) + 1;
      return counts;
    }, {}),
    tests: rows.sort((a, b) => a.health_score - b.health_score || a.name.localeCompare(b.name))
  };
}


function clamp10(value) {
  return Math.max(0, Math.min(10, Number(value || 0)));
}

function radarScore(candidate = {}) {
  const income = clamp10(candidate.income_potential);
  const speed = clamp10(candidate.speed_to_revenue);
  const startup = clamp10(candidate.startup_cost_score);
  const effort = clamp10(candidate.ongoing_effort_score);
  const scalability = clamp10(candidate.scalability_score);
  const automation = clamp10(candidate.automation_potential);
  const fit = clamp10(candidate.atlas_fit);
  const confidence = clamp10(candidate.confidence);
  return Math.round(
    income * 0.18 +
    speed * 0.14 +
    startup * 0.12 +
    effort * 0.12 +
    scalability * 0.14 +
    automation * 0.12 +
    fit * 0.12 +
    confidence * 0.06
  ) * 10;
}


function normalizeEvidenceRecord(item) {
  if (typeof item === "string") return { text: item.trim(), type: "signal", quality: "Medium", source: "" };
  const value = item && typeof item === "object" ? item : {};
  const quality = ["Low", "Medium", "High"].includes(value.quality) ? value.quality : "Medium";
  return {
    text: String(value.text || value.evidence || "").trim(),
    type: String(value.type || "signal").trim().toLowerCase().replace(/\s+/g, "_"),
    quality,
    source: String(value.source || "").trim()
  };
}

function radarEvidenceStrength(evidence = []) {
  const records = (Array.isArray(evidence) ? evidence : []).map(normalizeEvidenceRecord).filter(item => item.text);
  const qualityWeight = { Low: 0.5, Medium: 1, High: 1.5 };
  const typeWeight = {
    direct_customer_request: 2.5,
    customer_request: 2.5,
    sales: 2.5,
    competitor_sales: 2.25,
    marketplace_sales: 2.25,
    marketplace_activity: 1.75,
    search_activity: 1.75,
    survey_interest: 1.5,
    interview_interest: 1.5,
    comparable_product: 1.25,
    signal: 1,
    assumption: 0.5
  };
  const points = records.reduce((sum, item) => sum + (typeWeight[item.type] || 1) * qualityWeight[item.quality], 0);
  const rounded = Math.round(points * 10) / 10;
  const level = rounded >= 6 ? "Strong" : rounded >= 3 ? "Established" : rounded >= 1.5 ? "Provisional" : records.length ? "Weak" : "None";
  return { records, count: records.length, points: rounded, level };
}

function radarStageForScore(scoreValue, evidence = 0) {
  const score = Number(scoreValue || 0);
  const evidenceSummary = Array.isArray(evidence)
    ? radarEvidenceStrength(evidence)
    : { count: Number(evidence || 0), points: Number(evidence || 0) * 2, level: Number(evidence || 0) >= 3 ? "Established" : Number(evidence || 0) >= 1 ? "Provisional" : "None" };
  if (score >= 80 && evidenceSummary.count >= 2 && evidenceSummary.points >= 4) return "Ready to Test";
  if (score >= 72 && evidenceSummary.count >= 1 && evidenceSummary.points >= 2) return "Atlas Recommended";
  if (score >= 60) return "Worth Investigating";
  return "New";
}

function radarTokenSet(value = "") {
  const stop = new Set(["the","a","an","and","or","for","to","of","in","on","with","from","by","kit","pack","bundle","product","service","digital","local","business","template","templates"]);
  return new Set(String(value).toLowerCase().replace(/[^a-z0-9\s]/g," ").split(/\s+/).filter(token => token.length > 2 && !stop.has(token)));
}

function radarSimilarity(left = {}, right = {}) {
  const a = radarTokenSet(`${left.name || ""} ${left.category || ""} ${left.description || ""}`);
  const b = radarTokenSet(`${right.name || ""} ${right.category || ""} ${right.description || ""}`);
  if (!a.size || !b.size) return 0;
  let intersection = 0;
  for (const token of a) if (b.has(token)) intersection += 1;
  const union = new Set([...a, ...b]).size;
  const jaccard = union ? intersection / union : 0;
  const leftName = String(left.name || "").trim().toLowerCase().replace(/[^a-z0-9]+/g," ");
  const rightName = String(right.name || "").trim().toLowerCase().replace(/[^a-z0-9]+/g," ");
  if (leftName && leftName === rightName) return 1;
  return Math.round(jaccard * 100) / 100;
}

function radarDuplicateMatches(candidate = {}, candidates = [], opportunities = [], excludeId = null) {
  const pool = [
    ...candidates.filter(item => Number(item.id) !== Number(excludeId)).map(item => ({ ...item, duplicate_source: "radar" })),
    ...opportunities.map(item => ({ ...item, duplicate_source: "portfolio" }))
  ];
  return pool.map(item => {
    const similarity = radarSimilarity(candidate, item);
    return { id: item.id, name: item.name, status: item.stage || item.status || "", source: item.duplicate_source, similarity, level: similarity >= 0.68 ? "Likely duplicate" : similarity >= 0.45 ? "Possible duplicate" : null };
  }).filter(item => item.level).sort((a,b)=>b.similarity-a.similarity);
}

function normalizeRadarCandidate(input = {}, previous = {}) {
  const rawEvidence = Array.isArray(input.evidence) ? input.evidence : (Array.isArray(previous.evidence_records) ? previous.evidence_records : (Array.isArray(previous.evidence) ? previous.evidence : []));
  const evidenceSummary = radarEvidenceStrength(rawEvidence);
  const source = String(input.source ?? previous.source ?? "").trim();
  const stageInput = String(input.stage ?? previous.stage ?? "").trim();
  const candidate = {
    ...previous,
    name: String(input.name ?? previous.name ?? "").trim(),
    category: String(input.category ?? previous.category ?? "").trim(),
    description: String(input.description ?? previous.description ?? "").trim(),
    source,
    source_url: String(input.source_url ?? previous.source_url ?? "").trim(),
    evidence: evidenceSummary.records.map(item => item.text),
    evidence_records: evidenceSummary.records,
    evidence_strength: evidenceSummary.level,
    evidence_points: evidenceSummary.points,
    income_potential: clamp10(input.income_potential ?? previous.income_potential),
    speed_to_revenue: clamp10(input.speed_to_revenue ?? previous.speed_to_revenue),
    startup_cost_score: clamp10(input.startup_cost_score ?? previous.startup_cost_score),
    ongoing_effort_score: clamp10(input.ongoing_effort_score ?? previous.ongoing_effort_score),
    scalability_score: clamp10(input.scalability_score ?? previous.scalability_score),
    automation_potential: clamp10(input.automation_potential ?? previous.automation_potential),
    atlas_fit: clamp10(input.atlas_fit ?? previous.atlas_fit),
    confidence: clamp10(input.confidence ?? previous.confidence),
    notes: String(input.notes ?? previous.notes ?? "").trim()
  };
  candidate.radar_score = radarScore(candidate);
  candidate.stage = RADAR_STAGES.includes(stageInput) ? stageInput : radarStageForScore(candidate.radar_score, evidenceSummary.records);
  return candidate;
}


function radarEvidenceGaps(candidate = {}) {
  const evidence = radarEvidenceStrength(candidate.evidence_records || candidate.evidence || []);
  const records = evidence.records;
  const types = new Set(records.map(item => item.type));
  const gaps = [];
  const customerProof = ["direct_customer_request","customer_request","survey_interest","interview_interest"].some(type => types.has(type));
  const marketProof = ["sales","competitor_sales","marketplace_sales","marketplace_activity","search_activity","comparable_product"].some(type => types.has(type));
  if (!customerProof) gaps.push({ key:"customer_demand", label:"Customer demand proof", priority:"High", action:"Get direct customer requests, interviews, or survey interest." });
  if (!marketProof) gaps.push({ key:"market_validation", label:"Market validation", priority:"High", action:"Find sales, marketplace, search, or comparable-product evidence." });
  if (Number(candidate.income_potential || 0) < 6) gaps.push({ key:"income_potential", label:"Income potential", priority:"Medium", action:"Estimate realistic price, sales volume, and monthly upside." });
  if (Number(candidate.speed_to_revenue || 0) < 6) gaps.push({ key:"speed_to_revenue", label:"Speed to revenue", priority:"Medium", action:"Define the fastest path to a first sale and estimate time to launch." });
  if (Number(candidate.startup_cost_score || 0) < 6) gaps.push({ key:"startup_cost", label:"Startup cost", priority:"Medium", action:"Find a cheaper test path or document the minimum cash needed." });
  if (Number(candidate.ongoing_effort_score || 0) < 6) gaps.push({ key:"ongoing_effort", label:"Ongoing effort", priority:"Medium", action:"Identify what can be simplified, templated, delegated, or automated." });
  if (Number(candidate.automation_potential || 0) < 6) gaps.push({ key:"automation", label:"Automation potential", priority:"Low", action:"Identify repetitive steps Atlas or another system could automate." });
  return gaps;
}

function radarCandidateRecommendation(candidate = {}, duplicateMatches = []) {
  const gaps = radarEvidenceGaps(candidate);
  const evidence = radarEvidenceStrength(candidate.evidence_records || candidate.evidence || []);
  const likelyDuplicate = duplicateMatches.find(item => item.level === "Likely duplicate");
  const possibleDuplicate = duplicateMatches.find(item => item.level === "Possible duplicate");
  const score = Number(candidate.radar_score || radarScore(candidate));
  if (["Dismissed","Promoted"].includes(candidate.stage)) {
    return { state:candidate.stage.toLowerCase(), ready:false, next_action:candidate.stage === "Promoted" ? "Continue work in the active Opportunity Engine." : "No further action unless you intentionally reopen this candidate.", reason:`Candidate is ${candidate.stage}.`, evidence_gaps:gaps };
  }
  if (likelyDuplicate) {
    return { state:"duplicate_review", ready:false, next_action:`Review overlap with ${likelyDuplicate.name} before doing more research.`, reason:`Atlas found a likely ${likelyDuplicate.source} duplicate at ${Math.round(likelyDuplicate.similarity*100)}% similarity.`, evidence_gaps:gaps };
  }
  if (score >= 80 && evidence.points >= 4 && evidence.count >= 2 && gaps.filter(g => g.priority === "High").length === 0) {
    return { state:"ready_to_test", ready:true, next_action:"Promote this candidate to Researching and prepare the 30-day test.", reason:`Radar Score ${score} with ${evidence.level} evidence and no high-priority validation gaps.`, evidence_gaps:gaps };
  }
  if (evidence.points < 2 || gaps.some(g => g.key === "customer_demand")) {
    const gap = gaps.find(g => g.key === "customer_demand") || gaps[0];
    return { state:"validate_demand", ready:false, next_action:gap?.action || "Collect stronger demand evidence.", reason:`Radar Score ${score}, but evidence is only ${evidence.level}.`, evidence_gaps:gaps };
  }
  if (gaps.some(g => g.key === "market_validation")) {
    const gap = gaps.find(g => g.key === "market_validation");
    return { state:"validate_market", ready:false, next_action:gap.action, reason:"Customer interest exists, but Atlas still needs external market proof.", evidence_gaps:gaps };
  }
  if (score < 60) {
    return { state:"low_priority", ready:false, next_action:"Do not spend meaningful time on this candidate unless new evidence improves the economics.", reason:`Radar Score ${score} is below the Worth Investigating threshold.`, evidence_gaps:gaps };
  }
  const topGap = gaps[0];
  return { state:"investigate", ready:false, next_action:topGap?.action || "Collect one more strong piece of evidence and reassess.", reason:`Radar Score ${score} is promising but the candidate still has ${gaps.length} validation gap${gaps.length === 1 ? "" : "s"}.`, evidence_gaps:gaps, duplicate_note:possibleDuplicate ? `Possible overlap with ${possibleDuplicate.name}.` : "" };
}

function radarRecommendationQueue(candidates = [], opportunities = []) {
  return candidates
    .filter(item => !["Dismissed","Promoted"].includes(item.stage))
    .map(candidate => {
      const duplicateMatches = radarDuplicateMatches(candidate, candidates, opportunities, candidate.id);
      const recommendation = radarCandidateRecommendation(candidate, duplicateMatches);
      const priority = recommendation.ready ? 100 : Number(candidate.radar_score || 0) + (recommendation.state === "duplicate_review" ? 8 : 0);
      return { id:candidate.id, name:candidate.name, stage:candidate.stage, radar_score:candidate.radar_score, evidence_strength:candidate.evidence_strength, ...recommendation, priority };
    })
    .sort((a,b)=>b.priority-a.priority || Number(b.radar_score||0)-Number(a.radar_score||0));
}



function radarAutotriageConfig(env = process.env) {
  const enabled = String(env.ATLAS_RADAR_AUTOTRIAGE ?? "true").trim().toLowerCase() !== "false";
  const suppressLowPriority = String(env.ATLAS_RADAR_AUTOTRIAGE_SUPPRESS_LOW_PRIORITY ?? "true").trim().toLowerCase() !== "false";
  const suppressDuplicates = String(env.ATLAS_RADAR_AUTOTRIAGE_SUPPRESS_DUPLICATES ?? "true").trim().toLowerCase() !== "false";
  return {
    enabled,
    suppress_low_priority: suppressLowPriority,
    suppress_duplicates: suppressDuplicates,
    auto_promote: false,
    guidance: enabled
      ? "Atlas automatically classifies Radar candidates as promote, research, or suppress. Promotion and dismissal still require a deliberate action."
      : "Automatic Radar triage is disabled; recommendations remain available on demand."
  };
}

function radarAutotriageDecision(candidate = {}, candidates = [], opportunities = [], env = process.env) {
  const config = radarAutotriageConfig(env);
  const duplicateMatches = radarDuplicateMatches(candidate, candidates, opportunities, candidate.id);
  const recommendation = radarCandidateRecommendation(candidate, duplicateMatches);
  let action = "research";
  let disposition = "needs_research";
  let reason = recommendation.reason;
  let suppressed = false;

  if (["Promoted", "Dismissed"].includes(candidate.stage)) {
    action = "none";
    disposition = candidate.stage === "Promoted" ? "already_promoted" : "closed";
  } else if (recommendation.ready) {
    action = "promote";
    disposition = "ready_to_promote";
  } else if (recommendation.state === "duplicate_review" && config.suppress_duplicates) {
    action = "suppress";
    disposition = "duplicate_suppressed";
    suppressed = true;
  } else if (recommendation.state === "low_priority" && config.suppress_low_priority) {
    action = "suppress";
    disposition = "low_priority_suppressed";
    suppressed = true;
  } else if (recommendation.state === "validate_demand") {
    disposition = "research_demand";
  } else if (recommendation.state === "validate_market") {
    disposition = "research_market";
  } else {
    disposition = "research_next_gap";
  }

  return {
    action,
    disposition,
    suppressed,
    ready: Boolean(recommendation.ready),
    recommendation_state: recommendation.state,
    next_action: recommendation.next_action,
    reason,
    evaluated_at: new Date().toISOString()
  };
}

function applyRadarAutotriage(candidates = [], opportunities = [], options = {}) {
  const env = options.env || process.env;
  const config = radarAutotriageConfig(env);
  if (!config.enabled) return { config, candidates:[...candidates], decisions:[], counts:{ promote:0, research:0, suppress:0, none:0 } };
  const working = candidates.map(item => ({ ...item }));
  const decisions = [];
  const counts = { promote:0, research:0, suppress:0, none:0 };
  for (let i = 0; i < working.length; i += 1) {
    const candidate = working[i];
    const decision = radarAutotriageDecision(candidate, working, opportunities, env);
    candidate.triage = decision;
    if (!candidate.updated_at) candidate.updated_at = decision.evaluated_at;
    counts[decision.action] = (counts[decision.action] || 0) + 1;
    decisions.push({ id:candidate.id, name:candidate.name, stage:candidate.stage, radar_score:candidate.radar_score, ...decision });
  }
  return { config, candidates:working, decisions, counts };
}

function radarAutotriageStatus(candidates = [], opportunities = [], env = process.env) {
  const assessment = applyRadarAutotriage(candidates, opportunities, { env });
  const active = assessment.decisions.filter(item => !["already_promoted","closed"].includes(item.disposition));
  return {
    ...assessment.config,
    evaluated_candidates: active.length,
    counts: assessment.counts,
    top_decisions: active
      .sort((a,b) => (a.action === "promote" ? -1 : a.action === "research" ? 0 : 1) - (b.action === "promote" ? -1 : b.action === "research" ? 0 : 1) || Number(b.radar_score||0)-Number(a.radar_score||0))
      .slice(0,5)
  };
}


function radarResearchActionForCandidate(candidate = {}, candidates = [], opportunities = []) {
  const triage = candidate.triage || radarAutotriageDecision(candidate, candidates, opportunities);
  const gaps = radarEvidenceGaps(candidate);
  const previous = candidate.research_action && typeof candidate.research_action === "object" ? candidate.research_action : {};
  if (triage.action !== "research" || ["Promoted","Dismissed"].includes(candidate.stage)) {
    return { state:"not_applicable", task:"", priority:"None", gap_key:"", last_decision:previous.last_decision || null, history:Array.isArray(previous.history) ? previous.history : [] };
  }
  const gap = gaps[0] || { key:"general_validation", priority:"Medium", action:triage.next_action || "Collect one more strong piece of evidence and reassess." };
  const task = String(gap.action || triage.next_action || "Collect one more strong piece of evidence and reassess.").trim();
  const fingerprint = `${gap.key}:${task}`;
  const sameTask = previous.task_fingerprint === fingerprint;
  const state = sameTask && ["pending","deferred","completed"].includes(previous.state) ? previous.state : "pending";
  return {
    state, task, priority:String(gap.priority || "Medium"), gap_key:String(gap.key || "general_validation"),
    task_fingerprint:fingerprint, created_at:sameTask ? (previous.created_at || null) : new Date().toISOString(),
    completed_at:sameTask ? (previous.completed_at || null) : null, last_decision:sameTask ? (previous.last_decision || null) : null,
    last_decided_at:sameTask ? (previous.last_decided_at || null) : null, last_note:sameTask ? (previous.last_note || "") : "",
    history:sameTask && Array.isArray(previous.history) ? previous.history : []
  };
}

function radarResearchQueue(candidates = [], opportunities = []) {
  const queue = candidates
    .filter(candidate => !["Promoted","Dismissed"].includes(candidate.stage))
    .map(candidate => ({ candidate, action:radarResearchActionForCandidate(candidate, candidates, opportunities) }))
    .filter(item => item.action.state !== "not_applicable" && item.action.state !== "completed")
    .map(item => ({ id:item.candidate.id, name:item.candidate.name, category:item.candidate.category, radar_score:item.candidate.radar_score, evidence_strength:item.candidate.evidence_strength, research_action:item.action }))
    .sort((a,b) => {
      const pr={High:0,Medium:1,Low:2,None:3};
      const sr={pending:0,deferred:1};
      return (sr[a.research_action.state]??9)-(sr[b.research_action.state]??9) || (pr[a.research_action.priority]??9)-(pr[b.research_action.priority]??9) || Number(b.radar_score||0)-Number(a.radar_score||0);
    });
  const counts={pending:0,deferred:0,completed:0};
  candidates.forEach(candidate => { const a=radarResearchActionForCandidate(candidate,candidates,opportunities); if (counts[a.state] !== undefined) counts[a.state] += 1; });
  return { counts, queue, guidance:"Atlas turns RESEARCH triage into one concrete validation task. Completing a task records the work but does not create evidence or change portfolio status automatically." };
}

function applyRadarResearchActionReview(candidate = {}, decision = "", options = {}) {
  const normalized = String(decision || "").trim().toLowerCase();
  if (!["complete","defer","reopen"].includes(normalized)) throw new Error("Research action decision must be complete, defer, or reopen.");
  const current = options.current_action || candidate.research_action || {};
  const history = Array.isArray(current.history) ? [...current.history] : [];
  const now = options.now || new Date().toISOString();
  const event={ decision:normalized, decided_at:now, actor:String(options.actor || "user"), note:String(options.note || "").trim(), task:String(current.task || ""), priority:String(current.priority || "Medium") };
  history.push(event);
  const state = normalized === "complete" ? "completed" : normalized === "defer" ? "deferred" : "pending";
  candidate.research_action={ ...current, state, completed_at:normalized === "complete" ? now : null, last_decision:normalized, last_decided_at:now, last_note:event.note, history };
  candidate.updated_at=now;
  return { candidate, event };
}

function applyRadarEvidenceCapture(candidate = {}, input = {}, candidates = [], opportunities = [], options = {}) {
  const now = options.now || new Date().toISOString();
  const record = normalizeEvidenceRecord(input);
  if (!record.text) throw new Error("Evidence text is required.");
  const existing = Array.isArray(candidate.evidence_records) ? candidate.evidence_records : (Array.isArray(candidate.evidence) ? candidate.evidence : []);
  const normalizedExisting = existing.map(normalizeEvidenceRecord).filter(item => item.text);
  const duplicate = normalizedExisting.some(item => item.text.toLowerCase() === record.text.toLowerCase() && item.type === record.type);
  if (duplicate) throw new Error("This evidence is already recorded for the candidate.");

  const before = {
    radar_score:Number(candidate.radar_score || 0),
    evidence_strength:String(candidate.evidence_strength || "None"),
    evidence_points:Number(candidate.evidence_points || 0),
    triage_action:String(candidate.triage?.action || radarAutotriageDecision(candidate, candidates, opportunities).action || "")
  };
  const previousResearch = radarResearchActionForCandidate(candidate, candidates, opportunities);
  const updated = normalizeRadarCandidate({ ...candidate, evidence:[...normalizedExisting, record] }, candidate);
  updated.id = candidate.id;
  updated.created_at = candidate.created_at;
  updated.updated_at = now;
  updated.duplicate_matches = radarDuplicateMatches(updated, candidates, opportunities, candidate.id);
  updated.triage = radarAutotriageDecision(updated, candidates.map(item => Number(item.id) === Number(candidate.id) ? updated : item), opportunities);
  const afterResearch = radarResearchActionForCandidate(updated, candidates, opportunities);
  const history = Array.isArray(candidate.evidence_history) ? [...candidate.evidence_history] : [];
  const event = {
    added_at:now,
    actor:String(input.actor || "user"),
    record,
    linked_research_gap:String(previousResearch.gap_key || ""),
    previous_research_task:String(previousResearch.task || ""),
    before,
    after:{
      radar_score:Number(updated.radar_score || 0),
      evidence_strength:String(updated.evidence_strength || "None"),
      evidence_points:Number(updated.evidence_points || 0),
      triage_action:String(updated.triage?.action || "")
    }
  };
  history.push(event);
  updated.evidence_history = history;
  if (updated.triage?.action === "research") updated.research_action = afterResearch;
  else if (candidate.research_action) updated.research_action = candidate.research_action;
  return { candidate:updated, event };
}

function radarEvidenceCaptureStatus(candidates = [], opportunities = []) {
  const active = candidates.filter(item => !["Promoted","Dismissed"].includes(item.stage));
  const withEvidence = active.filter(item => Number(item.evidence_records?.length || item.evidence?.length || 0) > 0);
  const captured = active.reduce((sum,item)=>sum + Number(item.evidence_history?.length || 0), 0);
  return {
    active_candidates:active.length,
    candidates_with_evidence:withEvidence.length,
    evidence_events:captured,
    guidance:"Record real validation evidence, then Atlas immediately recalculates evidence strength, Radar score, triage, and the next research gap. Evidence capture never promotes a candidate by itself."
  };
}

function radarResearchAssistConfig(env = process.env) {
  const requested = String(env.ATLAS_RESEARCH_ASSIST || "false").trim().toLowerCase() === "true";
  const provider = discoveryExecutorStatus(env);
  return {
    enabled:requested,
    executable:requested && Boolean(provider.enabled),
    provider:provider.provider,
    model:provider.model || null,
    guidance:!requested
      ? "Research Assist is off by default. Enable it explicitly when you want Atlas to prepare web-research jobs for Radar evidence gaps."
      : provider.enabled
        ? "Research Assist can turn pending Radar evidence gaps into provider-ready research jobs. Findings still require explicit evidence capture."
        : "Research Assist is enabled but waiting for a configured live discovery provider."
  };
}

function radarResearchAssistQueue(candidates = [], opportunities = [], env = process.env) {
  const config = radarResearchAssistConfig(env);
  const research = radarResearchQueue(candidates, opportunities);
  const queue = research.queue.map((item, index) => {
    const candidate = candidates.find(row => Number(row.id) === Number(item.id)) || {};
    const action = item.research_action || {};
    const adapter = action.gap_key === "customer_demand"
      ? radarDiscoveryAdapterForType("community")
      : action.gap_key === "market_validation"
        ? radarDiscoveryAdapterForType("marketplace_search")
        : radarDiscoveryAdapterForType("search_trends");
    return {
      job_id:`research-${item.id}-${String(action.gap_key || "validation")}`,
      candidate_id:item.id,
      candidate_name:item.name,
      priority:index+1,
      priority_label:action.priority,
      gap_key:action.gap_key,
      task:action.task,
      query:`${item.name}: ${action.task}`,
      adapter,
      expected_evidence_types:adapter.expected_evidence_types,
      status:action.state === "deferred" ? "Deferred" : "Ready",
      intake_endpoint:`POST /api/radar/${item.id}/evidence`,
      evidence_contract:["text","type","quality","source"]
    };
  });
  return {
    ...config,
    jobs_ready:queue.filter(item => item.status === "Ready").length,
    queue,
    guidance:`${config.guidance} Atlas never converts a research result into evidence automatically; a concrete finding must be recorded through the evidence-capture workflow.`
  };
}

function radarResearchAssistJob(candidate = {}, candidates = [], opportunities = [], env = process.env) {
  const queue = radarResearchAssistQueue(candidates, opportunities, env);
  return queue.queue.find(item => Number(item.candidate_id) === Number(candidate.id)) || null;
}

function researchAssistPrompt(job = {}) {
  const types = Array.isArray(job.expected_evidence_types) && job.expected_evidence_types.length ? job.expected_evidence_types.join(", ") : "signal";
  return `You are Atlas Research Assist. Research one specific validation gap for one commercial opportunity using current web sources.

Candidate: ${job.candidate_name}
Research task: ${job.task}
Query: ${job.query}
Preferred evidence types: ${types}
Research instructions: ${job.adapter?.instructions || "Find credible current evidence relevant to the task."}

Return ONLY valid JSON with this exact shape: {"findings":[...]}. Each finding must contain text, type, quality, source, and source_url. quality must be Low, Medium, or High. Only include concrete facts supported by a source you actually found. Do not infer customer demand, sales, revenue, or market size unless the cited source supports that exact claim. Do not include opinions as facts. Return at most 5 findings.`;
}

function parseResearchAssistResult(result = {}, maxFindings = 5) {
  let text = extractOpenAIResponseText(result);
  text = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  if (!text) throw new Error("Research Assist response did not contain output text.");
  let parsed;
  try { parsed = JSON.parse(text); }
  catch { throw new Error("Research Assist response was not valid JSON."); }
  const findings = (Array.isArray(parsed?.findings) ? parsed.findings : []).slice(0, Math.max(1, Math.min(10, Number(maxFindings)||5))).map(item => ({
    text:String(item?.text || "").trim(),
    type:String(item?.type || "signal").trim().toLowerCase().replace(/\s+/g,"_"),
    quality:["Low","Medium","High"].includes(item?.quality) ? item.quality : "Medium",
    source:String(item?.source || "").trim(),
    source_url:String(item?.source_url || "").trim()
  })).filter(item => item.text && (item.source || item.source_url));
  if (!findings.length) throw new Error("Research Assist returned no source-backed findings.");
  return {
    findings,
    provider_metadata:{
      provider:"openai_web_search",
      response_id:String(result.id || ""),
      model:String(result.model || "")
    }
  };
}

async function executeResearchAssistJob(job = {}, options = {}) {
  const env = options.env || process.env;
  const config = radarResearchAssistConfig(env);
  if (!config.enabled) {
    const error = new Error("Research Assist is disabled. Set ATLAS_RESEARCH_ASSIST=true to execute targeted research.");
    error.code = "RESEARCH_ASSIST_DISABLED";
    throw error;
  }
  const provider = discoveryExecutorConfig(env);
  if (!provider.enabled) {
    const error = new Error("Research Assist requires a configured live discovery provider.");
    error.code = "RESEARCH_PROVIDER_NOT_CONFIGURED";
    throw error;
  }
  if (provider.provider !== "openai_web_search") {
    return {
      status:"Handoff required",
      findings:[],
      job,
      provider_metadata:{ provider:provider.provider },
      guidance:"This provider does not have a native Build 90 research executor. Send the research brief to the external runner and review its findings before evidence capture."
    };
  }
  const fetcher = options.fetcher || globalThis.fetch;
  if (typeof fetcher !== "function") throw new Error("No HTTP fetch implementation is available for Research Assist.");
  const apiKey = String(env.ATLAS_OPENAI_API_KEY || env.OPENAI_API_KEY || "").trim();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), provider.timeout_ms);
  try {
    const response = await fetcher(provider.endpoint, {
      method:"POST",
      headers:{ "Content-Type":"application/json", "Accept":"application/json", "Authorization":`Bearer ${apiKey}` },
      body:JSON.stringify({
        model:provider.openai.model,
        tools:[{ type:provider.openai.web_search_tool }],
        tool_choice:"auto",
        include:["web_search_call.action.sources"],
        input:researchAssistPrompt(job)
      }),
      signal:controller.signal
    });
    if (!response || !response.ok) {
      const detail=response && typeof response.text==="function" ? String(await response.text()).slice(0,500) : "";
      throw new Error(`Research Assist returned HTTP ${response?.status || "error"}${detail ? `: ${detail}` : ""}`);
    }
    const parsed=parseResearchAssistResult(await response.json(),5);
    return { status:"Completed", ...parsed, job };
  } catch (error) {
    if (error?.name === "AbortError") throw new Error(`Research Assist timed out after ${provider.timeout_ms} ms.`);
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function radarResearchFindingReview(candidate = {}, input = {}, options = {}) {
  const finding = {
    text:String(input.text || "").trim(),
    type:String(input.type || "signal").trim().toLowerCase().replace(/\s+/g,"_"),
    quality:["Low","Medium","High"].includes(input.quality) ? input.quality : "Medium",
    source:String(input.source || "").trim(),
    source_url:String(input.source_url || "").trim()
  };
  if (!finding.text || (!finding.source && !finding.source_url)) throw new Error("A source-backed finding is required.");
  const now=options.now || new Date().toISOString();
  const review={
    reviewed_at:now,
    actor:String(input.actor || "user"),
    decision:String(input.decision || "pending").trim().toLowerCase(),
    finding
  };
  if (!["pending","accept","reject"].includes(review.decision)) throw new Error("Finding decision must be pending, accept, or reject.");
  return review;
}

function radarPromotionReviewState(candidate = {}, candidates = [], opportunities = []) {
  const triage = candidate.triage || radarAutotriageDecision(candidate, candidates, opportunities);
  const previous = candidate.promotion_review && typeof candidate.promotion_review === "object" ? candidate.promotion_review : {};
  const history = Array.isArray(previous.history) ? previous.history : [];
  let state = String(previous.state || "").trim();
  if (candidate.stage === "Promoted") state = "promoted";
  else if (candidate.stage === "Dismissed") state = "closed";
  else if (triage.action !== "promote") state = "not_ready";
  else if (!["pending","deferred","rejected"].includes(state)) state = "pending";
  return {
    state,
    requires_approval: triage.action === "promote" && !["Promoted","Dismissed"].includes(candidate.stage),
    triage_action: triage.action,
    last_decision: previous.last_decision || null,
    last_decided_at: previous.last_decided_at || null,
    last_note: previous.last_note || "",
    history
  };
}

function radarPromotionQueue(candidates = [], opportunities = []) {
  const items = candidates
    .filter(candidate => !["Promoted","Dismissed"].includes(candidate.stage))
    .map(candidate => {
      const triage = candidate.triage || radarAutotriageDecision(candidate, candidates, opportunities);
      const review = radarPromotionReviewState(candidate, candidates, opportunities);
      return {
        id:candidate.id, name:candidate.name, category:candidate.category, radar_score:candidate.radar_score,
        evidence_strength:candidate.evidence_strength, triage, review,
        test_blueprint:radarTestBlueprint(candidate, radarCandidateRecommendation(candidate, radarDuplicateMatches(candidate, candidates, opportunities, candidate.id)))
      };
    })
    .filter(item => item.triage.action === "promote" && ["pending","deferred","rejected"].includes(item.review.state))
    .sort((a,b) => {
      const rank = value => value === "pending" ? 0 : value === "deferred" ? 1 : 2;
      return rank(a.review.state)-rank(b.review.state) || Number(b.radar_score||0)-Number(a.radar_score||0);
    });
  const counts = { pending:0, deferred:0, rejected:0 };
  items.forEach(item => { counts[item.review.state] = (counts[item.review.state] || 0) + 1; });
  return {
    requires_explicit_approval:true,
    counts,
    queue:items,
    guidance:"Atlas can recommend promotion, but only an explicit approval moves a Radar candidate into Researching. Deferral and rejection do not delete the candidate."
  };
}

function applyRadarPromotionReview(candidate = {}, decision = "", options = {}) {
  const normalizedDecision = String(decision || "").trim().toLowerCase();
  if (!["approve","defer","reject"].includes(normalizedDecision)) throw new Error("Promotion review decision must be approve, defer, or reject.");
  const previous = candidate.promotion_review && typeof candidate.promotion_review === "object" ? candidate.promotion_review : {};
  const history = Array.isArray(previous.history) ? [...previous.history] : [];
  const now = options.now || new Date().toISOString();
  const event = {
    decision:normalizedDecision,
    decided_at:now,
    actor:String(options.actor || "user"),
    note:String(options.note || "").trim(),
    radar_score:Number(candidate.radar_score || 0),
    triage_action:String(candidate.triage?.action || "")
  };
  history.push(event);
  candidate.promotion_review = {
    state: normalizedDecision === "approve" ? "approved" : normalizedDecision === "defer" ? "deferred" : "rejected",
    last_decision:normalizedDecision,
    last_decided_at:now,
    last_note:event.note,
    history
  };
  candidate.updated_at = now;
  return { candidate, event };
}

function radarTestBlueprint(candidate = {}, recommendation = null) {
  const rec = recommendation || radarCandidateRecommendation(candidate, []);
  const category = String(candidate.category || "Opportunity");
  const score = Number(candidate.radar_score || radarScore(candidate));
  const speed = Number(candidate.speed_to_revenue || 0);
  const costFit = Number(candidate.startup_cost_score || 0);
  const effortFit = Number(candidate.ongoing_effort_score || 0);
  const evidence = radarEvidenceStrength(candidate.evidence_records || candidate.evidence || []);
  const budget = costFit >= 8 ? 25 : costFit >= 6 ? 50 : 100;
  const launchDays = speed >= 8 ? 7 : speed >= 6 ? 14 : 21;
  const weeklyHours = effortFit >= 8 ? 2 : effortFit >= 6 ? 4 : 6;
  const offer = String(candidate.description || candidate.name || "").trim();
  const salesChannel = /digital|template|toolkit|download|printable/i.test(`${category} ${offer}`) ? "Primary digital marketplace or direct online channel" : "Fastest realistic direct-sales channel";
  const successCriteria = [
    "Generate at least one real customer transaction within 30 days.",
    "Finish the test cash-profitable before labor adjustment.",
    `Keep total test spend at or below $${budget}.`,
    "Capture customer response and enough demand evidence to make a scale/revise/kill decision."
  ];
  return {
    candidate_id: candidate.id || null,
    candidate_name: candidate.name || "",
    radar_score: score,
    ready: Boolean(rec.ready),
    objective: `Test whether ${candidate.name || "this opportunity"} can produce real customer demand and cash revenue within 30 days.`,
    offer,
    sales_channel: salesChannel,
    approved_budget: budget,
    target_launch_days: launchDays,
    weekly_hour_cap: weeklyHours,
    experiment_days: 30,
    demand_evidence: (candidate.evidence || []).join("; "),
    success_criteria: successCriteria,
    first_week_tasks: [
      "Define the minimum viable offer and exact customer.",
      `Prepare the simplest sellable version and launch through the ${salesChannel.toLowerCase()}.`,
      "Record visits/leads, customer responses, orders, revenue, expenses, and hours worked.",
      "Run the first weekly checkpoint and change only one major variable if intervention is needed."
    ],
    stop_conditions: [
      "Stop early if the offer cannot be launched within the approved budget without materially changing the opportunity.",
      "Recommend early termination if evidence becomes clearly negative and additional spend is unlikely to change the result."
    ],
    evidence_strength: evidence.level,
    source_recommendation: rec.state
  };
}

function opportunityFromRadarCandidate(candidate = {}, blueprint = null) {
  const plan = blueprint || radarTestBlueprint(candidate);
  return {
    name: candidate.name,
    category: candidate.category,
    description: candidate.description,
    revenue_model: "",
    startup_cost: 0,
    setup_time_hours: 0,
    ongoing_effort: candidate.ongoing_effort_score >= 8 ? "Low" : candidate.ongoing_effort_score >= 5 ? "Medium" : "High",
    risk: "Low",
    scalability: candidate.scalability_score >= 8 ? "High" : candidate.scalability_score >= 5 ? "Medium" : "Low",
    confidence: candidate.confidence,
    speed_to_revenue: candidate.speed_to_revenue,
    passivity: candidate.ongoing_effort_score,
    atlas_fit: candidate.atlas_fit,
    status: "Researching",
    actual_revenue: 0,
    actual_profit: 0,
    radar_origin_id: candidate.id,
    radar_test_blueprint: plan,
    atlas_score: score({confidence:candidate.confidence,speed_to_revenue:candidate.speed_to_revenue,passivity:candidate.ongoing_effort_score,atlas_fit:candidate.atlas_fit})
  };
}



function radarReviewCadence(candidate = {}, now = Date.now()) {
  const stage = String(candidate.stage || "New");
  const score = Number(candidate.radar_score || 0);
  const evidence = radarEvidenceStrength(candidate.evidence_records || candidate.evidence || []);
  const recommendation = radarCandidateRecommendation(candidate, candidate.duplicate_matches || []);
  let intervalDays = 14;
  if (recommendation.ready || stage === "Ready to Test") intervalDays = 3;
  else if (["Atlas Recommended","Worth Investigating"].includes(stage)) intervalDays = 7;
  else if (recommendation.state === "duplicate_review") intervalDays = 7;
  else if (recommendation.state === "low_priority" || score < 60) intervalDays = 30;
  if (["Dismissed","Promoted"].includes(stage)) intervalDays = 0;
  const base = Date.parse(candidate.last_reviewed_at || candidate.updated_at || candidate.created_at || new Date(now).toISOString());
  const next = intervalDays ? new Date((Number.isFinite(base)?base:now) + intervalDays*86400000).toISOString() : null;
  const daysUntil = next ? Math.ceil((Date.parse(next)-now)/86400000) : null;
  return {
    interval_days:intervalDays,
    last_reviewed_at:candidate.last_reviewed_at || "",
    next_review_at:next,
    days_until_review:daysUntil,
    due:Boolean(next && Date.parse(next) <= now),
    reason:intervalDays===3?"Ready candidates get a short review cycle so momentum is not lost.":intervalDays===7?"Promising or duplicate-review candidates are checked weekly.":intervalDays===30?"Low-priority candidates are parked on a monthly review cycle.":intervalDays===0?"Closed Radar candidates do not require recurring review.":"New candidates receive a two-week baseline review cycle."
  };
}

function radarRefreshQueue(candidates = [], opportunities = [], now = Date.now()) {
  return candidates
    .filter(item=>!["Dismissed","Promoted"].includes(item.stage))
    .map(candidate=>{
      const duplicateMatches=radarDuplicateMatches(candidate,candidates,opportunities,candidate.id);
      const recommendation=radarCandidateRecommendation(candidate,duplicateMatches);
      const cadence=radarReviewCadence({...candidate,duplicate_matches:duplicateMatches},now);
      const staleDays=Math.max(0,Math.floor((now-Date.parse(candidate.last_reviewed_at || candidate.updated_at || candidate.created_at || new Date(now).toISOString()))/86400000));
      return {id:candidate.id,name:candidate.name,stage:candidate.stage,radar_score:candidate.radar_score,evidence_strength:candidate.evidence_strength,recommendation,cadence,stale_days:staleDays};
    })
    .filter(item=>item.cadence.due)
    .sort((a,b)=>a.cadence.days_until_review-b.cadence.days_until_review || Number(b.radar_score||0)-Number(a.radar_score||0));
}

function radarPortfolioRefresh(candidates = [], opportunities = [], now = Date.now()) {
  const due=radarRefreshQueue(candidates,opportunities,now);
  const active=candidates.filter(item=>!["Dismissed","Promoted"].includes(item.stage));
  const next=active.map(candidate=>({candidate,cadence:radarReviewCadence(candidate,now)})).filter(x=>x.cadence.next_review_at).sort((a,b)=>Date.parse(a.cadence.next_review_at)-Date.parse(b.cadence.next_review_at))[0];
  return {
    generated_at:new Date(now).toISOString(),
    active_candidates:active.length,
    reviews_due:due.length,
    next_review_at:next?.cadence.next_review_at || null,
    next_candidate:next?.candidate?.name || null,
    queue:due,
    guidance:due.length?`Refresh ${due.length} Radar candidate${due.length===1?"":"s"} before adding more speculative work.`:"Radar review cadence is current."
  };
}


function normalizeDiscoverySource(input = {}) {
  const source = input && typeof input === "object" ? input : {};
  const type = String(source.type || source.source_type || "manual").trim().toLowerCase().replace(/\s+/g, "_");
  return {
    type: type || "manual",
    name: String(source.name || source.source_name || source.source || "Manual").trim() || "Manual",
    url: String(source.url || source.source_url || "").trim(),
    query: String(source.query || source.discovery_query || "").trim(),
    batch_id: String(source.batch_id || "").trim()
  };
}

function radarDiscoveryCandidate(input = {}, sourceInput = {}, previous = {}) {
  const source = normalizeDiscoverySource(sourceInput);
  const candidate = normalizeRadarCandidate({
    ...input,
    source: input.source || source.name,
    source_url: input.source_url || source.url
  }, previous);
  candidate.discovery = {
    source_type: source.type,
    source_name: source.name,
    source_url: source.url,
    discovery_query: source.query,
    batch_id: source.batch_id,
    discovered_at: String(input.discovered_at || previous.discovery?.discovered_at || new Date().toISOString())
  };
  return candidate;
}

function radarSourcePerformance(candidates = [], opportunities = []) {
  const opportunityByRadarId = new Map(
    opportunities
      .filter(item => item.radar_origin_id != null)
      .map(item => [String(item.radar_origin_id), item])
  );
  const groups = new Map();
  for (const candidate of candidates) {
    const discovery = candidate.discovery || {};
    const key = `${discovery.source_type || "manual"}::${discovery.source_name || candidate.source || "Manual"}`;
    if (!groups.has(key)) groups.set(key, {
      source_type: discovery.source_type || "manual",
      source_name: discovery.source_name || candidate.source || "Manual",
      candidates: 0,
      active: 0,
      ready: 0,
      promoted: 0,
      dismissed: 0,
      total_score: 0,
      revenue: 0,
      profit: 0,
      last_discovered_at: ""
    });
    const row = groups.get(key);
    row.candidates += 1;
    row.total_score += Number(candidate.radar_score || 0);
    if (!["Dismissed","Promoted"].includes(candidate.stage)) row.active += 1;
    if (candidate.stage === "Ready to Test") row.ready += 1;
    if (candidate.stage === "Promoted") row.promoted += 1;
    if (candidate.stage === "Dismissed") row.dismissed += 1;
    const opportunity = opportunityByRadarId.get(String(candidate.id));
    if (opportunity) {
      row.revenue += Number(opportunity.actual_revenue || 0);
      row.profit += Number(opportunity.actual_profit || 0);
    }
    const discoveredAt = discovery.discovered_at || candidate.created_at || "";
    if (discoveredAt && (!row.last_discovered_at || discoveredAt > row.last_discovered_at)) row.last_discovered_at = discoveredAt;
  }
  return [...groups.values()].map(row => {
    const promotionRate = row.candidates ? row.promoted / row.candidates : 0;
    const readyRate = row.candidates ? (row.ready + row.promoted) / row.candidates : 0;
    const dismissalRate = row.candidates ? row.dismissed / row.candidates : 0;
    const averageScore = row.candidates ? row.total_score / row.candidates : 0;
    const yieldScore = Math.max(0, Math.min(100, Math.round(
      averageScore * 0.45 +
      promotionRate * 100 * 0.25 +
      readyRate * 100 * 0.20 +
      (1 - dismissalRate) * 100 * 0.10
    )));
    return {
      source_type: row.source_type,
      source_name: row.source_name,
      candidates: row.candidates,
      active: row.active,
      ready: row.ready,
      promoted: row.promoted,
      dismissed: row.dismissed,
      average_radar_score: Math.round(averageScore * 10) / 10,
      promotion_rate_pct: Math.round(promotionRate * 100),
      ready_or_promoted_rate_pct: Math.round(readyRate * 100),
      dismissal_rate_pct: Math.round(dismissalRate * 100),
      revenue: Number(row.revenue.toFixed(2)),
      profit: Number(row.profit.toFixed(2)),
      yield_score: yieldScore,
      last_discovered_at: row.last_discovered_at
    };
  }).sort((a,b)=>b.yield_score-a.yield_score || b.candidates-a.candidates || a.source_name.localeCompare(b.source_name));
}


const RADAR_DISCOVERY_SOURCE_PROFILES = [
  {
    source_type:"marketplace_search",
    source_name:"Marketplace Demand",
    purpose:"Find products, templates, services, or listings showing active buyer demand.",
    default_interval_days:7,
    suggested_queries:["best-selling niche products","underserved digital products","hospitality templates"]
  },
  {
    source_type:"search_trends",
    source_name:"Search & Trend Signals",
    purpose:"Find rising demand, recurring questions, and commercial search behavior.",
    default_interval_days:7,
    suggested_queries:["rising buyer intent","growing how-to demand","emerging service demand"]
  },
  {
    source_type:"community",
    source_name:"Community Pain Points",
    purpose:"Find repeated complaints, requests, and unmet needs from real users.",
    default_interval_days:7,
    suggested_queries:["people asking for a solution","repeated workflow complaints","what users wish existed"]
  },
  {
    source_type:"local_business",
    source_name:"Local Opportunity Scan",
    purpose:"Find local service gaps, poorly served business needs, and easy-to-test offers.",
    default_interval_days:14,
    suggested_queries:["local service gaps","small business operational pain points","under-served local demand"]
  },
  {
    source_type:"ai_automation",
    source_name:"AI & Automation Opportunities",
    purpose:"Find repetitive work that can be turned into automated products or services.",
    default_interval_days:14,
    suggested_queries:["manual business workflows","AI-assisted service opportunities","automation-friendly small business tasks"]
  }
];

function radarDiscoveryCadenceForSource(source = {}) {
  const yieldScore = Number(source.yield_score || 0);
  const samples = Number(source.candidates || 0);
  const readyRate = Number(source.ready_or_promoted_rate_pct || 0);
  const dismissalRate = Number(source.dismissal_rate_pct || 0);
  if (!samples) return { interval_days:7, mode:"Explore", reason:"No source history yet; gather an initial sample before judging source quality." };
  if (samples < 3) return { interval_days:7, mode:"Explore", reason:"Source has too little evidence to exploit or deprioritize confidently." };
  if (yieldScore >= 75 || readyRate >= 50) return { interval_days:3, mode:"Exploit", reason:"Source is producing unusually strong candidates and deserves a tighter discovery cycle." };
  if (yieldScore >= 55 && dismissalRate < 60) return { interval_days:7, mode:"Maintain", reason:"Source is producing useful candidates at a reasonable quality level." };
  if (yieldScore >= 35) return { interval_days:14, mode:"Probe", reason:"Source is mixed; keep testing it at a reduced cadence." };
  return { interval_days:30, mode:"Hold", reason:"Source quality is weak enough to conserve discovery effort." };
}

function radarDiscoverySourceController(candidates = [], opportunities = [], now = Date.now()) {
  const performance = radarSourcePerformance(candidates, opportunities);
  const observed = new Map(performance.map(item => [item.source_type, item]));
  const plan = RADAR_DISCOVERY_SOURCE_PROFILES.map(profile => {
    const perf = observed.get(profile.source_type) || {
      source_type:profile.source_type,
      source_name:profile.source_name,
      candidates:0, active:0, ready:0, promoted:0, dismissed:0,
      average_radar_score:0, promotion_rate_pct:0, ready_or_promoted_rate_pct:0,
      dismissal_rate_pct:0, revenue:0, profit:0, yield_score:0, last_discovered_at:""
    };
    const cadence = radarDiscoveryCadenceForSource(perf);
    const last = perf.last_discovered_at ? Date.parse(perf.last_discovered_at) : null;
    const nextRunAt = last ? new Date(last + cadence.interval_days*86400000).toISOString() : new Date(now).toISOString();
    const due = !last || Date.parse(nextRunAt) <= now;
    const ageDays = last ? Math.max(0, Math.floor((now-last)/86400000)) : null;
    const explorationBoost = perf.candidates < 3 ? 18 : 0;
    const staleBoost = due ? 12 : 0;
    const performanceWeight = Number(perf.yield_score || 0) * 0.7;
    const modeWeight = cadence.mode === "Exploit" ? 20 : cadence.mode === "Maintain" ? 12 : cadence.mode === "Explore" ? 10 : cadence.mode === "Probe" ? 5 : 0;
    const priorityScore = Math.round(Math.min(100, performanceWeight + explorationBoost + staleBoost + modeWeight));
    return {
      ...profile,
      performance:perf,
      cadence,
      last_discovered_at:perf.last_discovered_at || null,
      next_run_at:nextRunAt,
      due,
      age_days:ageDays,
      priority_score:priorityScore
    };
  }).sort((a,b)=>Number(b.due)-Number(a.due) || b.priority_score-a.priority_score || a.source_name.localeCompare(b.source_name));

  const dueSources = plan.filter(item=>item.due && item.cadence.mode !== "Hold");
  const next = dueSources[0] || plan[0] || null;
  return {
    generated_at:new Date(now).toISOString(),
    source_count:plan.length,
    sources_due:dueSources.length,
    next_source:next,
    plan,
    guidance:next
      ? `Run ${next.source_name} next in ${next.cadence.mode.toLowerCase()} mode.`
      : "No discovery source is currently scheduled."
  };
}


function radarDiscoveryAdapterForType(sourceType = "") {
  const type = String(sourceType || "").trim().toLowerCase();
  const adapters = {
    marketplace_search: {
      adapter_key:"marketplace_search",
      execution_kind:"external_search",
      expected_evidence_types:["marketplace_activity","competitor_sales","marketplace_sales"],
      instructions:"Search active marketplaces for buyer demand, competitive listings, pricing, and evidence of real sales or listing activity."
    },
    search_trends: {
      adapter_key:"search_trends",
      execution_kind:"external_search",
      expected_evidence_types:["search_activity","comparable_product"],
      instructions:"Search current web and trend signals for rising buyer intent, recurring commercial queries, and growing demand."
    },
    community: {
      adapter_key:"community_pain_points",
      execution_kind:"external_search",
      expected_evidence_types:["direct_customer_request","customer_request","survey_interest","interview_interest"],
      instructions:"Search current community discussions for repeated requests, complaints, pain points, and unmet needs."
    },
    local_business: {
      adapter_key:"local_business_scan",
      execution_kind:"external_local_search",
      expected_evidence_types:["direct_customer_request","marketplace_activity","competitor_sales"],
      instructions:"Search local businesses and service categories for obvious service gaps, weak competition, or recurring operational needs."
    },
    ai_automation: {
      adapter_key:"ai_automation_scan",
      execution_kind:"external_search",
      expected_evidence_types:["search_activity","customer_request","comparable_product"],
      instructions:"Search for repetitive business workflows and emerging AI capabilities that can be packaged into a product or service."
    }
  };
  return adapters[type] || {
    adapter_key:type || "generic_search",
    execution_kind:"external_search",
    expected_evidence_types:["signal"],
    instructions:"Search current external sources for credible evidence of customer demand and revenue potential."
  };
}

function radarDiscoveryJobPlan(candidates = [], opportunities = [], now = Date.now(), limit = 5) {
  const controller = radarDiscoverySourceController(candidates, opportunities, now);
  const safeLimit = Math.max(1, Math.min(10, Number(limit) || 5));
  const dueSources = controller.plan.filter(item => item.due && item.cadence.mode !== "Hold");
  const selected = dueSources.slice(0, safeLimit);
  const jobs = selected.map((source, index) => {
    const adapter = radarDiscoveryAdapterForType(source.source_type);
    const queries = Array.isArray(source.suggested_queries) && source.suggested_queries.length ? source.suggested_queries : [source.purpose || source.source_name];
    const historicalCount = Number(source.performance?.candidates || 0);
    const query = queries[historicalCount % queries.length];
    const batchId = `discovery-${new Date(now).toISOString().slice(0,10)}-${source.source_type}-${index+1}`;
    return {
      job_id:batchId,
      status:"Planned",
      priority:index+1,
      priority_score:source.priority_score,
      source_type:source.source_type,
      source_name:source.source_name,
      mode:source.cadence.mode,
      query,
      purpose:source.purpose,
      adapter,
      source:{
        type:source.source_type,
        name:source.source_name,
        query,
        batch_id:batchId
      },
      max_candidates:source.cadence.mode === "Exploit" ? 10 : source.cadence.mode === "Maintain" ? 8 : 5,
      intake_endpoint:"POST /api/radar/discoveries",
      intake_contract:{
        source:"Use this job's source object.",
        candidates:["name","category","description","evidence","income_potential","speed_to_revenue","startup_cost_score","ongoing_effort_score","scalability_score","automation_potential","atlas_fit","confidence"]
      },
      expected_evidence_types:adapter.expected_evidence_types,
      planned_at:new Date(now).toISOString()
    };
  });
  return {
    generated_at:new Date(now).toISOString(),
    jobs_ready:jobs.length,
    jobs,
    controller_summary:{
      sources_due:controller.sources_due,
      next_source:controller.next_source?.source_name || null,
      guidance:controller.guidance
    },
    execution_note:jobs.length
      ? "Jobs are executable specifications. Atlas can run them through a configured live provider or hand them to an external discovery runner."
      : "No discovery jobs are due."
  };
}


function discoveryExecutorConfig(env = process.env) {
  const requestedProvider = String(env.ATLAS_DISCOVERY_PROVIDER || "auto").trim().toLowerCase();
  const httpEndpoint = String(env.ATLAS_DISCOVERY_HTTP_URL || "").trim();
  const httpToken = String(env.ATLAS_DISCOVERY_HTTP_TOKEN || "").trim();
  const openaiApiKey = String(env.ATLAS_OPENAI_API_KEY || env.OPENAI_API_KEY || "").trim();
  const openaiModel = String(env.ATLAS_OPENAI_MODEL || "").trim();
  const openaiEndpoint = String(env.ATLAS_OPENAI_RESPONSES_URL || "https://api.openai.com/v1/responses").trim();
  const openaiWebTool = String(env.ATLAS_OPENAI_WEB_SEARCH_TOOL || "web_search_preview").trim() || "web_search_preview";
  const timeout = Math.max(3000, Math.min(120000, Number(env.ATLAS_DISCOVERY_HTTP_TIMEOUT_MS || 30000) || 30000));

  const httpReady = Boolean(httpEndpoint);
  const openaiReady = Boolean(openaiApiKey && openaiModel);
  let provider = "external_handoff";
  if (requestedProvider === "http_json") provider = httpReady ? "http_json" : "external_handoff";
  else if (requestedProvider === "openai") provider = openaiReady ? "openai_web_search" : "external_handoff";
  else if (httpReady) provider = "http_json";
  else if (openaiReady) provider = "openai_web_search";

  return {
    requested_provider: requestedProvider,
    provider,
    enabled: provider !== "external_handoff",
    endpoint: provider === "http_json" ? httpEndpoint : provider === "openai_web_search" ? openaiEndpoint : "",
    token_configured: provider === "http_json" ? Boolean(httpToken) : provider === "openai_web_search" ? Boolean(openaiApiKey) : false,
    timeout_ms: timeout,
    openai: {
      configured: openaiReady,
      model: openaiModel,
      web_search_tool: openaiWebTool,
      endpoint: openaiEndpoint
    },
    http_json: {
      configured: httpReady,
      endpoint: httpEndpoint,
      token_configured: Boolean(httpToken)
    }
  };
}

function discoveryExecutorStatus(env = process.env) {
  const config = discoveryExecutorConfig(env);
  const guidance = config.provider === "openai_web_search"
    ? `OpenAI web discovery is configured with ${config.openai.model}. Atlas can research the current web and ingest normalized candidates directly.`
    : config.provider === "http_json"
      ? "Live HTTP discovery execution is configured. Atlas can send a planned job to the HTTP adapter and ingest returned candidates in one run."
      : config.requested_provider === "openai"
        ? "OpenAI discovery was requested but is not ready. Set ATLAS_OPENAI_API_KEY (or OPENAI_API_KEY) and ATLAS_OPENAI_MODEL."
        : config.requested_provider === "http_json"
          ? "HTTP discovery was requested but ATLAS_DISCOVERY_HTTP_URL is not set. Atlas will use external handoff mode."
          : "No live discovery provider is configured. Atlas will continue producing external handoffs until an HTTP adapter or OpenAI web-search provider is configured.";
  return {
    provider: config.provider,
    enabled: config.enabled,
    token_configured: config.token_configured,
    timeout_ms: config.timeout_ms,
    mode: config.provider === "openai_web_search" ? "live_openai_web_search" : config.enabled ? "live_http" : "external_handoff",
    model: config.provider === "openai_web_search" ? config.openai.model : null,
    web_search_tool: config.provider === "openai_web_search" ? config.openai.web_search_tool : null,
    available_providers: {
      http_json: config.http_json.configured,
      openai_web_search: config.openai.configured
    },
    guidance
  };
}


function autonomousDiscoveryConfig(env = process.env) {
  const enabled = String(env.ATLAS_DISCOVERY_AUTORUN || "").trim().toLowerCase() === "true";
  const intervalMinutes = Math.max(60, Math.min(1440, Number(env.ATLAS_DISCOVERY_AUTORUN_INTERVAL_MINUTES || 60) || 60));
  const cooldownHours = Math.max(1, Math.min(168, Number(env.ATLAS_DISCOVERY_AUTORUN_COOLDOWN_HOURS || 24) || 24));
  const maxJobsPerCycle = Math.max(1, Math.min(5, Number(env.ATLAS_DISCOVERY_AUTORUN_MAX_JOBS || 1) || 1));
  const provider = discoveryExecutorConfig(env);
  return {
    enabled,
    executable: enabled && provider.enabled,
    interval_minutes: intervalMinutes,
    cooldown_hours: cooldownHours,
    max_jobs_per_cycle: maxJobsPerCycle,
    provider: provider.provider
  };
}

function autonomousDiscoveryStatus(env = process.env, runs = readDiscoveryRuns()) {
  const config = autonomousDiscoveryConfig(env);
  const last = [...runs].reverse().find(run => run.autonomous === true) || null;
  return {
    ...config,
    last_run_at: last?.completed_at || last?.started_at || null,
    last_status: last?.status || null,
    last_source: last?.source?.name || last?.source?.type || null,
    guidance: !config.enabled
      ? "Autonomous discovery is off. Set ATLAS_DISCOVERY_AUTORUN=true to let Atlas execute due discovery jobs automatically."
      : !config.executable
        ? "Autonomous discovery is enabled, but no live discovery provider is configured."
        : `Atlas checks for due discovery work every ${config.interval_minutes} minutes and executes up to ${config.max_jobs_per_cycle} job${config.max_jobs_per_cycle === 1 ? "" : "s"} per cycle.`
  };
}

function autonomousDiscoveryEligibleJobs(candidates = [], opportunities = [], runs = [], now = Date.now(), env = process.env) {
  const config = autonomousDiscoveryConfig(env);
  const plan = radarDiscoveryJobPlan(candidates, opportunities, now, 10);
  const cutoff = now - config.cooldown_hours * 60 * 60 * 1000;
  const recent = (Array.isArray(runs) ? runs : []).filter(run => {
    const stamp = Date.parse(run.completed_at || run.started_at || "");
    return Number.isFinite(stamp) && stamp >= cutoff;
  });
  const jobs = plan.jobs.filter(job => !recent.some(run => {
    const sameSource = String(run.source?.type || "") === String(job.source?.type || job.source_type || "");
    const sameQuery = String(run.query || "").trim().toLowerCase() === String(job.query || "").trim().toLowerCase();
    return sameSource && sameQuery;
  }));
  return { config, plan, jobs: jobs.slice(0, config.max_jobs_per_cycle), suppressed_by_cooldown: Math.max(0, plan.jobs.length - jobs.length) };
}

let autonomousDiscoveryCycleRunning = false;
async function runAutonomousDiscoveryCycle(options = {}) {
  const env = options.env || process.env;
  const now = Number(options.now || Date.now());
  const config = autonomousDiscoveryConfig(env);
  if (!config.enabled) return { status:"Disabled", executed:0, accepted:0, failed:0 };
  if (!config.executable) return { status:"Provider unavailable", executed:0, accepted:0, failed:0 };
  if (autonomousDiscoveryCycleRunning) return { status:"Already running", executed:0, accepted:0, failed:0 };
  autonomousDiscoveryCycleRunning = true;
  try {
    const eligible = autonomousDiscoveryEligibleJobs(readRadar(), readData(), readDiscoveryRuns(), now, env);
    if (!eligible.jobs.length) return { status:"No eligible jobs", executed:0, accepted:0, failed:0, suppressed_by_cooldown:eligible.suppressed_by_cooldown };
    let executed = 0, accepted = 0, failed = 0;
    const results = [];
    for (const job of eligible.jobs) {
      const run = { ...radarDiscoveryRunStart(job, now), autonomous:true };
      let runs = [...readDiscoveryRuns(), run].slice(-200);
      writeDiscoveryRuns(runs);
      executed += 1;
      try {
        const result = await executeDiscoveryJob(job, { env, fetcher:options.fetcher });
        const opportunities = readData();
        const batch = radarDiscoveryBatch(result.candidates, run.source || {}, readRadar(), opportunities, { allow_duplicates:false, env });
        if (batch.accepted.length) {
          const triaged = applyRadarAutotriage(batch.candidates, opportunities, { env });
          writeRadar(triaged.candidates);
        }
        const completed = radarDiscoveryRunComplete(run, result, batch, Date.now());
        completed.autonomous = true;
        completed.provider_metadata = result.provider_metadata || {};
        accepted += batch.accepted.length;
        runs = readDiscoveryRuns();
        const index = runs.findIndex(item => item.run_id === run.run_id);
        if (index >= 0) runs[index] = completed; else runs.push(completed);
        writeDiscoveryRuns(runs.slice(-200));
        results.push(completed);
      } catch (error) {
        failed += 1;
        const completed = radarDiscoveryRunComplete(run, { status:"Failed", error:error.message }, null, Date.now());
        completed.autonomous = true;
        runs = readDiscoveryRuns();
        const index = runs.findIndex(item => item.run_id === run.run_id);
        if (index >= 0) runs[index] = completed; else runs.push(completed);
        writeDiscoveryRuns(runs.slice(-200));
        results.push(completed);
      }
    }
    return { status:failed === executed ? "Failed" : "Completed", executed, accepted, failed, results };
  } finally {
    autonomousDiscoveryCycleRunning = false;
  }
}

function radarDiscoveryRunnerAdapter(job = {}, env = process.env) {
  const adapter = job.adapter || radarDiscoveryAdapterForType(job.source_type);
  const config = discoveryExecutorConfig(env);
  return {
    adapter_key: adapter.adapter_key || "generic_search",
    execution_kind: adapter.execution_kind || "external_search",
    execution_mode: config.provider === "openai_web_search" ? "live_openai_web_search" : config.enabled ? "live_http" : "external_handoff",
    executable_in_process: config.enabled,
    provider: config.provider,
    instructions: adapter.instructions || "Execute the discovery query with an external provider and return normalized candidates.",
    completion_endpoint: "POST /api/radar/discovery-runs/:id/complete"
  };
}

function discoveryJobPayload(job = {}) {
  return {
    job_id: job.job_id || "",
    source_type: job.source_type || "",
    source_name: job.source_name || "",
    query: job.query || "",
    purpose: job.purpose || "",
    max_candidates: Math.max(1, Math.min(50, Number(job.max_candidates || 5) || 5)),
    expected_evidence_types: Array.isArray(job.expected_evidence_types) ? job.expected_evidence_types : [],
    instructions: job.adapter?.instructions || radarDiscoveryAdapterForType(job.source_type).instructions || "",
    source: job.source || {}
  };
}

function openAIDiscoveryPrompt(payload = {}) {
  const evidenceTypes = payload.expected_evidence_types.length ? payload.expected_evidence_types.join(", ") : "signal";
  return `You are Atlas Opportunity Radar, a commercial opportunity researcher. Use current web research to execute this discovery job.\n\nQuery: ${payload.query}\nPurpose: ${payload.purpose}\nSource type: ${payload.source_type}\nInstructions: ${payload.instructions}\nMaximum candidates: ${payload.max_candidates}\nPreferred evidence types: ${evidenceTypes}\n\nReturn ONLY valid JSON with this exact top-level shape: {"candidates":[...],"raw_result_count":number}. Each candidate must contain: name, category, description, source, source_url, evidence, income_potential, speed_to_revenue, startup_cost_score, ongoing_effort_score, scalability_score, automation_potential, atlas_fit, confidence, notes. Evidence must be an array of objects with text, type, quality, and source. Scores are integers from 1 to 10. Evidence must be grounded in sources you actually found; do not invent sales figures or demand claims. Prefer concrete, testable, low-cost opportunities and distinct candidates rather than near-duplicates.`;
}

function extractOpenAIResponseText(result = {}) {
  if (typeof result.output_text === "string" && result.output_text.trim()) return result.output_text.trim();
  const chunks = [];
  for (const item of Array.isArray(result.output) ? result.output : []) {
    if (item?.type !== "message") continue;
    for (const content of Array.isArray(item.content) ? item.content : []) {
      if ((content?.type === "output_text" || content?.type === "text") && typeof content.text === "string") chunks.push(content.text);
    }
  }
  return chunks.join("\n").trim();
}

function parseOpenAIDiscoveryResult(result = {}, maxCandidates = 5) {
  let text = extractOpenAIResponseText(result);
  text = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  if (!text) throw new Error("OpenAI discovery response did not contain output text.");
  let parsed;
  try { parsed = JSON.parse(text); }
  catch { throw new Error("OpenAI discovery response was not valid JSON."); }
  const candidates = Array.isArray(parsed?.candidates) ? parsed.candidates.slice(0, maxCandidates) : [];
  if (!candidates.length) throw new Error("OpenAI discovery returned no candidates.");
  const sources = [];
  for (const item of Array.isArray(result.output) ? result.output : []) {
    if (item?.type !== "web_search_call") continue;
    for (const source of Array.isArray(item?.action?.sources) ? item.action.sources : []) {
      const url = String(source?.url || "").trim();
      if (url && !sources.some(existing => existing.url === url)) sources.push({ title:String(source?.title || "").trim(), url });
    }
  }
  return {
    status:"Completed",
    candidates,
    raw_result_count:Math.max(candidates.length, Number(parsed.raw_result_count || candidates.length) || candidates.length),
    provider_metadata:{ provider:"openai_web_search", response_id:String(result.id || ""), model:String(result.model || ""), web_sources:sources.slice(0,25) }
  };
}

async function executeDiscoveryJob(job = {}, options = {}) {
  const env = options.env || process.env;
  const config = discoveryExecutorConfig(env);
  if (!config.enabled) {
    const error = new Error("Live discovery provider is not configured. Configure an HTTP adapter, configure OpenAI web search, or use external handoff mode.");
    error.code = "DISCOVERY_ADAPTER_NOT_CONFIGURED";
    throw error;
  }
  const fetcher = options.fetcher || globalThis.fetch;
  if (typeof fetcher !== "function") throw new Error("No HTTP fetch implementation is available for live discovery.");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.timeout_ms);
  const payload = discoveryJobPayload(job);
  try {
    if (config.provider === "openai_web_search") {
      const apiKey = String(env.ATLAS_OPENAI_API_KEY || env.OPENAI_API_KEY || "").trim();
      const headers = { "Content-Type":"application/json", "Accept":"application/json", "Authorization":`Bearer ${apiKey}` };
      const requestBody = {
        model: config.openai.model,
        tools: [{ type: config.openai.web_search_tool }],
        tool_choice: "auto",
        include: ["web_search_call.action.sources"],
        input: openAIDiscoveryPrompt(payload)
      };
      const response = await fetcher(config.endpoint, { method:"POST", headers, body:JSON.stringify(requestBody), signal:controller.signal });
      if (!response || !response.ok) {
        const detail = response && typeof response.text === "function" ? String(await response.text()).slice(0,500) : "";
        throw new Error(`OpenAI discovery returned HTTP ${response?.status || "error"}${detail ? `: ${detail}` : ""}`);
      }
      return parseOpenAIDiscoveryResult(await response.json(), payload.max_candidates);
    }

    const headers = { "Content-Type":"application/json", "Accept":"application/json" };
    if (config.token_configured) headers.Authorization = `Bearer ${String(env.ATLAS_DISCOVERY_HTTP_TOKEN).trim()}`;
    const response = await fetcher(config.endpoint, { method:"POST", headers, body:JSON.stringify(payload), signal:controller.signal });
    if (!response || !response.ok) {
      const detail = response && typeof response.text === "function" ? String(await response.text()).slice(0,500) : "";
      throw new Error(`Discovery adapter returned HTTP ${response?.status || "error"}${detail ? `: ${detail}` : ""}`);
    }
    const result = await response.json();
    const candidates = Array.isArray(result?.candidates) ? result.candidates.slice(0, payload.max_candidates) : [];
    if (!candidates.length) throw new Error("Discovery adapter returned no candidates.");
    return {
      status:"Completed",
      candidates,
      raw_result_count:Math.max(candidates.length, Number(result.raw_result_count || candidates.length) || candidates.length),
      provider_metadata: result.provider_metadata && typeof result.provider_metadata === "object" ? result.provider_metadata : {}
    };
  } catch (error) {
    if (error?.name === "AbortError") throw new Error(`Discovery provider timed out after ${config.timeout_ms} ms.`);
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function radarDiscoveryRunStart(job = {}, now = Date.now()) {
  const startedAt = new Date(now).toISOString();
  const runner = radarDiscoveryRunnerAdapter(job);
  return {
    run_id: `run-${crypto.randomUUID()}`,
    job_id: job.job_id || "",
    status: "Running",
    adapter_key: runner.adapter_key,
    execution_kind: runner.execution_kind,
    execution_mode: runner.execution_mode,
    source: job.source || {},
    query: job.query || "",
    max_candidates: Number(job.max_candidates || 5),
    expected_evidence_types: Array.isArray(job.expected_evidence_types) ? job.expected_evidence_types : [],
    started_at: startedAt,
    completed_at: null,
    raw_result_count: 0,
    normalized_count: 0,
    accepted_count: 0,
    skipped_count: 0,
    error: null,
    handoff: {
      adapter_key: runner.adapter_key,
      execution_kind: runner.execution_kind,
      instructions: runner.instructions,
      query: job.query || "",
      source: job.source || {},
      max_candidates: Number(job.max_candidates || 5),
      expected_evidence_types: Array.isArray(job.expected_evidence_types) ? job.expected_evidence_types : [],
      completion_endpoint: runner.completion_endpoint.replace(":id", "<run-id>")
    }
  };
}

function radarDiscoveryRunComplete(run = {}, input = {}, batch = null, now = Date.now()) {
  const items = Array.isArray(input.candidates) ? input.candidates : [];
  const skipped = Array.isArray(batch?.skipped) ? batch.skipped.length : Number(input.skipped_count || 0);
  return {
    ...run,
    status: input.status === "Failed" ? "Failed" : input.status === "Skipped" ? "Skipped" : "Completed",
    completed_at: new Date(now).toISOString(),
    raw_result_count: Math.max(0, Number(input.raw_result_count ?? items.length) || 0),
    normalized_count: items.length,
    accepted_count: Array.isArray(batch?.accepted) ? batch.accepted.length : 0,
    skipped_count: skipped,
    error: input.error ? String(input.error).slice(0,1000) : null
  };
}

function radarDiscoveryRunSummary(runs = []) {
  const recent = [...runs].slice(-50).reverse();
  const completed = recent.filter(run=>run.status === "Completed");
  return {
    run_count: recent.length,
    running: recent.filter(run=>run.status === "Running").length,
    completed: completed.length,
    failed: recent.filter(run=>run.status === "Failed").length,
    skipped: recent.filter(run=>run.status === "Skipped").length,
    accepted_candidates: completed.reduce((sum,run)=>sum+Number(run.accepted_count||0),0),
    runs: recent
  };
}

function radarDiscoveryBatch(items = [], sourceInput = {}, candidates = [], opportunities = [], options = {}) {
  const source = normalizeDiscoverySource(sourceInput);
  const accepted = [];
  const skipped = [];
  const working = [...candidates];
  for (const raw of Array.isArray(items) ? items.slice(0, 50) : []) {
    const candidate = radarDiscoveryCandidate(raw, source);
    if (!candidate.name || !candidate.category || !candidate.description) {
      skipped.push({ name:candidate.name || "(unnamed)", reason:"Missing name, category, or description.", duplicate_matches:[] });
      continue;
    }
    const duplicateMatches = radarDuplicateMatches(candidate, working, opportunities);
    const likely = duplicateMatches.find(item => item.level === "Likely duplicate");
    if (likely && !options.allow_duplicates) {
      skipped.push({ name:candidate.name, reason:`Likely duplicate of ${likely.name}.`, duplicate_matches:duplicateMatches });
      continue;
    }
    candidate.duplicate_matches = duplicateMatches;
    candidate.id = working.reduce((max,item)=>Math.max(max,Number(item.id)||0),0)+1;
    candidate.created_at = candidate.discovery.discovered_at || new Date().toISOString();
    candidate.updated_at = candidate.created_at;
    working.push(candidate);
    candidate.triage = radarAutotriageDecision(candidate, working, opportunities, options.env || process.env);
    accepted.push(candidate);
  }
  return {
    source,
    accepted,
    skipped,
    summary: {
      submitted: Array.isArray(items) ? Math.min(items.length, 50) : 0,
      accepted: accepted.length,
      skipped: skipped.length,
      likely_duplicates_skipped: skipped.filter(item => item.duplicate_matches?.some(match=>match.level==="Likely duplicate")).length
    },
    candidates: working
  };
}

function radarOperatingBrief(candidates = [], opportunities = [], now = Date.now()) {
  const queue = radarRecommendationQueue(candidates, opportunities);
  const summary = radarSummary(candidates);
  const active = candidates.filter(item => !["Dismissed","Promoted"].includes(item.stage));
  const ready = queue.filter(item => item.ready);
  const demand = queue.filter(item => item.state === "validate_demand");
  const market = queue.filter(item => item.state === "validate_market");
  const duplicates = queue.filter(item => item.state === "duplicate_review");
  const low = queue.filter(item => item.state === "low_priority");
  const top = queue[0] || null;
  let headline = "Opportunity Radar is clear.";
  let action = "Add or discover new money-making candidates.";
  if (top) {
    headline = ready.length ? `${ready.length} Radar candidate${ready.length===1?" is":"s are"} ready to advance.` : `${active.length} active Radar candidate${active.length===1?"":"s"} under evaluation.`;
    action = top.next_action;
  }
  return {
    generated_at:new Date(now).toISOString(),
    headline,
    action,
    counts:{
      total:candidates.length,
      active:active.length,
      ready_to_advance:ready.length,
      validate_demand:demand.length,
      validate_market:market.length,
      duplicate_review:duplicates.length,
      low_priority:low.length
    },
    top_candidate:top,
    ready_candidates:ready.slice(0,3),
    validation_queue:queue.filter(item=>["validate_demand","validate_market","investigate"].includes(item.state)).slice(0,5),
    duplicate_queue:duplicates.slice(0,3),
    summary
  };
}

function atlasUnifiedNextMoves(opportunities = [], candidates = [], now = Date.now(), limit = 5) {
  const portfolio = commandCenter(opportunities, now);
  const radarQueue = radarRecommendationQueue(candidates, opportunities);
  const portfolioMoves = (portfolio.attention || []).map(item => ({
    source:"portfolio", id:item.id, name:item.name, priority:item.priority,
    priority_score:item.priority==="Urgent"?120:item.priority==="High"?105:item.priority==="Medium"?85:70,
    action:item.action, reason:item.reason || `${item.status} opportunity needs portfolio attention.`, due_date:item.due_date || ""
  }));
  const radarMoves = radarQueue.map(item => ({
    source:"radar", id:item.id, name:item.name,
    priority:item.ready?"High":item.state==="duplicate_review"?"High":"Medium",
    priority_score:item.ready?100:item.state==="duplicate_review"?92:Math.min(89,Math.max(50,Number(item.radar_score||0))),
    action:item.next_action, reason:item.reason, due_date:"", radar_state:item.state
  }));
  const combined=[...portfolioMoves,...radarMoves].sort((a,b)=>b.priority_score-a.priority_score || String(a.name).localeCompare(String(b.name))).slice(0,limit);
  return {
    generated_at:new Date(now).toISOString(),
    headline:combined.length?`Atlas has ${combined.length} priority move${combined.length===1?"":"s"} across portfolio and Radar.`:"Atlas has no immediate portfolio or Radar actions.",
    moves:combined
  };
}

function radarSummary(candidates = []) {
  const active = candidates.filter(item => !["Dismissed", "Promoted"].includes(item.stage));
  const ranked = [...active].sort((a,b) => Number(b.radar_score||0)-Number(a.radar_score||0) || String(a.name).localeCompare(String(b.name)));
  return {
    total: candidates.length,
    active: active.length,
    new: active.filter(x=>x.stage==="New").length,
    investigating: active.filter(x=>x.stage==="Worth Investigating").length,
    recommended: active.filter(x=>x.stage==="Atlas Recommended").length,
    ready_to_test: active.filter(x=>x.stage==="Ready to Test").length,
    top_candidates: ranked.slice(0,5)
  };
}
function score(input) {
  const confidence = Number(input.confidence || 0);
  const speed = Number(input.speed_to_revenue || 0);
  const passivity = Number(input.passivity || 0);
  const fit = Number(input.atlas_fit || 0);
  return Math.round(((confidence + speed + passivity + fit) / 40) * 100);
}

async function api(req, res, url) {
  if (req.method === "GET" && url.pathname === "/api/health") {
    const storageHealth = storage.health();
    return json(res, storageHealth.ok ? 200 : 503, {
      ok: storageHealth.ok,
      service: "atlas-opportunity-engine",
      version: APP_VERSION,
      environment: process.env.NODE_ENV || "development",
      uptime_seconds: Math.floor((Date.now() - STARTED_AT) / 1000),
      auth_enabled: authConfig().enabled,
      auth_required: authConfig().required,
      storage: storageHealth
    });
  }


  if (req.method === "GET" && url.pathname === "/api/travel") {
    const state = readTravel();
    return json(res, 200, {
      schema_version: state.schema_version || 1,
      statuses: TRAVEL_STATUSES,
      preferences: state.preferences,
      trips: state.trips,
      summary: travelSummary(state)
    });
  }



  if (req.method === "GET" && url.pathname === "/api/travel/intelligence") {
    const state = readTravel();
    const options = {
      budget: Number(url.searchParams.get("budget") || 0),
      travelers: Number(url.searchParams.get("travelers") || 0),
      origin_airport: url.searchParams.get("origin_airport") || "",
      start_date: url.searchParams.get("start_date") || "",
      end_date: url.searchParams.get("end_date") || "",
      limit: Number(url.searchParams.get("limit") || 5)
    };
    return json(res, 200, travelIntelligenceDashboard(state, options));
  }

  if (req.method === "GET" && url.pathname === "/api/travel/providers") {
    return json(res, 200, travelProviderStatus(process.env));
  }

  if (req.method === "PATCH" && url.pathname === "/api/travel/preferences") {
    const input = await body(req);
    const state = readTravel();
    state.preferences = normalizeTravelPreferences(input, state.preferences);
    writeTravel(state);
    return json(res, 200, state.preferences);
  }

  if (req.method === "POST" && url.pathname === "/api/travel/score") {
    const input = await body(req);
    const state = readTravel();
    const trip = input.trip && typeof input.trip === "object" ? input.trip : { budget: { target: Number(input.budget || 0) } };
    const candidate = input.candidate && typeof input.candidate === "object" ? input.candidate : input;
    return json(res, 200, destinationScore(candidate, state.preferences, trip));
  }

  if (req.method === "POST" && url.pathname === "/api/travel/trips") {
    const input = await body(req);
    const state = readTravel();
    const trip = emptyTrip(input, state.preferences);
    if (!trip.name) return json(res, 400, { error: "Trip name is required." });
    state.trips.push(trip);
    writeTravel(state);
    return json(res, 201, trip);
  }

  const travelTripMatch = url.pathname.match(/^\/api\/travel\/trips\/([^/]+)$/);
  if (req.method === "PATCH" && travelTripMatch) {
    const input = await body(req);
    const state = readTravel();
    const index = state.trips.findIndex(item => item.id === travelTripMatch[1]);
    if (index === -1) return json(res, 404, { error: "Trip not found." });
    const current = state.trips[index];
    if (input.status !== undefined && !TRAVEL_STATUSES.includes(input.status)) return json(res, 400, { error: `Status must be one of: ${TRAVEL_STATUSES.join(", ")}` });
    const updated = { ...current };
    for (const key of ["name", "status", "travelers", "purpose", "origin_airport", "notes", "review", "lodging", "transportation", "activities", "reservations", "flight_options", "resort_options", "trip_operations", "pre_departure", "trip_resilience", "trip_wrap_up"]) {
      if (key in input) updated[key] = input[key];
    }
    if (input.dates && typeof input.dates === "object") updated.dates = { ...(current.dates || {}), ...input.dates };
    if (input.budget && typeof input.budget === "object") updated.budget = { ...(current.budget || {}), ...input.budget };
    updated.name = String(updated.name || "").trim();
    updated.origin_airport = String(updated.origin_airport || "").trim().toUpperCase();
    updated.travelers = Math.max(1, Math.round(Number(updated.travelers || 1)));
    updated.notes = String(updated.notes || "").trim();
    updated.updated_at = new Date().toISOString();
    if (!updated.name) return json(res, 400, { error: "Trip name is required." });
    state.trips[index] = updated;
    writeTravel(state);
    return json(res, 200, updated);
  }

  const travelResearchGenerateMatch = url.pathname.match(/^\/api\/travel\/trips\/([^/]+)\/research$/);
  if (req.method === "POST" && travelResearchGenerateMatch) {
    const input = await body(req);
    const state = readTravel();
    const index = state.trips.findIndex(item => item.id === travelResearchGenerateMatch[1]);
    if (index === -1) return json(res, 404, { error: "Trip not found." });
    const trip = state.trips[index];
    const research = automatedDestinationResearch(trip, state.preferences, input || {});
    const replaceSeeded = Boolean(input?.replace_seeded);
    const existing = replaceSeeded ? (trip.destination_candidates || []).filter(item => item.research_type !== "seed_estimate" && item.source !== "Atlas seed research") : [...(trip.destination_candidates || [])];
    const names = new Set(existing.map(item => String(item.name || "").toLowerCase()));
    const additions = research.candidates.filter(item => !names.has(String(item.name || "").toLowerCase()));
    trip.destination_candidates = [...existing, ...additions].sort((a,b) => Number(b.score?.atlas_fit || 0) - Number(a.score?.atlas_fit || 0));
    if (trip.status === "Dreaming" && additions.length) trip.status = "Researching";
    trip.last_automated_research = { generated_at: research.generated_at, source: research.source, live_data: research.live_data, candidate_count: additions.length, note: research.note };
    trip.updated_at = new Date().toISOString();
    state.trips[index] = trip;
    writeTravel(state);
    return json(res, 200, { research: { ...research, candidates: additions, candidate_count: additions.length }, trip, comparison: compareDestinations(trip, state.preferences), brief: destinationResearchBrief(trip, state.preferences) });
  }

  const travelCompareMatch = url.pathname.match(/^\/api\/travel\/trips\/([^/]+)\/compare$/);
  if (req.method === "GET" && travelCompareMatch) {
    const state = readTravel();
    const trip = state.trips.find(item => item.id === travelCompareMatch[1]);
    if (!trip) return json(res, 404, { error: "Trip not found." });
    return json(res, 200, { comparison: compareDestinations(trip, state.preferences), brief: destinationResearchBrief(trip, state.preferences) });
  }

  const destinationMatch = url.pathname.match(/^\/api\/travel\/trips\/([^/]+)\/destinations$/);
  if (req.method === "POST" && destinationMatch) {
    const input = await body(req);
    const state = readTravel();
    const index = state.trips.findIndex(item => item.id === destinationMatch[1]);
    if (index === -1) return json(res, 404, { error: "Trip not found." });
    const trip = state.trips[index];
    const candidate = normalizeDestinationCandidate(input, state.preferences, trip);
    if (!candidate.name) return json(res, 400, { error: "Destination name is required." });
    trip.destination_candidates = [...(trip.destination_candidates || []), candidate]
      .sort((a, b) => Number(b.score?.atlas_fit || 0) - Number(a.score?.atlas_fit || 0));
    trip.updated_at = new Date().toISOString();
    state.trips[index] = trip;
    writeTravel(state);
    return json(res, 201, candidate);
  }

  const travelLiveResearchMatch = url.pathname.match(/^\/api\/travel\/trips\/([^/]+)\/destinations\/([^/]+)\/live-research$/);
  if (req.method === "POST" && travelLiveResearchMatch) {
    const input = await body(req);
    const state = readTravel();
    const tripIndex = state.trips.findIndex(item => item.id === travelLiveResearchMatch[1]);
    if (tripIndex === -1) return json(res, 404, { error: "Trip not found." });
    const trip = state.trips[tripIndex];
    const candidates = trip.destination_candidates || [];
    const candidateIndex = candidates.findIndex(item => item.id === travelLiveResearchMatch[2]);
    if (candidateIndex === -1) return json(res, 404, { error: "Destination candidate not found." });
    if (!String(input?.source || input?.provider || '').trim()) return json(res, 400, { error: "A provider or source is required for a live research snapshot." });
    const updated = applyLiveResearchSnapshot(candidates[candidateIndex], input, state.preferences, trip);
    candidates[candidateIndex] = updated;
    trip.destination_candidates = candidates.sort((a,b) => Number(b.score?.atlas_fit || 0) - Number(a.score?.atlas_fit || 0));
    trip.last_live_research = { destination_id: updated.id, destination: updated.name, source: updated.source, captured_at: updated.last_live_research_at, live_data: updated.live_data };
    trip.updated_at = new Date().toISOString();
    state.trips[tripIndex] = trip;
    writeTravel(state);
    return json(res, 200, { destination: updated, comparison: compareDestinations(trip, state.preferences), brief: destinationResearchBrief(trip, state.preferences) });
  }

  const travelFlightCollectionMatch = url.pathname.match(/^\/api\/travel\/trips\/([^/]+)\/flights$/);
  if (travelFlightCollectionMatch && req.method === "GET") {
    const state = readTravel();
    const trip = state.trips.find(item => item.id === travelFlightCollectionMatch[1]);
    if (!trip) return json(res, 404, { error: "Trip not found." });
    return json(res, 200, compareFlights(trip, state.preferences, url.searchParams.get("destination_id") || ""));
  }
  if (travelFlightCollectionMatch && req.method === "POST") {
    const input = await body(req);
    const state = readTravel();
    const tripIndex = state.trips.findIndex(item => item.id === travelFlightCollectionMatch[1]);
    if (tripIndex === -1) return json(res, 404, { error: "Trip not found." });
    const trip = state.trips[tripIndex];
    const flight = normalizeFlightOption(input, state.preferences, trip);
    if (!flight.destination_airport) return json(res, 400, { error: "Destination airport is required." });
    trip.flight_options = [...(trip.flight_options || []), flight];
    trip.updated_at = new Date().toISOString();
    state.trips[tripIndex] = trip;
    writeTravel(state);
    return json(res, 201, { flight, comparison: compareFlights(trip, state.preferences, flight.destination_id) });
  }

  const travelFlightItemMatch = url.pathname.match(/^\/api\/travel\/trips\/([^/]+)\/flights\/([^/]+)$/);
  if (travelFlightItemMatch && (req.method === "PATCH" || req.method === "DELETE")) {
    const input = req.method === "PATCH" ? await body(req) : {};
    const state = readTravel();
    const tripIndex = state.trips.findIndex(item => item.id === travelFlightItemMatch[1]);
    if (tripIndex === -1) return json(res, 404, { error: "Trip not found." });
    const trip = state.trips[tripIndex];
    const options = trip.flight_options || [];
    const flightIndex = options.findIndex(item => item.id === travelFlightItemMatch[2]);
    if (flightIndex === -1) return json(res, 404, { error: "Flight option not found." });
    if (req.method === "DELETE") {
      const [removed] = options.splice(flightIndex, 1);
      trip.flight_options = options; trip.updated_at = new Date().toISOString(); state.trips[tripIndex] = trip; writeTravel(state);
      return json(res, 200, { removed, comparison: compareFlights(trip, state.preferences, removed.destination_id) });
    }
    const updated = normalizeFlightOption({ ...options[flightIndex], ...input, id: options[flightIndex].id }, state.preferences, trip);
    options[flightIndex] = updated; trip.flight_options = options; trip.updated_at = new Date().toISOString(); state.trips[tripIndex] = trip; writeTravel(state);
    return json(res, 200, { flight: updated, comparison: compareFlights(trip, state.preferences, updated.destination_id) });
  }

  const travelResortCollectionMatch = url.pathname.match(/^\/api\/travel\/trips\/([^/]+)\/resorts$/);
  if (travelResortCollectionMatch && req.method === "GET") {
    const state = readTravel();
    const trip = state.trips.find(item => item.id === travelResortCollectionMatch[1]);
    if (!trip) return json(res, 404, { error: "Trip not found." });
    return json(res, 200, compareResorts(trip, state.preferences, url.searchParams.get("destination_id") || ""));
  }
  if (travelResortCollectionMatch && req.method === "POST") {
    const input = await body(req);
    const state = readTravel();
    const tripIndex = state.trips.findIndex(item => item.id === travelResortCollectionMatch[1]);
    if (tripIndex === -1) return json(res, 404, { error: "Trip not found." });
    const trip = state.trips[tripIndex];
    const resort = normalizeResortOption(input, state.preferences, trip);
    if (!resort.name) return json(res, 400, { error: "Resort name is required." });
    trip.resort_options = [...(trip.resort_options || []), resort];
    trip.updated_at = new Date().toISOString();
    state.trips[tripIndex] = trip; writeTravel(state);
    return json(res, 201, { resort, comparison: compareResorts(trip, state.preferences, resort.destination_id) });
  }

  const travelResortItemMatch = url.pathname.match(/^\/api\/travel\/trips\/([^/]+)\/resorts\/([^/]+)$/);
  if (travelResortItemMatch && (req.method === "PATCH" || req.method === "DELETE")) {
    const input = req.method === "PATCH" ? await body(req) : {};
    const state = readTravel();
    const tripIndex = state.trips.findIndex(item => item.id === travelResortItemMatch[1]);
    if (tripIndex === -1) return json(res, 404, { error: "Trip not found." });
    const trip = state.trips[tripIndex];
    const options = trip.resort_options || [];
    const resortIndex = options.findIndex(item => item.id === travelResortItemMatch[2]);
    if (resortIndex === -1) return json(res, 404, { error: "Resort option not found." });
    if (req.method === "DELETE") {
      const [removed] = options.splice(resortIndex, 1); trip.resort_options = options; trip.updated_at = new Date().toISOString(); state.trips[tripIndex] = trip; writeTravel(state);
      return json(res, 200, { removed, comparison: compareResorts(trip, state.preferences, removed.destination_id) });
    }
    const updated = normalizeResortOption({ ...options[resortIndex], ...input, id: options[resortIndex].id }, state.preferences, trip);
    options[resortIndex] = updated; trip.resort_options = options; trip.updated_at = new Date().toISOString(); state.trips[tripIndex] = trip; writeTravel(state);
    return json(res, 200, { resort: updated, comparison: compareResorts(trip, state.preferences, updated.destination_id) });
  }


  const travelScenarioCollectionMatch = url.pathname.match(/^\/api\/travel\/trips\/([^/]+)\/scenarios$/);
  if (travelScenarioCollectionMatch && req.method === "GET") {
    const state = readTravel();
    const trip = state.trips.find(item => item.id === travelScenarioCollectionMatch[1]);
    if (!trip) return json(res, 404, { error: "Trip not found." });
    return json(res, 200, compareTripScenarios(trip, state.preferences));
  }
  if (travelScenarioCollectionMatch && req.method === "POST") {
    const input = await body(req);
    const state = readTravel();
    const tripIndex = state.trips.findIndex(item => item.id === travelScenarioCollectionMatch[1]);
    if (tripIndex === -1) return json(res, 404, { error: "Trip not found." });
    const trip = state.trips[tripIndex];
    const scenario = normalizeTripScenario(input, trip, state.preferences);
    if (!scenario.name) return json(res, 400, { error: "Scenario name is required." });
    if (!scenario.destination) return json(res, 400, { error: "Scenario destination is required." });
    trip.scenario_plans = [...(trip.scenario_plans || []), scenario];
    trip.updated_at = new Date().toISOString();
    state.trips[tripIndex] = trip;
    writeTravel(state);
    return json(res, 201, { scenario, comparison: compareTripScenarios(trip, state.preferences) });
  }




  const travelBookingExecutionMatch = url.pathname.match(/^\/api\/travel\/trips\/([^/]+)\/booking-execution$/);
  if (travelBookingExecutionMatch && req.method === "GET") {
    const state = readTravel();
    const trip = state.trips.find(item => item.id === travelBookingExecutionMatch[1]);
    if (!trip) return json(res, 404, { error: "Trip not found." });
    return json(res, 200, bookingExecutionState(trip, state.preferences));
  }
  if (travelBookingExecutionMatch && req.method === "PATCH") {
    const input = await body(req); const state = readTravel();
    const index = state.trips.findIndex(item => item.id === travelBookingExecutionMatch[1]);
    if (index === -1) return json(res, 404, { error: "Trip not found." });
    try { const result = updateBookingExecution(state.trips[index], input, state.preferences); writeTravel(state); return json(res, 200, result); }
    catch (error) { return json(res, 400, { error: error.message }); }
  }
  const travelBookingExecutionStartMatch = url.pathname.match(/^\/api\/travel\/trips\/([^/]+)\/booking-execution\/start$/);
  if (travelBookingExecutionStartMatch && req.method === "POST") {
    const input = await body(req); const state = readTravel();
    const index = state.trips.findIndex(item => item.id === travelBookingExecutionStartMatch[1]);
    if (index === -1) return json(res, 404, { error: "Trip not found." });
    try { const result = startBookingExecution(state.trips[index], input, state.preferences); writeTravel(state); return json(res, 200, result); }
    catch (error) { return json(res, 409, { error: error.message, execution: bookingExecutionState(state.trips[index], state.preferences) }); }
  }
  const travelBookingExecutionFinalizeMatch = url.pathname.match(/^\/api\/travel\/trips\/([^/]+)\/booking-execution\/finalize$/);
  if (travelBookingExecutionFinalizeMatch && req.method === "POST") {
    const state = readTravel(); const index = state.trips.findIndex(item => item.id === travelBookingExecutionFinalizeMatch[1]);
    if (index === -1) return json(res, 404, { error: "Trip not found." });
    try { const result = finalizeBookingExecution(state.trips[index], state.preferences); writeTravel(state); return json(res, 200, result); }
    catch (error) { return json(res, 409, { error: error.message, execution: bookingExecutionState(state.trips[index], state.preferences) }); }
  }

  const travelReadinessMatch = url.pathname.match(/^\/api\/travel\/trips\/([^/]+)\/readiness$/);
  if (travelReadinessMatch && req.method === "GET") {
    const state = readTravel();
    const trip = state.trips.find(item => item.id === travelReadinessMatch[1]);
    if (!trip) return json(res, 404, { error: "Trip not found." });
    return json(res, 200, travelBookingReadinessCenter(trip, state.preferences));
  }

  const travelActionsCollectionMatch = url.pathname.match(/^\/api\/travel\/trips\/([^/]+)\/actions$/);
  if (travelActionsCollectionMatch) {
    const state = readTravel();
    const trip = state.trips.find(item => item.id === travelActionsCollectionMatch[1]);
    if (!trip) return json(res, 404, { error: "Trip not found." });
    if (req.method === "GET") return json(res, 200, travelActionQueue(trip, state.preferences));
  }

  const travelActionItemMatch = url.pathname.match(/^\/api\/travel\/trips\/([^/]+)\/actions\/(.+)$/);
  if (travelActionItemMatch && req.method === "PATCH") {
    const state = readTravel();
    const tripIndex = state.trips.findIndex(item => item.id === travelActionItemMatch[1]);
    if (tripIndex === -1) return json(res, 404, { error: "Trip not found." });
    const trip = state.trips[tripIndex];
    try {
      const input = await body(req);
      const queue = updateTravelAction(trip, decodeURIComponent(travelActionItemMatch[2]), input, state.preferences);
      state.trips[tripIndex] = trip; writeTravel(state);
      return json(res, 200, queue);
    } catch (error) { return json(res, 400, { error: error.message }); }
  }

  const travelWatchCollectionMatch = url.pathname.match(/^\/api\/travel\/trips\/([^/]+)\/watchlist$/);
  if (travelWatchCollectionMatch && req.method === "GET") {
    const state = readTravel();
    const trip = state.trips.find(item => item.id === travelWatchCollectionMatch[1]);
    if (!trip) return json(res, 404, { error: "Trip not found." });
    return json(res, 200, travelWatchlistState(trip, state.preferences));
  }
  if (travelWatchCollectionMatch && req.method === "POST") {
    const input = await body(req);
    const state = readTravel();
    const tripIndex = state.trips.findIndex(item => item.id === travelWatchCollectionMatch[1]);
    if (tripIndex === -1) return json(res, 404, { error: "Trip not found." });
    const trip = state.trips[tripIndex];
    try {
      const watch = addScenarioWatch(trip, input, state.preferences);
      state.trips[tripIndex] = trip; writeTravel(state);
      return json(res, 201, { watch, watchlist: travelWatchlistState(trip, state.preferences) });
    } catch (error) { return json(res, 400, { error: error.message }); }
  }

  const travelWatchItemMatch = url.pathname.match(/^\/api\/travel\/trips\/([^/]+)\/watchlist\/([^/]+)$/);
  if (travelWatchItemMatch && (req.method === "PATCH" || req.method === "DELETE")) {
    const state = readTravel();
    const tripIndex = state.trips.findIndex(item => item.id === travelWatchItemMatch[1]);
    if (tripIndex === -1) return json(res, 404, { error: "Trip not found." });
    const trip = state.trips[tripIndex];
    const list = Array.isArray(trip.scenario_watchlist) ? trip.scenario_watchlist : [];
    const watchIndex = list.findIndex(item => item.id === travelWatchItemMatch[2]);
    if (watchIndex === -1) return json(res, 404, { error: "Watch item not found." });
    if (req.method === "DELETE") {
      const [removed] = list.splice(watchIndex, 1); trip.scenario_watchlist = list; trip.updated_at = new Date().toISOString();
      state.trips[tripIndex] = trip; writeTravel(state);
      return json(res, 200, { removed, watchlist: travelWatchlistState(trip, state.preferences) });
    }
    const input = await body(req);
    try {
      const watch = updateScenarioWatch(trip, travelWatchItemMatch[2], input, state.preferences);
      state.trips[tripIndex] = trip; writeTravel(state);
      return json(res, 200, { watch, watchlist: travelWatchlistState(trip, state.preferences) });
    } catch (error) { return json(res, 400, { error: error.message }); }
  }

  const travelWatchCheckMatch = url.pathname.match(/^\/api\/travel\/trips\/([^/]+)\/watchlist\/([^/]+)\/check$/);
  if (travelWatchCheckMatch && req.method === "POST") {
    const input = await body(req);
    const state = readTravel();
    const tripIndex = state.trips.findIndex(item => item.id === travelWatchCheckMatch[1]);
    if (tripIndex === -1) return json(res, 404, { error: "Trip not found." });
    const trip = state.trips[tripIndex];
    try {
      const snapshot = recordScenarioWatchCheck(trip, travelWatchCheckMatch[2], input, state.preferences);
      state.trips[tripIndex] = trip; writeTravel(state);
      return json(res, 200, { snapshot, watchlist: travelWatchlistState(trip, state.preferences) });
    } catch (error) { return json(res, 400, { error: error.message }); }
  }

  const travelScenarioItemMatch = url.pathname.match(/^\/api\/travel\/trips\/([^/]+)\/scenarios\/([^/]+)$/);
  if (travelScenarioItemMatch && (req.method === "PATCH" || req.method === "DELETE")) {
    const state = readTravel();
    const tripIndex = state.trips.findIndex(item => item.id === travelScenarioItemMatch[1]);
    if (tripIndex === -1) return json(res, 404, { error: "Trip not found." });
    const trip = state.trips[tripIndex];
    const scenarios = trip.scenario_plans || [];
    const scenarioIndex = scenarios.findIndex(item => item.id === travelScenarioItemMatch[2]);
    if (scenarioIndex === -1) return json(res, 404, { error: "Scenario not found." });
    if (req.method === "DELETE") {
      const [removed] = scenarios.splice(scenarioIndex, 1);
      trip.scenario_plans = scenarios;
      trip.updated_at = new Date().toISOString();
      state.trips[tripIndex] = trip;
      writeTravel(state);
      return json(res, 200, { removed, comparison: compareTripScenarios(trip, state.preferences) });
    }
    const input = await body(req);
    const updated = normalizeTripScenario({ ...scenarios[scenarioIndex], ...input, id: scenarios[scenarioIndex].id, created_at: scenarios[scenarioIndex].created_at }, trip, state.preferences);
    scenarios[scenarioIndex] = updated;
    trip.scenario_plans = scenarios;
    trip.updated_at = new Date().toISOString();
    state.trips[tripIndex] = trip;
    writeTravel(state);
    return json(res, 200, { scenario: updated, comparison: compareTripScenarios(trip, state.preferences) });
  }

  const travelPackageMatch = url.pathname.match(/^\/api\/travel\/trips\/([^/]+)\/packages$/);
  if (req.method === "GET" && travelPackageMatch) {
    const state = readTravel();
    const trip = state.trips.find(item => item.id === travelPackageMatch[1]);
    if (!trip) return json(res, 404, { error: "Trip not found." });
    const options = {
      destination_id: url.searchParams.get("destination_id") || "",
      limit: Number(url.searchParams.get("limit") || 20),
      transfer_cost: Number(url.searchParams.get("transfer_cost") || 0),
      activity_allowance: Number(url.searchParams.get("activity_allowance") || 0),
      other_costs: Number(url.searchParams.get("other_costs") || 0)
    };
    return json(res, 200, optimizeTripPackages(trip, state.preferences, options));
  }


  const travelDecisionMatch = url.pathname.match(/^\/api\/travel\/trips\/([^/]+)\/decision$/);
  if (travelDecisionMatch && req.method === "GET") {
    const state = readTravel();
    const trip = state.trips.find(item => item.id === travelDecisionMatch[1]);
    if (!trip) return json(res, 404, { error: "Trip not found." });
    return json(res, 200, bookingDecisionState(trip, state.preferences));
  }
  if (travelDecisionMatch && req.method === "PATCH") {
    const state = readTravel();
    const tripIndex = state.trips.findIndex(item => item.id === travelDecisionMatch[1]);
    if (tripIndex === -1) return json(res, 404, { error: "Trip not found." });
    const input = await body(req);
    try {
      const decision = updateBookingDecision(state.trips[tripIndex], input, state.preferences);
      writeTravel(state);
      return json(res, 200, decision);
    } catch (error) {
      return json(res, 400, { error: error.message || "Unable to update booking decision." });
    }
  }

  const travelBookMatch = url.pathname.match(/^\/api\/travel\/trips\/([^/]+)\/book$/);
  if (travelBookMatch && req.method === "POST") {
    const state = readTravel();
    const tripIndex = state.trips.findIndex(item => item.id === travelBookMatch[1]);
    if (tripIndex === -1) return json(res, 404, { error: "Trip not found." });
    try {
      const decision = bookPreferredPackage(state.trips[tripIndex], state.preferences);
      writeTravel(state);
      return json(res, 200, decision);
    } catch (error) {
      return json(res, 409, { error: error.message || "Trip is not ready to book.", decision: bookingDecisionState(state.trips[tripIndex], state.preferences) });
    }
  }



  const travelPreDepartureMatch = url.pathname.match(/^\/api\/travel\/trips\/([^/]+)\/pre-departure$/);
  if (travelPreDepartureMatch && req.method === "GET") {
    const state = readTravel();
    const trip = state.trips.find(item => item.id === travelPreDepartureMatch[1]);
    if (!trip) return json(res, 404, { error: "Trip not found." });
    return json(res, 200, preDepartureState(trip));
  }
  if (travelPreDepartureMatch && req.method === "PATCH") {
    const state = readTravel();
    const tripIndex = state.trips.findIndex(item => item.id === travelPreDepartureMatch[1]);
    if (tripIndex === -1) return json(res, 404, { error: "Trip not found." });
    try {
      const result = updatePreDeparture(state.trips[tripIndex], await body(req));
      writeTravel(state);
      return json(res, 200, result);
    } catch (error) {
      return json(res, 409, { error: error.message || "Unable to update pre-departure readiness.", pre_departure: preDepartureState(state.trips[tripIndex]) });
    }
  }

  const travelOperationsMatch = url.pathname.match(/^\/api\/travel\/trips\/([^/]+)\/operations$/);
  if (travelOperationsMatch && req.method === "GET") {
    const state = readTravel();
    const trip = state.trips.find(item => item.id === travelOperationsMatch[1]);
    if (!trip) return json(res, 404, { error: "Trip not found." });
    return json(res, 200, tripOperationsState(trip));
  }
  if (travelOperationsMatch && req.method === "PATCH") {
    const state = readTravel();
    const tripIndex = state.trips.findIndex(item => item.id === travelOperationsMatch[1]);
    if (tripIndex === -1) return json(res, 404, { error: "Trip not found." });
    const input = await body(req);
    try {
      const operations = updateTripOperations(state.trips[tripIndex], input);
      writeTravel(state);
      return json(res, 200, operations);
    } catch (error) {
      return json(res, 400, { error: error.message || "Unable to update trip operations." });
    }
  }

  const travelStartMatch = url.pathname.match(/^\/api\/travel\/trips\/([^/]+)\/start-travel$/);
  if (travelStartMatch && req.method === "POST") {
    const state = readTravel();
    const tripIndex = state.trips.findIndex(item => item.id === travelStartMatch[1]);
    if (tripIndex === -1) return json(res, 404, { error: "Trip not found." });
    try {
      const operations = startTripTraveling(state.trips[tripIndex]);
      writeTravel(state);
      return json(res, 200, operations);
    } catch (error) {
      return json(res, 409, { error: error.message || "Trip is not ready to start.", operations: tripOperationsState(state.trips[tripIndex]) });
    }
  }


  const travelLiveMatch = url.pathname.match(/^\/api\/travel\/trips\/([^/]+)\/live$/);
  if (travelLiveMatch && req.method === "GET") {
    const state = readTravel(); const trip = state.trips.find(item => item.id === travelLiveMatch[1]);
    if (!trip) return json(res, 404, { error: "Trip not found." });
    return json(res, 200, liveTripState(trip));
  }
  if (travelLiveMatch && req.method === "PATCH") {
    const state = readTravel(); const tripIndex = state.trips.findIndex(item => item.id === travelLiveMatch[1]);
    if (tripIndex === -1) return json(res, 404, { error: "Trip not found." });
    try { const result = updateLiveTrip(state.trips[tripIndex], await body(req)); writeTravel(state); return json(res, 200, result); }
    catch (error) { return json(res, 409, { error: error.message || "Unable to update live trip.", live: liveTripState(state.trips[tripIndex]) }); }
  }



  const travelResilienceMatch = url.pathname.match(/^\/api\/travel\/trips\/([^/]+)\/resilience$/);
  if (travelResilienceMatch && req.method === "GET") {
    const state = readTravel(); const trip = state.trips.find(item => item.id === travelResilienceMatch[1]);
    if (!trip) return json(res, 404, { error: "Trip not found." });
    return json(res, 200, tripResilienceState(trip));
  }
  if (travelResilienceMatch && req.method === "PATCH") {
    const state = readTravel(); const tripIndex = state.trips.findIndex(item => item.id === travelResilienceMatch[1]);
    if (tripIndex === -1) return json(res, 404, { error: "Trip not found." });
    try { const result = updateTripResilience(state.trips[tripIndex], await body(req)); writeTravel(state); return json(res, 200, result); }
    catch (error) { return json(res, 409, { error: error.message || "Unable to update trip resilience.", resilience: tripResilienceState(state.trips[tripIndex]) }); }
  }


  const travelWrapUpMatch = url.pathname.match(/^\/api\/travel\/trips\/([^/]+)\/wrap-up$/);
  if (travelWrapUpMatch && req.method === "GET") {
    const state = readTravel(); const trip = state.trips.find(item => item.id === travelWrapUpMatch[1]);
    if (!trip) return json(res, 404, { error: "Trip not found." });
    return json(res, 200, tripWrapUpState(trip));
  }
  if (travelWrapUpMatch && req.method === "PATCH") {
    const state = readTravel(); const tripIndex = state.trips.findIndex(item => item.id === travelWrapUpMatch[1]);
    if (tripIndex === -1) return json(res, 404, { error: "Trip not found." });
    try { const result = updateTripWrapUp(state.trips[tripIndex], await body(req)); writeTravel(state); return json(res, 200, result); }
    catch (error) { return json(res, 409, { error: error.message || "Unable to update trip wrap-up.", wrap_up: tripWrapUpState(state.trips[tripIndex]) }); }
  }

  const travelReviewMatch = url.pathname.match(/^\/api\/travel\/trips\/([^/]+)\/review$/);
  if (travelReviewMatch && req.method === "GET") {
    const state = readTravel(); const trip = state.trips.find(item => item.id === travelReviewMatch[1]);
    if (!trip) return json(res, 404, { error: "Trip not found." });
    return json(res, 200, tripReviewState(trip, state.preferences));
  }
  if (travelReviewMatch && req.method === "PATCH") {
    const state = readTravel(); const tripIndex = state.trips.findIndex(item => item.id === travelReviewMatch[1]);
    if (tripIndex === -1) return json(res, 404, { error: "Trip not found." });
    try { const result = updateTripReview(state.trips[tripIndex], await body(req), state.preferences); writeTravel(state); return json(res, 200, result); }
    catch (error) { return json(res, 409, { error: error.message || "Unable to update trip review.", review: tripReviewState(state.trips[tripIndex], state.preferences) }); }
  }

  const travelCompleteMatch = url.pathname.match(/^\/api\/travel\/trips\/([^/]+)\/complete$/);
  if (travelCompleteMatch && req.method === "POST") {
    const state = readTravel(); const tripIndex = state.trips.findIndex(item => item.id === travelCompleteMatch[1]);
    if (tripIndex === -1) return json(res, 404, { error: "Trip not found." });
    try { const result = completeTripReview(state.trips[tripIndex], state.preferences); writeTravel(state); return json(res, 200, result); }
    catch (error) { return json(res, 409, { error: error.message || "Trip is not ready to complete.", review: tripReviewState(state.trips[tripIndex], state.preferences), wrap_up: tripWrapUpState(state.trips[tripIndex]) }); }
  }

  const travelLearningMatch = url.pathname.match(/^\/api\/travel\/trips\/([^/]+)\/apply-learning$/);
  if (travelLearningMatch && req.method === "POST") {
    const state = readTravel(); const tripIndex = state.trips.findIndex(item => item.id === travelLearningMatch[1]);
    if (tripIndex === -1) return json(res, 404, { error: "Trip not found." });
    try { const input = await body(req); const result = applyTripLearning(state.trips[tripIndex], state.preferences, input.suggestion_ids); state.preferences = result.preferences; writeTravel(state); return json(res, 200, result); }
    catch (error) { return json(res, 409, { error: error.message || "Unable to apply travel learning." }); }
  }

  const travelDestinationItemMatch = url.pathname.match(/^\/api\/travel\/trips\/([^/]+)\/destinations\/([^/]+)$/);
  if ((req.method === "PATCH" || req.method === "DELETE") && travelDestinationItemMatch) {
    const state = readTravel();
    const tripIndex = state.trips.findIndex(item => item.id === travelDestinationItemMatch[1]);
    if (tripIndex === -1) return json(res, 404, { error: "Trip not found." });
    const trip = state.trips[tripIndex];
    const candidates = trip.destination_candidates || [];
    const candidateIndex = candidates.findIndex(item => item.id === travelDestinationItemMatch[2]);
    if (candidateIndex === -1) return json(res, 404, { error: "Destination candidate not found." });
    if (req.method === "DELETE") {
      const [removed] = candidates.splice(candidateIndex, 1);
      trip.destination_candidates = candidates;
      trip.updated_at = new Date().toISOString();
      writeTravel(state);
      return json(res, 200, removed);
    }
    const input = await body(req);
    const updated = normalizeDestinationCandidate({ ...candidates[candidateIndex], ...input, id: candidates[candidateIndex].id }, state.preferences, trip);
    candidates[candidateIndex] = updated;
    trip.destination_candidates = candidates.sort((a, b) => Number(b.score?.atlas_fit || 0) - Number(a.score?.atlas_fit || 0));
    trip.updated_at = new Date().toISOString();
    writeTravel(state);
    return json(res, 200, updated);
  }

  const interventionMatch = url.pathname.match(/^\/api\/opportunities\/(\d+)\/interventions$/);
  if (req.method === "POST" && interventionMatch) {
    try {
      const id = Number(interventionMatch[1]);
      const data = readData();
      const index = data.findIndex(item => Number(item.id) === id);
      if (index < 0) return json(res, 404, { error: "Opportunity not found" });
      const opportunity = withReviewState(data[index]);
      if (opportunity.status !== "Testing") return json(res, 400, { error: "Interventions are only available for Testing opportunities" });

      const plan = interventionPlan(opportunity);
      const health = experimentHealth(opportunity);
      const experiment = normalizeExperiment(opportunity.experiment || {});
      const active = experiment.interventions.find(item => item.status === "Active");
      if (active) return json(res, 409, { error: "Complete the active intervention before accepting another one" });

      const record = {
        ...emptyIntervention(),
        id: `intervention-${Date.now()}`,
        category: plan.intervention_category,
        diagnosis: plan.intervention_diagnosis,
        action: plan.intervention_action,
        rationale: plan.intervention_rationale,
        success_metric: plan.intervention_success_metric,
        change_limit: plan.intervention_change_limit,
        accepted_at: new Date().toISOString(),
        status: "Active",
        baseline: {
          visits: health.health_metrics.visits,
          favorites: health.health_metrics.favorites,
          orders: health.health_metrics.orders,
          revenue: health.health_metrics.revenue,
          conversion_rate: health.health_metrics.conversion_rate
        }
      };
      experiment.interventions.push(record);
      data[index] = { ...data[index], experiment, updated_at: new Date().toISOString() };
      writeData(data);
      return json(res, 201, record);
    } catch (error) {
      return json(res, 500, { error: error.message });
    }
  }

  const interventionCompleteMatch = url.pathname.match(/^\/api\/opportunities\/(\d+)\/interventions\/([^/]+)$/);
  if (req.method === "PUT" && interventionCompleteMatch) {
    try {
      const id = Number(interventionCompleteMatch[1]);
      const interventionId = decodeURIComponent(interventionCompleteMatch[2]);
      const body = await parseBody(req);
      const data = readData();
      const index = data.findIndex(item => Number(item.id) === id);
      if (index < 0) return json(res, 404, { error: "Opportunity not found" });
      const opportunity = withReviewState(data[index]);
      const experiment = normalizeExperiment(opportunity.experiment || {});
      const recordIndex = experiment.interventions.findIndex(item => item.id === interventionId);
      if (recordIndex < 0) return json(res, 404, { error: "Intervention not found" });

      const health = experimentHealth(opportunity);
      const current = experiment.interventions[recordIndex];
      const updated = {
        ...current,
        result: {
          visits: health.health_metrics.visits,
          favorites: health.health_metrics.favorites,
          orders: health.health_metrics.orders,
          revenue: health.health_metrics.revenue,
          conversion_rate: health.health_metrics.conversion_rate
        },
        notes: String(body.notes || current.notes || ""),
        completed_at: new Date().toISOString(),
        status: "Completed"
      };
      updated.outcome = body.outcome || interventionEvaluation(updated).outcome;
      experiment.interventions[recordIndex] = updated;
      data[index] = { ...data[index], experiment, updated_at: new Date().toISOString() };
      writeData(data);
      return json(res, 200, { ...updated, evaluation: interventionEvaluation(updated) });
    } catch (error) {
      return json(res, 500, { error: error.message });
    }
  }

  const focusMatch = url.pathname.match(/^\/api\/opportunities\/(\d+)\/focus$/);
  if (req.method === "POST" && focusMatch) {
    const input = await body(req);
    const action = String(input.action || "").toLowerCase();
    if (!['start', 'complete', 'defer'].includes(action)) return json(res, 400, { error: "Focus action must be start, complete, or defer." });
    const data = readData();
    const index = data.findIndex(item => Number(item.id) === Number(focusMatch[1]));
    if (index === -1) return json(res, 404, { error: "Opportunity not found." });
    const now = Date.now();
    const stamp = new Date(now).toISOString();
    const current = focusStateForOpportunity(data[index], now);
    const adaptiveContext = adaptiveStrategyContext(data, now);
    const appliedStrategy = adaptiveContext.byId.get(String(data[index].id)) || adaptiveContext.portfolioPolicy;
    const intelligence = opportunityIntelligence(data[index], now, appliedStrategy);
    const recommendation = intelligence.adaptive_next_action?.action || intelligence.recommendation;
    const history = [...current.history];
    let next = { ...current };
    if (action === 'start') {
      const plannedAction = String(input.planned_action || '').trim();
      const plannedMinutesRaw = Number(input.planned_minutes);
      const plannedMinutes = Number.isFinite(plannedMinutesRaw) && plannedMinutesRaw >= 10 && plannedMinutesRaw <= 180 ? Math.round(plannedMinutesRaw / 5) * 5 : null;
      if ((plannedAction && !plannedMinutes) || (!plannedAction && input.planned_minutes != null && input.planned_minutes !== '')) return json(res, 400, { error: "Planned work blocks require an action and 10-180 minutes." });
      const startedAction = plannedAction || recommendation;
      const actionMode = plannedAction ? 'work_block' : (intelligence.adaptive_next_action?.mode || 'standard');
      const estimatedMinutes = plannedAction ? plannedMinutes : (intelligence.adaptive_next_action?.estimated_minutes ?? null);
      const requestedSource = ['next_work_block', 'daily_work_plan'].includes(String(input.work_block_source || '')) ? String(input.work_block_source) : null;
      const workBlockSource = plannedAction ? (requestedSource || 'next_work_block') : null;
      const planDate = workBlockSource === 'daily_work_plan' ? (String(input.plan_date || '').trim() || localDateKey(stamp)) : null;
      const planSequence = workBlockSource === 'daily_work_plan' && Number.isFinite(Number(input.plan_sequence)) ? Math.max(1, Math.round(Number(input.plan_sequence))) : null;
      const planTotalMinutes = workBlockSource === 'daily_work_plan' && Number.isFinite(Number(input.plan_total_minutes)) ? Math.max(30, Math.min(360, Math.round(Number(input.plan_total_minutes)))) : null;
      const planDensityPct = workBlockSource === 'daily_work_plan' && Number.isFinite(Number(input.plan_density_pct)) ? Math.max(50, Math.min(100, Math.round(Number(input.plan_density_pct)))) : null;
      const planTimeWindow = workBlockSource === 'daily_work_plan' ? executionTimeWindow(stamp) : null;
      const planWorkType = workBlockSource === 'daily_work_plan' ? workTypeForAction(startedAction) : null;
      const planCompositionMode = workBlockSource === 'daily_work_plan' && ['mixed', 'focused', 'learning'].includes(String(input.plan_composition_mode || '')) ? String(input.plan_composition_mode) : null;
      const strategyEvidence = appliedStrategy?.evidence?.level || adaptiveContext.portfolioPolicy?.evidence?.level || adaptiveStrategyEvidence(adaptiveContext.learning).level;
      next = { ...current, status: 'active', action: startedAction, action_mode: actionMode, estimated_minutes: estimatedMinutes, work_block_source: workBlockSource, plan_date: planDate, plan_sequence: planSequence, plan_total_minutes: planTotalMinutes, plan_density_pct: planDensityPct, plan_time_window: planTimeWindow, plan_work_type: planWorkType, plan_composition_mode: planCompositionMode, started_at: stamp, deferred_until: null, completed_at: null, defer_reason: '' };
      history.push({ event: 'started', action: startedAction, action_mode: actionMode, estimated_minutes: estimatedMinutes, work_block_source: workBlockSource, plan_date: planDate, plan_sequence: planSequence, plan_total_minutes: planTotalMinutes, plan_density_pct: planDensityPct, plan_time_window: planTimeWindow, plan_work_type: planWorkType, plan_composition_mode: planCompositionMode, adaptive_strategy_mode: appliedStrategy?.mode || 'learning', adaptive_strategy_scope: appliedStrategy?.scope || 'portfolio', adaptive_strategy_evidence: strategyEvidence, at: stamp });
    } else if (action === 'complete') {
      const completedAction = current.action || recommendation;
      const deferredUntil = new Date(now + 24 * 60 * 60 * 1000).toISOString();
      next = { ...current, status: 'completed', action: completedAction, action_mode: current.action_mode || intelligence.adaptive_next_action?.mode || 'standard', estimated_minutes: current.estimated_minutes ?? intelligence.adaptive_next_action?.estimated_minutes ?? null, completed_at: stamp, deferred_until: deferredUntil, defer_reason: '' };
      const durationMinutes = current.started_at ? Math.max(0, Math.round((now - Date.parse(current.started_at)) / 60000)) : 0;
      history.push({ event: 'completed', action: completedAction, action_mode: next.action_mode, estimated_minutes: next.estimated_minutes, work_block_source: current.work_block_source || null, plan_date: current.plan_date || null, plan_sequence: current.plan_sequence ?? null, plan_total_minutes: current.plan_total_minutes ?? null, plan_density_pct: current.plan_density_pct ?? null, plan_time_window: current.plan_time_window || null, plan_work_type: current.plan_work_type || workTypeForAction(completedAction), plan_composition_mode: current.plan_composition_mode || null, at: stamp, hidden_until: deferredUntil, duration_minutes: durationMinutes });
    } else {
      const days = Math.max(1, Math.min(30, Number(input.days || 1)));
      const deferReason = normalizeDeferReason(input.reason);
      if (input.reason && !deferReason) return json(res, 400, { error: "Unknown defer reason." });
      const deferredUntil = new Date(now + days * 24 * 60 * 60 * 1000).toISOString();
      const deferredAction = current.action || recommendation;
      next = { ...current, status: 'deferred', action: deferredAction, action_mode: current.action_mode || intelligence.adaptive_next_action?.mode || 'standard', estimated_minutes: current.estimated_minutes ?? intelligence.adaptive_next_action?.estimated_minutes ?? null, deferred_until: deferredUntil, defer_reason: deferReason };
      const durationMinutes = current.started_at ? Math.max(0, Math.round((now - Date.parse(current.started_at)) / 60000)) : 0;
      history.push({ event: 'deferred', action: deferredAction, action_mode: next.action_mode, estimated_minutes: next.estimated_minutes, work_block_source: current.work_block_source || null, plan_date: current.plan_date || null, plan_sequence: current.plan_sequence ?? null, plan_total_minutes: current.plan_total_minutes ?? null, plan_density_pct: current.plan_density_pct ?? null, plan_time_window: current.plan_time_window || null, plan_work_type: current.plan_work_type || workTypeForAction(deferredAction), plan_composition_mode: current.plan_composition_mode || null, defer_reason: deferReason || null, at: stamp, deferred_until: deferredUntil, duration_minutes: durationMinutes });
    }
    next.history = history.slice(-100);
    data[index] = { ...data[index], focus: next, updated_at: stamp };
    writeData(data);
    const refreshedContext = adaptiveStrategyContext(data, now);
    const refreshedStrategy = refreshedContext.byId.get(String(data[index].id)) || refreshedContext.portfolioPolicy;
    return json(res, 200, { focus: focusStateForOpportunity(data[index], now), intelligence: opportunityIntelligence(data[index], now, refreshedStrategy) });
  }


  const frictionResolutionMatch = url.pathname.match(/^\/api\/opportunities\/(\d+)\/friction-resolution$/);
  if (req.method === "POST" && frictionResolutionMatch) {
    const data = readData();
    const index = data.findIndex(item => Number(item.id) === Number(frictionResolutionMatch[1]));
    if (index === -1) return json(res, 404, { error: "Opportunity not found." });
    const now = Date.now();
    const stamp = new Date(now).toISOString();
    const diagnosis = focusFrictionDiagnosis(data[index], now, 14);
    const portfolioEffectiveness = focusResolutionEffectivenessSummary(data, now, 30);
    const resolutionStrategy = focusResolutionStrategy(data[index], diagnosis, now, 30, portfolioEffectiveness);
    const resolution = focusFrictionResolution(data[index], diagnosis, resolutionStrategy);
    if (!resolution.available) return json(res, 409, { error: "Atlas does not have enough diagnosed friction to prescribe a resolution yet.", diagnosis, resolution });
    const current = focusStateForOpportunity(data[index], now);
    const history = [...current.history, { event: "friction_resolution_started", action: resolution.action, action_mode: "resolution", estimated_minutes: resolution.estimated_minutes, friction_response: resolution.friction_response, friction_reason: resolution.friction_reason, resolution_strategy_mode: resolutionStrategy.mode, resolution_strategy_scope: resolutionStrategy.scope, resolution_strategy_evidence: resolutionStrategy.evidence_level, resolution_strategy_resolved: resolutionStrategy.resolved, resolution_strategy_success_pct: resolutionStrategy.success_pct, resolution_strategy_stability: resolutionStrategy.stability?.status || "stable", at: stamp }].slice(-100);
    const next = { ...current, status: "active", action: resolution.action, action_mode: "resolution", estimated_minutes: resolution.estimated_minutes, started_at: stamp, deferred_until: null, completed_at: null, defer_reason: "", history };
    data[index] = { ...data[index], focus: next, updated_at: stamp };
    writeData(data);
    const adaptiveContext = adaptiveStrategyContext(data, now);
    const adaptiveStrategy = adaptiveContext.byId.get(String(data[index].id)) || adaptiveContext.portfolioPolicy;
    return json(res, 200, { resolution, resolution_strategy: resolutionStrategy, focus: focusStateForOpportunity(data[index], now), intelligence: opportunityIntelligence(data[index], now, adaptiveStrategy) });
  }

  if (req.method === "GET" && url.pathname === "/api/intelligence") {
    const data = readData();
    const now = Date.now();
    const adaptiveContext = adaptiveStrategyContext(data, now);
    return json(res, 200, { generated_at: new Date(now).toISOString(), queue: intelligenceQueue(data, now, opportunity => adaptiveContext.byId.get(String(opportunity.id)) || adaptiveContext.portfolioPolicy) });
  }

  if (req.method === "GET" && url.pathname === "/api/command-center") {
    return json(res, 200, commandCenter(readData(), Date.now(), url.searchParams.get("minutes"), url.searchParams.get("daily_minutes")));
  }

  if (req.method === "GET" && url.pathname === "/api/portfolio-summary") {
    return json(res, 200, portfolioSummary(readData()));
  }



  if (req.method === "GET" && url.pathname === "/api/radar/promotion-queue") {
    return json(res, 200, radarPromotionQueue(readRadar(), readData()));
  }

  if (req.method === "GET" && url.pathname === "/api/radar/research-queue") {
    return json(res, 200, radarResearchQueue(readRadar(), readData()));
  }

  if (req.method === "GET" && url.pathname === "/api/radar/evidence-capture") {
    return json(res, 200, radarEvidenceCaptureStatus(readRadar(), readData()));
  }

  if (req.method === "GET" && url.pathname === "/api/radar/research-assist") {
    return json(res, 200, radarResearchAssistQueue(readRadar(), readData()));
  }

  if (req.method === "GET" && url.pathname === "/api/radar/autotriage") {
    return json(res, 200, radarAutotriageStatus(readRadar(), readData()));
  }

  if (req.method === "POST" && url.pathname === "/api/radar/autotriage/run") {
    const assessment = applyRadarAutotriage(readRadar(), readData());
    if (assessment.config.enabled) writeRadar(assessment.candidates);
    return json(res, 200, { enabled:assessment.config.enabled, counts:assessment.counts, decisions:assessment.decisions });
  }

  if (req.method === "GET" && url.pathname === "/api/radar/discovery-runs") {
    return json(res, 200, radarDiscoveryRunSummary(readDiscoveryRuns()));
  }

  if (req.method === "GET" && url.pathname === "/api/radar/discovery-adapter") {
    return json(res, 200, discoveryExecutorStatus());
  }


  if (req.method === "GET" && url.pathname === "/api/radar/discovery-autonomy") {
    return json(res, 200, autonomousDiscoveryStatus());
  }

  if (req.method === "POST" && url.pathname === "/api/radar/discovery-autonomy/run") {
    const result = await runAutonomousDiscoveryCycle();
    return json(res, result.status === "Provider unavailable" ? 409 : 200, result);
  }

  if (req.method === "POST" && url.pathname === "/api/radar/discovery-jobs/run") {
    const input = await body(req);
    const plan = radarDiscoveryJobPlan(readRadar(), readData(), Date.now(), 10);
    const job = input.job && typeof input.job === "object"
      ? input.job
      : plan.jobs.find(item => item.job_id === String(input.job_id || ""));
    if (!job) return json(res, 404, { error: "Discovery job not found or no longer due. Submit the job object to run an archived plan." });
    const run = radarDiscoveryRunStart(job, Date.now());
    let runs = [...readDiscoveryRuns(), run].slice(-200);
    writeDiscoveryRuns(runs);
    if (!input.execute) return json(res, 202, run);

    try {
      const result = await executeDiscoveryJob(job);
      const candidates = readRadar();
      const opportunities = readData();
      const batch = radarDiscoveryBatch(result.candidates, run.source || {}, candidates, opportunities, { allow_duplicates:Boolean(input.allow_duplicates) });
      if (batch.accepted.length) {
        const triaged = applyRadarAutotriage(batch.candidates, opportunities);
        writeRadar(triaged.candidates);
      }
      const completed = radarDiscoveryRunComplete(run, result, batch, Date.now());
      completed.provider_metadata = result.provider_metadata || {};
      runs = readDiscoveryRuns();
      const index = runs.findIndex(item => item.run_id === run.run_id);
      if (index >= 0) runs[index] = completed; else runs.push(completed);
      writeDiscoveryRuns(runs.slice(-200));
      return json(res, 200, { run:completed, accepted:batch.accepted, skipped:batch.skipped });
    } catch (error) {
      const failed = radarDiscoveryRunComplete(run, { status:"Failed", error:error.message }, null, Date.now());
      runs = readDiscoveryRuns();
      const index = runs.findIndex(item => item.run_id === run.run_id);
      if (index >= 0) runs[index] = failed; else runs.push(failed);
      writeDiscoveryRuns(runs.slice(-200));
      const status = error.code === "DISCOVERY_ADAPTER_NOT_CONFIGURED" ? 409 : 502;
      return json(res, status, { error:error.message, run:failed });
    }
  }

  const discoveryRunCompleteMatch = url.pathname.match(/^\/api\/radar\/discovery-runs\/([^/]+)\/complete$/);
  if (req.method === "POST" && discoveryRunCompleteMatch) {
    const input = await body(req);
    const runs = readDiscoveryRuns();
    const index = runs.findIndex(run => run.run_id === discoveryRunCompleteMatch[1]);
    if (index < 0) return json(res, 404, { error: "Discovery run not found." });
    if (runs[index].status !== "Running") return json(res, 409, { error: "Discovery run is already closed." });
    let batch = null;
    if (input.status !== "Failed" && input.status !== "Skipped") {
      const items = Array.isArray(input.candidates) ? input.candidates : [];
      if (!items.length) return json(res, 400, { error: "At least one discovery candidate is required to complete a successful run." });
      const candidates = readRadar();
      const opportunities = readData();
      batch = radarDiscoveryBatch(items, runs[index].source || {}, candidates, opportunities, { allow_duplicates:Boolean(input.allow_duplicates) });
      if (batch.accepted.length) {
        const triaged = applyRadarAutotriage(batch.candidates, opportunities);
        writeRadar(triaged.candidates);
      }
    }
    const completed = radarDiscoveryRunComplete(runs[index], input, batch, Date.now());
    runs[index] = completed;
    writeDiscoveryRuns(runs.slice(-200));
    return json(res, 200, { run: completed, accepted: batch?.accepted || [], skipped: batch?.skipped || [] });
  }

  if (req.method === "GET" && url.pathname === "/api/radar/discovery-jobs") {
    const requestedLimit = Number(url.searchParams.get("limit") || 5);
    return json(res, 200, radarDiscoveryJobPlan(readRadar(), readData(), Date.now(), requestedLimit));
  }

  if (req.method === "GET" && url.pathname === "/api/radar/discovery-plan") {
    return json(res, 200, radarDiscoverySourceController(readRadar(), readData()));
  }

  if (req.method === "GET" && url.pathname === "/api/radar/sources") {
    const candidates = readRadar();
    const opportunities = readData();
    return json(res, 200, {
      sources: radarSourcePerformance(candidates, opportunities),
      candidate_count: candidates.length
    });
  }

  if (req.method === "POST" && url.pathname === "/api/radar/discoveries") {
    const input = await body(req);
    const candidates = readRadar();
    const opportunities = readData();
    const items = Array.isArray(input.candidates) ? input.candidates : [];
    if (!items.length) return json(res, 400, { error: "At least one discovery candidate is required." });
    const batch = radarDiscoveryBatch(items, input.source || {}, candidates, opportunities, { allow_duplicates:Boolean(input.allow_duplicates) });
    let finalCandidates = batch.candidates;
    if (batch.accepted.length) {
      const triaged = applyRadarAutotriage(batch.candidates, opportunities);
      finalCandidates = triaged.candidates;
      writeRadar(finalCandidates);
    }
    return json(res, 201, {
      source: batch.source,
      summary: batch.summary,
      accepted: batch.accepted,
      skipped: batch.skipped,
      source_performance: radarSourcePerformance(finalCandidates, opportunities),
      autotriage: radarAutotriageStatus(finalCandidates, opportunities)
    });
  }

  if (req.method === "GET" && url.pathname === "/api/radar/refresh") {
    return json(res, 200, radarPortfolioRefresh(readRadar(), readData()));
  }

  const radarReviewMatch = url.pathname.match(/^\/api\/radar\/(\d+)\/review$/);
  if (req.method === "POST" && radarReviewMatch) {
    const input = await body(req);
    const candidates = readRadar();
    const index = candidates.findIndex(item=>Number(item.id)===Number(radarReviewMatch[1]));
    if (index < 0) return json(res,404,{error:"Radar candidate not found."});
    const reviewed = normalizeRadarCandidate(input || {}, candidates[index]);
    reviewed.id=candidates[index].id;
    reviewed.created_at=candidates[index].created_at;
    reviewed.last_reviewed_at=new Date().toISOString();
    reviewed.updated_at=reviewed.last_reviewed_at;
    candidates[index]=reviewed;
    writeRadar(candidates);
    return json(res,200,{candidate:reviewed,review_cadence:radarReviewCadence(reviewed)});
  }

  if (req.method === "GET" && url.pathname === "/api/radar/brief") {
    const candidates = readRadar();
    const opportunities = readData();
    return json(res, 200, radarOperatingBrief(candidates, opportunities));
  }

  if (req.method === "GET" && url.pathname === "/api/next-moves") {
    return json(res, 200, atlasUnifiedNextMoves(readData(), readRadar()));
  }

  if (req.method === "GET" && url.pathname === "/api/radar") {
    const candidates = readRadar();
    const opportunities = readData();
    const enriched = candidates.map(candidate => {
      const duplicateMatches = radarDuplicateMatches(candidate, candidates, opportunities, candidate.id);
      const recommendation = radarCandidateRecommendation(candidate, duplicateMatches);
      const triage = candidate.triage || radarAutotriageDecision(candidate, candidates, opportunities);
      return { ...candidate, duplicate_matches: duplicateMatches, recommendation, triage, promotion_review: radarPromotionReviewState(candidate, candidates, opportunities), research_action: radarResearchActionForCandidate(candidate, candidates, opportunities), test_blueprint: radarTestBlueprint(candidate, recommendation), review_cadence: radarReviewCadence(candidate) };
    });
    return json(res, 200, {
      candidates: [...enriched].sort((a,b)=>Number(b.radar_score||0)-Number(a.radar_score||0)),
      summary: radarSummary(candidates),
      recommendation_queue: radarRecommendationQueue(candidates, opportunities),
      refresh: radarPortfolioRefresh(candidates, opportunities),
      source_performance: radarSourcePerformance(candidates, opportunities),
      discovery_plan: radarDiscoverySourceController(candidates, opportunities),
      discovery_jobs: radarDiscoveryJobPlan(candidates, opportunities),
      discovery_runs: radarDiscoveryRunSummary(readDiscoveryRuns()),
      discovery_adapter: discoveryExecutorStatus(),
      discovery_autonomy: autonomousDiscoveryStatus(),
      autotriage: radarAutotriageStatus(candidates, opportunities),
      promotion_queue: radarPromotionQueue(candidates, opportunities),
      research_queue: radarResearchQueue(candidates, opportunities),
      evidence_capture: radarEvidenceCaptureStatus(candidates, opportunities),
      research_assist: radarResearchAssistQueue(candidates, opportunities)
    });
  }

  if (req.method === "POST" && url.pathname === "/api/radar") {
    const input = await body(req);
    const candidates = readRadar();
    const candidate = normalizeRadarCandidate(input);
    if (!candidate.name || !candidate.category || !candidate.description) return json(res, 400, { error: "Name, category, and description are required." });
    const duplicateMatches = radarDuplicateMatches(candidate, candidates, readData());
    if (duplicateMatches.some(item => item.level === "Likely duplicate") && !input.allow_duplicate) {
      return json(res, 409, { error: "Likely duplicate detected.", duplicate_matches: duplicateMatches });
    }
    candidate.duplicate_matches = duplicateMatches;
    candidate.id = candidates.reduce((max,item)=>Math.max(max,Number(item.id)||0),0)+1;
    candidate.created_at = new Date().toISOString();
    candidate.updated_at = candidate.created_at;
    candidates.push(candidate);
    candidate.triage = radarAutotriageDecision(candidate, candidates, readData());
    writeRadar(candidates);
    return json(res, 201, candidate);
  }

  const radarMatch = url.pathname.match(/^\/api\/radar\/(\d+)$/);
  if (req.method === "PATCH" && radarMatch) {
    const input = await body(req);
    const candidates = readRadar();
    const index = candidates.findIndex(item=>Number(item.id)===Number(radarMatch[1]));
    if (index < 0) return json(res, 404, { error: "Radar candidate not found." });
    const updated = normalizeRadarCandidate(input, candidates[index]);
    const duplicateMatches = radarDuplicateMatches(updated, candidates, readData(), candidates[index].id);
    if (duplicateMatches.some(item => item.level === "Likely duplicate") && !input.allow_duplicate) {
      return json(res, 409, { error: "Likely duplicate detected.", duplicate_matches: duplicateMatches });
    }
    updated.duplicate_matches = duplicateMatches;
    updated.id = candidates[index].id;
    updated.created_at = candidates[index].created_at;
    updated.updated_at = new Date().toISOString();
    candidates[index] = updated;
    updated.triage = radarAutotriageDecision(updated, candidates, readData());
    writeRadar(candidates);
    return json(res, 200, updated);
  }

  const researchAssistMatch = url.pathname.match(/^\/api\/radar\/(\d+)\/research-assist$/);
  if (req.method === "POST" && researchAssistMatch) {
    const input = await body(req);
    const candidates = readRadar();
    const index = candidates.findIndex(item=>Number(item.id)===Number(researchAssistMatch[1]));
    if (index < 0) return json(res, 404, { error:"Radar candidate not found." });
    const candidate = candidates[index];
    candidate.triage = radarAutotriageDecision(candidate, candidates, readData());
    const job = radarResearchAssistJob(candidate, candidates, readData());
    if (!job) return json(res, 409, { error:"Candidate does not currently have a pending or deferred research action." });
    if (!input?.execute) return json(res, 200, {
      ...job,
      provider:radarResearchAssistConfig().provider,
      executable:radarResearchAssistConfig().executable,
      guidance:"Set execute=true to run this brief through the configured provider. Provider findings remain pending until explicitly accepted into evidence."
    });
    let result;
    try { result = await executeResearchAssistJob(job); }
    catch (error) { return json(res, error.code === "RESEARCH_ASSIST_DISABLED" || error.code === "RESEARCH_PROVIDER_NOT_CONFIGURED" ? 409 : 502, { error:error.message }); }
    const now=new Date().toISOString();
    const run={
      run_id:`research-run-${crypto.randomUUID()}`,
      job_id:job.job_id,
      candidate_id:candidate.id,
      started_at:now,
      completed_at:now,
      status:result.status,
      provider_metadata:result.provider_metadata || {},
      findings:(result.findings || []).map((finding,index)=>({ finding_id:`finding-${index+1}`, ...finding, review_state:"pending" }))
    };
    const history=Array.isArray(candidate.research_assist_runs) ? [...candidate.research_assist_runs] : [];
    history.push(run);
    candidate.research_assist_runs=history.slice(-25);
    candidate.updated_at=now;
    candidates[index]=candidate;
    writeRadar(candidates);
    return json(res, 200, { run, guidance:"Review each source-backed finding. Accepting a finding sends it through Build 88 evidence capture; rejection preserves the audit record without changing evidence." });
  }

  const researchFindingMatch = url.pathname.match(/^\/api\/radar\/(\d+)\/research-findings\/([^/]+)$/);
  if (req.method === "POST" && researchFindingMatch) {
    const input=await body(req);
    const candidates=readRadar();
    const index=candidates.findIndex(item=>Number(item.id)===Number(researchFindingMatch[1]));
    if (index < 0) return json(res,404,{error:"Radar candidate not found."});
    const candidate=candidates[index];
    const runs=Array.isArray(candidate.research_assist_runs) ? candidate.research_assist_runs : [];
    let target=null;
    for (let r=runs.length-1;r>=0 && !target;r--) {
      const finding=(runs[r].findings || []).find(item=>String(item.finding_id)===String(researchFindingMatch[2]));
      if (finding) target={run:r,finding};
    }
    if (!target) return json(res,404,{error:"Research finding not found."});
    let review;
    try { review=radarResearchFindingReview(candidate,{...target.finding,...input}); }
    catch(error){ return json(res,400,{error:error.message}); }
    target.finding.review_state=review.decision;
    target.finding.reviewed_at=review.reviewed_at;
    target.finding.reviewed_by=review.actor;
    if (review.decision === "accept") {
      let captured;
      try { captured=applyRadarEvidenceCapture(candidate,{...target.finding,source:target.finding.source_url || target.finding.source,actor:review.actor},candidates,readData()); }
      catch(error){ return json(res,400,{error:error.message}); }
      captured.candidate.research_assist_runs=runs;
      candidates[index]=captured.candidate;
      writeRadar(candidates);
      return json(res,200,{decision:"accept",candidate:captured.candidate,evidence_event:captured.event});
    }
    candidates[index]=candidate;
    writeRadar(candidates);
    return json(res,200,{decision:review.decision,candidate});
  }

  const evidenceCaptureMatch = url.pathname.match(/^\/api\/radar\/(\d+)\/evidence$/);
  if (req.method === "POST" && evidenceCaptureMatch) {
    const input = await body(req);
    const candidates = readRadar();
    const index = candidates.findIndex(item=>Number(item.id)===Number(evidenceCaptureMatch[1]));
    if (index < 0) return json(res, 404, { error:"Radar candidate not found." });
    let captured;
    try { captured = applyRadarEvidenceCapture(candidates[index], input || {}, candidates, readData()); }
    catch (error) { return json(res, 400, { error:error.message }); }
    candidates[index] = captured.candidate;
    writeRadar(candidates);
    return json(res, 201, { candidate:captured.candidate, evidence_event:captured.event, evidence_capture:radarEvidenceCaptureStatus(candidates, readData()) });
  }

  const researchActionMatch = url.pathname.match(/^\/api\/radar\/(\d+)\/research-action$/);
  if (req.method === "POST" && researchActionMatch) {
    const input = await body(req);
    const candidates = readRadar();
    const index = candidates.findIndex(item=>Number(item.id)===Number(researchActionMatch[1]));
    if (index < 0) return json(res, 404, { error:"Radar candidate not found." });
    const candidate = candidates[index];
    const data = readData();
    candidate.triage = radarAutotriageDecision(candidate, candidates, data);
    const current = radarResearchActionForCandidate(candidate, candidates, data);
    if (current.state === "not_applicable") return json(res, 409, { error:"Candidate does not currently have a research action.", triage:candidate.triage });
    let reviewed;
    try { reviewed = applyRadarResearchActionReview(candidate, input?.decision, { actor:input?.actor || "user", note:input?.note || "", current_action:current }); }
    catch (error) { return json(res, 400, { error:error.message }); }
    candidates[index]=reviewed.candidate;
    writeRadar(candidates);
    return json(res, 200, { candidate:reviewed.candidate, research_action:reviewed.candidate.research_action, audit_event:reviewed.event });
  }

  const radarBlueprintMatch = url.pathname.match(/^\/api\/radar\/(\d+)\/test-blueprint$/);
  if (req.method === "GET" && radarBlueprintMatch) {
    const candidates = readRadar();
    const candidate = candidates.find(item=>Number(item.id)===Number(radarBlueprintMatch[1]));
    if (!candidate) return json(res, 404, { error: "Radar candidate not found." });
    const duplicateMatches = radarDuplicateMatches(candidate, candidates, readData(), candidate.id);
    const recommendation = radarCandidateRecommendation(candidate, duplicateMatches);
    return json(res, 200, { recommendation, blueprint: radarTestBlueprint(candidate, recommendation) });
  }

  const promotionReviewMatch = url.pathname.match(/^\/api\/radar\/(\d+)\/promotion-review$/);
  if (req.method === "POST" && promotionReviewMatch) {
    const input = await body(req);
    const candidates = readRadar();
    const index = candidates.findIndex(item=>Number(item.id)===Number(promotionReviewMatch[1]));
    if (index < 0) return json(res, 404, { error:"Radar candidate not found." });
    const candidate = candidates[index];
    if (["Promoted","Dismissed"].includes(candidate.stage)) return json(res, 409, { error:`Radar candidate is already ${candidate.stage.toLowerCase()}.` });
    const data = readData();
    const duplicateMatches = radarDuplicateMatches(candidate, candidates, data, candidate.id);
    const recommendation = radarCandidateRecommendation(candidate, duplicateMatches);
    candidate.triage = radarAutotriageDecision(candidate, candidates, data);
    const decision = String(input?.decision || "").trim().toLowerCase();
    if (decision === "approve" && !recommendation.ready && !input?.force) {
      return json(res, 409, { error:"Candidate is not ready for promotion approval.", recommendation, test_blueprint:radarTestBlueprint(candidate, recommendation) });
    }
    let reviewed;
    try { reviewed = applyRadarPromotionReview(candidate, decision, { actor:input?.actor || "user", note:input?.note || "" }); }
    catch (error) { return json(res, 400, { error:error.message }); }
    if (decision !== "approve") {
      candidates[index] = reviewed.candidate;
      writeRadar(candidates);
      return json(res, 200, { candidate:candidates[index], promotion_review:radarPromotionReviewState(candidates[index], candidates, data), audit_event:reviewed.event });
    }
    const blueprint = radarTestBlueprint(candidate, recommendation);
    const baseOpportunity = opportunityFromRadarCandidate(candidate, blueprint);
    const now = new Date().toISOString();
    const opportunity = {
      id:data.reduce((max,item)=>Math.max(max,Number(item.id)||0),0)+1,
      ...baseOpportunity,
      notes:[`Approved through Build 86 Promotion Gate (Radar Score ${candidate.radar_score}).`, candidate.source ? `Source: ${candidate.source}` : "", candidate.evidence.length ? `Evidence (${candidate.evidence_strength || "Unrated"}): ${candidate.evidence.join("; ")}` : "", `30-day test blueprint prepared with $${blueprint.approved_budget} budget and ${blueprint.target_launch_days}-day launch target.`, reviewed.event.note ? `Approval note: ${reviewed.event.note}` : "", candidate.notes].filter(Boolean).join(" "),
      created_at:now, updated_at:now, ...pausedFields("Researching")
    };
    data.push(opportunity);
    writeData(data);
    reviewed.candidate.stage = "Promoted";
    reviewed.candidate.promoted_opportunity_id = opportunity.id;
    reviewed.candidate.promoted_at = now;
    reviewed.candidate.updated_at = now;
    reviewed.candidate.promotion_review = { ...reviewed.candidate.promotion_review, state:"promoted", promoted_opportunity_id:opportunity.id };
    candidates[index] = reviewed.candidate;
    writeRadar(candidates);
    return json(res, 201, { candidate:candidates[index], opportunity:withReviewState(opportunity), audit_event:reviewed.event });
  }

  const promoteRadarMatch = url.pathname.match(/^\/api\/radar\/(\d+)\/promote$/);
  if (req.method === "POST" && promoteRadarMatch) {
    const input = await body(req);
    const candidates = readRadar();
    const index = candidates.findIndex(item=>Number(item.id)===Number(promoteRadarMatch[1]));
    if (index < 0) return json(res, 404, { error: "Radar candidate not found." });
    const candidate = candidates[index];
    if (candidate.stage === "Promoted") return json(res, 409, { error: "Radar candidate has already been promoted." });
    const data = readData();
    const duplicateMatches = radarDuplicateMatches(candidate, candidates, data, candidate.id);
    const recommendation = radarCandidateRecommendation(candidate, duplicateMatches);
    if (!recommendation.ready && !input?.force) {
      return json(res, 409, { error: "Candidate is not ready to promote.", recommendation, test_blueprint: radarTestBlueprint(candidate, recommendation) });
    }
    const blueprint = radarTestBlueprint(candidate, recommendation);
    const baseOpportunity = opportunityFromRadarCandidate(candidate, blueprint);
    const opportunity = {
      id: data.reduce((max,item)=>Math.max(max,Number(item.id)||0),0)+1,
      ...baseOpportunity,
      notes: [`Promoted from Opportunity Radar (Radar Score ${candidate.radar_score}).`, candidate.source ? `Source: ${candidate.source}` : "", candidate.evidence.length ? `Evidence (${candidate.evidence_strength || "Unrated"}): ${candidate.evidence.join("; ")}` : "", `30-day test blueprint prepared with $${blueprint.approved_budget} budget and ${blueprint.target_launch_days}-day launch target.`, candidate.notes].filter(Boolean).join(" "),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      ...pausedFields("Researching")
    };
    data.push(opportunity);
    writeData(data);
    const legacyReview = applyRadarPromotionReview(candidate, "approve", { actor:input?.actor || "user", note:input?.note || "Approved through legacy promote endpoint." });
    candidates[index] = { ...legacyReview.candidate, stage:"Promoted", promoted_opportunity_id: opportunity.id, promoted_at:new Date().toISOString(), updated_at:new Date().toISOString(), promotion_review:{ ...legacyReview.candidate.promotion_review, state:"promoted", promoted_opportunity_id:opportunity.id } };
    writeRadar(candidates);
    return json(res, 201, { candidate:candidates[index], opportunity:withReviewState(opportunity) });
  }

  if (req.method === "GET" && url.pathname === "/api/opportunities") {
    const data = readData().map(withReviewState);
    return json(res, 200, data);
  }

  if (req.method === "POST" && url.pathname === "/api/opportunities") {
    const input = await body(req);
    const data = readData();
    const status = VALID_STATUSES.includes(input.status) ? input.status : "Researching";
    const opportunity = {
      id: data.reduce((max, item) => Math.max(max, Number(item.id) || 0), 0) + 1,
      name: String(input.name || "").trim(),
      category: String(input.category || "").trim(),
      description: String(input.description || "").trim(),
      revenue_model: String(input.revenue_model || ""),
      startup_cost: Number(input.startup_cost || 0),
      setup_time_hours: Number(input.setup_time_hours || 0),
      ongoing_effort: input.ongoing_effort || "Low",
      risk: input.risk || "Low",
      scalability: input.scalability || "Medium",
      confidence: Number(input.confidence || 0),
      speed_to_revenue: Number(input.speed_to_revenue || 0),
      passivity: Number(input.passivity || 0),
      atlas_fit: Number(input.atlas_fit || 0),
      status,
      actual_revenue: Number(input.actual_revenue || 0),
      actual_profit: Number(input.actual_profit || 0),
      notes: String(input.notes || ""),
      atlas_score: score(input),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      ...pausedFields(status)
    };
    if (status === "Testing") opportunity.experiment = emptyExperiment();
    if (!opportunity.name || !opportunity.category || !opportunity.description) {
      return json(res, 400, { error: "Name, category, and description are required." });
    }
    data.push(opportunity);
    writeData(data);
    return json(res, 201, withReviewState(opportunity));
  }

  const opportunityMatch = url.pathname.match(/^\/api\/opportunities\/(\d+)$/);
  if (req.method === "PATCH" && opportunityMatch) {
    const input = await body(req);
    const data = readData();
    const index = data.findIndex(item => Number(item.id) === Number(opportunityMatch[1]));
    if (index === -1) return json(res, 404, { error: "Opportunity not found." });
    const editable = ["name", "category", "description", "revenue_model", "startup_cost", "setup_time_hours", "ongoing_effort", "risk", "scalability", "confidence", "speed_to_revenue", "passivity", "atlas_fit", "notes"];
    const updated = { ...data[index] };
    editable.forEach(field => {
      if (!(field in input)) return;
      updated[field] = ["startup_cost", "setup_time_hours", "confidence", "speed_to_revenue", "passivity", "atlas_fit"].includes(field)
        ? Number(input[field] || 0) : String(input[field] ?? "").trim();
    });
    if (!updated.name || !updated.category || !updated.description) return json(res, 400, { error: "Name, category, and description are required." });
    updated.atlas_score = score(updated);
    updated.updated_at = new Date().toISOString();
    data[index] = updated;
    writeData(data);
    return json(res, 200, withReviewState(updated));
  }

  const statusMatch = url.pathname.match(/^\/api\/opportunities\/(\d+)\/status$/);
  if (req.method === "PATCH" && statusMatch) {
    const input = await body(req);
    if (!VALID_STATUSES.includes(input.status)) {
      return json(res, 400, { error: `Status must be one of: ${VALID_STATUSES.join(", ")}` });
    }
    const data = readData();
    const index = data.findIndex(item => Number(item.id) === Number(statusMatch[1]));
    if (index === -1) return json(res, 404, { error: "Opportunity not found." });
    const current = data[index];
    if (current.status === "Testing" && ["Active", "Scaled", "Killed"].includes(input.status)) {
      return json(res, 409, { error: "Use the Day-30 decision workflow to move a Testing opportunity to Active or Killed." });
    }
    if (input.status === "Scaled" && (current.status !== "Active" || Number(current.final_result?.labor_adjusted_profit || 0) <= 0)) {
      return json(res, 409, { error: "Scaled status requires an Active opportunity with positive labor-adjusted profit." });
    }
    data[index] = {
      ...current,
      status: input.status,
      ...pausedFields(input.status, input.status === "Paused" ? current : {}),
      updated_at: new Date().toISOString()
    };
    if (input.status === "Testing" && !data[index].experiment) data[index].experiment = emptyExperiment();
    writeData(data);
    return json(res, 200, withReviewState(data[index]));
  }

  const experimentMatch = url.pathname.match(/^\/api\/opportunities\/(\d+)\/experiment$/);
  if (req.method === "PATCH" && experimentMatch) {
    const input = await body(req);
    const data = readData();
    const index = data.findIndex(item => Number(item.id) === Number(experimentMatch[1]));
    if (index === -1) return json(res, 404, { error: "Opportunity not found." });
    if (data[index].status !== "Testing") return json(res, 409, { error: "Only Testing opportunities have an active Testing Workspace." });
    const experiment = rollupCheckpointMetrics(normalizeExperiment(input, data[index].experiment || {}));
    data[index] = {
      ...data[index],
      experiment,
      actual_revenue: experiment.revenue,
      actual_profit: experiment.revenue - experiment.expenses,
      updated_at: new Date().toISOString()
    };
    writeData(data);
    return json(res, 200, withReviewState(data[index]));
  }

  const decisionMatch = url.pathname.match(/^\/api\/opportunities\/(\d+)\/decision$/);
  if (req.method === "POST" && decisionMatch) {
    const input = await body(req);
    if (!FINAL_DECISIONS.includes(input.decision)) return json(res, 400, { error: `Decision must be one of: ${FINAL_DECISIONS.join(", ")}` });
    const data = readData();
    const index = data.findIndex(item => Number(item.id) === Number(decisionMatch[1]));
    if (index === -1) return json(res, 404, { error: "Opportunity not found." });
    if (data[index].status !== "Testing") return json(res, 409, { error: "Only Testing opportunities can receive a Day-30 decision." });
    const evaluated = withReviewState(data[index]);
    if (!evaluated.decision_ready) return json(res, 409, { error: "The experiment is not ready for a final decision. Complete all four checkpoints, reach the end date, or record an early-termination recommendation." });
    const overrideReason = String(input.override_reason || "").trim();
    if (input.decision !== evaluated.atlas_recommendation && !overrideReason) {
      return json(res, 400, { error: "A documented override reason is required when the final decision differs from Atlas's recommendation." });
    }
    const experiment = normalizeExperiment(data[index].experiment || {});
    const failedCount = experiment.failed_test_count + (evaluated.cash_profit <= 0 ? 1 : 0);
    const result = {
      decided_at: new Date().toISOString(),
      decision: input.decision,
      atlas_recommendation: evaluated.atlas_recommendation,
      recommendation_rationale: evaluated.recommendation_rationale,
      override_reason: overrideReason,
      summary: String(input.summary || "").trim(),
      fair_test_exposure_met: experiment.fair_test_exposure_met,
      cash_profit: evaluated.cash_profit,
      labor_rate: LABOR_RATE,
      labor_cost: evaluated.labor_cost,
      labor_adjusted_profit: evaluated.labor_adjusted_profit,
      failed_test_count: failedCount
    };
    const history = [...(Array.isArray(data[index].experiment_history) ? data[index].experiment_history : []), { experiment, result }];
    const statusMap = { "Move to Active": "Active", "Revise and Retest": "Testing", "Pause": "Paused", "Kill": "Killed" };
    const nextStatus = statusMap[input.decision];
    const updated = { ...data[index], status: nextStatus, final_result: result, experiment_history: history, updated_at: result.decided_at };
    if (input.decision === "Revise and Retest") {
      updated.experiment = {
        ...emptyExperiment(),
        demand_evidence: experiment.demand_evidence,
        offer: experiment.offer,
        sales_channel: experiment.sales_channel,
        approved_budget: experiment.approved_budget,
        budget_approval_confirmed: experiment.budget_approval_confirmed,
        launch_tasks: experiment.launch_tasks.map(task => ({ ...task, completed: false })),
        failed_test_count: failedCount,
        notes: `Retest created after ${result.decided_at.slice(0, 10)} decision. ${result.summary}`.trim()
      };
      Object.assign(updated, pausedFields("Testing"));
    } else {
      updated.experiment = experiment;
      Object.assign(updated, pausedFields(nextStatus));
    }
    data[index] = updated;
    writeData(data);
    return json(res, 200, withReviewState(updated));
  }

  return json(res, 404, { error: "Not found." });
}

function staticFile(req, res, url) {
  const requested = url.pathname === "/" ? "index.html" : url.pathname.slice(1);
  const filePath = path.resolve(PUBLIC_DIR, requested);
  if (!filePath.startsWith(`${PUBLIC_DIR}${path.sep}`) && filePath !== path.join(PUBLIC_DIR, "index.html")) {
    res.writeHead(403); return res.end("Forbidden");
  }
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    res.writeHead(404); return res.end("Not found");
  }
  const ext = path.extname(filePath);
  const types = { ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8" };
  res.writeHead(200, { "Content-Type": types[ext] || "application/octet-stream" });
  fs.createReadStream(filePath).pipe(res);
}

const server = http.createServer(async (req, res) => {
  const started = Date.now();
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "same-origin");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Cache-Control", req.url?.startsWith("/api/") ? "no-store" : "no-cache");
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  try {
    if (url.pathname !== "/api/health" && !isAuthorized(req)) return unauthorized(res);
    if (url.pathname.startsWith("/api/")) await api(req, res, url);
    else staticFile(req, res, url);
  } catch (error) {
    console.error(JSON.stringify({ level: "error", event: "request_failed", method: req.method, path: url.pathname, message: error.message, stack: process.env.NODE_ENV === "production" ? undefined : error.stack }));
    if (!res.headersSent) json(res, error.message === "Invalid JSON" ? 400 : 500, { error: process.env.NODE_ENV === "production" ? "Internal server error" : error.message });
  } finally {
    if (process.env.NODE_ENV === "production") {
      console.log(JSON.stringify({ level: "info", event: "request", method: req.method, path: url.pathname, status: res.statusCode, duration_ms: Date.now() - started }));
    }
  }
});

function shutdown(signal) {
  console.log(`Atlas received ${signal}; shutting down.`);
  server.close(() => {
    try { storage.close(); } finally { process.exit(0); }
  });
  setTimeout(() => process.exit(1), 10000).unref();
}

if (require.main === module) {
  const access = requireValidAuthConfig();
  process.once("SIGTERM", () => shutdown("SIGTERM"));
  process.once("SIGINT", () => shutdown("SIGINT"));
  server.listen(PORT, "0.0.0.0", () => {
    console.log(`Atlas ${APP_VERSION} is running on port ${PORT} (${access.enabled ? "access protected" : "local/unlocked"})`);
    const autonomy = autonomousDiscoveryConfig();
    if (autonomy.enabled) {
      const runCycle = () => runAutonomousDiscoveryCycle().catch(error => console.error(JSON.stringify({ level:"error", event:"autonomous_discovery_failed", message:error.message })));
      setTimeout(runCycle, 5000).unref();
      setInterval(runCycle, autonomy.interval_minutes * 60 * 1000).unref();
      console.log(`Atlas autonomous discovery enabled: every ${autonomy.interval_minutes} minutes, max ${autonomy.max_jobs_per_cycle} job(s) per cycle.`);
    }
  });
}

module.exports = { server, storage, authConfig, isAuthorized, requireValidAuthConfig, pausedFields, withReviewState, emptyExperiment, emptyCheckpoint, emptyIntervention, normalizeInterventions, interventionEvaluation, normalizeCheckpoints, rollupCheckpointMetrics, normalizeExperiment, decisionState, experimentState, nextActionState, experimentHealth, interventionPlan, normalizeDeferReason, FOCUS_DEFER_REASONS, normalizeFocusState, focusStateForOpportunity, focusFrictionDiagnosis, focusFrictionResolution,
  focusResolutionEffectiveness,
  focusResolutionEffectivenessSummary, effortEvidenceLevel, focusEffortCalibration, calibrateTimedAction, percentile, focusCapacityProfile, capacityFitForAction, normalizeWorkBlockMinutes, nextWorkBlockPlan, normalizeDailyPlanMinutes, dailyWorkPlan, dailyPlanAdaptation, dailyPlanDensityLearning, densityEvidenceRank, lastDailyPlanDensitySnapshot, dailyPlanDensityController, localHour, executionTimeWindow, timeWindowEvidenceLevel, dailyPlanTimeWindowLearning, opportunityTimeWindowFit, dailyPlanTimeWindowPriority, workTypeForAction, workTypeLabel, dailyPlanWorkTypeLearning, compositionEvidenceLevel, dailyPlanCompositionLearning, dailyPlanCompositionAdjustment, sequenceEvidenceLevel, dailyPlanSequenceLearning, dailyPlanSequenceAdjustment, depthEvidenceLevel, dailyPlanDepthLearning, dailyPlanDepthController, dailyPlanDepthRecoveryLearning, dailyPlanDepthRecoveryController, blockSizeEvidenceLevel, blockSizeBand, dailyPlanBlockSizeLearning, dailyPlanBlockSizeController, blockSizeOutcomeScore, dailyPlanBlockSizeOutcomeLearning, dailyPlanBlockSizeOutcomeController, localDateKey, dailyPlanExecutionSummary, resolutionStrategyFromEvidence, resolutionStrategyEvidenceLevel, lastResolutionStrategySnapshot, resolutionPolicyForMode, resolutionStrategyGuardrail, focusResolutionStrategy, focusResolutionStrategySummary, focusFrictionSummary, focusExecutionSummary, focusScorecard, focusFeedbackForOpportunity, adaptiveNextAction, adaptiveActionLearning, adaptiveActionPolicy, adaptiveStrategyEvidence, adaptivePolicyForMode, lastAdaptiveStrategySnapshot, adaptiveStrategyGuardrail, adaptiveStrategyForOpportunity, adaptiveStrategyContext, opportunityIntelligence, intelligenceQueue, commandCenter, portfolioSummary, radarScore, normalizeEvidenceRecord, radarEvidenceStrength, radarStageForScore, radarSimilarity, radarDuplicateMatches, radarEvidenceGaps, radarCandidateRecommendation, radarRecommendationQueue, radarAutotriageConfig, radarAutotriageDecision, applyRadarAutotriage, radarAutotriageStatus, radarResearchActionForCandidate, radarResearchQueue, applyRadarResearchActionReview, applyRadarEvidenceCapture, radarEvidenceCaptureStatus, radarResearchAssistConfig, radarResearchAssistQueue, radarResearchAssistJob, researchAssistPrompt, parseResearchAssistResult, executeResearchAssistJob, radarResearchFindingReview, radarPromotionReviewState, radarPromotionQueue, applyRadarPromotionReview, radarTestBlueprint, opportunityFromRadarCandidate, normalizeDiscoverySource, radarDiscoveryCandidate, radarSourcePerformance, radarDiscoveryCadenceForSource, radarDiscoverySourceController, radarDiscoveryAdapterForType, radarDiscoveryJobPlan, discoveryExecutorConfig, discoveryExecutorStatus, autonomousDiscoveryConfig, autonomousDiscoveryStatus, autonomousDiscoveryEligibleJobs, runAutonomousDiscoveryCycle, radarDiscoveryRunnerAdapter, discoveryJobPayload, openAIDiscoveryPrompt, extractOpenAIResponseText, parseOpenAIDiscoveryResult, executeDiscoveryJob, radarDiscoveryRunStart, radarDiscoveryRunComplete, radarDiscoveryRunSummary, radarDiscoveryBatch, radarReviewCadence, radarRefreshQueue, radarPortfolioRefresh, radarOperatingBrief, atlasUnifiedNextMoves, normalizeRadarCandidate, radarSummary, RADAR_STAGES, VALID_STATUSES, FINAL_DECISIONS, LABOR_RATE, TRAVEL_STATUSES, readTravel, writeTravel, travelSummary, destinationScore };
