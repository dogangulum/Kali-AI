const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createMockSupabase, loadHandler, postRequest, loadDispatchAgentModule } = require('./helpers/webhook-suite.cjs');

const START = 1_000_000;
const ENV = {
  SUPABASE_URL: 'https://project.test.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'test-only',
  KALI_BUSINESS_ID: 'business-1', ANTHROPIC_API_KEY: 'test-only',
};

function fixture(options = {}) {
  const db = createMockSupabase(options);
  let now = START;
  let sequence = 0;
  let drafts = 0;
  const sends = [];
  const webhook = loadHandler('instagram', ENV, db.module, async () => {
    drafts++;
    if (options.onDraft) await options.onDraft();
    return { ok: true, json: async () => ({ content: [{ type: 'text', text: 'Yanıt' }], usage: {} }) };
  });
  const payload = (echo, customer = 'customer-1', mid = `mid-${++sequence}`, text = 'Merhaba') => ({
    object: 'instagram', entry: [{ id: 'IG_ID', messaging: [{
      sender: { id: echo ? 'IG_ID' : customer }, recipient: { id: echo ? customer : 'IG_ID' },
      message: { mid, text, ...(echo ? { is_echo: true } : {}) },
    }] }],
  });
  const post = async (body) => {
    const response = await webhook.handler(postRequest(JSON.stringify(body)));
    assert.equal(response.status, 200);
  };
  return {
    db, sends, webhook, payload, post,
    drafts: () => drafts,
    inbound: (customer, mid) => post(payload(false, customer, mid)),
    human: (customer, mid) => post(payload(true, customer, mid)),
    advance(ms) { now += ms; webhook.advance(ms); },
    now: () => now,
    async dispatch() {
      return loadDispatchAgentModule().dispatchDueReplies({
        supabase: db.module.createClient(), nowMs: now, pageAccessToken: 'test-only', anthropicApiKey: null,
        fetchImpl: async (_url, init) => {
          const mid = `sent-${sends.length + 1}`;
          sends.push({ mid, ...JSON.parse(init.body) });
          if (options.onSend) await options.onSend();
          return { ok: true, json: async () => ({ message_id: mid }) };
        },
      });
    },
  };
}

test('instagram handoff: queues 60, 55, ... 15 seconds and never sends early', async () => {
  const f = fixture();
  for (let i = 0; i < 12; i++) {
    await f.inbound();
    const pending = f.db.pendingReplies.at(-1);
    const wait = Math.max(15, 60 - 5 * i);
    assert.equal(Date.parse(pending.send_after) - f.now(), wait * 1000);
    assert.equal(pending.status, 'scheduled');
    const draft = f.db.messages.find((m) => m.id === pending.message_id);
    assert.equal(draft.author, 'ai');
    assert.equal(draft.status, 'draft');
    if (i === 0) assert.equal(f.db.conversationRecords.get('conv-1').summary, null);
    f.advance(wait * 1000 - 1);
    await f.dispatch();
    assert.equal(f.sends.length, i);
    f.advance(1);
    assert.equal((await f.dispatch()).sent, 1);
    assert.equal(f.sends.length, i + 1);
  }
  assert.equal(f.db.conversationRecords.get('conv-1').next_wait_seconds, 15);
});

test('instagram handoff: duplicate inbound delivery neither drafts nor decays twice', async () => {
  const f = fixture();
  await f.inbound('customer-1', 'duplicate');
  await f.inbound('customer-1', 'duplicate');
  assert.equal(f.db.pendingReplies.length, 1);
  assert.equal(f.drafts(), 1);
  assert.equal(f.db.conversationRecords.get('conv-1').next_wait_seconds, 55);
});

test('instagram handoff: native human reply cancels only its conversation, permanently', async () => {
  const f = fixture();
  await f.inbound();
  await f.inbound('customer-2');
  f.advance(10_000);
  await f.human();
  assert.equal(f.db.conversationRecords.get('conv-1').control_mode, 'human');
  assert.equal(f.db.pendingReplies[0].status, 'cancelled');
  assert.equal(f.db.pendingReplies[1].status, 'scheduled');
  assert.equal(f.db.messages.filter((m) => m.author === 'human').length, 1);
  f.advance(600_000);
  await f.dispatch();
  assert.equal(f.sends.length, 1);
  assert.equal(f.sends[0].recipient.id, 'customer-2');
  assert.equal(f.db.conversationRecords.get('conv-1').control_mode, 'human');
});

test('instagram handoff: own sent message echo is matched by Meta id and never takes over', async () => {
  const f = fixture();
  await f.inbound();
  f.advance(60_000);
  await f.dispatch();
  await f.human('customer-1', f.sends[0].mid);
  assert.equal(f.db.messages.length, 2);
  assert.equal(f.db.conversationRecords.get('conv-1').control_mode, 'bot');
  assert.equal(f.drafts(), 1);
});

test('instagram handoff: equal text with a different mid is human; duplicate echo is ignored', async () => {
  const f = fixture();
  await f.inbound();
  f.advance(1);
  const echo = f.payload(true, 'customer-1', 'human-mid', 'Yanıt');
  await f.post(echo);
  f.advance(1000);
  await f.post(echo);
  assert.equal(f.db.messages.filter((m) => m.author === 'human').length, 1);
  assert.equal(Date.parse(f.db.conversationRecords.get('conv-1').last_human_message_at), START + 1);
});

