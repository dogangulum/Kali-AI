const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readdirSync, readFileSync } = require('node:fs');
const path = require('node:path');
const dir = path.join(__dirname, 'fixtures');

for (const file of readdirSync(dir).filter((name) => name.endsWith('.json'))) {
  const instagram = file.startsWith('instagram-');
  test(`fixture: ${file} has the message shape consumed by its handler`, () => {
    const payload = JSON.parse(readFileSync(path.join(dir, file), 'utf8'));
    assert.equal(payload.object, instagram ? 'instagram' : 'whatsapp_business_account');
    assert.ok(Array.isArray(payload.entry) && payload.entry.length > 0);
    for (const entry of payload.entry) {
      if (instagram) {
        assert.ok(Array.isArray(entry.messaging) && entry.messaging.length > 0, 'entry.messaging is required for this handler');
        for (const event of entry.messaging) {
          assert.equal(typeof event.sender.id, 'string');
          assert.ok(event.message);
        }
      } else {
        assert.ok(Array.isArray(entry.changes) && entry.changes.length > 0);
        for (const { value } of entry.changes) {
          if (file.includes('read-receipt')) {
            assert.ok(value.statuses.length > 0);
            assert.equal(value.messages, undefined);
          } else {
            assert.ok(value.messages.length > 0);
            for (const message of value.messages) {
              assert.equal(typeof message.from, 'string');
              assert.ok(message.id);
              if (message.type === 'text') assert.ok(message.text.body.trim());
              else assert.ok(message.image);
            }
          }
        }
      }
    }
  });
}
