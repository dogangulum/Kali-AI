#!/usr/bin/env node
'use strict';

// Offline metric projections only. No credentials, database or network access.
const fs = require('node:fs');
const TABLES = {
  model_routing_log: ['created_at', 'provider', 'model', 'cost_usd', 'latency_ms'],
  funnel_events: ['created_at', 'event_type'],
  audit_log: ['created_at', 'event_type'],
  escalations: ['created_at', 'status'],
};
const STAGES = ['reel_view', 'dm_started', 'lead_qualified', 'appointment_booked', 'customer_converted'];
const OPERATIONS = {
  qualification: ['lead_scored', 'lead_qualified', 'lead_disqualified'],
  appointments: ['appointment_requested', 'appointment_confirmed', 'appointment_rejected', 'appointment_cancelled', 'appointment_rescheduled', 'appointment_conflict_detected', 'appointment_completed', 'appointment_no_show', 'customer_arrived'],
  handoff: ['escalation_created', 'escalated_to_human', 'escalation_resolved'],
  model: ['model_routed', 'model_call_failed', 'model_call_retried', 'model_call_rejected'],
  cost: ['cost_increase_detected', 'cost_budget_warning', 'cost_budget_exceeded'],
  failures: ['telemetry_write_failed', 'reply_store_failed', 'reply_delivery_failed', 'system_error'],
};

function timestamp(value) {
  if (typeof value !== 'string') throw new Error('Zaman, saat dilimi içeren ISO metni olmalı.');
  const match = value.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,6})?(Z|[+-]\d{2}:\d{2})$/u);
  const ms = Date.parse(value);
  if (!match || !Number.isFinite(ms) || +match[2] > 23 || +match[3] > 59 || +match[4] > 59 ||
      new Date(`${match[1]}T00:00:00Z`).toISOString().slice(0, 10) !== match[1]) {
    throw new Error('Geçersiz ISO zaman; tarih, saat ve saat dilimini kontrol edin.');
  }
  return ms;
}

function metric(value, integer = false) {
  if (value === null || value === undefined) return null;
  if (!(typeof value === 'number' || (typeof value === 'string' && /^\d+(?:\.\d+)?$/u.test(value))))
    throw new Error('Metrik sıfır veya pozitif sayı/null olmalı.');
  const result = Number(value);
  if (!Number.isFinite(result) || result < 0 || (integer && !Number.isSafeInteger(result)))
    throw new Error('Geçersiz metrik değeri.');
  return result;
}

function label(value) {
  if (typeof value !== 'string' || !value.trim() || value.length > 200)
    throw new Error('Grup alanı boş olmayan kısa metin olmalı.');
  return value;
}

function counts(rows, field, initial = []) {
  const result = new Map(initial.map((key) => [key, 0]));
  for (const row of rows) result.set(row[field], (result.get(row[field]) || 0) + 1);
  return Object.fromEntries([...result].sort(([a], [b]) => a.localeCompare(b)));
}

function summarizeRouting(rows) {
  const costs = rows.map((row) => row.cost_usd).filter((value) => value !== null);
  const latency = rows.map((row) => row.latency_ms).filter((value) => value !== null).sort((a, b) => a - b);
  const sum = costs.reduce((total, value) => total + value, 0);
  if (!Number.isFinite(sum)) throw new Error('Maliyet toplamı sayı sınırını aşıyor.');
  return {
    rows: rows.length,
    cost_samples: costs.length,
    cost_missing: rows.length - costs.length,
    known_cost_usd: costs.length ? Number(sum.toFixed(6)) : null,
    latency_samples: latency.length,
    latency_missing: rows.length - latency.length,
    mean_latency_ms: latency.length ? Number((latency.reduce((sum, value) => sum + value, 0) / latency.length).toFixed(2)) : null,
    p95_latency_ms: latency.length ? latency[Math.ceil(latency.length * 0.95) - 1] : null,
  };
}

function reportSettings(options) {
  const timezone = options.timezone ?? 'UTC';
  if (typeof timezone !== 'string' || !timezone.trim()) throw new Error('Geçersiz saat dilimi.');
  let formatter;
  try { formatter = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }); }
  catch { throw new Error('Geçersiz saat dilimi.'); }
  const budget = metric(options.budgetUsd);
  const warningPercent = options.warningPercent === undefined ? 80 : metric(options.warningPercent);
  if (options.budgetUsd !== undefined && (budget === null || budget <= 0)) throw new Error('Bütçe pozitif USD olmalı.');
  if (warningPercent === null || warningPercent <= 0 || warningPercent >= 100) throw new Error('Uyarı yüzdesi 0 ile 100 arasında olmalı.');
  if (options.warningPercent !== undefined && budget === null) throw new Error('Uyarı yüzdesi için bütçe gerekli.');
  return { timezone, formatter, budget, warningPercent };
}

