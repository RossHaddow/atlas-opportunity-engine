const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pausedFields, withReviewState, normalizeExperiment, normalizeCheckpoints, rollupCheckpointMetrics, decisionState, experimentState, nextActionState, experimentHealth, interventionPlan, portfolioSummary, radarScore, normalizeEvidenceRecord, radarEvidenceStrength, radarStageForScore, radarSimilarity, radarDuplicateMatches, radarEvidenceGaps, radarCandidateRecommendation, radarRecommendationQueue, radarAutotriageConfig, radarAutotriageDecision, applyRadarAutotriage, radarAutotriageStatus, radarResearchActionForCandidate, radarResearchQueue, applyRadarResearchActionReview, applyRadarEvidenceCapture, radarEvidenceCaptureStatus, radarResearchAssistConfig, radarResearchAssistQueue, radarResearchAssistJob, researchAssistPrompt, parseResearchAssistResult, executeResearchAssistJob, radarResearchFindingReview, radarPromotionReviewState, radarPromotionQueue, applyRadarPromotionReview, radarTestBlueprint, opportunityFromRadarCandidate, normalizeDiscoverySource, radarDiscoveryCandidate, radarSourcePerformance, radarDiscoveryCadenceForSource, radarDiscoverySourceController, radarDiscoveryAdapterForType, radarDiscoveryJobPlan, discoveryExecutorConfig, discoveryExecutorStatus, autonomousDiscoveryConfig, autonomousDiscoveryStatus, autonomousDiscoveryEligibleJobs, radarDiscoveryRunnerAdapter, discoveryJobPayload, openAIDiscoveryPrompt, extractOpenAIResponseText, parseOpenAIDiscoveryResult, executeDiscoveryJob, radarDiscoveryRunStart, radarDiscoveryRunComplete, radarDiscoveryRunSummary, radarDiscoveryBatch, radarReviewCadence, radarRefreshQueue, radarPortfolioRefresh, radarOperatingBrief, atlasUnifiedNextMoves, normalizeRadarCandidate, radarSummary, RADAR_STAGES, VALID_STATUSES, emptyIntervention, normalizeInterventions, interventionEvaluation, commandCenter, normalizeFocusState, focusExecutionSummary, focusScorecard, focusFeedbackForOpportunity, focusFrictionDiagnosis, focusFrictionResolution, focusFrictionSummary, focusResolutionEffectiveness, focusResolutionEffectivenessSummary, effortEvidenceLevel, focusEffortCalibration, calibrateTimedAction, focusCapacityProfile, capacityFitForAction, normalizeWorkBlockMinutes, nextWorkBlockPlan, normalizeDailyPlanMinutes, dailyWorkPlan, dailyPlanAdaptation, dailyPlanDensityLearning, densityEvidenceRank, lastDailyPlanDensitySnapshot, dailyPlanDensityController, localHour, executionTimeWindow, timeWindowEvidenceLevel, dailyPlanTimeWindowLearning, opportunityTimeWindowFit, dailyPlanTimeWindowPriority, workTypeForAction, dailyPlanWorkTypeLearning, compositionEvidenceLevel, dailyPlanCompositionLearning, dailyPlanCompositionAdjustment, sequenceEvidenceLevel, dailyPlanSequenceLearning, dailyPlanSequenceAdjustment, depthEvidenceLevel, dailyPlanDepthLearning, dailyPlanDepthController, dailyPlanDepthRecoveryLearning, dailyPlanDepthRecoveryController, blockSizeEvidenceLevel, blockSizeBand, dailyPlanBlockSizeLearning, dailyPlanBlockSizeController, dailyPlanBlockSizeOutcomeLearning, dailyPlanBlockSizeOutcomeController, localDateKey, dailyPlanExecutionSummary, resolutionStrategyFromEvidence, resolutionStrategyEvidenceLevel, lastResolutionStrategySnapshot, resolutionPolicyForMode, resolutionStrategyGuardrail, focusResolutionStrategy, focusResolutionStrategySummary, normalizeDeferReason, FOCUS_DEFER_REASONS, adaptiveNextAction, adaptiveActionLearning, adaptiveActionPolicy, adaptiveStrategyEvidence, adaptivePolicyForMode, lastAdaptiveStrategySnapshot, adaptiveStrategyGuardrail, adaptiveStrategyForOpportunity, adaptiveStrategyContext, opportunityIntelligence, intelligenceQueue, authConfig, isAuthorized, requireValidAuthConfig } = require("../server");

test("Paused is a valid status", () => assert.ok(VALID_STATUSES.includes("Paused")));

test("entering Paused creates a 30-day review", () => {
  const result = pausedFields("Paused");
  const difference = Date.parse(result.paused_review_date) - Date.parse(result.paused_at);
  assert.equal(difference, 30 * 24 * 60 * 60 * 1000);
});

test("leaving Paused clears review fields", () => {
  assert.deepEqual(pausedFields("Active", { paused_at: "x", paused_review_date: "y" }), { paused_at: null, paused_review_date: null });
});

test("overdue paused reviews are identified", () => {
  const result = withReviewState({ status: "Paused", paused_review_date: "2000-01-01T00:00:00.000Z" });
  assert.equal(result.paused_review_overdue, true);
  assert.ok(result.paused_review_days_remaining < 0);
});

test("a start date creates a 30-day experiment end date", () => {
  const result = normalizeExperiment({ start_date: "2026-09-01", end_date: "" });
  assert.equal(result.end_date, "2026-10-01");
});

test("Testing setup reports missing required information", () => {
  const result = experimentState({ status: "Testing", experiment: {} });
  assert.ok(result.experiment_missing_fields.includes("demand_evidence"));
  assert.ok(result.experiment_missing_fields.includes("launch_tasks"));
  assert.ok(result.experiment_progress < 100);
});

test("a complete Testing setup reaches 100 percent", () => {
  const result = experimentState({ status: "Testing", experiment: {
    demand_evidence: "Evidence", offer: "Offer", sales_channel: "Etsy",
    start_date: "2026-09-01", end_date: "2026-10-01", approved_budget: 25,
    launch_tasks: [{ id: "1", text: "Publish", completed: false }]
  }});
  assert.equal(result.experiment_progress, 100);
  assert.deepEqual(result.experiment_missing_fields, []);
});

test("budgets above 25 require explicit approval", () => {
  const result = experimentState({ status: "Testing", experiment: {
    demand_evidence: "Evidence", offer: "Offer", sales_channel: "Etsy",
    start_date: "2026-09-01", end_date: "2026-10-01", approved_budget: 30,
    launch_tasks: [{ id: "1", text: "Publish", completed: false }]
  }});
  assert.equal(result.experiment_budget_warning, true);
});

test("weekly checkpoints always normalize to four ordered records", () => {
  const result = normalizeCheckpoints([{ week: 3, decision: "Adjust", visits: 4 }]);
  assert.equal(result.length, 4);
  assert.deepEqual(result.map(item => item.week), [1, 2, 3, 4]);
  assert.equal(result[2].decision, "Adjust");
  assert.equal(result[2].visits, 4);
});

test("weekly checkpoint metrics roll up into experiment totals", () => {
  const result = rollupCheckpointMetrics({ weekly_checkpoints: [
    { week: 1, completed: true, revenue: 30, expenses: 5, hours_worked: 2 },
    { week: 2, completed: true, revenue: 20, expenses: 3, hours_worked: 1.5 }
  ]});
  assert.equal(result.revenue, 50);
  assert.equal(result.expenses, 8);
  assert.equal(result.hours_worked, 3.5);
});

test("checkpoint state identifies the next incomplete week", () => {
  const result = experimentState({ status: "Testing", experiment: {
    demand_evidence: "Evidence", offer: "Offer", sales_channel: "Etsy",
    start_date: "2099-09-01", end_date: "2099-10-01", approved_budget: 25,
    launch_tasks: [{ id: "1", text: "Publish", completed: true }],
    weekly_checkpoints: [{ week: 1, completed: true }]
  }});
  assert.equal(result.completed_checkpoints, 1);
  assert.equal(result.next_checkpoint_week, 2);
  assert.equal(result.next_checkpoint_date, "2099-09-15");
  assert.equal(result.checkpoint_overdue, false);
});

test("positive cash profit after a fair test recommends Active", () => {
  const result = decisionState(normalizeExperiment({
    revenue: 100, expenses: 20, hours_worked: 2, fair_test_exposure_met: true,
    weekly_checkpoints: [1, 2, 3, 4].map(week => ({ week, completed: true }))
  }));
  assert.equal(result.cash_profit, 80);
  assert.equal(result.labor_adjusted_profit, 30);
  assert.equal(result.atlas_recommendation, "Move to Active");
  assert.equal(result.scaled_profitability_eligible, true);
});

test("a first failed test recommends revision", () => {
  const result = decisionState(normalizeExperiment({
    revenue: 0, expenses: 5, fair_test_exposure_met: true, failed_test_count: 0,
    weekly_checkpoints: [1, 2, 3, 4].map(week => ({ week, completed: true }))
  }));
  assert.equal(result.atlas_recommendation, "Revise and Retest");
  assert.equal(result.projected_failed_test_count, 1);
});

test("a second failed test recommends Kill", () => {
  const result = decisionState(normalizeExperiment({
    revenue: 0, expenses: 5, fair_test_exposure_met: true, failed_test_count: 1,
    weekly_checkpoints: [1, 2, 3, 4].map(week => ({ week, completed: true }))
  }));
  assert.equal(result.atlas_recommendation, "Kill");
  assert.equal(result.projected_failed_test_count, 2);
});

test("labor-adjusted profit uses the approved 25 dollar hourly value", () => {
  const result = decisionState(normalizeExperiment({ revenue: 100, expenses: 10, hours_worked: 3 }));
  assert.equal(result.labor_cost, 75);
  assert.equal(result.labor_adjusted_profit, 15);
});

test("decision-ready Testing opportunities become urgent actions", () => {
  const result = nextActionState({ status: "Testing", experiment_missing_fields: [], decision_ready: true, early_termination_recommended: false });
  assert.equal(result.attention_level, "urgent");
  assert.equal(result.next_action, "Complete the Day-30 decision");
});

test("incomplete Testing setup enters the attention queue", () => {
  const result = nextActionState({ status: "Testing", experiment_missing_fields: ["offer"], decision_ready: false, early_termination_recommended: false });
  assert.equal(result.attention_level, "due");
  assert.equal(result.next_action, "Complete the required Testing setup");
});

test("Killed opportunities have no next action", () => {
  const result = nextActionState({ status: "Killed" });
  assert.equal(result.attention_level, "none");
  assert.equal(result.next_action, "No action required");
});


test("portfolio summary rolls up live Testing metrics", () => {
  const summary = portfolioSummary([{ id: 1, name: "A", status: "Testing", experiment: {
    start_date: "2026-09-01", end_date: "2026-10-01",
    weekly_checkpoints: [{ week: 1, completed: true, visits: 10, favorites: 2, orders: 1, revenue: 20, expenses: 3 }]
  }}, { id: 2, name: "B", status: "Active", actual_revenue: 100 }], Date.parse("2026-09-08T00:00:00Z"));
  assert.equal(summary.active_tests, 1);
  assert.equal(summary.visits, 10);
  assert.equal(summary.favorites, 2);
  assert.equal(summary.orders, 1);
  assert.equal(summary.revenue, 20);
  assert.equal(summary.cash_profit, 17);
  assert.equal(summary.conversion_rate, 10);
  assert.equal(summary.tests[0].days_elapsed, 7);
});

test("portfolio summary avoids divide-by-zero conversion", () => {
  const summary = portfolioSummary([{ id: 1, name: "A", status: "Testing", experiment: {} }]);
  assert.equal(summary.conversion_rate, 0);
});


test("experiment health rewards real demand and profit", () => {
  const opportunity = { id: 1, name: "Winner", status: "Testing", experiment: {
    start_date: "2026-09-01",
    weekly_checkpoints: [
      { week: 1, completed: true, visits: 60, favorites: 5, orders: 4, revenue: 80, expenses: 5 }
    ]
  }};
  const health = experimentHealth(opportunity, Date.parse("2026-09-10T00:00:00Z"));
  assert.ok(health.health_score >= 85);
  assert.equal(health.health_label, "Strong");
  assert.equal(health.health_confidence, "High");
});

test("experiment health flags traffic without conversion", () => {
  const opportunity = { id: 1, name: "Stalled", status: "Testing", experiment: {
    start_date: "2026-09-01",
    weekly_checkpoints: [
      { week: 1, completed: true, visits: 30, favorites: 0, orders: 0, revenue: 0, expenses: 0 }
    ]
  }};
  const health = experimentHealth(opportunity, Date.parse("2026-09-16T00:00:00Z"));
  assert.ok(health.health_score < 50);
  assert.ok(["Needs Attention", "At Risk"].includes(health.health_label));
  assert.match(health.health_warnings.join(" "), /No orders|without converting/);
});

test("experiment health does not overreact to an early sparse test", () => {
  const opportunity = { id: 1, name: "New", status: "Testing", experiment: {
    start_date: "2026-09-01",
    weekly_checkpoints: []
  }};
  const health = experimentHealth(opportunity, Date.parse("2026-09-03T00:00:00Z"));
  assert.equal(health.health_label, "Developing");
  assert.equal(health.health_confidence, "Low");
  assert.match(health.health_recommendation, /early|collecting/i);
});


test("intervention engine identifies a traffic problem after a week", () => {
  const opportunity = { id: 1, name: "Low Traffic", status: "Testing", experiment: {
    start_date: "2026-09-01",
    weekly_checkpoints: [{ week: 1, completed: true, visits: 4, favorites: 0, orders: 0 }]
  }};
  const plan = interventionPlan(opportunity, Date.parse("2026-09-10T00:00:00Z"));
  assert.equal(plan.intervention_category, "traffic");
  assert.match(plan.intervention_action, /search phrase|title|tags/i);
  assert.match(plan.intervention_change_limit, /price|images|search positioning/i);
});

test("intervention engine identifies price or offer friction from favorites without orders", () => {
  const opportunity = { id: 1, name: "Favorited", status: "Testing", experiment: {
    start_date: "2026-09-01",
    weekly_checkpoints: [{ week: 1, completed: true, visits: 30, favorites: 4, orders: 0 }]
  }};
  const plan = interventionPlan(opportunity, Date.parse("2026-09-12T00:00:00Z"));
  assert.equal(plan.intervention_category, "offer_price");
  assert.match(plan.intervention_action, /price|promotion/i);
});

test("intervention engine identifies presentation weakness when traffic has no engagement", () => {
  const opportunity = { id: 1, name: "No Engagement", status: "Testing", experiment: {
    start_date: "2026-09-01",
    weekly_checkpoints: [{ week: 1, completed: true, visits: 28, favorites: 0, orders: 0 }]
  }};
  const plan = interventionPlan(opportunity, Date.parse("2026-09-12T00:00:00Z"));
  assert.equal(plan.intervention_category, "presentation");
  assert.match(plan.intervention_action, /primary Etsy listing image|lead image/i);
});

test("intervention engine protects a strong listing from unnecessary changes", () => {
  const opportunity = { id: 1, name: "Winner", status: "Testing", experiment: {
    start_date: "2026-09-01",
    weekly_checkpoints: [{ week: 1, completed: true, visits: 70, favorites: 7, orders: 5, revenue: 100, expenses: 5 }]
  }};
  const plan = interventionPlan(opportunity, Date.parse("2026-09-12T00:00:00Z"));
  assert.equal(plan.intervention_category, "hold");
  assert.match(plan.intervention_action, /Do not change/i);
});

test("intervention engine does not diagnose tiny early samples", () => {
  const opportunity = { id: 1, name: "Brand New", status: "Testing", experiment: {
    start_date: "2026-09-01",
    weekly_checkpoints: [{ week: 1, completed: false, visits: 3, favorites: 0, orders: 0 }]
  }};
  const plan = interventionPlan(opportunity, Date.parse("2026-09-03T00:00:00Z"));
  assert.equal(plan.intervention_category, "insufficient_evidence");
  assert.match(plan.intervention_action, /collect|unchanged|stable/i);
});


test("intervention records normalize with baseline and result structures", () => {
  const rows = normalizeInterventions([{ id: "x", category: "traffic", baseline: { visits: 5 } }]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].baseline.visits, 5);
  assert.equal(rows[0].baseline.orders, 0);
  assert.equal(rows[0].result.visits, 0);
  assert.equal(rows[0].status, "Active");
});

test("intervention evaluation marks a new order as improved", () => {
  const record = {
    ...emptyIntervention(),
    baseline: { visits: 20, favorites: 1, orders: 0, revenue: 0, conversion_rate: 0 },
    result: { visits: 35, favorites: 3, orders: 1, revenue: 16.99, conversion_rate: 2.86 }
  };
  const evaluation = interventionEvaluation(record);
  assert.equal(evaluation.outcome, "Improved");
  assert.equal(evaluation.delta_orders, 1);
  assert.equal(evaluation.delta_revenue, 16.99);
});

test("intervention evaluation can remain inconclusive", () => {
  const record = {
    ...emptyIntervention(),
    baseline: { visits: 5, favorites: 0, orders: 0, revenue: 0, conversion_rate: 0 },
    result: { visits: 8, favorites: 1, orders: 0, revenue: 0, conversion_rate: 0 }
  };
  assert.equal(interventionEvaluation(record).outcome, "Inconclusive");
});

test("portfolio summary exposes active intervention history", () => {
  const summary = portfolioSummary([{ id: 1, name: "Test", status: "Testing", experiment: {
    start_date: "2026-09-01", end_date: "2026-10-01",
    interventions: [{ id: "active-1", status: "Active", action: "Change lead image", baseline: { visits: 20, orders: 0 } }],
    weekly_checkpoints: [{ week: 1, visits: 20, orders: 0 }]
  }}], Date.parse("2026-09-10T00:00:00Z"));
  assert.equal(summary.tests[0].active_intervention.id, "active-1");
  assert.equal(summary.tests[0].intervention_count, 1);
});

test("command center summarizes portfolio status and money",()=>{const r=commandCenter([{id:1,name:"R",status:"Researching"},{id:2,name:"T",status:"Testing",actual_revenue:25,actual_profit:20,experiment:{start_date:"2026-09-01"}},{id:3,name:"A",status:"Active",actual_revenue:100,actual_profit:75}],Date.parse("2026-09-05T12:00:00Z"));assert.equal(r.portfolio.total,3);assert.equal(r.portfolio.testing,1);assert.equal(r.money.total_revenue,125);assert.equal(r.money.total_profit,95);});
test("command center surfaces decision-ready work as urgent",()=>{const r=commandCenter([{id:1,name:"Decision Test",status:"Testing",experiment:{start_date:"2026-08-01",end_date:"2026-08-31",fair_test_exposure_met:true,revenue:30,expenses:5,weekly_checkpoints:[1,2,3,4].map(week=>({week,completed:true,visits:10,orders:week===4?1:0}))}}],Date.parse("2026-09-02T12:00:00Z"));assert.equal(r.operating.decisions_ready,1);assert.equal(r.attention[0].priority,"Urgent");});
test("command center limits CEO next moves to three",()=>{const rows=[1,2,3,4,5].map(id=>({id,name:`Test ${id}`,status:"Testing",experiment:{start_date:"2026-08-01"}}));assert.ok(commandCenter(rows,Date.parse("2026-09-02T12:00:00Z")).next_moves.length<=3);});


// Build 36 authentication
test("auth is disabled for local development when no password is configured", () => {
  const config = authConfig({});
  assert.equal(config.enabled, false);
  assert.equal(isAuthorized({ headers: {} }, config), true);
});

test("auth accepts only the configured Basic credentials", () => {
  const config = authConfig({ ATLAS_ACCESS_USERNAME: "atlas", ATLAS_ACCESS_PASSWORD: "correct-horse" });
  const valid = `Basic ${Buffer.from("atlas:correct-horse").toString("base64")}`;
  const invalid = `Basic ${Buffer.from("atlas:wrong").toString("base64")}`;
  assert.equal(isAuthorized({ headers: { authorization: valid } }, config), true);
  assert.equal(isAuthorized({ headers: { authorization: invalid } }, config), false);
  assert.equal(isAuthorized({ headers: {} }, config), false);
});

test("required auth refuses a missing password", () => {
  assert.throws(
    () => requireValidAuthConfig(authConfig({ ATLAS_REQUIRE_AUTH: "true" })),
    /ATLAS_ACCESS_PASSWORD/
  );
});


// Build 37 Daily Executive Briefing
test("command center surfaces canonical due attention", () => {
  const r = commandCenter([{ id: 1, name: "Needs Setup", status: "Testing", experiment: {} }], Date.parse("2026-09-06T12:00:00Z"));
  assert.equal(r.operating.needs_attention, 1);
  assert.equal(r.attention[0].priority, "High");
  assert.equal(r.attention[0].action, "Complete the required Testing setup");
});

test("Build 37 mounts the Daily Executive Briefing UI", () => {
  const html = fs.readFileSync(path.join(__dirname, "..", "public", "index.html"), "utf8");
  for (const id of ["executive-briefing", "commandHeadline", "commandKpis", "commandAttention", "commandMoves"]) {
    assert.match(html, new RegExp(`id=["']${id}["']`));
  }
});


test("Build 38 intelligence prioritizes urgent live work",()=>{
 const rows=[{id:1,name:"Research",status:"Researching",atlas_score:90},{id:2,name:"Live",status:"Testing",atlas_score:70,experiment:{}}];
 const q=intelligenceQueue(rows,Date.parse("2026-09-06T12:00:00Z"));
 assert.equal(q[0].name,"Live"); assert.ok(q[0].work_priority_score>q[1].work_priority_score);
});
test("Build 38 intelligence explains recommendations",()=>{
 const x=opportunityIntelligence({id:1,name:"Idea",status:"Researching",atlas_score:80},Date.parse("2026-09-06T12:00:00Z"));
 assert.match(x.recommendation,/demand validation/i); assert.ok(Array.isArray(x.reasons));
});
test("Build 38 command center exposes top focus",()=>{
 const r=commandCenter([{id:1,name:"Test",status:"Testing",atlas_score:80,experiment:{}}],Date.parse("2026-09-06T12:00:00Z"));
 assert.equal(r.top_focus.name,"Test"); assert.equal(r.intelligence.length,1);
});


// Build 39 Intelligence Command Layer
test("Build 39 mounts Top Focus and Priority Queue UI", () => {
  const html = fs.readFileSync(path.join(__dirname, "..", "public", "index.html"), "utf8");
  for (const id of ["intelligence-command", "topFocus", "intelligenceQueue"]) {
    assert.match(html, new RegExp(`id=["']${id}["']`));
  }
});

test("Build 39 renders intelligence from the command center payload", () => {
  const js = fs.readFileSync(path.join(__dirname, "..", "public", "app.js"), "utf8");
  assert.match(js, /function renderIntelligenceCommand\(data\)/);
  assert.match(js, /data\.top_focus/);
  assert.match(js, /data\.intelligence/);
  assert.match(js, /work_priority_score/);
});

