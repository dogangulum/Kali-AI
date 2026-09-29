// One daily content run for one business. Order:
//   1. publish anything approved-late (queued) BEFORE making new content
//   2. handle open "Değiştir" requests
//   3. if today has no plan yet: pick topic -> competitor scenario ->
//      N candidates -> learned selection -> draft to Telegram
// Every external capability (competitor search, image/video/voice
// generation, merge, publish, screenshots) is an injected provider, so the
// orchestration is testable and a broken provider only breaks its own step.
const R = require('./rules.cjs');
const { runStepWithRetries } = require('./retry-runner.cjs');
const { withAccount } = require('./credit-pool.cjs');

const MAX_COMPETITOR_TRIES = 5;

// Credits a generation call needs; providers may price per call or per char.
function credits(providers, provider, input) {
  return typeof providers.estimateCredits === 'function' ? providers.estimateCredits(provider, input) : 1;
}

async function loadLearningHistory(db, businessId) {
  const { data: selected } = await db.from('content_candidates').select('plan_id, features')
    .eq('business_id', businessId).eq('selected', true);
  if (!selected || !selected.length) return [];
  const planIds = selected.map((s) => s.plan_id);
  const [{ data: plans }, { data: changes }, { data: perf }] = await Promise.all([
    db.from('content_plans').select('id, status').in('id', planIds),
    db.from('content_change_requests').select('plan_id').in('plan_id', planIds),
    db.from('content_performance').select('plan_id, reach, likes, comments, saves, shares').in('plan_id', planIds),
  ]);
  const engagement = (p) => (p.reach ? ((p.likes || 0) + (p.comments || 0) * 2 + (p.saves || 0) * 3 + (p.shares || 0) * 3) / p.reach : null);
  const byPlan = new Map();
  for (const p of perf || []) {
    const e = engagement(p);
    if (e == null) continue;
    byPlan.set(p.plan_id, Math.max(byPlan.get(p.plan_id) || 0, e));
  }
  const values = [...byPlan.values()].sort((a, b) => a - b);
  const median = values.length ? values[Math.floor(values.length / 2)] : null;
  const status = new Map((plans || []).map((p) => [p.id, p.status]));
  const changeCount = new Map();
  for (const c of changes || []) changeCount.set(c.plan_id, (changeCount.get(c.plan_id) || 0) + 1);
  return selected
    .filter((s) => ['approved', 'queued', 'publishing', 'published', 'expired'].includes(status.get(s.plan_id)))
    .map((s) => ({
      features: s.features || {},
      reward: R.candidateReward({
        approved: status.get(s.plan_id) !== 'expired',
        change_requests: changeCount.get(s.plan_id) || 0,
        engagement_ratio: median && byPlan.has(s.plan_id) ? byPlan.get(s.plan_id) / median : null,
      }),
    }));
}

async function loadHourStats(db, businessId, timezone) {
  const { data } = await db.from('content_performance').select('format, published_at, reach, likes, comments, saves, shares')
    .eq('business_id', businessId);
  const hourFmt = new Intl.DateTimeFormat('en-US', { timeZone: timezone, hour: '2-digit', hourCycle: 'h23' });
  return (data || []).filter((p) => p.published_at && p.reach).map((p) => ({
    format: p.format,
    hour: Number(hourFmt.format(new Date(p.published_at))),
    engagement: ((p.likes || 0) + (p.comments || 0) * 2 + (p.saves || 0) * 3 + (p.shares || 0) * 3) / p.reach,
  }));
}

async function chooseCompetitorScenario(ctx, plan, topic) {
  const { db, businessId, providers } = ctx;
  const { data: analysed } = await db.from('competitor_analyses').select('source_url').eq('business_id', businessId);
  const seenUrls = (analysed || []).map((a) => a.source_url);
  const found = await providers.findCompetitorVideos({ service: topic.service_name, subTopic: plan.sub_topic });
  const fresh = R.unseenCompetitorSources(found || [], seenUrls).slice(0, MAX_COMPETITOR_TRIES);
  for (const video of fresh) {
    let verdict;
    try {
      verdict = await providers.analyzeCompetitor({ video, service: topic.service_name, subTopic: plan.sub_topic });
    } catch {
      continue; // unreadable video: try the next one, don't record a verdict
    }
    const { data: rows } = await db.from('competitor_analyses').insert({
      business_id: businessId, source_url: video.source_url, source_account: video.account || null,
      service_key: plan.service_key, scenario: verdict.scenario || {},
      fit_decision: verdict.fit ? 'accepted' : 'rejected', reject_reason: verdict.fit ? null : (verdict.reason || null),
    }).select('id');
    if (verdict.fit) return { id: rows[0].id, scenario: verdict.scenario };
  }
  return null; // no fitting competitor: generate from the topic alone
}

