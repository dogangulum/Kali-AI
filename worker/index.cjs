// Oracle worker entrypoint: `node worker/index.cjs` (run by the systemd
// timer in systemd/kali-ai-content.timer). Reads secrets from env only.
const { createClient } = require('@supabase/supabase-js');
const R = require('./lib/rules.cjs');
const { runDaily } = require('./lib/daily-run.cjs');
const { createProviders } = require('./providers/index.cjs');

async function main() {
  const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, KALI_BUSINESS_ID, TELEGRAM_BOT_TOKEN } = process.env;
  for (const [k, v] of Object.entries({ SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, KALI_BUSINESS_ID, TELEGRAM_BOT_TOKEN })) {
    if (!v) throw new Error(`${k} is not set`);
  }
  const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  const [{ data: biz }, { data: cfg }] = await Promise.all([
    db.from('businesses').select('timezone').eq('id', KALI_BUSINESS_ID).maybeSingle(),
    db.from('business_config').select('config').eq('business_id', KALI_BUSINESS_ID).maybeSingle(),
  ]);
  const rules = R.resolvePipelineRules(cfg && cfg.config, (biz && biz.timezone) || 'Europe/Istanbul');
  const send = R.createTelegramSender(TELEGRAM_BOT_TOKEN, fetch);
  const notify = async (text) => {
    for (const chat_id of rules.approver_telegram_chat_ids) {
      try { await send('sendMessage', { chat_id, text }); } catch (e) { console.error('notify failed:', e.message); }
    }
  };
  const summary = await runDaily({
    db, businessId: KALI_BUSINESS_ID, rules, nowMs: Date.now(),
    providers: createProviders({ env: process.env, config: cfg && cfg.config, db, businessId: KALI_BUSINESS_ID }), send, notify,
  });
  console.log(JSON.stringify(summary));
}

main().catch((err) => { console.error(err); process.exit(1); });
