// Pure decision logic for the daily content pipeline. No I/O, no imports:
// every function takes plain data and returns a decision, so the same rules
// run in Edge Functions, in the Oracle worker, and in node tests.
//
// Nothing business-specific is hardcoded. Services, sub-topics, counts and
// thresholds all come from business_config.config.content_pipeline, read
// through resolvePipelineRules().

export type Format = 'story' | 'post' | 'reel';

export interface ServiceRule {
  key: string;
  name: string;
  sub_topics: string[];
}

export interface PipelineRules {
  timezone: string;
  services: ServiceRule[];
  candidates_per_day: number;
  reminder_hours_before: number;
  max_attempts: number;
  credit_warning_days: number;
  default_publish_times: Record<Format, string>;
  approver_telegram_chat_ids: string[];
}

const DEFAULT_RULES = {
  candidates_per_day: 3,
  reminder_hours_before: 3,
  max_attempts: 3,
  credit_warning_days: 7,
  default_publish_times: { story: '10:00', post: '13:00', reel: '19:00' },
};

export function resolvePipelineRules(config: any, timezone: string): PipelineRules {
  const c = (config && config.content_pipeline) || {};
  const services = Array.isArray(c.services) ? c.services : [];
  const valid = services.filter((s: any) =>
    s && typeof s.key === 'string' && typeof s.name === 'string'
  ).map((s: any) => ({
    key: s.key,
    name: s.name,
    sub_topics: Array.isArray(s.sub_topics)
      ? s.sub_topics.filter((t: any) => typeof t === 'string' && t.trim())
      : [],
  }));
  if (valid.length === 0) {
    throw new Error('content_pipeline.services is not configured');
  }
  const num = (v: any, d: number) => (Number.isFinite(v) && v > 0 ? v : d);
  return {
    timezone,
    services: valid,
    candidates_per_day: num(c.candidates_per_day, DEFAULT_RULES.candidates_per_day),
    reminder_hours_before: num(c.reminder_hours_before, DEFAULT_RULES.reminder_hours_before),
    max_attempts: num(c.max_attempts, DEFAULT_RULES.max_attempts),
    credit_warning_days: num(c.credit_warning_days, DEFAULT_RULES.credit_warning_days),
    default_publish_times: { ...DEFAULT_RULES.default_publish_times, ...(c.default_publish_times || {}) },
    approver_telegram_chat_ids: Array.isArray(c.approver_telegram_chat_ids)
      ? c.approver_telegram_chat_ids.map(String)
      : [],
  };
}

// ---------------------------------------------------------------- time --

export function localDate(ms: number, timezone: string): string {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date(ms));
}

function tzOffsetMs(ms: number, timezone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone, hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(new Date(ms));
  const get = (t: string) => Number(parts.find((p) => p.type === t)!.value);
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'));
  return asUtc - Math.floor(ms / 1000) * 1000;
}

// Local wall-clock time (YYYY-MM-DD + HH:MM) in `timezone` -> epoch ms.
export function zonedTimeToMs(date: string, hhmm: string, timezone: string): number {
  const [y, m, d] = date.split('-').map(Number);
  const [h, mi] = hhmm.split(':').map(Number);
  const guess = Date.UTC(y, m - 1, d, h, mi);
  const first = guess - tzOffsetMs(guess, timezone);
  return guess - tzOffsetMs(first, timezone);
}