async function produceCandidate(ctx, plan, topic, scenario, variant, revision = 1, base = null, layer = 'all') {
  const { db, businessId, rules, providers, nowMs, notify } = ctx;
  const step = (name, run, accountId) => runStepWithRetries({
    db, businessId, planId: plan.id, step: name, rules, run, notify, accountId,
    screenshot: providers.screenshot ? (info) => providers.screenshot({ ...info, planId: plan.id }) : null,
  });
  const brief = { service: topic.service_name, subTopic: plan.sub_topic, scenario, variant };
  const redo = (l) => !base || layer === 'all' || layer === l;

  const text = redo('text') || redo('tags')
    ? await step('caption', () => providers.writeCaption({ ...brief, previous: base, layer }))
    : { caption: base.caption, hashtags: base.hashtags, features: {} };
  let videoUrl = base && base.video_url;
  let image = base && base.image_url ? { url: base.image_url } : null;
  let videoFeatures = {};
  if (redo('video') || !videoUrl) {
    image = await step('image', () => providers.generateImage({ ...brief, previous: base && base.image_url }));
    const video = await withAccount({
      db, businessId, provider: 'capcut', needed: credits(providers, 'capcut', brief), nowMs, planId: plan.id, onAccountProblem: notify,
      fn: (account) => step('capcut_video', ({ refreshSelectors }) =>
        providers.generateVideo({ ...brief, image, account, refreshSelectors }), account.id),
    });
    videoUrl = video.url;
    videoFeatures = video.features || {};
  }
  let voiceoverUrl = base && base.voiceover_url;
  let voiceFeatures = {};
  if (redo('voiceover') || !voiceoverUrl) {
    const script = text.voiceover_script || text.caption;
    const voice = await withAccount({
      db, businessId, provider: 'elevenlabs', needed: credits(providers, 'elevenlabs', { script }), nowMs, planId: plan.id, onAccountProblem: notify,
      fn: (account) => step('voiceover', () => providers.generateVoiceover({ ...brief, script, account }), account.id),
    });
    voiceoverUrl = voice.url;
    voiceFeatures = voice.features || {};
  }
  const music = redo('music') ? (await step('music', () => providers.pickMusic({ ...brief, previous: base && base.music }))) : base.music;
  const merged = await step('merge', () => providers.merge({ videoUrl, voiceoverUrl, music, caption: text.caption }));

  const features = { ...(base && base.features), ...videoFeatures, ...voiceFeatures, ...(text.features || {}), music_mood: music && music.mood, scenario: scenario ? 'competitor' : 'topic_only' };
  const { data: rows } = await db.from('content_candidates').insert({
    business_id: businessId, plan_id: plan.id, variant, revision,
    image_url: image && image.url, video_url: merged.url, voiceover_url: voiceoverUrl, caption: text.caption,
    hashtags: text.hashtags || [], music: music && music.name, features,
  }).select('*');
  return rows[0];
}

async function sendDraft(ctx, plan, candidate, headline) {
  const { rules, send, db } = ctx;
  let messageId = null;
  for (const chat_id of rules.approver_telegram_chat_ids) {
    const res = await send('sendVideo', {
      chat_id, video: candidate.video_url,
      caption: `${headline}\n\n${candidate.caption || ''}\n\n${(candidate.hashtags || []).join(' ')}`.slice(0, 1024),
      reply_markup: R.approvalKeyboard(plan.id),
    });
    if (!messageId && res && res.message_id) messageId = String(res.message_id);
  }
  await db.from('content_plans').update({
    status: 'awaiting_approval', approval_requested_at: new Date(ctx.nowMs).toISOString(),
    reminder_sent_at: null, telegram_chat_id: rules.approver_telegram_chat_ids[0] || null,
    telegram_message_id: messageId, updated_at: new Date(ctx.nowMs).toISOString(),
  }).eq('id', plan.id);
}

