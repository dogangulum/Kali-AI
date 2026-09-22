// Shared by the WhatsApp and Instagram webhook Edge Functions: given an
// inbound message that has already been persisted, draft an AI reply in the
// business's own configured tone and store it -- never send it anywhere.
// See docs/PROJECT_HANDOFF.md and CLAUDE.md for the "why" behind the
// multi-tenant rule this file follows (no business-specific content here,
// only shape/scaffolding; every fact comes from business_config.config).
//
// Deliberately Deno-free: no `Deno.*` reference anywhere in this file. The
// caller (the webhook Edge Function) reads secrets and passes them in as
// plain arguments, and passes Deno's native global `fetch` in as
// `fetchImpl`. That's what lets this module be loaded and unit-tested in a
// plain Node vm sandbox (see tests/helpers/webhook-suite.cjs) without any
// Deno emulation, and lets tests substitute a mock fetch with zero network
// access, mirroring how tests/whatsapp-webhook.test.cjs already mocks the
// Supabase client instead of hitting a real database.

export interface ServiceConfig {
  id?: string;
  name?: string;
  description?: string;
  duration_minutes?: number;
  price?: { amount?: number; unit?: string; tax_included?: boolean };
  active?: boolean;
}

export interface ConversationStyleConfig {
  tone?: string;
  address_form?: string;
  response_length?: string;
  emoji_usage?: string;
  greeting?: string;
  guidelines?: string[];
}

export interface BusinessConfig {
  language?: string;
  currency?: string;
  services?: ServiceConfig[];
  working_hours?: Record<string, Array<{ opens: string; closes: string }>>;
  conversation_style?: ConversationStyleConfig;
}

export type ModelKey = "haiku" | "sonnet";

const HAIKU_MODEL_ID = "claude-haiku-4-5";
const SONNET_MODEL_ID = "claude-sonnet-5";
const ANTHROPIC_API_VERSION = "2023-06-01";
const ANTHROPIC_MESSAGES_URL = "https://api.anthropic.com/v1/messages";

// Anthropic first-party list pricing (USD per million tokens), current as of
// this file's writing. Used only to populate model_routing_log.cost_usd for
// cost-optimization reporting -- not billing-authoritative. A human should
// revisit these if Anthropic's published pricing changes.
const PRICING_USD_PER_MTOK: Record<string, { input: number; output: number }> = {
  [HAIKU_MODEL_ID]: { input: 1.0, output: 5.0 },
  [SONNET_MODEL_ID]: { input: 2.0, output: 10.0 },
};

// ---------------------------------------------------------------------------
// Model routing
// ---------------------------------------------------------------------------
//
// A deterministic keyword/pattern heuristic instead of a second "is this
// simple or complex?" model call, on purpose: a classification call before
// the generation call would double latency and billed requests for *every*
// inbound message, which cuts against CLAUDE.md's own token/cost
// optimization rule for a decision that's usually obvious from surface
// features. It's also fully deterministic and unit-testable with zero
// mocking. The business's own service names (from business_config) feed the
// "simple" side of the heuristic, so this stays multi-tenant: no per-business
// code changes needed for a new tenant's vocabulary.
//
// Anything that doesn't clearly match either bucket defaults to the more
// capable model rather than risking a cheap model mishandling an objection
// or persuasion case -- the same "when in doubt, route up a tier" principle
// AGENTS.md already applies to human/AI task routing in this project.

const COMPLEX_SIGNAL_PATTERNS: RegExp[] = [
  /indirim/i,
  /pahal[ıi]/i,
  /uygun\s*de[gğ]il/i,
  /d[uü][sş][uü]n/i,
  /emin\s*de[gğ]il/i,
  /ba[sş]ka\s*yer/i,
  /kar[sş][ıi]la[sş]t[ıi]r/i,
  /garanti/i,
  /[sş]ikayet/i,
  /iptal/i,
  /vazge[cç]/i,
  /discount/i,
  /expensive/i,
  /compare/i,
  /not\s*sure/i,
  /cancel/i,
  /complain/i,
  /refund/i,
];

