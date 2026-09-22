#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const readline = require('readline');

const SCRIPTS = [
  {
    id: '1',
    name: 'check-env',
    description: 'Ortam değişkeni eksiklik kontrolü (.env.example vs .env.local)',
    file: 'check-env.cjs',
    args: [],
  },
  {
    id: '2',
    name: 'check-webhooks',
    description: 'Uzak webhook sağlık ve güvenlik kontrolü (doğru/yanlış token, 403 testleri)',
    file: 'check-webhooks.cjs',
    args: [],
  },
  {
    id: '3',
    name: 'check-readiness',
    description: 'Yerel geliştirme ortamı hazırlık envanteri (dosyalar, JSON, Node/Deno sürüm, env)',
    file: 'check-readiness.cjs',
    args: [],
  },
  {
    id: '4',
    name: 'simulate-webhook',
    description: 'Tek bir fixture dosyası ile manuel webhook isteği gönder (localhost:8000)',
    file: 'simulate-webhook.cjs',
    args: [],
    promptArgs: true,
  },
  {
    id: '5',
    name: 'dry-run',
    description: 'Tüm fixture\'larla kuru deneme (sahte AI/Supabase ile uçtan uca akış)',
    file: 'dry-run.cjs',
    args: [],
  },
  {
    id: '6',
    name: 'run-local-tests',
    description: 'Yerel webhook tam test paketi (npm test + Deno başlatma + fixture gönderimi)',
    file: 'run-local-tests.cjs',
    args: [],
  },
];

function printMenu() {
  console.log('\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║              KALI AI — GELİŞTİRME ARAÇLARI MENÜSÜ            ║');
  console.log('╠══════════════════════════════════════════════════════════════╣');
  for (const script of SCRIPTS) {
    console.log(`║  ${script.id}) ${script.name.padEnd(20)} — ${script.description}`);
  }
  console.log('║  q) Çıkış                                                    ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
}

function runScript(script, extraArgs = []) {
  const scriptPath = path.join(__dirname, script.file);
  if (!fs.existsSync(scriptPath)) {
    console.log(`\n✗ HATA: ${script.file} bulunamadı: ${scriptPath}`);
    return;
  }

  const args = [...script.args, ...extraArgs];
  console.log(`\n▶ Çalıştırılıyor: node "${script.file}" ${args.join(' ')}`);
  console.log('─'.repeat(60));

  const result = spawnSync('node', [scriptPath, ...args], {
    cwd: path.join(__dirname, '..'),
    stdio: 'inherit',
    shell: false,
    windowsHide: true,
  });

  console.log('─'.repeat(60));
  if (result.error) {
    console.log(`\n✗ Hata: ${result.error.message}`);
  } else if (result.status !== 0) {
    console.log(`\n⚠ Çıkış kodu: ${result.status}`);
  } else {
    console.log('\n✓ Tamamlandı');
  }
}

function getFixtureChoice() {
  const fixturesDir = path.join(__dirname, '..', 'tests', 'fixtures');
  if (!fs.existsSync(fixturesDir)) {
    console.log('\n✗ tests/fixtures klasörü bulunamadı');
    return null;
  }

  const files = fs.readdirSync(fixturesDir)
    .filter(f => f.endsWith('.json'))
    .sort();

  if (files.length === 0) {
    console.log('\n✗ Fixture dosyası bulunamadı');
    return null;
  }

  console.log('\nMevcut fixture dosyaları:');
  files.forEach((f, i) => console.log(`  ${i + 1}) ${f}`));

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => {
    rl.question('\nHangi fixture kullanılsın? (sayı): ', input => {
      rl.close();
      const idx = parseInt(input.trim(), 10) - 1;
      if (isNaN(idx) || idx < 0 || idx >= files.length) {
        console.log('Geçersiz seçim');
        resolve(null);
      } else {
        resolve(path.join('tests', 'fixtures', files[idx]));
      }
    });
  });
}

function parseArgsString(input) {
  const args = [];
  let current = '';
  let inQuotes = false;
  let quoteChar = '';

  for (let i = 0; i < input.length; i++) {
    const char = input[i];

    if ((char === '"' || char === "'") && !inQuotes) {
      inQuotes = true;
      quoteChar = char;
      continue;
    }

    if (char === quoteChar && inQuotes) {
      inQuotes = false;
      quoteChar = '';
      continue;
    }

    if (char === ' ' && !inQuotes) {
      if (current) {
        args.push(current);
        current = '';
      }
      continue;
    }

    current += char;
  }

  if (current) args.push(current);
  return args;
}

function getWebhookArgs() {
  console.log('\nEk argümanlar (örn: --log-file logs/webhook-health.log):');
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => {
    rl.question('Argümanlar (boş bırakılabilir): ', input => {
      rl.close();
      resolve(input.trim() ? parseArgsString(input.trim()) : []);
    });
  });
}

function askYesNo(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => {
    rl.question(question, input => {
      rl.close();
      resolve(input.trim().toLowerCase() === 'e');
    });
  });
}

async function main() {
  while (true) {
    printMenu();

    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const key = await new Promise(resolve => {
      rl.question('\nSeçiminiz (1-6 veya q): ', input => {
        rl.close();
        resolve(input.trim().toLowerCase());
      });
    });

    if (key === 'q') {
      console.log('\nGörüşürüz!\n');
      process.exit(0);
    }

    const script = SCRIPTS.find(s => s.id === key);
    if (!script) {
      console.log('\n✗ Geçersiz seçim');
      continue;
    }

    let extraArgs = [];

    if (script.promptArgs) {
      const fixture = await getFixtureChoice();
      if (!fixture) continue;
      extraArgs.push(fixture);

      if (await askYesNo('\nİsteğe bağlı: --bad-signature (bozuk imza testi) ekle? (e/h): ')) {
        extraArgs.push('--bad-signature');
      }
    } else if (script.name === 'check-webhooks') {
      extraArgs = await getWebhookArgs();
    }

    runScript(script, extraArgs);

    const rl2 = readline.createInterface({ input: process.stdin, output: process.stdout });
    await new Promise(resolve => {
      rl2.question('\nDevam etmek için Enter\'a basın...', () => {
        rl2.close();
        resolve();
      });
    });
  }
}

main().catch(err => {
  console.error('Beklenmeyen hata:', err);
  process.exit(1);
});