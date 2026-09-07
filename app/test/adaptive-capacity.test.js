const test = require('node:test');
const assert = require('node:assert/strict');
const { adaptiveCapacity, buildDailyFocus } = require('../daily-focus');

const event = status => ({ status, date: '2026-09-01', updated_at: '2026-09-01T12:00:00Z' });
const item = (id, history = []) => ({ id, name: `Opportunity ${id}`, status: 'Testing', work_priority_score: 100 - id, atlas_score: 80, recommendation: 'Work it', daily_focus_history: history });

test('capacity stays at three while Atlas is still learning', () => {
  const capacity = adaptiveCapacity([item(1, [event('Completed'), event('Deferred')])]);
  assert.equal(capacity.capacity, 3);
  assert.equal(capacity.confidence, 'learning');
});

test('strong completion history supports three moves', () => {
  const capacity = adaptiveCapacity([item(1, [event('Completed'), event('Completed'), event('Completed'), event('Completed'), event('Completed'), event('Deferred')])]);
  assert.equal(capacity.capacity, 3);
});

test('mixed execution history reduces capacity to two moves', () => {
  const capacity = adaptiveCapacity([item(1, [event('Completed'), event('Completed'), event('Completed'), event('Deferred'), event('Deferred')])]);
  assert.equal(capacity.capacity, 2);
});

test('high friction reduces capacity to one move', () => {
  const capacity = adaptiveCapacity([item(1, [event('Completed'), event('Blocked'), event('Blocked'), event('Deferred'), event('Deferred')])]);
  assert.equal(capacity.capacity, 1);
});

test('daily focus only admits moves up to adaptive capacity', () => {
  const history = [event('Completed'), event('Completed'), event('Completed'), event('Deferred'), event('Deferred')];
  const plan = buildDailyFocus([item(1, history), item(2), item(3), item(4)], Date.parse('2026-09-07T15:00:00Z'));
  assert.equal(plan.daily_capacity, 2);
  assert.equal(plan.supporting_moves.length, 1);
  assert.equal(plan.defer[0].id, 3);
  assert.match(plan.capacity_rule, /2 meaningful moves/);
});
