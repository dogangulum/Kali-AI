const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { runCheckScript } = require('./helpers/run-check-script.cjs');

async function run(answers, { result = { status: 0 }, files = ['whatsapp-b.json', 'instagram-a.json'], exists = true } = {}) {
  const calls = [];
  const remaining = [...answers];
  const output = await runCheckScript('dev-tools.cjs', {
    io: { existsSync: () => exists, readdirSync: () => files },
    modules: {
      child_process: { spawnSync: (cmd, args, options) => { calls.push({ cmd, args, options }); return result; } },
      readline: { createInterface: () => ({
        close() {}, question(prompt, callback) {
          if (!remaining.length) throw new Error(`Unexpected prompt: ${prompt}`);
          callback(remaining.shift());
        },
      }) },
    },
  });
  assert.equal(remaining.length, 0);
  return { ...output, calls };
}

test('dev-tools: quit exits without launching a process', async () => {
  const result = await run(['q']);
  assert.equal(result.exitCode, 0);
  assert.equal(result.calls.length, 0);
});

test('dev-tools: invalid choice redisplays menu without launching a process', async () => {
  const result = await run(['99', 'q']);
  assert.match(result.stdout, /Geçersiz seçim/);
  assert.equal(result.calls.length, 0);
});

test('dev-tools: selected tool receives project working directory', async () => {
  const result = await run(['1', '', 'q']);
  assert.equal(result.calls.length, 1);
  assert.equal(path.basename(result.calls[0].args[0]), 'check-env.cjs');
  assert.equal(result.calls[0].options.cwd, path.resolve(__dirname, '..'));
  assert.match(result.stdout, /Tamamlandı/);
});

test('dev-tools: missing script is reported without spawning', async () => {
  const result = await run(['1', '', 'q'], { exists: false });
  assert.equal(result.calls.length, 0);
  assert.match(result.stdout, /check-env.cjs bulunamadı/);
});

test('dev-tools: fixture selection is sorted and optional bad-signature flag is forwarded', async () => {
  const result = await run(['4', '1', 'e', '', 'q']);
  assert.equal(path.basename(result.calls[0].args[0]), 'simulate-webhook.cjs');
  assert.equal(result.calls[0].args[1], path.join('tests', 'fixtures', 'instagram-a.json'));
  assert.equal(result.calls[0].args[2], '--bad-signature');
});

test('dev-tools: child failure is displayed instead of a completion message', async () => {
  const result = await run(['5', '', 'q'], { result: { status: 3 } });
  assert.match(result.stdout, /Çıkış kodu: 3/);
  assert.doesNotMatch(result.stdout, /✓ Tamamlandı/);
});

test('dev-tools: quoted log path remains a single argument', {
  todo: 'KAPSAM-06: whitespace splitting breaks quoted paths in getWebhookArgs.',
}, async () => {
  const result = await run(['2', '--log-file "logs/my file.log"', '', 'q']);
  assert.equal(result.calls[0].args[2], 'logs/my file.log');
});
