const { test } = require('node:test');
const assert = require('node:assert/strict');
const { runCheckScript } = require('./helpers/run-check-script.cjs');

// The CLI runs inside the existing VM harness: process.env and fs are fake,
// fetch has no network implementation. Only the CLI source is read from disk.
const ENV = {
  SUPABASE_URL: 'https://monitor.invalid/',
  SUPABASE_SERVICE_ROLE_KEY: 'synthetic-monitor-key-not-a-credential',
};
const EARLY = '2026-09-22T07:00:00Z';
const LATE = '2026-09-22T07:01:00Z';
const message = (changes = {}) => ({
  id: 'fake-inbound-1', direction: 'inbound', content: 'SENTETİK: Manikür kaç dakika?',
  created_at: EARLY, conversation_id: 'fake-conversation-1', ...changes,
});
const route = (changes = {}) => ({
  message_id: 'fake-inbound-1', model: 'synthetic-small-model', cost_usd: '0.00125',
  latency_ms: 123, created_at: EARLY, ...changes,
});
function data() {
  return {
    // Supabase returns newest first; the screen should display oldest first.
    messages: [message({ id: 'fake-outbound-1', direction: 'outbound', content: 'SENTETİK TASLAK: 30 dakika.', created_at: LATE }), message()],
    model_routing_log: [route()],
    conversations: [{ id: 'fake-conversation-1', platform: 'whatsapp', customer_identifier: 'SYNTHETIC_CUSTOMER_A' }],
  };
}
async function run({ tables = data(), env = ENV, files = {}, args = [], respond } = {}) {
  const result = await runCheckScript('live-monitor.cjs', {
    env, files, args,
    fetch: async (url, options) => {
      assert.equal(url.hostname, 'monitor.invalid', 'Only the synthetic test URL is allowed');
      assert.equal(options.method ?? 'GET', 'GET', 'Monitor must only read');
      assert.equal(options.body, undefined);
      const table = url.pathname.split('/').at(-1);
      assert.ok(Object.hasOwn(tables, table), `Unexpected table: ${table}`);
      if (respond) return respond(table, url, options);
      return { ok: true, status: 200, json: async () => structuredClone(tables[table]), text: async () => '' };
    },
  });
  assert.deepEqual(result.writes, [], 'No file output');
  return result;
}
const renderedTime = (iso) => new Date(iso).toLocaleString('tr-TR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

test('live monitor: shows sender, timestamp, inbound content and explicit outbound draft label', async () => {
  const result = await run();
  assert.equal(result.exitCode, 0, result.stderr);
  assert.equal(result.stderr, '');
  assert.ok(result.stdout.includes(`[${renderedTime(EARLY)}] GELEN — whatsapp / SYNTHETIC_CUSTOMER_A`));
  assert.ok(result.stdout.includes(`[${renderedTime(LATE)}] GİDEN (taslak) — whatsapp / SYNTHETIC_CUSTOMER_A`));
  assert.ok(result.stdout.includes('"SENTETİK: Manikür kaç dakika?"'));
  assert.ok(result.stdout.includes('"SENTETİK TASLAK: 30 dakika."'));
  assert.match(result.stdout, /müşteriye gönderilmiş anlamına gelmez/u);
  assert.ok(result.stdout.indexOf('SENTETİK: Manikür') < result.stdout.indexOf('SENTETİK TASLAK:'));
});

test('live monitor: associates the recorded model, decimal cost and latency with the exact inbound id', async () => {
  const result = await run();
  assert.match(result.stdout, /Model: synthetic-small-model — Maliyet: \$0\.00125 — Süre: 123ms/u);
  assert.equal(result.stdout.split('Model:').length - 1, 1);
  assert.ok(result.stdout.indexOf('Model:') < result.stdout.indexOf('GİDEN (taslak)'));
});

test('live monitor: unrelated routing record never supplies a model for another message', async () => {
  const tables = data();
  tables.model_routing_log = [route({ message_id: 'not-in-this-window', model: 'SHOULD_NOT_APPEAR' })];
  const result = await run({ tables });
  assert.equal(result.exitCode, 0);
  assert.doesNotMatch(result.stdout, /Model:|SHOULD_NOT_APPEAR/u);
  assert.match(result.stdout, /SENTETİK: Manikür/u);
});

test('live monitor: two conversations retain their own sender, model and cost despite shuffled joins', async () => {
  const tables = {
    messages: [message({ id: 'fake-inbound-2', conversation_id: 'fake-conversation-2', content: 'SENTETİK B', created_at: LATE }), message()],
    conversations: [
      { id: 'fake-conversation-2', platform: 'instagram', customer_identifier: 'SYNTHETIC_CUSTOMER_B' },
      { id: 'fake-conversation-1', platform: 'whatsapp', customer_identifier: 'SYNTHETIC_CUSTOMER_A' },
    ],
    model_routing_log: [route({ message_id: 'fake-inbound-2', model: 'synthetic-large-model', cost_usd: 0.25, latency_ms: 750 }), route()],
  };
  const result = await run({ tables });
  const firstBlock = result.stdout.slice(result.stdout.indexOf('GELEN — whatsapp'), result.stdout.indexOf('GELEN — instagram'));
  const secondBlock = result.stdout.slice(result.stdout.indexOf('GELEN — instagram'));
  assert.match(firstBlock, /SYNTHETIC_CUSTOMER_A/u);
  assert.match(firstBlock, /synthetic-small-model — Maliyet: \$0\.00125/u);
  assert.doesNotMatch(firstBlock, /synthetic-large-model|SYNTHETIC_CUSTOMER_B/u);
  assert.match(secondBlock, /SYNTHETIC_CUSTOMER_B/u);
  assert.match(secondBlock, /synthetic-large-model — Maliyet: \$0\.25000 — Süre: 750ms/u);
});

for (const [cost, display] of [[0, '0.00000'], [0.0123456, '0.01235'], ['12.5', '12.50000']]) {
  test(`live monitor: formats measured cost ${cost} as $${display}`, async () => {
    const tables = data();
    tables.model_routing_log = [route({ cost_usd: cost, latency_ms: 0 })];
    const result = await run({ tables });
    assert.ok(result.stdout.includes(`Maliyet: $${display} — Süre: 0ms`));
  });
}

test('live monitor: absent routing is allowed, inbound and draft text remain visible', async () => {
  const tables = data();
  tables.model_routing_log = [];
  const result = await run({ tables });
  assert.equal(result.exitCode, 0);
  assert.match(result.stdout, /GELEN/u);
  assert.match(result.stdout, /GİDEN \(taslak\)/u);
  assert.doesNotMatch(result.stdout, /Model:|Maliyet:/u);
});

test('live monitor: missing conversation uses unknown placeholders without suppressing message/model', async () => {
  const tables = data();
  tables.conversations = [];
  const result = await run({ tables });
  assert.equal(result.exitCode, 0);
  assert.match(result.stdout, /GELEN — \? \/ \?/u);
  assert.match(result.stdout, /synthetic-small-model/u);
});

test('live monitor: empty result displays an explicit message and does not query conversations', async () => {
  const result = await run({ tables: { messages: [], model_routing_log: [], conversations: [] } });
  assert.equal(result.exitCode, 0);
  assert.match(result.stdout, /Henüz kayıtlı mesaj yok/u);
  assert.equal(result.requests.length, 2);
  assert.ok(result.requests.every(({ url }) => !url.pathname.endsWith('/conversations')));
  assert.doesNotMatch(result.stdout, /GELEN|Model:/u);
});

test('live monitor: uses default limit 15 and deduplicates conversation lookup ids', async () => {
  const result = await run();
  assert.match(result.stdout, /son 15 mesaj/u);
  assert.equal(result.requests.length, 3);
  for (const { url, options } of result.requests) {
    assert.equal(options.headers.apikey, ENV.SUPABASE_SERVICE_ROLE_KEY);
    assert.equal(options.headers.Authorization, `Bearer ${ENV.SUPABASE_SERVICE_ROLE_KEY}`);
    if (url.pathname.endsWith('/conversations')) assert.equal(url.searchParams.get('id'), 'in.(fake-conversation-1)');
    else {
      assert.equal(url.searchParams.get('limit'), '15');
      assert.equal(url.searchParams.get('order'), 'created_at.desc');
    }
    assert.ok(!url.pathname.includes('//'), 'Base URL trailing slash normalized');
  }
  assert.doesNotMatch(result.stdout + result.stderr, /synthetic-monitor-key-not-a-credential/u);
});

test('live monitor: explicit positive limit is applied to both recent-table queries and title', async () => {
  const result = await run({ args: ['3'] });
  assert.equal(result.exitCode, 0);
  assert.match(result.stdout, /son 3 mesaj/u);
  for (const { url } of result.requests.slice(0, 2)) assert.equal(url.searchParams.get('limit'), '3');
});

test('live monitor: Turkish and multiline synthetic content survives console rendering', async () => {
  const tables = data();
  tables.messages = [message({ content: 'SENTETİK: İğne, ölçü, şüphe?\nİkinci satır 😊' })];
  const result = await run({ tables });
  assert.ok(result.stdout.includes('SENTETİK: İğne, ölçü, şüphe?\nİkinci satır 😊'));
});

test('live monitor: synthetic in-memory env file is sufficient; real filesystem config is never read', async () => {
  const result = await run({ env: {}, files: { '.env.local': '# Synthetic only\n\nSUPABASE_URL=https://monitor.invalid\nSUPABASE_SERVICE_ROLE_KEY=synthetic-file-key\n' } });
  assert.equal(result.exitCode, 0);
  assert.ok(result.requests.every(({ options }) => options.headers.apikey === 'synthetic-file-key'));
  assert.doesNotMatch(result.stdout + result.stderr, /synthetic-file-key/u);
});

test('live monitor: provided fake process settings take precedence over fake file settings', async () => {
  const result = await run({ files: { '.env.local': 'SUPABASE_URL=https://unused.invalid\nSUPABASE_SERVICE_ROLE_KEY=unused-fake-key\n' } });
  assert.equal(result.exitCode, 0);
  assert.ok(result.requests.every(({ options }) => options.headers.apikey === ENV.SUPABASE_SERVICE_ROLE_KEY));
});

for (const env of [{}, { SUPABASE_URL: ENV.SUPABASE_URL }, { SUPABASE_SERVICE_ROLE_KEY: ENV.SUPABASE_SERVICE_ROLE_KEY }]) {
  test(`live monitor: missing fake configuration (${Object.keys(env).join(',') || 'all'}) stops before fetch`, async () => {
    const result = await run({ env });
    assert.equal(result.exitCode, 1);
    assert.equal(result.requests.length, 0);
    assert.match(result.stderr, /SUPABASE_URL ve SUPABASE_SERVICE_ROLE_KEY gerekli/u);
    assert.equal(result.stdout, '');
  });
}

for (const failingTable of ['messages', 'model_routing_log', 'conversations']) {
  test(`live monitor: ${failingTable} HTTP error fails visibly without a misleading timeline`, async () => {
    const tables = data();
    const result = await run({ tables, respond: async (table) => table === failingTable
      ? { ok: false, status: 503, text: async () => 'SYNTHETIC_UNAVAILABLE' }
      : { ok: true, json: async () => structuredClone(tables[table]) } });
    assert.equal(result.exitCode, 1);
    assert.ok(result.stderr.includes(`${failingTable}: HTTP 503 - SYNTHETIC_UNAVAILABLE`));
    assert.equal(result.stdout, '');
  });
}

test('live monitor: simulated network failure is reported without making a real request', async () => {
  const result = await run({ respond: async () => { throw new Error('SYNTHETIC_NETWORK_FAILURE'); } });
  assert.equal(result.exitCode, 1);
  assert.match(result.stderr, /SYNTHETIC_NETWORK_FAILURE/u);
  assert.equal(result.stdout, '');
});

test('live monitor: malformed mocked JSON response fails visibly', async () => {
  const result = await run({ respond: async () => ({ ok: true, json: async () => { throw new Error('SYNTHETIC_BAD_JSON'); } }) });
  assert.equal(result.exitCode, 1);
  assert.match(result.stderr, /SYNTHETIC_BAD_JSON/u);
});

// Desired behavior, not a blessing of known defects. Production changes remain
// with the tool's author under AGENTS.md. Node reports these as unresolved TODOs.
test('live monitor: unknown cost must not be displayed as measured zero', { todo: 'MONITOR-01: cost_usd null currently prints $0.00000; tool author must distinguish unknown cost.' }, async () => {
  const tables = data();
  tables.model_routing_log = [route({ cost_usd: null })];
  const result = await run({ tables });
  assert.doesNotMatch(result.stdout, /Maliyet: \$0\.00000/u);
});

test('live monitor: latest route must not be overwritten by an older route for the same message', { todo: 'MONITOR-02: newest-first routing rows become a Map; the oldest duplicate currently wins.' }, async () => {
  const tables = data();
  tables.model_routing_log = [route({ model: 'synthetic-new-model', created_at: LATE }), route({ model: 'synthetic-old-model', created_at: EARLY })];
  const result = await run({ tables });
  assert.match(result.stdout, /Model: synthetic-new-model/u);
});