const GENERIC_SIMPLE_PATTERNS: RegExp[] = [
  /\bfiyat/i,
  /\b[uü]cret/i,
  /ka[cç]\s*(tl|₺|lira|para)/i,
  /ne\s*kadar/i,
  /\bsaat/i,
  /[cç]al[ıi][sş]ma\s*saat/i,
  /a[cç][ıi]k\s*m[ıi]/i,
  /kapal[ıi]\s*m[ıi]/i,
  /\badres/i,
  /\bnerede/i,
  /\bkonum/i,
  /\bs[uü]re\b/i,
  /dakika/i,
  /\bprice/i,
  /\bcost/i,
  /\bhours?\b/i,
  /\baddress/i,
  /\blocation/i,
];

const LONG_MESSAGE_THRESHOLD = 220;

export function classifyComplexity(
  content: string,
  config: BusinessConfig | null | undefined,
): { modelKey: ModelKey; modelId: string; reason: string } {
  const text = content ?? "";

  if (COMPLEX_SIGNAL_PATTERNS.some((re) => re.test(text))) {
    return { modelKey: "sonnet", modelId: SONNET_MODEL_ID, reason: "complex-signal-keyword" };
  }

  const isLong = text.length > LONG_MESSAGE_THRESHOLD;
  const questionMarkCount = (text.match(/\?/g) ?? []).length;
  if (isLong) {
    return { modelKey: "sonnet", modelId: SONNET_MODEL_ID, reason: "long-message" };
  }
  if (questionMarkCount > 1) {
    return { modelKey: "sonnet", modelId: SONNET_MODEL_ID, reason: "multiple-questions" };
  }

  const serviceNames = (config?.services ?? [])
    .map((s) => s?.name)
    .filter((n): n is string => typeof n === "string" && n.length > 0);
  // Turkish "İ"/"I" don't lowercase correctly under the default (root)
  // locale (e.g. "İ".toLowerCase() === "i̇", not "i"), which would silently
  // break service-name matching for any Turkish business config -- most of
  // them, in this project. toLocaleLowerCase("tr") maps them correctly.
  const lowerText = text.toLocaleLowerCase("tr");

  const matchesSimpleVocabulary =
    GENERIC_SIMPLE_PATTERNS.some((re) => re.test(text)) ||
    serviceNames.some((name) => lowerText.includes(name.toLocaleLowerCase("tr")));

  if (matchesSimpleVocabulary) {
    return { modelKey: "haiku", modelId: HAIKU_MODEL_ID, reason: "matched-simple-vocabulary" };
  }

  return { modelKey: "sonnet", modelId: SONNET_MODEL_ID, reason: "default-uncertain" };
}

export function computeCostUsd(modelId: string, inputTokens: number, outputTokens: number): number {
  const pricing = PRICING_USD_PER_MTOK[modelId];
  if (!pricing) return 0;
  const cost = (inputTokens / 1_000_000) * pricing.input + (outputTokens / 1_000_000) * pricing.output;
  return Math.round(cost * 1_000_000) / 1_000_000;
}

// ---------------------------------------------------------------------------
// Prompt construction -- every business-specific fact comes from `config`.
// Nothing about Kali Beauty Center (or any other tenant) is hardcoded here;
// only generic instructional scaffolding, per CLAUDE.md's multi-tenant rule.
// ---------------------------------------------------------------------------

