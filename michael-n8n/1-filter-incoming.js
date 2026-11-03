// n8n Code node: "Filter Incoming"   (Mode: Run Once for All Items)
// Put this right after the chat trigger, before the AI node.
// Lets a message through only if Michael should answer it, and adds:
//   chatId, sender, senderName, text, isGroup, allowGreeting
// Returns nothing (workflow stops) when Michael should stay quiet.

// ====== EDIT THESE ======
const MY_NUMBER = '919999999999';          // your WhatsApp number, digits only
const MY_NAMES = ['michael'];              // names people use to tag you (lowercase)
const WORK_KEYWORDS = [                    // words that mean "this is about our work"
  'project', 'deadline', 'client', 'task', 'update', 'report', 'meeting', 'invoice',
];
const TIMEZONE = 'Asia/Kolkata';
// ========================

const store = $getWorkflowStaticData('global');
store.seenIds = store.seenIds || [];
store.lastGreet = store.lastGreet || {};

const today = new Date().toLocaleDateString('en-CA', { timeZone: TIMEZONE });
const out = [];

for (const item of $input.all()) {
  const m = normalize(item.json);
  if (!m || !m.text) continue;                    // no text (sticker, status, etc.)
  if (m.fromMe) continue;                         // never answer our own messages

  // 1. Same message delivered twice (webhook retry) -> answer only once
  if (m.id) {
    if (store.seenIds.includes(m.id)) continue;
    store.seenIds.push(m.id);
    if (store.seenIds.length > 500) store.seenIds.splice(0, store.seenIds.length - 500);
  }

  // 2. Groups: answer only if tagged, replied to, or it's about our work
  if (m.isGroup) {
    const lower = m.text.toLowerCase();
    const tagged =
      m.mentions.some(j => j.replace(/\D/g, '').startsWith(MY_NUMBER)) ||
      lower.includes('@' + MY_NUMBER) ||
      MY_NAMES.some(n => new RegExp(`(^|\\W)@?${n}(\\W|$)`).test(lower));
    const repliedToMe = m.quotedParticipant &&
      m.quotedParticipant.replace(/\D/g, '').startsWith(MY_NUMBER);
    const aboutWork = WORK_KEYWORDS.some(k => new RegExp(`\\b${k}`).test(lower));
    if (!tagged && !repliedToMe && !aboutWork) continue;
  }

  // 3. Greet only on the first message of the day from this person in this chat
  const key = `${m.chatId}|${m.sender}`;
  const allowGreeting = store.lastGreet[key] !== today;
  store.lastGreet[key] = today;

  out.push({ json: { ...item.json, chatId: m.chatId, sender: m.sender,
    senderName: m.senderName, text: m.text, isGroup: m.isGroup, allowGreeting } });
}

return out;

// Reads the common WhatsApp payload shapes (Evolution API / Baileys, WhatsApp Cloud API).
function normalize(j) {
  const d = j.body?.data || j.data || j;
  if (d.key && d.message !== undefined) {             // Evolution API / Baileys
    const msg = d.message || {};
    const ext = msg.extendedTextMessage || {};
    const ctx = ext.contextInfo || {};
    const chatId = d.key.remoteJid || '';
    return {
      id: d.key.id, fromMe: !!d.key.fromMe, chatId,
      isGroup: chatId.endsWith('@g.us'),
      sender: d.key.participant || chatId,
      senderName: d.pushName || '',
      text: msg.conversation || ext.text || msg.imageMessage?.caption || '',
      mentions: ctx.mentionedJid || [],
      quotedParticipant: ctx.participant || '',
    };
  }
  const v = j.body?.entry?.[0]?.changes?.[0]?.value || j.entry?.[0]?.changes?.[0]?.value;
  if (v?.messages?.[0]) {                              // WhatsApp Cloud API (no groups)
    const msg = v.messages[0];
    return {
      id: msg.id, fromMe: false, chatId: msg.from, isGroup: false,
      sender: msg.from, senderName: v.contacts?.[0]?.profile?.name || '',
      text: msg.text?.body || '', mentions: [], quotedParticipant: '',
    };
  }
  return null;
}
