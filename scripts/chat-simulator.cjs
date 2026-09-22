#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const {
  loadHandler,
  createMockSupabase,
  loadReplyAgentModule,
  DEFAULT_BUSINESS_CONFIG,
  postRequest,
} = require('../tests/helpers/webhook-suite.cjs');

const FAKE_REPLY_TEXT = '[SAHTE YAPAY ZEKA CEVABI] Merhaba! Size nasıl yardımcı olabilirim?';

function fakeAnthropicFetch() {
  return async () => ({
    ok: true,
    status: 200,
    json: async () => ({
      content: [{ type: 'text', text: FAKE_REPLY_TEXT }],
      usage: { input_tokens: 120, output_tokens: 24 },
    }),
    text: async () => '',
  });
}

const ENV = {
  SUPABASE_URL: 'https://chat-sim.test.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'sim-not-a-real-key',
  KALI_BUSINESS_ID: 'chat-sim-business',
  ANTHROPIC_API_KEY: 'sim-not-a-real-key',
};

let conversationId = null;
let messageCount = 0;
let mock;
let handler;
function resetConversation() {
  conversationId = null;
  messageCount = 0;
  mock = createMockSupabase();
  ({ handler } = loadHandler('whatsapp', ENV, mock.module, fakeAnthropicFetch()));
}
resetConversation();
const { classifyComplexity } = loadReplyAgentModule();

// Topic categories based on routing logic
const TOPIC_PATTERNS = {
  'lead/appointment': [
    /randevu/i,
    /gelecek/i,
    /saat/i,
    /tarih/i,
    /uygun mu/i,
    /rezervasyon/i,
    /book/i,
    /appointment/i,
  ],
  'content/ad': [
    /[şs]iir/i,
    /hikaye/i,
    /reklam/i,
    /içerik/i,
    /post/i,
    /story/i,
    /caption/i,
    /creative/i,
    /yaz[iı]/i,
  ],
  'pricing/info': [
    /fiyat/i,
    /[üu]cret/i,
    /ne kadar/i,
    /ka[cç] para/i,
    /price/i,
    /cost/i,
    /saat/i,
    /[cç]al[iı][şs]ma saat/i,
    /adres/i,
    /nerede/i,
    /konum/i,
  ],
  'objection/negotiation': [
    /indirim/i,
    /pahal[ıi]/i,
    /uygun de[gğ]il/i,
    /düşün[iü]r[üu]m/i,
    /emin de[gğ]il/i,
    /başka yer/i,
    /karşılaştır/i,
    /garanti/i,
    /şikayet/i,
    /iptal/i,
    /vazgeç/i,
  ],
  'human-handoff': [
    /yetkili/i,
    /insan/i,
    /canlı destek/i,
    /transfer/i,
    /agent/i,
    /representative/i,
  ],
};

function detectTopic(text) {
  const lower = text.toLowerCase();
  for (const [topic, patterns] of Object.entries(TOPIC_PATTERNS)) {
    if (patterns.some(re => re.test(lower))) {
      return topic;
    }
  }
  return 'general';
}

function getTopicLabel(topic) {
  const labels = {
    'lead/appointment': '🎯 Lead / Randevu',
    'content/ad': '📝 İçerik / Reklam',
    'pricing/info': '💰 Fiyat / Bilgi',
    'objection/negotiation': '⚠️ İtiraz / Pazarlık',
    'human-handoff': '👤 İnsan Desteği',
    'general': '💬 Genel',
  };
  return labels[topic] || '💬 Genel';
}

const QUICK_SCENARIOS = {
  '1': {
    name: 'Lead - Randevu talebi',
    messages: [
      'Merhaba',
      'El bakımı yaptırmak istiyorum',
      'Ne kadar sürer, fiyatı ne?',
      'Gelecek salı 14:00 uygun mu?',
      'Tamam, onaylıyorum',
    ],
  },
  '2': {
    name: 'Lead - Hizmet sorgulama',
    messages: [
      'Hangi hizmetleriniz var?',
      'Manikür ne kadar?',
      'Cumartesi hangi saatler açık?',
    ],
  },
  '3': {
    name: 'İtiraz / Fiyat pazarlığı',
    messages: [
      'Merhaba',
      'Biraz pahalı geldi',
      'Başka yerde daha ucuz',
      '%20 indirim yapabilir misiniz?',
    ],
  },
  '4': {
    name: 'İnsan desteği aktarımı',
    messages: [
      'Merhaba',
      'Bir yetkiliyle konuşmak istiyorum',
      'Geçen sefer memnun kalmadım',
    ],
  },
  '5': {
    name: 'İçerik / Reklam konusu (off-topic)',
    messages: [
      'Bana bir şiir yaz',
      'Instagram için caption önerisi verir misin?',
      'Reklam metni yazabilir misin?',
    ],
  },
  '6': {
    name: 'Karma senaryo (TEST_SENARYOLARI.md\'den)',
    messages: [
      'El bakımı yaptırmak istiyorum.',
      'Ne kadar sürüyor, fiyatı ne?',
      'Biraz pahalı geldi.',
      'İlk defa geleceğim, emin olamadım.',
      'O zaman gelecek salı 14.00 olur mu?',
      '14.00 değil, 15.00 olsun.',
      'Tamam, onaylıyorum.',
      'Randevum ne zamandı?',
      'İptal etmek istiyorum.',
    ],
  },
};

