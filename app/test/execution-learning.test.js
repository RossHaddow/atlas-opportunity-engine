const test = require('node:test');
const assert = require('node:assert/strict');
const { executionPattern, buildExecutionLearning, buildDailyFocus } = require('../daily-focus');

const entry = (status, date) => ({ status, date, updated_at: `${date}T12:00:00Z` });
const opportunity = (id, history) => ({ id, name: `Opportunity ${id}`, status: 'Testing', work_priority_score: 80, atlas_score: 80, recommendation: 'Work it', daily_focus_history: history });

test('execution pattern detects recurring blockers', () => {
  const pattern = executionPattern(opportunity(1, [entry('Blocked','2026-09-01'), entry('Blocked','2026-09-02'), entry('Blocked','2026-09-03')]));
  assert.equal(pattern.blocked, 3);
  assert.equal(pattern.signal, 'Recurring blocker');
});

test('execution pattern detects repeated deferrals', () => {
  const pattern = executionPattern(opportunity(1, [entry('Deferred','2026-09-01'), entry('Deferred','2026-09-02'), entry('Deferred','2026-09-03')]));
  assert.equal(pattern.deferred, 3);
  assert.equal(pattern.signal, 'Repeatedly deferred');
});

test('learning summary calculates completion rate and recommends blocker resolution', () => {
  const learning = buildExecutionLearning([
    opportunity(1, [entry('Blocked','2026-09-01'), entry('Blocked','2026-09-02'), entry('Blocked','2026-09-03')]),
    opportunity(2, [entry('Completed','2026-09-01'), entry('Completed','2026-09-02'), entry('Completed','2026-09-03')])
  ]);
  assert.equal(learning.completion_rate, 50);
  assert.equal(learning.recurring_blockers[0].id, 1);
  assert.match(learning.recommendation, /Resolve the recurring blocker/);
});

test('daily focus exposes execution learning and per-move patterns', () => {
  const plan = buildDailyFocus([opportunity(1, [entry('Deferred','2026-09-01'), entry('Deferred','2026-09-02'), entry('Deferred','2026-09-03')])], Date.parse('2026-09-07T15:00:00Z'));
  assert.equal(plan.primary_objective.execution_pattern.signal, 'Repeatedly deferred');
  assert.equal(plan.execution_learning.repeated_deferrals[0].id, 1);
});
