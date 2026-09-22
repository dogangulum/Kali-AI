const { test } = require('node:test');
const assert = require('node:assert/strict');
const { registerWebhookTests, loadHandler, postRequest, signature, createMockSupabase } = require('./helpers/webhook-suite.cjs');

registerWebhookTests('whatsapp');

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

function waTextPayload(from, body, waId = 'wamid.TEST') {
  return {
    object: 'whatsapp_business_account',
    entry: [
      {
        id: 'WABA_ID',
        changes: [
          {
            field: 'messages',
            value: {
              messaging_product: 'whatsapp',
              metadata: { display_phone_number: '15550001111', phone_number_id: 'PNID' },
              contacts: [{ profile: { name: 'Test User' }, wa_id: from }],
              messages: [{ from, id: waId, timestamp: '1700000000', type: 'text', text: { body } }],
            },
          },
        ],
      },
    ],
  };
}

function waImagePayload(from) {
  return {
    object: 'whatsapp_business_account',
    entry: [
      {
        id: 'WABA_ID',
        changes: [
          {
            field: 'messages',
            value: {
              messaging_product: 'whatsapp',
              metadata: { display_phone_number: '15550001111', phone_number_id: 'PNID' },
              messages: [{ from, id: 'wamid.IMG', timestamp: '1700000001', type: 'image', image: { id: 'MEDIA_ID', mime_type: 'image/jpeg' } }],
            },
          },
        ],
      },
    ],
  };
}

function waStatusPayload() {
  return {
    object: 'whatsapp_business_account',
    entry: [
      {
        id: 'WABA_ID',
        changes: [
          {
            field: 'messages',
            value: {
              messaging_product: 'whatsapp',
              metadata: { display_phone_number: '15550001111', phone_number_id: 'PNID' },
              statuses: [{ id: 'wamid.TEST', status: 'delivered', timestamp: '1700000002' }],
            },
          },
        ],
      },
    ],
  };
}

async function postJson(handler, body) {
  const raw = JSON.stringify(body);
  return handler(postRequest(raw, signature(raw)));
}

test('whatsapp: persists a text message as a new conversation and inbound message', async () => {
  const mock = createMockSupabase();
  const { handler } = loadHandler('whatsapp', DB_ENV, mock.module);
  const response = await postJson(handler, waTextPayload('15551234567', 'Merhaba'));

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { received: true });
  assert.equal(mock.messages.length, 1);
  assert.equal(mock.messages[0].business_id, 'business-1');
  assert.equal(mock.messages[0].conversation_id, 'conv-1');
  assert.equal(mock.messages[0].direction, 'inbound');
  assert.equal(mock.messages[0].content, 'Merhaba');
  assert.equal(mock.conversations.size, 1);
  assert.equal(mock.conversations.get('business-1|whatsapp|15551234567'), 'conv-1');
});

test('whatsapp: a second message from the same sender reuses the same conversation', async () => {
  const mock = createMockSupabase();
  const { handler } = loadHandler('whatsapp', DB_ENV, mock.module);

  await postJson(handler, waTextPayload('15551234567', 'Merhaba'));
  await postJson(handler, waTextPayload('15551234567', 'Nasılsınız?'));

  assert.equal(mock.conversations.size, 1);
  assert.equal(mock.messages.length, 2);
  assert.equal(mock.messages[0].conversation_id, mock.messages[1].conversation_id);
  assert.equal(mock.messages[1].content, 'Nasılsınız?');
});

test('whatsapp: a different sender gets its own conversation', async () => {
  const mock = createMockSupabase();
  const { handler } = loadHandler('whatsapp', DB_ENV, mock.module);

  await postJson(handler, waTextPayload('15551234567', 'Merhaba'));
  await postJson(handler, waTextPayload('15559876543', 'Selam'));

  assert.equal(mock.conversations.size, 2);
  assert.equal(mock.messages.length, 2);
  assert.notEqual(mock.messages[0].conversation_id, mock.messages[1].conversation_id);
});

test('whatsapp: a non-text message is stored as JSON', async () => {
  const mock = createMockSupabase();
  const { handler } = loadHandler('whatsapp', DB_ENV, mock.module);
  await postJson(handler, waImagePayload('15551234567'));

  assert.equal(mock.messages.length, 1);
  const stored = JSON.parse(mock.messages[0].content);
  assert.equal(stored.type, 'image');
  assert.equal(stored.image.id, 'MEDIA_ID');
});

