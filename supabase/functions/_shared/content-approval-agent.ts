// Telegram approval handling + the periodic content scheduler. All I/O goes
// through injected `supabase` and `send` so tests run without network.
import {
  approvalOutcome, CHANGE_LAYERS, estimateCreditDays, nextApprovalStep,
  publishOrder, shouldWarnLowCredit,
} from './content-rules.ts';
import type { GenerationAccount, PipelineRules } from './content-rules.ts';
import { approvalKeyboard, changeKeyboard, formatLocalTime, parseCallbackData } from './telegram.ts';
import type { TelegramSend } from './telegram.ts';

const PLAN_COLUMNS =
  'id, business_id, plan_date, service_key, sub_topic, status, scheduled_publish_at, approval_requested_at, reminder_sent_at, telegram_chat_id, telegram_message_id';

// Conditional status transition: only succeeds if the row is still in one
// of `from`. Two taps on "Onayla" (or a tap racing the scheduler) can
// therefore never both win.
async function transition(supabase: any, planId: string, from: string[], patch: Record<string, unknown>) {
  const { data, error } = await supabase.from('content_plans')
    .update(patch).eq('id', planId).in('status', from).select('id');
  if (error) throw new Error(`content_plans update failed: ${error.message || error}`);
  return Array.isArray(data) && data.length > 0;
}

async function audit(supabase: any, businessId: string, eventType: string, payload: Record<string, unknown>, nowMs: number) {
  await supabase.from('audit_log').insert({
    business_id: businessId, event_type: eventType, payload, created_at: new Date(nowMs).toISOString(),
  });
}

export interface ApprovalParams {
  supabase: any;
  send: TelegramSend;
  update: any;             // Telegram Update object
  rules: PipelineRules;
  businessId: string;
  nowMs: number;
}

