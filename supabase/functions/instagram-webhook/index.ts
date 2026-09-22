import { createClient } from "npm:@supabase/supabase-js@2";
import { generateReplyDraft } from "../_shared/reply-agent.ts";
import { planInboundReply, applyHumanMessage, type ConversationHandoffState } from "../_shared/handoff-agent.ts";
import { processLeadAndBooking } from "../_shared/lead-agent.ts";

const VERIFY_TOKEN = Deno.env.get("META_INSTAGRAM_VERIFY_TOKEN");
const APP_SECRET = Deno.env.get("META_APP_SECRET");

// Single-tenant bootstrap: there is one business today ("Kali Beauty
// Center"). Its id is read from an env var (a Supabase secret) instead of
// being looked up by name on every request -- a name lookup would add a DB
// round-trip per webhook call and could misroute messages if two businesses
// ever shared a name. The seed migration (see supabase/migrations/
// ..._seed_kali_business.sql) creates the row idempotently; a human reads
// its generated id once and sets it as KALI_BUSINESS_ID.
const BUSINESS_ID = Deno.env.get("KALI_BUSINESS_ID");

// Anthropic API key used to draft delayed AI replies to inbound
// messages -- see supabase/functions/_shared/reply-agent.ts. Not set in any
// committed environment; a human sets it as a Supabase Edge Function secret.
// Its absence is handled the same way as the BUSINESS_ID guard below: log
// and skip reply generation, inbound persistence and the webhook response
// are unaffected.
const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");

// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are injected automatically into
// every Supabase Edge Function; no secret needs to be set for these two.
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const supabase = SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
  : null;

const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_REQUESTS = 30;
const rateLimitBuckets = new Map<string, { count: number; windowStart: number }>();

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const bucket = rateLimitBuckets.get(ip);

  if (!bucket || now - bucket.windowStart >= RATE_LIMIT_WINDOW_MS) {
    rateLimitBuckets.set(ip, { count: 1, windowStart: now });
    return false;
  }

  bucket.count += 1;
  return bucket.count > RATE_LIMIT_MAX_REQUESTS;
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}

