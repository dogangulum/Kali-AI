import { createClient } from "npm:@supabase/supabase-js@2";
import { handleTelegramUpdate } from "../_shared/content-approval-agent.ts";
import { loadPipelineRules } from "../_shared/pipeline-config.ts";
import { createTelegramSender, secretMatches } from "../_shared/telegram.ts";

// Telegram calls this for every button tap / message sent to the approval
// bot. Authenticity: Telegram echoes the secret_token given at setWebhook in
// X-Telegram-Bot-Api-Secret-Token; anything without it is rejected. Only
// chat ids listed in content_pipeline.approver_telegram_chat_ids can act.

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const BOT_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN");
const WEBHOOK_SECRET = Deno.env.get("TELEGRAM_WEBHOOK_SECRET");
const BUSINESS_ID = Deno.env.get("KALI_BUSINESS_ID");

const supabase = SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
  : null;

// Simple per-instance rate limit: 30 updates / minute.
const WINDOW_MS = 60_000;
const LIMIT = 30;
let windowStart = 0;
let count = 0;

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return new Response("Method Not Allowed", { status: 405 });
  if (!secretMatches(req.headers.get("X-Telegram-Bot-Api-Secret-Token"), WEBHOOK_SECRET)) {
    return new Response("Forbidden", { status: 403 });
  }
  const now = Date.now();
  if (now - windowStart > WINDOW_MS) { windowStart = now; count = 0; }
  if (++count > LIMIT) return new Response("Too Many Requests", { status: 429 });

  if (!supabase || !BOT_TOKEN || !BUSINESS_ID) {
    console.error("telegram-approval-webhook: missing SUPABASE/TELEGRAM_BOT_TOKEN/KALI_BUSINESS_ID");
    return new Response("ok", { status: 200 }); // don't make Telegram retry forever
  }

  let update: unknown;
  try { update = await req.json(); } catch { return new Response("Bad Request", { status: 400 }); }

  try {
    const rules = await loadPipelineRules(supabase, BUSINESS_ID);
    const result = await handleTelegramUpdate({
      supabase, update, rules, businessId: BUSINESS_ID, nowMs: now,
      send: createTelegramSender(BOT_TOKEN, fetch),
    });
    return new Response(JSON.stringify(result), { status: 200, headers: { "Content-Type": "application/json" } });
  } catch (err) {
    console.error("telegram-approval-webhook:", err instanceof Error ? err.message : err);
    return new Response("ok", { status: 200 });
  }
});