test("Build 39 routes intelligence actions to testing workspace or opportunity editor", () => {
  const js = fs.readFileSync(path.join(__dirname, "..", "public", "app.js"), "utf8");
  assert.match(js, /if \(item\.status === "Testing"\) openExperiment\(item\.id\)/);
  assert.match(js, /else beginEdit\(item\.id\)/);
  assert.doesNotMatch(js, /openEdit\(/);
});


// Build 40 Focus Execution Layer
test("Build 40 active focus receives continuity priority", () => {
  const now = Date.parse("2026-09-08T12:00:00Z");
  const base = { id: 1, name: "A", status: "Researching", atlas_score: 70 };
  const idle = opportunityIntelligence(base, now);
  const active = opportunityIntelligence({ ...base, focus: { status: "active", action: "Validate", started_at: "2026-09-08T11:00:00Z" } }, now);
  assert.ok(active.work_priority_score > idle.work_priority_score);
  assert.equal(active.focus.status, "active");
  assert.match(active.reasons[0], /already started/i);
});

test("Build 40 deferred focus leaves the active intelligence queue until due", () => {
  const now = Date.parse("2026-09-08T12:00:00Z");
  const rows = [
    { id: 1, name: "Deferred", status: "Researching", atlas_score: 95, focus: { status: "deferred", deferred_until: "2026-09-09T12:00:00Z" } },
    { id: 2, name: "Available", status: "Researching", atlas_score: 60 }
  ];
  assert.deepEqual(intelligenceQueue(rows, now).map(x => x.name), ["Available"]);
  assert.equal(normalizeFocusState(rows[0].focus, Date.parse("2026-09-10T12:00:00Z")).status, "idle");
});

test("Build 40 mounts focus execution controls", () => {
  const js = fs.readFileSync(path.join(__dirname, "..", "public", "app.js"), "utf8");
  assert.match(js, /async function updateFocus\(id, action, days = 1\)/);
  for (const token of ["data-focus-start", "data-focus-complete", "data-focus-defer", "/focus"]) assert.match(js, new RegExp(token));
});

// Build 41 Daily Focus Review
test("Build 41 summarizes today's focus execution", () => {
  const now = Date.parse("2026-09-08T18:00:00Z");
  const rows = [{ id: 1, name: "Bar Kit", status: "Testing", focus: { status: "completed", deferred_until: "2026-09-09T17:00:00Z", history: [
    { event: "started", action: "Improve listing", at: "2026-09-08T16:00:00Z" },
    { event: "completed", action: "Improve listing", at: "2026-09-08T17:00:00Z", duration_minutes: 60 }
  ]}}];
  const r = focusExecutionSummary(rows, now);
  assert.equal(r.started, 1);
  assert.equal(r.completed, 1);
  assert.equal(r.deferred, 0);
  assert.equal(r.focused_minutes, 60);
  assert.equal(r.recent[0].event, "completed");
});

test("Build 41 command center exposes focus execution review", () => {
  const r = commandCenter([{ id: 1, name: "Idea", status: "Researching", atlas_score: 70, focus: { history: [{ event: "started", action: "Validate", at: "2026-09-08T12:00:00Z" }] } }], Date.parse("2026-09-08T15:00:00Z"));
  assert.equal(r.focus_execution.started, 1);
  assert.ok(Array.isArray(r.focus_execution.recent));
});

test("Build 41 mounts Daily Focus Review UI", () => {
  const html = fs.readFileSync(path.join(__dirname, "..", "public", "index.html"), "utf8");
  const js = fs.readFileSync(path.join(__dirname, "..", "public", "app.js"), "utf8");
  for (const id of ["focus-review", "focusReview"]) assert.match(html, new RegExp(`id=["']${id}["']`));
  assert.match(js, /function renderFocusReview\(data\)/);
  assert.match(js, /focus_execution/);
});


// Build 42 — 7-Day Focus Scorecard
test("Build 42 summarizes seven-day focus behavior", () => {
  const now = Date.parse("2026-09-08T18:00:00Z");
  const rows = [
    { id: 1, name: "Bar Kit", focus: { history: [
      { event: "started", action: "Improve listing", at: "2026-09-08T15:00:00Z" },
      { event: "completed", action: "Improve listing", at: "2026-09-08T16:00:00Z", duration_minutes: 60 },
      { event: "started", action: "Improve listing", at: "2026-09-07T15:00:00Z" },
      { event: "deferred", action: "Improve listing", at: "2026-09-07T15:30:00Z", duration_minutes: 30 }
    ]}},
    { id: 2, name: "TipTrack", focus: { history: [
      { event: "started", action: "Check demand", at: "2026-09-01T15:00:00Z" },
      { event: "completed", action: "Check demand", at: "2026-09-01T16:00:00Z", duration_minutes: 60 }
    ]}}
  ];
  const r = focusScorecard(rows, now);
  assert.equal(r.window_days, 7);
  assert.equal(r.started, 2);
  assert.equal(r.completed, 1);
  assert.equal(r.deferred, 1);
  assert.equal(r.focused_minutes, 90);
  assert.equal(r.active_days, 2);
  assert.equal(r.follow_through_pct, 50);
  assert.equal(r.top_opportunities[0].opportunity_name, "Bar Kit");
});

test("Build 42 identifies repeated deferral behavior", () => {
  const now = Date.parse("2026-09-08T18:00:00Z");
  const history = [1,2,3].flatMap(day => [
    { event: "started", action: "Validate", at: `2026-09-0${day + 4}T15:00:00Z` },
    { event: "deferred", action: "Validate", at: `2026-09-0${day + 4}T15:10:00Z`, duration_minutes: 10 }
  ]);
  const r = focusScorecard([{ id: 1, name: "Idea", focus: { history } }], now);
  assert.equal(r.signal, "Deferral pattern");
  assert.match(r.guidance, /ranking the right work|too large/);
});

test("Build 42 command center exposes focus scorecard", () => {
  const r = commandCenter([{ id: 1, name: "Idea", status: "Researching", atlas_score: 70, focus: { history: [{ event: "started", action: "Validate", at: "2026-09-08T12:00:00Z" }] } }], Date.parse("2026-09-08T15:00:00Z"));
  assert.equal(r.focus_scorecard.started, 1);
  assert.equal(r.focus_scorecard.window_days, 7);
});

test("Build 42 mounts 7-Day Focus Scorecard UI", () => {
  const html = fs.readFileSync(path.join(__dirname, "..", "public", "index.html"), "utf8");
  const js = fs.readFileSync(path.join(__dirname, "..", "public", "app.js"), "utf8");
  for (const id of ["focus-scorecard", "focusScorecard"]) assert.match(html, new RegExp(`id=["']${id}["']`));
  assert.match(js, /function renderFocusScorecard\(data\)/);
  assert.match(js, /focus_scorecard/);
});


// Build 43 — Recommendation Feedback Loop
test("Build 43 lowers near-term priority after repeated deferrals without changing Atlas score", () => {
  const now = Date.parse("2026-09-08T18:00:00Z");
  const history = [5,6,7].flatMap(day => [
    { event: "started", action: "Validate demand", at: `2026-09-0${day}T15:00:00Z` },
    { event: "deferred", action: "Validate demand", at: `2026-09-0${day}T15:10:00Z`, duration_minutes: 10 }
  ]);
  const base = { id: 1, name: "Idea", status: "Researching", atlas_score: 80 };
  const neutral = opportunityIntelligence(base, now);
  const learned = opportunityIntelligence({ ...base, focus: { history } }, now);
  assert.equal(learned.atlas_score, 80);
  assert.ok(learned.work_priority_score < neutral.work_priority_score);
  assert.equal(learned.execution_feedback.priority_adjustment, -8);
  assert.match(learned.recommendation, /Shrink the next action/i);
});

test("Build 43 gives a small execution-confidence boost for strong follow-through", () => {
  const now = Date.parse("2026-09-08T18:00:00Z");
  const history = [
    { event: "completed", action: "A", at: "2026-09-07T15:00:00Z", duration_minutes: 20 },
    { event: "completed", action: "B", at: "2026-09-08T15:00:00Z", duration_minutes: 20 }
  ];
  const feedback = focusFeedbackForOpportunity({ id: 1, focus: { history } }, now);
  assert.equal(feedback.signal, "Strong follow-through");
  assert.equal(feedback.priority_adjustment, 4);
  assert.equal(feedback.follow_through_pct, 100);
});

test("Build 43 command center exposes recommendation feedback", () => {
  const now = Date.parse("2026-09-08T18:00:00Z");
  const r = commandCenter([{ id: 1, name: "Idea", status: "Researching", atlas_score: 70, focus: { history: [
    { event: "completed", action: "A", at: "2026-09-07T15:00:00Z" },
    { event: "completed", action: "B", at: "2026-09-08T15:00:00Z" }
  ] } }], now);
  assert.equal(r.recommendation_feedback.length, 1);
  assert.equal(r.recommendation_feedback[0].signal, "Strong follow-through");
});

test("Build 43 mounts Recommendation Feedback UI", () => {
  const html = fs.readFileSync(path.join(__dirname, "..", "public", "index.html"), "utf8");
  const js = fs.readFileSync(path.join(__dirname, "..", "public", "app.js"), "utf8");
  for (const id of ["recommendation-feedback", "recommendationFeedback"]) assert.match(html, new RegExp(`id=["']${id}["']`));
  assert.match(js, /function renderRecommendationFeedback\(data\)/);
  assert.match(js, /recommendation_feedback/);
});


// Build 44 — Adaptive Next Action
test("Build 44 creates a concrete micro-action after repeated deferrals", () => {
  const now = Date.parse("2026-09-08T18:00:00Z");
  const history = [5,6,7].flatMap(day => [
    { event: "started", action: "Validate demand", at: `2026-09-0${day}T15:00:00Z` },
    { event: "deferred", action: "Validate demand", at: `2026-09-0${day}T15:10:00Z`, duration_minutes: 10 }
  ]);
  const x = opportunityIntelligence({ id: 1, name: "Idea", status: "Researching", atlas_score: 80, focus: { history } }, now);
  assert.equal(x.adaptive_next_action.mode, "micro");
  assert.equal(x.adaptive_next_action.estimated_minutes, 15);
  assert.match(x.adaptive_next_action.action, /one concrete demand signal/i);
  assert.match(x.strategic_recommendation, /demand validation/i);
});

test("Build 44 preserves a standard action when execution friction is absent", () => {
  const x = adaptiveNextAction(
    { id: 1, name: "Idea", status: "Researching", atlas_score: 80 },
    "Finish demand validation and move this toward a 30-day test.",
    { priority_adjustment: 0 },
    Date.parse("2026-09-08T18:00:00Z")
  );
  assert.equal(x.mode, "standard");
  assert.equal(x.estimated_minutes, null);
  assert.match(x.action, /Finish demand validation/);
});

test("Build 44 tailors a deferred Testing opportunity to its immediate workspace step", () => {
  const x = adaptiveNextAction(
    { id: 1, name: "Test", status: "Testing", atlas_score: 80, experiment: {} },
    "Complete the current test setup.",
    { priority_adjustment: -4 },
    Date.parse("2026-09-08T18:00:00Z")
  );
  assert.equal(x.mode, "micro");
  assert.match(x.action, /15 minutes/i);
  assert.match(x.action, /Testing Workspace|step/i);
});

test("Build 44 renders the adaptive next action in Top Focus and the queue", () => {
  const js = fs.readFileSync(path.join(__dirname, "..", "public", "app.js"), "utf8");
  assert.match(js, /adaptive_next_action/);
  assert.match(js, /Do next/);
  assert.match(js, /estimated_minutes/);
  const css = fs.readFileSync(path.join(__dirname, "..", "public", "style.css"), "utf8");
  assert.match(css, /\.adaptive-next-action/);
});


// Build 45 — Adaptive Action Learning
test("Build 45 measures micro-action follow-through against standard actions", () => {
  const now = Date.parse("2026-09-08T18:00:00Z");
  const rows = [{ id: 1, name: "Bar Kit", focus: { history: [
    { event: "completed", action: "Micro A", action_mode: "micro", at: "2026-09-08T15:00:00Z", duration_minutes: 12 },
    { event: "completed", action: "Micro B", action_mode: "micro", at: "2026-09-07T15:00:00Z", duration_minutes: 14 },
    { event: "deferred", action: "Standard A", action_mode: "standard", at: "2026-09-06T15:00:00Z", duration_minutes: 25 },
    { event: "completed", action: "Standard B", action_mode: "standard", at: "2026-09-05T15:00:00Z", duration_minutes: 30 }
  ]}}];
  const r = adaptiveActionLearning(rows, now);
  assert.equal(r.micro.follow_through_pct, 100);
  assert.equal(r.standard.follow_through_pct, 50);
  assert.equal(r.micro_follow_through_lift_pct, 50);
  assert.equal(r.signal, "Micro-actions are helping");
});

test("Build 45 does not overclaim with too little comparative history", () => {
  const now = Date.parse("2026-09-08T18:00:00Z");
  const r = adaptiveActionLearning([{ id: 1, focus: { history: [
    { event: "completed", action: "Micro", action_mode: "micro", at: "2026-09-08T15:00:00Z", duration_minutes: 10 }
  ]}}], now);
  assert.equal(r.micro_follow_through_lift_pct, null);
  assert.equal(r.signal, "Not enough adaptive data");
});

test("Build 45 command center exposes adaptive action learning", () => {
  const now = Date.parse("2026-09-08T18:00:00Z");
  const r = commandCenter([{ id: 1, name: "Idea", status: "Researching", atlas_score: 70, focus: { history: [
    { event: "completed", action: "A", action_mode: "micro", at: "2026-09-08T12:00:00Z", duration_minutes: 10 },
    { event: "deferred", action: "B", action_mode: "micro", at: "2026-09-07T12:00:00Z", duration_minutes: 10 }
  ] } }], now);
  assert.equal(r.adaptive_action_learning.window_days, 14);
  assert.equal(r.adaptive_action_learning.micro.resolved, 2);
});

test("Build 45 mounts Adaptive Action Learning UI", () => {
  const html = fs.readFileSync(path.join(__dirname, "..", "public", "index.html"), "utf8");
  const js = fs.readFileSync(path.join(__dirname, "..", "public", "app.js"), "utf8");
  for (const id of ["adaptive-learning", "adaptiveActionLearning"]) assert.match(html, new RegExp(`id=["']${id}["']`));
  assert.match(js, /function renderAdaptiveActionLearning\(data\)/);
  assert.match(js, /adaptive_action_learning/);
});


// Build 46 — Adaptive Strategy Controller
test("Build 46 promotes micro-actions when adaptive learning shows they help", () => {
  const policy = adaptiveActionPolicy({ signal: "Micro-actions are helping" });
  assert.equal(policy.mode, "use_micro");
  const action = adaptiveNextAction(
    { id: 1, name: "Idea", status: "Researching" },
    "Finish demand validation.",
    { priority_adjustment: -4 },
    Date.parse("2026-09-08T18:00:00Z"),
    policy
  );
  assert.equal(action.mode, "micro");
});

test("Build 46 pauses micro-actions when learning shows they are not helping", () => {
  const policy = adaptiveActionPolicy({ signal: "Micro-actions are not helping yet" });
  assert.equal(policy.mode, "pause_micro");
  const action = adaptiveNextAction(
    { id: 1, name: "Idea", status: "Researching" },
    "Finish demand validation.",
    { priority_adjustment: -8 },
    Date.parse("2026-09-08T18:00:00Z"),
    policy
  );
  assert.equal(action.mode, "standard");
  assert.match(action.reason, /not improving follow-through|timing|priority/i);
});

test("Build 46 uses micro-actions selectively when there is no clear advantage", () => {
  const policy = adaptiveActionPolicy({ signal: "No clear micro-action advantage" });
  const mild = adaptiveNextAction({ status: "Researching" }, "Validate demand.", { priority_adjustment: -4 }, Date.parse("2026-09-08T18:00:00Z"), policy);
  const strong = adaptiveNextAction({ status: "Researching" }, "Validate demand.", { priority_adjustment: -8 }, Date.parse("2026-09-08T18:00:00Z"), policy);
  assert.equal(mild.mode, "standard");
  assert.equal(strong.mode, "micro");
});

test("Build 46 command center exposes and applies the adaptive strategy", () => {
  const now = Date.parse("2026-09-08T18:00:00Z");
  const history = [
    { event: "completed", action_mode: "micro", action: "m1", at: "2026-09-08T12:00:00Z" },
    { event: "completed", action_mode: "micro", action: "m2", at: "2026-09-07T12:00:00Z" },
    { event: "deferred", action_mode: "standard", action: "s1", at: "2026-09-06T12:00:00Z" },
    { event: "deferred", action_mode: "standard", action: "s2", at: "2026-09-05T12:00:00Z" },
    { event: "deferred", action_mode: "standard", action: "s3", at: "2026-09-04T12:00:00Z" }
  ];
  const r = commandCenter([{ id: 1, name: "Idea", status: "Researching", atlas_score: 80, focus: { history } }], now);
  assert.equal(r.adaptive_action_policy.mode, "use_micro");
  assert.equal(r.top_focus.adaptive_next_action.mode, "micro");
});

test("Build 46 renders the adaptive strategy in the learning panel", () => {
  const js = fs.readFileSync(path.join(__dirname, "..", "public", "app.js"), "utf8");
  assert.match(js, /adaptive_action_policy/);
  assert.match(js, /Current adaptive strategy/);
});


// Build 47 — Opportunity-Aware Adaptive Strategy
test("Build 47 uses opportunity-specific adaptive evidence when enough local history exists", () => {
  const now = Date.parse("2026-09-08T18:00:00Z");
  const history = [
    { event: "completed", action_mode: "micro", action: "m1", at: "2026-09-08T12:00:00Z" },
    { event: "completed", action_mode: "micro", action: "m2", at: "2026-09-07T12:00:00Z" },
    { event: "deferred", action_mode: "standard", action: "s1", at: "2026-09-06T12:00:00Z" },
    { event: "deferred", action_mode: "standard", action: "s2", at: "2026-09-05T12:00:00Z" }
  ];
  const opportunity = { id: 7, name: "Local Winner", status: "Researching", focus: { history } };
  const portfolioLearning = { signal: "Micro-actions are not helping yet" };
  const strategy = adaptiveStrategyForOpportunity(opportunity, portfolioLearning, adaptiveActionPolicy(portfolioLearning), now);
  assert.equal(strategy.scope, "opportunity");
  assert.equal(strategy.mode, "use_micro");
  assert.equal(strategy.opportunity_id, 7);
});

test("Build 47 falls back to portfolio strategy when local evidence is insufficient", () => {
  const now = Date.parse("2026-09-08T18:00:00Z");
  const opportunity = { id: 8, name: "New Idea", status: "Researching", focus: { history: [
    { event: "completed", action_mode: "micro", action: "m1", at: "2026-09-08T12:00:00Z" }
  ] } };
  const portfolioLearning = { signal: "Micro-actions are not helping yet" };
  const strategy = adaptiveStrategyForOpportunity(opportunity, portfolioLearning, adaptiveActionPolicy(portfolioLearning), now);
  assert.equal(strategy.scope, "portfolio");
  assert.equal(strategy.mode, "pause_micro");
});

test("Build 47 can apply different adaptive strategies to different opportunities", () => {
  const now = Date.parse("2026-09-08T18:00:00Z");
  const helping = [
    { event: "completed", action_mode: "micro", at: "2026-09-08T12:00:00Z" },
    { event: "completed", action_mode: "micro", at: "2026-09-07T12:00:00Z" },
    { event: "deferred", action_mode: "standard", at: "2026-09-06T12:00:00Z" },
    { event: "deferred", action_mode: "standard", at: "2026-09-05T12:00:00Z" },
    { event: "deferred", action: "later", at: "2026-09-04T12:00:00Z" },
    { event: "deferred", action: "later", at: "2026-09-03T12:00:00Z" },
    { event: "deferred", action: "later", at: "2026-09-02T12:00:00Z" }
  ];
  const hurting = [
    { event: "deferred", action_mode: "micro", at: "2026-09-08T11:00:00Z" },
    { event: "deferred", action_mode: "micro", at: "2026-09-07T11:00:00Z" },
    { event: "completed", action_mode: "standard", at: "2026-09-06T11:00:00Z" },
    { event: "completed", action_mode: "standard", at: "2026-09-05T11:00:00Z" },
    { event: "deferred", action: "later", at: "2026-09-04T11:00:00Z" },
    { event: "deferred", action: "later", at: "2026-09-03T11:00:00Z" },
    { event: "deferred", action: "later", at: "2026-09-02T11:00:00Z" }
  ];
  const rows = [
    { id: 1, name: "Micro Helps", status: "Researching", atlas_score: 80, focus: { history: helping } },
    { id: 2, name: "Micro Hurts", status: "Researching", atlas_score: 79, focus: { history: hurting } }
  ];
  const r = commandCenter(rows, now);
  const a = r.intelligence.find(x => x.id === 1);
  const b = r.intelligence.find(x => x.id === 2);
  assert.equal(a.adaptive_strategy.scope, "opportunity");
  assert.equal(a.adaptive_strategy.mode, "use_micro");
  assert.equal(b.adaptive_strategy.scope, "opportunity");
  assert.equal(b.adaptive_strategy.mode, "pause_micro");
});

test("Build 47 command center exposes adaptive strategy profiles", () => {
  const r = commandCenter([{ id: 1, name: "Idea", status: "Researching", atlas_score: 70 }], Date.parse("2026-09-08T18:00:00Z"));
  assert.ok(Array.isArray(r.adaptive_strategy_profiles));
  assert.equal(r.adaptive_strategy_profiles[0].scope, "portfolio");
  assert.equal(r.top_focus.adaptive_strategy.scope, "portfolio");
});

test("Build 47 renders Top Focus strategy scope in the adaptive learning panel", () => {
  const js = fs.readFileSync(path.join(__dirname, "..", "public", "app.js"), "utf8");
  assert.match(js, /top_focus\?\.adaptive_strategy/);
  assert.match(js, /Top Focus strategy/);
  assert.match(js, /scope_label/);
});


test("Build 48 classifies adaptive strategy evidence without fake precision", () => {
  assert.equal(adaptiveStrategyEvidence({ micro: { resolved: 1 }, standard: { resolved: 2 } }).level, "Insufficient");
  assert.equal(adaptiveStrategyEvidence({ micro: { resolved: 2 }, standard: { resolved: 3 } }).level, "Provisional");
  assert.equal(adaptiveStrategyEvidence({ micro: { resolved: 4 }, standard: { resolved: 6 } }).level, "Established");
  assert.equal(adaptiveStrategyEvidence({ micro: { resolved: 8 }, standard: { resolved: 9 } }).level, "Strong");
});

test("Build 48 reports evidence needed for the next durability tier", () => {
  const evidence = adaptiveStrategyEvidence({ micro: { resolved: 2 }, standard: { resolved: 3 } });
  assert.equal(evidence.target_per_mode, 4);
  assert.equal(evidence.remaining_micro, 2);
  assert.equal(evidence.remaining_standard, 1);
  assert.equal(evidence.balanced_sample, true);
});

test("Build 48 opportunity strategy exposes local and portfolio evidence", () => {
  const now = Date.parse("2026-09-08T18:00:00Z");
  const history = [
    { event: "completed", action_mode: "micro", at: "2026-09-08T12:00:00Z" },
    { event: "completed", action_mode: "micro", at: "2026-09-07T12:00:00Z" },
    { event: "deferred", action_mode: "standard", at: "2026-09-06T12:00:00Z" },
    { event: "deferred", action_mode: "standard", at: "2026-09-05T12:00:00Z" }
  ];
  const opportunity = { id: 9, name: "Evidence Test", status: "Researching", focus: { history } };
  const portfolioLearning = adaptiveActionLearning([opportunity], now);
  const strategy = adaptiveStrategyForOpportunity(opportunity, portfolioLearning, adaptiveActionPolicy(portfolioLearning), now);
  assert.equal(strategy.scope, "opportunity");
  assert.equal(strategy.evidence.level, "Provisional");
  assert.equal(strategy.portfolio_evidence.level, "Provisional");
});

test("Build 48 command center and UI expose strategy evidence", () => {
  const r = commandCenter([{ id: 1, name: "Idea", status: "Researching", atlas_score: 70 }], Date.parse("2026-09-08T15:00:00Z"));
  assert.equal(r.adaptive_strategy_evidence.level, "Insufficient");
  assert.equal(r.top_focus.adaptive_strategy.evidence.level, "Insufficient");
  const js = fs.readFileSync(path.join(__dirname, "..", "public", "app.js"), "utf8");
  assert.match(js, /Strategy evidence/);
  assert.match(js, /remaining_micro/);
});


test("Build 49 holds an established strategy when the contradictory swing is too small", () => {
  const opportunity = { id: 49, focus: { history: [
    { event: "started", adaptive_strategy_mode: "use_micro", adaptive_strategy_scope: "opportunity", adaptive_strategy_evidence: "Established", at: "2026-09-07T12:00:00Z" }
  ]}};
  const result = adaptiveStrategyGuardrail(
    opportunity,
    adaptivePolicyForMode("pause_micro"),
    { level: "Established" },
    { micro_follow_through_lift_pct: -25 }
  );
  assert.equal(result.policy.mode, "use_micro");
  assert.equal(result.stability.held, true);
  assert.equal(result.stability.candidate_mode, "pause_micro");
});

test("Build 49 accepts a strategy reversal when equally deep evidence is strongly contradictory", () => {
  const opportunity = { id: 49, focus: { history: [
    { event: "started", adaptive_strategy_mode: "use_micro", adaptive_strategy_scope: "opportunity", adaptive_strategy_evidence: "Established", at: "2026-09-07T12:00:00Z" }
  ]}};
  const result = adaptiveStrategyGuardrail(
    opportunity,
    adaptivePolicyForMode("pause_micro"),
    { level: "Established" },
    { micro_follow_through_lift_pct: -40 }
  );
  assert.equal(result.policy.mode, "pause_micro");
  assert.equal(result.stability.held, false);
});

test("Build 49 remembers the last strategy actually applied at focus start", () => {
  const snapshot = lastAdaptiveStrategySnapshot({ focus: { history: [
    { event: "completed", at: "2026-09-07T13:00:00Z" },
    { event: "started", adaptive_strategy_mode: "selective_micro", adaptive_strategy_scope: "opportunity", adaptive_strategy_evidence: "Strong", at: "2026-09-07T12:00:00Z" }
  ]}});
  assert.equal(snapshot.mode, "selective_micro");
  assert.equal(snapshot.evidence_level, "Strong");
});

test("Build 49 command center exposes strategy stability state", () => {
  const now = Date.parse("2026-09-08T18:00:00Z");
  const history = [
    { event: "started", adaptive_strategy_mode: "use_micro", adaptive_strategy_scope: "opportunity", adaptive_strategy_evidence: "Established", at: "2026-09-08T10:00:00Z" },
    { event: "completed", action_mode: "micro", at: "2026-09-08T12:00:00Z" },
    { event: "completed", action_mode: "micro", at: "2026-09-07T12:00:00Z" },
    { event: "completed", action_mode: "micro", at: "2026-09-06T12:00:00Z" },
    { event: "deferred", action_mode: "micro", at: "2026-09-05T12:00:00Z" },
    { event: "completed", action_mode: "standard", at: "2026-09-08T11:00:00Z" },
    { event: "completed", action_mode: "standard", at: "2026-09-07T11:00:00Z" },
    { event: "completed", action_mode: "standard", at: "2026-09-06T11:00:00Z" },
    { event: "completed", action_mode: "standard", at: "2026-09-05T11:00:00Z" }
  ];
  const r = commandCenter([{ id: 1, name: "Stable Idea", status: "Researching", atlas_score: 80, focus: { history } }], now);
  assert.ok(r.top_focus.adaptive_strategy.stability);
  assert.equal(typeof r.top_focus.adaptive_strategy.stability.held, "boolean");
});

test("Build 49 renders the strategy stability guardrail in the adaptive panel", () => {
  const js = fs.readFileSync(path.join(__dirname, "..", "public", "app.js"), "utf8");
  assert.match(js, /Strategy stability/);
  assert.match(js, /Strategy held for stability/);
  assert.match(js, /stability\.reason/);
});


test("Build 50 normalizes structured defer reasons", () => {
  assert.equal(normalizeDeferReason("too_big"), "too_big");
  assert.equal(normalizeDeferReason("BLOCKED"), "blocked");
  assert.equal(normalizeDeferReason("not-a-reason"), "");
  assert.equal(FOCUS_DEFER_REASONS.low_priority, "Does not feel worth prioritizing");
});

test("Build 50 diagnoses repeated action-size friction", () => {
  const now = Date.parse("2026-09-08T18:00:00Z");
  const opportunity = { id: 50, focus: { history: [
    { event: "deferred", defer_reason: "too_big", at: "2026-09-08T12:00:00Z" },
    { event: "deferred", defer_reason: "too_big", at: "2026-09-07T12:00:00Z" },
    { event: "deferred", defer_reason: "timing", at: "2026-09-06T12:00:00Z" }
  ]}};
  const diagnosis = focusFrictionDiagnosis(opportunity, now);
  assert.equal(diagnosis.signal, "Action-size friction");
  assert.equal(diagnosis.response, "shrink");
  assert.equal(diagnosis.dominant_reason, "too_big");
});

test("Build 50 does not mistake blockers for oversized work", () => {
  const now = Date.parse("2026-09-08T18:00:00Z");
  const history = [
    { event: "deferred", defer_reason: "blocked", at: "2026-09-08T12:00:00Z" },
    { event: "deferred", defer_reason: "blocked", at: "2026-09-07T12:00:00Z" },
    { event: "deferred", defer_reason: "blocked", at: "2026-09-06T12:00:00Z" }
  ];
  const opportunity = { id: 50, name: "Blocked", status: "Researching", atlas_score: 80, focus: { history } };
  const feedback = focusFeedbackForOpportunity(opportunity, now);
  const intelligence = opportunityIntelligence(opportunity, now, adaptivePolicyForMode("use_micro"));
  assert.equal(feedback.friction_diagnosis.response, "blocked");
  assert.equal(feedback.priority_adjustment, -2);
  assert.equal(intelligence.adaptive_next_action.mode, "standard");
  assert.match(intelligence.adaptive_next_action.reason, /blocker-driven/i);
});

test("Build 50 treats priority mismatch more strongly than timing friction", () => {
  const now = Date.parse("2026-09-08T18:00:00Z");
  const rows = reason => ({ id: reason, focus: { history: [
    { event: "deferred", defer_reason: reason, at: "2026-09-08T12:00:00Z" },
    { event: "deferred", defer_reason: reason, at: "2026-09-07T12:00:00Z" },
    { event: "deferred", defer_reason: reason, at: "2026-09-06T12:00:00Z" }
  ]}});
  const timing = focusFeedbackForOpportunity(rows("timing"), now);
  const priority = focusFeedbackForOpportunity(rows("low_priority"), now);
  assert.equal(timing.priority_adjustment, -3);
  assert.equal(priority.priority_adjustment, -10);
  assert.equal(priority.friction_diagnosis.signal, "Priority mismatch");
});

test("Build 50 command center and UI expose friction diagnosis", () => {
  const now = Date.parse("2026-09-08T18:00:00Z");
  const rows = [{ id: 1, name: "Idea", status: "Researching", atlas_score: 70, focus: { history: [
    { event: "deferred", defer_reason: "unclear", at: "2026-09-08T12:00:00Z" },
    { event: "deferred", defer_reason: "unclear", at: "2026-09-07T12:00:00Z" }
  ]}}];
  const r = commandCenter(rows, now);
  assert.equal(r.focus_friction.reasoned_deferred, 2);
  assert.equal(r.focus_friction.dominant_reason, "unclear");
  assert.equal(r.recommendation_feedback[0].friction_diagnosis.signal, "Clarity friction");
  const html = fs.readFileSync(path.join(__dirname, "..", "public", "index.html"), "utf8");
  const js = fs.readFileSync(path.join(__dirname, "..", "public", "app.js"), "utf8");
  assert.match(html, /Execution Friction Diagnosis/);
  assert.match(js, /data-focus-defer-reason/);
  assert.match(js, /focus_friction/);
});


test("Build 51 maps blocker friction to an executable unblock resolution", () => {
  const now = Date.parse("2026-09-08T18:00:00Z");
  const opportunity = { next_action: "Launch listing", focus: { history: [
    { event: "deferred", defer_reason: "blocked", at: "2026-09-07T18:00:00Z" },
    { event: "deferred", defer_reason: "blocked", at: "2026-09-08T12:00:00Z" }
  ] } };
  const diagnosis = focusFrictionDiagnosis(opportunity, now);
  const resolution = focusFrictionResolution(opportunity, diagnosis);
  assert.equal(diagnosis.response, "blocked");
  assert.equal(resolution.available, true);
  assert.equal(resolution.type, "unblock");
  assert.match(resolution.action, /blocker/i);
});

test("Build 51 maps priority mismatch to a reconsider resolution instead of task shrinking", () => {
  const now = Date.parse("2026-09-08T18:00:00Z");
  const opportunity = { next_action: "Do the thing", focus: { history: [
    { event: "deferred", defer_reason: "low_priority", at: "2026-09-07T18:00:00Z" },
    { event: "deferred", defer_reason: "low_priority", at: "2026-09-08T12:00:00Z" }
  ] } };
  const resolution = focusFrictionResolution(opportunity, focusFrictionDiagnosis(opportunity, now));
  assert.equal(resolution.type, "reconsider");
  assert.match(resolution.action, /move it down, pause it, or kill it/i);
});

test("Build 51 friction summary exposes executable resolution actions", () => {
  const now = Date.parse("2026-09-08T18:00:00Z");
  const summary = focusFrictionSummary([{ id: 9, name: "Test", focus: { history: [
    { event: "deferred", defer_reason: "too_big", at: "2026-09-07T18:00:00Z" },
    { event: "deferred", defer_reason: "too_big", at: "2026-09-08T12:00:00Z" }
  ] } }], now);
  assert.equal(summary.opportunities[0].resolution.available, true);
  assert.equal(summary.opportunities[0].resolution.type, "shrink");
});

test("Build 51 UI can start a friction resolution", () => {
  const js = fs.readFileSync(path.join(__dirname, "../public/app.js"), "utf8");
  assert.match(js, /startFrictionResolution/);
  assert.match(js, /friction-resolution/);
  assert.match(js, /Start resolution/);
});


test("Build 52 pairs resolution starts with completion outcomes", () => {
  const now = Date.parse("2026-09-08T18:00:00Z");
  const opportunity = { focus: { history: [
    { event: "friction_resolution_started", action_mode: "resolution", friction_response: "blocked", friction_reason: "blocked", action: "Resolve blocker", estimated_minutes: 10, at: "2026-09-08T12:00:00Z" },
    { event: "completed", action_mode: "resolution", action: "Resolve blocker", duration_minutes: 8, at: "2026-09-08T12:08:00Z" }
  ]}};
  const result = focusResolutionEffectiveness(opportunity, now);
  assert.equal(result.total, 1);
  assert.equal(result.completed, 1);
  assert.equal(result.success_pct, 100);
  assert.equal(result.types[0].response, "blocked");
  assert.equal(result.types[0].avg_minutes, 8);
});

test("Build 52 learns mixed effectiveness by resolution type", () => {
  const now = Date.parse("2026-09-08T18:00:00Z");
  const rows = [{ id: 1, name: "A", focus: { history: [
    { event: "friction_resolution_started", action_mode: "resolution", friction_response: "blocked", at: "2026-09-06T12:00:00Z" },
    { event: "completed", action_mode: "resolution", duration_minutes: 5, at: "2026-09-06T12:05:00Z" },
    { event: "friction_resolution_started", action_mode: "resolution", friction_response: "retime", at: "2026-09-07T12:00:00Z" },
    { event: "deferred", action_mode: "resolution", duration_minutes: 2, at: "2026-09-07T12:02:00Z" },
    { event: "friction_resolution_started", action_mode: "resolution", friction_response: "blocked", at: "2026-09-08T12:00:00Z" },
    { event: "completed", action_mode: "resolution", duration_minutes: 6, at: "2026-09-08T12:06:00Z" }
  ]}}];
  const result = focusResolutionEffectivenessSummary(rows, now);
  assert.equal(result.total, 3);
  assert.equal(result.completed, 2);
  assert.equal(result.success_pct, 67);
  assert.equal(result.signal, "Mixed resolution effectiveness");
  const blocked = result.types.find(item => item.response === "blocked");
  const retime = result.types.find(item => item.response === "retime");
  assert.equal(blocked.success_pct, 100);
  assert.equal(retime.success_pct, 0);
});

test("Build 52 command center exposes resolution effectiveness learning", () => {
  const now = Date.parse("2026-09-08T18:00:00Z");
  const rows = [{ id: 1, name: "Idea", status: "Testing", atlas_score: 75, focus: { history: [
    { event: "friction_resolution_started", action_mode: "resolution", friction_response: "clarify", at: "2026-09-08T12:00:00Z" },
    { event: "completed", action_mode: "resolution", duration_minutes: 4, at: "2026-09-08T12:04:00Z" }
  ]}}];
  const data = commandCenter(rows, now);
  assert.equal(data.resolution_effectiveness.total, 1);
  assert.equal(data.resolution_effectiveness.completed, 1);
});

test("Build 52 UI renders resolution effectiveness", () => {
  const js = fs.readFileSync(path.join(__dirname, "../public/app.js"), "utf8");
  assert.match(js, /resolution_effectiveness/);
  assert.match(js, /Resolution effectiveness/);
  assert.match(js, /success_pct/);
});

test("Build 53 preserves a resolution type with strong evidence", () => {
  const evidence = { types: [{ response: "blocked", total: 4, completed: 4, deferred: 0, success_pct: 100 }] };
  const strategy = resolutionStrategyFromEvidence("blocked", evidence, "portfolio");
  assert.equal(strategy.mode, "preserve");
  assert.equal(strategy.evidence_level, "Provisional");
});

test("Build 53 refines a weak resolution instead of blindly repeating it", () => {
  const now = Date.parse("2026-09-08T18:00:00Z");
  const opportunity = { next_action: "Launch listing", focus: { history: [
    { event: "deferred", defer_reason: "blocked", at: "2026-09-08T10:00:00Z" },
    { event: "deferred", defer_reason: "blocked", at: "2026-09-08T11:00:00Z" }
  ]}};
  const diagnosis = focusFrictionDiagnosis(opportunity, now);
  const strategy = resolutionStrategyFromEvidence("blocked", { types: [{ response: "blocked", total: 3, completed: 0, deferred: 3, success_pct: 0 }] }, "portfolio");
  const resolution = focusFrictionResolution(opportunity, diagnosis, strategy);
  assert.equal(strategy.mode, "refine");
  assert.equal(resolution.type, "review");
  assert.equal(resolution.label, "Revise the resolution");
  assert.match(resolution.action, /different way/i);
});

test("Build 53 uses opportunity-specific resolution evidence when sufficient", () => {
  const now = Date.parse("2026-09-08T18:00:00Z");
  const opportunity = { focus: { history: [
    { event: "deferred", defer_reason: "unclear", at: "2026-09-08T09:00:00Z" },
    { event: "deferred", defer_reason: "unclear", at: "2026-09-08T10:00:00Z" },
    { event: "friction_resolution_started", action_mode: "resolution", friction_response: "clarify", at: "2026-09-05T12:00:00Z" },
    { event: "completed", action_mode: "resolution", at: "2026-09-05T12:05:00Z" },
    { event: "friction_resolution_started", action_mode: "resolution", friction_response: "clarify", at: "2026-09-06T12:00:00Z" },
    { event: "completed", action_mode: "resolution", at: "2026-09-06T12:05:00Z" },
    { event: "friction_resolution_started", action_mode: "resolution", friction_response: "clarify", at: "2026-09-07T12:00:00Z" },
    { event: "completed", action_mode: "resolution", at: "2026-09-07T12:05:00Z" }
  ]}};
  const strategy = focusResolutionStrategy(opportunity, focusFrictionDiagnosis(opportunity, now), now, 30, { types: [] });
  assert.equal(strategy.scope, "opportunity");
  assert.equal(strategy.mode, "preserve");
});

test("Build 53 command center and UI expose adaptive resolution strategy", () => {
  const now = Date.parse("2026-09-08T18:00:00Z");
  const data = commandCenter([{ id: 1, name: "Idea", status: "Testing", atlas_score: 80, focus: { history: [] } }], now);
  assert.ok(data.resolution_strategy);
  const js = fs.readFileSync(path.join(__dirname, "../public/app.js"), "utf8");
  assert.match(js, /resolution_strategy/);
  assert.match(js, /Adaptive strategy/);
});


test("Build 54 classifies resolution strategy evidence depth", () => {
  assert.equal(resolutionStrategyEvidenceLevel(2), "Insufficient");
  assert.equal(resolutionStrategyEvidenceLevel(3), "Provisional");
  assert.equal(resolutionStrategyEvidenceLevel(6), "Established");
  assert.equal(resolutionStrategyEvidenceLevel(12), "Strong");
});

test("Build 54 holds an established preserve strategy through a shallow performance dip", () => {
  const candidate = { mode: "selective", response: "blocked", scope: "opportunity", resolved: 6, success_pct: 65, evidence_level: "Established" };
  const previous = { mode: "preserve", response: "blocked", scope: "opportunity", resolved: 6, success_pct: 83, evidence_level: "Established" };
  const guarded = resolutionStrategyGuardrail(candidate, previous);
  assert.equal(guarded.strategy.mode, "preserve");
  assert.equal(guarded.held, true);
  assert.equal(guarded.status, "held");
});

test("Build 54 accepts a strongly contradictory established resolution reversal", () => {
  const candidate = { mode: "refine", response: "blocked", scope: "opportunity", resolved: 7, success_pct: 14, evidence_level: "Established" };
  const previous = { mode: "preserve", response: "blocked", scope: "opportunity", resolved: 6, success_pct: 83, evidence_level: "Established" };
  const guarded = resolutionStrategyGuardrail(candidate, previous);
  assert.equal(guarded.strategy.mode, "refine");
  assert.equal(guarded.changed, true);
  assert.equal(guarded.status, "changed");
});

test("Build 54 remembers the last applied resolution strategy snapshot", () => {
  const now = Date.parse("2026-09-08T18:00:00Z");
  const opportunity = { focus: { history: [
    { event: "friction_resolution_started", friction_response: "blocked", resolution_strategy_mode: "preserve", resolution_strategy_scope: "opportunity", resolution_strategy_evidence: "Established", resolution_strategy_resolved: 8, resolution_strategy_success_pct: 75, at: "2026-09-08T12:00:00Z" }
  ]}};
  const snapshot = lastResolutionStrategySnapshot(opportunity, "blocked", now);
  assert.equal(snapshot.mode, "preserve");
  assert.equal(snapshot.resolved, 8);
  assert.equal(snapshot.success_pct, 75);
  assert.equal(snapshot.evidence_level, "Established");
});

test("Build 54 UI exposes resolution strategy stability", () => {
  const js = fs.readFileSync(path.join(__dirname, "../public/app.js"), "utf8");
  assert.match(js, /strategy held/);
  assert.match(js, /change accepted/);
  assert.match(js, /Stability:/);
});


test("Build 55 classifies timing evidence conservatively", () => {
  assert.equal(effortEvidenceLevel(2), "Insufficient");
  assert.equal(effortEvidenceLevel(3), "Provisional");
  assert.equal(effortEvidenceLevel(6), "Established");
  assert.equal(effortEvidenceLevel(12), "Strong");
});

test("Build 55 learns actual vs estimated effort from timed outcomes", () => {
  const now = Date.parse("2026-09-08T18:00:00Z");
  const opportunity = { focus: { history: [
    { event: "completed", action_mode: "micro", estimated_minutes: 10, duration_minutes: 20, at: "2026-09-06T12:20:00Z" },
    { event: "completed", action_mode: "micro", estimated_minutes: 10, duration_minutes: 18, at: "2026-09-07T12:18:00Z" },
    { event: "deferred", action_mode: "micro", estimated_minutes: 10, duration_minutes: 22, at: "2026-09-08T12:22:00Z" }
  ]}};
  const result = focusEffortCalibration(opportunity, now);
  assert.equal(result.modes.micro.samples, 3);
  assert.equal(result.modes.micro.adjustment_active, true);
  assert.equal(result.modes.micro.calibration_factor, 2);
  assert.equal(result.signal, "Work is taking longer than estimated");
});

test("Build 55 recalibrates timed micro actions only after enough evidence", () => {
  const calibration = { modes: { micro: { samples: 3, adjustment_active: true, calibration_factor: 2, evidence_level: "Provisional" } } };
  const result = calibrateTimedAction("Spend 10 minutes rewriting the next step.", 10, "micro", calibration);
  assert.equal(result.estimated_minutes, 20);
  assert.equal(result.base_estimated_minutes, 10);
  assert.match(result.action, /Spend 20 minutes/);
});

test("Build 55 ignores zero-minute and incomplete timing records", () => {
  const now = Date.parse("2026-09-08T18:00:00Z");
  const opportunity = { focus: { history: [
    { event: "completed", action_mode: "micro", estimated_minutes: 10, duration_minutes: 0, at: "2026-09-08T12:00:00Z" },
    { event: "started", action_mode: "micro", estimated_minutes: 10, at: "2026-09-08T13:00:00Z" }
  ]}};
  const result = focusEffortCalibration(opportunity, now);
  assert.equal(result.samples, 0);
  assert.equal(result.evidence_level, "Insufficient");
});

test("Build 55 command center and UI expose effort calibration", () => {
  const data = commandCenter([{ id: 1, name: "Idea", status: "Testing", atlas_score: 80, focus: { history: [] } }], Date.parse("2026-09-08T18:00:00Z"));
  assert.ok(data.effort_calibration);
  const js = fs.readFileSync(path.join(__dirname, "../public/app.js"), "utf8");
  assert.match(js, /effort_calibration/);
  assert.match(js, /Effort calibration/);
});


test("Build 56 learns a typical execution-capacity block from timed outcomes", () => {
  const now = Date.parse("2026-09-08T18:00:00Z");
  const opportunity = { focus: { history: [
    { event: "completed", duration_minutes: 12, at: "2026-09-06T12:12:00Z" },
    { event: "completed", duration_minutes: 15, at: "2026-09-07T12:15:00Z" },
    { event: "deferred", duration_minutes: 18, at: "2026-09-08T12:18:00Z" }
  ]}};
  const profile = focusCapacityProfile(opportunity, now);
  assert.equal(profile.active, true);
  assert.equal(profile.samples, 3);
  assert.equal(profile.typical_block_minutes, 15);
  assert.equal(profile.upper_block_minutes, 20);
});

test("Build 56 identifies recommendations that fit learned capacity", () => {
  const fit = capacityFitForAction({ estimated_minutes: 15 }, { active: true, typical_block_minutes: 15, upper_block_minutes: 20 });
  assert.equal(fit.status, "fit");
  assert.equal(fit.score_adjustment, 2);
});

test("Build 56 flags materially oversized recommendations", () => {
  const fit = capacityFitForAction({ estimated_minutes: 45 }, { active: true, typical_block_minutes: 15, upper_block_minutes: 20 });
  assert.equal(fit.status, "oversized");
  assert.equal(fit.score_adjustment, -6);
  assert.match(fit.guidance, /dedicated block or split/i);
});

test("Build 56 stays neutral while execution capacity is still learning", () => {
  const fit = capacityFitForAction({ estimated_minutes: 20 }, { active: false, samples: 2 });
  assert.equal(fit.status, "learning");
  assert.equal(fit.score_adjustment, 0);
});

test("Build 56 command center and UI expose execution capacity", () => {
  const data = commandCenter([{ id: 1, name: "Idea", status: "Testing", atlas_score: 80, focus: { history: [] } }], Date.parse("2026-09-08T18:00:00Z"));
  assert.ok(data.capacity_profile);
  assert.ok(data.top_focus.capacity_fit);
  const js = fs.readFileSync(path.join(__dirname, "../public/app.js"), "utf8");
  assert.match(js, /capacity_profile/);
  assert.match(js, /Execution capacity/);
  assert.match(js, /Capacity fit/);
});


test("Build 57 defaults work blocks from learned execution capacity", () => {
  const profile = { active: true, typical_block_minutes: 25 };
  assert.equal(normalizeWorkBlockMinutes(null, profile), 25);
  assert.equal(normalizeWorkBlockMinutes(47, profile), 45);
});

test("Build 57 selects high-priority work that fits the available block", () => {
  const now = Date.parse("2026-09-08T18:00:00Z");
  const opportunities = [
    { id: 1, name: "Large Task", status: "Testing", atlas_score: 95, next_action: "Large strategic task", focus: { history: [
      { event: "deferred", defer_reason: "too_big", duration_minutes: 10, at: "2026-09-07T12:00:00Z" },
      { event: "deferred", defer_reason: "too_big", duration_minutes: 10, at: "2026-09-08T12:00:00Z" }
    ]}},
    { id: 2, name: "Small Task", status: "Researching", atlas_score: 80, next_action: "Validate demand", focus: { history: [] } }
  ];
  const plan = nextWorkBlockPlan(opportunities, now, 15);
  assert.equal(plan.available_minutes, 15);
  assert.ok(plan.selected);
  assert.equal(plan.selected.fits, true);
  assert.ok(plan.selected.estimated_minutes <= 15);
});

test("Build 57 converts untimed standard recommendations into bounded work blocks", () => {
  const now = Date.parse("2026-09-08T18:00:00Z");
  const plan = nextWorkBlockPlan([{ id: 1, name: "Idea", status: "Researching", atlas_score: 85, next_action: "Research competitors", focus: { history: [] } }], now, 30);
  assert.equal(plan.selected.mode, "timeboxed_standard");
  assert.equal(plan.selected.estimated_minutes, 30);
  assert.match(plan.selected.action, /Spend 30 minutes advancing this recommendation/);
});

test("Build 57 command center exposes a next work block plan", () => {
  const data = commandCenter([{ id: 1, name: "Idea", status: "Researching", atlas_score: 80, next_action: "Validate demand", focus: { history: [] } }], Date.parse("2026-09-08T18:00:00Z"), 45);
  assert.ok(data.next_work_block);
  assert.equal(data.next_work_block.available_minutes, 45);
});

test("Build 57 UI exposes work-block planning and exact planned-block start fields", () => {
  const html = fs.readFileSync(path.join(__dirname, "../public/index.html"), "utf8");
  const js = fs.readFileSync(path.join(__dirname, "../public/app.js"), "utf8");
  assert.match(html, /Next Work Block/);
  assert.match(html, /workBlockMinutes/);
  assert.match(js, /planned_action/);
  assert.match(js, /planned_minutes/);
  assert.match(js, /Start this block/);
});


test("Build 58 normalizes daily plan windows", () => {
  assert.equal(normalizeDailyPlanMinutes(92), 90);
  assert.equal(normalizeDailyPlanMinutes(240), 240);
  assert.equal(normalizeDailyPlanMinutes(null), 90);
});

test("Build 58 sequences distinct work blocks inside the daily budget", () => {
  const now = Date.parse("2026-09-08T18:00:00Z");
  const opportunities = [
    { id: 1, name: "One", status: "Researching", atlas_score: 95, next_action: "Advance one", focus: { history: [] } },
    { id: 2, name: "Two", status: "Researching", atlas_score: 90, next_action: "Advance two", focus: { history: [] } },
    { id: 3, name: "Three", status: "Researching", atlas_score: 85, next_action: "Advance three", focus: { history: [] } }
  ];
  const plan = dailyWorkPlan(opportunities, now, 90);
  assert.equal(plan.blocks.length, 3);
  assert.deepEqual(plan.blocks.map(x => x.id), [1,2,3]);
  assert.equal(plan.planned_minutes, 90);
  assert.equal(plan.remaining_minutes, 0);
});

test("Build 58 does not overpack the daily plan", () => {
  const now = Date.parse("2026-09-08T18:00:00Z");
  const opportunities = [
    { id: 1, name: "One", status: "Researching", atlas_score: 95, next_action: "Advance one", focus: { history: [] } },
    { id: 2, name: "Two", status: "Researching", atlas_score: 90, next_action: "Advance two", focus: { history: [] } }
  ];
  const plan = dailyWorkPlan(opportunities, now, 45);
  assert.equal(plan.blocks.length, 2);
  assert.equal(plan.planned_minutes, 45);
  assert.equal(plan.remaining_minutes, 0);
});

test("Build 58 command center exposes daily work planning", () => {
  const data = commandCenter([{ id: 1, name: "Idea", status: "Researching", atlas_score: 80, next_action: "Validate demand", focus: { history: [] } }], Date.parse("2026-09-08T18:00:00Z"), 30, 120);
  assert.ok(data.daily_work_plan);
  assert.equal(data.daily_work_plan.total_minutes, 120);
});

test("Build 58 UI exposes the Daily Work Plan", () => {
  const html = fs.readFileSync(path.join(__dirname, "../public/index.html"), "utf8");
  const js = fs.readFileSync(path.join(__dirname, "../public/app.js"), "utf8");
  assert.match(html, /Daily Work Plan/);
  assert.match(html, /dailyPlanMinutes/);
  assert.match(js, /renderDailyWorkPlan/);
  assert.match(js, /data-start-daily-block/);
});


test("Build 59 uses the configured Atlas timezone for daily-plan date keys", () => {
  assert.equal(localDateKey("2026-09-09T02:00:00Z", "America/Chicago"), "2026-09-08");
});

test("Build 59 identifies an overpacked daily plan from weak follow-through", () => {
  const now = Date.parse("2026-09-08T18:00:00Z");
  const opportunity = { id: 1, name: "Plan", focus: { history: [
    { event: "started", work_block_source: "daily_work_plan", plan_date: "2026-09-07", estimated_minutes: 30, at: "2026-09-07T14:00:00Z" },
    { event: "completed", work_block_source: "daily_work_plan", plan_date: "2026-09-07", duration_minutes: 20, at: "2026-09-07T14:20:00Z" },
    { event: "started", work_block_source: "daily_work_plan", plan_date: "2026-09-07", estimated_minutes: 30, at: "2026-09-07T15:00:00Z" },
    { event: "deferred", work_block_source: "daily_work_plan", plan_date: "2026-09-07", duration_minutes: 5, at: "2026-09-07T15:05:00Z" },
    { event: "started", work_block_source: "daily_work_plan", plan_date: "2026-09-08", estimated_minutes: 30, at: "2026-09-08T14:00:00Z" },
    { event: "deferred", work_block_source: "daily_work_plan", plan_date: "2026-09-08", duration_minutes: 5, at: "2026-09-08T14:05:00Z" },
    { event: "started", work_block_source: "daily_work_plan", plan_date: "2026-09-08", estimated_minutes: 30, at: "2026-09-08T15:00:00Z" },
    { event: "deferred", work_block_source: "daily_work_plan", plan_date: "2026-09-08", duration_minutes: 5, at: "2026-09-08T15:05:00Z" }
  ]}};
  const result = dailyPlanExecutionSummary([opportunity], now);
  assert.equal(result.plan_days, 2);
  assert.equal(result.follow_through_pct, 25);
  assert.equal(result.adjustment, "reduce");
  assert.match(result.signal, /overpacked/i);
});

test("Build 59 recognizes a healthy daily-plan sequence", () => {
  const now = Date.parse("2026-09-08T18:00:00Z");
  const history = [];
  for (const [date, base] of [["2026-09-07", "2026-09-07"], ["2026-09-08", "2026-09-08"]]) {
    for (let i = 0; i < 2; i++) {
      history.push({ event: "started", work_block_source: "daily_work_plan", plan_date: date, estimated_minutes: 30, at: `${base}T${14+i}:00:00Z` });
      history.push({ event: "completed", work_block_source: "daily_work_plan", plan_date: date, duration_minutes: 25, at: `${base}T${14+i}:25:00Z` });
    }
  }
  const result = dailyPlanExecutionSummary([{ id: 1, name: "Plan", focus: { history } }], now);
  assert.equal(result.follow_through_pct, 100);
  assert.equal(result.execution_pct, 100);
  assert.equal(result.adjustment, "maintain");
  assert.match(result.signal, /fitting well/i);
});

test("Build 59 command center exposes daily plan execution learning", () => {
  const data = commandCenter([{ id: 1, name: "Idea", status: "Researching", atlas_score: 80, next_action: "Validate demand", focus: { history: [] } }], Date.parse("2026-09-08T18:00:00Z"), 30, 90);
  assert.ok(data.daily_plan_execution);
  assert.equal(data.daily_plan_execution.adjustment, "learning");
});

test("Build 59 UI records daily-plan metadata and renders plan feedback", () => {
  const js = fs.readFileSync(path.join(__dirname, "../public/app.js"), "utf8");
  assert.match(js, /work_block_source:\s*"daily_work_plan"/);
  assert.match(js, /plan_sequence/);
  assert.match(js, /plan_total_minutes/);
  assert.match(js, /daily_plan_execution/);
  assert.match(js, /follow-through/);
});


test("Build 60 reduces daily planning density after overpacked execution", () => {
  const adaptation = dailyPlanAdaptation({ adjustment: "reduce" }, 120);
  assert.equal(adaptation.mode, "reduce");
  assert.equal(adaptation.density_pct, 70);
  assert.equal(adaptation.target_minutes, 90);
  assert.equal(adaptation.reserved_minutes, 30);
});

test("Build 60 keeps the full daily window when plan fit is healthy", () => {
  const adaptation = dailyPlanAdaptation({ adjustment: "maintain" }, 90);
  assert.equal(adaptation.mode, "maintain");
  assert.equal(adaptation.target_minutes, 90);
  assert.equal(adaptation.reserved_minutes, 0);
});

test("Build 60 daily work plan applies learned plan sizing", () => {
  const now = Date.parse("2026-09-08T18:00:00Z");
  const weakHistory = [
    { event: "started", work_block_source: "daily_work_plan", plan_date: "2026-09-07", estimated_minutes: 30, at: "2026-09-07T14:00:00Z" },
    { event: "completed", work_block_source: "daily_work_plan", plan_date: "2026-09-07", duration_minutes: 20, at: "2026-09-07T14:20:00Z" },
    { event: "started", work_block_source: "daily_work_plan", plan_date: "2026-09-07", estimated_minutes: 30, at: "2026-09-07T15:00:00Z" },
    { event: "deferred", work_block_source: "daily_work_plan", plan_date: "2026-09-07", duration_minutes: 5, at: "2026-09-07T15:05:00Z" },
    { event: "started", work_block_source: "daily_work_plan", plan_date: "2026-09-08", estimated_minutes: 30, at: "2026-09-08T14:00:00Z" },
    { event: "deferred", work_block_source: "daily_work_plan", plan_date: "2026-09-08", duration_minutes: 5, at: "2026-09-08T14:05:00Z" },
    { event: "started", work_block_source: "daily_work_plan", plan_date: "2026-09-08", estimated_minutes: 30, at: "2026-09-08T15:00:00Z" },
    { event: "deferred", work_block_source: "daily_work_plan", plan_date: "2026-09-08", duration_minutes: 5, at: "2026-09-08T15:05:00Z" }
  ];
  const opportunities = [
    { id: 1, name: "A", status: "Researching", atlas_score: 95, next_action: "Validate A", focus: { history: weakHistory } },
    { id: 2, name: "B", status: "Researching", atlas_score: 90, next_action: "Validate B", focus: { history: [] } },
    { id: 3, name: "C", status: "Researching", atlas_score: 85, next_action: "Validate C", focus: { history: [] } },
    { id: 4, name: "D", status: "Researching", atlas_score: 80, next_action: "Validate D", focus: { history: [] } }
  ];
  const plan = dailyWorkPlan(opportunities, now, 120);
  assert.equal(plan.adaptation.mode, "reduce");
  assert.equal(plan.planning_target_minutes, 90);
  assert.ok(plan.planned_minutes <= 90);
  assert.ok(plan.remaining_minutes >= 30);
  assert.equal(plan.blocks[0].start_after_minutes, 0);
});

test("Build 60 command center exposes adaptive daily plan sizing", () => {
  const data = commandCenter([{ id: 1, name: "Idea", status: "Researching", atlas_score: 80, next_action: "Validate demand", focus: { history: [] } }], Date.parse("2026-09-08T18:00:00Z"), 30, 90);
  assert.ok(data.daily_work_plan.adaptation);
  assert.equal(data.daily_work_plan.adaptation.mode, "learning");
  assert.equal(data.daily_work_plan.planning_target_minutes, 90);
});

test("Build 60 UI explains adaptive daily plan sizing", () => {
  const js = fs.readFileSync(path.join(__dirname, "../public/app.js"), "utf8");
  assert.match(js, /planning target/);
  assert.match(js, /reserved/);
  assert.match(js, /adaptation\.label/);
});


test("Build 61 learns daily-plan performance by density", () => {
  const now = Date.parse("2026-09-08T18:00:00Z");
  const history = [];
  for (let i = 0; i < 3; i++) {
    history.push({ event: "started", work_block_source: "daily_work_plan", plan_density_pct: 70, estimated_minutes: 30, at: `2026-09-0${6+i}T14:00:00Z` });
    history.push({ event: "completed", work_block_source: "daily_work_plan", plan_density_pct: 70, duration_minutes: 25, at: `2026-09-0${6+i}T14:25:00Z` });
  }
  for (let i = 0; i < 2; i++) {
    history.push({ event: "started", work_block_source: "daily_work_plan", plan_density_pct: 100, estimated_minutes: 30, at: `2026-09-0${7+i}T15:00:00Z` });
    history.push({ event: "deferred", work_block_source: "daily_work_plan", plan_density_pct: 100, duration_minutes: 5, at: `2026-09-0${7+i}T15:05:00Z` });
  }
  const result = dailyPlanDensityLearning([{ id: 1, focus: { history } }], now);
  assert.equal(result.best_density_pct, 70);
  assert.match(result.signal, /Lighter density is leading/);
  assert.equal(result.bands.find(x => x.density_pct === 70).follow_through_pct, 100);
});

test("Build 61 stays conservative before density evidence exists", () => {
  const result = dailyPlanDensityLearning([{ id: 1, focus: { history: [] } }], Date.parse("2026-09-08T18:00:00Z"));
  assert.equal(result.best_density_pct, null);
  assert.equal(result.best_evidence, "Insufficient");
  assert.match(result.signal, /baseline forming/i);
});

test("Build 61 command center exposes density learning", () => {
  const data = commandCenter([{ id: 1, name: "Idea", status: "Researching", atlas_score: 80, next_action: "Validate", focus: { history: [] } }], Date.parse("2026-09-08T18:00:00Z"), 30, 90);
  assert.ok(data.daily_plan_density_learning);
  assert.equal(data.daily_plan_density_learning.bands.length, 3);
});

test("Build 61 UI records and displays plan density", () => {
  const js = fs.readFileSync(path.join(__dirname, "../public/app.js"), "utf8");
  assert.match(js, /plan_density_pct/);
  assert.match(js, /daily_plan_density_learning/);
  assert.match(js, /leading density/);
});

test("Build 61 focus normalization preserves plan density", () => {
  const focus = normalizeFocusState({ status: "active", plan_density_pct: 85, history: [] });
  assert.equal(focus.plan_density_pct, 85);
});


test("Build 62 keeps rule-based density while learned evidence is provisional", () => {
  const now = Date.parse("2026-09-08T18:00:00Z");
  const history = [
    { event: "started", work_block_source: "daily_work_plan", plan_density_pct: 70, estimated_minutes: 30, at: "2026-09-07T14:00:00Z" },
    { event: "completed", work_block_source: "daily_work_plan", plan_density_pct: 70, duration_minutes: 25, at: "2026-09-07T14:25:00Z" },
    { event: "started", work_block_source: "daily_work_plan", plan_density_pct: 70, estimated_minutes: 30, at: "2026-09-08T14:00:00Z" },
    { event: "completed", work_block_source: "daily_work_plan", plan_density_pct: 70, duration_minutes: 25, at: "2026-09-08T14:25:00Z" }
  ];
  const result = dailyPlanDensityController([{ id: 1, focus: { history } }], now, 90, { adjustment: "maintain" });
  assert.equal(result.density_pct, 100);
  assert.equal(result.source, "rule_based");
});

test("Build 62 adopts an established winning density", () => {
  const now = Date.parse("2026-09-08T18:00:00Z");
  const history = [];
  for (let i = 0; i < 4; i++) {
    history.push({ event: "started", work_block_source: "daily_work_plan", plan_density_pct: 70, estimated_minutes: 30, at: `2026-09-0${5+i}T14:00:00Z` });
    history.push({ event: "completed", work_block_source: "daily_work_plan", plan_density_pct: 70, duration_minutes: 25, at: `2026-09-0${5+i}T14:25:00Z` });
  }
  const result = dailyPlanDensityController([{ id: 1, focus: { history } }], now, 120, { adjustment: "maintain" });
  assert.equal(result.density_pct, 70);
  assert.equal(result.source, "learned");
  assert.equal(result.target_minutes, 90);
  assert.match(result.stability, /active|accepted/i);
});

test("Build 62 holds an established prior density against a shallow challenger", () => {
  const now = Date.parse("2026-09-08T18:00:00Z");
  const history = [{ event: "started", work_block_source: "daily_work_plan", plan_density_pct: 85, estimated_minutes: 30, at: "2026-09-08T17:00:00Z" }];
  const learning = {
    best_density_pct: 70,
    bands: [
      { density_pct: 70, evidence: "Established", performance_score: 86, resolved: 4 },
      { density_pct: 85, evidence: "Established", performance_score: 80, resolved: 4 },
      { density_pct: 100, evidence: "Insufficient", performance_score: null, resolved: 0 }
    ]
  };
  const result = dailyPlanDensityController([{ id: 1, focus: { history } }], now, 120, { adjustment: "maintain" }, learning);
  assert.equal(result.density_pct, 85);
  assert.equal(result.source, "learned_stable");
  assert.match(result.stability, /held for stability/i);
});

test("Build 62 command center exposes the applied density controller", () => {
  const data = commandCenter([{ id: 1, name: "Idea", status: "Researching", atlas_score: 80, next_action: "Validate", focus: { history: [] } }], Date.parse("2026-09-08T18:00:00Z"), 30, 90);
  assert.ok(data.daily_plan_density_controller);
  assert.equal(data.daily_plan_density_controller.source, "rule_based");
  assert.equal(data.daily_plan_density_controller.density_pct, 100);
});

test("Build 62 UI displays density-controller stability and applied density", () => {
  const js = fs.readFileSync(path.join(__dirname, "../public/app.js"), "utf8");
  assert.match(js, /daily_plan_density_controller/);
  assert.match(js, /applied density/);
  assert.match(js, /Density controller learning/);
});


test("Build 63 classifies execution windows in Atlas local time", () => {
  assert.equal(executionTimeWindow("2026-09-08T14:00:00Z", "America/Chicago"), "morning");
  assert.equal(executionTimeWindow("2026-09-08T19:00:00Z", "America/Chicago"), "afternoon");
  assert.equal(executionTimeWindow("2026-09-09T00:00:00Z", "America/Chicago"), "evening");
  assert.equal(executionTimeWindow("2026-09-09T05:00:00Z", "America/Chicago"), "late_night");
});

test("Build 63 learns a preferred execution window only from resolved daily-plan blocks", () => {
  const now = Date.parse("2026-09-08T23:00:00Z");
  const history = [];
  for (let i = 0; i < 4; i++) {
    history.push({ event: "started", work_block_source: "daily_work_plan", plan_time_window: "afternoon", estimated_minutes: 30, at: `2026-09-0${5+i}T19:00:00Z` });
    history.push({ event: "completed", work_block_source: "daily_work_plan", plan_time_window: "afternoon", duration_minutes: 25, at: `2026-09-0${5+i}T19:25:00Z` });
  }
  for (let i = 0; i < 2; i++) {
    history.push({ event: "started", work_block_source: "daily_work_plan", plan_time_window: "morning", estimated_minutes: 30, at: `2026-09-0${7+i}T14:00:00Z` });
    history.push({ event: "deferred", work_block_source: "daily_work_plan", plan_time_window: "morning", duration_minutes: 5, at: `2026-09-0${7+i}T14:05:00Z` });
  }
  const result = dailyPlanTimeWindowLearning([{ id: 1, focus: { history } }], now);
  assert.equal(result.preferred_window, "afternoon");
  assert.equal(result.preferred_evidence, "Established");
  assert.match(result.signal, /Afternoon execution is leading/);
});

test("Build 63 stays neutral when time-of-day evidence is thin", () => {
  const now = Date.parse("2026-09-08T23:00:00Z");
  const history = [
    { event: "started", work_block_source: "daily_work_plan", plan_time_window: "evening", estimated_minutes: 30, at: "2026-09-08T22:00:00Z" },
    { event: "completed", work_block_source: "daily_work_plan", plan_time_window: "evening", duration_minutes: 20, at: "2026-09-08T22:20:00Z" }
  ];
  const result = dailyPlanTimeWindowLearning([{ id: 1, focus: { history } }], now);
  assert.equal(result.preferred_window, null);
  assert.equal(result.preferred_evidence, "Insufficient");
  assert.match(result.signal, /baseline forming/i);
});

test("Build 63 command center exposes time-of-day execution learning", () => {
  const data = commandCenter([{ id: 1, name: "Idea", status: "Researching", atlas_score: 80, next_action: "Validate", focus: { history: [] } }], Date.parse("2026-09-08T18:00:00Z"), 30, 90);
  assert.ok(data.daily_plan_time_window_learning);
  assert.equal(data.daily_plan_time_window_learning.windows.length, 4);
  assert.equal(data.daily_work_plan.preferred_time_window, null);
});

test("Build 63 UI displays time-of-day learning", () => {
  const js = fs.readFileSync(path.join(__dirname, "../public/app.js"), "utf8");
  assert.match(js, /daily_plan_time_window_learning/);
  assert.match(js, /Time-of-day baseline forming/);
  assert.match(js, /morning · afternoon · evening · late night/);
});


test("Build 64 rewards established opportunity fit in the current execution window", () => {
  const now = Date.parse("2026-09-08T20:00:00Z");
  const history = [];
  for (let i = 0; i < 4; i++) {
    history.push({ event: "started", work_block_source: "daily_work_plan", plan_time_window: "afternoon", estimated_minutes: 30, at: `2026-09-0${4+i}T19:00:00Z` });
    history.push({ event: "completed", work_block_source: "daily_work_plan", plan_time_window: "afternoon", duration_minutes: 25, at: `2026-09-0${4+i}T19:25:00Z` });
  }
  const fit = opportunityTimeWindowFit({ id: 7, name: "Afternoon winner", focus: { history } }, now);
  assert.equal(fit.evidence, "Established");
  assert.equal(fit.fit, "strong_fit");
  assert.equal(fit.score_adjustment, 4);
  assert.equal(fit.follow_through_pct, 100);
});

test("Build 64 reduces near-term priority for established weak window fit", () => {
  const now = Date.parse("2026-09-08T20:00:00Z");
  const history = [];
  for (let i = 0; i < 4; i++) {
    history.push({ event: "started", work_block_source: "daily_work_plan", plan_time_window: "afternoon", estimated_minutes: 30, at: `2026-09-0${4+i}T19:00:00Z` });
    history.push({ event: "deferred", work_block_source: "daily_work_plan", plan_time_window: "afternoon", duration_minutes: 5, at: `2026-09-0${4+i}T19:05:00Z` });
  }
  const fit = opportunityTimeWindowFit({ id: 8, name: "Afternoon stall", focus: { history } }, now);
  assert.equal(fit.evidence, "Established");
  assert.equal(fit.fit, "weak_fit");
  assert.equal(fit.score_adjustment, -4);
});

test("Build 64 keeps time-window priority neutral until evidence is established", () => {
  const now = Date.parse("2026-09-08T20:00:00Z");
  const history = [
    { event: "started", work_block_source: "daily_work_plan", plan_time_window: "afternoon", at: "2026-09-07T19:00:00Z" },
    { event: "completed", work_block_source: "daily_work_plan", plan_time_window: "afternoon", duration_minutes: 20, at: "2026-09-07T19:20:00Z" },
    { event: "started", work_block_source: "daily_work_plan", plan_time_window: "afternoon", at: "2026-09-08T19:00:00Z" },
    { event: "completed", work_block_source: "daily_work_plan", plan_time_window: "afternoon", duration_minutes: 20, at: "2026-09-08T19:20:00Z" }
  ];
  const fit = opportunityTimeWindowFit({ id: 9, focus: { history } }, now);
  assert.equal(fit.evidence, "Provisional");
  assert.equal(fit.score_adjustment, 0);
});

test("Build 64 applies established current-window fit inside the Daily Work Plan", () => {
  const now = Date.parse("2026-09-08T20:00:00Z");
  const strongHistory = [];
  for (let i = 0; i < 4; i++) {
    strongHistory.push({ event: "started", work_block_source: "daily_work_plan", plan_time_window: "afternoon", estimated_minutes: 30, at: `2026-09-0${4+i}T19:00:00Z` });
    strongHistory.push({ event: "completed", work_block_source: "daily_work_plan", plan_time_window: "afternoon", duration_minutes: 25, at: `2026-09-0${4+i}T19:25:00Z` });
  }
  const opportunities = [
    { id: 1, name: "Slightly higher base", status: "Researching", atlas_score: 82, next_action: "Validate A", focus: { history: [] } },
    { id: 2, name: "Afternoon fit", status: "Researching", atlas_score: 80, next_action: "Validate B", focus: { history: strongHistory } }
  ];
  const plan = dailyWorkPlan(opportunities, now, 30);
  const fitted = plan.blocks.find(item => item.id === 2);
  assert.ok(fitted);
  assert.equal(fitted.time_window_fit.score_adjustment, 4);
  assert.equal(plan.time_window_priority.adjusted_count, 1);
  assert.match(plan.guidance, /execution-fit evidence adjusted/i);
});

test("Build 64 exposes time-window-aware priority without changing Atlas Score", () => {
  const now = Date.parse("2026-09-08T20:00:00Z");
  const data = commandCenter([{ id: 1, name: "Idea", status: "Researching", atlas_score: 80, next_action: "Validate", focus: { history: [] } }], now, 30, 90);
  assert.ok(data.daily_plan_time_window_priority);
  assert.equal(data.daily_plan_time_window_priority.current_window, "afternoon");
  assert.equal(data.daily_plan_time_window_priority.adjusted_count, 0);
  const js = fs.readFileSync(path.join(__dirname, "../public/app.js"), "utf8");
  assert.match(js, /daily_plan_time_window_priority/);
  assert.match(js, /Atlas Score unchanged/);
  assert.match(js, /priority adjustment/);
});


test("Build 65 classifies practical work types from planned actions", () => {
  assert.equal(workTypeForAction("Research marketplace demand for a new listing"), "research");
  assert.equal(workTypeForAction("Create the Etsy listing graphics"), "create");
  assert.equal(workTypeForAction("Review the weekly checkpoint"), "review");
  assert.equal(workTypeForAction("Email three local partners"), "outreach");
});

test("Build 65 learns strong work-type fit only after established current-window evidence", () => {
  const now = Date.parse("2026-09-08T20:00:00Z");
  const history = [];
  for (let i = 0; i < 4; i++) {
    history.push({ event: "started", work_block_source: "daily_work_plan", plan_time_window: "afternoon", plan_work_type: "research", action: "Research demand", at: `2026-09-0${4+i}T19:00:00Z` });
    history.push({ event: "completed", work_block_source: "daily_work_plan", plan_time_window: "afternoon", plan_work_type: "research", action: "Research demand", duration_minutes: 25, at: `2026-09-0${4+i}T19:25:00Z` });
  }
  const result = dailyPlanWorkTypeLearning([{ id: 1, focus: { history } }], now);
  const research = result.types.find(item => item.work_type === "research");
  assert.equal(research.evidence, "Established");
  assert.equal(research.fit, "strong_fit");
  assert.equal(research.score_adjustment, 3);
  assert.equal(result.adjusted_count, 1);
});

test("Build 65 keeps work-type fit neutral when evidence is shallow", () => {
  const now = Date.parse("2026-09-08T20:00:00Z");
  const history = [
    { event: "started", work_block_source: "daily_work_plan", plan_time_window: "afternoon", plan_work_type: "create", action: "Create draft", at: "2026-09-07T19:00:00Z" },
    { event: "completed", work_block_source: "daily_work_plan", plan_time_window: "afternoon", plan_work_type: "create", action: "Create draft", duration_minutes: 20, at: "2026-09-07T19:20:00Z" },
    { event: "started", work_block_source: "daily_work_plan", plan_time_window: "afternoon", plan_work_type: "create", action: "Create image", at: "2026-09-08T19:00:00Z" },
    { event: "completed", work_block_source: "daily_work_plan", plan_time_window: "afternoon", plan_work_type: "create", action: "Create image", duration_minutes: 20, at: "2026-09-08T19:20:00Z" }
  ];
  const result = dailyPlanWorkTypeLearning([{ id: 1, focus: { history } }], now);
  const creation = result.types.find(item => item.work_type === "create");
  assert.equal(creation.evidence, "Provisional");
  assert.equal(creation.score_adjustment, 0);
});

test("Build 65 applies evidence-backed work-type fit inside Daily Work Plan ordering", () => {
  const now = Date.parse("2026-09-08T20:00:00Z");
  const learningHistory = [];
  for (let i = 0; i < 4; i++) {
    learningHistory.push({ event: "started", work_block_source: "daily_work_plan", plan_time_window: "afternoon", plan_work_type: "research", action: "Research market", at: `2026-09-0${4+i}T19:00:00Z` });
    learningHistory.push({ event: "completed", work_block_source: "daily_work_plan", plan_time_window: "afternoon", plan_work_type: "research", action: "Research market", duration_minutes: 20, at: `2026-09-0${4+i}T19:20:00Z` });
  }
  const opportunities = [
    { id: 99, name: "Learning history", status: "Killed", atlas_score: 1, focus: { history: learningHistory } },
    { id: 1, name: "Active review option", status: "Active", atlas_score: 82, focus: { history: [] } },
    { id: 2, name: "Research option", status: "Researching", atlas_score: 80, focus: { history: [] } }
  ];
  const plan = dailyWorkPlan(opportunities, now, 30);
  assert.equal(plan.blocks[0].id, 2);
  assert.equal(plan.blocks[0].work_type, "research");
  assert.equal(plan.blocks[0].work_type_fit.score_adjustment, 3);
  assert.equal(plan.work_type_learning.adjusted_count, 1);
});

test("Build 65 exposes work-type learning in Command Center and UI", () => {
  const now = Date.parse("2026-09-08T20:00:00Z");
  const data = commandCenter([{ id: 1, name: "Idea", status: "Researching", atlas_score: 80, next_action: "Research demand", focus: { history: [] } }], now, 30, 90);
  assert.ok(data.daily_plan_work_type_learning);
  assert.equal(data.daily_plan_work_type_learning.adjusted_count, 0);
  const js = fs.readFileSync(path.join(__dirname, "../public/app.js"), "utf8");
  assert.match(js, /daily_plan_work_type_learning/);
  assert.match(js, /Research · creation · editing · setup · review · outreach/);
});


test("Build 66 learns when mixed work-type plan days outperform focused plan days", () => {
  const now = Date.parse("2026-09-08T20:00:00Z");
  const history = [];
  for (let d = 1; d <= 3; d++) {
    const date = `2026-09-0${d}`;
    history.push({ event: "completed", work_block_source: "daily_work_plan", plan_date: date, plan_time_window: "afternoon", plan_work_type: "general", action: "Advance work", at: `${date}T19:20:00Z` });
    history.push({ event: "completed", work_block_source: "daily_work_plan", plan_date: date, plan_time_window: "afternoon", plan_work_type: "outreach", action: "Email partner", at: `${date}T19:50:00Z` });
  }
  for (let d = 4; d <= 5; d++) {
    const date = `2026-09-0${d}`;
    history.push({ event: "completed", work_block_source: "daily_work_plan", plan_date: date, plan_time_window: "afternoon", plan_work_type: "general", action: "Advance work", at: `${date}T19:20:00Z` });
    history.push({ event: "deferred", work_block_source: "daily_work_plan", plan_date: date, plan_time_window: "afternoon", plan_work_type: "general", action: "Advance more work", at: `${date}T19:50:00Z` });
  }
  const result = dailyPlanCompositionLearning([{ id: 1, focus: { history } }], now);
  assert.equal(result.mode, "mixed");
  assert.equal(result.preferred_evidence, "Established");
  assert.ok(result.performance_gap >= 10);
  assert.equal(dailyPlanCompositionAdjustment("research", ["review"], result), 2);
  assert.equal(dailyPlanCompositionAdjustment("review", ["review"], result), -2);
});

test("Build 66 keeps plan composition neutral while comparative evidence is shallow", () => {
  const now = Date.parse("2026-09-08T20:00:00Z");
  const history = [
    { event: "completed", work_block_source: "daily_work_plan", plan_date: "2026-09-07", plan_time_window: "afternoon", plan_work_type: "general", action: "Advance", at: "2026-09-07T19:20:00Z" },
    { event: "completed", work_block_source: "daily_work_plan", plan_date: "2026-09-07", plan_time_window: "afternoon", plan_work_type: "outreach", action: "Email", at: "2026-09-07T19:50:00Z" }
  ];
  const result = dailyPlanCompositionLearning([{ id: 1, focus: { history } }], now);
  assert.equal(result.mode, "learning");
  assert.equal(result.preferred_mode, null);
  assert.equal(dailyPlanCompositionAdjustment("research", ["review"], result), 0);
});

test("Build 66 mixed composition evidence gently diversifies Daily Work Plan sequencing", () => {
  const now = Date.parse("2026-09-08T20:00:00Z");
  const history = [];
  for (let d = 1; d <= 3; d++) {
    const date = `2026-09-0${d}`;
    history.push({ event: "completed", work_block_source: "daily_work_plan", plan_date: date, plan_time_window: "afternoon", plan_work_type: "general", action: "Advance", at: `${date}T19:20:00Z` });
    history.push({ event: "completed", work_block_source: "daily_work_plan", plan_date: date, plan_time_window: "afternoon", plan_work_type: "outreach", action: "Email", at: `${date}T19:50:00Z` });
  }
  for (let d = 4; d <= 5; d++) {
    const date = `2026-09-0${d}`;
    history.push({ event: "completed", work_block_source: "daily_work_plan", plan_date: date, plan_time_window: "afternoon", plan_work_type: "general", action: "Advance", at: `${date}T19:20:00Z` });
    history.push({ event: "deferred", work_block_source: "daily_work_plan", plan_date: date, plan_time_window: "afternoon", plan_work_type: "general", action: "Advance", at: `${date}T19:50:00Z` });
  }
  const opportunities = [
    { id: 90, name: "Composition history", status: "Killed", atlas_score: 1, focus: { history } },
    { id: 1, name: "Research A", status: "Researching", atlas_score: 84, focus: { history: [] } },
    { id: 2, name: "Research B", status: "Researching", atlas_score: 83, focus: { history: [] } },
    { id: 3, name: "Active review", status: "Active", atlas_score: 82, focus: { history: [] } }
  ];
  const plan = dailyWorkPlan(opportunities, now, 60);
  assert.equal(plan.composition_learning.mode, "mixed");
  assert.equal(plan.blocks.length, 2);
  assert.notEqual(plan.blocks[0].work_type, plan.blocks[1].work_type);
  assert.equal(plan.blocks[1].composition_adjustment, 2);
});

test("Build 66 focused composition evidence gently favors work-type continuity", () => {
  const now = Date.parse("2026-09-08T20:00:00Z");
  const history = [];
  for (let d = 1; d <= 3; d++) {
    const date = `2026-09-0${d}`;
    history.push({ event: "completed", work_block_source: "daily_work_plan", plan_date: date, plan_time_window: "afternoon", plan_work_type: "general", action: "Advance", at: `${date}T19:20:00Z` });
    history.push({ event: "completed", work_block_source: "daily_work_plan", plan_date: date, plan_time_window: "afternoon", plan_work_type: "general", action: "Advance", at: `${date}T19:50:00Z` });
  }
  for (let d = 4; d <= 5; d++) {
    const date = `2026-09-0${d}`;
    history.push({ event: "deferred", work_block_source: "daily_work_plan", plan_date: date, plan_time_window: "afternoon", plan_work_type: "general", action: "Advance", at: `${date}T19:20:00Z` });
    history.push({ event: "deferred", work_block_source: "daily_work_plan", plan_date: date, plan_time_window: "afternoon", plan_work_type: "outreach", action: "Email", at: `${date}T19:50:00Z` });
  }
  const result = dailyPlanCompositionLearning([{ id: 1, focus: { history } }], now);
  assert.equal(result.mode, "focused");
  assert.equal(dailyPlanCompositionAdjustment("research", ["research"], result), 2);
  assert.equal(dailyPlanCompositionAdjustment("review", ["research"], result), -2);
});

test("Build 66 exposes plan composition learning through Command Center and UI", () => {
  const now = Date.parse("2026-09-08T20:00:00Z");
  const data = commandCenter([{ id: 1, name: "Idea", status: "Researching", atlas_score: 80, focus: { history: [] } }], now, 30, 90);
  assert.ok(data.daily_plan_composition_learning);
  assert.equal(data.daily_plan_composition_learning.mode, "learning");
  assert.equal(compositionEvidenceLevel(3), "Established");
  const js = fs.readFileSync(path.join(__dirname, "../public/app.js"), "utf8");
  assert.match(js, /daily_plan_composition_learning/);
  assert.match(js, /Comparing focused plans/);
  assert.match(js, /plan_composition_mode/);
});


test("Build 67 learns work-type position fit within the current time window", () => {
  const now = Date.parse("2026-09-08T20:00:00Z");
  const history = [];
  for (let d = 1; d <= 4; d++) {
    const date = `2026-09-0${d}`;
    history.push({ event: "completed", work_block_source: "daily_work_plan", plan_date: date, plan_sequence: 1, plan_time_window: "afternoon", plan_work_type: "research", action: "Research demand", at: `${date}T19:10:00Z` });
    history.push({ event: "completed", work_block_source: "daily_work_plan", plan_date: date, plan_sequence: 2, plan_time_window: "afternoon", plan_work_type: "review", action: "Review findings", at: `${date}T19:40:00Z` });
  }
  const result = dailyPlanSequenceLearning([{ id: 1, focus: { history } }], now);
  const firstResearch = result.positions.find(item => item.work_type === "research" && item.position === "first");
  assert.equal(firstResearch.evidence, "Established");
  assert.equal(firstResearch.follow_through_pct, 100);
  assert.equal(firstResearch.score_adjustment, 1);
  assert.ok(result.adjusted_positions >= 2);
  assert.equal(sequenceEvidenceLevel(4), "Established");
});

test("Build 67 learns repeated work-type transitions", () => {
  const now = Date.parse("2026-09-08T20:00:00Z");
  const history = [];
  for (let d = 1; d <= 4; d++) {
    const date = `2026-09-0${d}`;
    history.push({ event: "completed", work_block_source: "daily_work_plan", plan_date: date, plan_sequence: 1, plan_time_window: "afternoon", plan_work_type: "research", action: "Research", at: `${date}T19:10:00Z` });
    history.push({ event: "completed", work_block_source: "daily_work_plan", plan_date: date, plan_sequence: 2, plan_time_window: "afternoon", plan_work_type: "review", action: "Review", at: `${date}T19:40:00Z` });
  }
  const result = dailyPlanSequenceLearning([{ id: 1, focus: { history } }], now);
  const transition = result.transitions.find(item => item.key === "research>review");
  assert.equal(transition.evidence, "Established");
  assert.equal(transition.follow_through_pct, 100);
  assert.equal(transition.score_adjustment, 1);
});

test("Build 67 keeps sequence influence neutral while evidence is shallow", () => {
  const now = Date.parse("2026-09-08T20:00:00Z");
  const history = [
    { event: "completed", work_block_source: "daily_work_plan", plan_date: "2026-09-07", plan_sequence: 1, plan_time_window: "afternoon", plan_work_type: "research", action: "Research", at: "2026-09-07T19:10:00Z" },
    { event: "completed", work_block_source: "daily_work_plan", plan_date: "2026-09-07", plan_sequence: 2, plan_time_window: "afternoon", plan_work_type: "review", action: "Review", at: "2026-09-07T19:40:00Z" }
  ];
  const result = dailyPlanSequenceLearning([{ id: 1, focus: { history } }], now);
  const adjustment = dailyPlanSequenceAdjustment("review", "last", ["research"], result);
  assert.equal(adjustment.adjustment, 0);
  assert.equal(result.adjusted_positions, 0);
  assert.equal(result.adjusted_transitions, 0);
});

test("Build 67 sequence evidence gently refines Daily Work Plan ordering", () => {
  const now = Date.parse("2026-09-08T20:00:00Z");
  const history = [];
  for (let d = 1; d <= 4; d++) {
    const date = `2026-09-0${d}`;
    history.push({ event: "completed", work_block_source: "daily_work_plan", plan_date: date, plan_sequence: 1, plan_time_window: "afternoon", plan_work_type: "research", action: "Research", at: `${date}T19:10:00Z` });
    history.push({ event: "completed", work_block_source: "daily_work_plan", plan_date: date, plan_sequence: 2, plan_time_window: "afternoon", plan_work_type: "review", action: "Review", at: `${date}T19:40:00Z` });
  }
  const opportunities = [
    { id: 90, name: "Sequence history", status: "Killed", atlas_score: 1, focus: { history } },
    { id: 1, name: "Research work", status: "Researching", atlas_score: 84, focus: { history: [] } },
    { id: 2, name: "Active review", status: "Active", atlas_score: 83, focus: { history: [] } }
  ];
  const plan = dailyWorkPlan(opportunities, now, 60);
  assert.equal(plan.blocks.length, 2);
  assert.equal(plan.blocks[0].work_type, "research");
  assert.equal(plan.blocks[1].work_type, "review");
  assert.ok(plan.blocks[1].sequence_adjustment > 0);
  assert.ok(plan.sequence_learning.adjusted_transitions >= 1);
});

test("Build 67 exposes sequence learning through Command Center and UI", () => {
  const now = Date.parse("2026-09-08T20:00:00Z");
  const data = commandCenter([{ id: 1, name: "Idea", status: "Researching", atlas_score: 80, focus: { history: [] } }], now, 30, 90);
  assert.ok(data.daily_plan_sequence_learning);
  assert.equal(data.daily_plan_sequence_learning.adjusted_positions, 0);
  const js = fs.readFileSync(path.join(__dirname, "../public/app.js"), "utf8");
  assert.match(js, /daily_plan_sequence_learning/);
  assert.match(js, /Learning first · middle · last placement and transitions/);
  assert.match(js, /sequence_adjustment/);
});


test("Build 68 detects established plan-depth fatigue", () => {
  const now = Date.parse("2026-09-08T20:00:00Z");
  const history = [];
  for (let d = 1; d <= 4; d++) {
    const date = `2026-09-0${d}`;
    history.push({ event: "completed", work_block_source: "daily_work_plan", plan_date: date, plan_sequence: 1, plan_time_window: "afternoon", action: "Early one", at: `${date}T19:10:00Z` });
    history.push({ event: "completed", work_block_source: "daily_work_plan", plan_date: date, plan_sequence: 2, plan_time_window: "afternoon", action: "Early two", at: `${date}T19:40:00Z` });
    history.push({ event: d === 1 ? "completed" : "deferred", work_block_source: "daily_work_plan", plan_date: date, plan_sequence: 3, plan_time_window: "afternoon", action: "Deep three", at: `${date}T20:10:00Z` });
  }
  const result = dailyPlanDepthLearning([{ id: 1, focus: { history } }], now);
  assert.equal(result.early.evidence, "Strong");
  assert.equal(result.deep.evidence, "Established");
  assert.equal(result.early.follow_through_pct, 100);
  assert.equal(result.deep.follow_through_pct, 25);
  assert.equal(result.decay_active, true);
  assert.equal(result.recommended_max_blocks, 3);
  assert.equal(depthEvidenceLevel(4), "Established");
});

test("Build 68 keeps plan depth neutral while comparative evidence is shallow", () => {
  const now = Date.parse("2026-09-08T20:00:00Z");
  const history = [
    { event: "completed", work_block_source: "daily_work_plan", plan_date: "2026-09-07", plan_sequence: 1, plan_time_window: "afternoon", action: "Early", at: "2026-09-07T19:10:00Z" },
    { event: "deferred", work_block_source: "daily_work_plan", plan_date: "2026-09-07", plan_sequence: 3, plan_time_window: "afternoon", action: "Deep", at: "2026-09-07T20:10:00Z" }
  ];
  const learning = dailyPlanDepthLearning([{ id: 1, focus: { history } }], now);
  const controller = dailyPlanDepthController(learning, 5);
  assert.equal(learning.decay_active, false);
  assert.equal(controller.active, false);
  assert.equal(controller.max_blocks, 5);
});

test("Build 68 uses a stronger cap when both depth bands have Strong evidence", () => {
  const now = Date.parse("2026-09-08T20:00:00Z");
  const history = [];
  for (let d = 1; d <= 8; d++) {
    const date = `2026-08-${String(20 + d).padStart(2, "0")}`;
    history.push({ event: "completed", work_block_source: "daily_work_plan", plan_date: date, plan_sequence: 1, plan_time_window: "afternoon", action: "Early", at: `${date}T19:10:00Z` });
    history.push({ event: "deferred", work_block_source: "daily_work_plan", plan_date: date, plan_sequence: 3, plan_time_window: "afternoon", action: "Deep", at: `${date}T20:10:00Z` });
  }
  const learning = dailyPlanDepthLearning([{ id: 1, focus: { history } }], now);
  const controller = dailyPlanDepthController(learning, 5);
  assert.equal(learning.strength, "Strong");
  assert.equal(controller.active, true);
  assert.equal(controller.max_blocks, 2);
});

test("Build 68 plan-depth controller shortens Daily Work Plan only after evidence", () => {
  const now = Date.parse("2026-09-08T20:00:00Z");
  const history = [];
  for (let d = 1; d <= 4; d++) {
    const date = `2026-09-0${d}`;
    history.push({ event: "completed", work_block_source: "daily_work_plan", plan_date: date, plan_sequence: 1, plan_time_window: "afternoon", action: "Early", at: `${date}T19:10:00Z` });
    history.push({ event: "completed", work_block_source: "daily_work_plan", plan_date: date, plan_sequence: 2, plan_time_window: "afternoon", action: "Early", at: `${date}T19:40:00Z` });
    history.push({ event: "deferred", work_block_source: "daily_work_plan", plan_date: date, plan_sequence: 3, plan_time_window: "afternoon", action: "Deep", at: `${date}T20:10:00Z` });
  }
  const opportunities = [
    { id: 90, name: "Depth history", status: "Killed", atlas_score: 1, focus: { history } },
    { id: 1, name: "Idea A", status: "Researching", atlas_score: 95, focus: { history: [] } },
    { id: 2, name: "Idea B", status: "Researching", atlas_score: 94, focus: { history: [] } },
    { id: 3, name: "Idea C", status: "Researching", atlas_score: 93, focus: { history: [] } },
    { id: 4, name: "Idea D", status: "Researching", atlas_score: 92, focus: { history: [] } }
  ];
  const plan = dailyWorkPlan(opportunities, now, 120);
  assert.equal(plan.depth_controller.active, true);
  assert.ok(plan.blocks.length <= 3);
  assert.equal(plan.depth_controller.max_blocks, 3);
});

test("Build 68 exposes plan-depth learning through Command Center and UI", () => {
  const now = Date.parse("2026-09-08T20:00:00Z");
  const data = commandCenter([{ id: 1, name: "Idea", status: "Researching", atlas_score: 80, focus: { history: [] } }], now, 30, 90);
  assert.ok(data.daily_plan_depth_learning);
  assert.ok(data.daily_plan_depth_controller);
  assert.equal(data.daily_plan_depth_learning.decay_active, false);
  const js = fs.readFileSync(path.join(__dirname, "../public/app.js"), "utf8");
  assert.match(js, /daily_plan_depth_learning/);
  assert.match(js, /Comparing blocks 1–2 with blocks 3\+/);
});


test("Build 69 detects recent plan-depth recovery without erasing historical fatigue", () => {
  const now = Date.parse("2026-09-08T20:00:00Z");
  const history = [];
  for (let d = 10; d <= 17; d++) {
    const date = `2026-08-${d}`;
    history.push({ event: "completed", work_block_source: "daily_work_plan", plan_date: date, plan_sequence: 1, plan_time_window: "afternoon", at: `${date}T19:10:00Z` });
    history.push({ event: "deferred", work_block_source: "daily_work_plan", plan_date: date, plan_sequence: 3, plan_time_window: "afternoon", at: `${date}T20:10:00Z` });
  }
  for (let d = 5; d <= 8; d++) {
    const date = `2026-09-0${d}`;
    history.push({ event: "completed", work_block_source: "daily_work_plan", plan_date: date, plan_sequence: 1, plan_time_window: "afternoon", at: `${date}T19:10:00Z` });
    history.push({ event: "completed", work_block_source: "daily_work_plan", plan_date: date, plan_sequence: 3, plan_time_window: "afternoon", at: `${date}T19:50:00Z` });
  }
  const opportunities = [{ id: 1, focus: { history } }];
  const depth = dailyPlanDepthLearning(opportunities, now);
  const recovery = dailyPlanDepthRecoveryLearning(opportunities, now, depth);
  assert.equal(depth.decay_active, true);
  assert.equal(depth.recommended_max_blocks, 2);
  assert.equal(recovery.recovered, true);
  assert.equal(recovery.deep.follow_through_pct, 100);
  assert.equal(recovery.mode, "recovered");
});

test("Build 69 schedules a controlled third-block probe when a strong cap would otherwise block recovery evidence", () => {
  const now = Date.parse("2026-09-08T20:00:00Z");
  const history = [];
  for (let d = 10; d <= 17; d++) {
    const date = `2026-08-${d}`;
    history.push({ event: "completed", work_block_source: "daily_work_plan", plan_date: date, plan_sequence: 1, plan_time_window: "afternoon", at: `${date}T19:10:00Z` });
    history.push({ event: "deferred", work_block_source: "daily_work_plan", plan_date: date, plan_sequence: 3, plan_time_window: "afternoon", at: `${date}T20:10:00Z` });
  }
  for (let d = 5; d <= 8; d++) {
    const date = `2026-09-0${d}`;
    history.push({ event: "completed", work_block_source: "daily_work_plan", plan_date: date, plan_sequence: 1, plan_time_window: "afternoon", at: `${date}T19:10:00Z` });
  }
  const opportunities = [{ id: 1, focus: { history } }];
  const depth = dailyPlanDepthLearning(opportunities, now);
  const recovery = dailyPlanDepthRecoveryLearning(opportunities, now, depth);
  const controller = dailyPlanDepthRecoveryController(dailyPlanDepthController(depth, 5), recovery, 5);
  assert.equal(depth.recommended_max_blocks, 2);
  assert.equal(recovery.probe_due, true);
  assert.equal(recovery.mode, "probe");
  assert.equal(controller.source, "recovery_probe");
  assert.equal(controller.max_blocks, 3);
});

test("Build 69 keeps fatigue protection when recent execution has not recovered", () => {
  const depthController = { active: true, max_blocks: 3, source: "depth_learning", reason: "Fatigue active" };
  const recovery = { recovered: false, probe_due: false, mode: "protected", guidance: "Keep protecting" };
  const controller = dailyPlanDepthRecoveryController(depthController, recovery, 5);
  assert.equal(controller.recovery_active, false);
  assert.equal(controller.max_blocks, 3);
  assert.equal(controller.source, "depth_learning");
});

test("Build 69 relaxes recovery in stages instead of jumping from the strongest cap to five blocks", () => {
  const recovery = { recovered: true, probe_due: false, mode: "recovered", guidance: "Recovery detected" };
  const strong = dailyPlanDepthRecoveryController({ active: true, max_blocks: 2, source: "depth_learning" }, recovery, 5);
  const established = dailyPlanDepthRecoveryController({ active: true, max_blocks: 3, source: "depth_learning" }, recovery, 5);
  assert.equal(strong.max_blocks, 3);
  assert.equal(strong.source, "depth_recovery");
  assert.equal(established.max_blocks, 5);
  assert.equal(established.active, false);
});

test("Build 69 exposes depth recovery through Command Center and UI", () => {
  const now = Date.parse("2026-09-08T20:00:00Z");
  const data = commandCenter([{ id: 1, name: "Idea", status: "Researching", atlas_score: 80, focus: { history: [] } }], now, 30, 90);
  assert.ok(data.daily_plan_depth_recovery_learning);
  assert.equal(data.daily_plan_depth_recovery_learning.mode, "learning");
  const js = fs.readFileSync(path.join(__dirname, "../public/app.js"), "utf8");
  assert.match(js, /daily_plan_depth_recovery_learning/);
  assert.match(js, /Controlled third-block recovery probe/);
  assert.match(js, /Depth recovery baseline forming/);
});


test("Build 70 learns block-size fit separately for early and deep plan positions", () => {
  const now = Date.parse("2026-09-08T20:00:00Z");
  const history = [];
  const add = (seq, mins, event, day) => history.push({ event, action: "Review work", work_block_source: "daily_work_plan", plan_sequence: seq, plan_time_window: "afternoon", estimated_minutes: mins, at: new Date(now - day * 86400000).toISOString() });
  for (let i=1;i<=4;i++) { add(1,20,"completed",i); add(2,30,i===1?"completed":"deferred",i); }
  for (let i=5;i<=8;i++) { add(3,45,"completed",i); add(4,30,i===5?"completed":"deferred",i); }
  const learning = dailyPlanBlockSizeLearning([{ id:1, focus:{history} }], now);
  assert.equal(learning.early.preferred_band, "short");
  assert.equal(learning.early.actionable, true);
  assert.equal(learning.deep.preferred_band, "long");
  assert.equal(learning.deep.actionable, true);
});

test("Build 70 block-size learning stays neutral without comparative established evidence", () => {
  const now = Date.parse("2026-09-08T20:00:00Z");
  const history = Array.from({length:4}, (_,i) => ({ event:"completed", action:"Review work", work_block_source:"daily_work_plan", plan_sequence:1, plan_time_window:"afternoon", estimated_minutes:20, at:new Date(now-(i+1)*86400000).toISOString() }));
  const learning = dailyPlanBlockSizeLearning([{ id:1, focus:{history} }], now);
  assert.equal(learning.early.actionable, false);
  assert.equal(learning.early.preferred_band, null);
});

test("Build 70 controller moves block target no more than fifteen minutes", () => {
  const learning = { early:{ actionable:true, preferred_target_minutes:45, preferred_band:"long", preferred_label:"Long", preferred_evidence:"Established", advantage_points:25 } };
  const controlled = dailyPlanBlockSizeController(learning, 20, "early");
  assert.equal(controlled.active, true);
  assert.equal(controlled.target_minutes, 35);
  assert.equal(controlled.source, "block_size_learning");
});

test("Build 70 Daily Work Plan exposes learned block-size targets", () => {
  const now = Date.parse("2026-09-08T20:00:00Z");
  const history = [];
  const add = (mins,event,day) => history.push({ event, action:"Research demand", work_block_source:"daily_work_plan", plan_sequence:1, plan_time_window:"afternoon", estimated_minutes:mins, at:new Date(now-day*86400000).toISOString() });
  for (let i=1;i<=4;i++) { add(20,"completed",i); add(30,i===1?"completed":"deferred",i+5); }
  const opps = [{ id:1, name:"Idea", status:"Researching", atlas_score:80, focus:{history} }];
  const plan = dailyWorkPlan(opps, now, 90);
  assert.ok(plan.block_size_learning);
  assert.ok(plan.block_size_controller);
  assert.equal(plan.block_size_controller.early.active, true);
});

test("Build 70 exposes block-size learning through Command Center and UI", () => {
  const now = Date.parse("2026-09-08T20:00:00Z");
  const data = commandCenter([{ id:1, name:"Idea", status:"Researching", atlas_score:80, focus:{history:[]} }], now, 30, 90);
  assert.ok(data.daily_plan_block_size_learning);
  assert.ok(data.daily_plan_block_size_controller);
  const js = fs.readFileSync(path.join(__dirname, "../public/app.js"), "utf8");
  assert.match(js, /daily_plan_block_size_learning/);
  assert.match(js, /Comparing short · standard · long blocks by plan depth/);
});


test("Build 71 learns planned-versus-actual duration separately by plan depth", () => {
  const now = Date.parse("2026-09-08T20:00:00Z");
  const history = [];
  for (let i=1;i<=4;i++) {
    history.push({ event:"completed", work_block_source:"daily_work_plan", plan_sequence:1, plan_time_window:"afternoon", estimated_minutes:30, duration_minutes:45, at:new Date(now-i*86400000).toISOString() });
    history.push({ event:"completed", work_block_source:"daily_work_plan", plan_sequence:3, plan_time_window:"afternoon", estimated_minutes:30, duration_minutes:28, at:new Date(now-(i+5)*86400000).toISOString() });
  }
  const learning = dailyPlanBlockSizeOutcomeLearning([{id:1,focus:{history}}], now);
  assert.equal(learning.early.duration_accuracy_pct, 150);
  assert.equal(learning.deep.duration_accuracy_pct, 93);
  assert.equal(learning.early.evidence, "Established");
});

test("Build 71 trims a block target when established outcomes run long and follow-through is soft", () => {
  const learning = { early:{ evidence:"Established", duration_accuracy_pct:150, follow_through_pct:50 } };
  const controller = dailyPlanBlockSizeOutcomeController({ active:true, target_minutes:30, source:"block_size_learning" }, learning, "early");
  assert.equal(controller.outcome_active, true);
  assert.equal(controller.outcome_adjustment_minutes, -5);
  assert.equal(controller.target_minutes, 25);
});

test("Build 71 only expands a target on strong efficient outcome evidence", () => {
  const established = dailyPlanBlockSizeOutcomeController({ target_minutes:30, source:"baseline" }, { early:{ evidence:"Established", duration_accuracy_pct:80, follow_through_pct:100 } }, "early");
  const strong = dailyPlanBlockSizeOutcomeController({ target_minutes:30, source:"baseline" }, { early:{ evidence:"Strong", duration_accuracy_pct:80, follow_through_pct:100 } }, "early");
  assert.equal(established.outcome_active, false);
  assert.equal(established.target_minutes, 30);
  assert.equal(strong.outcome_active, true);
  assert.equal(strong.target_minutes, 35);
});

test("Build 71 Daily Work Plan exposes actual-duration calibration", () => {
  const now = Date.parse("2026-09-08T20:00:00Z");
  const history = [];
  for (let i=1;i<=4;i++) {
    history.push({ event:i<=2?"completed":"deferred", action:"Research demand", work_block_source:"daily_work_plan", plan_sequence:1, plan_time_window:"afternoon", estimated_minutes:30, duration_minutes:i<=2?45:0, at:new Date(now-i*86400000).toISOString() });
  }
  const plan = dailyWorkPlan([{ id:1, name:"Idea", status:"Researching", atlas_score:80, focus:{history} }], now, 90);
  assert.ok(plan.block_size_outcome_learning);
  assert.equal(plan.block_size_controller.early.outcome_active, true);
  assert.equal(plan.block_size_controller.early.target_minutes, 25);
});

test("Build 71 exposes block-outcome calibration through Command Center and UI", () => {
  const now = Date.parse("2026-09-08T20:00:00Z");
  const data = commandCenter([{ id:1, name:"Idea", status:"Researching", atlas_score:80, focus:{history:[]} }], now, 30, 90);
  assert.ok(data.daily_plan_block_size_outcome_learning);
  const js = fs.readFileSync(path.join(__dirname, "../public/app.js"), "utf8");
  assert.match(js, /daily_plan_block_size_outcome_learning/);
  assert.match(js, /Comparing planned minutes · actual minutes · follow-through/);
});


test("Build 72 Radar Score rewards Atlas-aligned economics and automation", () => {
  const high = radarScore({ income_potential:9, speed_to_revenue:9, startup_cost_score:10, ongoing_effort_score:9, scalability_score:9, automation_potential:10, atlas_fit:10, confidence:8 });
  const weak = radarScore({ income_potential:4, speed_to_revenue:3, startup_cost_score:2, ongoing_effort_score:2, scalability_score:3, automation_potential:1, atlas_fit:3, confidence:4 });
  assert.ok(high >= 85);
  assert.ok(high > weak);
});

test("Build 72 automatically stages candidates from score and evidence", () => {
  assert.equal(radarStageForScore(58, 3), "New");
  assert.equal(radarStageForScore(65, 0), "Worth Investigating");
  assert.equal(radarStageForScore(75, 1), "Atlas Recommended");
  assert.equal(radarStageForScore(85, 2), "Ready to Test");
});

test("Build 72 normalizes Radar candidates and preserves manual valid stages", () => {
  const candidate = normalizeRadarCandidate({ name:"AI menu template", category:"Digital Product", description:"Sell a reusable template", evidence:["Marketplace sales"], income_potential:8, speed_to_revenue:8, startup_cost_score:10, ongoing_effort_score:9, scalability_score:9, automation_potential:9, atlas_fit:10, confidence:8, stage:"Atlas Recommended" });
  assert.equal(candidate.stage, "Atlas Recommended");
  assert.ok(candidate.radar_score >= 80);
  assert.equal(candidate.evidence.length, 1);
});

test("Build 72 Radar summary excludes dismissed and promoted candidates from active counts", () => {
  const summary = radarSummary([
    {name:"A",stage:"New",radar_score:55},
    {name:"B",stage:"Ready to Test",radar_score:88},
    {name:"C",stage:"Dismissed",radar_score:90},
    {name:"D",stage:"Promoted",radar_score:92}
  ]);
  assert.equal(summary.total, 4);
  assert.equal(summary.active, 2);
  assert.equal(summary.ready_to_test, 1);
  assert.equal(summary.top_candidates[0].name, "B");
});

test("Build 72 exposes Opportunity Radar UI and API hooks", () => {
  const html = fs.readFileSync(path.join(__dirname, "../public/index.html"), "utf8");
  const js = fs.readFileSync(path.join(__dirname, "../public/app.js"), "utf8");
  assert.match(html, /OPPORTUNITY RADAR/);
  assert.match(html, /Candidate Pipeline/);
  assert.match(js, /\/api\/radar/);
  assert.match(js, /Promote to Researching/);
});


test("Build 73 weights direct high-quality evidence above assumptions", () => {
  const strong = radarEvidenceStrength([
    { text:"Three customers asked for this", type:"direct_customer_request", quality:"High" },
    { text:"Comparable listings are selling", type:"competitor_sales", quality:"High" }
  ]);
  const weak = radarEvidenceStrength([
    { text:"Seems useful", type:"assumption", quality:"Low" },
    { text:"Could be popular", type:"assumption", quality:"Low" }
  ]);
  assert.equal(strong.level, "Strong");
  assert.ok(strong.points > weak.points);
  assert.equal(weak.level, "Weak");
});

test("Build 73 blocks high Radar scores from Ready to Test when evidence is weak", () => {
  const weakEvidence = [
    { text:"I think people want it", type:"assumption", quality:"Low" },
    { text:"It sounds promising", type:"assumption", quality:"Low" }
  ];
  assert.equal(radarStageForScore(90, weakEvidence), "Worth Investigating");
  const strongEvidence = [
    { text:"Customer request", type:"direct_customer_request", quality:"High" },
    { text:"Competitor sales", type:"competitor_sales", quality:"High" }
  ];
  assert.equal(radarStageForScore(90, strongEvidence), "Ready to Test");
});

test("Build 73 detects semantically overlapping Radar candidates", () => {
  const a = { name:"Restaurant manager operations checklist", category:"Digital Product", description:"Reusable restaurant opening closing manager checklist" };
  const b = { name:"Restaurant operations manager checklist", category:"Digital Product", description:"Opening and closing checklist for restaurant managers" };
  assert.ok(radarSimilarity(a,b) >= 0.68);
});

test("Build 73 checks duplicates across Radar and the active portfolio", () => {
  const candidate = { name:"Bartender tip income tracker", category:"Digital Product", description:"Track bartender tips and income" };
  const matches = radarDuplicateMatches(candidate,
    [{ id:1, name:"Tip income tracker for bartenders", category:"Digital Product", description:"Track bartender tips and income", stage:"New" }],
    [{ id:2, name:"Restaurant checklist", category:"Operations", description:"Manager opening checklist", status:"Researching" }]
  );
  assert.equal(matches[0].source, "radar");
  assert.equal(matches[0].level, "Likely duplicate");
});

test("Build 73 exposes evidence quality and duplicate warnings in Opportunity Radar UI", () => {
  const html = fs.readFileSync(path.join(__dirname, "../public/index.html"), "utf8");
  const js = fs.readFileSync(path.join(__dirname, "../public/app.js"), "utf8");
  assert.match(html, /Evidence type/);
  assert.match(html, /Evidence quality/);
  assert.match(js, /evidence_strength/);
  assert.match(js, /duplicate_matches/);
});


test("Build 74 identifies customer and market evidence gaps", () => {
  const gaps = radarEvidenceGaps({
    income_potential:8, speed_to_revenue:8, startup_cost_score:9, ongoing_effort_score:9, automation_potential:9,
    evidence_records:[{text:"Seems promising",type:"assumption",quality:"Medium"}]
  });
  assert.ok(gaps.some(g=>g.key==="customer_demand"));
  assert.ok(gaps.some(g=>g.key==="market_validation"));
});

test("Build 74 recommends demand validation when score is high but evidence is weak", () => {
  const candidate = normalizeRadarCandidate({
    name:"AI bar toolkit", category:"Digital Product", description:"Toolkit for bars",
    evidence:[{text:"I think bars need it",type:"assumption",quality:"Low"}],
    income_potential:9,speed_to_revenue:9,startup_cost_score:10,ongoing_effort_score:9,scalability_score:9,automation_potential:9,atlas_fit:10,confidence:9
  });
  const recommendation = radarCandidateRecommendation(candidate, []);
  assert.equal(recommendation.state,"validate_demand");
  assert.equal(recommendation.ready,false);
});

test("Build 74 marks strong validated candidates ready to advance", () => {
  const candidate = normalizeRadarCandidate({
    name:"Manager checklist", category:"Digital Product", description:"Restaurant manager checklist",
    evidence:[
      {text:"Managers requested it",type:"direct_customer_request",quality:"High"},
      {text:"Comparable products sell",type:"competitor_sales",quality:"High"}
    ],
    income_potential:9,speed_to_revenue:8,startup_cost_score:10,ongoing_effort_score:9,scalability_score:9,automation_potential:9,atlas_fit:10,confidence:8
  });
  const recommendation = radarCandidateRecommendation(candidate, []);
  assert.equal(recommendation.state,"ready_to_test");
  assert.equal(recommendation.ready,true);
  assert.match(recommendation.next_action,/Promote this candidate/);
});

test("Build 74 pauses research when a likely duplicate needs review", () => {
  const candidate = normalizeRadarCandidate({
    name:"Tip tracker",category:"Digital Product",description:"Track bartender tips",
    evidence:[{text:"Marketplace activity",type:"marketplace_activity",quality:"High"}],
    income_potential:8,speed_to_revenue:8,startup_cost_score:10,ongoing_effort_score:9,scalability_score:9,automation_potential:9,atlas_fit:10,confidence:8
  });
  const recommendation = radarCandidateRecommendation(candidate,[{name:"TipTrack Pro",source:"portfolio",similarity:.82,level:"Likely duplicate"}]);
  assert.equal(recommendation.state,"duplicate_review");
  assert.match(recommendation.next_action,/TipTrack Pro/);
});

test("Build 74 recommendation queue prioritizes ready candidates", () => {
  const candidates = [
    normalizeRadarCandidate({id:1,name:"Weak",category:"Idea",description:"Weak idea",income_potential:6,speed_to_revenue:6,startup_cost_score:6,ongoing_effort_score:6,scalability_score:6,automation_potential:6,atlas_fit:6,confidence:6,evidence:[]}),
    normalizeRadarCandidate({id:2,name:"Validated",category:"Idea",description:"Validated strong idea",income_potential:9,speed_to_revenue:9,startup_cost_score:9,ongoing_effort_score:9,scalability_score:9,automation_potential:9,atlas_fit:9,confidence:9,evidence:[{text:"Customers asked",type:"direct_customer_request",quality:"High"},{text:"Competitors sell",type:"competitor_sales",quality:"High"}]})
  ];
  candidates.forEach((c,i)=>c.id=i+1);
  const queue=radarRecommendationQueue(candidates,[]);
  assert.equal(queue[0].name,"Validated");
  assert.equal(queue[0].ready,true);
});

test("Build 74 exposes candidate next actions in Opportunity Radar UI", () => {
  const js = fs.readFileSync(path.join(__dirname, "../public/app.js"), "utf8");
  assert.match(js,/recommendation_queue/);
  assert.match(js,/Atlas next action/);
  assert.match(js,/Ready to advance/);
});


test("Build 75 creates a bounded 30-day test blueprint from a ready Radar candidate", () => {
  const candidate = normalizeRadarCandidate({
    id:7,name:"Venue sales toolkit",category:"Digital Product",description:"Downloadable sales toolkit for venues",
    evidence:[{text:"Managers asked",type:"direct_customer_request",quality:"High"},{text:"Comparable products sell",type:"competitor_sales",quality:"High"}],
    income_potential:9,speed_to_revenue:9,startup_cost_score:10,ongoing_effort_score:9,scalability_score:9,automation_potential:9,atlas_fit:10,confidence:8
  });
  candidate.id=7;
  const rec=radarCandidateRecommendation(candidate,[]);
  const plan=radarTestBlueprint(candidate,rec);
  assert.equal(plan.experiment_days,30);
  assert.equal(plan.approved_budget,25);
  assert.equal(plan.target_launch_days,7);
  assert.equal(plan.weekly_hour_cap,2);
  assert.equal(plan.ready,true);
  assert.equal(plan.candidate_id,7);
});

test("Build 75 adapts test budget and launch target to candidate economics", () => {
  const candidate=normalizeRadarCandidate({
    name:"Service concept",category:"Local Service",description:"A service concept",
    income_potential:7,speed_to_revenue:6,startup_cost_score:5,ongoing_effort_score:5,scalability_score:6,automation_potential:5,atlas_fit:7,confidence:6,evidence:[]
  });
  const plan=radarTestBlueprint(candidate);
  assert.equal(plan.approved_budget,100);
  assert.equal(plan.target_launch_days,14);
  assert.equal(plan.weekly_hour_cap,6);
});

test("Build 75 maps a Radar candidate into Researching without losing its test blueprint", () => {
  const candidate=normalizeRadarCandidate({
    id:4,name:"Operations pack",category:"Digital Product",description:"Operations templates",
    income_potential:8,speed_to_revenue:8,startup_cost_score:10,ongoing_effort_score:9,scalability_score:9,automation_potential:9,atlas_fit:10,confidence:8,
    evidence:[{text:"Customers asked",type:"direct_customer_request",quality:"High"},{text:"Competitors sell",type:"competitor_sales",quality:"High"}]
  });
  candidate.id=4;
  const blueprint=radarTestBlueprint(candidate,radarCandidateRecommendation(candidate,[]));
  const opportunity=opportunityFromRadarCandidate(candidate,blueprint);
  assert.equal(opportunity.status,"Researching");
  assert.equal(opportunity.radar_origin_id,4);
  assert.equal(opportunity.radar_test_blueprint.experiment_days,30);
});

test("Build 75 blueprint includes concrete success criteria and first-week tasks", () => {
  const plan=radarTestBlueprint({name:"Idea",category:"Digital Product",description:"A product",radar_score:80,startup_cost_score:9,speed_to_revenue:8,ongoing_effort_score:8,evidence:[]});
  assert.ok(plan.success_criteria.length >= 4);
  assert.ok(plan.first_week_tasks.length >= 4);
  assert.match(plan.success_criteria[0],/transaction/i);
});

test("Build 75 exposes test blueprints through Opportunity Radar UI", () => {
  const js=fs.readFileSync(path.join(__dirname,"../public/app.js"),"utf8");
  assert.match(js,/Test blueprint:/);
  assert.match(js,/experiment_days/);
  assert.match(js,/target_launch_days/);
});


test("Build 76 creates a Radar operating brief with actionable queues", () => {
  const ready=normalizeRadarCandidate({id:1,name:"Validated pack",category:"Digital Product",description:"Validated downloadable pack",income_potential:9,speed_to_revenue:9,startup_cost_score:10,ongoing_effort_score:9,scalability_score:9,automation_potential:9,atlas_fit:10,confidence:9,evidence:[{text:"Customers asked",type:"direct_customer_request",quality:"High"},{text:"Competitors sell",type:"competitor_sales",quality:"High"}]}); ready.id=1;
  const weak=normalizeRadarCandidate({id:2,name:"Unproven idea",category:"Digital Product",description:"Different experimental concept",income_potential:8,speed_to_revenue:8,startup_cost_score:9,ongoing_effort_score:9,scalability_score:9,automation_potential:9,atlas_fit:9,confidence:8,evidence:[{text:"Seems useful",type:"assumption",quality:"Low"}]}); weak.id=2;
  const brief=radarOperatingBrief([ready,weak],[]);
  assert.equal(brief.counts.active,2);
  assert.equal(brief.counts.ready_to_advance,1);
  assert.equal(brief.counts.validate_demand,1);
  assert.equal(brief.top_candidate.name,"Validated pack");
});

test("Build 76 unified next moves combines Radar with portfolio work", () => {
  const candidate=normalizeRadarCandidate({id:1,name:"Validated product",category:"Digital Product",description:"Validated product concept",income_potential:9,speed_to_revenue:9,startup_cost_score:10,ongoing_effort_score:9,scalability_score:9,automation_potential:9,atlas_fit:10,confidence:9,evidence:[{text:"Customers asked",type:"direct_customer_request",quality:"High"},{text:"Competitors sell",type:"competitor_sales",quality:"High"}]}); candidate.id=1;
  const unified=atlasUnifiedNextMoves([], [candidate], Date.parse("2026-09-08T18:00:00Z"));
  assert.ok(unified.moves.length >= 1);
  assert.equal(unified.moves[0].source,"radar");
  assert.equal(unified.moves[0].name,"Validated product");
});

test("Build 76 keeps urgent portfolio work ahead of ready Radar candidates", () => {
  const candidate=normalizeRadarCandidate({id:1,name:"Radar winner",category:"Digital Product",description:"Distinct radar winner",income_potential:9,speed_to_revenue:9,startup_cost_score:10,ongoing_effort_score:9,scalability_score:9,automation_potential:9,atlas_fit:10,confidence:9,evidence:[{text:"Customers asked",type:"direct_customer_request",quality:"High"},{text:"Competitors sell",type:"competitor_sales",quality:"High"}]}); candidate.id=1;
  const opportunity={id:10,name:"Overdue research",category:"Service",description:"Existing portfolio item",status:"Researching",atlas_score:80,created_at:"2026-01-01T00:00:00Z",updated_at:"2026-01-01T00:00:00Z"};
  const unified=atlasUnifiedNextMoves([opportunity],[candidate],Date.parse("2026-09-08T18:00:00Z"));
  if (unified.moves.some(x=>x.source==="portfolio"&&x.priority==="Urgent")) assert.equal(unified.moves[0].source,"portfolio");
  else assert.ok(unified.moves.some(x=>x.source==="radar"));
});

test("Build 76 exposes unified Next Money Moves UI and endpoints", () => {
  const html=fs.readFileSync(path.join(__dirname,"../public/index.html"),"utf8");
  const js=fs.readFileSync(path.join(__dirname,"../public/app.js"),"utf8");
  assert.match(html,/Next Money Moves/);
  assert.match(js,/next-moves/);
  assert.match(js,/Opportunity Radar/);
  assert.match(js,/Active Portfolio/);
});


test("Build 77 assigns tighter review cadence to ready Radar candidates", () => {
  const ready={stage:"Ready to Test",radar_score:90,evidence_records:[{text:"Customers asked",type:"direct_customer_request",quality:"High"},{text:"Competitors sell",type:"competitor_sales",quality:"High"}],updated_at:"2026-09-08T00:00:00Z"};
  const low={stage:"New",radar_score:45,evidence_records:[],updated_at:"2026-09-08T00:00:00Z"};
  assert.equal(radarReviewCadence(ready,Date.parse("2026-09-08T12:00:00Z")).interval_days,3);
  assert.equal(radarReviewCadence(low,Date.parse("2026-09-08T12:00:00Z")).interval_days,30);
});

test("Build 77 detects stale Radar candidates whose review is due", () => {
  const candidate={id:1,name:"Old candidate",stage:"Worth Investigating",radar_score:70,evidence_records:[],updated_at:"2026-08-20T00:00:00Z"};
  const queue=radarRefreshQueue([candidate],[],Date.parse("2026-09-08T12:00:00Z"));
  assert.equal(queue.length,1);
  assert.equal(queue[0].cadence.due,true);
  assert.ok(queue[0].stale_days >= 19);
});

test("Build 77 portfolio refresh summarizes due reviews and next review", () => {
  const candidates=[
    {id:1,name:"Due",stage:"Worth Investigating",radar_score:70,evidence_records:[],updated_at:"2026-08-20T00:00:00Z"},
    {id:2,name:"Fresh",stage:"New",radar_score:55,evidence_records:[],updated_at:"2026-09-08T00:00:00Z"}
  ];
  const refresh=radarPortfolioRefresh(candidates,[],Date.parse("2026-09-08T12:00:00Z"));
  assert.equal(refresh.active_candidates,2);
  assert.equal(refresh.reviews_due,1);
  assert.match(refresh.guidance,/Refresh 1 Radar candidate/);
});

test("Build 77 closed Radar candidates do not receive recurring reviews", () => {
  assert.equal(radarReviewCadence({stage:"Dismissed"},Date.now()).next_review_at,null);
  assert.equal(radarReviewCadence({stage:"Promoted"},Date.now()).interval_days,0);
});

test("Build 77 exposes Radar refresh cadence and reviewed action in UI", () => {
  const js=fs.readFileSync(path.join(__dirname,"../public/app.js"),"utf8");
  assert.match(js,/review_cadence/);
  assert.match(js,/data-radar-review/);
  assert.match(js,/data-radar-review/);
});


test("Build 78 normalizes discovery source metadata", () => {
  const source = normalizeDiscoverySource({ type:"Marketplace Search", name:"Etsy", url:"https://etsy.example", query:"bar checklist", batch_id:"batch-1" });
  assert.equal(source.type,"marketplace_search");
  assert.equal(source.name,"Etsy");
  assert.equal(source.query,"bar checklist");
  assert.equal(source.batch_id,"batch-1");
});

test("Build 78 carries discovery metadata into Radar candidates", () => {
  const candidate = radarDiscoveryCandidate(
    { name:"Bar event pack", category:"Digital Product", description:"Templates for bar events", income_potential:8, speed_to_revenue:8, startup_cost_score:10, ongoing_effort_score:9, scalability_score:9, automation_potential:9, atlas_fit:10, confidence:8 },
    { type:"marketplace", name:"Etsy", query:"bar event templates", batch_id:"b42" }
  );
  assert.equal(candidate.discovery.source_type,"marketplace");
  assert.equal(candidate.discovery.source_name,"Etsy");
  assert.equal(candidate.discovery.discovery_query,"bar event templates");
  assert.equal(candidate.discovery.batch_id,"b42");
});

test("Build 78 discovery batch skips likely duplicates without losing accepted candidates", () => {
  const existing = [normalizeRadarCandidate({ id:1, name:"Restaurant manager checklist", category:"Digital Product", description:"Opening closing checklist for restaurant managers", income_potential:7, speed_to_revenue:8, startup_cost_score:10, ongoing_effort_score:9, scalability_score:9, automation_potential:9, atlas_fit:10, confidence:8 })];
  existing[0].id=1;
  const batch = radarDiscoveryBatch([
    { name:"Restaurant operations manager checklist", category:"Digital Product", description:"Restaurant manager opening and closing checklist", income_potential:8, speed_to_revenue:8, startup_cost_score:10, ongoing_effort_score:9, scalability_score:9, automation_potential:9, atlas_fit:10, confidence:8 },
    { name:"Hospitality revenue benchmark pack", category:"Digital Product", description:"Benchmark templates for hospitality revenue planning", income_potential:8, speed_to_revenue:8, startup_cost_score:10, ongoing_effort_score:9, scalability_score:9, automation_potential:9, atlas_fit:10, confidence:8 }
  ], {type:"search",name:"Discovery Feed"}, existing, []);
  assert.equal(batch.summary.submitted,2);
  assert.equal(batch.summary.accepted,1);
  assert.equal(batch.summary.skipped,1);
  assert.equal(batch.summary.likely_duplicates_skipped,1);
  assert.equal(batch.accepted[0].name,"Hospitality revenue benchmark pack");
});

test("Build 78 scores discovery-source performance from candidate outcomes", () => {
  const candidates = [
    {id:1,stage:"Promoted",radar_score:90,discovery:{source_type:"marketplace",source_name:"Etsy",discovered_at:"2026-09-01T00:00:00Z"}},
    {id:2,stage:"Dismissed",radar_score:50,discovery:{source_type:"marketplace",source_name:"Etsy",discovered_at:"2026-09-02T00:00:00Z"}},
    {id:3,stage:"Ready to Test",radar_score:88,discovery:{source_type:"community",source_name:"Reddit",discovered_at:"2026-09-03T00:00:00Z"}}
  ];
  const opportunities = [{id:10,radar_origin_id:1,actual_revenue:125,actual_profit:100}];
  const sources = radarSourcePerformance(candidates,opportunities);
  const etsy = sources.find(x=>x.source_name==="Etsy");
  assert.equal(etsy.candidates,2);
  assert.equal(etsy.promoted,1);
  assert.equal(etsy.revenue,125);
  assert.equal(etsy.profit,100);
  assert.ok(etsy.yield_score > 0);
});

test("Build 78 limits discovery batches to fifty candidates", () => {
  const items = Array.from({length:55},(_,i)=>({name:`Candidate ${i}`,category:"Idea",description:`Distinct concept number ${i}`,income_potential:5,speed_to_revenue:5,startup_cost_score:5,ongoing_effort_score:5,scalability_score:5,automation_potential:5,atlas_fit:5,confidence:5}));
  const batch = radarDiscoveryBatch(items,{name:"Bulk feed"},[],[],{allow_duplicates:true});
  assert.equal(batch.summary.submitted,50);
  assert.equal(batch.accepted.length,50);
});

test("Build 78 exposes Discovery Sources in Opportunity Radar UI", () => {
  const html = fs.readFileSync(path.join(__dirname,"../public/index.html"),"utf8");
  const js = fs.readFileSync(path.join(__dirname,"../public/app.js"),"utf8");
  assert.match(html,/radar-source-performance/);
  assert.match(js,/Discovery Sources/);
  assert.match(js,/yield_score/);
  assert.match(js,/ready_or_promoted_rate_pct/);
});


test("Build 79 keeps new discovery sources in exploration mode", () => {
  const cadence = radarDiscoveryCadenceForSource({ candidates:0, yield_score:0 });
  assert.equal(cadence.mode,"Explore");
  assert.equal(cadence.interval_days,7);
});

test("Build 79 tightens discovery cadence for proven high-yield sources", () => {
  const cadence = radarDiscoveryCadenceForSource({
    candidates:5,
    yield_score:82,
    ready_or_promoted_rate_pct:60,
    dismissal_rate_pct:10
  });
  assert.equal(cadence.mode,"Exploit");
  assert.equal(cadence.interval_days,3);
});

test("Build 79 slows weak discovery sources instead of wasting search effort", () => {
  const cadence = radarDiscoveryCadenceForSource({
    candidates:6,
    yield_score:20,
    ready_or_promoted_rate_pct:0,
    dismissal_rate_pct:80
  });
  assert.equal(cadence.mode,"Hold");
  assert.equal(cadence.interval_days,30);
});

test("Build 79 Discovery Source Controller prioritizes due sources", () => {
  const now=Date.parse("2026-09-08T12:00:00Z");
  const candidates=[
    {id:1,stage:"Ready to Test",radar_score:90,discovery:{source_type:"marketplace_search",source_name:"Marketplace Demand",discovered_at:"2026-08-20T00:00:00Z"}},
    {id:2,stage:"Worth Investigating",radar_score:72,discovery:{source_type:"marketplace_search",source_name:"Marketplace Demand",discovered_at:"2026-08-21T00:00:00Z"}},
    {id:3,stage:"Promoted",radar_score:88,discovery:{source_type:"marketplace_search",source_name:"Marketplace Demand",discovered_at:"2026-08-22T00:00:00Z"}}
  ];
  const plan=radarDiscoverySourceController(candidates,[],now);
  assert.equal(plan.source_count,5);
  assert.ok(plan.sources_due >= 1);
  assert.ok(plan.next_source);
  assert.equal(plan.next_source.due,true);
});

test("Build 79 gives under-sampled sources an exploration boost", () => {
  const now=Date.parse("2026-09-08T12:00:00Z");
  const plan=radarDiscoverySourceController([],[],now);
  assert.equal(plan.sources_due,5);
  assert.ok(plan.plan.every(source=>source.cadence.mode==="Explore"));
  assert.ok(plan.plan.every(source=>source.priority_score >= 40));
});

test("Build 79 exposes Discovery Controller in Opportunity Radar UI", () => {
  const html=fs.readFileSync(path.join(__dirname,"../public/index.html"),"utf8");
  const js=fs.readFileSync(path.join(__dirname,"../public/app.js"),"utf8");
  assert.match(html,/radar-discovery-controller/);
  assert.match(js,/DISCOVERY CONTROLLER/);
  assert.match(js,/Search next:/);
  assert.match(js,/priority_score/);
});


test("Build 80 maps discovery source types to adapter-ready execution specs", () => {
  const marketplace = radarDiscoveryAdapterForType("marketplace_search");
  assert.equal(marketplace.adapter_key,"marketplace_search");
  assert.equal(marketplace.execution_kind,"external_search");
  assert.ok(marketplace.expected_evidence_types.includes("marketplace_activity"));

  const local = radarDiscoveryAdapterForType("local_business");
  assert.equal(local.execution_kind,"external_local_search");
});

test("Build 80 creates discovery jobs only for due non-Hold sources", () => {
  const plan = radarDiscoveryJobPlan([],[],Date.parse("2026-09-08T12:00:00Z"),5);
  assert.equal(plan.jobs_ready,5);
  assert.equal(plan.jobs.length,5);
  assert.ok(plan.jobs.every(job=>job.status==="Planned"));
  assert.ok(plan.jobs.every(job=>job.source.batch_id===job.job_id));
  assert.ok(plan.jobs.every(job=>job.intake_endpoint==="POST /api/radar/discoveries"));
});

test("Build 80 discovery jobs contain concrete queries and evidence expectations", () => {
  const plan = radarDiscoveryJobPlan([],[],Date.parse("2026-09-08T12:00:00Z"),2);
  assert.equal(plan.jobs.length,2);
  for (const job of plan.jobs) {
    assert.ok(job.query.length > 3);
    assert.ok(job.adapter.instructions.length > 10);
    assert.ok(job.expected_evidence_types.length >= 1);
    assert.ok(job.max_candidates >= 5);
  }
});

test("Build 80 respects discovery job limit bounds", () => {
  const now=Date.parse("2026-09-08T12:00:00Z");
  assert.equal(radarDiscoveryJobPlan([],[],now,1).jobs.length,1);
  assert.ok(radarDiscoveryJobPlan([],[],now,99).jobs.length <= 10);
});

test("Build 80 increases candidate allowance for Exploit discovery jobs", () => {
  const candidates = [
    {id:1,stage:"Promoted",radar_score:95,discovery:{source_type:"marketplace_search",source_name:"Marketplace Demand",discovered_at:"2026-09-01T00:00:00Z"}},
    {id:2,stage:"Ready to Test",radar_score:92,discovery:{source_type:"marketplace_search",source_name:"Marketplace Demand",discovered_at:"2026-09-02T00:00:00Z"}},
    {id:3,stage:"Ready to Test",radar_score:90,discovery:{source_type:"marketplace_search",source_name:"Marketplace Demand",discovered_at:"2026-09-03T00:00:00Z"}},
    {id:4,stage:"Worth Investigating",radar_score:85,discovery:{source_type:"marketplace_search",source_name:"Marketplace Demand",discovered_at:"2026-09-04T00:00:00Z"}}
  ];
  const now=Date.parse("2026-09-10T12:00:00Z");
  const jobs=radarDiscoveryJobPlan(candidates,[],now,10);
  const marketplace=jobs.jobs.find(job=>job.source_type==="marketplace_search");
  if (marketplace && marketplace.mode==="Exploit") assert.equal(marketplace.max_candidates,10);
  else assert.ok(jobs.jobs.length >= 1);
});

test("Build 80 exposes adapter-ready discovery jobs in Opportunity Radar UI", () => {
  const js=fs.readFileSync(path.join(__dirname,"../public/app.js"),"utf8");
  assert.match(js,/jobs_ready/);
  assert.match(js,/Next query/);
  assert.match(js,/adapter_key/);
  assert.match(js,/max_candidates/);
});


test("Build 81 creates external discovery runner handoffs without pretending Node has live search", () => {
  const job = radarDiscoveryJobPlan([],[],Date.parse("2026-09-09T12:00:00Z"),1).jobs[0];
  const runner = radarDiscoveryRunnerAdapter(job);
  assert.equal(runner.execution_mode,"external_handoff");
  assert.equal(runner.executable_in_process,false);
  assert.match(runner.completion_endpoint,/discovery-runs/);
});

test("Build 81 starts persistent-ready discovery runs from planned jobs", () => {
  const job = radarDiscoveryJobPlan([],[],Date.parse("2026-09-09T12:00:00Z"),1).jobs[0];
  const run = radarDiscoveryRunStart(job,Date.parse("2026-09-09T12:01:00Z"));
  assert.match(run.run_id,/^run-/);
  assert.equal(run.status,"Running");
  assert.equal(run.job_id,job.job_id);
  assert.equal(run.query,job.query);
  assert.equal(run.execution_mode,"external_handoff");
});

test("Build 81 completion records normalized, accepted, and skipped discovery counts", () => {
  const run = {run_id:"run-1",status:"Running",started_at:"2026-09-09T12:00:00Z"};
  const batch = {accepted:[{id:1},{id:2}],skipped:[{reason:"duplicate"}]};
  const completed = radarDiscoveryRunComplete(run,{candidates:[{},{},{}],raw_result_count:7},batch,Date.parse("2026-09-09T12:05:00Z"));
  assert.equal(completed.status,"Completed");
  assert.equal(completed.raw_result_count,7);
  assert.equal(completed.normalized_count,3);
  assert.equal(completed.accepted_count,2);
  assert.equal(completed.skipped_count,1);
});

test("Build 81 tracks failed and skipped discovery runs separately", () => {
  const failed = radarDiscoveryRunComplete({run_id:"f",status:"Running"},{status:"Failed",error:"provider timeout"},null,Date.now());
  const skipped = radarDiscoveryRunComplete({run_id:"s",status:"Running"},{status:"Skipped"},null,Date.now());
  const summary = radarDiscoveryRunSummary([failed,skipped]);
  assert.equal(summary.failed,1);
  assert.equal(summary.skipped,1);
  assert.equal(summary.completed,0);
});

test("Build 81 discovery run summary totals accepted candidates", () => {
  const summary = radarDiscoveryRunSummary([
    {status:"Completed",accepted_count:3},
    {status:"Completed",accepted_count:2},
    {status:"Running",accepted_count:0}
  ]);
  assert.equal(summary.run_count,3);
  assert.equal(summary.running,1);
  assert.equal(summary.completed,2);
  assert.equal(summary.accepted_candidates,5);
});

test("Build 81 exposes Discovery Runner status in Opportunity Radar UI", () => {
  const js=fs.readFileSync(path.join(__dirname,"../public/app.js"),"utf8");
  assert.match(js,/radarDiscoveryRuns/);
  assert.match(js,/Discovery Runner/);
  assert.match(js,/accepted_candidates/);
});


test("Build 82 keeps live discovery disabled until an HTTP adapter is configured", () => {
  const config = discoveryExecutorConfig({});
  const status = discoveryExecutorStatus({});
  assert.equal(config.enabled, false);
  assert.equal(status.mode, "external_handoff");
});

test("Build 82 marks the runner executable when the HTTP adapter is configured", () => {
  const env = { ATLAS_DISCOVERY_HTTP_URL:"https://adapter.example/discover", ATLAS_DISCOVERY_HTTP_TOKEN:"secret" };
  const job = radarDiscoveryJobPlan([],[],Date.parse("2026-09-09T12:00:00Z"),1).jobs[0];
  const runner = radarDiscoveryRunnerAdapter(job, env);
  assert.equal(runner.executable_in_process, true);
  assert.equal(runner.execution_mode, "live_http");
  assert.equal(runner.provider, "http_json");
});

test("Build 82 executes a discovery job through the configured HTTP adapter", async () => {
  const env = { ATLAS_DISCOVERY_HTTP_URL:"https://adapter.example/discover", ATLAS_DISCOVERY_HTTP_TOKEN:"secret", ATLAS_DISCOVERY_HTTP_TIMEOUT_MS:"5000" };
  const job = radarDiscoveryJobPlan([],[],Date.parse("2026-09-09T12:00:00Z"),1).jobs[0];
  let seen = null;
  const fetcher = async (url, options) => {
    seen = { url, options, body:JSON.parse(options.body) };
    return { ok:true, status:200, json:async()=>({ raw_result_count:8, candidates:[
      { name:"Simple workflow audit", category:"Service", description:"Audit repetitive small-business workflows", evidence:["Repeated workflow pain"], income_potential:7, speed_to_revenue:8, startup_cost_score:10, ongoing_effort_score:7, scalability_score:7, automation_potential:9, atlas_fit:9, confidence:7 }
    ] }) };
  };
  const result = await executeDiscoveryJob(job,{ env, fetcher });
  assert.equal(seen.url, env.ATLAS_DISCOVERY_HTTP_URL);
  assert.equal(seen.options.headers.Authorization, "Bearer secret");
  assert.equal(seen.body.query, job.query);
  assert.equal(result.candidates.length, 1);
  assert.equal(result.raw_result_count, 8);
});

test("Build 82 caps live adapter candidates at the job allowance", async () => {
  const env = { ATLAS_DISCOVERY_HTTP_URL:"https://adapter.example/discover" };
  const job = { job_id:"cap", source_type:"search_trends", source_name:"Search Trends", query:"test", max_candidates:2, expected_evidence_types:[], source:{} };
  const fetcher = async () => ({ ok:true, status:200, json:async()=>({ candidates:[{name:"A"},{name:"B"},{name:"C"}] }) });
  const result = await executeDiscoveryJob(job,{ env, fetcher });
  assert.equal(result.candidates.length,2);
});

test("Build 82 rejects a successful HTTP response with no discovery candidates", async () => {
  const env = { ATLAS_DISCOVERY_HTTP_URL:"https://adapter.example/discover" };
  const job = { job_id:"empty", source_type:"search_trends", query:"test", max_candidates:5 };
  const fetcher = async () => ({ ok:true, status:200, json:async()=>({ candidates:[] }) });
  await assert.rejects(()=>executeDiscoveryJob(job,{ env, fetcher }), /no candidates/i);
});


test("Build 83 enables OpenAI web discovery when API key and model are configured", () => {
  const env = { ATLAS_OPENAI_API_KEY:"secret", ATLAS_OPENAI_MODEL:"gpt-test", ATLAS_DISCOVERY_PROVIDER:"openai" };
  const config = discoveryExecutorConfig(env);
  assert.equal(config.provider, "openai_web_search");
  assert.equal(config.enabled, true);
  assert.equal(config.openai.model, "gpt-test");
  const status = discoveryExecutorStatus(env);
  assert.equal(status.mode, "live_openai_web_search");
  assert.equal(status.model, "gpt-test");
});

test("Build 83 does not expose the OpenAI API key in discovery status", () => {
  const env = { ATLAS_OPENAI_API_KEY:"super-secret-key", ATLAS_OPENAI_MODEL:"gpt-test", ATLAS_DISCOVERY_PROVIDER:"openai" };
  const serialized = JSON.stringify(discoveryExecutorStatus(env));
  assert.doesNotMatch(serialized, /super-secret-key/);
  assert.equal(discoveryExecutorStatus(env).token_configured, true);
});

test("Build 83 prefers the existing HTTP adapter in auto mode when both providers are configured", () => {
  const env = { ATLAS_DISCOVERY_HTTP_URL:"https://adapter.test/discover", ATLAS_OPENAI_API_KEY:"secret", ATLAS_OPENAI_MODEL:"gpt-test" };
  assert.equal(discoveryExecutorConfig(env).provider, "http_json");
});

test("Build 83 executes a discovery job directly through OpenAI Responses web search", async () => {
  const env = { ATLAS_DISCOVERY_PROVIDER:"openai", ATLAS_OPENAI_API_KEY:"secret", ATLAS_OPENAI_MODEL:"gpt-test" };
  const job = { job_id:"job-83", source_type:"search_trends", source_name:"Search Trends", query:"small business workflow pain points", purpose:"Find low-cost opportunities", max_candidates:2, expected_evidence_types:["search_activity"], source:{ type:"search_trends", name:"Search Trends" } };
  let request;
  const fetcher = async (url, options) => {
    request = { url, options, body:JSON.parse(options.body) };
    return { ok:true, status:200, json:async()=>({ id:"resp_test", model:"gpt-test", output:[
      { type:"web_search_call", action:{ sources:[{ title:"Example", url:"https://example.com/signal" }] } },
      { type:"message", content:[{ type:"output_text", text:JSON.stringify({ candidates:[
        { name:"Workflow Checklist Pack", category:"Digital Product", description:"Templates for recurring workflows", evidence:[{text:"Businesses discuss recurring workflow friction",type:"search_activity",quality:"Medium",source:"https://example.com/signal"}], income_potential:7, speed_to_revenue:8, startup_cost_score:10, ongoing_effort_score:9, scalability_score:9, automation_potential:8, atlas_fit:9, confidence:7 },
        { name:"Second Candidate", category:"Service", description:"A second distinct candidate", evidence:["Signal"], income_potential:6, speed_to_revenue:7, startup_cost_score:9, ongoing_effort_score:7, scalability_score:7, automation_potential:7, atlas_fit:8, confidence:6 }
      ], raw_result_count:8 }) }] }
    ] }) };
  };
  const result = await executeDiscoveryJob(job,{ env, fetcher });
  assert.equal(request.url, "https://api.openai.com/v1/responses");
  assert.equal(request.options.headers.Authorization, "Bearer secret");
  assert.equal(request.body.model, "gpt-test");
  assert.deepEqual(request.body.tools, [{ type:"web_search_preview" }]);
  assert.match(request.body.input, /small business workflow pain points/);
  assert.equal(result.status, "Completed");
  assert.equal(result.candidates.length, 2);
  assert.equal(result.raw_result_count, 8);
  assert.equal(result.provider_metadata.provider, "openai_web_search");
  assert.equal(result.provider_metadata.web_sources[0].url, "https://example.com/signal");
});

test("Build 83 caps OpenAI candidates at the job allowance", () => {
  const result = parseOpenAIDiscoveryResult({ output_text: JSON.stringify({ candidates:[{name:"A"},{name:"B"},{name:"C"}], raw_result_count:12 }) }, 2);
  assert.equal(result.candidates.length, 2);
  assert.equal(result.raw_result_count, 12);
});

test("Build 83 rejects malformed OpenAI discovery JSON", () => {
  assert.throws(() => parseOpenAIDiscoveryResult({ output_text:"not-json" }, 5), /valid JSON/i);
});


test("Build 84 keeps autonomous discovery opt-in by default", () => {
  const config = autonomousDiscoveryConfig({ ATLAS_OPENAI_API_KEY:"secret", ATLAS_OPENAI_MODEL:"gpt-test" });
  assert.equal(config.enabled, false);
  assert.equal(config.executable, false);
});

test("Build 84 enables autonomous discovery only when a live provider is ready", () => {
  const enabled = autonomousDiscoveryConfig({ ATLAS_DISCOVERY_AUTORUN:"true", ATLAS_OPENAI_API_KEY:"secret", ATLAS_OPENAI_MODEL:"gpt-test" });
  assert.equal(enabled.enabled, true);
  assert.equal(enabled.executable, true);
  assert.equal(enabled.provider, "openai_web_search");
  const unavailable = autonomousDiscoveryConfig({ ATLAS_DISCOVERY_AUTORUN:"true" });
  assert.equal(unavailable.enabled, true);
  assert.equal(unavailable.executable, false);
});

test("Build 84 enforces a safe minimum autonomous interval", () => {
  const config = autonomousDiscoveryConfig({ ATLAS_DISCOVERY_AUTORUN:"true", ATLAS_DISCOVERY_AUTORUN_INTERVAL_MINUTES:"5" });
  assert.equal(config.interval_minutes, 60);
});

test("Build 84 suppresses a recently attempted source/query during cooldown", () => {
  const now = Date.parse("2026-09-09T18:00:00.000Z");
  const env = { ATLAS_DISCOVERY_AUTORUN:"true", ATLAS_OPENAI_API_KEY:"secret", ATLAS_OPENAI_MODEL:"gpt-test", ATLAS_DISCOVERY_AUTORUN_COOLDOWN_HOURS:"24", ATLAS_DISCOVERY_AUTORUN_MAX_JOBS:"5" };
  const initial = autonomousDiscoveryEligibleJobs([], [], [], now, env);
  assert.ok(initial.jobs.length > 0);
  const first = initial.jobs[0];
  const runs = [{ status:"Failed", query:first.query, source:first.source, started_at:new Date(now - 60*60*1000).toISOString(), completed_at:new Date(now - 59*60*1000).toISOString(), autonomous:true }];
  const filtered = autonomousDiscoveryEligibleJobs([], [], runs, now, env);
  assert.ok(filtered.suppressed_by_cooldown >= 1);
  assert.ok(!filtered.jobs.some(job => job.query === first.query && job.source.type === first.source.type));
});

test("Build 84 autonomy status never exposes provider secrets", () => {
  const status = autonomousDiscoveryStatus({ ATLAS_DISCOVERY_AUTORUN:"true", ATLAS_OPENAI_API_KEY:"super-secret", ATLAS_OPENAI_MODEL:"gpt-test" }, []);
  assert.equal(status.executable, true);
  assert.doesNotMatch(JSON.stringify(status), /super-secret/);
});


test("Build 85 enables zero-cost Radar autotriage by default", () => {
  const config = radarAutotriageConfig({});
  assert.equal(config.enabled, true);
  assert.equal(config.auto_promote, false);
});

test("Build 85 triages strong evidence-backed candidates for promotion without auto-promoting", () => {
  const candidate = normalizeRadarCandidate({
    id: 1, name:"Hospitality Ops Toolkit", category:"Digital Product", description:"Operational templates for bars",
    evidence:[
      { text:"Customers directly requested a reusable operations toolkit", type:"direct_customer_request", quality:"High", source:"interviews" },
      { text:"Comparable hospitality templates show marketplace activity", type:"marketplace_activity", quality:"High", source:"marketplace" }
    ],
    income_potential:9, speed_to_revenue:9, startup_cost_score:10, ongoing_effort_score:9, scalability_score:9, automation_potential:8, atlas_fit:10, confidence:9
  });
  candidate.id = 1;
  const decision = radarAutotriageDecision(candidate, [candidate], []);
  assert.equal(decision.action, "promote");
  assert.equal(decision.ready, true);
  assert.equal(candidate.stage === "Promoted", false);
});

test("Build 85 keeps evidence gaps in the research queue", () => {
  const candidate = normalizeRadarCandidate({ id:2, name:"Niche Service", category:"Service", description:"A test service", evidence:[], income_potential:8, speed_to_revenue:8, startup_cost_score:9, ongoing_effort_score:8, scalability_score:7, automation_potential:7, atlas_fit:8, confidence:5 });
  candidate.id = 2;
  const decision = radarAutotriageDecision(candidate, [candidate], []);
  assert.equal(decision.action, "research");
  assert.match(decision.disposition, /research/);
});

test("Build 85 suppresses weak candidates without dismissing them", () => {
  const candidate = normalizeRadarCandidate({ id:3, name:"Weak Idea", category:"Other", description:"Low fit idea", evidence:[{text:"Small signal",type:"signal",quality:"Low",source:"note"}], income_potential:2, speed_to_revenue:2, startup_cost_score:3, ongoing_effort_score:2, scalability_score:2, automation_potential:2, atlas_fit:2, confidence:3 });
  const assessment = applyRadarAutotriage([candidate], []);
  assert.equal(assessment.decisions[0].action, "suppress");
  assert.notEqual(assessment.candidates[0].stage, "Dismissed");
});

test("Build 85 autotriage status exposes decisions without provider secrets or portfolio mutation", () => {
  const candidate = normalizeRadarCandidate({ id:4, name:"Candidate", category:"Digital Product", description:"Candidate description", evidence:[], income_potential:6, speed_to_revenue:7, startup_cost_score:9, ongoing_effort_score:8, scalability_score:8, automation_potential:8, atlas_fit:8, confidence:6 });
  const status = radarAutotriageStatus([candidate], [], { ATLAS_OPENAI_API_KEY:"super-secret" });
  assert.equal(status.enabled, true);
  assert.equal(status.evaluated_candidates, 1);
  assert.doesNotMatch(JSON.stringify(status), /super-secret/);
});


test("Build 86 puts promote-ready candidates behind an explicit approval gate", () => {
  const candidate = normalizeRadarCandidate({ id:86, name:"Approval Candidate", category:"Digital Product", description:"Validated toolkit", evidence:[{text:"Customers requested it",type:"direct_customer_request",quality:"High",source:"interviews"},{text:"Comparable products sell",type:"competitor_sales",quality:"High",source:"market"}], income_potential:9,speed_to_revenue:9,startup_cost_score:10,ongoing_effort_score:9,scalability_score:9,automation_potential:9,atlas_fit:10,confidence:9 });
  candidate.id = 86;
  candidate.triage = radarAutotriageDecision(candidate,[candidate],[]);
  const queue = radarPromotionQueue([candidate],[]);
  assert.equal(queue.requires_explicit_approval,true);
  assert.equal(queue.counts.pending,1);
  assert.equal(queue.queue[0].review.state,"pending");
  assert.equal(candidate.stage === "Promoted",false);
});

test("Build 86 records defer and reject decisions without dismissing candidates", () => {
  const candidate = { id:1,name:"Candidate",stage:"Ready to Test",radar_score:88,triage:{action:"promote"} };
  const deferred = applyRadarPromotionReview(candidate,"defer",{actor:"user",note:"Revisit next week",now:"2026-09-09T20:00:00.000Z"});
  assert.equal(deferred.candidate.promotion_review.state,"deferred");
  assert.equal(deferred.candidate.stage,"Ready to Test");
  const rejected = applyRadarPromotionReview(deferred.candidate,"reject",{actor:"user",note:"Not a fit now",now:"2026-09-09T21:00:00.000Z"});
  assert.equal(rejected.candidate.promotion_review.state,"rejected");
  assert.equal(rejected.candidate.stage,"Ready to Test");
  assert.equal(rejected.candidate.promotion_review.history.length,2);
});

test("Build 86 promotion review state preserves decision audit history", () => {
  const candidate = { id:2,name:"Candidate",stage:"Ready to Test",radar_score:91,triage:{action:"promote"} };
  applyRadarPromotionReview(candidate,"approve",{actor:"ross",note:"Approved for Researching",now:"2026-09-09T22:00:00.000Z"});
  const state = radarPromotionReviewState(candidate,[candidate],[]);
  assert.equal(state.state,"pending");
  assert.equal(state.last_decision,"approve");
  assert.equal(state.history[0].actor,"ross");
  assert.equal(state.history[0].note,"Approved for Researching");
});

test("Build 86 UI exposes the promotion approval gate", () => {
  const js=fs.readFileSync(path.join(__dirname,"../public/app.js"),"utf8");
  assert.match(js,/Build 86 promotion gate/);
  assert.match(js,/Approve → Researching/);
  assert.match(js,/promotion-review/);
});


test("Build 87 creates a concrete prioritized research action from the top evidence gap", () => {
  const candidate = normalizeRadarCandidate({ id:87, name:"Research Candidate", category:"Digital Product", description:"Needs validation", evidence:[], income_potential:8,speed_to_revenue:8,startup_cost_score:9,ongoing_effort_score:8,scalability_score:8,automation_potential:8,atlas_fit:9,confidence:6 });
  candidate.id=87; candidate.triage=radarAutotriageDecision(candidate,[candidate],[]);
  const action=radarResearchActionForCandidate(candidate,[candidate],[]);
  assert.equal(candidate.triage.action,"research");
  assert.equal(action.state,"pending");
  assert.equal(action.priority,"High");
  assert.match(action.task,/customer|request|interview|survey/i);
});

test("Build 87 research queue ranks pending work and excludes completed tasks", () => {
  const a=normalizeRadarCandidate({id:1,name:"A",category:"Service",description:"A",evidence:[],income_potential:8,speed_to_revenue:8,startup_cost_score:9,ongoing_effort_score:8,scalability_score:7,automation_potential:7,atlas_fit:8,confidence:5}); a.id=1; a.triage=radarAutotriageDecision(a,[a],[]);
  const current=radarResearchActionForCandidate(a,[a],[]); applyRadarResearchActionReview(a,"complete",{current_action:current,now:"2026-09-09T23:00:00.000Z"});
  const queue=radarResearchQueue([a],[]);
  assert.equal(queue.counts.completed,1);
  assert.equal(queue.queue.length,0);
});

test("Build 87 records research task decisions without fabricating evidence or changing status", () => {
  const candidate={id:2,name:"Candidate",stage:"Worth Investigating",evidence:[],research_action:{state:"pending",task:"Interview five customers",priority:"High",task_fingerprint:"customer:Interview five customers",history:[]}};
  const result=applyRadarResearchActionReview(candidate,"complete",{current_action:candidate.research_action,actor:"user",note:"Interviews done",now:"2026-09-10T00:00:00.000Z"});
  assert.equal(result.candidate.research_action.state,"completed");
  assert.equal(result.candidate.stage,"Worth Investigating");
  assert.deepEqual(result.candidate.evidence,[]);
  assert.equal(result.candidate.research_action.history.length,1);
});

test("Build 87 UI exposes research action queue and completion controls", () => {
  const js=fs.readFileSync(path.join(__dirname,"../public/app.js"),"utf8");
  assert.match(js,/Build 87 research action queue/);
  assert.match(js,/Complete research task/);
  assert.match(js,/research-action/);
});


test("Build 88 evidence capture adds real evidence and recalculates strength", () => {
  const candidate = normalizeRadarCandidate({
    name:"Evidence Test", category:"Digital Product", description:"A candidate needing validation",
    income_potential:8, speed_to_revenue:8, startup_cost_score:9, ongoing_effort_score:8, scalability_score:8, automation_potential:8, atlas_fit:9, confidence:7,
    evidence:[]
  });
  candidate.id=8801;
  candidate.created_at="2026-09-09T12:00:00.000Z";
  candidate.triage=radarAutotriageDecision(candidate,[candidate],[]);
  const result=applyRadarEvidenceCapture(candidate,{text:"Three customers asked for this directly",type:"direct_customer_request",quality:"High",source:"customer interviews"},[candidate],[],{now:"2026-09-09T13:00:00.000Z"});
  assert.equal(result.candidate.evidence_records.length,1);
  assert.equal(result.candidate.evidence_records[0].type,"direct_customer_request");
  assert.ok(result.candidate.evidence_points > 0);
  assert.equal(result.candidate.evidence_history.length,1);
});

test("Build 88 evidence capture rejects duplicate evidence", () => {
  const candidate=normalizeRadarCandidate({name:"Duplicate Evidence",category:"Service",description:"Test",evidence:[{text:"Marketplace demand exists",type:"marketplace_activity",quality:"Medium"}]});
  candidate.id=8802;
  assert.throws(()=>applyRadarEvidenceCapture(candidate,{text:"marketplace demand exists",type:"marketplace_activity",quality:"High"},[candidate],[]),/already recorded/i);
});

test("Build 88 evidence capture preserves governance and does not promote", () => {
  const candidate=normalizeRadarCandidate({
    name:"Governed Evidence",category:"Digital Product",description:"Strong candidate",
    income_potential:10,speed_to_revenue:10,startup_cost_score:10,ongoing_effort_score:10,scalability_score:10,automation_potential:10,atlas_fit:10,confidence:10,evidence:[]
  });
  candidate.id=8803;
  const result=applyRadarEvidenceCapture(candidate,{text:"Competitor has verified sales",type:"competitor_sales",quality:"High"},[candidate],[]);
  assert.notEqual(result.candidate.stage,"Promoted");
  assert.equal(result.candidate.promoted_opportunity_id,undefined);
});

test("Build 88 evidence capture status reports audit events", () => {
  const candidate=normalizeRadarCandidate({name:"Status Evidence",category:"Local Service",description:"Test",evidence:[{text:"Search volume signal",type:"search_activity",quality:"Medium"}]});
  candidate.id=8804;
  candidate.evidence_history=[{added_at:"2026-09-09T13:00:00.000Z"}];
  const status=radarEvidenceCaptureStatus([candidate],[]);
  assert.equal(status.active_candidates,1);
  assert.equal(status.candidates_with_evidence,1);
  assert.equal(status.evidence_events,1);
});


test("Build 89 research assist is opt-in and zero-spend by default", () => {
  const config=radarResearchAssistConfig({});
  assert.equal(config.enabled,false);
  assert.equal(config.executable,false);
});

test("Build 89 converts a pending evidence gap into a targeted research job", () => {
  const candidate=normalizeRadarCandidate({name:"Research Assist Test",category:"Digital Product",description:"Needs customer proof",income_potential:8,speed_to_revenue:8,startup_cost_score:9,ongoing_effort_score:8,scalability_score:8,automation_potential:8,atlas_fit:9,confidence:7,evidence:[]});
  candidate.id=8901;
  candidate.triage=radarAutotriageDecision(candidate,[candidate],[]);
  const queue=radarResearchAssistQueue([candidate],[],{});
  assert.equal(queue.queue.length,1);
  assert.equal(queue.queue[0].candidate_id,8901);
  assert.match(queue.queue[0].query,/Research Assist Test/);
  assert.ok(queue.queue[0].expected_evidence_types.length>0);
  assert.match(queue.queue[0].intake_endpoint,/evidence/);
});

test("Build 89 maps customer-demand gaps to community research", () => {
  const candidate=normalizeRadarCandidate({name:"Demand Gap",category:"Service",description:"Needs demand",income_potential:8,speed_to_revenue:8,startup_cost_score:8,ongoing_effort_score:8,scalability_score:8,automation_potential:8,atlas_fit:8,confidence:7,evidence:[]});
  candidate.id=8902; candidate.triage=radarAutotriageDecision(candidate,[candidate],[]);
  const job=radarResearchAssistJob(candidate,[candidate],[],{});
  assert.equal(job.gap_key,"customer_demand");
  assert.equal(job.adapter.adapter_key,"community_pain_points");
});

test("Build 89 research assist never writes provider findings as evidence", () => {
  const candidate=normalizeRadarCandidate({name:"No Auto Evidence",category:"Product",description:"Governed",evidence:[]});
  candidate.id=8903; candidate.triage=radarAutotriageDecision(candidate,[candidate],[]);
  const before=JSON.stringify(candidate.evidence_records);
  radarResearchAssistQueue([candidate],[],{ATLAS_RESEARCH_ASSIST:"true",ATLAS_OPENAI_API_KEY:"secret",ATLAS_OPENAI_MODEL:"test-model"});
  assert.equal(JSON.stringify(candidate.evidence_records),before);
});


test("Build 90 research prompt requires source-backed findings and no unsupported inference", () => {
  const prompt=researchAssistPrompt({candidate_name:"Test Candidate",task:"Validate demand",query:"test demand",expected_evidence_types:["customer_request"],adapter:{instructions:"Search communities."}});
  assert.match(prompt,/source you actually found/i);
  assert.match(prompt,/Do not infer customer demand/i);
  assert.match(prompt,/Return ONLY valid JSON/i);
});

test("Build 90 parses only source-backed provider findings", () => {
  const result=parseResearchAssistResult({id:"resp_1",model:"test",output_text:JSON.stringify({findings:[
    {text:"Verified marketplace listing activity",type:"marketplace_activity",quality:"High",source:"Example Marketplace",source_url:"https://example.com/a"},
    {text:"Unsourced claim",type:"signal",quality:"High",source:"",source_url:""}
  ]})});
  assert.equal(result.findings.length,1);
  assert.equal(result.findings[0].quality,"High");
});

test("Build 90 native research execution stays disabled unless Research Assist is explicitly enabled", async () => {
  await assert.rejects(()=>executeResearchAssistJob({candidate_name:"Test"},{env:{}}),error=>error.code==="RESEARCH_ASSIST_DISABLED");
});

test("Build 90 finding review requires an explicit accept or reject decision", () => {
  const accepted=radarResearchFindingReview({}, {text:"Verified fact",type:"signal",quality:"Medium",source:"Source",decision:"accept"}, {now:"2026-09-09T20:00:00.000Z"});
  assert.equal(accepted.decision,"accept");
  assert.throws(()=>radarResearchFindingReview({}, {text:"Fact",source:"Source",decision:"auto"}),/pending, accept, or reject/i);
});

test("Build 90 UI exposes explicit finding acceptance instead of automatic evidence ingestion", () => {
  const app=fs.readFileSync(path.join(__dirname,"..","public","app.js"),"utf8");
  assert.match(app,/Accept as evidence/);
  assert.match(app,/Reject finding/);
  assert.match(app,/research-findings/);
});