async function verifySignature(rawBody: string, signatureHeader: string | null): Promise<boolean> {
  if (!signatureHeader || !APP_SECRET) return false;

  const [algo, receivedHash] = signatureHeader.split("=");
  if (algo !== "sha256" || !receivedHash) return false;

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(APP_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );

  const signatureBuffer = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(rawBody));
  const expectedHash = Array.from(new Uint8Array(signatureBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  return timingSafeEqual(expectedHash, receivedHash);
}

// Instagram Messaging webhook shape: entry[].messaging[].sender.id carries
// the customer's IGSID. Text messages carry the body at message.text; other
// message types (attachments, etc.) don't have a text body, so we fall back
// to the raw message JSON. Non-message events (e.g. a "seen"/read receipt)
// have no "message" field and yield nothing here.
interface InstagramMessage {
  customerIdentifier: string;
  content: string;
  platformMessageId: string | null;
  isEcho: boolean;
}

function extractInstagramMessages(payload: unknown): InstagramMessage[] {
  const results: InstagramMessage[] = [];
  const entries = (payload as { entry?: unknown })?.entry;
  if (!Array.isArray(entries)) return results;

  for (const entry of entries) {
    const messagingEvents = (entry as { messaging?: unknown })?.messaging;
    if (!Array.isArray(messagingEvents)) continue;

    for (const event of messagingEvents) {
      const senderId = (event as { sender?: { id?: unknown } })?.sender?.id;
      if (typeof senderId !== "string" || senderId.length === 0) continue;
      const message = (event as { message?: unknown })?.message;
      if (!message) continue;
      const isEcho = (message as { is_echo?: unknown }).is_echo === true ||
        senderId === (entry as { id?: unknown }).id;
      const customerIdentifier = isEcho
        ? (event as { recipient?: { id?: unknown } }).recipient?.id : senderId;
      if (typeof customerIdentifier !== "string" || !customerIdentifier) continue;
      const mid = (message as { mid?: unknown }).mid;
      const text = (message as { text?: unknown })?.text;
      const content = typeof text === "string" ? text : JSON.stringify(message);
      results.push({ customerIdentifier, content, isEcho,
        platformMessageId: typeof mid === "string" && mid ? mid : null });
    }
  }

  return results;
}

async function findOrCreateConversation(platform: string, customerIdentifier: string): Promise<string> {
  const { data: existing, error: selectError } = await supabase!
    .from("conversations")
    .select("id")
    .eq("business_id", BUSINESS_ID)
    .eq("platform", platform)
    .eq("customer_identifier", customerIdentifier)
    .maybeSingle();
  if (selectError) throw selectError;
  if (existing) return existing.id;

  const { data: created, error: insertError } = await supabase!
    .from("conversations")
    .insert({ business_id: BUSINESS_ID, platform, customer_identifier: customerIdentifier })
    .select("id")
    .single();
  if (insertError) throw insertError;
  return created.id;
}

interface InsertedInboundMessage {
  conversationId: string;
  messageId: string;
  content: string;
  receivedAtMs: number;
  sendAfter: string;
}

async function readHandoff(conversationId: string): Promise<ConversationHandoffState> {
  const { data, error } = await supabase!.from("conversations")
    .select("control_mode, next_wait_seconds, last_customer_message_at, last_human_message_at")
    .eq("id", conversationId).eq("business_id", BUSINESS_ID).maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("instagram-webhook: conversation missing");
  return {
    controlMode: data.control_mode === "human" ? "human" : "bot",
    nextWaitSeconds: data.next_wait_seconds,
    lastCustomerMessageAtMs: data.last_customer_message_at ? Date.parse(data.last_customer_message_at) : null,
    lastHumanMessageAtMs: data.last_human_message_at ? Date.parse(data.last_human_message_at) : null,
  };
}

function matchNullable(query: any, column: string, value: string | null): any {
  return value === null ? query.is(column, null) : query.eq(column, value);
}

function iso(value: number | null): string | null {
  return value === null ? null : new Date(value).toISOString();
}

async function recordInboundTiming(conversationId: string, nowMs: number): Promise<string> {
  // Retry if another webhook or human handoff changed the state we read.
  for (let attempt = 0; attempt < 5; attempt++) {
    const state = await readHandoff(conversationId);
    const plan = planInboundReply(state, nowMs);
    let query = supabase!.from("conversations").update({
      next_wait_seconds: plan.nextState.nextWaitSeconds,
      last_customer_message_at: iso(Math.max(nowMs, state.lastCustomerMessageAtMs ?? nowMs)),
    }).eq("id", conversationId).eq("business_id", BUSINESS_ID)
      .eq("control_mode", state.controlMode).eq("next_wait_seconds", state.nextWaitSeconds);
    query = matchNullable(query, "last_customer_message_at", iso(state.lastCustomerMessageAtMs));
    query = matchNullable(query, "last_human_message_at", iso(state.lastHumanMessageAtMs));
    const { data, error } = await query.select("id").maybeSingle();
    if (error) throw error;
    if (data) return new Date(nowMs + plan.waitSeconds * 1000).toISOString();
  }
  throw new Error("instagram-webhook: concurrent handoff update, reply not scheduled");
}

async function recordHumanMessage(conversationId: string, event: InstagramMessage, nowMs: number) {
  const state = applyHumanMessage(await readHandoff(conversationId), nowMs);
  const { error } = await supabase!.from("conversations").update({
    control_mode: state.controlMode, last_human_message_at: iso(state.lastHumanMessageAtMs),
  }).eq("id", conversationId).eq("business_id", BUSINESS_ID);
  if (error) throw error;
  // Stop the conversation before any other writes. The dispatcher's final
  // check also rejects already-claimed replies to messages she answered.
  const { error: cancelError } = await supabase!.from("pending_replies")
    .update({ status: "cancelled" }).eq("conversation_id", conversationId)
    .eq("business_id", BUSINESS_ID).eq("status", "scheduled");
  if (cancelError) throw cancelError;
  const { error: draftError } = await supabase!.from("messages")
    .update({ status: "cancelled" }).eq("conversation_id", conversationId)
    .eq("business_id", BUSINESS_ID).eq("author", "ai").eq("status", "draft");
  if (draftError) throw draftError;
  const { error: insertError } = await supabase!.from("messages").insert({
    business_id: BUSINESS_ID, conversation_id: conversationId, direction: "outbound",
    author: "human", status: "sent", content: event.content,
    platform_message_id: event.platformMessageId, created_at: iso(nowMs),
  });
  if (insertError && insertError.code !== "23505") throw insertError;
}

async function persistInboundMessages(payload: unknown): Promise<InsertedInboundMessage[]> {
  if (!supabase || !BUSINESS_ID) {
    console.error("instagram-webhook: SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY/KALI_BUSINESS_ID not configured, skipping persistence");
    return [];
  }

  const inserted: InsertedInboundMessage[] = [];
  const conversationIdByCustomer = new Map<string, string>();
  for (const event of extractInstagramMessages(payload)) {
    const { customerIdentifier, content, platformMessageId } = event;
    // Meta echoes our own Send API message_id. Match IDs, never text: a
    // human is allowed to write exactly the same words as an AI draft.
    if (platformMessageId) {
      const { data: known, error } = await supabase.from("messages").select("id")
        .eq("business_id", BUSINESS_ID).eq("platform_message_id", platformMessageId).maybeSingle();
      if (error) throw error;
      if (known) continue;
    }
    let conversationId = conversationIdByCustomer.get(customerIdentifier);
    if (!conversationId) {
      conversationId = await findOrCreateConversation("instagram", customerIdentifier);
      conversationIdByCustomer.set(customerIdentifier, conversationId);
    }

    const receivedAtMs = Date.now();
    if (event.isEcho) {
      await recordHumanMessage(conversationId, event, receivedAtMs);
      continue;
    }

    const { data, error } = await supabase
      .from("messages")
      .insert({
        business_id: BUSINESS_ID,
        conversation_id: conversationId,
        direction: "inbound",
        content,
        platform_message_id: platformMessageId,
        created_at: iso(receivedAtMs),
      })
      .select("id")
      .single();
    if (error?.code === "23505") continue;
    if (error) throw error;
    const sendAfter = await recordInboundTiming(conversationId, receivedAtMs);
    inserted.push({ conversationId, messageId: data.id, content, receivedAtMs, sendAfter });
  }
  return inserted;
}

Deno.serve(async (req: Request) => {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "unknown";

  if (isRateLimited(ip)) {
    return new Response("Too Many Requests", { status: 429 });
  }

  if (req.method === "GET") {
    const url = new URL(req.url);
    const mode = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge");

    if (mode === "subscribe" && token === VERIFY_TOKEN) {
      return new Response(challenge ?? "", { status: 200 });
    }

    return new Response("Forbidden", { status: 403 });
  }

  if (req.method === "POST") {
    const rawBody = await req.text();
    const signatureHeader = req.headers.get("x-hub-signature-256");

    if (!(await verifySignature(rawBody, signatureHeader))) {
      return new Response("Unauthorized", { status: 401 });
    }

    let payload: unknown;
    try {
      payload = JSON.parse(rawBody);
    } catch {
      return new Response("Bad Request", { status: 400 });
    }

    let insertedInboundMessages: InsertedInboundMessage[] = [];
    try {
      insertedInboundMessages = await persistInboundMessages(payload);
    } catch (error) {
      // Meta retries webhook deliveries with backoff over an extended window
      // (documented as repeated attempts across multiple days) whenever it
      // doesn't receive a 2xx response. Returning a 5xx here for a transient
      // DB error would trigger duplicate retries -- and duplicate inbound
      // rows once a retry succeeds -- for a problem Meta retrying can't fix.
      // We log and still acknowledge with 200; a failed write is chased down
      // via function logs, not by relying on Meta's retry behavior.
      console.error("instagram-webhook: failed to persist inbound message", error);
    }

    // The dispatcher sends due drafts; the webhook never sleeps or sends.
    if (supabase && BUSINESS_ID) {
      for (const inbound of insertedInboundMessages) {
        try {
          const before = await readHandoff(inbound.conversationId);
          if (before.lastHumanMessageAtMs !== null && before.lastHumanMessageAtMs >= inbound.receivedAtMs) continue;
          const draft = await generateReplyDraft({
            supabase,
            businessId: BUSINESS_ID,
            conversationId: inbound.conversationId,
            inboundMessageId: inbound.messageId,
            inboundContent: inbound.content,
            anthropicApiKey: ANTHROPIC_API_KEY,
            fetchImpl: fetch,
          });
          if (!draft) continue;
          const after = await readHandoff(inbound.conversationId);
          if (after.lastHumanMessageAtMs !== null && after.lastHumanMessageAtMs >= inbound.receivedAtMs) continue;
          const { data: outbound, error: draftError } = await supabase.from("messages").insert({
            business_id: BUSINESS_ID, conversation_id: inbound.conversationId,
            direction: "outbound", author: "ai", status: "draft", content: draft.replyText,
          }).select("id").single();
          if (draftError) throw draftError;
          const { error: queueError } = await supabase.from("pending_replies").insert({
            business_id: BUSINESS_ID, conversation_id: inbound.conversationId,
            message_id: outbound.id, inbound_message_id: inbound.messageId,
            send_after: inbound.sendAfter, status: "scheduled",
          });
          if (queueError) {
            await supabase.from("messages").update({ status: "cancelled" }).eq("id", outbound.id);
            throw queueError;
          }
          // Close the generation/enqueue race: human cancellation may have
          // happened just before our draft or queue row existed.
          const queuedState = await readHandoff(inbound.conversationId);
          if (queuedState.lastHumanMessageAtMs !== null && queuedState.lastHumanMessageAtMs >= inbound.receivedAtMs) {
            const { error: cancelError } = await supabase.from("pending_replies")
              .update({ status: "cancelled" }).eq("message_id", outbound.id).eq("status", "scheduled");
            if (cancelError) throw cancelError;
            const { error: cancelDraftError } = await supabase.from("messages")
              .update({ status: "cancelled" }).eq("id", outbound.id).eq("status", "draft");
            if (cancelDraftError) throw cancelDraftError;
          }
        } catch (error) {
          console.error("instagram-webhook: failed to generate reply", error);
        }
      }
    }

    // Core lead qualification + basic appointment booking (see
    // supabase/functions/_shared/lead-agent.ts). Same retry-avoidance
    // reasoning and per-message try/catch as the reply-generation loop
    // above: a failure here must never change the 2xx response Meta sees.
    // Runs after reply generation, independently of whether it succeeded.
    if (supabase && BUSINESS_ID) {
      for (const inbound of insertedInboundMessages) {
        try {
          await processLeadAndBooking({
            supabase,
            businessId: BUSINESS_ID,
            conversationId: inbound.conversationId,
            content: inbound.content,
            nowMs: Date.now(),
          });
        } catch (error) {
          console.error("instagram-webhook: failed to process lead/booking", error);
        }
      }
    }

    console.log("Instagram webhook:", JSON.stringify(payload));
    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  return new Response("Method Not Allowed", { status: 405 });
});
