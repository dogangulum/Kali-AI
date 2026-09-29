// Telegram approval bot setup helper (needs TELEGRAM_BOT_TOKEN in env).
//   node scripts/setup-telegram.cjs chats
//       -> after the approver sends /start to the bot, prints their chat id
//   node scripts/setup-telegram.cjs webhook https://<ref>.supabase.co/functions/v1/telegram-approval-webhook
//       -> registers the webhook with TELEGRAM_WEBHOOK_SECRET as secret_token
//   node scripts/setup-telegram.cjs info
async function api(method, body) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error('TELEGRAM_BOT_TOKEN is not set');
  const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}),
  });
  const j = await res.json();
  if (!j.ok) throw new Error(`${method}: ${j.description}`);
  return j.result;
}

async function main() {
  const [cmd, url] = process.argv.slice(2);
  if (cmd === 'chats') {
    const info = await api('getWebhookInfo');
    if (info.url) console.log('Not: webhook kurulu olduğu için getUpdates boş dönebilir; önce chat id alıp sonra webhook kurun.');
    const updates = await api('getUpdates');
    const seen = new Map();
    for (const u of updates) {
      const m = u.message || u.edited_message;
      if (m && m.chat) seen.set(String(m.chat.id), [m.chat.first_name, m.chat.last_name, m.chat.username && `@${m.chat.username}`].filter(Boolean).join(' '));
    }
    if (!seen.size) console.log('Henüz mesaj yok. Onaylayacak kişi bota /start yazsın, sonra tekrar çalıştırın.');
    for (const [id, who] of seen) console.log(`${id}\t${who}`);
  } else if (cmd === 'webhook') {
    const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
    if (!url || !secret) throw new Error('usage: webhook <url>  (TELEGRAM_WEBHOOK_SECRET must be set)');
    await api('setWebhook', { url, secret_token: secret, allowed_updates: ['message', 'callback_query'], drop_pending_updates: true });
    await api('setMyCommands', { commands: [{ command: 'kredi', description: 'Kaç günlük kredi kaldı?' }] });
    console.log('Webhook kuruldu.');
  } else {
    console.log(JSON.stringify(await api('getWebhookInfo'), null, 2));
  }
}
main().catch((e) => { console.error(e.message); process.exit(1); });
