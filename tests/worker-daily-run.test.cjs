const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createDb, recorder } = require('./helpers/content-pipeline.cjs');
const R = require('../worker/lib/rules.cjs');
const { runDaily } = require('../worker/lib/daily-run.cjs');
const { runStepWithRetries } = require('../worker/lib/retry-runner.cjs');
const { withAccount } = require('../worker/lib/credit-pool.cjs');

const BIZ = 'biz-1';
const CHAT = '111';
const rules = R.resolvePipelineRules({
  content_pipeline: {
    services: [{ key: 'a', name: 'Hizmet A', sub_topics: ['a1'] }, { key: 'b', name: 'Hizmet B', sub_topics: ['b1'] }],
    approver_telegram_chat_ids: [CHAT],
  },
}, 'Europe/Istanbul');
const NOW = Date.parse('2026-10-01T05:00:00Z'); // 08:00 local

const acct = (id, provider, credits, priority) => ({
  id, business_id: BIZ, provider, label: id, reset_period: 'daily', quota: 10,
  credits_remaining: credits, resets_at: '2026-10-02T00:00:00Z', priority, active: true,
});

function fakeProviders(overrides = {}) {
  const calls = [];
  let n = 0;
  return {
    calls,
    findCompetitorVideos: async () => [{ source_url: 'https://ig/r/bad' }, { source_url: 'https://ig/r/good' }],
    analyzeCompetitor: async ({ video }) => (video.source_url.endsWith('good')
      ? { fit: true, scenario: { beats: 4 } } : { fit: false, reason: 'başka sektör' }),
    inventSubTopic: async () => 'yeni-konu',
    writeCaption: async ({ variant }) => ({ caption: `metin ${variant}`, hashtags: ['#a'], features: { hook: variant === 2 ? 'soru' : 'liste' } }),
    generateImage: async () => ({ url: 'img' }),
    generateVideo: async ({ account }) => { calls.push(['video', account.id]); return { url: `vid-${++n}` }; },
    generateVoiceover: async ({ account }) => { calls.push(['voice', account.id]); return { url: 'voice' }; },
    pickMusic: async () => ({ name: 'm', mood: 'enerjik' }),
    merge: async ({ videoUrl }) => ({ url: `final-${videoUrl}` }),
    publish: async ({ onPublished }) => { await onPublished({ format: 'reel', mediaId: 'ig-1' }); },
    ...overrides,
  };
}

function setup(seed = {}, providerOverrides) {
  const db = createDb({
    content_plans: [], content_candidates: [], competitor_analyses: [], content_change_requests: [],
    content_performance: [], automation_attempts: [], generation_credit_events: [],
    generation_accounts: [acct('cc1', 'capcut', 10, 1), acct('el1', 'elevenlabs', 10, 1)],
    ...seed,
  });
  const r = recorder();
  const notes = [];
  const providers = fakeProviders(providerOverrides);
  const ctx = { db: db.client, businessId: BIZ, rules, nowMs: NOW, providers, send: r.send, notify: async (t) => notes.push(t) };
  return { db, r, notes, providers, ctx };
}

test('daily run: rejects unfit competitor, makes 3 candidates, selects one, sends draft', async () => {
  const s = setup();
  const out = await runDaily(s.ctx);
  const plan = s.db.tables.content_plans[0];
  assert.equal(plan.plan_date, '2026-10-01');
  assert.equal(plan.service_key, 'a');
  assert.equal(plan.status, 'awaiting_approval');
  assert.equal(plan.scheduled_publish_at, '2026-10-01T16:00:00.000Z');
  assert.deepEqual(s.db.tables.competitor_analyses.map((c) => c.fit_decision), ['rejected', 'accepted']);
  assert.equal(s.db.tables.content_candidates.length, 3);
  assert.equal(s.db.tables.content_candidates.filter((c) => c.selected).length, 1);
  const draft = s.r.calls.find((c) => c.method === 'sendVideo');
  assert.equal(draft.body.chat_id, CHAT);
  assert.equal(out.skipped, null);
  // second run the same day does nothing new
  const again = await runDaily(s.ctx);
  assert.equal(again.skipped, 'plan_exists');
  assert.equal(s.db.tables.content_plans.length, 1);
});

test('daily run: competitor videos already analysed are not re-used', async () => {
  const s = setup({ competitor_analyses: [{ business_id: BIZ, source_url: 'https://ig/r/good', fit_decision: 'accepted' }] });
  await runDaily(s.ctx);
  assert.equal(s.db.tables.competitor_analyses.length, 2); // only "bad" was newly analysed
  assert.equal(s.db.tables.content_plans[0].competitor_analysis_id ?? null, null);
});

