#!/usr/bin/env node

const { spawnSync } = require('child_process');
const path = require('path');

const CHECKS = [
  {
    id: 'check-env',
    name: 'Ortam Değişkenleri',
    description: '.env.example vs .env.local eksiklik kontrolü',
    script: 'check-env.cjs',
    args: [],
    required: true,
  },
  {
    id: 'check-webhooks',
    name: 'Webhook Sağlık/Güvenlik',
    description: 'Uzak webhook token ve 403 reddetme testleri',
    script: 'check-webhooks.cjs',
    args: [],
    required: false,
    envVars: ['SUPABASE_FUNCTIONS_URL', 'META_WHATSAPP_VERIFY_TOKEN', 'META_INSTAGRAM_VERIFY_TOKEN'],
  },
  {
    id: 'check-readiness',
    name: 'Yerel Hazırlık Envanteri',
    description: 'Dosyalar, JSON, Node/Deno sürüm, ortam değişkenleri',
    script: 'check-readiness.cjs',
    args: [],
    required: true,
  },
  {
    id: 'check-business-info',
    name: 'İşletme Bilgileri',
    description: 'İşletme yapılandırması ve ayarları kontrolü (form dosyası gerekli)',
    script: 'check-business-info.cjs',
    args: [],
    required: false,
    skipUnlessArg: true,
  },
];

function runCheck(check) {
  const scriptPath = path.join(__dirname, check.script);
  
  // Check if script exists
  const fs = require('fs');
  if (!fs.existsSync(scriptPath)) {
    return {
      id: check.id,
      name: check.name,
      status: 'missing',
      message: `Script bulunamadı: ${check.script}`,
      duration: 0,
    };
  }

  // Check if check requires an argument but none provided
  if (check.skipUnlessArg) {
    const args = process.argv.slice(2);
    const formArg = args.find(a => !a.startsWith('-'));
    if (!formArg) {
      return {
        id: check.id,
        name: check.name,
        status: 'skipped',
        message: 'Form dosyası argümanı verilmedi (örn: node scripts/run-all-checks.cjs config/business-config.example.md)',
        duration: 0,
      };
    }
    check.args = [formArg];
  }

  // Check required env vars for optional checks
  if (!check.required && check.envVars) {
    const missing = check.envVars.filter(v => !process.env[v]);
    if (missing.length > 0) {
      return {
        id: check.id,
        name: check.name,
        status: 'skipped',
        message: `Gerekli ortam değişkenleri yok: ${missing.join(', ')}`,
        duration: 0,
      };
    }
  }

  const startTime = Date.now();
  
  try {
    const result = spawnSync('node', [scriptPath, ...check.args], {
      cwd: path.join(__dirname, '..'),
      stdio: 'pipe',
      shell: false,
      windowsHide: true,
      encoding: 'utf8',
      timeout: 60000,
    });

    const duration = Date.now() - startTime;
    const stdout = result.stdout || '';
    const stderr = result.stderr || '';

    return {
      id: check.id,
      name: check.name,
      status: result.status === 0 ? 'passed' : 'failed',
      exitCode: result.status,
      message: stdout.trim() || stderr.trim() || (result.status === 0 ? 'Başarılı' : 'Başarısız'),
      duration,
      stdout,
      stderr,
    };
  } catch (err) {
    return {
      id: check.id,
      name: check.name,
      status: 'error',
      message: err.message,
      duration: Date.now() - startTime,
    };
  }
}

function printHeader() {
  console.log('\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║           KALI AI — BİRLEŞİK KONTROL RAPORU                 ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');
}