function analyticsSummary(selected, tables, settings) {
  const audit = tables.audit_log.counts;
  const operations = {};
  const knownTypes = new Set(Object.values(OPERATIONS).flat());
  for (const [group, events] of Object.entries(OPERATIONS)) {
    operations[group] = Object.fromEntries(events.map((event) => [event, audit ? (audit[event] || 0) : null]));
  }
  const routing = tables.model_routing_log;
  const total = routing.total;
  const days = new Map();
  for (const row of selected.model_routing_log || []) {
    const parts = Object.fromEntries(settings.formatter.formatToParts(new Date(row.created_at)).map(({ type, value }) => [type, value]));
    const day = `${parts.year}-${parts.month}-${parts.day}`;
    if (!days.has(day)) days.set(day, []);
    days.get(day).push(row);
  }
  const cost = total?.known_cost_usd ?? null;
  let state = 'not_configured';
  if (settings.budget !== null) {
    if (cost === null) state = 'unknown';
    else if (cost > settings.budget) state = 'exceeded';
    else if (cost === settings.budget) state = 'at_limit';
    else if (cost >= settings.budget * settings.warningPercent / 100) state = 'warning';
    else state = 'below_warning_known_only';
  }
  const diagnostics = [];
  if (routing.state === 'not_supplied') diagnostics.push('routing_not_supplied');
  if (routing.state === 'no_rows') diagnostics.push('routing_no_rows');
  if (total?.cost_missing) diagnostics.push('missing_cost_measurements');
  if (total?.latency_missing) diagnostics.push('missing_latency_measurements');
  if (audit?.telemetry_write_failed) diagnostics.push('telemetry_write_failures_recorded');
  if (audit?.model_call_failed) diagnostics.push('failed_calls_may_have_unrecorded_cost');
  if (tables.funnel_events.state !== 'available') diagnostics.push('funnel_coverage_unverified');
  return {
    operations_source: 'audit_log event counts; not unique customers or current appointment inventory',
    audit_state: tables.audit_log.state,
    operations,
    other_audit_events: audit ? Object.fromEntries(Object.entries(audit).filter(([event]) => !knownTypes.has(event))) : null,
    routing_days_timezone: settings.timezone,
    routing_by_day: [...days].sort(([a], [b]) => a.localeCompare(b)).map(([day, rows]) => ({ day, ...summarizeRouting(rows) })),
    model_mix: (routing.by_model || []).map(({ provider, model, rows }) => ({ provider, model, rows, recorded_row_share_percent: Number((rows / total.rows * 100).toFixed(2)) })),
    budget: {
      state,
      limit_usd: settings.budget,
      warning_percent: settings.warningPercent,
      known_cost_usd: cost,
      known_usage_percent: settings.budget !== null && cost !== null ? Number((cost / settings.budget * 100).toFixed(2)) : null,
      missing_cost_rows: total?.cost_missing ?? null,
      scope: 'Selected report interval only; recorded estimates, not a billing limit or available credit.',
      coverage_verified: false,
    },
    diagnostics,
    unavailable_metrics: ['unique_customer_conversion', 'cohort_dropoff', 'active_appointments', 'per_model_error_rate', 'cost_per_unique_lead', 'historical_handoff_sla', 'complete_provider_bill'],
  };
}

function buildReport(input, options = {}) {
  const settings = reportSettings(options);
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Girdi bir JSON nesnesi olmalı.');
  if (Object.keys(input).some((key) => !Object.hasOwn(TABLES, key))) throw new Error('Bilinmeyen tablo anahtarı.');
  if (!Object.keys(input).length) throw new Error('En az bir tablo dizisi gerekli.');
  const from = options.from === undefined ? -Infinity : timestamp(options.from);
  const to = options.to === undefined ? Infinity : timestamp(options.to);
  if (from >= to) throw new Error('Başlangıç, bitişten önce olmalı.');
  const result = {
    scope: 'Yalnız verilen dosyadaki metrik satırları; canlı veri veya eksiksizlik doğrulaması yapılmadı.',
    period: { from_inclusive: options.from ?? null, to_exclusive: options.to ?? null },
    notes: [
      'Sayılar olay/kayıt sayısıdır; benzersiz müşteri veya kohort dönüşüm oranı değildir.',
      'Kimlik alınmadığı için tekrar satırları tekilleştirilmez; dışa aktarımı tekrarsız hazırlayın.',
      'Maliyet kayıtlardaki tahmindir; null maliyet sıfır sayılmaz, fatura tutarı değildir.',
      'Eksik tablo alınmadı, boş dizi ise bu dışa aktarımda kayıt yok anlamındadır.',
      'Escalation statüleri dışa aktarım anındaki durumdur; tarih filtresi oluşturulma zamanına uygulanır.',
    ],
    tables: {},
  };
  const selected = {};
  for (const [table, fields] of Object.entries(TABLES)) {
    if (!Object.hasOwn(input, table)) {
      result.tables[table] = { state: 'not_supplied' };
      continue;
    }
    if (!Array.isArray(input[table])) throw new Error(`${table}: dizi gerekli.`);
    const rows = [];
    for (const raw of input[table]) {
      if (!raw || typeof raw !== 'object' || Array.isArray(raw) || Object.keys(raw).some((key) => !fields.includes(key)))
        throw new Error(`${table}: yalnız belgelenmiş metrik sütunlarını dışa aktarın.`);
      const time = timestamp(raw.created_at);
      const row = { ...raw };
      if (table === 'model_routing_log') {
        row.provider = label(raw.provider);
        row.model = label(raw.model);
        row.cost_usd = metric(raw.cost_usd);
        row.latency_ms = metric(raw.latency_ms, true);
      } else if (table === 'escalations') {
        if (!['open', 'in_progress', 'resolved'].includes(raw.status)) throw new Error('Bilinmeyen escalation status.');
      } else {
        row.event_type = label(raw.event_type);
        if (table === 'funnel_events' && !STAGES.includes(row.event_type)) throw new Error('Bilinmeyen funnel event_type.');
      }
      if (time >= from && time < to) rows.push(row);
    }
    selected[table] = rows;
    const summary = { state: rows.length ? 'available' : 'no_rows', input_rows: input[table].length, selected_rows: rows.length };
    if (table === 'model_routing_log') {
      summary.total = summarizeRouting(rows);
      const groups = new Map();
      for (const row of rows) {
        const key = JSON.stringify([row.provider, row.model]);
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(row);
      }
      summary.by_model = [...groups.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([key, values]) => {
        const [provider, model] = JSON.parse(key);
        return { provider, model, ...summarizeRouting(values) };
      });
    } else {
      summary.counts = counts(rows, table === 'escalations' ? 'status' : 'event_type',
        table === 'funnel_events' ? STAGES : table === 'escalations' ? ['open', 'in_progress', 'resolved'] : []);
    }
    result.tables[table] = summary;
  }
  result.analytics = analyticsSummary(selected, result.tables, settings);
  return result;
}

