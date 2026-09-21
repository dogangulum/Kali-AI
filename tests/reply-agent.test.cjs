// Unit tests for supabase/functions/_shared/reply-agent.ts -- loaded and
// evaluated directly (see loadReplyAgentModule in tests/helpers/webhook-suite.cjs),
// independent of any webhook payload. Covers model routing, system-prompt
// construction from business_config, the rolling summary fold, and the
// generateAndStoreReply orchestrator (storage only -- no network, no real
// Anthropic key, no real Postgres).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadReplyAgentModule, createMockSupabase, DEFAULT_BUSINESS_CONFIG } = require('./helpers/webhook-suite.cjs');

function jsonResponse(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  };
}

function canonicalAnthropicResponse(text = 'Merhaba, size nasıl yardımcı olabilirim?') {
  return jsonResponse(200, {
    content: [{ type: 'text', text }],
    usage: { input_tokens: 120, output_tokens: 40 },
  });
}

// --- classifyComplexity -----------------------------------------------------

test('reply-agent: a price/hours-style message routes to haiku', () => {
  const { classifyComplexity } = loadReplyAgentModule();
  const result = classifyComplexity('Fiyatlarınız nedir, kaç TL?', DEFAULT_BUSINESS_CONFIG);
  assert.equal(result.modelKey, 'haiku');
  assert.equal(result.modelId, 'claude-haiku-4-5');
});

test('reply-agent: an objection/persuasion message routes to sonnet', () => {
  const { classifyComplexity } = loadReplyAgentModule();
  const result = classifyComplexity(
    'Randevu almak istiyorum ama biraz pahalı geldi, düşünmem lazım, indirim yapar mısınız?',
    DEFAULT_BUSINESS_CONFIG,
  );
  assert.equal(result.modelKey, 'sonnet');
  assert.equal(result.modelId, 'claude-sonnet-5');
  assert.equal(result.reason, 'complex-signal-keyword');
});

test('reply-agent: a message naming one of the business\'s own services routes to haiku', () => {
  const { classifyComplexity } = loadReplyAgentModule();
  const result = classifyComplexity('Test Hizmeti ne kadar sürüyor?', DEFAULT_BUSINESS_CONFIG);
  assert.equal(result.modelKey, 'haiku');
  assert.equal(result.reason, 'matched-simple-vocabulary');
});

test('reply-agent: an ambiguous message with no keyword match defaults to sonnet', () => {
  const { classifyComplexity } = loadReplyAgentModule();
  const result = classifyComplexity('merhaba', DEFAULT_BUSINESS_CONFIG);
  assert.equal(result.modelKey, 'sonnet');
  assert.equal(result.reason, 'default-uncertain');
});

test('reply-agent: a long message routes to sonnet regardless of vocabulary', () => {
  const { classifyComplexity } = loadReplyAgentModule();
  const longMessage = `Fiyat sormak istiyorum. ${'a'.repeat(250)}`;
  const result = classifyComplexity(longMessage, DEFAULT_BUSINESS_CONFIG);
  assert.equal(result.modelKey, 'sonnet');
  assert.equal(result.reason, 'long-message');
});

// --- buildSystemPrompt -------------------------------------------------------

test('reply-agent: business_config values appear verbatim in the system prompt', () => {
  const { buildSystemPrompt } = loadReplyAgentModule();
  const prompt = buildSystemPrompt(DEFAULT_BUSINESS_CONFIG);
  assert.match(prompt, /Test Hizmeti/);
  assert.match(prompt, /500 TRY/);
  assert.match(prompt, /Sıcak ve profesyonel/);
  assert.match(prompt, /09:00-18:00/);
  assert.match(prompt, /Yalnızca listelenen hizmetleri öner\./);
});

test('reply-agent: a different config produces a different prompt (nothing hardcoded)', () => {
  const { buildSystemPrompt } = loadReplyAgentModule();
  const otherConfig = {
    language: 'en-US',
    currency: 'USD',
    services: [{ name: 'Distinctive Service Name', price: { amount: 77 }, active: true }],
    conversation_style: { tone: 'Playful and casual' },
  };
  const prompt = buildSystemPrompt(otherConfig);
  assert.match(prompt, /Distinctive Service Name/);
  assert.match(prompt, /77 USD/);
  assert.match(prompt, /Playful and casual/);
  assert.doesNotMatch(prompt, /Test Hizmeti/);
});

