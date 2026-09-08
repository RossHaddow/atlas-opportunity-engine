const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pausedFields, withReviewState, normalizeExperiment, normalizeCheckpoints, rollupCheckpointMetrics, decisionState, experimentState, nextActionState, experimentHealth, interventionPlan, portfolioSummary, VALID_STATUSES, emptyIntervention, normalizeInterventions, interventionEvaluation, commandCenter, normalizeFocusState, focusExecutionSummary, focusScorecard, focusFeedbackForOpportunity, focusFrictionDiagnosis, focusFrictionSummary, normalizeDeferReason, FOCUS_DEFER_REASONS, adaptiveNextAction, adaptiveActionLearning, adaptiveActionPolicy, adaptiveStrategyEvidence, adaptivePolicyForMode, lastAdaptiveStrategySnapshot, adaptiveStrategyGuardrail, adaptiveStrategyForOpportunity, adaptiveStrategyContext, opportunityIntelligence, intelligenceQueue, authConfig, isAuthorized, requireValidAuthConfig } = require("../server");

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