export async function handleTelegramUpdate(p: ApprovalParams): Promise<{ handled: string }> {
  const msg = p.update && p.update.message;
  if (msg && typeof msg.text === 'string' && /^\/kredi\b/.test(msg.text.trim())) {
    const chat = String(msg.chat && msg.chat.id);
    if (!p.rules.approver_telegram_chat_ids.includes(chat)) return { handled: 'unauthorized' };
    const { data: accounts } = await p.supabase.from('generation_accounts').select('*')
      .eq('business_id', p.businessId).eq('active', true);
    const usage = await loadDailyUsage(p.supabase, p.businessId, p.nowMs);
    await p.send('sendMessage', { chat_id: chat, text: creditReport(accounts || [], usage, p.nowMs) });
    return { handled: 'credit_report' };
  }
  const cq = p.update && p.update.callback_query;
  if (!cq) return { handled: 'ignored' };
  const chatId = String(cq.message && cq.message.chat && cq.message.chat.id);
  const answer = (text: string) => p.send('answerCallbackQuery', { callback_query_id: cq.id, text });

  // Only configured approvers may act.
  if (!p.rules.approver_telegram_chat_ids.includes(chatId)) {
    await answer('Yetkiniz yok.');
    return { handled: 'unauthorized' };
  }
  const parsed = parseCallbackData(cq.data);
  if (!parsed) {
    await answer('Geçersiz işlem.');
    return { handled: 'invalid' };
  }

  const { data: plan } = await p.supabase.from('content_plans').select(PLAN_COLUMNS)
    .eq('id', parsed.planId).eq('business_id', p.businessId).maybeSingle();
  if (!plan) {
    await answer('İçerik bulunamadı.');
    return { handled: 'not_found' };
  }
  const actor = `telegram:${chatId}`;

  if (parsed.kind === 'change') {
    if (plan.status !== 'awaiting_approval' && plan.status !== 'expired') {
      await answer('Bu içerik için zaten karar verildi.');
      return { handled: 'stale' };
    }
    await answer('Neyi değiştirelim?');
    await p.send('sendMessage', {
      chat_id: chatId,
      text: 'Neyi değiştirmemi istersin?',
      reply_markup: changeKeyboard(plan.id, CHANGE_LAYERS),
    });
    return { handled: 'change_menu' };
  }

  if (parsed.kind === 'layer') {
    if (!CHANGE_LAYERS.some((l) => l.key === parsed.layer)) {
      await answer('Geçersiz seçenek.');
      return { handled: 'invalid' };
    }
    const ok = await transition(p.supabase, plan.id, ['awaiting_approval', 'expired'], {
      status: 'regenerating', reminder_sent_at: null, updated_at: new Date(p.nowMs).toISOString(),
    });
    if (!ok) {
      await answer('Bu içerik için zaten karar verildi.');
      return { handled: 'stale' };
    }
    await p.supabase.from('content_change_requests').insert({
      business_id: p.businessId, plan_id: plan.id, layer: parsed.layer,
    });
    await p.supabase.from('approvals').insert({
      business_id: p.businessId, target_type: 'content_plan', target_id: plan.id,
      action: 'change', notes: `layer=${parsed.layer}`, actor,
    });
    const label = CHANGE_LAYERS.find((l) => l.key === parsed.layer)!.label;
    await answer(`${label} yeniden hazırlanıyor.`);
    await p.send('sendMessage', {
      chat_id: chatId, text: `Tamam, ${label.toLowerCase()} yeniden hazırlanıyor. Hazır olunca tekrar göndereceğim.`,
    });
    return { handled: 'change_requested' };
  }

  // approve
  const outcome = approvalOutcome(plan, p.nowMs, p.rules);
  if (outcome === 'not_pending') {
    await answer('Bu içerik için zaten karar verildi.');
    return { handled: 'stale' };
  }
  const nowIso = new Date(p.nowMs).toISOString();
  const nextStatus = outcome === 'queue' ? 'queued' : 'approved';
  const patch: Record<string, unknown> = { status: nextStatus, decided_at: nowIso, updated_at: nowIso };
  if (outcome === 'publish_now') patch.scheduled_publish_at = nowIso;
  const ok = await transition(p.supabase, plan.id, [plan.status], patch);
  if (!ok) {
    await answer('Bu içerik için zaten karar verildi.');
    return { handled: 'stale' };
  }
  await p.supabase.from('approvals').insert({
    business_id: p.businessId, target_type: 'content_plan', target_id: plan.id,
    action: 'approve', notes: `outcome=${outcome}`, actor,
  });
  const text = outcome === 'publish_at_slot'
    ? `Onaylandı. ${formatLocalTime(plan.scheduled_publish_at, p.rules.timezone)}'da yayınlanacak.`
    : outcome === 'publish_now'
    ? 'Onaylandı. Yayın saati geçtiği için hemen yayınlanıyor.'
    : 'Onaylandı. Günü geçtiği için bekleyen kuyruğuna alındı; yeni içerikten önce ilk o yayınlanacak.';
  await answer('Onaylandı');
  await p.send('sendMessage', { chat_id: chatId, text });
  return { handled: outcome };
}

// ------------------------------------------------------------ scheduler --

export interface SchedulerParams {
  supabase: any;
  send: TelegramSend;
  rules: PipelineRules;
  businessId: string;
  nowMs: number;
  // average credits consumed per day, per provider (from recent events)
  dailyUsage: Record<string, number>;
}

