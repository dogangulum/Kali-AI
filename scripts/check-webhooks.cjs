#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

function loadEnv(filePath) {
  const env = {};
  if (!fs.existsSync(filePath)) return env;
  const content = fs.readFileSync(filePath, 'utf8');
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#')) {
      const eqIndex = trimmed.indexOf('=');
      if (eqIndex > 0) {
        const key = trimmed.slice(0, eqIndex).trim();
        const value = trimmed.slice(eqIndex + 1).trim();
        env[key] = value;
      }
    }
  }
  return env;
}

function formatTimestamp() {
  const now = new Date();
  return now.toISOString().replace('T', ' ').substring(0, 19);
}

function writeLog(logFile, entry) {
  const line = `${formatTimestamp()} | ${entry}\n`;
  fs.appendFileSync(logFile, line, 'utf8');
}

async function checkValidToken(name, url, verifyToken) {
  const testUrl = new URL(url);
  testUrl.searchParams.set('hub.mode', 'subscribe');
  testUrl.searchParams.set('hub.verify_token', verifyToken);
  testUrl.searchParams.set('hub.challenge', 'health-check-' + Date.now());

  try {
    const response = await fetch(testUrl.toString(), { method: 'GET' });
    const text = await response.text();
    if (response.status === 200 && text === testUrl.searchParams.get('hub.challenge')) {
      return { check: 'Doğru token kabul ediliyor', status: 'BAŞARILI', details: `HTTP ${response.status}, challenge doğru döndü` };
    } else {
      return { check: 'Doğru token kabul ediliyor', status: 'BAŞARISIZ', details: `HTTP ${response.status}, beklenen challenge dönmedi` };
    }
  } catch (error) {
    return { check: 'Doğru token kabul ediliyor', status: 'BAŞARISIZ', details: `Bağlantı hatası: ${error.message}` };
  }
}

async function checkInvalidTokenRejected(name, url, verifyToken) {
  const testUrl = new URL(url);
  testUrl.searchParams.set('hub.mode', 'subscribe');
  testUrl.searchParams.set('hub.verify_token', 'yanlis-token-' + Date.now());
  testUrl.searchParams.set('hub.challenge', 'should-be-rejected');

  try {
    const response = await fetch(testUrl.toString(), { method: 'GET' });
    const text = await response.text();
    if (response.status === 403) {
      return { check: 'Yanlış token reddediliyor (403)', status: 'BAŞARILI', details: `HTTP ${response.status}, doğru reddedildi` };
    } else {
      return { check: 'Yanlış token reddediliyor (403)', status: 'BAŞARISIZ', details: `HTTP ${response.status}, 403 bekleniyordu ama ${response.status} döndü` };
    }
  } catch (error) {
    return { check: 'Yanlış token reddediliyor (403)', status: 'BAŞARISIZ', details: `Bağlantı hatası: ${error.message}` };
  }
}

async function checkMissingTokenRejected(name, url) {
  const testUrl = new URL(url);
  testUrl.searchParams.set('hub.mode', 'subscribe');
  testUrl.searchParams.set('hub.challenge', 'should-be-rejected');

  try {
    const response = await fetch(testUrl.toString(), { method: 'GET' });
    if (response.status === 403) {
      return { check: 'Token eksikken reddediliyor (403)', status: 'BAŞARILI', details: `HTTP ${response.status}, doğru reddedildi` };
    } else {
      return { check: 'Token eksikken reddediliyor (403)', status: 'BAŞARISIZ', details: `HTTP ${response.status}, 403 bekleniyordu ama ${response.status} döndü` };
    }
  } catch (error) {
    return { check: 'Token eksikken reddediliyor (403)', status: 'BAŞARISIZ', details: `Bağlantı hatası: ${error.message}` };
  }
}

