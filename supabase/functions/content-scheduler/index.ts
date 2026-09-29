import { createClient } from "npm:@supabase/supabase-js@2";
import { loadDailyUsage, runContentScheduler } from "../_shared/content-approval-agent.ts";
import { loadPipelineRules } from "../_shared/pipeline-config.ts";
import { createTelegramSender, secretMatches } from "../_shared/telegram.ts";

// Called by pg_cron every ~5 minutes. Sends approval reminders, expires
// unanswered drafts at the end of their day, raises low-credit warnings,
// and returns which approved/queued plans are due for publishing (the
// Oracle worker does the actual publishing).

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const BOT_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN");
const BUSINESS_ID = Deno.env.get("KALI_BUSINESS_ID");
const CRON_SECRET = Deno.env.get("CONTENT_SCHEDULER_SECRET");

const supabase = SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
  : null;

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return new Response("Method Not Allowed", { status: 405 });
  if (!secretMatches(req.headers.get("X-Scheduler-Secret"), CRON_SECRET)) {
    return new Response("Forbidden", { status: 403 });
  }
  if (!supabase || !BOT_TOKEN || !BUSINESS_ID) {
    return new Response(JSON.stringify({ error: "not configured" }), { status: 503 });
  }
  const nowMs = Date.now();
  try {
    const rules = await loadPipelineRules(supabase, BUSINESS_ID);
    const result = await runContentScheduler({
      supabase, rules, businessId: BUSINESS_ID, nowMs,
      send: createTelegramSender(BOT_TOKEN, fetch),
      dailyUsage: await loadDailyUsage(supabase, BUSINESS_ID, nowMs),
    });
    return new Response(JSON.stringify(result), { status: 200, headers: { "Content-Type": "application/json" } });
  } catch (err) {
    console.error("content-scheduler:", err instanceof Error ? err.message : err);
    return new Response(JSON.stringify({ error: "scheduler failed" }), { status: 500 });
  }
});