function printCheckResult(result) {
  const icons = {
    passed: '✅',
    failed: '❌',
    skipped: '⏭️',
    missing: '❓',
    error: '💥',
  };
  
  const icon = icons[result.status] || '❓';
  const statusLabels = {
    passed: 'GEÇTİ',
    failed: 'BAŞARISIZ',
    skipped: 'ATLANDI',
    missing: 'EKSİK',
    error: 'HATA',
  };
  
  const status = statusLabels[result.status] || 'BİLİNMİYOR';
  const duration = `${result.duration}ms`;
  
  console.log(`${icon} ${result.name.padEnd(25)} [${status.padEnd(8)}] ${duration.padStart(8)}`);
  
  if (result.message && result.status !== 'passed') {
    const lines = result.message.split('\n').slice(0, 3);
    for (const line of lines) {
      console.log(`    ${line}`);
    }
    if (result.message.split('\n').length > 3) {
      console.log(`    ... ve ${result.message.split('\n').length - 3} satır daha`);
    }
  }
  console.log();
}

function printSummary(results) {
  console.log('═'.repeat(60));
  console.log('ÖZET RAPOR');
  console.log('═'.repeat(60));
  
  const passed = results.filter(r => r.status === 'passed').length;
  const failed = results.filter(r => r.status === 'failed').length;
  const skipped = results.filter(r => r.status === 'skipped').length;
  const missing = results.filter(r => r.status === 'missing').length;
  const errors = results.filter(r => r.status === 'error').length;
  const total = results.length;
  
  console.log(`Toplam: ${total} | ✅ Geçti: ${passed} | ❌ Başarısız: ${failed} | ⏭️ Atlandı: ${skipped} | ❓ Eksik: ${missing} | 💥 Hata: ${errors}`);
  console.log();
  
  const allRequiredPassed = results
    .filter(r => CHECKS.find(c => c.id === r.id)?.required)
    .every(r => r.status === 'passed');
  
  if (allRequiredPassed && failed === 0 && errors === 0 && missing === 0) {
    console.log('🎉 TÜM ZORUNLU KONTROLLER BAŞARILI!');
  } else {
    console.log('⚠️  BAZI KONTROLLER BAŞARISIZ VEYA EKSİK');
    if (!allRequiredPassed) {
      console.log('   → Zorunlu kontrollerden en az biri başarısız');
    }
    if (failed > 0) {
      console.log(`   → ${failed} kontrol(ler) başarısız`);
    }
    if (missing > 0) {
      console.log(`   → ${missing} script dosyası bulunamadı`);
    }
  }
  
  return allRequiredPassed && failed === 0 && errors === 0 && missing === 0;
}

function printDetailedReport(results) {
  console.log('\n' + '='.repeat(60));
  console.log('DETAYLI ÇIKTI');
  console.log('='.repeat(60) + '\n');
  
  for (const result of results) {
    if (result.stdout) {
      console.log(`--- ${result.name} (stdout) ---`);
      console.log(result.stdout);
      console.log();
    }
    if (result.stderr && result.status !== 'passed') {
      console.log(`--- ${result.name} (stderr) ---`);
      console.log(result.stderr);
      console.log();
    }
  }
}

async function main() {
  const args = process.argv.slice(2);
  const showDetails = args.includes('--verbose') || args.includes('-v');
  const onlyRequired = args.includes('--required-only');
  
  printHeader();
  console.log(`${CHECKS.length} kontrol çalıştırılıyor...\n`);
  
  const results = [];
  
  for (const check of CHECKS) {
    if (onlyRequired && !check.required) continue;
    
    process.stdout.write(`▶ ${check.name}... `);
    const result = runCheck(check);
    results.push(result);
    
    const statusIcon = result.status === 'passed' ? '✅' : 
                       result.status === 'failed' ? '❌' : 
                       result.status === 'skipped' ? '⏭️' : '❓';
    console.log(`${statusIcon} [${result.status.toUpperCase()}]`);
  }
  
  console.log();
  
  // Print detailed results
  for (const result of results) {
    printCheckResult(result);
  }
  
  const success = printSummary(results);
  
  if (showDetails) {
    printDetailedReport(results);
  }
  
  process.exit(success ? 0 : 1);
}

main().catch(err => {
  console.error('Beklenmeyen hata:', err);
  process.exit(1);
});