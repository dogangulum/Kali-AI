const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const { stripTypeScriptTypes } = require('node:module');
const { runInNewContext } = require('node:vm');

for (const confirmed of [undefined, 'false', 'true']) {
  test(`instagram dispatcher endpoint: native echo confirmation ${confirmed}`, async () => {
    const file = resolve(__dirname, '../supabase/functions/instagram-reply-dispatcher/index.ts');
    const source = stripTypeScriptTypes(readFileSync(file, 'utf8'))
      .replace(/import\s*\{[^}]*\}\s*from\s*['"][^'"]+['"];?/g, '');
    let handler;
    let dispatches = 0;
    runInNewContext(source, {
      Deno: {
        env: { get: (key) => key === 'IG_HUMAN_ECHOES_CONFIRMED' ? confirmed : 'test-only' },
        serve: (value) => { handler = value; },
      },
      createClient: () => ({}),
      dispatchDueReplies: async () => { dispatches++; return { sent: 0, cancelled: 0, failed: 0 }; },
      Response, fetch: async () => { throw new Error('unexpected network call'); }, console,
    });
    const response = await handler(new Request('https://example.test', { method: 'POST' }));
    assert.equal(response.status, confirmed === 'true' ? 200 : 503);
    assert.equal(dispatches, confirmed === 'true' ? 1 : 0);
    assert.equal((await handler(new Request('https://example.test'))).status, 405);
  });
}
