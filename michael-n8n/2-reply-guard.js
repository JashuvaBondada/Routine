// n8n Code node: "Reply Guard"   (Mode: Run Once for All Items)
// Put this between the AI node and the Send node.
// Drops the reply if the AI said SKIP or if it repeats something already sent in this chat.

const SIMILARITY_LIMIT = 0.8;    // 80% the same words = treated as a repeat
const REMEMBER = 20;             // replies remembered per chat

const store = $getWorkflowStaticData('global');
store.sent = store.sent || {};

const incoming = $('Filter Incoming').all();
const out = [];

$input.all().forEach((item, i) => {
  const reply = String(item.json.output ?? item.json.text ?? item.json.message?.content ?? '').trim();
  const chatId = incoming[i]?.json.chatId ?? incoming[0]?.json.chatId;
  if (!reply || /^skip\.?$/i.test(reply)) return;

  const clean = s => s.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, '').replace(/\s+/g, ' ').trim();
  const now = clean(reply);
  const history = store.sent[chatId] || [];
  if (history.some(old => old === now || similarity(old, now) >= SIMILARITY_LIMIT)) return;

  history.push(now);
  store.sent[chatId] = history.slice(-REMEMBER);
  out.push({ json: { ...item.json, chatId, reply } });
});

return out;

// Word-overlap similarity (0..1)
function similarity(a, b) {
  const A = new Set(a.split(' ')), B = new Set(b.split(' '));
  const same = [...A].filter(w => B.has(w)).length;
  return same / Math.max(A.size, B.size, 1);
}
