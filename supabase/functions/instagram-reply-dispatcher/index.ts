import { createClient } from "npm:@supabase/supabase-js@2";
import { dispatchDueReplies } from "../_shared/dispatch-agent.ts";

// Invoked on a schedule (pg_cron + pg_net, roughly every 10-15s), never by a
// Meta webhook -- see supabase/functions/_shared/dispatch-agent.ts for the
// actual logic. This file only wires up secrets/the Supabase client and
// exposes them as a plain HTTP endpoint pg_cron can call.

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const supabase = SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
  : null;

const IG_PAGE_ACCESS_TOKEN = Deno.env.get("IG_PAGE_ACCESS_TOKEN");
const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
// Set only after native-app outbound events have been verified end to end.
// No echo arriving is not evidence that the human stayed silent.
const HUMAN_ECHOES_CONFIRMED = Deno.env.get("IG_HUMAN_ECHOES_CONFIRMED") === "true";

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  if (!HUMAN_ECHOES_CONFIRMED) {
    return new Response(JSON.stringify({ error: "native Instagram message echoes not confirmed" }), {
      status: 503,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (!supabase) {
    console.error("instagram-reply-dispatcher: SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY not configured");
    return new Response(JSON.stringify({ sent: 0, cancelled: 0, failed: 0 }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  const result = await dispatchDueReplies({
    supabase,
    pageAccessToken: IG_PAGE_ACCESS_TOKEN,
    anthropicApiKey: ANTHROPIC_API_KEY,
    fetchImpl: fetch,
    nowMs: Date.now(),
  });

  return new Response(JSON.stringify(result), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});