function buildScenarioReport(suite, overrides = {}) {
  if (suite?.format !== 'analytics-cost-scenarios/v1' || !Array.isArray(suite.cases) || !suite.cases.length)
    throw new Error('Geçerli analiz/maliyet senaryo kataloğu gerekli.');
  const seen = new Set();
  const cases = suite.cases.map((scenario) => {
    for (const field of ['id', 'category', 'story', 'when']) label(scenario[field]);
    if (seen.has(scenario.id)) throw new Error('Tekrarlanan senaryo kimliği.');
    seen.add(scenario.id);
    const base = { id: scenario.id, category: scenario.category, story: scenario.story, when: scenario.when };
    try {
      const report = buildReport(scenario.input, { ...scenario.options, ...overrides });
      return { ...base, state: 'reported', tables: report.tables, analytics: report.analytics };
    } catch (error) {
      return { ...base, state: 'input_error', error: error.message };
    }
  });
  return {
    mode: 'synthetic_scenarios',
    note: 'Independent synthetic cases; never sum these as business traffic. Expected assertions are not used to calculate results. This does not test production event writers.',
    case_count: cases.length,
    categories: counts(cases, 'category'),
    input_error_count: cases.filter((entry) => entry.state === 'input_error').length,
    cases,
  };
}

function main(args) {
  const usage = 'Kullanım: node scripts/report-logs.cjs dosya.json [--scenarios] [--from ISO] [--to ISO] [--timezone IANA] [--budget-usd SAYI] [--warning-percent SAYI]\nJSON raporu stdout üzerine yazılır. Bitiş sınırı hariçtir. Ayrıntı: docs/LOG_REPORT.md';
  if (args.length === 1 && args[0] === '--help') { console.log(usage); return 0; }
  if (!args.length || args[0].startsWith('--')) { console.error(usage); return 2; }
  const options = {};
  let scenarios = false;
  const flags = new Map([['--from', 'from'], ['--to', 'to'], ['--timezone', 'timezone'], ['--budget-usd', 'budgetUsd'], ['--warning-percent', 'warningPercent']]);
  for (let i = 1; i < args.length; i++) {
    if (args[i] === '--scenarios' && !scenarios) { scenarios = true; continue; }
    const key = flags.get(args[i]);
    if (!key || args[i + 1] === undefined || Object.hasOwn(options, key)) { console.error(usage); return 2; }
    options[key] = args[++i];
  }
  let input;
  try { input = JSON.parse(fs.readFileSync(args[0], 'utf8').replace(/^\uFEFF/u, '')); }
  catch { console.error('Metrik dosyası okunamadı veya geçerli JSON değil.'); return 2; }
  try {
    // Reject invalid global settings even when scenario errors are expected.
    reportSettings(options);
    if (options.from !== undefined) timestamp(options.from);
    if (options.to !== undefined) timestamp(options.to);
    if (options.from !== undefined && options.to !== undefined && timestamp(options.from) >= timestamp(options.to)) throw new Error('Başlangıç, bitişten önce olmalı.');
    console.log(JSON.stringify(scenarios ? buildScenarioReport(input, options) : buildReport(input, options), null, 2));
    return 0;
  }
  catch (error) { console.error(`Rapor oluşturulamadı: ${error.message}`); return 2; }
}

if (require.main === module) process.exitCode = main(process.argv.slice(2));
module.exports = { buildReport, buildScenarioReport, main };
