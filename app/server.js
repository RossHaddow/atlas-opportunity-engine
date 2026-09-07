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


function opportunityIntelligence(opportunity, now = Date.now()) {
  const item = withReviewState(opportunity);
  const health = item.status === "Testing" ? experimentHealth(item, now) : null;
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
  score = Math.max(0, Math.min(100, score));
  let recommendation = item.next_action || "Review opportunity";
  if (item.status === "Researching" && base >= 75) recommendation = "Finish demand validation and move this toward a 30-day test.";
  if (item.status === "Killed") recommendation = "Leave closed unless new evidence materially changes the case.";
  return { id:item.id, name:item.name, status:item.status, work_priority_score:score, recommendation, reasons, atlas_score:base, health_label:health?.health_label || null, next_action_date:item.next_action_date || null };
}

function intelligenceQueue(opportunities, now = Date.now()) {
  return opportunities.map(item => opportunityIntelligence(item, now))
    .filter(item => item.status !== "Killed")
    .sort((a,b)=>b.work_priority_score-a.work_priority_score || b.atlas_score-a.atlas_score);
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
    intelligence: intelligenceQueue(opportunities, now).slice(0,5),
    top_focus: intelligenceQueue(opportunities, now)[0] || null
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

  if (req.method === "GET" && url.pathname === "/api/intelligence") {
    return json(res, 200, { generated_at: new Date().toISOString(), queue: intelligenceQueue(readData(), Date.now()) });
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

module.exports = { server, storage, authConfig, isAuthorized, requireValidAuthConfig, pausedFields, withReviewState, emptyExperiment, emptyCheckpoint, emptyIntervention, normalizeInterventions, interventionEvaluation, normalizeCheckpoints, rollupCheckpointMetrics, normalizeExperiment, decisionState, experimentState, nextActionState, experimentHealth, interventionPlan, opportunityIntelligence, intelligenceQueue, commandCenter, portfolioSummary, VALID_STATUSES, FINAL_DECISIONS, LABOR_RATE };