export async function runContentScheduler(p: SchedulerParams) {
  const result = { reminders: 0, expired: 0, due_for_publish: [] as string[], credit_warnings: [] as string[] };
  const nowIso = new Date(p.nowMs).toISOString();

  const { data: plans, error } = await p.supabase.from('content_plans').select(PLAN_COLUMNS)
    .eq('business_id', p.businessId).in('status', ['awaiting_approval', 'approved', 'queued']);
  if (error) throw new Error(`content_plans select failed: ${error.message || error}`);

  for (const plan of plans || []) {
    const step = nextApprovalStep(plan, p.nowMs, p.rules);
    const chatIds = plan.telegram_chat_id ? [plan.telegram_chat_id] : p.rules.approver_telegram_chat_ids;
    if (step === 'send_reminder') {
      const ok = await transition(p.supabase, plan.id, ['awaiting_approval'], { reminder_sent_at: nowIso, updated_at: nowIso });
      if (!ok) continue;
      for (const chat_id of chatIds) {
        await p.send('sendMessage', {
          chat_id,
          text: `Hatırlatma: bugünkü içerik (${plan.sub_topic}) onay bekliyor. Yayın saati ${formatLocalTime(plan.scheduled_publish_at, p.rules.timezone)}.`,
          reply_markup: approvalKeyboard(plan.id),
          reply_to_message_id: plan.telegram_message_id ? Number(plan.telegram_message_id) : undefined,
        });
      }
      result.reminders++;
    } else if (step === 'expire') {
      const ok = await transition(p.supabase, plan.id, ['awaiting_approval'], { status: 'expired', updated_at: nowIso });
      if (!ok) continue;
      await audit(p.supabase, p.businessId, 'content_plan_expired', { plan_id: plan.id, plan_date: plan.plan_date }, p.nowMs);
      for (const chat_id of chatIds) {
        await p.send('sendMessage', {
          chat_id,
          text: `${plan.plan_date} içeriği onaylanmadığı için o gün yayın yapılmadı. Video silinmedi; onaylarsan bekleyen kuyruğuna alınır.`,
          reply_markup: approvalKeyboard(plan.id),
        });
      }
      result.expired++;
    }
  }

  result.due_for_publish = publishOrder(
    (plans || []).filter((pl: any) => pl.status === 'approved' || pl.status === 'queued'),
    p.nowMs,
  ).map((pl: any) => pl.id);

  // Low-credit warning, at most once per provider per local day.
  const { data: accounts } = await p.supabase.from('generation_accounts').select('*')
    .eq('business_id', p.businessId).eq('active', true);
  const providers = [...new Set((accounts || []).map((a: GenerationAccount) => a.provider))] as string[];
  for (const provider of providers) {
    const est = estimateCreditDays(accounts, provider, p.dailyUsage[provider] || 0, p.nowMs);
    if (!shouldWarnLowCredit(est, p.rules)) continue;
    const since = new Date(p.nowMs - 86_400_000).toISOString();
    const { data: prior } = await p.supabase.from('audit_log').select('id')
      .eq('business_id', p.businessId).eq('event_type', 'credit_low_warning')
      .eq('payload->>provider', provider).gte('created_at', since).limit(1);
    if (prior && prior.length) continue;
    await audit(p.supabase, p.businessId, 'credit_low_warning', { provider, days: est.days }, p.nowMs);
    for (const chat_id of p.rules.approver_telegram_chat_ids) {
      await p.send('sendMessage', {
        chat_id,
        text: `Uyarı: ${provider} kredisi yaklaşık ${est.days} gün yetecek. Yeni hesap eklemek gerekebilir.`,
      });
    }
    result.credit_warnings.push(provider);
  }

  return result;
}

// "Kaç günlük kredi kaldı?" — answer for every provider.
export function creditReport(accounts: GenerationAccount[], dailyUsage: Record<string, number>, nowMs: number): string {
  const providers = [...new Set(accounts.filter((a) => a.active).map((a) => a.provider))];
  if (!providers.length) return 'Kayıtlı üretim hesabı yok.';
  return providers.map((provider) => {
    const est = estimateCreditDays(accounts, provider, dailyUsage[provider] || 0, nowMs);
    return est.unlimited
      ? `${provider}: günlük yenilenen kredi kullanımı karşılıyor.`
      : `${provider}: yaklaşık ${est.days} gün yeter.`;
  }).join('\n');
}

// Average daily spend per provider over the last `days` days, from
// generation_credit_events (negative deltas are spend).
export async function loadDailyUsage(supabase: any, businessId: string, nowMs: number, days = 14) {
  const since = new Date(nowMs - days * 86_400_000).toISOString();
  const { data } = await supabase.from('generation_credit_events')
    .select('delta, generation_accounts(provider)')
    .eq('business_id', businessId).lt('delta', 0).gte('created_at', since);
  const usage: Record<string, number> = {};
  for (const row of data || []) {
    const provider = row.generation_accounts && row.generation_accounts.provider;
    if (!provider) continue;
    usage[provider] = (usage[provider] || 0) + (-Number(row.delta)) / days;
  }
  return usage;
}