test('whatsapp: a status-only payload (no messages) persists nothing but still acknowledges', async () => {
  const mock = createMockSupabase();
  const { handler } = loadHandler('whatsapp', DB_ENV, mock.module);
  const response = await postJson(handler, waStatusPayload());

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { received: true });
  assert.equal(mock.messages.length, 0);
  assert.equal(mock.conversations.size, 0);
});

test('whatsapp: without SUPABASE_URL/KALI_BUSINESS_ID configured, persistence is skipped but the request still succeeds', async () => {
  const { handler } = loadHandler('whatsapp');
  const response = await postJson(handler, waTextPayload('15551234567', 'Merhaba'));

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { received: true });
});

test('whatsapp: a conversation lookup failure still returns 200 and logs the error (Meta retry avoidance)', async () => {
  const mock = createMockSupabase({ failSelect: true });
  const { handler, errors } = loadHandler('whatsapp', DB_ENV, mock.module);
  const response = await postJson(handler, waTextPayload('15551234567', 'Merhaba'));

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { received: true });
  assert.equal(mock.messages.length, 0);
  assert.equal(errors.length, 1);
});

test('whatsapp: a message insert failure still returns 200 and logs the error', async () => {
  const mock = createMockSupabase({ failInsertMessage: true });
  const { handler, errors } = loadHandler('whatsapp', DB_ENV, mock.module);
  const response = await postJson(handler, waTextPayload('15551234567', 'Merhaba'));

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { received: true });
  assert.equal(mock.messages.length, 0);
  assert.equal(errors.length, 1);
});

test('whatsapp: an inbound message gets a stored draft reply and a model_routing_log row', async () => {
  const mock = createMockSupabase();
  const { handler } = loadHandler('whatsapp', DB_ENV_WITH_ANTHROPIC, mock.module, anthropicFetch());
  const response = await postJson(handler, waTextPayload('15551234567', 'Fiyatlarınız nedir?'));

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

test('whatsapp: a reply-generation failure still returns 200, is logged, and no draft is stored', async () => {
  const mock = createMockSupabase();
  const { handler, errors } = loadHandler('whatsapp', DB_ENV_WITH_ANTHROPIC, mock.module, failingAnthropicFetch());
  const response = await postJson(handler, waTextPayload('15551234567', 'Fiyatlarınız nedir?'));

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { received: true });
  assert.equal(mock.messages.length, 1);
  assert.equal(mock.messages[0].direction, 'inbound');
  assert.equal(mock.modelRoutingLogs.length, 0);
  assert.equal(errors.length, 1);
});

test('whatsapp: without ANTHROPIC_API_KEY configured, the inbound message still persists and no draft is generated', async () => {
  const mock = createMockSupabase();
  const { handler } = loadHandler('whatsapp', DB_ENV, mock.module);
  const response = await postJson(handler, waTextPayload('15551234567', 'Fiyatlarınız nedir?'));

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

test('whatsapp: a clear qualified+booking message creates one lead and one pending appointment', async () => {
  const mock = createMockSupabase();
  const { handler } = loadHandler('whatsapp', DB_ENV, mock.module);
  const response = await postJson(
    handler,
    waTextPayload('15551234567', "Test Hizmeti için randevu almak istiyorum, yarın saat 15:00'te gelebilir miyim?"),
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

test('whatsapp: a plain greeting creates no lead and no appointment', async () => {
  const mock = createMockSupabase();
  const { handler } = loadHandler('whatsapp', DB_ENV, mock.module);
  const response = await postJson(handler, waTextPayload('15551234567', 'Merhaba'));

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { received: true });
  assert.equal(mock.leads.length, 0);
  assert.equal(mock.appointments.length, 0);
});

test('whatsapp: a lead/booking-step failure still returns 200, is logged, and does not affect inbound/reply persistence', async () => {
  const mock = createMockSupabase({ failLeadSelect: true });
  const { handler, errors } = loadHandler('whatsapp', DB_ENV_WITH_ANTHROPIC, mock.module, anthropicFetch());
  const response = await postJson(
    handler,
    waTextPayload('15551234567', "Test Hizmeti için randevu almak istiyorum, yarın saat 15:00'te gelebilir miyim?"),
  );

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { received: true });
  assert.equal(mock.messages.length, 2, 'inbound + drafted reply are unaffected by the lead/booking failure');
  assert.equal(mock.leads.length, 0);
  assert.equal(mock.appointments.length, 0);
  assert.equal(errors.length, 1);
  assert.match(errors[0][0], /failed to process lead\/booking/);
});