test('reply-agent: inactive services are omitted from the prompt', () => {
  const { buildSystemPrompt } = loadReplyAgentModule();
  const config = {
    services: [{ name: 'Görünmez Hizmet', price: { amount: 1 }, active: false }],
  };
  const prompt = buildSystemPrompt(config);
  assert.doesNotMatch(prompt, /Görünmez Hizmet/);
});

// --- foldConversationSummary --------------------------------------------------

test('reply-agent: a short exchange is kept as plain concatenation, no API call', async () => {
  const { foldConversationSummary } = loadReplyAgentModule();
  let calls = 0;
  const fetchImpl = async () => { calls += 1; return canonicalAnthropicResponse(); };
  const summary = await foldConversationSummary({
    existingSummary: null,
    inboundContent: 'Merhaba',
    outboundContent: 'Merhaba, size nasıl yardımcı olabilirim?',
    apiKey: 'test-key',
    fetchImpl,
  });
  assert.equal(calls, 0);
  assert.match(summary, /Merhaba/);
});

test('reply-agent: a summary that grows past the threshold is compressed via a model call', async () => {
  const { foldConversationSummary } = loadReplyAgentModule();
  let calls = 0;
  const fetchImpl = async () => {
    calls += 1;
    return canonicalAnthropicResponse('Kısa özet: müşteri fiyat ve randevu bilgisi istedi.');
  };
  const summary = await foldConversationSummary({
    existingSummary: 'x'.repeat(1300),
    inboundContent: 'Merhaba',
    outboundContent: 'Merhaba, size nasıl yardımcı olabilirim?',
    apiKey: 'test-key',
    fetchImpl,
  });
  assert.equal(calls, 1);
  assert.equal(summary, 'Kısa özet: müşteri fiyat ve randevu bilgisi istedi.');
});

test('reply-agent: a compression failure falls back to truncation instead of throwing', async () => {
  const { foldConversationSummary } = loadReplyAgentModule();
  const fetchImpl = async () => { throw new Error('network down'); };
  const summary = await foldConversationSummary({
    existingSummary: 'x'.repeat(1300),
    inboundContent: 'Merhaba',
    outboundContent: 'Merhaba, size nasıl yardımcı olabilirim?',
    apiKey: 'test-key',
    fetchImpl,
  });
  assert.equal(typeof summary, 'string');
  assert.ok(summary.length <= 1200);
});

// --- generateAndStoreReply ----------------------------------------------------

test('reply-agent: stores an outbound message and a model_routing_log row on success', async () => {
  const { generateAndStoreReply } = loadReplyAgentModule();
  const mock = createMockSupabase();
  const fetchImpl = async () => canonicalAnthropicResponse('Merhaba! Size nasıl yardımcı olabilirim?');

  // Seed a conversation the way findOrCreateConversation would.
  await mock.module.createClient().from('conversations').insert({
    business_id: 'business-1', platform: 'whatsapp', customer_identifier: '15551234567',
  }).single();
  const conversationId = [...mock.conversationRecords.keys()][0];

  await generateAndStoreReply({
    supabase: mock.module.createClient(),
    businessId: 'business-1',
    conversationId,
    inboundMessageId: 'msg-inbound-1',
    inboundContent: 'Fiyatlarınız nedir?',
    anthropicApiKey: 'test-key',
    fetchImpl,
  });

  assert.equal(mock.messages.length, 1);
  assert.equal(mock.messages[0].direction, 'outbound');
  assert.equal(mock.messages[0].content, 'Merhaba! Size nasıl yardımcı olabilirim?');
  assert.equal(mock.messages[0].conversation_id, conversationId);

  assert.equal(mock.modelRoutingLogs.length, 1);
  assert.equal(mock.modelRoutingLogs[0].business_id, 'business-1');
  assert.equal(mock.modelRoutingLogs[0].message_id, 'msg-inbound-1');
  assert.equal(mock.modelRoutingLogs[0].provider, 'anthropic');
  assert.equal(mock.modelRoutingLogs[0].model, 'claude-haiku-4-5');
  assert.equal(typeof mock.modelRoutingLogs[0].cost_usd, 'number');
  assert.equal(typeof mock.modelRoutingLogs[0].latency_ms, 'number');

  assert.equal(mock.conversationRecords.get(conversationId).summary, `Müşteri: Fiyatlarınız nedir?\nİşletme: Merhaba! Size nasıl yardımcı olabilirim?`);
});

