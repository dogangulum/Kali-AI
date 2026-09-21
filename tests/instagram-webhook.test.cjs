const { test } = require('node:test');
const assert = require('node:assert/strict');
const { registerWebhookTests, loadHandler, postRequest, signature, createMockSupabase } = require('./helpers/webhook-suite.cjs');

registerWebhookTests('instagram');

const DB_ENV = {
  SUPABASE_URL: 'https://project.test.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'test-only-service-role-key',
  KALI_BUSINESS_ID: 'business-1',
};

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
