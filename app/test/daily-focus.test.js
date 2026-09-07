const test = require("node:test");
const assert = require("node:assert/strict");
const { buildDailyFocus } = require("../daily-focus");

test("daily focus selects the highest-priority opportunity as primary", () => {
  const plan = buildDailyFocus([
    { id: 1, name: "Lower", status: "Researching", work_priority_score: 61, atlas_score: 80, recommendation: "Validate demand", reasons: [] },
    { id: 2, name: "Top", status: "Testing", work_priority_score: 92, atlas_score: 84, recommendation: "Complete checkpoint", reasons: ["Urgent action is blocking progress."] },
    { id: 3, name: "Second", status: "Active", work_priority_score: 73, atlas_score: 79, recommendation: "Review performance", reasons: [] }
  ], Date.UTC(2026, 8, 7));

  assert.equal(plan.primary_objective.id, 2);
  assert.equal(plan.primary_objective.name, "Top");
  assert.equal(plan.supporting_moves.length, 2);
  assert.equal(plan.urgent_count, 1);
  assert.equal(plan.generated_for, "2026-09-07");
});

test("daily focus excludes killed work and identifies lower-priority work to defer", () => {
  const plan = buildDailyFocus([
    { id: 1, name: "Primary", status: "Testing", work_priority_score: 88, atlas_score: 90, recommendation: "Run test", reasons: [] },
    { id: 2, name: "Support", status: "Active", work_priority_score: 70, atlas_score: 80, recommendation: "Review", reasons: [] },
    { id: 3, name: "Third", status: "Researching", work_priority_score: 65, atlas_score: 75, recommendation: "Research", reasons: [] },
    { id: 4, name: "Parked", status: "Paused", work_priority_score: 58, atlas_score: 72, recommendation: "Wait", reasons: [] },
    { id: 5, name: "Closed", status: "Killed", work_priority_score: 99, atlas_score: 99, recommendation: "Ignore", reasons: [] }
  ]);

  assert.equal(plan.queue_size, 4);
  assert.equal(plan.defer.length, 1);
  assert.equal(plan.defer[0].name, "Parked");
  assert.match(plan.stop_rule, /Do not start lower-ranked Atlas work/);
});

test("daily focus handles an empty portfolio", () => {
  const plan = buildDailyFocus([]);
  assert.equal(plan.primary_objective, null);
  assert.deepEqual(plan.supporting_moves, []);
  assert.match(plan.headline, /No active Atlas opportunities/);
});
