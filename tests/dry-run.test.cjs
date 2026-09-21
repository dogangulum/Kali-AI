const { test } = require('node:test');
const assert = require('node:assert/strict');
const { runCheckScript } = require('./helpers/run-check-script.cjs');

function run(files, { status = 200, fail = false, empty = false } = {}) {
  let mock;
  const seen = [];
  const harness = {
    DEFAULT_BUSINESS_CONFIG: {},
    createMockSupabase() {
      mock = { module: {}, messages: [], modelRoutingLogs: [] };
      return mock;
    },
    postRequest: (body) => body,
    loadHandler(channel) {
      seen.push(channel);
      return { handler: async (body) => {
        JSON.parse(body);
        if (fail) throw new Error('simulated handler failure');
        if (!empty) {
          mock.messages.push({ id: 'm1', direction: 'inbound', content: 'Örnek', conversation_id: 'c1' },
            { id: 'm2', direction: 'outbound', content: 'Sahte cevap', conversation_id: 'c1' });
          mock.modelRoutingLogs.push({ message_id: 'm1', model: 'fake-model' });
        }
        return { status, text: async () => '{"received":true}' };
      } };
    },
    loadReplyAgentModule: () => ({ classifyComplexity: () => ({ modelKey: 'haiku', reason: 'fake-reason' }) }),
  };
  return runCheckScript('dry-run.cjs', { files, modules: { '../tests/helpers/webhook-suite.cjs': harness } })
    .then((result) => ({ ...result, seen }));
}

test('dry-run CLI: empty fixture directory exits 1', async () => {
  const result = await run({});
  assert.equal(result.exitCode, 1);
  assert.match(result.stderr, /hiç örnek dosya bulunamadı/);
});

test('dry-run CLI: sorts JSON inputs, ignores documentation and prints routing and drafts', async () => {
  const result = await run({ 'tests/fixtures/whatsapp-example.json': '{}',
    'tests/fixtures/instagram-example.json': '{}', 'tests/fixtures/README.md': 'ignored' });
  assert.deepEqual(result.seen, ['instagram', 'whatsapp']);
  assert.equal(result.exitCode, 0);
  assert.match(result.stdout, /2 örnek dosya/);
  assert.match(result.stdout, /Yönlendirme kararı: fake-model/);
  assert.match(result.stdout, /Hazırlanan taslak cevap: "Sahte cevap"/);
  assert.match(result.stdout, /gerçek bir yapay zeka cevabı üretmez/);
});

test('dry-run CLI: status-only event reports no saved messages', async () => {
  const result = await run({ 'tests/fixtures/whatsapp-read-receipt.json': '{}' }, { empty: true });
  assert.match(result.stdout, /Kaydedilen mesaj yok/);
});

test('dry-run CLI: malformed fixture does not prevent later fixtures from running', async () => {
  const result = await run({ 'tests/fixtures/whatsapp-a.json': '{broken', 'tests/fixtures/whatsapp-b.json': '{}' });
  assert.match(result.stderr, /Handler execution failed/);
  assert.equal(result.exitCode, 1);
  assert.match(result.stdout, /Hazırlanan taslak cevap/);
  assert.equal(result.seen.length, 2);
});

test('dry-run CLI: handler error must produce failing exit status', async () => {
  const result = await run({ 'tests/fixtures/whatsapp-example.json': '{}' }, { fail: true });
  assert.match(result.stderr, /simulated handler failure/);
  assert.equal(result.exitCode, 1);
});

test('dry-run CLI: HTTP 500 must produce failing exit status', async () => {
  const result = await run({ 'tests/fixtures/whatsapp-example.json': '{}' }, { status: 500 });
  assert.match(result.stdout, /HTTP 500/);
  assert.equal(result.exitCode, 1);
});