export function buildSystemPrompt(config: BusinessConfig | null | undefined): string {
  const style = config?.conversation_style ?? {};
  const services = Array.isArray(config?.services)
    ? config!.services!.filter((s) => s?.active !== false && typeof s?.name === "string")
    : [];
  const currency = config?.currency ?? "";
  const language = config?.language ?? "tr-TR";

  const serviceLines = services.map((s) => {
    const amount = s.price?.amount;
    const priceText = amount != null ? `${amount} ${currency}`.trim() : "fiyat belirtilmemiş";
    const durationText = s.duration_minutes != null ? `${s.duration_minutes} dk` : "";
    const descriptionText = s.description ? ` — ${s.description}` : "";
    return `- ${s.name}: ${priceText}${durationText ? ` (${durationText})` : ""}${descriptionText}`;
  });

  const workingHours = config?.working_hours ?? null;
  const hoursLines = workingHours
    ? Object.entries(workingHours).map(([day, ranges]) => {
        const rangeText = Array.isArray(ranges) && ranges.length > 0
          ? ranges.map((r) => `${r.opens}-${r.closes}`).join(", ")
          : "kapalı";
        return `- ${day}: ${rangeText}`;
      })
    : [];

  const guidelines = Array.isArray(style.guidelines) ? style.guidelines : [];

  const sections = [
    `Yanıt dili: ${language}.`,
    style.tone ? `Ton: ${style.tone}.` : null,
    style.address_form ? `Hitap biçimi: ${style.address_form}.` : null,
    style.response_length ? `Yanıt uzunluğu: ${style.response_length}.` : null,
    style.emoji_usage ? `Emoji kullanımı: ${style.emoji_usage}.` : null,
    style.greeting
      ? `Karşılama örneği (birebir tekrar etmek zorunda değilsin): ${style.greeting}`
      : null,
    serviceLines.length
      ? `Hizmetler ve fiyatlar:\n${serviceLines.join("\n")}`
      : "Hizmet/fiyat listesi henüz tanımlanmamış; bu konuda kesin bilgi verme.",
    hoursLines.length ? `Çalışma saatleri:\n${hoursLines.join("\n")}` : null,
    guidelines.length ? `Kurallar:\n${guidelines.map((g) => `- ${g}`).join("\n")}` : null,
    "Yalnızca yukarıda verilen bilgileri kullan; listelenmemiş hizmet, fiyat, indirim veya randevu saati hakkında söz verme ya da uydurma bilgi paylaşma. Uygunluk teyit edilmeden randevuyu kesinleşmiş gibi sunma.",
  ];

  return sections.filter((s): s is string => Boolean(s)).join("\n\n");
}

export function buildUserTurn(existingSummary: string | null | undefined, inboundContent: string): string {
  const parts: string[] = [];
  if (existingSummary) {
    parts.push(`Önceki konuşma özeti: ${existingSummary}`);
  }
  parts.push(`Müşterinin yeni mesajı: ${inboundContent}`);
  parts.push(
    "Bu mesaja işletmenin tonuna uygun, kısa bir yanıt taslağı yaz. Yanıtın yalnızca müşteriye gönderilecek metin olsun; başka açıklama ekleme.",
  );
  return parts.join("\n\n");
}

// ---------------------------------------------------------------------------
// Anthropic API call -- raw fetch, not npm:@anthropic-ai/sdk.
//
// Deno Edge Functions already pull in npm:@supabase/supabase-js@2 via Deno's
// npm compat layer; adding a second npm dependency purely for one
// POST /v1/messages call adds cold-start/bundle cost for what is a single,
// simple, non-streaming, no-tool-use chat completion. `fetchImpl` is a
// required parameter (not a default of the ambient `fetch`) so this
// function never depends on what happens to be in whatever JS realm it's
// loaded into -- the real webhook passes Deno's native global `fetch`;
// tests pass a mock function, the same seam the task description itself
// calls out as acceptable ("mocking the fetch/Anthropic client call").
// ---------------------------------------------------------------------------

export interface AnthropicCallResult {
  text: string;
  inputTokens: number;
  outputTokens: number;
}

type FetchLike = (input: string, init: unknown) => Promise<{
  ok: boolean;
  status: number;
  json: () => Promise<any>;
  text: () => Promise<string>;
}>;

export async function callAnthropicMessages(params: {
  apiKey: string;
  modelId: string;
  system: string;
  userContent: string;
  fetchImpl: FetchLike;
  maxTokens?: number;
}): Promise<AnthropicCallResult> {
  const { apiKey, modelId, system, userContent, fetchImpl, maxTokens = 500 } = params;

  const response = await fetchImpl(ANTHROPIC_MESSAGES_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": ANTHROPIC_API_VERSION,
    },
    body: JSON.stringify({
      model: modelId,
      max_tokens: maxTokens,
      system,
      messages: [{ role: "user", content: userContent }],
    }),
  });

  if (!response.ok) {
    let detail = "";
    try {
      detail = await response.text();
    } catch {
      // ignore -- best-effort error detail only
    }
    throw new Error(`Anthropic API error ${response.status}: ${detail}`);
  }

  const data = await response.json();
  const text = Array.isArray(data?.content)
    ? data.content
        .filter((block: unknown) => (block as { type?: unknown })?.type === "text")
        .map((block: unknown) => (block as { text?: unknown }).text ?? "")
        .join("\n")
        .trim()
    : "";
  const inputTokens = Number(data?.usage?.input_tokens ?? 0);
  const outputTokens = Number(data?.usage?.output_tokens ?? 0);

  return { text, inputTokens, outputTokens };
}

