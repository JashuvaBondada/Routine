// Run: node michael-n8n/test.js   — simulates n8n running the two Code nodes.
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const store = {};
const load = f => new Function('$input', '$getWorkflowStaticData', '$',
  fs.readFileSync(path.join(__dirname, f), 'utf8'));
const filterNode = load('1-filter-incoming.js');
const guardNode = load('2-reply-guard.js');

let lastFiltered = [];
const filter = payload => {
  lastFiltered = filterNode({ all: () => [{ json: payload }] }, () => store, null);
  return lastFiltered;
};
const guard = output => guardNode({ all: () => [{ json: { output } }] }, () => store,
  () => ({ all: () => lastFiltered }));

let n = 0;
const msg = (text, o = {}) => ({ data: {
  key: { id: o.id || 'id' + (++n), fromMe: !!o.fromMe, remoteJid: o.chat || '911111111111@s.whatsapp.net', participant: o.from },
  pushName: 'Saurabh',
  message: o.mentions || o.quoted
    ? { extendedTextMessage: { text, contextInfo: { mentionedJid: o.mentions || [], participant: o.quoted } } }
    : { conversation: text },
} });

// Greeting only on the first message of the day
assert.strictEqual(filter(msg('Good morning'))[0].json.allowGreeting, true);
assert.strictEqual(filter(msg('Did you send the file?'))[0].json.allowGreeting, false);

// Same message ID twice -> one reply
assert.strictEqual(filter(msg('hello', { id: 'dup' })).length, 1);
assert.strictEqual(filter(msg('hello', { id: 'dup' })).length, 0);

// Our own messages are ignored
assert.strictEqual(filter(msg('hi', { fromMe: true })).length, 0);

// Groups
const g = { chat: '1203@g.us', from: '912222222222@s.whatsapp.net' };
assert.strictEqual(filter(msg('lol did you watch the match', g)).length, 0, 'random chatter');
assert.strictEqual(filter(msg('@919999999999 can you check?', { ...g, mentions: ['919999999999@s.whatsapp.net'] })).length, 1, 'tagged');
assert.strictEqual(filter(msg('Michael are you free?', g)).length, 1, 'name mention');
assert.strictEqual(filter(msg('ok sure', { ...g, quoted: '919999999999@s.whatsapp.net' })).length, 1, 'reply to us');
assert.strictEqual(filter(msg('What is the project deadline?', g)).length, 1, 'about work');

// No repeated replies
filter(msg('Status?'));
assert.strictEqual(guard('Will send it by 5pm.').length, 1);
filter(msg('Status??'));
assert.strictEqual(guard('Will send it by 5pm!').length, 0, 'exact repeat blocked');
filter(msg('Any update?'));
assert.strictEqual(guard('I will send it by 5pm.').length, 0, 'near repeat blocked');
filter(msg('ok'));
assert.strictEqual(guard('SKIP').length, 0, 'SKIP not sent');
filter(msg('Where is it?'));
assert.strictEqual(guard('Uploaded to the drive just now.').length, 1, 'new reply sent');

console.log('All tests passed');
