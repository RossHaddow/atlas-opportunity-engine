const http = require("node:http");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { createStorage } = require("./storage");
const { URL } = require("node:url");

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
    defer_reason: normalizeDeferReason(focus.defer_reason),
    history
  };
}

function focusStateForOpportunity(opportunity, now = Date.now()) {
  return normalizeFocusState(opportunity.focus || {}, now);
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

function focusFrictionSummary(opportunities, now = Date.now(), days = 14) {
  const diagnoses = opportunities.map(item => ({ id: item.id, name: item.name, ...focusFrictionDiagnosis(item, now, days) }));
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

  return {
    mode: "micro",
    action,
    estimated_minutes: estimatedMinutes,
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
  let recommendation = strategicRecommendation;
  if (executionFeedback.priority_adjustment < 0 && item.status !== "Killed") recommendation = `Shrink the next action, then: ${strategicRecommendation}`;
  return { id:item.id, name:item.name, status:item.status, work_priority_score:score, recommendation, strategic_recommendation: strategicRecommendation, adaptive_next_action: adaptive, adaptive_strategy: resolvedAdaptivePolicy || null, reasons, atlas_score:base, health_label:health?.health_label || null, next_action_date:item.next_action_date || null, focus, execution_feedback: executionFeedback };
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

function commandCenter(opportunities, now = Date.now()) {
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
      const actionMode = intelligence.adaptive_next_action?.mode || 'standard';
      const estimatedMinutes = intelligence.adaptive_next_action?.estimated_minutes ?? null;
      const strategyEvidence = appliedStrategy?.evidence?.level || adaptiveContext.portfolioPolicy?.evidence?.level || adaptiveStrategyEvidence(adaptiveContext.learning).level;
      next = { ...current, status: 'active', action: recommendation, action_mode: actionMode, estimated_minutes: estimatedMinutes, started_at: stamp, deferred_until: null, completed_at: null, defer_reason: '' };
      history.push({ event: 'started', action: recommendation, action_mode: actionMode, estimated_minutes: estimatedMinutes, adaptive_strategy_mode: appliedStrategy?.mode || 'learning', adaptive_strategy_scope: appliedStrategy?.scope || 'portfolio', adaptive_strategy_evidence: strategyEvidence, at: stamp });
    } else if (action === 'complete') {
      const completedAction = current.action || recommendation;
      const deferredUntil = new Date(now + 24 * 60 * 60 * 1000).toISOString();
      next = { ...current, status: 'completed', action: completedAction, action_mode: current.action_mode || intelligence.adaptive_next_action?.mode || 'standard', estimated_minutes: current.estimated_minutes ?? intelligence.adaptive_next_action?.estimated_minutes ?? null, completed_at: stamp, deferred_until: deferredUntil, defer_reason: '' };
      const durationMinutes = current.started_at ? Math.max(0, Math.round((now - Date.parse(current.started_at)) / 60000)) : 0;
      history.push({ event: 'completed', action: completedAction, action_mode: next.action_mode, estimated_minutes: next.estimated_minutes, at: stamp, hidden_until: deferredUntil, duration_minutes: durationMinutes });
    } else {
      const days = Math.max(1, Math.min(30, Number(input.days || 1)));
      const deferReason = normalizeDeferReason(input.reason);
      if (input.reason && !deferReason) return json(res, 400, { error: "Unknown defer reason." });
      const deferredUntil = new Date(now + days * 24 * 60 * 60 * 1000).toISOString();
      const deferredAction = current.action || recommendation;
      next = { ...current, status: 'deferred', action: deferredAction, action_mode: current.action_mode || intelligence.adaptive_next_action?.mode || 'standard', estimated_minutes: current.estimated_minutes ?? intelligence.adaptive_next_action?.estimated_minutes ?? null, deferred_until: deferredUntil, defer_reason: deferReason };
      const durationMinutes = current.started_at ? Math.max(0, Math.round((now - Date.parse(current.started_at)) / 60000)) : 0;
      history.push({ event: 'deferred', action: deferredAction, action_mode: next.action_mode, estimated_minutes: next.estimated_minutes, defer_reason: deferReason || null, at: stamp, deferred_until: deferredUntil, duration_minutes: durationMinutes });
    }
    next.history = history.slice(-100);
    data[index] = { ...data[index], focus: next, updated_at: stamp };
    writeData(data);
    const refreshedContext = adaptiveStrategyContext(data, now);
    const refreshedStrategy = refreshedContext.byId.get(String(data[index].id)) || refreshedContext.portfolioPolicy;
    return json(res, 200, { focus: focusStateForOpportunity(data[index], now), intelligence: opportunityIntelligence(data[index], now, refreshedStrategy) });
  }

  if (req.method === "GET" && url.pathname === "/api/intelligence") {
    const data = readData();
    const now = Date.now();
    const adaptiveContext = adaptiveStrategyContext(data, now);
    return json(res, 200, { generated_at: new Date(now).toISOString(), queue: intelligenceQueue(data, now, opportunity => adaptiveContext.byId.get(String(opportunity.id)) || adaptiveContext.portfolioPolicy) });
  }

  if (req.method === "GET" && url.pathname === "/api/command-center") {
    return json(res, 200, commandCenter(readData(), Date.now()));
  }

  if (req.method === "GET" && url.pathname === "/api/portfolio-summary") {
    return json(res, 200, portfolioSummary(readData()));
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
  server.listen(PORT, "0.0.0.0", () => console.log(`Atlas ${APP_VERSION} is running on port ${PORT} (${access.enabled ? "access protected" : "local/unlocked"})`));
}

module.exports = { server, storage, authConfig, isAuthorized, requireValidAuthConfig, pausedFields, withReviewState, emptyExperiment, emptyCheckpoint, emptyIntervention, normalizeInterventions, interventionEvaluation, normalizeCheckpoints, rollupCheckpointMetrics, normalizeExperiment, decisionState, experimentState, nextActionState, experimentHealth, interventionPlan, normalizeDeferReason, FOCUS_DEFER_REASONS, normalizeFocusState, focusStateForOpportunity, focusFrictionDiagnosis, focusFrictionSummary, focusExecutionSummary, focusScorecard, focusFeedbackForOpportunity, adaptiveNextAction, adaptiveActionLearning, adaptiveActionPolicy, adaptiveStrategyEvidence, adaptivePolicyForMode, lastAdaptiveStrategySnapshot, adaptiveStrategyGuardrail, adaptiveStrategyForOpportunity, adaptiveStrategyContext, opportunityIntelligence, intelligenceQueue, commandCenter, portfolioSummary, VALID_STATUSES, FINAL_DECISIONS, LABOR_RATE };
