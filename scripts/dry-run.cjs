#!/usr/bin/env node
// End-to-end dry run: sends every fixture in tests/fixtures/ through the
// real webhook code (signature check, rate limiting, persistence, model
// routing, reply generation) with a mock database and a fake AI response --
// no network, no real Anthropic key, no Supabase project needed. Reuses the
// same test harness the real test suite uses (tests/helpers/webhook-suite.cjs)
// so this reflects actual behavior, not a re-guess of it.

const fs = require('fs');
const path = require('path');
const {
  loadHandler,
  postRequest,
  createMockSupabase,
  loadReplyAgentModule,
  DEFAULT_BUSINESS_CONFIG,
} = require('../tests/helpers/webhook-suite.cjs');

const FIXTURES_DIR = path.join(__dirname, '..', 'tests', 'fixtures');
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

function channelFor(fileName) {
  if (fileName.startsWith('whatsapp-')) return 'whatsapp';
  if (fileName.startsWith('instagram-')) return 'instagram';
  return null;
}

const ENV = {
  SUPABASE_URL: 'https://dryrun.test.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'dry-run-not-a-real-key',
  KALI_BUSINESS_ID: 'dry-run-business',
  ANTHROPIC_API_KEY: 'dry-run-not-a-real-key',
};

let hadFailure = false; // set to true if any fixture run fails or returns unexpected status

function line() {
  console.log('-'.repeat(70));
}

async function runFixture(fileName) {
  const channel = channelFor(fileName);
  if (!channel) throw new Error(`Bilinmeyen fixture kanalı: ${fileName}`);
  const filePath = path.join(FIXTURES_DIR, fileName);
  const body = fs.readFileSync(filePath, 'utf8');

  console.log(`\n=== ${fileName} (${channel}) ===`);

  if (fileName.startsWith('whatsapp-booking-')) {
    const catalog = JSON.parse(fs.readFileSync(path.join(__dirname, '../tests/scenarios/booking-cases.json'), 'utf8'));
    const scenario = catalog.cases.find((entry) => `whatsapp-booking-${entry.id}.json` === fileName);
    if (!scenario) throw new Error('Fixture randevu kataloğuna bağlı değil.');
    console.log(`Test saati: ${scenario.clock ?? catalog.clock} (${catalog.timezone}); test düzeneğinde bu saati sabitleyin.`);
    console.log(`Ön koşul: ${scenario.given}`);
    console.log(`Beklenen davranış (kabul motoru henüz yok): ${scenario.expect}`);
  }

  const mock = createMockSupabase();
  const { handler } = loadHandler(channel, ENV, mock.module, fakeAnthropicFetch());

  let response;
  try {
    response = await handler(postRequest(body));
  } catch (err) {
    console.error(`Handler execution failed for ${fileName}: ${err.message}`);
    hadFailure = true;
    return;
  }

  const responseBody = await response.text();

  console.log(`Webhook yanıtı: HTTP ${response.status} — ${responseBody}`);

  // Treat non-2xx responses as failures for the dry-run
  if (response.status < 200 || response.status >= 300) {
    console.error(`Beklenmeyen HTTP durumu: ${response.status} for ${fileName}`);
    hadFailure = true;
  }

  const inbound = mock.messages.filter((m) => m.direction === 'inbound');
  const outbound = mock.messages.filter((m) => m.direction === 'outbound');

  if (inbound.length === 0) {
    console.log('Kaydedilen mesaj yok (ör. sadece "okundu" bildirimi gibi bir durum olabilir).');
    if (!fileName.includes('read-receipt')) hadFailure = true;
    return;
  }

  for (const msg of inbound) {
    console.log(`\nGelen mesaj: "${msg.content}"`);

    const routingEntry = mock.modelRoutingLogs.find((r) => r.message_id === msg.id);
    if (routingEntry) {
      // Recompute the routing decision on the exact same content, purely to
      // surface the human-readable "reason" (console.log-only in the real
      // code, not stored in the DB) -- same pure function, same input, same
      // result the webhook already used internally.
      const { classifyComplexity } = loadReplyAgentModule();
      const decision = classifyComplexity(msg.content, DEFAULT_BUSINESS_CONFIG);
      console.log(`Yönlendirme kararı: ${routingEntry.model} (${decision.modelKey === 'haiku' ? 'ucuz/hızlı model' : 'güçlü model'})`);
      console.log(`Neden: ${decision.reason}`);
    } else {
      console.log('Yönlendirme kaydı yok (yapay zeka cevabı üretilemedi).');
      hadFailure = true;
    }

    const reply = outbound.find((o) => o.conversation_id === msg.conversation_id);
    console.log(reply ? `Hazırlanan taslak cevap: "${reply.content}"` : 'Taslak cevap oluşturulmadı.');
    if (!reply) hadFailure = true;
  }
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 1 && args[0] === '--all') {
    process.exitCode = await require('./run-scenarios.cjs').runAll();
    return;
  }
  let files = fs.readdirSync(FIXTURES_DIR).filter((f) => f.endsWith('.json'));
  if (args.length) {
    if (args.length !== 2 || args[0] !== '--fixture' || !files.includes(args[1])) {
      console.error('Kullanım: node scripts/dry-run.cjs [--all | --fixture DOSYA.json]');
      process.exitCode = 2;
      return;
    }
    files = [args[1]];
  }
  if (files.length === 0) {
    console.error('tests/fixtures altında hiç örnek dosya bulunamadı.');
    process.exitCode = 1;
    return;
  }

  console.log('KURU DENEME — gerçek internet bağlantısı veya gerçek anahtar kullanılmıyor.');
  console.log(`${files.length} örnek dosya denenecek.\n`);
  line();

  for (const file of files.sort()) {
    try {
      await runFixture(file);
    } catch (error) {
      console.log(`\n=== ${file} ===`);
      console.log(`HATA: ${error.message}`);
      hadFailure = true;
    }
    line();
  }

  if (hadFailure) {
    console.error('\nBir veya daha fazla örnek dosyada hata veya beklenmeyen HTTP durumu tespit edildi.');
    process.exitCode = 1;
  }

  console.log('\nBitti. Bu araç gerçek bir yapay zeka cevabı üretmez (yukarıdaki cevaplar sahte metindir);');
  console.log('sadece mesajın doğru işlendiğini, doğru modele yönlendirildiğini ve bir taslağın');
  console.log('kaydedildiğini gösterir. Gerçek cevap kalitesini görmek için gerçek bir Anthropic');
  console.log('anahtarıyla docs/TEST_SENARYOLARI.md planını uygulayın.');
}

main().catch((error) => { console.error(error.message); process.exitCode = 1; });