async function publishQueued(ctx) {
  const { db, businessId, providers, notify, nowMs } = ctx;
  // A crashed previous run can leave a plan in 'publishing'; runs never
  // overlap (systemd oneshot), so it is safe to hand it back. Formats that
  // did go out are in content_performance and will be skipped.
  await db.from('content_plans').update({ status: 'approved' }).eq('business_id', businessId).eq('status', 'publishing');
  const { data } = await db.from('content_plans').select('*').eq('business_id', businessId).in('status', ['queued', 'approved']);
  const due = R.publishOrder(data || [], nowMs);
  const published = [];
  for (const plan of due) {
    const { data: moved } = await db.from('content_plans').update({ status: 'publishing' }).eq('id', plan.id).in('status', ['queued', 'approved']).select('id');
    if (!moved || !moved.length) continue;
    try {
      const { data: cand } = await db.from('content_candidates').select('*').eq('id', plan.selected_candidate_id).maybeSingle();
      const { data: done } = await db.from('content_performance').select('format').eq('plan_id', plan.id);
      await providers.publish({
        plan, candidate: cand, alreadyPublished: (done || []).map((d) => d.format),
        onPublished: (item) => db.from('content_performance').insert({
          business_id: businessId, plan_id: plan.id, format: item.format,
          platform_media_id: item.mediaId, published_at: new Date(nowMs).toISOString(),
        }),
      });
      await db.from('content_plans').update({ status: 'published', published_at: new Date(nowMs).toISOString() }).eq('id', plan.id);
      published.push(plan.id);
    } catch (err) {
      const msg = String(err && err.message || err).slice(0, 300);
      await db.from('automation_attempts').insert({
        business_id: businessId, plan_id: plan.id, step: 'publish', attempt: 0, status: 'failed', error: msg,
        finished_at: new Date(nowMs).toISOString(),
      });
      const { data: fails } = await db.from('automation_attempts').select('id').eq('plan_id', plan.id).eq('step', 'publish').eq('status', 'failed');
      const giveUp = (fails || []).length >= ctx.rules.max_attempts;
      await db.from('content_plans').update({ status: giveUp ? 'failed' : plan.status, notes: giveUp ? `publish failed: ${msg}` : null }).eq('id', plan.id);
      await notify(giveUp
        ? `⚠️ ${plan.plan_date} içeriği ${ctx.rules.max_attempts} denemede yayınlanamadı, bırakıldı: ${msg}`
        : `⚠️ ${plan.plan_date} içeriği yayınlanamadı, bir sonraki çalışmada tekrar denenecek: ${msg}`);
    }
  }
  return published;
}

// Pulls Instagram insights for posts 24h-7d old, at most once a day each;
// this is what the learner and the best-time estimate feed on.
async function collectPerformance(ctx) {
  const { db, businessId, providers, nowMs } = ctx;
  if (!providers.insights) return 0;
  const { data } = await db.from('content_performance').select('*').eq('business_id', businessId)
    .gte('published_at', new Date(nowMs - 7 * 86_400_000).toISOString())
    .lt('published_at', new Date(nowMs - 86_400_000).toISOString());
  let n = 0;
  for (const row of data || []) {
    if (!row.platform_media_id) continue;
    if (row.reach != null && Date.parse(row.measured_at) > nowMs - 20 * 3600_000) continue;
    try {
      const m = await providers.insights(row.platform_media_id, row.format);
      await db.from('content_performance').update({ ...m, measured_at: new Date(nowMs).toISOString() }).eq('id', row.id);
      n++;
    } catch { /* stories expire after 24h; a missing metric is not an error */ }
  }
  return n;
}