test('daily run: queued (late-approved) content is published before new content is made', async () => {
  const s = setup({
    content_plans: [{ id: 'old', business_id: BIZ, plan_date: '2026-09-30', service_key: 'b', sub_topic: 'b1', status: 'queued', selected_candidate_id: 'c-old' }],
    content_candidates: [{ id: 'c-old', business_id: BIZ, plan_id: 'old', video_url: 'v' }],
  });
  const out = await runDaily(s.ctx);
  assert.deepEqual(out.published, ['old']);
  assert.equal(s.db.tables.content_plans.find((p) => p.id === 'old').status, 'published');
  assert.equal(s.db.tables.content_performance[0].platform_media_id, 'ig-1');
});

test('credit pool: switches to the next CapCut account when one runs out', async () => {
  const s = setup({
    generation_accounts: [acct('cc1', 'capcut', 1, 1), acct('cc2', 'capcut', 10, 2), acct('el1', 'elevenlabs', 10, 1)],
  }, {
    generateVideo: async ({ account }) => {
      if (account.id === 'cc1') { const e = new Error('no credit'); e.code = 'OUT_OF_CREDIT'; throw e; }
      return { url: 'v' };
    },
  });
  const res = await withAccount({ db: s.ctx.db, businessId: BIZ, provider: 'capcut', needed: 1, nowMs: NOW, planId: null,
    fn: (account) => s.providers.generateVideo({ account }) });
  assert.equal(res.url, 'v');
  const accts = Object.fromEntries(s.db.tables.generation_accounts.map((a) => [a.id, a.credits_remaining]));
  assert.equal(accts.cc1, 0);
  assert.equal(accts.cc2, 9);
});

test('credit pool: all accounts empty -> plan fails with a Telegram alert', async () => {
  const s = setup({ generation_accounts: [acct('cc1', 'capcut', 0, 1), acct('el1', 'elevenlabs', 10, 1)] });
  const out = await runDaily(s.ctx);
  assert.equal(out.skipped, 'failed');
  assert.equal(s.db.tables.content_plans[0].status, 'failed');
  assert.match(s.notes[0], /Yeni hesap eklenmeli/);
});

test('retry runner: screenshots each failure, refreshes selectors, notifies after 3rd', async () => {
  const s = setup();
  const seen = [];
  await assert.rejects(runStepWithRetries({
    db: s.ctx.db, businessId: BIZ, planId: 'p', step: 'capcut_video', rules,
    run: async ({ attempt, refreshSelectors }) => { seen.push([attempt, refreshSelectors]); throw new Error('selector not found'); },
    screenshot: async ({ attempt }) => `shot-${attempt}`,
    notify: async (t) => s.notes.push(t),
  }), /failed after 3 attempts/);
  assert.deepEqual(seen, [[1, false], [2, true], [3, true]]);
  assert.deepEqual(s.db.tables.automation_attempts.map((a) => a.screenshot_url), ['shot-1', 'shot-2', 'shot-3']);
  assert.equal(s.notes.length, 1);
});

test('retry runner: succeeds on 2nd attempt without notifying', async () => {
  const s = setup();
  let n = 0;
  const res = await runStepWithRetries({
    db: s.ctx.db, businessId: BIZ, planId: 'p', step: 'x', rules,
    run: async () => { if (++n === 1) throw new Error('flaky'); return 'ok'; },
    notify: async (t) => s.notes.push(t),
  });
  assert.equal(res, 'ok');
  assert.equal(s.notes.length, 0);
});

test('change request: only the chosen layer is regenerated and the draft is re-sent', async () => {
  const s = setup({
    content_plans: [{ id: 'p1', business_id: BIZ, plan_date: '2026-10-01', service_key: 'a', sub_topic: 'a1', status: 'regenerating', selected_candidate_id: 'c1' }],
    content_candidates: [{ id: 'c1', business_id: BIZ, plan_id: 'p1', variant: 2, revision: 1, video_url: 'orig-video', voiceover_url: 'orig-voice', caption: 'eski', hashtags: [], music: 'm', features: { hook: 'soru' }, selected: true }],
    content_change_requests: [{ id: 'cr1', business_id: BIZ, plan_id: 'p1', layer: 'music', status: 'open' }],
  });
  const out = await runDaily(s.ctx);
  assert.deepEqual(out.changes, ['cr1']);
  assert.equal(s.providers.calls.length, 0); // no new video, no new voiceover
  const newest = s.db.tables.content_candidates.find((c) => c.revision === 2);
  assert.equal(newest.selected, true);
  assert.equal(newest.caption, 'eski');
  assert.equal(s.db.tables.content_plans.find((p) => p.id === 'p1').status, 'awaiting_approval');
});