// ---------------------------------------------------------------------------
// Rolling conversation summary
//
// Plain string concatenation as long as the running summary stays under
// SUMMARY_CHAR_THRESHOLD -- no API call at all for the common case of a
// short-lived conversation. Only once it grows past that does a cheap Haiku
// call compress it. This is "summarize on the Nth exchange" triggered by
// actual size instead of a fixed turn count, so most conversations never
// pay for the extra call. Never throws: a compression failure falls back to
// truncation rather than losing the summary or aborting reply generation.
// ---------------------------------------------------------------------------

const SUMMARY_CHAR_THRESHOLD = 1200;

function appendExchange(
  existingSummary: string | null | undefined,
  inboundContent: string,
  outboundContent: string,
): string {
  const line = `Müşteri: ${inboundContent}\nİşletme: ${outboundContent}`;
  return existingSummary ? `${existingSummary}\n${line}` : line;
}

export async function foldConversationSummary(params: {
  existingSummary: string | null | undefined;
  inboundContent: string;
  outboundContent: string;
  apiKey: string | null | undefined;
  fetchImpl: FetchLike;
}): Promise<string> {
  const { existingSummary, inboundContent, outboundContent, apiKey, fetchImpl } = params;
  const appended = appendExchange(existingSummary, inboundContent, outboundContent);

  if (appended.length <= SUMMARY_CHAR_THRESHOLD) {
    return appended;
  }

  if (!apiKey) {
    return appended.slice(-SUMMARY_CHAR_THRESHOLD);
  }

  try {
    const { text } = await callAnthropicMessages({
      apiKey,
      modelId: HAIKU_MODEL_ID,
      system:
        "Aşağıdaki müşteri konuşma geçmişini, önemli talepleri ve bağlamı koruyarak birkaç cümlelik kısa bir özete dönüştür. Yalnızca özeti yaz, başka açıklama ekleme.",
      userContent: appended,
      fetchImpl,
      maxTokens: 300,
    });
    return text || appended.slice(-SUMMARY_CHAR_THRESHOLD);
  } catch (error) {
    console.error("reply-agent: summary compression failed, falling back to truncation", error);
    return appended.slice(-SUMMARY_CHAR_THRESHOLD);
  }
}

// ---------------------------------------------------------------------------
// Orchestrator
//
// Error handling mirrors the existing persistInboundMessages convention
// (throw real errors, let the webhook's own try/catch log them and keep the
// 200 response), with one refinement: once the reply text itself is safely
// stored, secondary bookkeeping (the routing-log row, the summary update)
// is caught internally so it can't undo that.
// ---------------------------------------------------------------------------

export interface SupabaseLike {
  from(table: string): any;
}

export interface ReplyDraft {
  replyText: string;
  existingSummary: string | null;
}

// Does everything generateAndStoreReply below does, up to (and including)
// the model_routing_log write, but stops short of deciding what happens to
// the reply -- it neither inserts a `messages` row nor updates the
// conversation summary. Returns `null` when reply generation was skipped
// (missing API key/config) rather than throwing, mirroring
// generateAndStoreReply's own early-return behavior.
//
// Used by instagram-webhook, which -- unlike whatsapp-webhook, which still
// calls generateAndStoreReply directly and sends nothing -- has to schedule
// the reply per Doğan's human-handoff timing rules (see handoff-agent.ts)
// instead of storing/sending it immediately.
async function computeReplyDraft(params: {
  supabase: SupabaseLike;
  businessId: string;
  conversationId: string;
  inboundMessageId: string;
  inboundContent: string;
  anthropicApiKey: string | null | undefined;
  fetchImpl: FetchLike;
}): Promise<ReplyDraft | null> {
  const { supabase, businessId, conversationId, inboundMessageId, inboundContent, anthropicApiKey, fetchImpl } =
    params;

  if (!anthropicApiKey) {
    console.error("reply-agent: ANTHROPIC_API_KEY not configured, skipping reply generation");
    return null;
  }

  const { data: configRow, error: configError } = await supabase
    .from("business_config")
    .select("config")
    .eq("business_id", businessId)
    .maybeSingle();
  if (configError) throw configError;
  if (!configRow) {
    console.error(`reply-agent: no business_config found for business ${businessId}, skipping reply generation`);
    return null;
  }
  const config: BusinessConfig = configRow.config ?? {};

  const { data: conversationRow, error: conversationError } = await supabase
    .from("conversations")
    .select("summary")
    .eq("id", conversationId)
    .maybeSingle();
  if (conversationError) throw conversationError;
  const existingSummary: string | null = conversationRow?.summary ?? null;

  const { modelId, reason } = classifyComplexity(inboundContent, config);
  console.log(`reply-agent: routed message ${inboundMessageId} to ${modelId} (${reason})`);

  const system = buildSystemPrompt(config);
  const userContent = buildUserTurn(existingSummary, inboundContent);

  const start = Date.now();
  const { text: replyText, inputTokens, outputTokens } = await callAnthropicMessages({
    apiKey: anthropicApiKey,
    modelId,
    system,
    userContent,
    fetchImpl,
  });
  const latencyMs = Date.now() - start;
  const costUsd = computeCostUsd(modelId, inputTokens, outputTokens);

  try {
    const { error: logError } = await supabase.from("model_routing_log").insert({
      business_id: businessId,
      message_id: inboundMessageId,
      provider: "anthropic",
      model: modelId,
      cost_usd: costUsd,
      latency_ms: latencyMs,
    });
    if (logError) throw logError;
  } catch (error) {
    console.error("reply-agent: failed to write model_routing_log", error);
  }

  return { replyText, existingSummary };
}

