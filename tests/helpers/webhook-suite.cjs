// Requires Node.js >= 22.13 (node:module.stripTypeScriptTypes).
// Runs the actual handler in an isolated VM; no server, network or real secrets.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const { runInNewContext } = require('node:vm');
const { stripTypeScriptTypes } = require('node:module');
const { createHmac, webcrypto } = require('node:crypto');

const TOKEN = 'test-only-verification-token';
const SECRET = 'test-only-app-secret';
const BODY = JSON.stringify({ object: 'test', entry: [{ text: 'Merhaba dünya' }] });

function signature(body, secret = SECRET) {
  return `sha256=${createHmac('sha256', secret).update(body, 'utf8').digest('hex')}`;
}

// The deployed Deno source uses a real static ESM import for the Supabase
// client (`import { createClient } from "npm:@supabase/supabase-js@2"`), as
// is idiomatic for Supabase Edge Functions. Node's vm.runInNewContext runs
// code as a classic Script, not a Module, so a top-level `import` statement
// would be a SyntaxError there. Rather than pull in Node's experimental vm
// Module/linker machinery just for this one line, we swap it for a plain
// const pulled off an injected `__supabaseModule` global -- the rest of the
// file (and its behavior) is untouched.
const SUPABASE_IMPORT_RE = /import\s*\{\s*createClient\s*\}\s*from\s*['"][^'"]+['"];?/;

// Used whenever a test doesn't care about persistence (i.e. doesn't set
// SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY): the handler never calls
// createClient() in that case, so this stub should never actually run.
const unusedSupabaseModule = {
  createClient() {
    throw new Error('createClient() should not be called without SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY configured');
  },
};

function loadHandler(channel, overrides = {}, supabaseModule = unusedSupabaseModule) {
  const file = resolve(__dirname, '../../supabase/functions', `${channel}-webhook`, 'index.ts');
  const code = stripTypeScriptTypes(readFileSync(file, 'utf8'))
    .replace(SUPABASE_IMPORT_RE, 'const { createClient } = __supabaseModule;');
  const tokenKey = `META_${channel.toUpperCase()}_VERIFY_TOKEN`;
  const env = { [tokenKey]: TOKEN, META_APP_SECRET: SECRET, ...overrides };
  let handler;
  let now = 1_000_000;
  const errors = [];
  class FakeDate extends Date {
    static now() { return now; }
  }
  runInNewContext(code, {
    Deno: {
      env: { get: (name) => env[name] },
      serve: (callback) => { handler = callback; },
    },
    Request, Response, URL, TextEncoder,
    crypto: webcrypto,
    Date: FakeDate,
    console: { log() {}, error: (...args) => errors.push(args) },
    __supabaseModule: supabaseModule,
  }, { filename: file, timeout: 1000 });
  assert.equal(typeof handler, 'function', 'Webhook must register a handler');
  return {
    handler,
    advance: (milliseconds) => { now += milliseconds; },
    errors,
  };
}

// A minimal in-memory stand-in for the Supabase JS client, covering exactly
// the query shapes the webhooks issue: find-or-create on `conversations`
// (select().eq().eq().eq().maybeSingle(), then insert().select().single())
// and a plain insert() on `messages`. No network, no real Postgres.
function createMockSupabase({ failSelect = false, failInsertConversation = false, failInsertMessage = false } = {}) {
  const conversations = new Map();
  const messages = [];
  let nextId = 1;
  const keyOf = (row) => `${row.business_id}|${row.platform}|${row.customer_identifier}`;

  const client = {
    from(table) {
      if (table === 'conversations') {
        const builder = { filters: {}, insertRow: null };
        builder.select = () => builder;
        builder.eq = (column, value) => { builder.filters[column] = value; return builder; };
        builder.maybeSingle = async () => {
          if (failSelect) return { data: null, error: new Error('mock: conversation select failed') };
          const key = `${builder.filters.business_id}|${builder.filters.platform}|${builder.filters.customer_identifier}`;
          const id = conversations.get(key);
          return { data: id ? { id } : null, error: null };
        };
        builder.insert = (row) => { builder.insertRow = row; return builder; };
        builder.single = async () => {
          if (failInsertConversation) return { data: null, error: new Error('mock: conversation insert failed') };
          const id = `conv-${nextId++}`;
          conversations.set(keyOf(builder.insertRow), id);
          return { data: { id }, error: null };
        };
        return builder;
      }
      if (table === 'messages') {
        return {
          insert: async (row) => {
            if (failInsertMessage) return { error: new Error('mock: message insert failed') };
            messages.push(row);
            return { error: null };
          },
        };
      }
      throw new Error(`mock supabase: unexpected table "${table}"`);
    },
  };

  return { module: { createClient: () => client }, conversations, messages };
}

function getRequest({ token = TOKEN, mode = 'subscribe', challenge = '12345', ip = '192.0.2.1' } = {}) {
  const url = new URL('https://webhook.test/');
  if (token !== null) url.searchParams.set('hub.verify_token', token);
  if (mode !== null) url.searchParams.set('hub.mode', mode);
  if (challenge !== null) url.searchParams.set('hub.challenge', challenge);
  return new Request(url, { headers: ip === null ? {} : { 'x-forwarded-for': ip } });
}

function postRequest(body = BODY, signed = signature(body), ip = '192.0.2.1') {
  const headers = { 'content-type': 'application/json', 'x-forwarded-for': ip };
  if (signed !== null) headers['x-hub-signature-256'] = signed;
  return new Request('https://webhook.test/', { method: 'POST', headers, body });
}

