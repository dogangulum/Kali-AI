const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadContentPipeline, createDb, recorder } = require('./helpers/content-pipeline.cjs');

const M = loadContentPipeline();
const TZ = 'Europe/Istanbul'; // UTC+3, no DST
const CHAT = '111';
const PLAN = '11111111-2222-4333-8444-555555555555';
const BIZ = 'biz-1';

// Generic test services -- not the real business's list.
const CONFIG = {
  content_pipeline: {
    services: [
      { key: 'a', name: 'Hizmet A', sub_topics: ['a1', 'a2'] },
      { key: 'b', name: 'Hizmet B', sub_topics: ['b1'] },
      { key: 'c', name: 'Hizmet C', sub_topics: ['c1', 'c2'] },
    ],
    approver_telegram_chat_ids: [CHAT],
  },
};
const rules = M.resolvePipelineRules(CONFIG, TZ);
const at = (iso) => Date.parse(iso);
const plain = (v) => JSON.parse(JSON.stringify(v)); // sandbox arrays -> this realm

test('rules: defaults applied, missing services rejected', () => {
  assert.equal(rules.candidates_per_day, 3);
  assert.equal(rules.reminder_hours_before, 3);
  assert.equal(rules.max_attempts, 3);
  assert.equal(rules.credit_warning_days, 7);
  assert.throws(() => M.resolvePipelineRules({}, TZ), /services/);
});

test('time: Istanbul wall clock converts to UTC', () => {
  assert.equal(new Date(M.zonedTimeToMs('2026-10-01', '19:00', TZ)).toISOString(), '2026-10-01T16:00:00.000Z');
  assert.equal(M.localDate(at('2026-10-01T21:30:00Z'), TZ), '2026-10-02');
});

test('topic rotation: least-recently-used service, unused sub-topic first', () => {
  const t1 = M.pickNextTopic(rules, []);
  assert.equal(t1.service_key, 'a');
  assert.equal(t1.sub_topic, 'a1');
  const history = [
    { plan_date: '2026-09-01', service_key: 'a', sub_topic: 'a1' },
    { plan_date: '2026-09-02', service_key: 'b', sub_topic: 'b1' },
  ];
  const t2 = M.pickNextTopic(rules, history);
  assert.equal(t2.service_key, 'c');
  history.push({ plan_date: '2026-09-03', service_key: 'c', sub_topic: 'c1' });
  const t3 = M.pickNextTopic(rules, history);
  assert.equal(t3.service_key, 'a');
  assert.equal(t3.sub_topic, 'a2');
  assert.equal(t3.needs_new_sub_topic, false);
  history.push({ plan_date: '2026-09-04', service_key: 'a', sub_topic: 'a2' });
  const t4 = M.pickNextTopic(rules, history);
  assert.equal(t4.service_key, 'b');
  assert.equal(t4.needs_new_sub_topic, true); // b1 used; generator must invent
  assert.deepEqual([...t4.avoid_sub_topics], ['b1']);
});

test('competitors: already analysed (accepted or rejected) videos are never reused', () => {
  const out = M.unseenCompetitorSources(
    [{ source_url: 'https://instagram.com/reel/X/?igsh=1' }, { source_url: 'https://instagram.com/reel/Y' }, { source_url: 'https://instagram.com/reel/Y/' }],
    ['https://instagram.com/reel/x'],
  );
  assert.deepEqual(plain(out.map((o) => o.source_url)), ['https://instagram.com/reel/Y']);
});

test('scoring: learns from approvals/changes/performance and explores unseen styles', () => {
  assert.ok(M.candidateReward({ approved: true, change_requests: 0 }) > M.candidateReward({ approved: true, change_requests: 2 }));
  assert.ok(M.candidateReward({ approved: true, change_requests: 0, engagement_ratio: 1.8 }) > M.candidateReward({ approved: true, change_requests: 0, engagement_ratio: 0.5 }));
  const history = [];
  for (let i = 0; i < 5; i++) history.push({ features: { hook: 'soru' }, reward: 1 });
  for (let i = 0; i < 5; i++) history.push({ features: { hook: 'liste' }, reward: -0.75 });
  const w = M.learnFeatureWeights(history);
  const ranked = M.scoreCandidates([
    { id: 'x', features: { hook: 'liste' } },
    { id: 'y', features: { hook: 'yeni-stil' } },
    { id: 'z', features: { hook: 'soru' } },
  ], w);
  assert.deepEqual(plain(ranked.map((r) => r.candidate.id)), ['z', 'y', 'x']);
});

