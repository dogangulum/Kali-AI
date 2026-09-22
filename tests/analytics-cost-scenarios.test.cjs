const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const { buildReport, buildScenarioReport } = require('../scripts/report-logs.cjs');
const suite = require('./scenarios/analytics-cost-cases.json');

const valueAt = (object, key) => key.split('.').reduce((value, part) => value?.[part], object);

for (const scenario of suite.cases) {
  test(`analytics ${scenario.id}: ${scenario.story}`, () => {
    assert.ok(scenario.when.trim());
    if (scenario.expected_error) {
      assert.throws(() => buildReport(scenario.input, scenario.options), (error) => error.message.includes(scenario.expected_error));
      return;
    }
    const report = buildReport(scenario.input, scenario.options);
    assert.ok(Object.keys(scenario.expected).length);
    for (const [key, expected] of Object.entries(scenario.expected)) {
      assert.deepEqual(valueAt(report, key), expected, key);
    }
    for (const forbidden of scenario.must_not_record) {
      const [prefix, eventType] = forbidden.split(':');
      const table = prefix === 'f' ? 'funnel_events' : 'audit_log';
      assert.ok(!scenario.input[table]?.some((row) => row.event_type === eventType), forbidden);
    }
    assert.equal(report.analytics.budget.coverage_verified, false);
    assert.ok(report.analytics.unavailable_metrics.includes('cohort_dropoff'));
    assert.equal(report.analytics.conversion_rate, undefined);
  });
}

test('scenario catalogue: independent reports, unique ids, invalid inputs retained, expectations never drive calculation', () => {
  const before = JSON.stringify(suite);
  const summary = buildScenarioReport(suite);
  assert.equal(JSON.stringify(suite), before);
  assert.equal(summary.case_count, 92);
  assert.equal(summary.input_error_count, 10);
  assert.equal(new Set(summary.cases.map((entry) => entry.id)).size, summary.case_count);
  assert.equal(summary.total_cost_usd, undefined, 'Synthetic cases must not be combined into a business total');
  const changed = structuredClone(suite);
  changed.cases[0].expected = { 'tables.funnel_events.counts.dm_started': 999 };
  assert.deepEqual(buildScenarioReport(changed), summary);
  assert.throws(() => buildScenarioReport({ ...suite, cases: [suite.cases[0], suite.cases[0]] }), /Tekrarlanan/u);
  assert.throws(() => buildScenarioReport({ cases: [] }), /kataloğu/u);
});

test('report: each operational category is explicitly mapped and same audit/funnel transition is not summed', () => {
  const report = buildReport({
    audit_log: [
      { created_at: '2026-09-22T07:00:00Z', event_type: 'appointment_confirmed' },
      { created_at: '2026-09-22T07:00:00Z', event_type: 'appointment_cancelled' },
      { created_at: '2026-09-22T07:00:00Z', event_type: '__proto__' },
    ],
    funnel_events: [{ created_at: '2026-09-22T07:00:00Z', event_type: 'appointment_booked' }],
  });
  assert.equal(report.tables.funnel_events.counts.appointment_booked, 1);
  assert.equal(report.analytics.operations.appointments.appointment_confirmed, 1);
  assert.equal(report.analytics.operations.appointments.appointment_cancelled, 1);
  assert.equal(report.analytics.other_audit_events.__proto__, 1);
  assert.equal(report.analytics.active_appointments, undefined);
});

test('report: filtering precedes daily buckets and budget calculations on the same interval', () => {
  const input = { model_routing_log: [
    { created_at: '2026-09-22T07:00:00Z', provider: 'test', model: 'm', cost_usd: 2, latency_ms: 100 },
    { created_at: '2026-09-23T07:00:00Z', provider: 'test', model: 'm', cost_usd: 0.1, latency_ms: 100 },
  ] };
  const report = buildReport(input, { from: '2026-09-23T00:00:00Z', to: '2026-09-24T00:00:00Z', budgetUsd: 1 });
  assert.equal(report.analytics.budget.state, 'below_warning_known_only');
  assert.equal(report.analytics.budget.known_cost_usd, 0.1);
  assert.equal(report.analytics.routing_by_day.length, 1);
  assert.equal(report.analytics.routing_by_day[0].day, '2026-09-23');
});

test('report: model mix uses all recorded rows, even rows missing cost', () => {
  const row = { created_at: '2026-09-22T07:00:00Z', provider: 'test', latency_ms: null, cost_usd: null };
  const report = buildReport({ model_routing_log: [{ ...row, model: 'a' }, { ...row, model: 'a' }, { ...row, model: 'b' }] });
  assert.deepEqual(report.analytics.model_mix.map((entry) => entry.recorded_row_share_percent), [66.67, 33.33]);
  assert.equal(report.tables.model_routing_log.total.known_cost_usd, null);
});

test('report: extreme sums and invalid settings fail instead of yielding misleading null percentages', () => {
  const row = { created_at: '2026-09-22T07:00:00Z', provider: 'test', model: 'm', cost_usd: Number.MAX_VALUE, latency_ms: 100 };
  assert.throws(() => buildReport({ model_routing_log: [row, row] }), /sayı sınırını/u);
  for (const options of [{budgetUsd:null},{budgetUsd:-1},{budgetUsd:'NaN'},{budgetUsd:1,warningPercent:0},{budgetUsd:1,warningPercent:null},{timezone:''}]) {
    assert.throws(() => buildReport({ audit_log: [] }, options));
  }
});

test('report CLI: reads scenario JSON with scenario options and preserves invalid-input examples', () => {
  const file = path.join(__dirname, 'scenarios/analytics-cost-cases.json');
  const script = path.join(__dirname, '../scripts/report-logs.cjs');
  const result = spawnSync(process.execPath, [script, file, '--scenarios'], { encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 });
  assert.equal(result.status, 0, result.stderr);
  const parsed = JSON.parse(result.stdout);
  assert.equal(parsed.mode, 'synthetic_scenarios');
  assert.equal(parsed.case_count, 92);
  assert.equal(parsed.input_error_count, 10);
  for (const args of [['--scenarios','--scenarios'],['--scenarios','--timezone','Invalid/Zone'],['--budget-usd','0'],['--scenarios','--from','2026-09-23T00:00:00Z','--to','2026-09-22T00:00:00Z']]) {
    assert.equal(spawnSync(process.execPath,[script,file,...args],{encoding:'utf8'}).status,2);
  }
});

test('report CLI: budget flags work for existing metric exports without changing input bytes', () => {
  const file = path.join(__dirname, 'scenarios/log-metrics.example.json');
  const before = readFileSync(file, 'utf8');
  const result = spawnSync(process.execPath, [path.join(__dirname,'../scripts/report-logs.cjs'),file,'--budget-usd','0.005','--warning-percent','70','--timezone','Europe/Istanbul'], {encoding:'utf8'});
  assert.equal(result.status,0,result.stderr);
  const report = JSON.parse(result.stdout);
  assert.equal(report.analytics.budget.state,'exceeded');
  assert.equal(report.analytics.budget.missing_cost_rows,1);
  assert.equal(report.analytics.routing_days_timezone,'Europe/Istanbul');
  assert.equal(readFileSync(file,'utf8'),before);
});
