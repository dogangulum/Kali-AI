#!/usr/bin/env node
// Orchestrates existing tools; signing remains in simulate-webhook.cjs.
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const net = require('node:net');
const path = require('node:path');
const { readFileSync } = require('node:fs');

const ROOT = path.resolve(__dirname, '..');
const children = new Set();
let interrupted = false;
const fixtures = {
  whatsapp: ['whatsapp-text-message', 'whatsapp-image-message', 'whatsapp-read-receipt'],
  instagram: ['instagram-text-message', 'instagram-image-message'],
};

function localEnv() {
  const env = {};
  // Only runtime paths are inherited. No .env files or application credentials.
  const allowed = /^(path|systemroot|windir|comspec|pathext|temp|tmp|tmpdir|home|userprofile|localappdata|appdata|deno_dir)$/i;
  for (const [key, value] of Object.entries(process.env)) {
    if (allowed.test(key)) env[key] = value;
  }
  return {
    ...env,
    NO_COLOR: '1', DENO_NO_UPDATE_CHECK: '1',
    META_APP_SECRET: 'local-only-test-secret',
    META_WHATSAPP_VERIFY_TOKEN: 'local-whatsapp-test',
    META_INSTAGRAM_VERIFY_TOKEN: 'local-instagram-test',
  };
}

function launch(command, args) {
  if (interrupted) throw new Error('Test iptal edildi.');
  const child = spawn(command, args, {
    cwd: ROOT, env: localEnv(), shell: false, windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const state = { child, output: '', error: null, closed: false };
  children.add(state);
  const collect = (chunk) => { state.output = (state.output + chunk.toString()).slice(-24000); };
  child.stdout.on('data', collect);
  child.stderr.on('data', collect);
  child.on('error', (error) => { state.error = error; });
  state.done = new Promise((resolve) => child.on('close', (code) => {
    state.closed = true;
    children.delete(state);
    resolve(code);
  }));
  return state;
}

async function stop(state) {
  if (!state || state.closed) return;
  state.child.kill();
  const timer = setTimeout(() => state.child.kill('SIGKILL'), 1500);
  try { await state.done; } finally { clearTimeout(timer); }
}

async function command(commandName, args, timeoutMs = 30000) {
  const state = launch(commandName, args);
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    void stop(state);
  }, timeoutMs);
  try {
    const code = await state.done;
    if (timedOut) throw new Error(`${commandName}: ${timeoutMs / 1000} saniyede tamamlanmadı.`);
    if (state.error) throw new Error(`${commandName} başlatılamadı: ${state.error.message}`);
    if (code !== 0) throw new Error(`${commandName} çıkış kodu ${code}\n${state.output.trim()}`);
    return state.output;
  } finally { clearTimeout(timer); }
}

async function checkPort() {
  const server = net.createServer();
  const ready = once(server, 'listening');
  server.listen(8000);
  try { await ready; } catch (error) {
    throw new Error(`8000 portu kullanılamıyor (${error.code}). Açık webhook'u kapatıp tekrar deneyin.`);
  }
  await new Promise((resolve) => server.close(resolve));
}

function checkResponse(output, badSignature) {
  const matches = [...output.matchAll(/^HTTP (\d+)\r?\n([^\r\n]*)/gm)];
  if (matches.length !== 1) throw new Error(`Gönderici çıktısında tek HTTP yanıtı bulunamadı.\n${output}`);
  const [, status, body] = matches[0];
  const expected = badSignature ? '401' : '200';
  if (status !== expected) throw new Error(`HTTP ${expected} bekleniyordu; HTTP ${status} alındı.\n${output}`);
  if (badSignature) {
    if (body.trim() !== 'Unauthorized') throw new Error(`Beklenmeyen 401 gövdesi: ${body}`);
  } else {
    let json;
    try { json = JSON.parse(body); } catch { throw new Error(`Yanıt JSON değil: ${body}`); }
    if (json.received !== true) throw new Error(`Yanıtta received: true bulunamadı: ${body}`);
  }
}

