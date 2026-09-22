const { test } = require('node:test');
const assert = require('node:assert/strict');
const { registerWebhookTests, loadHandler, postRequest, signature, createMockSupabase } = require('./helpers/webhook-suite.cjs');

registerWebhookTests('instagram');

const DB_ENV = {
  SUPABASE_URL: 'https://project.test.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'test-only-service-role-key',
  KALI_BUSINESS_ID: 'business-1',
};

const DB_ENV_WITH_ANTHROPIC = { ...DB_ENV, ANTHROPIC_API_KEY: 'test-only-anthropic-key' };

function anthropicFetch(text = 'Merhaba! Size nasıl yardımcı olabilirim?') {
  return async () => ({
    ok: true,
    status: 200,
    json: async () => ({ content: [{ type: 'text', text }], usage: { input_tokens: 100, output_tokens: 30 } }),
    text: async () => '',
  });
}

function failingAnthropicFetch() {
  return async () => ({ ok: false, status: 500, json: async () => ({}), text: async () => 'server error' });
}

function igTextPayload(senderId, text, mid = 'mid.TEST') {
  return {
    object: 'instagram',
    entry: [
      {
        id: 'IG_ID',
        time: 1700000000,
        messaging: [
          {
            sender: { id: senderId },
            recipient: { id: 'IG_ID' },
            timestamp: 1700000000,
            message: { mid, text },
          },
        ],
      },
    ],
  };
}

function igAttachmentPayload(senderId) {
  return {
    object: 'instagram',
    entry: [
      {
        id: 'IG_ID',
        time: 1700000001,
        messaging: [
          {
            sender: { id: senderId },
            recipient: { id: 'IG_ID' },
            timestamp: 1700000001,
            message: { mid: 'mid.IMG', attachments: [{ type: 'image', payload: { url: 'https://example.test/img.jpg' } }] },
          },
        ],
      },
    ],
  };
}

function igReadReceiptPayload(senderId) {
  return {
    object: 'instagram',
    entry: [
      {
        id: 'IG_ID',
        time: 1700000002,
        messaging: [
          { sender: { id: senderId }, recipient: { id: 'IG_ID' }, timestamp: 1700000002, read: { mid: 'mid.TEST' } },
        ],
      },
    ],
  };
}

async function postJson(handler, body) {
  const raw = JSON.stringify(body);
  return handler(postRequest(raw, signature(raw)));
}

test('instagram: persists a text message as a new conversation and inbound message', async () => {
  const mock = createMockSupabase();
  const { handler } = loadHandler('instagram', DB_ENV, mock.module);
  const response = await postJson(handler, igTextPayload('1234567890', 'Merhaba'));

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { received: true });
  assert.equal(mock.messages.length, 1);
  assert.equal(mock.messages[0].business_id, 'business-1');
  assert.equal(mock.messages[0].conversation_id, 'conv-1');
  assert.equal(mock.messages[0].direction, 'inbound');
  assert.equal(mock.messages[0].content, 'Merhaba');
  assert.equal(mock.conversations.size, 1);
  assert.equal(mock.conversations.get('business-1|instagram|1234567890'), 'conv-1');
});

test('instagram: a second message from the same sender reuses the same conversation', async () => {
  const mock = createMockSupabase();
  const { handler } = loadHandler('instagram', DB_ENV, mock.module);

  await postJson(handler, igTextPayload('1234567890', 'Merhaba'));
  await postJson(handler, igTextPayload('1234567890', 'Nasılsınız?'));

  assert.equal(mock.conversations.size, 1);
  assert.equal(mock.messages.length, 2);
  assert.equal(mock.messages[0].conversation_id, mock.messages[1].conversation_id);
  assert.equal(mock.messages[1].content, 'Nasılsınız?');
});

test('instagram: a different sender gets its own conversation', async () => {
  const mock = createMockSupabase();
  const { handler } = loadHandler('instagram', DB_ENV, mock.module);

  await postJson(handler, igTextPayload('1234567890', 'Merhaba'));
  await postJson(handler, igTextPayload('9998887777', 'Selam'));

  assert.equal(mock.conversations.size, 2);
  assert.equal(mock.messages.length, 2);
  assert.notEqual(mock.messages[0].conversation_id, mock.messages[1].conversation_id);
});

test('instagram: an attachment message with no text is stored as JSON', async () => {
  const mock = createMockSupabase();
  const { handler } = loadHandler('instagram', DB_ENV, mock.module);
  await postJson(handler, igAttachmentPayload('1234567890'));

  assert.equal(mock.messages.length, 1);
  const stored = JSON.parse(mock.messages[0].content);
  assert.equal(stored.attachments[0].type, 'image');
});

test('instagram: a read-receipt payload (no message) persists nothing but still acknowledges', async () => {
  const mock = createMockSupabase();
  const { handler } = loadHandler('instagram', DB_ENV, mock.module);
  const response = await postJson(handler, igReadReceiptPayload('1234567890'));

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { received: true });
  assert.equal(mock.messages.length, 0);
  assert.equal(mock.conversations.size, 0);
});

test('instagram: without SUPABASE_URL/KALI_BUSINESS_ID configured, persistence is skipped but the request still succeeds', async () => {
  const { handler } = loadHandler('instagram');
  const response = await postJson(handler, igTextPayload('1234567890', 'Merhaba'));

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { received: true });
});