const basePlan = {
  status: 'awaiting_approval', plan_date: '2026-10-01',
  scheduled_publish_at: '2026-10-01T16:00:00.000Z', // 19:00 local
  reminder_sent_at: null, approval_requested_at: '2026-10-01T06:00:00.000Z',
};

test('approval timing: reminder 3h before slot, expire at local midnight', () => {
  assert.equal(M.nextApprovalStep(basePlan, at('2026-10-01T12:59:00Z'), rules), 'wait');
  assert.equal(M.nextApprovalStep(basePlan, at('2026-10-01T13:00:00Z'), rules), 'send_reminder');
  assert.equal(M.nextApprovalStep({ ...basePlan, reminder_sent_at: 'x' }, at('2026-10-01T18:00:00Z'), rules), 'wait');
  assert.equal(M.nextApprovalStep({ ...basePlan, reminder_sent_at: 'x' }, at('2026-10-01T21:00:00Z'), rules), 'expire');
  assert.equal(M.nextApprovalStep({ ...basePlan, status: 'approved' }, at('2026-10-01T13:00:00Z'), rules), 'none');
});

test('approval timing: a draft sent late gets an hour before the reminder', () => {
  const late = { ...basePlan, approval_requested_at: '2026-10-01T14:00:00.000Z' };
  assert.equal(M.nextApprovalStep(late, at('2026-10-01T14:30:00Z'), rules), 'wait');
  assert.equal(M.nextApprovalStep(late, at('2026-10-01T15:00:00Z'), rules), 'send_reminder');
});

test('approval outcome: slot ahead / slot passed / next day / expired', () => {
  assert.equal(M.approvalOutcome(basePlan, at('2026-10-01T10:00:00Z'), rules), 'publish_at_slot');
  assert.equal(M.approvalOutcome(basePlan, at('2026-10-01T18:00:00Z'), rules), 'publish_now');
  assert.equal(M.approvalOutcome(basePlan, at('2026-10-01T21:10:00Z'), rules), 'queue');
  assert.equal(M.approvalOutcome({ ...basePlan, status: 'expired' }, at('2026-10-02T08:00:00Z'), rules), 'queue');
  assert.equal(M.approvalOutcome({ ...basePlan, status: 'published' }, at('2026-10-01T10:00:00Z'), rules), 'not_pending');
});

test('publish order: queued (oldest first) before today\'s approved; future slots wait', () => {
  const now = at('2026-10-02T17:00:00Z');
  const order = M.publishOrder([
    { id: 'today', status: 'approved', plan_date: '2026-10-02', scheduled_publish_at: '2026-10-02T16:00:00Z' },
    { id: 'q2', status: 'queued', plan_date: '2026-10-01', scheduled_publish_at: null },
    { id: 'q1', status: 'queued', plan_date: '2026-09-30', scheduled_publish_at: null },
    { id: 'later', status: 'approved', plan_date: '2026-10-02', scheduled_publish_at: '2026-10-02T18:00:00Z' },
  ], now);
  assert.deepEqual(plain(order.map((p) => p.id)), ['q1', 'q2', 'today']);
});

test('best publish time: learned hour with enough samples, else configured default', () => {
  assert.equal(M.bestPublishTime([], 'reel', '2026-10-01', rules), '2026-10-01T16:00:00.000Z');
  const stats = [
    ...[5, 6, 7].map((e) => ({ format: 'reel', hour: 21, engagement: e })),
    ...[2, 2, 2].map((e) => ({ format: 'reel', hour: 12, engagement: e })),
    { format: 'reel', hour: 8, engagement: 100 }, // one sample: not trusted
  ];
  assert.equal(M.bestPublishTime(stats, 'reel', '2026-10-01', rules), '2026-10-01T18:00:00.000Z');
});

const accounts = [
  { id: 'cc1', provider: 'capcut', label: '1', reset_period: 'daily', quota: 10, credits_remaining: 0, resets_at: '2026-10-02T00:00:00Z', priority: 1, active: true },
  { id: 'cc2', provider: 'capcut', label: '2', reset_period: 'daily', quota: 10, credits_remaining: 10, resets_at: '2026-10-02T00:00:00Z', priority: 2, active: true },
  { id: 'el1', provider: 'elevenlabs', label: '1', reset_period: 'monthly', quota: 100, credits_remaining: 30, resets_at: '2026-10-20T00:00:00Z', priority: 1, active: true },
];

