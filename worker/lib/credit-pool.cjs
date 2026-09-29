// Picks a generation account with enough credit, runs `fn(account)`, then
// records the spend. If the provider reports OUT_OF_CREDIT, that account is
// zeroed and the next one is tried. No accounts left -> OUT_OF_CREDIT_ALL.
const { pickAccount } = require('./rules.cjs');

async function withAccount({ db, businessId, provider, needed, nowMs, planId, fn }) {
  const tried = new Set();
  for (;;) {
    const { data: accounts } = await db.from('generation_accounts').select('*')
      .eq('business_id', businessId).eq('provider', provider).eq('active', true);
    const account = pickAccount((accounts || []).filter((a) => !tried.has(a.id)), provider, needed, nowMs);
    if (!account) {
      const e = new Error(`${provider}: no account has ${needed} credits left`);
      e.code = 'OUT_OF_CREDIT_ALL';
      throw e;
    }
    tried.add(account.id);
    // Apply a due reset before spending.
    let balance = Number(account.credits_remaining);
    if (account.reset_period !== 'none' && account.resets_at && Date.parse(account.resets_at) <= nowMs) {
      balance = Number(account.quota);
    }
    try {
      const result = await fn(account);
      const spent = result && Number.isFinite(result.creditsUsed) ? result.creditsUsed : needed;
      await db.from('generation_accounts').update({
        credits_remaining: Math.max(0, balance - spent), updated_at: new Date(nowMs).toISOString(),
      }).eq('id', account.id);
      await db.from('generation_credit_events').insert({
        business_id: businessId, account_id: account.id, plan_id: planId, delta: -spent, reason: provider,
      });
      return result;
    } catch (err) {
      if (err && err.code === 'OUT_OF_CREDIT') {
        await db.from('generation_accounts').update({ credits_remaining: 0, last_error: 'out of credit' }).eq('id', account.id);
        continue;
      }
      throw err;
    }
  }
}

module.exports = { withAccount };
