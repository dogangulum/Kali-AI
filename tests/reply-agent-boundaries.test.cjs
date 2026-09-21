// Pure routing and text-formatting checks only: no provider, DB or credentials.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadReplyAgentModule } = require('./helpers/webhook-suite.cjs');

for (const [length, modelKey] of [[220, 'haiku'], [221, 'sonnet']]) {
  test(`routing: ${length}-character boundary uses ${modelKey}`, () => {
    const { classifyComplexity } = loadReplyAgentModule();
    assert.equal(classifyComplexity('fiyat ' + 'a'.repeat(length - 6), {}).modelKey, modelKey);
  });
}

test('routing: two questions override simple vocabulary', () => {
  const result = loadReplyAgentModule().classifyComplexity('Fiyat ne? Adres nerede?', {});
  assert.equal(result.modelKey, 'sonnet');
  assert.equal(result.reason, 'multiple-questions');
});

test('routing: objection wins over simple vocabulary and long-message rules', () => {
  const result = loadReplyAgentModule().classifyComplexity('Fiyat pahalı. ' + 'a'.repeat(250), {});
  assert.equal(result.modelKey, 'sonnet');
  assert.equal(result.reason, 'complex-signal-keyword');
});

test('routing: service name alone is sufficient (no generic price keywords)', () => {
  const result = loadReplyAgentModule().classifyComplexity('ORNEK BAKIM', { services: [{ name: 'Ornek Bakım' }] });
  assert.equal(result.modelKey, 'haiku');
});

test('routing: missing config and empty input default to the stronger model', () => {
  const { classifyComplexity } = loadReplyAgentModule();
  for (const config of [null, undefined, {}]) {
    assert.equal(classifyComplexity('', config).modelKey, 'sonnet');
    assert.equal(classifyComplexity('price?', config).modelKey, 'haiku');
  }
});

test('routing: English refund takes priority over price', () => {
  assert.equal(loadReplyAgentModule().classifyComplexity('Price is high, I want a refund', {}).modelKey, 'sonnet');
});

test('routing: Turkish uppercase service name preserves the match', () => {
  assert.equal(loadReplyAgentModule().classifyComplexity('CİLT BAKIMI', { services: [{ name: 'cilt bakımı' }] }).modelKey, 'haiku');
});

test('prompt: missing config provides language and missing-service fallback', () => {
  const { buildSystemPrompt } = loadReplyAgentModule();
  for (const config of [null, undefined, {}]) {
    const prompt = buildSystemPrompt(config);
    assert.match(prompt, /tr-TR/);
    assert.match(prompt, /Hizmet\/fiyat listesi henüz tanımlanmamış/);
    assert.doesNotMatch(prompt, /undefined|null/);
  }
});

test('prompt: zero price is not confused with absent price', () => {
  const prompt = loadReplyAgentModule().buildSystemPrompt({ currency: 'TRY', services: [
    { name: 'Örnek A', price: { amount: 0 }, duration_minutes: 15, description: 'Örnek açıklama' },
    { name: 'Örnek B' }, { name: 'Pasif', active: false },
  ] });
  assert.match(prompt, /Örnek A: 0 TRY \(15 dk\) — Örnek açıklama/);
  assert.match(prompt, /Örnek B: fiyat belirtilmemiş/);
  assert.doesNotMatch(prompt, /Pasif/);
});

test('prompt: closed days and split shifts remain distinguishable', () => {
  const prompt = loadReplyAgentModule().buildSystemPrompt({ working_hours: {
    monday: [{ opens: '09:00', closes: '12:00' }, { opens: '13:00', closes: '18:00' }], sunday: [],
  } });
  assert.match(prompt, /monday: 09:00-12:00, 13:00-18:00/);
  assert.match(prompt, /sunday: kapalı/);
});

test('prompt: all style fields and guidelines are retained', () => {
  const prompt = loadReplyAgentModule().buildSystemPrompt({ language: 'en-US', conversation_style: {
    tone: 'friendly', address_form: 'siz', response_length: 'iki cümle', emoji_usage: 'yok',
    greeting: 'Örnek selamlama', guidelines: ['Kural A', 'Kural B'],
  } });
  for (const text of ['en-US', 'friendly', 'siz', 'iki cümle', 'yok', 'Örnek selamlama', 'Kural A', 'Kural B']) {
    assert.ok(prompt.includes(text), text);
  }
});

test('user turn: summary precedes new message and is omitted when absent', () => {
  const { buildUserTurn } = loadReplyAgentModule();
  const turn = buildUserTurn('Önceki talep', 'Yeni soru');
  assert.ok(turn.indexOf('Önceki talep') < turn.indexOf('Yeni soru'));
  assert.match(turn, /Müşterinin yeni mesajı: Yeni soru/);
  assert.doesNotMatch(buildUserTurn(null, 'Yeni soru'), /Önceki konuşma özeti/);
});

test('cost: uses configured arithmetic and six-decimal rounding, not verified provider prices', () => {
  const { computeCostUsd } = loadReplyAgentModule();
  assert.equal(computeCostUsd('claude-haiku-4-5', 1000, 200), 0.002);
  assert.equal(computeCostUsd('claude-sonnet-5', 1000, 200), 0.004);
  assert.equal(computeCostUsd('claude-haiku-4-5', 0, 0), 0);
  assert.equal(computeCostUsd('unknown-model', 1000, 1000), 0);
});
