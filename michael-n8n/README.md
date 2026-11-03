# Michael (n8n) — reply like a real person

Fixes: "Hi Saurabh" on every message, repeated messages, and replying to random group chatter.

## Wire it into the workflow

```
WhatsApp Trigger → [Filter Incoming] → AI Agent (+ Window Buffer Memory) → [Reply Guard] → Send Message
```

1. **Filter Incoming**: add a Code node right after the trigger. Name it exactly `Filter Incoming` and paste in `1-filter-incoming.js`. Edit the top block: `MY_NUMBER`, `MY_NAMES`, `WORK_KEYWORDS`, `TIMEZONE`.
2. **AI Agent**: replace the system prompt with `system-prompt.md`. Set the user message to `{{ $json.text }}`.
   Attach **Window Buffer Memory** with Session Key `{{ $('Filter Incoming').item.json.chatId }}` and Context Window `15`, so Michael remembers the chat.
3. **Reply Guard**: add a Code node between the AI Agent and the Send node. Paste in `2-reply-guard.js`.
4. **Send node**: set the text to `{{ $json.reply }}` and the recipient to `{{ $json.chatId }}`.
5. **Activate** the workflow. Static data, which holds the greeting dates, seen message IDs and sent replies, only saves on production (active) runs, not on manual test runs.

Also check that only **one** trigger or workflow listens to the same WhatsApp number. Two active copies is a common cause of double messages.

## Test locally
```bash
node michael-n8n/test.js
```
