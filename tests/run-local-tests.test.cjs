const { test } = require('node:test');
const assert = require('node:assert/strict');
const net = require('node:net');
const { once } = require('node:events');
const { checkResponse, command, checkPort, localEnv } = require('../scripts/run-local-tests.cjs');

test('runner rejects ambiguous output containing two HTTP responses', () => {
  assert.throws(() => checkResponse('HTTP 200\n{"received":true}\nHTTP 200\n{"received":true}\n', false), /tek HTTP yanıtı/);
});

test('runner rejects missing response body and non-boolean received flag', () => {
  assert.throws(() => checkResponse('HTTP 200\n', false), /JSON değil/);
  assert.throws(() => checkResponse('HTTP 200\n{"received":"true"}\n', false), /received/);
});

test('runner accepts only the expected HTTP status and response body', () => {
  checkResponse('POST http://localhost:8000/\nHTTP 200\n{"received":true}\n', false);
  checkResponse('HTTP 401\r\nUnauthorized\r\n', true);
  assert.throws(() => checkResponse('HTTP 500\nerror\n', false), /HTTP 200 bekleniyordu/);
  assert.throws(() => checkResponse('HTTP 200\n{"received":false}\n', false), /received/);
  assert.throws(() => checkResponse('HTTP 200\nnot-json\n', false), /JSON değil/);
  assert.throws(() => checkResponse('HTTP 200\n{"received":true}\n', true), /HTTP 401 bekleniyordu/);
  assert.throws(() => checkResponse('HTTP 401\nwrong-body\n', true), /401 gövdesi/);
  assert.throws(() => checkResponse('No response', false), /HTTP yanıtı/);
});

test('runner does not pass application environment variables to children', () => {
  const key = 'SUPABASE_URL';
  const previous = process.env[key];
  try {
    process.env[key] = 'https://example.invalid';
    const env = localEnv();
    assert.equal(env[key], undefined);
    assert.equal(env.SUPABASE_SERVICE_ROLE_KEY, undefined);
    assert.equal(env.KALI_BUSINESS_ID, undefined);
    assert.equal(env.NODE_OPTIONS, undefined);
    assert.equal(env.META_WHATSAPP_VERIFY_TOKEN, 'local-whatsapp-test');
  } finally {
    if (previous === undefined) delete process.env[key];
    else process.env[key] = previous;
  }
});

test('runner reports failed subprocesses and captures successful output', async () => {
  assert.match(await command(process.execPath, ['-e', 'console.log("ready")']), /ready/);
  await assert.rejects(command(process.execPath, ['-e', 'process.exit(3)']), /çıkış kodu 3/);
  await assert.rejects(command('missing-kali-test-executable', []), /başlatılamadı/);
});

test('runner terminates a stalled subprocess', async () => {
  await assert.rejects(command(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], 200), /tamamlanmadı/);
});

test('runner reports an occupied port without closing its owner', async () => {
  const server = net.createServer();
  const ready = once(server, 'listening');
  server.listen(8000);
  try {
    await ready;
    await assert.rejects(checkPort(), /8000 portu kullanılamıyor/);
    assert.equal(server.listening, true);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
