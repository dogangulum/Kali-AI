#!/usr/bin/env node
// Local-only test client: sends a fake, signed webhook request to a webhook
// handler running on your machine (via `deno task dev` / `deno run`, per
// README.md section "Yerelde çalıştırma"). Never touches real secrets, Meta,
// or Supabase -- the values below match the fake test values README.md's
// local run instructions already tell you to set.

const crypto = require('crypto');

const TEST_SECRET = 'local-only-test-secret';
const LOCAL_URL = 'http://localhost:8000/';

function sign(body, secret = TEST_SECRET) {
  return `sha256=${crypto.createHmac('sha256', secret).update(body, 'utf8').digest('hex')}`;
}

function usage() {
  console.log(`Kullanım:
  node scripts/simulate-webhook.cjs <fixture-dosyasi.json> [--bad-signature]

Örnekler:
  node scripts/simulate-webhook.cjs tests/fixtures/whatsapp-text-message.json
  node scripts/simulate-webhook.cjs tests/fixtures/instagram-text-message.json --bad-signature

Önce ayrı bir terminalde webhook'u başlatın (README.md, "Yerelde çalıştırma" bölümü):
  $env:META_WHATSAPP_VERIFY_TOKEN = "local-whatsapp-test"
  $env:META_INSTAGRAM_VERIFY_TOKEN = "local-instagram-test"
  $env:META_APP_SECRET = "local-only-test-secret"
  deno run --allow-net --allow-env=META_WHATSAPP_VERIFY_TOKEN,META_APP_SECRET supabase/functions/whatsapp-webhook/index.ts

Bu araç sadece localhost:8000'e sahte, imzalı bir istek gönderir. Gerçek
Meta veya Supabase'e hiçbir şekilde bağlanmaz; .env.local okunmaz.`);
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    usage();
    process.exit(args.length === 0 ? 1 : 0);
  }

  const fixturePath = args.find((a) => !a.startsWith('--'));
  const badSignature = args.includes('--bad-signature');

  if (!fixturePath) {
    console.error('HATA: bir fixture dosyası belirtmelisiniz.');
    usage();
    process.exit(1);
  }

  const fs = require('fs');
  const path = require('path');
  const resolved = path.resolve(fixturePath);
  if (!fs.existsSync(resolved)) {
    console.error(`HATA: dosya bulunamadı: ${resolved}`);
    process.exit(1);
  }

  const body = fs.readFileSync(resolved, 'utf8');
  const signature = badSignature
    ? sign(body, 'wrong-secret-on-purpose')
    : sign(body);

  console.log(`POST ${LOCAL_URL}`);
  console.log(`Fixture: ${fixturePath}`);
  console.log(`İmza durumu: ${badSignature ? 'BOZUK (kasıtlı, 401 beklenir)' : 'GEÇERLİ'}\n`);

  try {
    const response = await fetch(LOCAL_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Hub-Signature-256': signature,
        'x-forwarded-for': '203.0.113.1',
      },
      body,
    });
    const text = await response.text();
    console.log(`HTTP ${response.status}`);
    console.log(text);
  } catch (error) {
    console.error(`Bağlantı hatası: ${error.message}`);
    console.error('Webhook yerelde çalışıyor mu? (yukarıdaki "deno run" komutunu ayrı terminalde çalıştırın)');
    process.exit(1);
  }
}

main();
