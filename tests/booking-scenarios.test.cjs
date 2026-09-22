const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync, readdirSync } = require('node:fs');
const path = require('node:path');
const suite = require('./scenarios/booking-cases.json');

test('booking catalogue: payload messages match scenarios and all review notes have coverage', () => {
  const ids = new Set(), messageIds = new Set(), refs = new Set();
  const dir = path.join(__dirname, 'fixtures');
  for (const scenario of suite.cases) {
    assert.ok(!ids.has(scenario.id), 'duplicate scenario id');
    ids.add(scenario.id);
    const fixture = JSON.parse(readFileSync(path.join(dir, `whatsapp-booking-${scenario.id}.json`), 'utf8'));
    const message = fixture.entry[0].changes[0].value.messages[0];
    assert.equal(message.text.body, scenario.message);
    assert.ok(!messageIds.has(message.id), 'duplicate message id');
    messageIds.add(message.id);
    assert.equal(Number(message.timestamp), Date.parse(scenario.clock ?? suite.clock) / 1000);
    assert.ok(scenario.given.trim() && scenario.expect.trim());
    for (const ref of scenario.refs) refs.add(ref);
  }
  assert.equal(readdirSync(dir).filter((file) => /^whatsapp-booking-.*\.json$/u.test(file)).length, ids.size);
  for (let i = 1; i <= 26; i++) assert.ok(refs.has(`R${String(i).padStart(2, '0')}`), `missing R${i}`);
});