test('credits: exhausted account is skipped for the next one, resets restore quota', () => {
  const now = at('2026-10-01T10:00:00Z');
  assert.equal(M.pickAccount(accounts, 'capcut', 3, now).id, 'cc2');
  assert.equal(M.pickAccount(accounts, 'capcut', 11, now), null);
  assert.equal(M.pickAccount(accounts, 'capcut', 3, at('2026-10-02T01:00:00Z')).id, 'cc1');
});

test('credits: days-left estimate and one-week warning', () => {
  const now = at('2026-10-01T10:00:00Z');
  const cap = M.estimateCreditDays(accounts, 'capcut', 8, now);
  assert.equal(cap.unlimited, true); // 20/day renewable > 8/day usage
  assert.equal(M.estimateCreditDays(accounts, 'capcut', 15, now).days, 0); // today only 10 left
  const el = M.estimateCreditDays(accounts, 'elevenlabs', 6, now);
  assert.equal(el.unlimited, false);
  assert.equal(el.days, 5);
  assert.equal(M.shouldWarnLowCredit(el, rules), true);
  assert.match(M.creditReport(accounts, { capcut: 8, elevenlabs: 6 }, now), /elevenlabs: yaklaşık 5 gün/);
});

test('retries: refresh and retry until the 3rd failure, then notify', () => {
  assert.equal(M.retryDecision(1, rules).retry, true);
  assert.equal(M.retryDecision(2, rules).retry, true);
  const last = M.retryDecision(3, rules);
  assert.equal(last.retry, false);
  assert.equal(last.notify, true);
});

test('telegram: callback data parsing rejects junk', () => {
  assert.equal(M.parseCallbackData(`a:${PLAN}`).kind, 'approve');
  assert.equal(M.parseCallbackData(`l:${PLAN}:music`).layer, 'music');
  assert.equal(M.parseCallbackData('a:not-a-uuid'), null);
  assert.equal(M.parseCallbackData(`x:${PLAN}`), null);
  assert.equal(M.secretMatches('abc', 'abc'), true);
  assert.equal(M.secretMatches('abd', 'abc'), false);
  assert.equal(M.secretMatches(null, 'abc'), false);
});

function planRow(extra = {}) {
  return {
    id: PLAN, business_id: BIZ, plan_date: '2026-10-01', service_key: 'a', sub_topic: 'a1',
    status: 'awaiting_approval', scheduled_publish_at: '2026-10-01T16:00:00.000Z',
    approval_requested_at: '2026-10-01T06:00:00.000Z', reminder_sent_at: null,
    telegram_chat_id: CHAT, telegram_message_id: '42', ...extra,
  };
}
const tap = (data, chat = CHAT) => ({ callback_query: { id: 'cb', data, message: { chat: { id: Number(chat) } } } });

test('approval bot: unauthorized chat cannot act', async () => {
  const db = createDb({ content_plans: [planRow()] });
  const r = recorder();
  const res = await M.handleTelegramUpdate({ supabase: db.client, send: r.send, update: tap(`a:${PLAN}`, '999'), rules, businessId: BIZ, nowMs: at('2026-10-01T10:00:00Z') });
  assert.equal(res.handled, 'unauthorized');
  assert.equal(db.tables.content_plans[0].status, 'awaiting_approval');
});

test('approval bot: approve once; a second tap is stale', async () => {
  const db = createDb({ content_plans: [planRow()] });
  const r = recorder();
  const p = { supabase: db.client, send: r.send, rules, businessId: BIZ, nowMs: at('2026-10-01T10:00:00Z') };
  assert.equal((await M.handleTelegramUpdate({ ...p, update: tap(`a:${PLAN}`) })).handled, 'publish_at_slot');
  assert.equal(db.tables.content_plans[0].status, 'approved');
  assert.equal((await M.handleTelegramUpdate({ ...p, update: tap(`a:${PLAN}`) })).handled, 'stale');
  assert.equal(db.tables.approvals.length, 1);
  assert.match(r.calls.find((c) => c.method === 'sendMessage').body.text, /19:00/);
});

test('approval bot: late approval same day publishes now; next day goes to queue', async () => {
  const db = createDb({ content_plans: [planRow()] });
  const r = recorder();
  const res = await M.handleTelegramUpdate({ supabase: db.client, send: r.send, update: tap(`a:${PLAN}`), rules, businessId: BIZ, nowMs: at('2026-10-01T18:00:00Z') });
  assert.equal(res.handled, 'publish_now');
  assert.equal(db.tables.content_plans[0].scheduled_publish_at, '2026-10-01T18:00:00.000Z');

  const db2 = createDb({ content_plans: [planRow({ status: 'expired' })] });
  const res2 = await M.handleTelegramUpdate({ supabase: db2.client, send: r.send, update: tap(`a:${PLAN}`), rules, businessId: BIZ, nowMs: at('2026-10-02T07:00:00Z') });
  assert.equal(res2.handled, 'queue');
  assert.equal(db2.tables.content_plans[0].status, 'queued');
});

