#!/usr/bin/env node
// Offline inventory and existing configuration check, not production approval.
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const requiredFiles = [
  'package.json', 'deno.json', '.env.example', '.env.local',
  'supabase/config.toml',
  'supabase/migrations/20260921120000_core_schema.sql',
  'supabase/migrations/20260921130000_seed_kali_business.sql',
  'supabase/functions/whatsapp-webhook/index.ts',
  'supabase/functions/instagram-webhook/index.ts',
  'scripts/check-env.cjs', 'scripts/simulate-webhook.cjs',
  'scripts/run-local-tests.cjs',
  'tests/whatsapp-webhook.test.cjs', 'tests/instagram-webhook.test.cjs',
  'tests/helpers/webhook-suite.cjs',
  'tests/fixtures/whatsapp-text-message.json',
  'tests/fixtures/whatsapp-image-message.json',
  'tests/fixtures/whatsapp-read-receipt.json',
  'tests/fixtures/instagram-text-message.json',
  'tests/fixtures/instagram-image-message.json',
  'docs/TEST_SENARYOLARI.md', 'docs/LOCAL_TESTS.md',
];

function inspect(root, { io = fs, execute = spawnSync, nodeVersion = process.versions.node } = {}) {
  const results = [];
  const add = (name, ok, detail = '') => results.push({ name, ok, detail });
  const present = new Set();
  for (const file of requiredFiles) {
    try {
      const stat = io.statSync(path.join(root, file));
      const ok = stat.isFile() && stat.size > 0;
      add(file, ok, ok ? '' : 'Dosya yok, boş veya normal dosya değil.');
      if (ok) present.add(file);
    } catch { add(file, false, 'Dosya bulunamadı veya okunamıyor.'); }
  }
  for (const file of requiredFiles.filter((name) => name.endsWith('.json'))) {
    if (!present.has(file)) continue;
    try {
      JSON.parse(io.readFileSync(path.join(root, file), 'utf8'));
      add(`${file}: JSON`, true);
    } catch { add(`${file}: JSON`, false, 'JSON okunamadı veya biçimi geçersiz.'); }
  }
  const [major, minor] = nodeVersion.split('.').map(Number);
  add('Node.js', major > 22 || (major === 22 && minor >= 13), `Sürüm: ${nodeVersion}; gereken: >=22.13`);
  try {
    const deno = execute('deno', ['--version'], { cwd: root, encoding: 'utf8', timeout: 5000, windowsHide: true, shell: false });
    add('Deno 2', !deno.error && deno.status === 0 && /^deno 2\./m.test(deno.stdout || ''),
      'PATH üzerinde Deno 2 gerekir.');
  } catch { add('Deno 2', false, 'Sürüm kontrolü çalıştırılamadı.'); }
  if (['scripts/check-env.cjs', '.env.example', '.env.local'].every((file) => present.has(file))) {
    try {
      const check = execute(process.execPath, ['scripts/check-env.cjs'], {
        cwd: root, encoding: 'utf8', timeout: 5000, windowsHide: true, shell: false,
      });
      // Reuse the existing checker; never echo file contents or subprocess errors.
      const missing = (check.stdout || '').split(/\r?\n/)
        .filter((line) => /^\s+- [A-Za-z_][A-Za-z0-9_]*$/.test(line));
      add('Ortam değişkeni adları', !check.error && check.status === 0,
        missing.length ? `Eksik adlar: ${missing.map((line) => line.trim().slice(2)).join(', ')}`
          : 'Mevcut check-env kullanıldı; değerlerin doğruluğu ve boş olup olmadığı denetlenmez.');
    } catch { add('Ortam değişkeni adları', false, 'check-env çalıştırılamadı.'); }
  } else {
    add('Ortam değişkeni adları', false, 'Ön koşul dosyaları eksik; kontrol atlandı.');
  }
  return results;
}

if (require.main === module) {
  const results = inspect(path.resolve(__dirname, '..'));
  for (const result of results) {
    console.log(`[${result.ok ? 'TAMAM' : 'EKSİK/HATA'}] ${result.name}${result.detail ? ` — ${result.detail}` : ''}`);
  }
  const failed = results.filter((result) => !result.ok);
  console.log(failed.length
    ? `\nYEREL HAZIRLIK EKSİK: ${failed.length} kontrol başarısız.`
    : '\nYEREL ÖN KONTROLLER TAMAM.');
  console.log('CANLI HAZIRLIK DOĞRULANMADI: test sonuçları, bağlantılar, yetkiler, AI akışı ve geri alma planı ayrıca incelenmeli.');
  console.log('Kılavuz: docs/ACILIS_HAZIRLIK.md');
  process.exitCode = failed.length ? 1 : 0;
}

module.exports = { inspect, requiredFiles };
