const { test } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { runCheckScript } = require('./helpers/run-check-script.cjs');
const fixture = 'tests/fixtures/cli-example.json';
const body = '{"text":"Örnek mesaj 🌿"}\n';
const run = (options = {}) => runCheckScript('simulate-webhook.cjs', {
  modules: { crypto }, args: [fixture], files: { [fixture]: body },
  fetch: async () => ({ status: 200, text: async () => '{"received":true}' }), ...options,
});

for (const [args, code] of [[[], 1], [['--help'], 0], [['-h'], 0], [['--bad-signature'], 1]]) {
  test(`simulator CLI: ${JSON.stringify(args)} returns ${code} without HTTP`, async () => {
    const result = await run({ args });
    assert.equal(result.exitCode, code);
    assert.match(result.stdout, /Kullanım/);
    assert.equal(result.requests.length, 0);
  });
}

test('simulator CLI: missing file fails without HTTP', async () => {
  const result = await run({ files: {} });
  assert.equal(result.exitCode, 1);
  assert.match(result.stderr, /dosya bulunamadı/);
  assert.equal(result.requests.length, 0);
});

test('simulator CLI: forwards fixture bytes and displays the response', async () => {
  const result = await run();
  assert.equal(result.exitCode, 0);
  assert.equal(result.requests.length, 1);
  assert.equal(result.requests[0].url.href, 'http://localhost:8000/');
  assert.equal(result.requests[0].options.method, 'POST');
  assert.equal(result.requests[0].options.body, body);
  assert.match(result.stdout, /HTTP 200\n\{"received":true\}/);
});

test('simulator CLI: connection errors return exit 1', async () => {
  const result = await run({ fetch: async () => { throw new Error('test connection refused'); } });
  assert.equal(result.exitCode, 1);
  assert.match(result.stderr, /Bağlantı hatası: test connection refused/);
});

test('simulator CLI: HTTP 500 is display-only and currently exits 0', async () => {
  const result = await run({ fetch: async () => ({ status: 500, text: async () => 'failed' }) });
  assert.match(result.stdout, /HTTP 500\nfailed/);
  assert.equal(result.exitCode, 0); // Documented limitation: the runner checks HTTP separately.
});
