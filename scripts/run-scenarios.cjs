#!/usr/bin/env node
'use strict';
const path = require('node:path');
const fs = require('node:fs');
const { command } = require('./run-local-tests.cjs');
const { buildReport, buildScenarioReport } = require('./report-logs.cjs');
const ROOT = path.resolve(__dirname, '..');

// Explicit ownership: a new catalogue must be connected, never silently ignored.
function inventory(root = ROOT) {
  const scenarioDir = path.join(root, 'tests/scenarios');
  const expected = ['analytics-cost-cases.json', 'booking-cases.json', 'log-metrics.example.json'];
  const actual = fs.readdirSync(scenarioDir).filter((name) => name.endsWith('.json')).sort();
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error('Senaryo dosyası eksik veya bağlanmamış JSON kataloğu var: tests/scenarios.');
  const read = (name) => JSON.parse(fs.readFileSync(path.join(scenarioDir, name), 'utf8'));
  const booking = read('booking-cases.json');
  const analytics = read('analytics-cost-cases.json');
  if (!Array.isArray(booking.cases) || !booking.cases.length || !Array.isArray(analytics.cases) || !analytics.cases.length)
    throw new Error('Senaryo katalogları boş olamaz.');
  const fixtures = fs.readdirSync(path.join(root, 'tests/fixtures')).filter((name) => name.endsWith('.json')).sort();
  if (!fixtures.length) throw new Error('Fixture bulunamadı.');
  return { fixtures: fixtures.length, booking: booking.cases.length, analytics: analytics.cases.length };
}

async function runAll({ runCommand = command, log = console.log, error = console.error } = {}) {
  const totals = inventory();
  log(`TÜM SENARYOLAR — çevrimdışı; ${totals.fixtures} fixture, ${totals.booking} randevu, ${totals.analytics} analiz/maliyet vakası.`);
  const stages = [
    ['Webhook fixture yürütmesi ve randevu bağlamları', ['scripts/dry-run.cjs']],
    ['Sohbet simülatörünün tüm hazır konuşmaları', ['scripts/chat-simulator.cjs', '--quick-all']],
    ['Fixture, randevu kataloğu ve rapor beklentileri', ['--test', 'tests/fixtures.test.cjs', 'tests/booking-scenarios.test.cjs', 'tests/analytics-cost-scenarios.test.cjs', 'tests/report-logs.test.cjs']],
  ];
  let failed = 0;
  for (const [title, args] of stages) {
    log(`\n=== ${title} ===`);
    try {
      const output = await runCommand(process.execPath, args, 120000);
      log(output.trim());
      log(`GEÇTİ: ${title}`);
    } catch (failure) {
      failed++;
      error(`BAŞARISIZ: ${title}\n${failure.message}`);
    }
  }
  try {
    const example = buildReport(JSON.parse(fs.readFileSync(path.join(ROOT, 'tests/scenarios/log-metrics.example.json'), 'utf8')));
    const scenarios = buildScenarioReport(JSON.parse(fs.readFileSync(path.join(ROOT, 'tests/scenarios/analytics-cost-cases.json'), 'utf8')));
    log(`\nÖrnek log raporu: ${JSON.stringify(example.tables.model_routing_log.total)}`);
    log(`Analiz kataloğu: ${scenarios.case_count} vaka; ${scenarios.input_error_count} bozuk girdi sonucu (beklenti kontrolü test aşamasındadır).`);
    log(`Kategoriler: ${JSON.stringify(scenarios.categories)}`);
  } catch (failure) {
    failed++;
    error(`BAŞARISIZ: rapor örnekleri\n${failure.message}`);
  }
  log(`\nSONUÇ: ${failed === 0 ? 'GEÇTİ' : 'BAŞARISIZ'} — ${failed} başarısız aşama.`);
  log('Kapsam: sahte AI ile webhook/taslak akışı, katalog tutarlılığı ve rapor hesapları.');
  log('Randevu ön koşulları gösterilir; henüz olmayan booking motoru veya gerçek AI cevap kalitesi geçti sayılmaz.');
  return failed === 0 ? 0 : 1;
}

if (require.main === module) {
  if (process.argv.length > 2) { console.error('Kullanım: node scripts/run-scenarios.cjs'); process.exitCode = 2; }
  else runAll().then((code) => { process.exitCode = code; }).catch((error) => { console.error(error.message); process.exitCode = 1; });
}
module.exports = { runAll, inventory };
