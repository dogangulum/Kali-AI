// Manage the shared generation account pool (CapCut, ElevenLabs, ...).
//   node worker/scripts/accounts.cjs list
//   node worker/scripts/accounts.cjs add <provider> <label> <ENV_VAR_WITH_SECRET> <quota> <daily|monthly|none> [priority]
//   node worker/scripts/accounts.cjs disable <provider> <label>
// credential_ref is the NAME of the env var holding the API key/password on
// the server, never the secret itself. Needs SUPABASE_URL,
// SUPABASE_SERVICE_ROLE_KEY and KALI_BUSINESS_ID in the environment.
const { createClient } = require('@supabase/supabase-js');
const R = require('../lib/rules.cjs');

async function main() {
  const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, KALI_BUSINESS_ID } = process.env;
  const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  const [cmd, provider, label, ref, quota, period, priority] = process.argv.slice(2);
  if (cmd === 'add') {
    if (!/^[A-Z][A-Z0-9_]*$/.test(ref || '')) throw new Error('third argument must be an ENV VAR NAME like CAPCUT_CC1, not a secret');
    const q = Number(quota);
    const resets = period === 'none' ? null : new Date(Date.now() + (period === 'monthly' ? 30 : 1) * 86_400_000).toISOString();
    const { error } = await db.from('generation_accounts').upsert({
      business_id: KALI_BUSINESS_ID, provider, label, credential_ref: ref, quota: q, credits_remaining: q,
      reset_period: period || 'daily', resets_at: resets, priority: Number(priority || 100), active: true,
    }, { onConflict: 'business_id,provider,label' });
    if (error) throw error;
    console.log(`eklendi: ${provider}/${label}`);
  } else if (cmd === 'disable') {
    const { error } = await db.from('generation_accounts').update({ active: false })
      .eq('business_id', KALI_BUSINESS_ID).eq('provider', provider).eq('label', label);
    if (error) throw error;
    console.log(`kapatıldı: ${provider}/${label}`);
  } else {
    const { data, error } = await db.from('generation_accounts').select('*').eq('business_id', KALI_BUSINESS_ID).order('provider');
    if (error) throw error;
    const now = Date.now();
    for (const a of data) {
      console.log(`${a.active ? ' ' : 'x'} ${a.provider.padEnd(11)} ${a.label.padEnd(12)} kredi=${R.effectiveCredits(a, now)}/${a.quota} (${a.reset_period}) öncelik=${a.priority}${a.last_error ? ` hata=${a.last_error}` : ''}`);
    }
  }
}
main().catch((e) => { console.error(e.message || e); process.exit(1); });