function printHeader() {
  console.log('\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║         KALI AI — ETKİLEŞİMLİ SOHBET SİMÜLATÖRÜ            ║');
  console.log('╠══════════════════════════════════════════════════════════════╣');
  console.log('║  Gerçek internet/API anahtarı KULLANMIYOR.                 ║');
  console.log('║  Gerçek yönlendirme mantığı (classifyComplexity) çalışır.  ║');
  console.log('║  Çıkmak için: "quit" veya Ctrl+C                           ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');
}

function printQuickScenarios() {
  console.log('\n📋 HAZIR SENARYOLAR (sayı girip Enter):');
  for (const [key, scenario] of Object.entries(QUICK_SCENARIOS)) {
    console.log(`  ${key}) ${scenario.name} (${scenario.messages.length} mesaj)`);
  }
  console.log('  f) Fixture dosyasından yükle');
  console.log('  all) Tüm fixture, randevu ve analiz/maliyet testlerini çalıştır');
  console.log('  q) Çıkış\n');
}

async function processMessage(userMessage) {
  const previousMessages = mock.messages.length;
  const messageBody = JSON.stringify({
    object: 'whatsapp_business_account',
    entry: [{
      id: '123456789012345',
      changes: [{
        value: {
          messaging_product: 'whatsapp',
          metadata: {
            display_phone_number: '+905551234567',
            phone_number_id: '987654321098765'
          },
          contacts: [{
            profile: { name: 'Test Müşteri' },
            wa_id: '905327654321'
          }],
          messages: [{
            from: '905327654321',
            id: `wamid.HBgLMjA1NDU2Nzg2OTAxNTYwFQIAERgQ${(++messageCount).toString(16).toUpperCase().padStart(32, '0')}`,
            timestamp: Math.floor(Date.now() / 1000).toString(),
            type: 'text',
            text: { body: userMessage }
          }]
        }
      }]
    }]
  });
  const body = postRequest(messageBody);
  const response = await handler(body);
  const responseBody = await response.text();
  if (response.status < 200 || response.status >= 300) throw new Error(`HTTP ${response.status}: ${responseBody}`);

  const newMessages = mock.messages.slice(previousMessages);
  const inbound = newMessages.filter((m) => m.direction === 'inbound');
  const outbound = newMessages.filter((m) => m.direction === 'outbound');

  const latestInbound = inbound[inbound.length - 1];
  if (!latestInbound) {
    throw new Error('Yeni gelen mesaj kaydedilemedi.');
  }

  const topic = detectTopic(userMessage);
  const routingEntry = mock.modelRoutingLogs.find((r) => r.message_id === latestInbound.id);
  if (!routingEntry) throw new Error('Yeni mesaj için yönlendirme kaydı oluşturulmadı.');
  
  if (routingEntry) {
    const decision = classifyComplexity(latestInbound.content, DEFAULT_BUSINESS_CONFIG);
    const modelLabel = decision.modelKey === 'haiku' ? '🟢 HAİKU (ucuz/hızlı)' : '🔴 SONNET (güçlü)';
    console.log(`\n  📥 Gelen: "${userMessage}"`);
    console.log(`  🏷️  Konu: ${getTopicLabel(topic)}`);
    console.log(`  🎯 Yönlendirme: ${modelLabel}`);
    console.log(`  💭 Neden: ${decision.reason}`);
  }

  const reply = outbound.find((o) => o.conversation_id === latestInbound.conversation_id);
  if (reply) {
    console.log(`  📤 Cevap: "${reply.content}"`);
  } else {
    throw new Error('Yeni mesaj için taslak oluşturulamadı.');
  }

  conversationId = latestInbound.conversation_id;
}

