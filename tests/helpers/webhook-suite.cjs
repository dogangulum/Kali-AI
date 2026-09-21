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

// Used whenever a test doesn't configure ANTHROPIC_API_KEY: reply generation
// short-circuits before ever calling fetch, so this stub should never run.
async function unusedFetch() {
  throw new Error('fetch() should not be called without a mock fetchImpl configured');
}

// supabase/functions/_shared/reply-agent.ts is a real static ESM module
// (`import { generateAndStoreReply } from "../_shared/reply-agent.ts"` in
// each webhook's index.ts), same situation as the Supabase import above:
// vm.runInNewContext runs a classic Script, not a Module, so a top-level
// `import` would be a SyntaxError. Rather than add a module loader, we
// inline the shared file's (type-stripped, export-stripped) source ahead of
// the webhook's own source in the same script, then drop the import line --
// the functions it defines are simply in scope by the time index.ts's own
// code runs, same as a bundler would produce.
const REPLY_AGENT_FILE = resolve(__dirname, '../../supabase/functions/_shared/reply-agent.ts');
const REPLY_AGENT_IMPORT_RE = /import\s*\{\s*generateAndStoreReply\s*\}\s*from\s*['"]\.\.\/_shared\/reply-agent\.ts['"];?/;
// Only `export function` / `export async function` survive stripTypeScriptTypes
// (interfaces/type aliases are pure type syntax and are erased entirely) --
// this strips just that leading `export ` so the declarations become plain
// top-of-script functions instead of ESM exports.
const EXPORT_RE = /^export\s+(?=(async\s+function|function)\b)/gm;

function loadReplyAgentSource() {
  const raw = readFileSync(REPLY_AGENT_FILE, 'utf8');
  return stripTypeScriptTypes(raw).replace(EXPORT_RE, '');
}

function loadHandler(channel, overrides = {}, supabaseModule = unusedSupabaseModule, fetchImpl = unusedFetch) {
  const file = resolve(__dirname, '../../supabase/functions', `${channel}-webhook`, 'index.ts');
  const code = loadReplyAgentSource() + '\n' +
    stripTypeScriptTypes(readFileSync(file, 'utf8'))
      .replace(SUPABASE_IMPORT_RE, 'const { createClient } = __supabaseModule;')
      .replace(REPLY_AGENT_IMPORT_RE, '');
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
    fetch: fetchImpl,
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

// Loads supabase/functions/_shared/reply-agent.ts in isolation (no Deno
// scaffolding needed at all -- the module is deliberately Deno-free, see
// its own header comment) for direct unit tests of routing/prompt-building
// without going through a webhook payload.
function loadReplyAgentModule() {
  const code = `${loadReplyAgentSource()}\n;({ classifyComplexity, computeCostUsd, buildSystemPrompt, buildUserTurn, callAnthropicMessages, foldConversationSummary, generateAndStoreReply });`;
  const errors = [];
  const logs = [];
  const module_ = runInNewContext(code, {
    console: { log: (...args) => logs.push(args), error: (...args) => errors.push(args) },
  }, { filename: REPLY_AGENT_FILE, timeout: 1000 });
  return { ...module_, errors, logs };
}

// A representative (fake, not Kali-specific) business_config.config blob,
// matching the shape documented in config/business-config.example.md, used
// as createMockSupabase's default so reply-generation tests don't each have
// to restate a full config just to exercise the happy path.
const DEFAULT_BUSINESS_CONFIG = {
  language: 'tr-TR',
  currency: 'TRY',
  services: [
    {
      id: 'test-hizmet',
      name: 'Test Hizmeti',
      description: 'Test amaçlı örnek hizmet.',
      duration_minutes: 30,
      price: { amount: 500, unit: 'session', tax_included: true },
      active: true,
    },
  ],
  working_hours: {
    monday: [{ opens: '09:00', closes: '18:00' }],
  },
  conversation_style: {
    tone: 'Sıcak ve profesyonel',
    address_form: 'siz',
    response_length: 'Kısa',
    emoji_usage: 'Seyrek',
    greeting: "Merhaba, Test İşletmesi'ne hoş geldiniz.",
    guidelines: ['Yalnızca listelenen hizmetleri öner.'],
  },
};

// A minimal in-memory stand-in for the Supabase JS client, covering the
// query shapes the webhooks and the reply agent issue: find-or-create and
// summary read/update on `conversations`, insert (with or without a
// following select().single()) on `messages`, select on `business_config`,
// and insert on `model_routing_log`. No network, no real Postgres.
function createMockSupabase({
  failSelect = false,
  failInsertConversation = false,
  failInsertMessage = false,
  businessConfig = DEFAULT_BUSINESS_CONFIG,
  failBusinessConfigSelect = false,
  failInsertRoutingLog = false,
  failConversationSummaryUpdate = false,
} = {}) {
  const conversations = new Map();
  const conversationRecords = new Map();
  const messages = [];
  const modelRoutingLogs = [];
  let nextId = 1;
  let nextMessageId = 1;
  const keyOf = (row) => `${row.business_id}|${row.platform}|${row.customer_identifier}`;

  const client = {
    from(table) {
      if (table === 'conversations') {
        const builder = { filters: {}, insertRow: null, updatePatch: null };
        builder.select = () => builder;
        builder.eq = (column, value) => {
          builder.filters[column] = value;
          if (builder.updatePatch) {
            // Terminal call for `.update(patch).eq(column, value)` -- the
            // real supabase-js client resolves this directly as a promise,
            // no further chaining needed.
            return (async () => {
              if (failConversationSummaryUpdate) return { error: new Error('mock: conversation update failed') };
              const record = conversationRecords.get(value);
              if (record) Object.assign(record, builder.updatePatch);
              return { error: null };
            })();
          }
          return builder;
        };
        builder.maybeSingle = async () => {
          if (failSelect) return { data: null, error: new Error('mock: conversation select failed') };
          if ('id' in builder.filters && Object.keys(builder.filters).length === 1) {
            const record = conversationRecords.get(builder.filters.id);
            return { data: record ? { summary: record.summary ?? null } : null, error: null };
          }
          const key = `${builder.filters.business_id}|${builder.filters.platform}|${builder.filters.customer_identifier}`;
          const id = conversations.get(key);
          return { data: id ? { id } : null, error: null };
        };
        builder.insert = (row) => { builder.insertRow = row; return builder; };
        builder.single = async () => {
          if (failInsertConversation) return { data: null, error: new Error('mock: conversation insert failed') };
          const id = `conv-${nextId++}`;
          conversations.set(keyOf(builder.insertRow), id);
          conversationRecords.set(id, { id, ...builder.insertRow, summary: builder.insertRow.summary ?? null });
          return { data: { id }, error: null };
        };
        builder.update = (patch) => { builder.updatePatch = patch; return builder; };
        return builder;
      }
      if (table === 'messages') {
        const builder = {};
        builder.insert = (row) => {
          const result = failInsertMessage
            ? { data: null, error: new Error('mock: message insert failed') }
            : (() => {
                const id = `msg-${nextMessageId++}`;
                messages.push({ ...row, id });
                return { data: { id }, error: null };
              })();
          return {
            select: () => ({ single: async () => result }),
            then: (resolve) => resolve({ error: result.error }),
          };
        };
        return builder;
      }
      if (table === 'business_config') {
        const builder = { filters: {} };
        builder.select = () => builder;
        builder.eq = (column, value) => { builder.filters[column] = value; return builder; };
        builder.maybeSingle = async () => {
          if (failBusinessConfigSelect) return { data: null, error: new Error('mock: business_config select failed') };
          if (businessConfig === null) return { data: null, error: null };
          return { data: { config: businessConfig }, error: null };
        };
        return builder;
      }
      if (table === 'model_routing_log') {
        return {
          insert: async (row) => {
            if (failInsertRoutingLog) return { error: new Error('mock: model_routing_log insert failed') };
            modelRoutingLogs.push(row);
            return { error: null };
          },
        };
      }
      throw new Error(`mock supabase: unexpected table "${table}"`);
    },
  };

  return { module: { createClient: () => client }, conversations, conversationRecords, messages, modelRoutingLogs };
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

module.exports = {
  registerWebhookTests,
  loadHandler,
  postRequest,
  signature,
  createMockSupabase,
  loadReplyAgentModule,
  DEFAULT_BUSINESS_CONFIG,
};
