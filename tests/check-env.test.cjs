const { test } = require('node:test');
const assert = require('node:assert/strict');
const { runCheckScript } = require('./helpers/run-check-script.cjs');

test('check-env: duplicate declarations do not create duplicate missing-name reports', async () => {
  const result = await runCheckScript('check-env.cjs', { files: {
    '.env.example': 'FIRST=one\nFIRST=two\nSECOND=three', '.env.local': 'SECOND=local',
  } });
  assert.equal(result.exitCode, 1);
  assert.equal(result.stdout, 'Eksik ortam değişkenleri:\n  - FIRST');
});

test('check-env: missing example file returns exit 1 and a useful error', async () => {
  const result = await runCheckScript('check-env.cjs');
  assert.equal(result.exitCode, 1);
  assert.equal(result.stderr, 'HATA: .env.example dosyası bulunamadı');
});

test('check-env: missing local file returns exit 1', async () => {
  const result = await runCheckScript('check-env.cjs', { files: { '.env.example': 'FIRST=example' } });
  assert.equal(result.exitCode, 1);
  assert.equal(result.stderr, 'HATA: .env.local dosyası bulunamadı');
});

test('check-env: reports only missing names, without printing values', async () => {
  const result = await runCheckScript('check-env.cjs', { files: {
    '.env.example': 'FIRST=example\nSECOND=sample\nTHIRD=sample',
    '.env.local': 'FIRST=fake-local-value',
  } });
  assert.equal(result.exitCode, 1);
  assert.equal(result.stdout, 'Eksik ortam değişkenleri:\n  - SECOND\n  - THIRD');
  assert.doesNotMatch(result.stdout + result.stderr, /fake-local-value/);
});

test('check-env: all required names succeed, extra names are allowed', async () => {
  const result = await runCheckScript('check-env.cjs', { files: {
    '.env.example': 'FIRST=example\nSECOND=example',
    '.env.local': 'FIRST=one\nSECOND=two\nEXTRA=three',
  } });
  assert.equal(result.exitCode, 0);
  assert.equal(result.stdout, 'Tüm ortam değişkenleri mevcut.');
  assert.equal(result.stderr, '');
});

test('check-env: ignores comments and blank lines, handles CRLF and equals in values', async () => {
  const result = await runCheckScript('check-env.cjs', { files: {
    '.env.example': ' # COMMENT=ignored\r\n\r\n FIRST = example\r\nnot-an-assignment',
    '.env.local': '# fake data\r\n FIRST = a=b=c\r\n',
  } });
  assert.equal(result.exitCode, 0);
  assert.equal(result.stdout, 'Tüm ortam değişkenleri mevcut.');
});

test('check-env: empty values count as present (name-only validation)', async () => {
  const result = await runCheckScript('check-env.cjs', { files: {
    '.env.example': 'FIRST=example', '.env.local': 'FIRST=',
  } });
  assert.equal(result.exitCode, 0);
  assert.equal(result.stdout, 'Tüm ortam değişkenleri mevcut.');
});
