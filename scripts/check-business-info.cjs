#!/usr/bin/env node
'use strict';

// Offline Markdown validation only: no database, environment or network access.
const fs = require('node:fs');

const clean = (value) => value.trim().replace(/^\d+\.\s+(?=_)/u, '');
const empty = (value) => !clean(value) || /^[_\s-]+$/u.test(clean(value));
const lower = (value) => value.trim().normalize('NFC').toLocaleLowerCase('tr-TR');
const time = (value) => /^(?:[01]\d|2[0-3]):[0-5]\d$/u.test(value)
  ? Number(value.slice(0, 2)) * 60 + Number(value.slice(3)) : NaN;

function validateBusinessInfo(markdown) {
  const errors = [];
  const lines = markdown.replace(/^\uFEFF/u, '').split(/\r?\n/u)
    .map((text, index) => ({ text, line: index + 1 }));
  const fail = (field, message, line) => errors.push({ field, message, line: line || 1 });
  function section(id) {
    const pattern = new RegExp(`^#{2,3} ${id.replaceAll('.', '\\.')}[.) ]`);
    const matches = lines.filter((row) => pattern.test(row.text));
    if (matches.length !== 1) {
      fail(`Bölüm ${id}`, 'Başlık tam bir kez bulunmalı; şablon başlıklarını koruyun.', matches[0]?.line);
      return [];
    }
    const start = matches[0].line;
    const depth = matches[0].text.match(/^#+/u)[0].length;
    const end = lines.findIndex((row, index) => index >= start &&
      new RegExp(`^#{1,${depth}} `).test(row.text));
    return lines.slice(start, end < 0 ? undefined : end);
  }
  function table(rows, header, columns) {
    const result = [];
    for (const row of rows.filter((r) => r.text.trim().startsWith('|'))) {
      const cells = row.text.trim().replace(/^\||\|$/gu, '').split('|').map((s) => s.trim());
      if (cells[0] === header || cells.every((s) => /^:?-+:?$/u.test(s))) continue;
      if (cells.length !== columns) fail(header, `Tabloda ${columns} sütun olmalı; hücre içinde | kullanmayın.`, row.line);
      else result.push({ cells, line: row.line });
    }
    return result;
  }
  function fields(rows) {
    const result = [];
    for (let i = 0; i < rows.length; i++) {
      const match = rows[i].text.match(/^- (?!\[)(.*?)(?::\s*(.*)|\?\s*)$/u);
      if (!match) continue;
      const label = match[1];
      const children = [];
      for (let j = i + 1; j < rows.length && /^\s{2,}\S/u.test(rows[j].text); j++) children.push(rows[j]);
      result.push({ label, value: [match[2] || '', ...children.filter((r) => !/^\s+- /u.test(r.text)).map((r) => r.text)]
        .filter((v) => !empty(v)).join(' ').trim(), children, line: rows[i].line });
    }
    return result;
  }
  function requiredFields(rows, expected, optional = []) {
    const parsed = fields(rows);
    for (const label of expected) {
      const found = parsed.filter((f) => f.label === label);
      if (found.length !== 1) fail(label, 'Alan tam bir kez bulunmalı; şablondaki alan adını koruyun.', rows[0]?.line);
      else if (empty(found[0].value) && !optional.includes(label)) fail(label, 'Bu alan doldurulmalı.', found[0].line);
    }
    return parsed;
  }
  const identity = requiredFields(section('1.1'), ['İşletme adı', 'Kısa ad / marka adı', 'Ana telefon',
    'WhatsApp numarası', 'Instagram kullanıcı adı', 'Web sitesi / link', 'Adres', 'İl / İlçe',
    'Saat dilimi', 'Varsayılan para birimi'], ['Web sitesi / link', 'Instagram kullanıcı adı']);
  for (const field of identity) {
    if (empty(field.value)) continue;
    if (field.label === 'Saat dilimi') {
      try { new Intl.DateTimeFormat('tr', { timeZone: field.value }).format(); }
      catch { fail(field.label, 'Geçerli saat dilimi yazın; örnek: Europe/Istanbul.', field.line); }
    }
    if (field.label === 'Varsayılan para birimi' && !['TRY', 'TL'].includes(field.value))
      fail(field.label, 'Formun Fiyat (TL) sütunuyla uyumlu TRY veya TL yazın.', field.line);
    if (['Ana telefon', 'WhatsApp numarası'].includes(field.label) &&
        !/^\+[1-9]\d{7,14}$/u.test(field.value.replace(/[ ()-]/gu, '')))
      fail(field.label, 'Ülke koduyla telefon yazın; örnek biçim: +90 5xx xxx xx xx (rakamlarla).', field.line);
    if (field.label === 'Instagram kullanıcı adı' && !/^@?[A-Za-z0-9._]{1,30}$/u.test(field.value))
      fail(field.label, 'Profil bağlantısı yerine kullanıcı adı yazın.', field.line);
    if (field.label === 'Web sitesi / link') {
      try { const url = new URL(field.value); if (!['http:', 'https:'].includes(url.protocol)) throw new Error(); }
      catch { fail(field.label, 'http:// veya https:// ile başlayan geçerli bağlantı yazın.', field.line); }
    }
  }
  requiredFields(section('1.2'), ['İşletmenin kısa tanımı (kısaca ne yapar?)',
    'Ana müşteri segmenti (ör. kadın, özel bakım, bridal, event, premium)', 'İşletmenin genel amaç ve değer önerisi']);

  const services = table(section('2'), 'Hizmet adı', 6).filter((r) => !r.cells.every(empty));
  if (!services.length) fail('Hizmetler', 'En az bir hizmet doldurulmalı.');
  const names = new Set();
  for (const { cells: [name, description, duration, price], line } of services) {
    const field = `Hizmet (${empty(name) ? 'adsız' : name})`;
    if (empty(name)) fail(`${field} / ad`, 'Hizmet adı gerekli.', line);
    if (names.has(lower(name))) fail(`${field} / ad`, 'Hizmet adı tekrarlanıyor.', line);
    names.add(lower(name));
    if (empty(description)) fail(`${field} / açıklama`, 'Kısa açıklama gerekli.', line);
    if (!/^\d+$/u.test(duration) || !Number.isSafeInteger(Number(duration)) || Number(duration) <= 0)
      fail(`${field} / süre`, 'Dakika cinsinden pozitif tam sayı yazın.', line);
    if (!/^\d+(?:[,.]\d{1,2})?$/u.test(price) || !Number.isSafeInteger(Math.round(Number(price.replace(',', '.')) * 100)))
      fail(`${field} / fiyat`, 'Sıfır veya pozitif tutar yazın: 1250 veya 1250,50; binlik ayırıcı ve TL eklemeyin.', line);
  }

  const schedule = section('3');
  const days = ['Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi', 'Pazar'];
  const seen = new Set();
  const slots = [];
  for (const { cells: [day, opens, closes, pause], line } of table(schedule, 'Gün', 5)) {
    const field = `Çalışma saatleri / ${day}`;
    if (!days.includes(day)) fail(field, 'Şablondaki gün adını kullanın.', line);
    if (seen.has(day)) fail(field, 'Gün tekrarlanıyor.', line);
    seen.add(day);
    if (lower(opens) === 'kapalı') {
      if (!(empty(closes) || lower(closes) === 'kapalı') || !(empty(pause) || lower(pause) === 'yok'))
        fail(field, 'Kapalı güne kapanış saati veya mola yazılamaz.', line);
      continue;
    }
    const start = time(opens), end = time(closes);
    if (!Number.isFinite(start) || !Number.isFinite(end) || start >= end) {
      fail(field, 'HH:MM biçiminde, aynı gün içinde açılıştan sonra kapanış yazın.', line);
      continue;
    }
    if (empty(pause)) fail(`${field} / mola`, 'Mola yoksa Yok, varsa HH:MM-HH:MM yazın.', line);
    else if (lower(pause) === 'yok') slots.push(end - start);
    else {
      const parts = pause.split(/\s*[-–]\s*/u);
      const a = time(parts[0]), b = time(parts[1] || '');
      if (parts.length !== 2 || !Number.isFinite(a) || !Number.isFinite(b) || a <= start || b >= end || a >= b)
        fail(`${field} / mola`, 'Mola HH:MM-HH:MM biçiminde ve çalışma saatleri içinde olmalı.', line);
      else slots.push(a - start, end - b);
    }
  }
  for (const day of days) if (!seen.has(day)) fail(`Çalışma saatleri / ${day}`, 'Gün satırı eksik.');
  if (!slots.length) fail('Çalışma saatleri', 'En az bir geçerli açık gün ve hizmet aralığı gerekli.');
  for (const { cells, line } of services) if (slots.length && Number(cells[2]) > Math.max(...slots))
    fail(`Hizmet (${cells[0]}) / süre`, 'Hizmet hiçbir günün kesintisiz çalışma aralığına sığmıyor.', line);
  const dates = new Set();
  for (const row of schedule.filter((r) => r.text.startsWith('- Tarih:'))) {
    const match = row.text.match(/^- Tarih:\s*(.*?)\s+Saat:\s*(.*?)\s+Durum:\s*(.*?)\s*$/u);
    if (!match) { fail('Özel gün', 'Tarih, Saat ve Durum etiketlerini koruyun.', row.line); continue; }
    const [, date, hours, status] = match;
    if ([date, hours, status].every(empty)) continue;
    const parsed = new Date(`${date}T00:00:00Z`);
    if (!/^\d{4}-\d{2}-\d{2}$/u.test(date) || !Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date)
      fail('Özel gün / tarih', 'Gerçek bir tarih yazın: YYYY-MM-DD.', row.line);
    if (dates.has(date)) fail('Özel gün / tarih', 'Tarih tekrarlanıyor.', row.line);
    dates.add(date);
    const [a, b, extra] = hours.split(/\s*[-–]\s*/u);
    if (lower(status) === 'kapalı') {
      if (!(empty(hours) || lower(hours) === 'kapalı')) fail('Özel gün / saat', 'Kapalı güne saat yazılamaz.', row.line);
    } else if (lower(status) !== 'açık' || extra !== undefined || !(time(a) < time(b || '')))
      fail('Özel gün / saat ve durum', 'Durum Açık ve saat HH:MM-HH:MM olmalı; kapalıysa Durum: Kapalı yazın.', row.line);
  }

  function choices(rows, labels, multiple = []) {
    const parsed = fields(rows);
    for (const label of labels) {
      const matches = parsed.filter((f) => f.label === label);
      const field = matches[0];
      const selected = field?.children.filter((r) => /^\s+- \[[xX]\] /u.test(r.text)) || [];
      if (matches.length !== 1 || !selected.length || (!multiple.includes(label) && selected.length !== 1))
        fail(label, multiple.includes(label) ? 'En az bir seçeneği [x] ile işaretleyin.' : 'Tam bir seçeneği [x] ile işaretleyin.', field?.line);
      for (const row of selected) if (/Diğer:/u.test(row.text) && empty(row.text.split('Diğer:')[1]))
        fail(label, 'Diğer seçeneğinin açıklamasını doldurun.', row.line);
    }
  }
  choices(section('4.1'), ['Tercih edilen ton', 'Müşteriye hitap biçimi', 'Mesaj uzunluğu hedefi', 'Emoji kullanımı'], ['Tercih edilen ton']);
  const greeting = section('4.2').filter((r) => r.text.trim() && !r.text.startsWith('İlk mesajda') && !/^---/u.test(r.text));
  if (!greeting.some((r) => !empty(r.text))) fail('Karşılama mesajı', 'Karşılama metnini yazın.', greeting[0]?.line);
  requiredFields(section('4.3'), ['Kısa, sıcak bir cevap örneği', 'Fiyat sorusuna cevap örneği',
    'Randevu teklifine cevap örneği', 'İtiraz veya gecikme durumunda cevap örneği']);
  const policy = section('5.1');
  requiredFields(policy, ['Randevu verilmeden önce müşteriyle hangi bilgi doğrulanmalı',
    'Müşteri randevu isterken hangi bilgiyi istemeli', 'Kayıt iptali / değişikliği için politika',
    'Müşteri randevuya geç kaldığında nasıl davranılmalı']);
  choices(policy, ['Yeni müşteri için ön işlem / ön görüşme gerekir mi']);
  const location = section('5.2');
  choices(location, ['Müşteri için uygun konum bilgisi var mı']);
  requiredFields(location, ['Konum bilgisi gerekiyorsa nasıl paylaşılmalı']);
  return { valid: errors.length === 0, errors };
}

function main(args) {
  if (args.length !== 1 || args[0].startsWith('-')) {
    console.log('Kullanım: node scripts/check-business-info.cjs "doldurulmus-form.md"');
    return args.length === 1 && args[0] === '--help' ? 0 : 2;
  }
  let input;
  try { input = fs.readFileSync(args[0], 'utf8'); }
  catch { console.error('Form okunamadı. Dosya yolunu ve okuma iznini kontrol edin.'); return 2; }
  const result = validateBusinessInfo(input);
  if (result.valid) console.log('BAŞARILI: Form biçim ve zorunlu alan kontrollerini geçti. Hiçbir veri yüklenmedi.');
  else {
    console.error(`BAŞARISIZ: ${result.errors.length} sorun bulundu.`);
    for (const error of result.errors) console.error(`Satır ${error.line} — ${error.field}: ${error.message}`);
  }
  return result.valid ? 0 : 1;
}

if (require.main === module) process.exitCode = main(process.argv.slice(2));
module.exports = { validateBusinessInfo };