test('approval bot: Değiştir shows layer options, a layer choice files a change request', async () => {
  const db = createDb({ content_plans: [planRow()] });
  const r = recorder();
  const p = { supabase: db.client, send: r.send, rules, businessId: BIZ, nowMs: at('2026-10-01T10:00:00Z') };
  assert.equal((await M.handleTelegramUpdate({ ...p, update: tap(`c:${PLAN}`) })).handled, 'change_menu');
  const menu = r.calls.find((c) => c.method === 'sendMessage').body.reply_markup.inline_keyboard.flat();
  assert.deepEqual(plain(menu.map((b) => b.text)), ['Seslendirme', 'Video', 'Metin', 'Etiketler', 'Müzik', 'Hepsini yeniden yap']);
  assert.equal((await M.handleTelegramUpdate({ ...p, update: tap(`l:${PLAN}:music`) })).handled, 'change_requested');
  assert.equal(db.tables.content_plans[0].status, 'regenerating');
  assert.equal(db.tables.content_change_requests[0].layer, 'music');
  assert.equal((await M.handleTelegramUpdate({ ...p, update: tap(`l:${PLAN}:bogus`) })).handled, 'invalid');
});

test('approval bot: /kredi answers only approvers', async () => {
  const db = createDb({ generation_accounts: accounts.map((a) => ({ ...a, business_id: BIZ })), generation_credit_events: [] });
  const r = recorder();
  const msg = (chat) => ({ message: { text: '/kredi', chat: { id: Number(chat) } } });
  const p = { supabase: db.client, send: r.send, rules, businessId: BIZ, nowMs: at('2026-10-01T10:00:00Z') };
  assert.equal((await M.handleTelegramUpdate({ ...p, update: msg('999') })).handled, 'unauthorized');
  assert.equal((await M.handleTelegramUpdate({ ...p, update: msg(CHAT) })).handled, 'credit_report');
  assert.match(r.calls[0].body.text, /capcut/);
});

test('scheduler: one reminder, then expiry at midnight, never deletes', async () => {
  const db = createDb({ content_plans: [planRow()], generation_accounts: [] });
  const r = recorder();
  const p = { supabase: db.client, send: r.send, rules, businessId: BIZ, dailyUsage: {} };
  const a = await M.runContentScheduler({ ...p, nowMs: at('2026-10-01T13:05:00Z') });
  assert.equal(a.reminders, 1);
  const b = await M.runContentScheduler({ ...p, nowMs: at('2026-10-01T13:10:00Z') });
  assert.equal(b.reminders, 0);
  const c = await M.runContentScheduler({ ...p, nowMs: at('2026-10-01T21:01:00Z') });
  assert.equal(c.expired, 1);
  assert.equal(db.tables.content_plans.length, 1);
  assert.equal(db.tables.content_plans[0].status, 'expired');
  assert.match(r.calls.at(-1).body.text, /yayın yapılmadı/);
});

test('scheduler: low-credit warning once per day, due list puts queue first', async () => {
  const db = createDb({
    content_plans: [
      planRow({ id: 'p-today', status: 'approved', plan_date: '2026-10-02', scheduled_publish_at: '2026-10-02T06:00:00Z' }),
      planRow({ id: 'p-old', status: 'queued', plan_date: '2026-10-01' }),
    ],
    generation_accounts: accounts.map((a) => ({ ...a, business_id: BIZ })),
    audit_log: [],
  });
  const r = recorder();
  const p = { supabase: db.client, send: r.send, rules, businessId: BIZ, dailyUsage: { capcut: 8, elevenlabs: 6 } };
  const first = await M.runContentScheduler({ ...p, nowMs: at('2026-10-02T07:00:00Z') });
  assert.deepEqual([...first.credit_warnings], ['elevenlabs']);
  assert.deepEqual([...first.due_for_publish], ['p-old', 'p-today']);
  const second = await M.runContentScheduler({ ...p, nowMs: at('2026-10-02T08:00:00Z') });
  assert.deepEqual([...second.credit_warnings], []);
});