test('reply-agent: missing ANTHROPIC_API_KEY skips generation without throwing', async () => {
  const { generateAndStoreReply, errors } = loadReplyAgentModule();
  const mock = createMockSupabase();

  await generateAndStoreReply({
    supabase: mock.module.createClient(),
    businessId: 'business-1',
    conversationId: 'conv-x',
    inboundMessageId: 'msg-1',
    inboundContent: 'Fiyatlarınız nedir?',
    anthropicApiKey: undefined,
    fetchImpl: async () => { throw new Error('fetch should not be called'); },
  });

  assert.equal(mock.messages.length, 0);
  assert.equal(mock.modelRoutingLogs.length, 0);
  assert.equal(errors.length, 1);
});

test('reply-agent: missing business_config row skips generation without throwing', async () => {
  const { generateAndStoreReply, errors } = loadReplyAgentModule();
  const mock = createMockSupabase({ businessConfig: null });

  await generateAndStoreReply({
    supabase: mock.module.createClient(),
    businessId: 'business-1',
    conversationId: 'conv-x',
    inboundMessageId: 'msg-1',
    inboundContent: 'Fiyatlarınız nedir?',
    anthropicApiKey: 'test-key',
    fetchImpl: async () => { throw new Error('fetch should not be called'); },
  });

  assert.equal(mock.messages.length, 0);
  assert.equal(errors.length, 1);
});

test('reply-agent: a model_routing_log insert failure still stores the outbound reply', async () => {
  const { generateAndStoreReply, errors } = loadReplyAgentModule();
  const mock = createMockSupabase({ failInsertRoutingLog: true });
  const fetchImpl = async () => canonicalAnthropicResponse('Yanıt taslağı');

  await mock.module.createClient().from('conversations').insert({
    business_id: 'business-1', platform: 'whatsapp', customer_identifier: '15551234567',
  }).single();
  const conversationId = [...mock.conversationRecords.keys()][0];

  await generateAndStoreReply({
    supabase: mock.module.createClient(),
    businessId: 'business-1',
    conversationId,
    inboundMessageId: 'msg-1',
    inboundContent: 'Fiyatlarınız nedir?',
    anthropicApiKey: 'test-key',
    fetchImpl,
  });

  assert.equal(mock.messages.length, 1);
  assert.equal(mock.messages[0].content, 'Yanıt taslağı');
  assert.equal(mock.modelRoutingLogs.length, 0);
  assert.equal(errors.length, 1);
});

test('reply-agent: an Anthropic API failure throws (caller is responsible for the 200-response guarantee)', async () => {
  const { generateAndStoreReply } = loadReplyAgentModule();
  const mock = createMockSupabase();
  const fetchImpl = async () => jsonResponse(500, { error: 'server error' });

  await mock.module.createClient().from('conversations').insert({
    business_id: 'business-1', platform: 'whatsapp', customer_identifier: '15551234567',
  }).single();
  const conversationId = [...mock.conversationRecords.keys()][0];

  await assert.rejects(() =>
    generateAndStoreReply({
      supabase: mock.module.createClient(),
      businessId: 'business-1',
      conversationId,
      inboundMessageId: 'msg-1',
      inboundContent: 'Fiyatlarınız nedir?',
      anthropicApiKey: 'test-key',
      fetchImpl,
    }),
  );
  assert.equal(mock.messages.length, 0);
});
