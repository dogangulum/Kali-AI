// Runs one automation step with the pipeline's retry rule: on failure take
// a screenshot, let the step refresh its selectors, try again; after
// rules.max_attempts failures, notify the approvers and give up. Every
// attempt is written to automation_attempts.
const { retryDecision } = require('./rules.cjs');

async function runStepWithRetries({ db, businessId, planId, step, rules, run, screenshot, notify, accountId = null }) {
  let lastError;
  for (let attempt = 1; ; attempt++) {
    const { data: rows } = await db.from('automation_attempts').insert({
      business_id: businessId, plan_id: planId, step, attempt, status: 'running', account_id: accountId,
    }).select('id');
    const attemptId = rows && rows[0] && rows[0].id;
    try {
      const result = await run({ attempt, refreshSelectors: attempt > 1 });
      await db.from('automation_attempts').update({ status: 'succeeded', finished_at: new Date().toISOString() }).eq('id', attemptId);
      return result;
    } catch (err) {
      lastError = err;
      let screenshotUrl = null;
      if (screenshot) {
        try { screenshotUrl = await screenshot({ step, attempt }); } catch { /* best effort */ }
      }
      await db.from('automation_attempts').update({
        status: 'failed', error: String(err && err.message || err).slice(0, 2000),
        screenshot_url: screenshotUrl, finished_at: new Date().toISOString(),
      }).eq('id', attemptId);
      if (err && (err.code === 'OUT_OF_CREDIT' || err.code === 'LOGIN_REQUIRED')) throw err; // credit pool switches account
      const decision = retryDecision(attempt, rules);
      if (!decision.retry) {
        if (notify) await notify(`⚠️ "${step}" adımı ${attempt} denemede başarısız oldu: ${String(err && err.message || err).slice(0, 300)}`);
        const e = new Error(`${step} failed after ${attempt} attempts: ${err && err.message || err}`);
        e.cause = lastError;
        e.code = 'STEP_FAILED';
        throw e;
      }
    }
  }
}

module.exports = { runStepWithRetries };