test('instagram handoff: account-origin native message without echo flag is still outbound', async () => {
  const f = fixture();
  const native = f.payload(true);
  delete native.entry[0].messaging[0].message.is_echo;
  await f.post(native);
  assert.equal(f.db.messages[0].author, 'human');
  assert.equal(f.db.conversationRecords.get('conv-1').customer_identifier, 'customer-1');
  assert.equal(f.db.pendingReplies.length, 0);
});

test('instagram handoff: new customer message waits exactly 3 minutes before reclaim', async () => {
  const f = fixture();
  await f.human();
  f.advance(1_000);
  await f.inbound();
  assert.equal(Date.parse(f.db.pendingReplies[0].send_after) - f.now(), 180_000);
  f.advance(179_999);
  assert.equal((await f.dispatch()).sent, 0);
  assert.equal(f.db.conversationRecords.get('conv-1').control_mode, 'human');
  f.advance(1);
  assert.equal((await f.dispatch()).sent, 1);
  assert.equal(f.db.conversationRecords.get('conv-1').control_mode, 'bot');
  await f.inbound();
  assert.equal(Date.parse(f.db.pendingReplies.at(-1).send_after) - f.now(), 55_000);
});

test('instagram handoff: human answers during reclaim wait; no auto-reclaim without another inbound', async () => {
  const f = fixture();
  await f.human();
  f.advance(1000);
  await f.inbound();
  f.advance(120_000);
  await f.human();
  f.advance(600_000);
  await f.dispatch();
  assert.equal(f.sends.length, 0);
  assert.equal(f.db.conversationRecords.get('conv-1').control_mode, 'human');
});

test('instagram handoff: delay resets only after more than 30 minutes of customer silence', async () => {
  const f = fixture();
  await f.inbound();
  f.advance(30 * 60_000);
  await f.inbound();
  assert.equal(Date.parse(f.db.pendingReplies.at(-1).send_after) - f.now(), 55_000);
  f.advance(30 * 60_000 + 1);
  await f.inbound();
  assert.equal(Date.parse(f.db.pendingReplies.at(-1).send_after) - f.now(), 60_000);
});

test('instagram handoff: human arriving while Anthropic drafts prevents enqueue', async () => {
  const f = fixture({ onDraft: async () => { f.advance(1); await f.human(); } });
  await f.inbound();
  assert.equal(f.db.pendingReplies.length, 0);
  assert.equal(f.db.messages.filter((m) => m.author === 'ai').length, 0);
  assert.equal(f.db.conversationRecords.get('conv-1').control_mode, 'human');
});

test('instagram handoff: human arriving during actual send keeps control', async () => {
  const f = fixture({ onSend: async () => { f.advance(1); await f.human(); } });
  await f.human();
  f.advance(1000);
  await f.inbound();
  f.advance(180_000);
  assert.equal((await f.dispatch()).sent, 1);
  assert.equal(f.db.conversationRecords.get('conv-1').control_mode, 'human');
});

test('instagram handoff: a claimed old reply remains blocked even if dispatch runs very late', async () => {
  const f = fixture();
  await f.inbound();
  f.advance(1);
  await f.human();
  // Model a queue entry that escaped cancellation while generation ran.
  f.db.pendingReplies[0].status = 'scheduled';
  f.advance(600_000);
  assert.equal((await f.dispatch()).cancelled, 1);
  assert.equal(f.sends.length, 0);
});

test('instagram handoff: queue write failure is reported and nothing is sent', async () => {
  const f = fixture({ failInsertPendingReply: true });
  await f.inbound();
  assert.equal(f.db.pendingReplies.length, 0);
  assert.equal(f.webhook.errors.length, 1);
  f.advance(60_000);
  await f.dispatch();
  assert.equal(f.sends.length, 0);
});

test('instagram handoff: human echo in same delivery batch suppresses earlier inbound draft', async () => {
  const f = fixture();
  const body = f.payload(false);
  body.entry[0].messaging.push(f.payload(true).entry[0].messaging[0]);
  await f.post(body);
  assert.equal(f.db.pendingReplies.length, 0);
  assert.equal(f.drafts(), 0);
});

test('instagram handoff: concurrent inbound messages each decrement the wait once', async () => {
  const f = fixture();
  await f.inbound(); // Establish the conversation before racing updates.
  f.advance(1000);
  await Promise.all([f.inbound(), f.inbound()]);
  const waits = f.db.pendingReplies.slice(1).map((row) => Date.parse(row.send_after) - f.now()).sort();
  assert.deepEqual(waits, [50_000, 55_000]);
  assert.equal(f.db.conversationRecords.get('conv-1').next_wait_seconds, 45);
  assert.equal(f.webhook.errors.length, 0);
});

test('instagram handoff: concurrent human takeover is not overwritten by inbound timing update', async () => {
  let takeover = false;
  const f = fixture({ beforeQuery: async ({ table, operation, patch }) => {
    if (table === 'conversations' && operation === 'update' && patch.next_wait_seconds && !takeover) {
      takeover = true;
      f.advance(1);
      await f.human();
    }
  } });
  await f.inbound();
  assert.equal(f.db.conversationRecords.get('conv-1').control_mode, 'human');
  assert.equal(f.db.pendingReplies.length, 0);
  assert.equal(f.webhook.errors.length, 0);
});
