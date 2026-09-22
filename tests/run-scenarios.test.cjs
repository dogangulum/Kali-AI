const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { runAll, inventory } = require('../scripts/run-scenarios.cjs');
const { runCheckScript } = require('./helpers/run-check-script.cjs');

test('all scenarios: inventory and ordered stages include fixtures, conversations, catalogues and reports', async () => {
  const seen = [], output = [];
  const info = inventory();
  assert.equal(info.booking, 58);
  assert.equal(info.analytics, 92);
  assert.ok(info.fixtures >= 67);
  const code = await runAll({ runCommand: async (program, args) => { seen.push(args); return 'stage complete'; }, log: (line) => output.push(line), error: assert.fail });
  assert.equal(code, 0);
  assert.deepEqual(seen[0], ['scripts/dry-run.cjs']);
  assert.deepEqual(seen[1], ['scripts/chat-simulator.cjs', '--quick-all']);
  assert.ok(seen[2].includes('tests/booking-scenarios.test.cjs'));
  assert.ok(seen[2].includes('tests/analytics-cost-scenarios.test.cjs'));
  assert.ok(seen[2].includes('tests/report-logs.test.cjs'));
  assert.match(output.join('\n'), /Örnek log raporu:/u);
  assert.match(output.join('\n'), /SONUÇ: GEÇTİ/u);
});

test('all scenarios: a failed stage returns failure, later suites and summaries still run', async () => {
  let calls = 0;
  const errors = [], output = [];
  const code = await runAll({ runCommand: async () => { calls++; if (calls === 1) throw new Error('synthetic fixture failure'); return 'ok'; }, log: (line) => output.push(line), error: (line) => errors.push(line) });
  assert.equal(code, 1);
  assert.equal(calls, 3);
  assert.match(errors.join('\n'), /synthetic fixture failure/u);
  assert.match(output.join('\n'), /SONUÇ: BAŞARISIZ/u);
});

test('dry-run --all delegates once and preserves failure code without scanning fixtures', async () => {
  let calls = 0;
  const result = await runCheckScript('dry-run.cjs', { args: ['--all'], modules: {
    '../tests/helpers/webhook-suite.cjs': {},
    './run-scenarios.cjs': { runAll: async () => { calls++; return 1; } },
  } });
  assert.equal(calls, 1);
  assert.equal(result.exitCode, 1);
});

test('dry-run single fixture rejects traversal and unsupported flags', async () => {
  for (const args of [['--fixture', '../outside.json'], ['--unknown']]) {
    const result = await runCheckScript('dry-run.cjs', { args, modules: { '../tests/helpers/webhook-suite.cjs': {} } });
    assert.equal(result.exitCode, 2);
  }
});

test('chat fixture menu handles Instagram and WhatsApp receipts with sequential piped input', () => {
  const { readdirSync } = require('node:fs');
  const fixtures = readdirSync(path.join(__dirname, 'fixtures')).filter((file) => file.endsWith('.json')).sort();
  const instagram = fixtures.indexOf('instagram-text-message.json') + 1;
  const receipt = fixtures.indexOf('whatsapp-read-receipt.json') + 1;
  const result = spawnSync(process.execPath, [path.join(__dirname, '../scripts/chat-simulator.cjs')], {
    input: `f\n${instagram}\nf\n${receipt}\nq\n`, encoding: 'utf8', timeout: 30000,
  });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /instagram-text-message.json \(instagram\)/u);
  assert.match(result.stdout, /whatsapp-read-receipt.json \(whatsapp\)/u);
  assert.match(result.stdout, /HTTP 200/u);
  assert.match(result.stdout, /Kaydedilen mesaj yok/u);
});

test('chat --all executes connected catalogues and exits without waiting for stdin', () => {
  const result = spawnSync(process.execPath, [path.join(__dirname, '../scripts/chat-simulator.cjs'), '--all'], { encoding: 'utf8', timeout: 120000, maxBuffer: 2 * 1024 * 1024 });
  assert.equal(result.status, 0, result.stderr + result.stdout.slice(-2000));
  assert.match(result.stdout, /58 randevu, 92 analiz\/maliyet/u);
  assert.match(result.stdout, /Hazır sohbetler: 6, başarısız: 0/u);
  assert.match(result.stdout, /SONUÇ: GEÇTİ/u);
  assert.match(result.stdout, /Örnek log raporu/u);
});
