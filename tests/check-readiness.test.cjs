const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { inspect } = require('../scripts/check-readiness.cjs');

const root = path.resolve(__dirname, 'fake-project');
const io = {
  statSync: () => ({ isFile: () => true, size: 10 }),
  readFileSync: () => '{}',
};
const execute = (cmd) => cmd === 'deno'
  ? { status: 0, stdout: 'deno 2.0.0\n' }
  : { status: 0, stdout: 'Tüm ortam değişkenleri mevcut.' };

for (const [label, stat] of [
  ['empty', { isFile: () => true, size: 0 }],
  ['directory', { isFile: () => false, size: 10 }],
]) {
  test(`readiness: ${label} at a required file path is a failure`, () => {
    const results = inspect(root, { io: { ...io, statSync: () => stat }, execute, nodeVersion: '24.0.0' });
    assert.equal(results.find((r) => r.name === 'package.json').ok, false);
    assert.equal(results.find((r) => r.name === 'Ortam değişkeni adları').ok, false);
  });
}

test('readiness: subprocess timeout/throw is reported, not mistaken for readiness', () => {
  const results = inspect(root, { io, nodeVersion: '24.0.0', execute: () => { throw new Error('timeout'); } });
  assert.equal(results.find((r) => r.name === 'Deno 2').ok, false);
  assert.equal(results.find((r) => r.name === 'Ortam değişkeni adları').ok, false);
});

test('readiness: wrong Deno major fails even when version command exits successfully', () => {
  const results = inspect(root, { io, nodeVersion: '24.0.0', execute: (cmd) => cmd === 'deno'
    ? { status: 0, stdout: 'deno 1.46.0' } : execute(cmd) });
  assert.equal(results.find((r) => r.name === 'Deno 2').ok, false);
});

test('readiness: complete local inventory passes without external connections', () => {
  assert.ok(inspect(root, { io, execute, nodeVersion: '22.13.0' }).every((r) => r.ok));
});

test('readiness: missing local env prevents executing the env checker', () => {
  const calls = [];
  const results = inspect(root, {
    io: { ...io, statSync(file) {
      if (file.endsWith('.env.local')) throw new Error('missing');
      return io.statSync(file);
    } },
    execute(cmd) { calls.push(cmd); return execute(cmd); }, nodeVersion: '22.13.0',
  });
  assert.equal(results.find((r) => r.name === '.env.local').ok, false);
  assert.equal(results.find((r) => r.name === 'Ortam değişkeni adları').ok, false);
  assert.deepEqual(calls, ['deno']);
});

test('readiness: invalid JSON, old Node and unavailable Deno fail', () => {
  const results = inspect(root, {
    io: { ...io, readFileSync: () => 'invalid-json' }, nodeVersion: '22.12.0',
    execute: () => ({ status: null, error: new Error('unavailable') }),
  });
  assert.equal(results.find((r) => r.name === 'package.json: JSON').ok, false);
  assert.equal(results.find((r) => r.name === 'Node.js').ok, false);
  assert.equal(results.find((r) => r.name === 'Deno 2').ok, false);
});

test('readiness: missing variable names are reported without echoing raw output', () => {
  const results = inspect(root, { io, nodeVersion: '22.13.0', execute(cmd) {
    if (cmd === 'deno') return execute(cmd);
    return { status: 1, stdout: 'Eksik ortam değişkenleri:\n  - MISSING_SETTING\nfake-private-value', stderr: 'fake-private-value' };
  } });
  const result = results.find((r) => r.name === 'Ortam değişkeni adları');
  assert.equal(result.ok, false);
  assert.match(result.detail, /MISSING_SETTING/);
  assert.doesNotMatch(JSON.stringify(results), /fake-private-value/);
});
