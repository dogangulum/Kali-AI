#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

function parseEnv(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const vars = new Set();
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#')) {
      const eqIndex = trimmed.indexOf('=');
      if (eqIndex > 0) {
        vars.add(trimmed.slice(0, eqIndex).trim());
      }
    }
  }
  return vars;
}

const rootDir = path.join(__dirname, '..');
const examplePath = path.join(rootDir, '.env.example');
const localPath = path.join(rootDir, '.env.local');

if (!fs.existsSync(examplePath)) {
  console.error('HATA: .env.example dosyası bulunamadı');
  process.exit(1);
}

if (!fs.existsSync(localPath)) {
  console.error('HATA: .env.local dosyası bulunamadı');
  process.exit(1);
}

const exampleVars = parseEnv(examplePath);
const localVars = parseEnv(localPath);

const missing = [...exampleVars].filter(v => !localVars.has(v));

if (missing.length > 0) {
  console.log('Eksik ortam değişkenleri:');
  for (const v of missing) {
    console.log(`  - ${v}`);
  }
  process.exit(1);
} else {
  console.log('Tüm ortam değişkenleri mevcut.');
}