async function runScenario(scenarioKey) {
  const scenario = QUICK_SCENARIOS[scenarioKey];
  if (!scenario) return false;
  resetConversation();

  console.log(`\n▶ Senaryo başlatılıyor: ${scenario.name}\n`);
  console.log('─'.repeat(60));

  for (const msg of scenario.messages) {
    await processMessage(msg);
    console.log('─'.repeat(60));
  }

  console.log(`\n✓ Senaryo tamamlandı: ${scenario.name}\n`);
  return true;
}

async function loadFixture(readInput) {
  const fixturesDir = path.join(__dirname, '..', 'tests', 'fixtures');
  if (!fs.existsSync(fixturesDir)) {
    console.log('\n✗ tests/fixtures klasörü bulunamadı');
    return;
  }

  const files = fs.readdirSync(fixturesDir)
    .filter(f => f.endsWith('.json'))
    .sort();

  if (files.length === 0) {
    console.log('\n✗ Fixture dosyası bulunamadı');
    return;
  }

  console.log('\nMevcut fixture dosyaları:');
  files.forEach((f, i) => console.log(`  ${i + 1}) ${f}`));

  console.log('\nHangi fixture kullanılsın? (sayı): ');
  const input = (await readInput() || '').trim();

  const idx = parseInt(input, 10) - 1;
  if (isNaN(idx) || idx < 0 || idx >= files.length) {
    console.log('Geçersiz seçim');
    return;
  }

  console.log(`\n▶ Fixture yükleniyor: ${files[idx]}\n`);
  console.log('─'.repeat(60));

  try {
    // Shared dry-run path selects the right channel and creates the Request
    // through the existing test harness; never pass raw JSON to a handler.
    const { command } = require('./run-local-tests.cjs');
    console.log(await command(process.execPath, [path.join(__dirname, 'dry-run.cjs'), '--fixture', files[idx]]));
  } catch (err) {
    console.error(`  ⚠ Hata: ${err.message}`);
    process.exitCode = 1;
  }

  console.log('─'.repeat(60));
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 1 && args[0] === '--all') {
    process.exitCode = await require('./run-scenarios.cjs').runAll();
    return;
  }
  if (args.length === 1 && args[0] === '--quick-all') {
    printHeader();
    let failures = 0;
    for (const key of Object.keys(QUICK_SCENARIOS)) {
      try { await runScenario(key); }
      catch (error) { failures++; console.error(`${key}: ${error.message}`); }
    }
    console.log(`Hazır sohbetler: ${Object.keys(QUICK_SCENARIOS).length}, başarısız: ${failures}`);
    process.exitCode = failures ? 1 : 0;
    return;
  }
  
  // Non-interactive mode: run scenario directly
  if (args.length === 1 && QUICK_SCENARIOS[args[0]]) {
    printHeader();
    await runScenario(args[0]);
    console.log('\n👋 Görüşürüz!\n');
    return;
  }
  if (args.length) throw new Error('Kullanım: node scripts/chat-simulator.cjs [1..6 | --all | --quick-all]');

  printHeader();
  printQuickScenarios();
  // ... rest of interactive mode

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: '💬 Siz (veya senaryo no): '
  });

  let inputClosed = false;
  rl.on('close', () => { inputClosed = true; });
  const prompt = () => { if (!inputClosed) rl.prompt(); };
  prompt();

  const lines = rl[Symbol.asyncIterator]();
  for await (const input of lines) {
    const msg = input.trim();

    if (msg.toLowerCase() === 'quit' || msg.toLowerCase() === 'exit' || msg.toLowerCase() === 'q') {
      console.log('\n👋 Görüşürüz!\n');
      rl.close();
      break;
    }

    if (!msg) {
      prompt();
      continue;
    }

    // Check if it's a scenario number
    if (QUICK_SCENARIOS[msg]) {
      await runScenario(msg);
      printQuickScenarios();
      prompt();
      continue;
    }

    if (msg.toLowerCase() === 'all') {
      const code = await require('./run-scenarios.cjs').runAll();
      if (code) process.exitCode = code;
      printQuickScenarios();
      prompt();
      continue;
    }

    if (msg.toLowerCase() === 'f') {
      await loadFixture(async () => (await lines.next()).value);
      printQuickScenarios();
      prompt();
      continue;
    }

    try {
      await processMessage(msg);
    } catch (err) {
      console.error(`  ⚠ Hata: ${err.message}`);
      process.exitCode = 1;
    }

    prompt();
  }
}

main().catch(err => {
  console.error('Beklenmeyen hata:', err);
  process.exit(1);
});