async function checkWrongModeRejected(name, url, verifyToken) {
  const testUrl = new URL(url);
  testUrl.searchParams.set('hub.mode', 'unsubscribe');
  testUrl.searchParams.set('hub.verify_token', verifyToken);
  testUrl.searchParams.set('hub.challenge', 'should-be-rejected');

  try {
    const response = await fetch(testUrl.toString(), { method: 'GET' });
    if (response.status === 403) {
      return { check: 'Yanlış mode reddediliyor (403)', status: 'BAŞARILI', details: `HTTP ${response.status}, doğru reddedildi` };
    } else {
      return { check: 'Yanlış mode reddediliyor (403)', status: 'BAŞARISIZ', details: `HTTP ${response.status}, 403 bekleniyordu ama ${response.status} döndü` };
    }
  } catch (error) {
    return { check: 'Yanlış mode reddediliyor (403)', status: 'BAŞARISIZ', details: `Bağlantı hatası: ${error.message}` };
  }
}

async function runChecks(name, url, verifyToken, logFile) {
  console.log(`\n=== ${name} Webhook Kontrolleri ===`);
  if (logFile) writeLog(logFile, `=== ${name} Webhook Kontrolleri ===`);

  const checks = await Promise.all([
    checkValidToken(name, url, verifyToken),
    checkInvalidTokenRejected(name, url, verifyToken),
    checkMissingTokenRejected(name, url),
    checkWrongModeRejected(name, url, verifyToken),
  ]);

  for (const check of checks) {
    const icon = check.status === 'BAŞARILI' ? '✓' : '✗';
    const line = `${icon} ${check.check}: ${check.status} | ${check.details}`;
    console.log(line);
    if (logFile) writeLog(logFile, line);
  }

  const allPassed = checks.every(c => c.status === 'BAŞARILI');
  const summary = `${name}: ${allPassed ? 'TÜM KONTROLLER GEÇTİ' : 'BAZI KONTROLLER BAŞARISIZ'}`;
  console.log(summary);
  if (logFile) writeLog(logFile, summary);

  return { name, allPassed, checks };
}

function parseArgs() {
  const args = process.argv.slice(2);
  const result = { logFile: null };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--log-file' || args[i] === '-l') {
      result.logFile = path.resolve(args[++i]);
    }
  }
  return result;
}

async function main() {
  const { logFile } = parseArgs();
  const rootDir = path.join(__dirname, '..');
  const env = loadEnv(path.join(rootDir, '.env.local'));

  const baseUrl = env.SUPABASE_FUNCTIONS_URL || process.env.SUPABASE_FUNCTIONS_URL;
  const whatsappToken = env.META_WHATSAPP_VERIFY_TOKEN || process.env.META_WHATSAPP_VERIFY_TOKEN;
  const instagramToken = env.META_INSTAGRAM_VERIFY_TOKEN || process.env.META_INSTAGRAM_VERIFY_TOKEN;

  if (!baseUrl) {
    console.error('HATA: SUPABASE_FUNCTIONS_URL ortam değişkeni ayarlanmamış');
    console.error('Örnek: https://abcdefgh.supabase.co/functions/v1');
    process.exit(1);
  }

  if (!whatsappToken || !instagramToken) {
    console.error('HATA: Verify token\'lar .env.local\'de bulunamadı');
    process.exit(1);
  }

  const whatsappUrl = `${baseUrl.replace(/\/$/, '')}/whatsapp-webhook`;
  const instagramUrl = `${baseUrl.replace(/\/$/, '')}/instagram-webhook`;

  const startMsg = 'Webhook güvenlik ve sağlık kontrolü başlıyor...';
  console.log(startMsg);
  if (logFile) writeLog(logFile, startMsg);

  const [whatsappResult, instagramResult] = await Promise.all([
    runChecks('WhatsApp', whatsappUrl, whatsappToken, logFile),
    runChecks('Instagram', instagramUrl, instagramToken, logFile),
  ]);

  const summaryMsg = '\n=== ÖZET ===';
  console.log(summaryMsg);
  if (logFile) writeLog(logFile, summaryMsg);

  for (const result of [whatsappResult, instagramResult]) {
    const icon = result.allPassed ? '✓' : '✗';
    const line = `${icon} ${result.name}: ${result.allPassed ? 'TÜM KONTROLLER GEÇTİ' : 'BAZI KONTROLLER BAŞARISIZ'}`;
    console.log(line);
    if (logFile) writeLog(logFile, line);
  }

  if (logFile) writeLog(logFile, '---');

  const allOk = whatsappResult.allPassed && instagramResult.allPassed;
  process.exit(allOk ? 0 : 1);
}

main();