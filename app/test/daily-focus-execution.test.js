const test = require('node:test');
const assert = require('node:assert/strict');
const { buildDailyFocus } = require('../daily-focus');

const NOW = Date.parse('2026-09-07T15:00:00Z');
const base = (id, score, extra = {}) => ({
  id,
  name: `Opportunity ${id}`,
  status: 'Testing',
  work_priority_score: score,
  atlas_score: score,
  recommendation: `Work ${id}`,
  ...extra
});

test('completed work drops out of the active daily plan', () => {
  const plan = buildDailyFocus([
    base(1, 95, { daily_focus_state: { date: '2026-09-07', status: 'Completed', updated_at: '2026-09-07T14:00:00Z' } }),
    base(2, 85),
    base(3, 75)
  ], NOW);
  assert.equal(plan.primary_objective.id, 2);
  assert.deepEqual(plan.completed_today.map(item => item.id), [1]);
  assert.equal(plan.queue_size, 2);
});

test('deferred work drops out for today but is recorded in deferred history', () => {
  const plan = buildDailyFocus([
    base(1, 90, { daily_focus_state: { date: '2026-09-07', status: 'Deferred', note: 'Waiting', updated_at: '2026-09-07T14:00:00Z' } }),
    base(2, 80)
  ], NOW);
  assert.equal(plan.primary_objective.id, 2);
  assert.equal(plan.deferred_today[0].id, 1);
});

test('blocked work stays in the active plan and carries its note', () => {
  const plan = buildDailyFocus([
    base(1, 90, { daily_focus_state: { date: '2026-09-07', status: 'Blocked', note: 'Need credentials', updated_at: '2026-09-07T14:00:00Z' } }),
    base(2, 80)
  ], NOW);
  assert.equal(plan.primary_objective.id, 1);
  assert.equal(plan.primary_objective.execution_status, 'Blocked');
  assert.equal(plan.primary_objective.execution_note, 'Need credentials');
});

test('yesterday execution state does not alter today plan', () => {
  const plan = buildDailyFocus([
    base(1, 90, { daily_focus_state: { date: '2026-09-06', status: 'Completed', updated_at: '2026-09-06T14:00:00Z' } }),
    base(2, 80)
  ], NOW);
  assert.equal(plan.primary_objective.id, 1);
  assert.equal(plan.completed_today.length, 0);
});
