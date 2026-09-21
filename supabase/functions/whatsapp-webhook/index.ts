import { createClient } from "npm:@supabase/supabase-js@2";
import { generateAndStoreReply } from "../_shared/reply-agent.ts";

const VERIFY_TOKEN = Deno.env.get("META_WHATSAPP_VERIFY_TOKEN");
const APP_SECRET = Deno.env.get("META_APP_SECRET");

// Single-tenant bootstrap: there is one business today ("Kali Beauty
// Center"). Its id is read from an env var (a Supabase secret) instead of
// being looked up by name on every request -- a name lookup would add a DB
// round-trip per webhook call and could misroute messages if two businesses
// ever shared a name. The seed migration (see supabase/migrations/
// ..._seed_kali_business.sql) creates the row idempotently; a human reads
// its generated id once and sets it as KALI_BUSINESS_ID.
const BUSINESS_ID = Deno.env.get("KALI_BUSINESS_ID");

// Anthropic API key used to draft (never send) AI replies to inbound
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

// WhatsApp Cloud API webhook shape: entry[].changes[].value.messages[].from
// carries the customer's phone number. Text messages carry the body at
// messages[].text.body; other types (image/audio/location/interactive/...)
// don't have a text body, so we fall back to the raw message JSON. A
// delivery/read status update has no "messages" array at all (it has
// "statuses" instead) and yields nothing here.
function extractWhatsAppMessages(payload: unknown): Array<{ customerIdentifier: string; content: string }> {
  const results: Array<{ customerIdentifier: string; content: string }> = [];
  const entries = (payload as { entry?: unknown })?.entry;
  if (!Array.isArray(entries)) return results;

  for (const entry of entries) {
    const changes = (entry as { changes?: unknown })?.changes;
    if (!Array.isArray(changes)) continue;

    for (const change of changes) {
      const messages = (change as { value?: { messages?: unknown } })?.value?.messages;
      if (!Array.isArray(messages)) continue;

      for (const message of messages) {
        const from = (message as { from?: unknown })?.from;
        if (typeof from !== "string" || from.length === 0) continue;
        const body = (message as { text?: { body?: unknown } })?.text?.body;
        const content = typeof body === "string" ? body : JSON.stringify(message);
        results.push({ customerIdentifier: from, content });
      }
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
}

async function persistInboundMessages(payload: unknown): Promise<InsertedInboundMessage[]> {
  if (!supabase || !BUSINESS_ID) {
    console.error("whatsapp-webhook: SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY/KALI_BUSINESS_ID not configured, skipping persistence");
    return [];
  }

  const inserted: InsertedInboundMessage[] = [];
  const conversationIdByCustomer = new Map<string, string>();
  for (const { customerIdentifier, content } of extractWhatsAppMessages(payload)) {
    let conversationId = conversationIdByCustomer.get(customerIdentifier);
    if (!conversationId) {
      conversationId = await findOrCreateConversation("whatsapp", customerIdentifier);
      conversationIdByCustomer.set(customerIdentifier, conversationId);
    }

    const { data, error } = await supabase
      .from("messages")
      .insert({
        business_id: BUSINESS_ID,
        conversation_id: conversationId,
        direction: "inbound",
        content,
      })
      .select("id")
      .single();
    if (error) throw error;
    inserted.push({ conversationId, messageId: data.id, content });
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
      console.error("whatsapp-webhook: failed to persist inbound message", error);
    }

    // Draft (never send) an AI reply for each inbound message that was
    // successfully persisted above. Same retry-avoidance reasoning as the
    // persistence step: a failure here must never change the 2xx response
    // Meta sees, so each message's reply generation is its own try/catch and
    // a failure just gets logged. This only stores a draft `messages` row
    // (direction: 'outbound') -- no Meta/WhatsApp send API is called here.
    if (supabase && BUSINESS_ID) {
      for (const inbound of insertedInboundMessages) {
        try {
          await generateAndStoreReply({
            supabase,
            businessId: BUSINESS_ID,
            conversationId: inbound.conversationId,
            inboundMessageId: inbound.messageId,
            inboundContent: inbound.content,
            anthropicApiKey: ANTHROPIC_API_KEY,
            fetchImpl: fetch,
          });
        } catch (error) {
          console.error("whatsapp-webhook: failed to generate reply", error);
        }
      }
    }

    console.log("WhatsApp webhook:", JSON.stringify(payload));
    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  return new Response("Method Not Allowed", { status: 405 });
});
