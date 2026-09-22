const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createMockSupabase, loadDispatchAgentModule } = require('./helpers/webhook-suite.cjs');

const NOW = 1_000_000;

function fixture(beforeQuery) {
  const db = createMockSupabase({ beforeQuery });
  db.conversationRecords.set('conv-1', {
    id: 'conv-1', customer_identifier: 'customer-1', control_mode: 'bot',
    next_wait_seconds: 55, last_customer_message_at: new Date(NOW - 60_000).toISOString(),
    last_human_message_at: null,
  });
  db.messages.push({ id: 'msg-1', content: 'Merhaba', status: 'draft' });
  db.messages.push({ id: 'inbound-1', content: 'Merhaba', created_at: new Date(NOW - 60_000).toISOString() });
  db.pendingReplies.push({
    id: 'pending-1', business_id: 'business-1', conversation_id: 'conv-1',
    message_id: 'msg-1', inbound_message_id: 'inbound-1',
    send_after: new Date(NOW).toISOString(), status: 'scheduled',
  });
  const sends = [];
  const params = {
    supabase: db.module.createClient(), pageAccessToken: 'test-token',
    anthropicApiKey: null, nowMs: NOW,
    fetchImpl: async (_url, init) => {
      sends.push(JSON.parse(init.body));
      return { ok: true, json: async () => ({ message_id: 'meta-1' }) };
    },
  };
  return { db, sends, params };
}

test('dispatcher: concurrent workers with the same pending snapshot send exactly once', async () => {
  let selections = 0;
  let release;
  const barrier = new Promise((resolve) => { release = resolve; });
  const f = fixture(async ({ table, operation }) => {
    if (table === 'pending_replies' && operation === 'select') {
      if (++selections === 2) release();
      await barrier;
    }
  });
  // Separate module instances: no process-local lock can make this pass.
  const a = loadDispatchAgentModule();
  const b = loadDispatchAgentModule();
  const results = await Promise.all([a.dispatchDueReplies(f.params), b.dispatchDueReplies(f.params)]);
  assert.equal(selections, 2);
  assert.equal(f.sends.length, 1);
  assert.equal(results.reduce((total, r) => total + r.sent, 0), 1);
  assert.equal(results.reduce((total, r) => total + r.failed, 0), 0);
  assert.equal(f.db.pendingReplies[0].status, 'sent');
  assert.equal(f.db.messages[0].platform_message_id, 'meta-1');
  await a.dispatchDueReplies(f.params);
  assert.equal(f.sends.length, 1);
});

for (const status of ['processing', 'sent', 'cancelled']) {
  test(`dispatcher: a stale snapshot cannot claim a row now ${status}`, async () => {
    const f = fixture(async ({ table, operation }) => {
      if (table === 'pending_replies' && operation === 'update') {
        f.db.pendingReplies[0].status = status;
      }
    });
    const result = await loadDispatchAgentModule().dispatchDueReplies(f.params);
    assert.equal(f.sends.length, 0);
    assert.equal(result.sent + result.failed + result.cancelled, 0);
    assert.equal(f.db.pendingReplies[0].status, status);
    assert.equal(f.db.messages[0].status, 'draft');
  });
}

test('dispatcher: claim failure does not write to a row it does not own', async () => {
  let updates = 0;
  const f = fixture(async ({ table, operation }) => {
    if (table === 'pending_replies' && operation === 'update') {
      updates++;
      throw new Error('database unavailable');
    }
  });
  const result = await loadDispatchAgentModule().dispatchDueReplies(f.params);
  assert.equal(result.failed, 1);
  assert.equal(updates, 1);
  assert.equal(f.sends.length, 0);
  assert.equal(f.db.pendingReplies[0].status, 'scheduled');
});

test('dispatcher: human reply during message loading cancels the claimed reply', async () => {
  let conversationReads = 0;
  const f = fixture(async ({ table, operation }) => {
    if (table === 'conversations' && operation === 'select') conversationReads++;
    if (table === 'messages' && operation === 'select') {
      Object.assign(f.db.conversationRecords.get('conv-1'), {
        control_mode: 'human', last_human_message_at: new Date(NOW).toISOString(),
      });
    }
  });
  const result = await loadDispatchAgentModule().dispatchDueReplies(f.params);
  assert.equal(conversationReads, 2);
  assert.equal(result.cancelled, 1);
  assert.equal(f.sends.length, 0);
  assert.equal(f.db.pendingReplies[0].status, 'cancelled');
  assert.equal(f.db.messages[0].status, 'cancelled');
});

test('dispatcher: final conversation check is the last database operation before send', async () => {
  const operations = [];
  const f = fixture(async ({ table, operation }) => operations.push(`${table}:${operation}`));
  const send = f.params.fetchImpl;
  f.params.fetchImpl = async (...args) => {
    assert.equal(operations.at(-1), 'conversations:select');
    assert.equal(operations.filter((op) => op === 'conversations:select').length, 2);
    assert.equal(f.db.pendingReplies[0].status, 'processing');
    return send(...args);
  };
  const result = await loadDispatchAgentModule().dispatchDueReplies(f.params);
  assert.equal(result.sent, 1);
  assert.equal(f.sends.length, 1);
});

test('dispatcher: final check error prevents sending', async () => {
  let reads = 0;
  const f = fixture(async ({ table, operation }) => {
    if (table === 'conversations' && operation === 'select' && ++reads === 2) {
      throw new Error('final check unavailable');
    }
  });
  const result = await loadDispatchAgentModule().dispatchDueReplies(f.params);
  assert.equal(result.failed, 1);
  assert.equal(f.sends.length, 0);
  assert.equal(f.db.pendingReplies[0].status, 'failed');
});

test('dispatcher: replies scheduled in the future are not claimed', async () => {
  const f = fixture();
  f.db.pendingReplies[0].send_after = new Date(NOW + 1).toISOString();
  await loadDispatchAgentModule().dispatchDueReplies(f.params);
  assert.equal(f.sends.length, 0);
  assert.equal(f.db.pendingReplies[0].status, 'scheduled');
});