export async function generateReplyDraft(params: {
  supabase: SupabaseLike;
  businessId: string;
  conversationId: string;
  inboundMessageId: string;
  inboundContent: string;
  anthropicApiKey: string | null | undefined;
  fetchImpl: FetchLike;
}): Promise<ReplyDraft | null> {
  return computeReplyDraft(params);
}

// Given whatever a conversation's summary is *right now* (read fresh, since
// this runs however long after computeReplyDraft/generateReplyDraft did --
// possibly after other messages) plus the exchange that just happened,
// updates the stored summary. Used once a reply's fate (sent or the human
// rep's own message instead) is actually known -- see
// supabase/functions/instagram-reply-dispatcher/index.ts and the echo-handling
// branch in supabase/functions/instagram-webhook/index.ts.
export async function updateConversationSummaryAfterExchange(params: {
  supabase: SupabaseLike;
  conversationId: string;
  inboundContent: string;
  outboundContent: string;
  anthropicApiKey: string | null | undefined;
  fetchImpl: FetchLike;
}): Promise<void> {
  const { supabase, conversationId, inboundContent, outboundContent, anthropicApiKey, fetchImpl } = params;
  try {
    const { data: conversationRow, error: conversationError } = await supabase
      .from("conversations")
      .select("summary")
      .eq("id", conversationId)
      .maybeSingle();
    if (conversationError) throw conversationError;
    const existingSummary: string | null = conversationRow?.summary ?? null;

    const newSummary = await foldConversationSummary({
      existingSummary,
      inboundContent,
      outboundContent,
      apiKey: anthropicApiKey,
      fetchImpl,
    });
    const { error: summaryError } = await supabase
      .from("conversations")
      .update({ summary: newSummary })
      .eq("id", conversationId);
    if (summaryError) throw summaryError;
  } catch (error) {
    console.error("reply-agent: failed to update conversation summary", error);
  }
}

export async function generateAndStoreReply(params: {
  supabase: SupabaseLike;
  businessId: string;
  conversationId: string;
  inboundMessageId: string;
  inboundContent: string;
  anthropicApiKey: string | null | undefined;
  fetchImpl: FetchLike;
}): Promise<void> {
  const { supabase, businessId, conversationId, inboundMessageId, inboundContent, anthropicApiKey, fetchImpl } =
    params;

  const draft = await computeReplyDraft(params);
  if (!draft) return;
  const { replyText, existingSummary } = draft;

  const { error: insertError } = await supabase.from("messages").insert({
    business_id: businessId,
    conversation_id: conversationId,
    direction: "outbound",
    content: replyText,
  });
  if (insertError) throw insertError;

  try {
    const newSummary = await foldConversationSummary({
      existingSummary,
      inboundContent,
      outboundContent: replyText,
      apiKey: anthropicApiKey,
      fetchImpl,
    });
    const { error: summaryError } = await supabase
      .from("conversations")
      .update({ summary: newSummary })
      .eq("id", conversationId);
    if (summaryError) throw summaryError;
  } catch (error) {
    console.error("reply-agent: failed to update conversation summary", error);
  }
}