async function processChangeRequests(ctx) {
  const { db, businessId } = ctx;
  const { data: open } = await db.from('content_change_requests').select('*').eq('business_id', businessId).eq('status', 'open');
  const done = [];
  for (const req of open || []) {
    const { data: plan } = await db.from('content_plans').select('*').eq('id', req.plan_id).maybeSingle();
    if (!plan || plan.status !== 'regenerating') continue;
    const { data: base } = await db.from('content_candidates').select('*').eq('id', plan.selected_candidate_id).maybeSingle();
    const topic = { service_name: plan.service_key };
    try {
      const cand = await produceCandidate(ctx, plan, topic, null, base.variant, (base.revision || 1) + 1, base, req.layer);
      await db.from('content_candidates').update({ selected: false }).eq('id', base.id);
      await db.from('content_candidates').update({ selected: true }).eq('id', cand.id);
      await db.from('content_plans').update({ selected_candidate_id: cand.id }).eq('id', plan.id);
      await db.from('content_change_requests').update({ status: 'done', resolved_at: new Date(ctx.nowMs).toISOString() }).eq('id', req.id);
      await sendDraft(ctx, plan, cand, `✏️ Güncellenmiş taslak (${req.layer})`);
      done.push(req.id);
    } catch (err) {
      await ctx.notify(`⚠️ Değişiklik yapılamadı (${req.layer}): ${String(err && err.message || err).slice(0, 300)}`);
    }
  }
  return done;
}

async function runDaily(ctx) {
  const { db, businessId, rules, nowMs, notify } = ctx;
  const summary = { published: [], changes: [], plan: null, skipped: null };
  summary.published = await publishQueued(ctx);
  summary.changes = await processChangeRequests(ctx);
  summary.measured = await collectPerformance(ctx);

  const today = R.localDate(nowMs, rules.timezone);
  const { data: existing } = await db.from('content_plans').select('id').eq('business_id', businessId).eq('plan_date', today).maybeSingle();
  if (existing) { summary.skipped = 'plan_exists'; return summary; }

  const { data: history } = await db.from('content_plans').select('plan_date, service_key, sub_topic').eq('business_id', businessId);
  const topic = R.pickNextTopic(rules, history || []);
  let subTopic = topic.sub_topic;
  if (topic.needs_new_sub_topic) {
    subTopic = await ctx.providers.inventSubTopic({ service: topic.service_name, avoid: topic.avoid_sub_topics });
  }
  const { data: inserted } = await db.from('content_plans').insert({
    business_id: businessId, plan_date: today, service_key: topic.service_key, sub_topic: subTopic, status: 'generating',
  }).select('*');
  const plan = inserted[0];
  summary.plan = plan.id;

  try {
    // Competitor inspiration is optional: if discovery/analysis is down,
    // produce from the topic alone rather than losing the day.
    const competitor = await chooseCompetitorScenario(ctx, plan, topic).catch(() => null);
    if (competitor) await db.from('content_plans').update({ competitor_analysis_id: competitor.id }).eq('id', plan.id);

    const candidates = [];
    for (let v = 1; v <= rules.candidates_per_day; v++) {
      try {
        candidates.push(await produceCandidate(ctx, plan, topic, competitor && competitor.scenario, v));
      } catch (err) {
        if (err && err.code === 'OUT_OF_CREDIT_ALL') throw err;
        // one failed variant is fine as long as at least one succeeds
      }
    }
    if (!candidates.length) throw new Error('no candidate could be produced');

    const weights = R.learnFeatureWeights(await loadLearningHistory(db, businessId));
    const ranked = R.scoreCandidates(candidates, weights);
    for (const r of ranked) {
      await db.from('content_candidates').update({ score: r.score, score_breakdown: r.breakdown, selected: r === ranked[0] }).eq('id', r.candidate.id);
    }
    const best = ranked[0].candidate;
    const publishAt = R.bestPublishTime(await loadHourStats(db, businessId, rules.timezone), 'reel', today, rules);
    await db.from('content_plans').update({ selected_candidate_id: best.id, scheduled_publish_at: publishAt }).eq('id', plan.id);
    plan.scheduled_publish_at = publishAt;
    const time = new Intl.DateTimeFormat('tr-TR', { timeZone: rules.timezone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(publishAt));
    await sendDraft(ctx, plan, best, `🎬 ${topic.service_name} — ${subTopic}\nYayın saati: ${time}`);
  } catch (err) {
    await db.from('content_plans').update({ status: 'failed', notes: String(err && err.message || err).slice(0, 1000) }).eq('id', plan.id);
    await notify(err && err.code === 'OUT_OF_CREDIT_ALL'
      ? `⚠️ Bugünkü içerik üretilemedi: ${err.message}. Yeni hesap eklenmeli.`
      : `⚠️ Bugünkü içerik üretilemedi: ${String(err && err.message || err).slice(0, 300)}`);
    summary.skipped = 'failed';
  }
  return summary;
}

module.exports = { runDaily, publishQueued, processChangeRequests, collectPerformance, loadLearningHistory };
