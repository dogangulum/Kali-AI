const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { runCheckScript } = require('./helpers/run-check-script.cjs');

const ENV = {
  SUPABASE_FUNCTIONS_URL: 'https://webhook.example.invalid/functions/v1/',
  META_WHATSAPP_VERIFY_TOKEN: 'fake-wa-token',
  META_INSTAGRAM_VERIFY_TOKEN: 'fake-ig-token',
};
const reply = (status, body = '') => ({ status, text: async () => body });
function healthy(url) {
  const expected = url.pathname.endsWith('/whatsapp-webhook') ? 'fake-wa-token' : 'fake-ig-token';
  const valid = url.searchParams.get('hub.mode') === 'subscribe'
    && url.searchParams.get('hub.verify_token') === expected;
  return reply(valid ? 200 : 403, valid ? url.searchParams.get('hub.challenge') : 'Forbidden');
}
const run = (options = {}) => runCheckScript('check-webhooks.cjs', { env: ENV, fetch: healthy, ...options });

test('check-webhooks: response body read failure is reported as a failed check', async () => {
  const result = await run({ fetch: () => ({ status: 200, text: async () => { throw new Error('body interrupted'); } }) });
  assert.equal(result.exitCode, 1);
  assert.match(result.stdout, /body interrupted/);
});

test('check-webhooks: missing log path has a controlled error', async () => {
  const result = await run({ args: ['--log-file'] });
  assert.equal(result.exitCode, 1);
  assert.match(result.stderr, /log|dosya|Kullanım/i);
});

test('check-webhooks: empty local values fall back to supplied process settings', async () => {
  const result = await run({ files: { '.env.local': 'SUPABASE_FUNCTIONS_URL=\nMETA_WHATSAPP_VERIFY_TOKEN=\nMETA_INSTAGRAM_VERIFY_TOKEN=' } });
  assert.equal(result.exitCode, 0);
  assert.equal(result.requests.length, 8);
});

test('check-webhooks: missing URL fails before any request', async () => {
  const result = await run({ env: {} });
  assert.equal(result.exitCode, 1);
  assert.match(result.stderr, /SUPABASE_FUNCTIONS_URL ortam değişkeni ayarlanmamış/);
  assert.equal(result.requests.length, 0);
});

for (const key of ['META_WHATSAPP_VERIFY_TOKEN', 'META_INSTAGRAM_VERIFY_TOKEN']) {
  test(`check-webhooks: missing ${key} fails before any request`, async () => {
    const env = { ...ENV };
    delete env[key];
    const result = await run({ env });
    assert.equal(result.exitCode, 1);
    assert.match(result.stderr, /Verify token'lar/);
    assert.equal(result.requests.length, 0);
  });
}

test('check-webhooks: healthy channels perform four GET checks each and exit 0', async () => {
  const result = await run();
  assert.equal(result.exitCode, 0);
  assert.equal(result.stderr, '');
  assert.match(result.stdout, /WhatsApp: TÜM KONTROLLER GEÇTİ/);
  assert.match(result.stdout, /Instagram: TÜM KONTROLLER GEÇTİ/);
  assert.equal(result.requests.length, 8);
  for (const channel of ['whatsapp', 'instagram']) {
    const requests = result.requests.filter(({ url }) => url.pathname === `/functions/v1/${channel}-webhook`);
    assert.equal(requests.length, 4);
    assert.ok(requests.every(({ options }) => options.method === 'GET'));
    assert.equal(requests.filter(({ url }) => !url.searchParams.has('hub.verify_token')).length, 1);
    assert.equal(requests.filter(({ url }) => url.searchParams.get('hub.mode') === 'unsubscribe').length, 1);
    assert.equal(requests.filter(({ url }) => url.searchParams.get('hub.verify_token')?.startsWith('yanlis-token-')).length, 1);
  }
  assert.equal(result.writes.length, 0);
});

test('check-webhooks: local file takes precedence over process environment', async () => {
  const result = await run({
    env: { ...ENV, META_WHATSAPP_VERIFY_TOKEN: 'wrong', META_INSTAGRAM_VERIFY_TOKEN: 'wrong' },
    files: { '.env.local': '# Test only\r\n' + Object.entries(ENV).map(([key, value]) => ` ${key} = ${value}`).join('\r\n') },
  });
  assert.equal(result.exitCode, 0);
  assert.equal(result.requests.length, 8);
});

test('check-webhooks: HTTP 200 with incorrect challenge is a failure', async () => {
  const result = await run({ fetch: (url) => {
    const response = healthy(url);
    return response.status === 200 ? reply(200, 'incorrect-challenge') : response;
  } });
  assert.equal(result.exitCode, 1);
  assert.match(result.stdout, /beklenen challenge dönmedi/);
});

for (const scenario of ['wrong-token', 'missing-token', 'wrong-mode']) {
  test(`check-webhooks: mistakenly accepted ${scenario} is reported as failure`, async () => {
    const result = await run({ fetch: (url) => {
      const token = url.searchParams.get('hub.verify_token');
      const selected = scenario === 'wrong-token' ? token?.startsWith('yanlis-token-')
        : scenario === 'missing-token' ? token === null
          : url.searchParams.get('hub.mode') === 'unsubscribe';
      return selected ? reply(200, 'incorrectly accepted') : healthy(url);
    } });
    assert.equal(result.exitCode, 1);
    assert.match(result.stdout, /403 bekleniyordu ama 200 döndü/);
  });
}

test('check-webhooks: one failed channel makes the overall result fail', async () => {
  const result = await run({ fetch: (url) => url.pathname.endsWith('/instagram-webhook') ? reply(500) : healthy(url) });
  assert.equal(result.exitCode, 1);
  assert.match(result.stdout, /WhatsApp: TÜM KONTROLLER GEÇTİ/);
  assert.match(result.stdout, /Instagram: BAZI KONTROLLER BAŞARISIZ/);
  assert.match(result.stdout, /HTTP 500/);
});

test('check-webhooks: network failures are reported instead of a successful result', async () => {
  const result = await run({ fetch: () => { throw new Error('simulated offline'); } });
  assert.equal(result.exitCode, 1);
  assert.equal(result.requests.length, 8);
  assert.match(result.stdout, /Bağlantı hatası: simulated offline/);
});

for (const flag of ['--log-file', '-l']) {
  test(`check-webhooks: ${flag} writes timestamped results without touching disk`, async () => {
    const logFile = path.resolve(__dirname, 'fake-check-results.log');
    const result = await run({ args: [flag, logFile] });
    assert.equal(result.exitCode, 0);
    assert.ok(result.writes.length > 0);
    assert.ok(result.writes.every(({ file, text }) => file === logFile && /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2} \| /.test(text)));
    const log = result.writes.map(({ text }) => text).join('');
    assert.match(log, /WhatsApp: TÜM KONTROLLER GEÇTİ/);
    assert.match(log, /Instagram: TÜM KONTROLLER GEÇTİ/);
  });
}