export function addDays(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

// ------------------------------------------------------- topic rotation --

export interface PlanHistoryRow {
  plan_date: string;
  service_key: string;
  sub_topic: string;
}

// Least-recently-used service (never-used first, config order breaks ties),
// then that service's least-recently-used sub-topic. `needs_new_sub_topic`
// is true when every configured sub-topic was already used, so the
// generator should invent a fresh one rather than repeat.
export function pickNextTopic(rules: PipelineRules, history: PlanHistoryRow[]) {
  const lastService = new Map<string, string>();
  const lastSub = new Map<string, string>();
  for (const row of history) {
    if ((lastService.get(row.service_key) || '') < row.plan_date) lastService.set(row.service_key, row.plan_date);
    const k = `${row.service_key}\u0000${row.sub_topic}`;
    if ((lastSub.get(k) || '') < row.plan_date) lastSub.set(k, row.plan_date);
  }
  const service = [...rules.services].map((s, i) => ({ s, i }))
    .sort((a, b) => {
      const da = lastService.get(a.s.key) || '';
      const db = lastService.get(b.s.key) || '';
      return da === db ? a.i - b.i : da < db ? -1 : 1;
    })[0].s;
  const subs = service.sub_topics.map((t, i) => ({ t, i, last: lastSub.get(`${service.key}\u0000${t}`) || '' }));
  const unused = subs.filter((x) => !x.last);
  const chosen = unused.length
    ? unused[0]
    : subs.sort((a, b) => (a.last === b.last ? a.i - b.i : a.last < b.last ? -1 : 1))[0];
  const usedTopics = history.filter((r) => r.service_key === service.key).map((r) => r.sub_topic);
  return {
    service_key: service.key,
    service_name: service.name,
    sub_topic: chosen ? chosen.t : null,
    needs_new_sub_topic: unused.length === 0,
    avoid_sub_topics: [...new Set(usedTopics)],
  };
}

// ------------------------------------------------ competitor sourcing --

// Drops videos already analysed (accepted OR rejected) so the same
// competitor video is never reused or re-evaluated.
export function unseenCompetitorSources<T extends { source_url: string }>(
  candidates: T[],
  analysedUrls: string[],
): T[] {
  const norm = (u: string) => u.trim().toLowerCase().replace(/[?#].*$/, '').replace(/\/+$/, '');
  const seen = new Set(analysedUrls.map(norm));
  const out: T[] = [];
  for (const c of candidates) {
    const n = norm(c.source_url);
    if (seen.has(n)) continue;
    seen.add(n);
    out.push(c);
  }
  return out;
}

// --------------------------------------------------- learned scoring --

export interface CandidateOutcome {
  approved: boolean;        // eventually approved
  change_requests: number;  // how many "Değiştir" rounds it took
  engagement_ratio?: number | null; // engagement / business median (1 = typical)
}

// Reward in roughly [-1, 2]: approval signal plus published performance.
export function candidateReward(o: CandidateOutcome): number {
  let r = o.approved ? (o.change_requests === 0 ? 1 : 0.3) : -0.5;
  r -= 0.25 * Math.min(o.change_requests, 4);
  if (o.approved && o.engagement_ratio != null && Number.isFinite(o.engagement_ratio)) {
    r += Math.max(-1, Math.min(1, o.engagement_ratio - 1));
  }
  return r;
}

function featureKeys(features: Record<string, unknown>): string[] {
  return Object.entries(features || {})
    .filter(([, v]) => v !== null && v !== undefined && v !== '')
    .map(([k, v]) => `${k}=${String(v)}`);
}

// Shrunk mean reward per feature value: sum / (n + prior). Features with
// little history stay near 0 until evidence accumulates.
export function learnFeatureWeights(
  history: { features: Record<string, unknown>; reward: number }[],
  prior = 2,
): Record<string, { n: number; weight: number }> {
  const acc: Record<string, { n: number; sum: number }> = {};
  for (const h of history) {
    for (const k of featureKeys(h.features)) {
      acc[k] = acc[k] || { n: 0, sum: 0 };
      acc[k].n += 1;
      acc[k].sum += h.reward;
    }
  }
  const out: Record<string, { n: number; weight: number }> = {};
  for (const [k, v] of Object.entries(acc)) out[k] = { n: v.n, weight: v.sum / (v.n + prior) };
  return out;
}

// Scores candidates against learned weights; unseen feature values get a
// small exploration bonus so the system keeps trying new styles.
export function scoreCandidates<T extends { features: Record<string, unknown> }>(
  candidates: T[],
  weights: Record<string, { n: number; weight: number }>,
  explorationBonus = 0.1,
) {
  const scored = candidates.map((c, index) => {
    const breakdown: Record<string, number> = {};
    let score = 0;
    for (const k of featureKeys(c.features)) {
      const w = weights[k] ? weights[k].weight : explorationBonus;
      breakdown[k] = w;
      score += w;
    }
    return { candidate: c, index, score, breakdown };
  });
  scored.sort((a, b) => (b.score === a.score ? a.index - b.index : b.score - a.score));
  return scored;
}

// --------------------------------------------------- approval timing --

export interface PlanTiming {
  status: string;
  plan_date: string;
  scheduled_publish_at: string | null;
  reminder_sent_at: string | null;
  approval_requested_at?: string | null;
}

// Scheduler decision for a plan waiting on the approver:
//  - reminder `reminder_hours_before` the publish slot (once)
//  - at the end of the plan's local day: expire (nothing is published
//    that day; the draft is kept and can still be approved into the queue)
export function nextApprovalStep(plan: PlanTiming, nowMs: number, rules: PipelineRules):
  'none' | 'wait' | 'send_reminder' | 'expire' {
  if (plan.status !== 'awaiting_approval') return 'none';
  const endOfDay = zonedTimeToMs(addDays(plan.plan_date, 1), '00:00', rules.timezone);
  if (nowMs >= endOfDay) return 'expire';
  if (!plan.reminder_sent_at && plan.scheduled_publish_at) {
    let reminderAt = Date.parse(plan.scheduled_publish_at) - rules.reminder_hours_before * 3600_000;
    // A draft that arrived late still gets an hour before being nudged.
    if (plan.approval_requested_at) {
      reminderAt = Math.max(reminderAt, Date.parse(plan.approval_requested_at) + 3600_000);
    }
    if (nowMs >= reminderAt) return 'send_reminder';
  }
  return 'wait';
}

// What an approval means depending on when it arrives:
//  - same local day, slot still ahead  -> publish at the slot
//  - same local day, slot passed       -> publish now (late is fine)
//  - after the plan's day              -> queue; published before the
//                                         next day's new content
export function approvalOutcome(plan: PlanTiming, nowMs: number, rules: PipelineRules):
  'publish_at_slot' | 'publish_now' | 'queue' | 'not_pending' {
  if (plan.status !== 'awaiting_approval' && plan.status !== 'expired') return 'not_pending';
  if (localDate(nowMs, rules.timezone) > plan.plan_date) return 'queue';
  if (plan.status === 'expired') return 'queue';
  if (plan.scheduled_publish_at && Date.parse(plan.scheduled_publish_at) > nowMs) return 'publish_at_slot';
  return 'publish_now';
}

// Publishing order: queued (oldest day first) before today's approved.
export function publishOrder<T extends { status: string; plan_date: string; scheduled_publish_at: string | null }>(
  plans: T[],
  nowMs: number,
): T[] {
  const queued = plans.filter((p) => p.status === 'queued').sort((a, b) => (a.plan_date < b.plan_date ? -1 : 1));
  const due = plans.filter((p) =>
    p.status === 'approved' && (!p.scheduled_publish_at || Date.parse(p.scheduled_publish_at) <= nowMs)
  ).sort((a, b) => (a.plan_date < b.plan_date ? -1 : 1));
  return [...queued, ...due];
}

// ------------------------------------------------- best publish time --

export interface HourStat { format: Format; hour: number; engagement: number }

// Best hour per format from past performance (needs >= minSamples at an
// hour to trust it), otherwise the configured default time.
export function bestPublishTime(
  stats: HourStat[], format: Format, planDate: string, rules: PipelineRules, minSamples = 3,
): string {
  const byHour = new Map<number, { n: number; sum: number }>();
  for (const s of stats) {
    if (s.format !== format || !Number.isFinite(s.engagement)) continue;
    const b = byHour.get(s.hour) || { n: 0, sum: 0 };
    b.n += 1; b.sum += s.engagement;
    byHour.set(s.hour, b);
  }
  let best: { hour: number; avg: number } | null = null;
  for (const [hour, b] of byHour) {
    if (b.n < minSamples) continue;
    const avg = b.sum / b.n;
    if (!best || avg > best.avg || (avg === best.avg && hour < best.hour)) best = { hour, avg };
  }
  const hhmm = best ? `${String(best.hour).padStart(2, '0')}:00` : rules.default_publish_times[format];
  return new Date(zonedTimeToMs(planDate, hhmm, rules.timezone)).toISOString();
}

// ------------------------------------------------- credits / accounts --

export interface GenerationAccount {
  id: string;
  provider: string;
  label: string;
  reset_period: 'daily' | 'monthly' | 'none';
  quota: number;
  credits_remaining: number;
  resets_at: string | null;
  priority: number;
  active: boolean;
}

function nextReset(ms: number, period: string): number {
  const d = new Date(ms);
  if (period === 'daily') return ms + 86_400_000;
  if (period === 'monthly') {
    return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate(), d.getUTCHours(), d.getUTCMinutes());
  }
  return Infinity;
}

export function effectiveCredits(a: GenerationAccount, nowMs: number): number {
  if (a.reset_period !== 'none' && a.resets_at && Date.parse(a.resets_at) <= nowMs) return a.quota;
  return a.credits_remaining;
}

// First active account (by priority, then most credit) that can cover
// `needed`. null = every account is out -> caller alerts over Telegram.
export function pickAccount(accounts: GenerationAccount[], provider: string, needed: number, nowMs: number) {
  return accounts
    .filter((a) => a.active && a.provider === provider && effectiveCredits(a, nowMs) >= needed)
    .sort((a, b) => a.priority - b.priority || effectiveCredits(b, nowMs) - effectiveCredits(a, nowMs))[0] || null;
}

// How many days of `dailyUsage` the provider's accounts can cover,
// simulating resets. `unlimited` = still covered at the horizon (daily
// free credits outpace usage).
export function estimateCreditDays(
  accounts: GenerationAccount[], provider: string, dailyUsage: number, nowMs: number, horizon = 90,
): { days: number; unlimited: boolean } {
  const pool = accounts.filter((a) => a.active && a.provider === provider).map((a) => ({
    period: a.reset_period,
    quota: a.quota,
    credits: effectiveCredits(a, nowMs),
    resetAt: a.resets_at && Date.parse(a.resets_at) > nowMs ? Date.parse(a.resets_at) : nextReset(nowMs, a.reset_period),
  }));
  if (dailyUsage <= 0) return { days: horizon, unlimited: true };
  for (let day = 0; day < horizon; day++) {
    const t = nowMs + day * 86_400_000;
    for (const p of pool) {
      while (p.resetAt <= t) { p.credits = p.quota; p.resetAt = nextReset(p.resetAt, p.period); }
    }
    let need = dailyUsage;
    for (const p of pool) {
      const take = Math.min(p.credits, need);
      p.credits -= take; need -= take;
      if (need <= 0) break;
    }
    if (need > 0) return { days: day, unlimited: false };
  }
  return { days: horizon, unlimited: true };
}

export function shouldWarnLowCredit(est: { days: number; unlimited: boolean }, rules: PipelineRules): boolean {
  return !est.unlimited && est.days < rules.credit_warning_days;
}

// ------------------------------------------------------------ retries --

// attempt is 1-based (the attempt that just failed).
export function retryDecision(attempt: number, rules: PipelineRules) {
  if (attempt < rules.max_attempts) {
    return { retry: true, refresh_selectors: true, notify: false };
  }
  return { retry: false, refresh_selectors: false, notify: true };
}

// ------------------------------------------------------ change layers --

export const CHANGE_LAYERS = [
  { key: 'voiceover', label: 'Seslendirme' },
  { key: 'video', label: 'Video' },
  { key: 'text', label: 'Metin' },
  { key: 'tags', label: 'Etiketler' },
  { key: 'music', label: 'Müzik' },
  { key: 'all', label: 'Hepsini yeniden yap' },
] as const;
