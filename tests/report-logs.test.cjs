const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const { buildReport } = require('../scripts/report-logs.cjs');
const example = require('./scenarios/log-metrics.example.json');
const at = '2026-09-22T07:00:00Z';
const route = (changes = {}) => ({ created_at: at, provider: 'test', model: 'small', cost_usd: null, latency_ms: null, ...changes });

test('report: model totals, decimal strings, missing measurements and event counts', () => {
  const report = buildReport(example).tables;
  assert.equal(report.model_routing_log.total.known_cost_usd, 0.00625);
  assert.equal(report.model_routing_log.total.mean_latency_ms, 200);
  assert.equal(report.model_routing_log.total.p95_latency_ms, 300);
  assert.equal(report.model_routing_log.total.cost_missing, 1);
  assert.equal(report.model_routing_log.total.latency_missing, 1);
  assert.equal(report.model_routing_log.by_model.length, 2);
  assert.equal(report.funnel_events.counts.dm_started, 1);
  assert.equal(report.funnel_events.counts.customer_converted, 0);
  assert.equal(report.audit_log.state, 'no_rows');
  assert.equal(report.escalations.counts.open, 1);
});

test('report: half-open interval uses instants across timezone offsets', () => {
  const report = buildReport(example, { from: '2026-09-22T10:00:00+03:00', to: '2026-09-22T10:05:00+03:00' });
  assert.equal(report.tables.model_routing_log.selected_rows, 1);
  assert.equal(report.tables.model_routing_log.total.known_cost_usd, 0.00125);
  assert.equal(report.tables.funnel_events.counts.lead_qualified, 0);
});

test('report: booking requirement events appear in operational groups without merging handoff events', () => {
  const report = buildReport({ audit_log: [
    { created_at: at, event_type: 'appointment_rejected' },
    { created_at: at, event_type: 'escalated_to_human' },
    { created_at: at, event_type: 'escalation_created' },
  ] });
  assert.equal(report.analytics.operations.appointments.appointment_rejected, 1);
  assert.equal(report.analytics.operations.handoff.escalated_to_human, 1);
  assert.equal(report.analytics.operations.handoff.escalation_created, 1);
  assert.deepEqual(report.analytics.other_audit_events, {});
  assert.equal(buildReport({ funnel_events: [] }).analytics.operations.handoff.escalated_to_human, null);
});

test('report: no supplied table, no selected rows and unmeasured cost remain distinct', () => {
  const report = buildReport({ model_routing_log: [route()], funnel_events: [] }).tables;
  assert.equal(report.audit_log.state, 'not_supplied');
  assert.equal(report.funnel_events.state, 'no_rows');
  assert.equal(report.model_routing_log.state, 'available');
  assert.equal(report.model_routing_log.total.known_cost_usd, null);
  assert.equal(report.model_routing_log.total.p95_latency_ms, null);
  const zero = buildReport({ model_routing_log: [route({ cost_usd: 0, latency_ms: 0 })] });
  assert.equal(zero.tables.model_routing_log.total.known_cost_usd, 0);
  assert.equal(zero.tables.model_routing_log.total.mean_latency_ms, 0);
});

test('report: nearest-rank p95 and provider separation', () => {
  const rows = Array.from({ length: 20 }, (_, i) => route({ latency_ms: 20 - i }));
  rows.push(route({ provider: 'other', cost_usd: '0.1' }));
  const table = buildReport({ model_routing_log: rows }).tables.model_routing_log;
  assert.equal(table.total.p95_latency_ms, 19);
  assert.equal(table.by_model.length, 2);
});

test('report: malformed dates, ranges, metrics, schemas and unexpected fields fail visibly', () => {
  for (const created_at of ['2026-02-31T10:00:00Z', '2026-09-22', '2026-09-22T25:00:00Z', '2026-09-22T10:00:00', null]) {
    assert.throws(() => buildReport({ model_routing_log: [route({ created_at })] }));
  }
  for (const cost_usd of [-1, '', 'abc', true, Infinity, {}, '  '])
    assert.throws(() => buildReport({ model_routing_log: [route({ cost_usd })] }));
  assert.throws(() => buildReport({ model_routing_log: [route({ latency_ms: 1.5 })] }));
  assert.throws(() => buildReport({ model_routing_log: [route({ message_id: 'not-accepted' })] }));
  assert.throws(() => buildReport({ audit_log: [{ created_at: at, event_type: 'x', payload: {} }] }));
  assert.throws(() => buildReport({ funnel_events: [{ created_at: at, event_type: 'unknown' }] }));
  assert.throws(() => buildReport({ escalations: [{ created_at: at, status: 'unknown' }] }));
  for (const input of [null, [], {}, { other: [] }, { funnel_events: {} }]) assert.throws(() => buildReport(input));
  assert.throws(() => buildReport(example, { from: at, to: at }));
  assert.throws(() => buildReport(example, { from: '2026-09-23T00:00:00Z', to: at }));
});

test('report: CLI output is parseable JSON and input remains unchanged', () => {
  const before = JSON.stringify(example);
  buildReport(example);
  assert.equal(JSON.stringify(example), before);
  const result = spawnSync(process.execPath, [path.join(__dirname, '../scripts/report-logs.cjs'), path.join(__dirname, 'scenarios/log-metrics.example.json')], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout).tables.model_routing_log.total.rows, 3);
});

test('report: CLI rejects unsupported or incomplete options and unreadable files', () => {
  const script = path.join(__dirname, '../scripts/report-logs.cjs');
  for (const args of [[], ['missing.json'], ['file.json', '--from'], ['file.json', '--unknown', 'x'], ['file.json', '--to', at, '--to', at]]) {
    const result = spawnSync(process.execPath, [script, ...args], { encoding: 'utf8' });
    assert.equal(result.status, 2);
    assert.ok(result.stderr);
  }
  assert.equal(spawnSync(process.execPath, [script, '--help']).status, 0);
});