test('instagram: a conversation insert failure still returns 200 and logs the error (Meta retry avoidance)', async () => {
  const mock = createMockSupabase({ failInsertConversation: true });
  const { handler, errors } = loadHandler('instagram', DB_ENV, mock.module);
  const response = await postJson(handler, igTextPayload('1234567890', 'Merhaba'));

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { received: true });
  assert.equal(mock.messages.length, 0);
  assert.equal(errors.length, 1);
});

test('instagram: an inbound message gets a stored draft reply and a model_routing_log row', async () => {
  const mock = createMockSupabase();
  const { handler } = loadHandler('instagram', DB_ENV_WITH_ANTHROPIC, mock.module, anthropicFetch());
  const response = await postJson(handler, igTextPayload('1234567890', 'Fiyatlarınız nedir?'));

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { received: true });
  assert.equal(mock.messages.length, 2);
  assert.equal(mock.messages[0].direction, 'inbound');
  assert.equal(mock.messages[1].direction, 'outbound');
  assert.equal(mock.messages[1].content, 'Merhaba! Size nasıl yardımcı olabilirim?');
  assert.equal(mock.messages[1].conversation_id, mock.messages[0].conversation_id);
  assert.equal(mock.modelRoutingLogs.length, 1);
  assert.equal(mock.modelRoutingLogs[0].provider, 'anthropic');
  assert.equal(mock.modelRoutingLogs[0].message_id, mock.messages[0].id);
});

test('instagram: a reply-generation failure still returns 200, is logged, and no draft is stored', async () => {
  const mock = createMockSupabase();
  const { handler, errors } = loadHandler('instagram', DB_ENV_WITH_ANTHROPIC, mock.module, failingAnthropicFetch());
  const response = await postJson(handler, igTextPayload('1234567890', 'Fiyatlarınız nedir?'));

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { received: true });
  assert.equal(mock.messages.length, 1);
  assert.equal(mock.messages[0].direction, 'inbound');
  assert.equal(mock.modelRoutingLogs.length, 0);
  assert.equal(errors.length, 1);
});

test('instagram: without ANTHROPIC_API_KEY configured, the inbound message still persists and no draft is generated', async () => {
  const mock = createMockSupabase();
  const { handler } = loadHandler('instagram', DB_ENV, mock.module);
  const response = await postJson(handler, igTextPayload('1234567890', 'Fiyatlarınız nedir?'));

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { received: true });
  assert.equal(mock.messages.length, 1);
  assert.equal(mock.messages[0].direction, 'inbound');
  assert.equal(mock.modelRoutingLogs.length, 0);
});

// --- lead qualification / basic appointment booking (core MVP) -------------
// See supabase/functions/_shared/lead-agent.ts and tests/lead-agent.test.cjs
// for the unit-level coverage of scoring/date-parsing; these integration
// tests only confirm the webhook wires processLeadAndBooking in correctly,
// after persistence and reply generation, without changing the response.

test('instagram: a clear qualified+booking message creates one lead and one pending appointment', async () => {
  const mock = createMockSupabase();
  const { handler } = loadHandler('instagram', DB_ENV, mock.module);
  const response = await postJson(
    handler,
    igTextPayload('1234567890', "Test Hizmeti için randevu almak istiyorum, yarın saat 15:00'te gelebilir miyim?"),
  );

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { received: true });

  assert.equal(mock.leads.length, 1);
  assert.equal(mock.leads[0].status, 'qualified');
  assert.equal(mock.leads[0].conversation_id, mock.messages[0].conversation_id);

  assert.equal(mock.appointments.length, 1);
  assert.equal(mock.appointments[0].status, 'pending');
  assert.equal(mock.appointments[0].lead_id, mock.leads[0].id);
  assert.ok(new Date(mock.appointments[0].scheduled_at).getTime() > 0, 'scheduled_at must be a valid future timestamp');
});

test('instagram: a plain greeting creates no lead and no appointment', async () => {
  const mock = createMockSupabase();
  const { handler } = loadHandler('instagram', DB_ENV, mock.module);
  const response = await postJson(handler, igTextPayload('1234567890', 'Merhaba'));

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { received: true });
  assert.equal(mock.leads.length, 0);
  assert.equal(mock.appointments.length, 0);
});

test('instagram: a lead/booking-step failure still returns 200, is logged, and does not affect inbound/reply persistence', async () => {
  const mock = createMockSupabase({ failLeadSelect: true });
  const { handler, errors } = loadHandler('instagram', DB_ENV_WITH_ANTHROPIC, mock.module, anthropicFetch());
  const response = await postJson(
    handler,
    igTextPayload('1234567890', "Test Hizmeti için randevu almak istiyorum, yarın saat 15:00'te gelebilir miyim?"),
  );

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { received: true });
  assert.equal(mock.messages.length, 2, 'inbound + drafted reply are unaffected by the lead/booking failure');
  assert.equal(mock.leads.length, 0);
  assert.equal(mock.appointments.length, 0);
  assert.equal(errors.length, 1);
  assert.match(errors[0][0], /failed to process lead\/booking/);
});