async function expectResponse(response, status, body) {
  assert.equal(response.status, status);
  assert.equal(await response.text(), body);
}

function registerWebhookTests(channel) {
  const check = (name, callback) => test(`${channel}: ${name}`, callback);

  check('correct verification token returns the exact challenge', async () => {
    const { handler } = loadHandler(channel);
    await expectResponse(await handler(getRequest({ challenge: '000123-ç' })), 200, '000123-ç');
  });

  for (const [name, options] of [
    ['wrong token', { token: 'wrong' }],
    ['missing token', { token: null }],
    ['empty token', { token: '' }],
    ['wrong mode', { mode: 'unsubscribe' }],
    ['missing mode', { mode: null }],
  ]) {
    check(`${name} is rejected`, async () => {
      const { handler } = loadHandler(channel);
      await expectResponse(await handler(getRequest(options)), 403, 'Forbidden');
    });
  }

  check('missing configured verification token rejects GET', async () => {
    const { handler } = loadHandler(channel, { [`META_${channel.toUpperCase()}_VERIFY_TOKEN`]: undefined });
    await expectResponse(await handler(getRequest()), 403, 'Forbidden');
    await expectResponse(await handler(getRequest({ token: null })), 403, 'Forbidden');
  });

  check('valid signature accepts a UTF-8 JSON body', async () => {
    const { handler } = loadHandler(channel);
    const response = await handler(postRequest());
    assert.match(response.headers.get('content-type'), /^application\/json\b/);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { received: true });
  });

  for (const [name, signed] of [
    ['missing signature', null],
    ['empty signature', ''],
    ['forged signature of correct length', `sha256=${'0'.repeat(64)}`],
    ['signature made with a different secret', signature(BODY, 'wrong-test-secret')],
    ['unsupported algorithm', `sha1=${'0'.repeat(40)}`],
    ['missing algorithm prefix', '0'.repeat(64)],
    ['empty hash', 'sha256='],
    ['truncated hash', 'sha256=abc'],
    ['non-hex hash', `sha256=${'z'.repeat(64)}`],
  ]) {
    check(`${name} is rejected`, async () => {
      const { handler } = loadHandler(channel);
      await expectResponse(await handler(postRequest(BODY, signed)), 401, 'Unauthorized');
    });
  }

  check('body changed after signing is rejected', async () => {
    const { handler } = loadHandler(channel);
    await expectResponse(await handler(postRequest(`${BODY} `, signature(BODY))), 401, 'Unauthorized');
  });

  check('missing configured app secret rejects signed POST', async () => {
    const { handler } = loadHandler(channel, { META_APP_SECRET: undefined });
    await expectResponse(await handler(postRequest()), 401, 'Unauthorized');
  });

  check('correctly signed invalid JSON returns 400', async () => {
    const { handler } = loadHandler(channel);
    await expectResponse(await handler(postRequest('{invalid')), 400, 'Bad Request');
  });

  check('signature is checked before JSON parsing', async () => {
    const { handler } = loadHandler(channel);
    await expectResponse(await handler(postRequest('{invalid', null)), 401, 'Unauthorized');
  });

  check('unsupported method returns 405', async () => {
    const { handler } = loadHandler(channel);
    await expectResponse(await handler(new Request('https://webhook.test/', { method: 'PUT' })), 405, 'Method Not Allowed');
  });

  check('first 30 requests pass, request 31 is limited, window resets at 60 seconds', async () => {
    const { handler, advance } = loadHandler(channel);
    for (let i = 0; i < 30; i++) {
      await expectResponse(await handler(getRequest()), 200, '12345');
    }
    await expectResponse(await handler(getRequest()), 429, 'Too Many Requests');
    advance(59_999);
    await expectResponse(await handler(getRequest()), 429, 'Too Many Requests');
    advance(1);
    await expectResponse(await handler(getRequest()), 200, '12345');
  });

  check('valid POST requests are also rate limited', async () => {
    const { handler } = loadHandler(channel);
    for (let i = 0; i < 30; i++) {
      await expectResponse(await handler(postRequest()), 200, '{"received":true}');
    }
    await expectResponse(await handler(postRequest()), 429, 'Too Many Requests');
  });

  check('GET and POST share a bucket; rejected requests count toward the limit', async () => {
    const { handler } = loadHandler(channel);
    for (let i = 0; i < 30; i++) {
      await expectResponse(await handler(postRequest(BODY, null)), 401, 'Unauthorized');
    }
    await expectResponse(await handler(getRequest()), 429, 'Too Many Requests');
  });

  check('different IP addresses have independent buckets', async () => {
    const { handler } = loadHandler(channel);
    for (let i = 0; i < 30; i++) await handler(getRequest());
    await expectResponse(await handler(getRequest()), 429, 'Too Many Requests');
    await expectResponse(await handler(getRequest({ ip: '192.0.2.2' })), 200, '12345');
  });

  check('forwarded address list uses the first IP', async () => {
    const { handler } = loadHandler(channel);
    for (let i = 0; i < 30; i++) {
      await handler(getRequest({ ip: '192.0.2.1, 192.0.2.2' }));
    }
    await expectResponse(await handler(getRequest()), 429, 'Too Many Requests');
  });

  check('requests without forwarded IP share the fallback bucket', async () => {
    const { handler } = loadHandler(channel);
    for (let i = 0; i < 30; i++) await handler(getRequest({ ip: null }));
    await expectResponse(await handler(getRequest({ ip: null })), 429, 'Too Many Requests');
  });
}

module.exports = { registerWebhookTests, loadHandler, postRequest, signature, createMockSupabase };
