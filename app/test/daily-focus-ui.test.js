const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'public', 'index.html'), 'utf8');
const js = fs.readFileSync(path.join(root, 'public', 'daily-focus.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'public', 'daily-focus.css'), 'utf8');

test('dashboard includes the Daily Focus panel and assets', () => {
  assert.match(html, /id="daily-focus"/);
  assert.match(html, /id="dailyFocusPrimary"/);
  assert.match(html, /id="dailyFocusSupporting"/);
  assert.match(html, /id="dailyFocusDefer"/);
  assert.match(html, /\/daily-focus\.css/);
  assert.match(html, /\/daily-focus\.js/);
});

test('Daily Focus client loads the endpoint and renders core plan sections', () => {
  assert.match(js, /fetch\("\/api\/daily-focus"\)/);
  assert.match(js, /primary_objective/);
  assert.match(js, /supporting_moves/);
  assert.match(js, /data\.defer/);
  assert.match(js, /capacity_rule/);
  assert.match(js, /stop_rule/);
});

test('Daily Focus client can persist Completed, Blocked, and Deferred execution states', () => {
  assert.match(js, /data-focus-status="Completed"/);
  assert.match(js, /data-focus-status="Blocked"/);
  assert.match(js, /data-focus-status="Deferred"/);
  assert.match(js, /method: "PATCH"/);
  assert.match(js, /\/api\/daily-focus\/\$\{id\}/);
  assert.match(js, /completed_today/);
  assert.match(js, /deferred_today/);
});

test('Daily Focus has responsive styling and execution controls', () => {
  assert.match(css, /daily-focus-grid/);
  assert.match(css, /daily-focus-controls/);
  assert.match(css, /is-blocked/);
  assert.match(css, /@media\(max-width:900px\)/);
});