async function waitReady(state, channel) {
  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) {
    if (state.error || state.closed) {
      throw new Error(`Webhook başlatılamadı. ${state.error?.message || ''}\n${state.output}`);
    }
    // Wait for this child to bind before contacting the port.
    if (state.output.includes('Listening on')) {
      const url = new URL('http://localhost:8000/');
      url.search = new URLSearchParams({
        'hub.mode': 'subscribe', 'hub.verify_token': `local-${channel}-test`,
        'hub.challenge': 'local-suite-ready',
      }).toString();
      const response = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(2000) });
      if (response.status !== 200 || await response.text() !== 'local-suite-ready') {
        throw new Error('Başlangıç GET doğrulaması beklenen yanıtı vermedi.');
      }
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Webhook 20 saniyede hazır olmadı.\n${state.output}`);
}

async function main() {
  const results = [];
  async function step(name, fn) {
    try {
      await fn();
      results.push({ name, ok: true });
      console.log(`[BAŞARILI] ${name}`);
      return true;
    } catch (error) {
      results.push({ name, ok: false });
      console.error(`[SORUN] ${name}\n${error.message}`);
      return false;
    }
  }
  console.log('Yerel birleşik test: gerçek ortam dosyaları okunmaz; veritabanı bağlantısı kurulmaz.');
  const nodeOk = await step('Node.js sürümü', () => {
    const [major, minor] = process.versions.node.split('.').map(Number);
    if (major < 22 || (major === 22 && minor < 13)) throw new Error('Node.js 22.13 veya üzeri gerekiyor.');
  });
  const dataOk = await step('Beş örnek JSON dosyası', () => {
    for (const name of Object.values(fixtures).flat()) {
      JSON.parse(readFileSync(path.join(ROOT, 'tests', 'fixtures', `${name}.json`), 'utf8'));
    }
  });
  if (nodeOk) await step('Mevcut Node.js davranış testleri', () => command(process.execPath, [
    '--test', 'tests/whatsapp-webhook.test.cjs', 'tests/instagram-webhook.test.cjs',
  ]));
  const denoOk = await step('Deno 2 erişimi', async () => {
    const output = await command('deno', ['--version'], 5000);
    if (!/^deno 2\./m.test(output)) throw new Error('PATH üzerinde Deno 2 gerekiyor.');
  });
  if (nodeOk && dataOk && denoOk) {
    for (const [channel, names] of Object.entries(fixtures)) {
      let server;
      try {
        const started = await step(`${channel}: başlatma ve GET doğrulaması`, async () => {
          await checkPort();
          server = launch('deno', [
            'run', '--cached-only', '--no-lock', '--no-config', '--no-prompt',
            '--allow-net=0.0.0.0:8000,127.0.0.1:8000,localhost:8000',
            '--allow-env=META_APP_SECRET,META_WHATSAPP_VERIFY_TOKEN,META_INSTAGRAM_VERIFY_TOKEN,SUPABASE_URL,SUPABASE_SERVICE_ROLE_KEY,KALI_BUSINESS_ID',
            `supabase/functions/${channel}-webhook/index.ts`,
          ]);
          await waitReady(server, channel);
        });
        if (!started) continue;
        for (const name of names) {
          await step(`${channel}: ${name} → HTTP 200`, async () => {
            if (server.closed) throw new Error('Webhook süreci kapandı.');
            const output = await command(process.execPath, [
              'scripts/simulate-webhook.cjs', `tests/fixtures/${name}.json`,
            ], 10000);
            checkResponse(output, false);
          });
        }
        await step(`${channel}: bozuk imza → HTTP 401`, async () => {
          if (server.closed) throw new Error('Webhook süreci kapandı.');
          const output = await command(process.execPath, [
            'scripts/simulate-webhook.cjs', `tests/fixtures/${names[0]}.json`, '--bad-signature',
          ], 10000);
          checkResponse(output, true);
        });
      } finally {
        if (server) await step(`${channel}: süreci kapatma`, () => stop(server));
      }
    }
  } else {
    console.log('[ATLANDI] HTTP denemeleri: ön koşullardan biri sağlanmadı.');
  }
  const failures = results.filter((result) => !result.ok);
  if (failures.length) {
    console.error(`\nŞURADA SORUN VAR: ${failures.map((result) => result.name).join('; ')}`);
    process.exitCode = 1;
  } else {
    console.log('\nHEPSİ BAŞARILI: davranış testleri ve iki kanalın yerel HTTP denemeleri geçti.');
  }
}

if (require.main === module) {
  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.once(signal, async () => {
      interrupted = true;
      await Promise.all([...children].map(stop));
      console.error('\nTest iptal edildi; başlatılan süreçler kapatıldı.');
      process.exit(signal === 'SIGINT' ? 130 : 143);
    });
  }
  main().catch(async (error) => {
    await Promise.all([...children].map(stop));
    console.error(`ŞURADA SORUN VAR: ${error.message}`);
    process.exitCode = 1;
  });
}

module.exports = { checkResponse, command, checkPort, localEnv };
