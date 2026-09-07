const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pausedFields, withReviewState, normalizeExperiment, normalizeCheckpoints, rollupCheckpointMetrics, decisionState, experimentState, nextActionState, experimentHealth, interventionPlan, portfolioSummary, VALID_STATUSES, emptyIntervention, normalizeInterventions, interventionEvaluation, commandCenter, opportunityIntelligence, intelligenceQueue, authConfig, isAuthorized, requireValidAuthConfig } = require("../server");

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
