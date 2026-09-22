// Periodically invoked (by pg_cron, roughly every 10-15s -- see
// supabase/functions/instagram-reply-dispatcher/index.ts) to find AI replies
// that instagram-webhook scheduled and are now due, re-verify each one is
// still safe to send (the human rep may have taken over since it was
// scheduled -- see handoff-agent.ts's isSafeToSendNow, the "last-instant
// check" Doğan asked for), and actually deliver the ones that are.
//
// Deliberately Deno-free, same reasoning as reply-agent.ts/lead-agent.ts: the
// Supabase client, the page access token and `fetch` are all passed in as
// plain arguments, so this loads and unit-tests in a plain Node vm sandbox
// via tests/helpers/webhook-suite.cjs without hitting the network.

import { sendInstagramMessage, type FetchLike } from "./meta-send.ts";
import { updateConversationSummaryAfterExchange } from "./reply-agent.ts";
import {
  afterSuccessfulAiSend,
  isSafeToSendNow,
  type ConversationHandoffState,
} from "./handoff-agent.ts";

export interface SupabaseLike {
  from(table: string): any;
}

export interface DispatchResult {
  sent: number;
  cancelled: number;
  failed: number;
}

function toStateFromConversationRow(row: {
  control_mode: string;
  next_wait_seconds: number;
  last_customer_message_at: string | null;
  last_human_message_at: string | null;
}): ConversationHandoffState {
  return {
    controlMode: row.control_mode === "human" ? "human" : "bot",
    nextWaitSeconds: row.next_wait_seconds,
    lastCustomerMessageAtMs: row.last_customer_message_at ? Date.parse(row.last_customer_message_at) : null,
    lastHumanMessageAtMs: row.last_human_message_at ? Date.parse(row.last_human_message_at) : null,
  };
}

export async function dispatchDueReplies(params: {
  supabase: SupabaseLike;
  pageAccessToken: string | null | undefined;
  anthropicApiKey: string | null | undefined;
  fetchImpl: FetchLike;
  nowMs: number;
}): Promise<DispatchResult> {
  const { supabase, pageAccessToken, anthropicApiKey, fetchImpl, nowMs } = params;
  const result: DispatchResult = { sent: 0, cancelled: 0, failed: 0 };

  const { data: pending, error: pendingError } = await supabase
    .from("pending_replies")
    .select("id, business_id, conversation_id, message_id, inbound_message_id, send_after, status")
    .eq("status", "scheduled");
  if (pendingError) {
    console.error("dispatch-agent: failed to load pending_replies", pendingError);
    return result;
  }

  const due = (pending ?? []).filter((row: { send_after: string }) => Date.parse(row.send_after) <= nowMs);

  for (const row of due) {
    let claimed = false;
    try {
      // One conditional UPDATE is the claim: PostgreSQL rechecks status
      // under the row lock, so only one dispatcher receives the row back.
      const { data: claim, error: claimError } = await supabase
        .from("pending_replies")
        .update({ status: "processing" })
        .eq("id", row.id)
        .eq("status", "scheduled")
        .select("id")
        .maybeSingle();
      if (claimError) throw claimError;
      if (!claim) continue;
      claimed = true;

      const { data: conversation, error: conversationError } = await supabase
        .from("conversations")
        .select("customer_identifier, control_mode, next_wait_seconds, last_customer_message_at, last_human_message_at")
        .eq("id", row.conversation_id)
        .maybeSingle();
      if (conversationError) throw conversationError;
      if (!conversation) {
        await supabase.from("pending_replies").update({ status: "cancelled" }).eq("id", row.id);
        result.cancelled++;
        continue;
      }

      let state = toStateFromConversationRow(conversation);

      const { data: inboundMessage, error: inboundError } = await supabase
        .from("messages").select("content, created_at")
        .eq("id", row.inbound_message_id).maybeSingle();
      if (inboundError) throw inboundError;
      if (!inboundMessage) throw new Error("dispatch-agent: inbound message missing");
      const inboundAtMs = Date.parse(inboundMessage.created_at);

      if (!isSafeToSendNow(state, nowMs, inboundAtMs)) {
        await supabase.from("pending_replies").update({ status: "cancelled" }).eq("id", row.id);
        await supabase.from("messages").update({ status: "cancelled" }).eq("id", row.message_id);
        result.cancelled++;
        continue;
      }

      if (!pageAccessToken) {
        console.error("dispatch-agent: page access token not configured, cannot send");
        await supabase.from("pending_replies").update({ status: "failed" }).eq("id", row.id);
        result.failed++;
        continue;
      }

      const { data: message, error: messageError } = await supabase
        .from("messages")
        .select("content")
        .eq("id", row.message_id)
        .maybeSingle();
      if (messageError) throw messageError;
      if (!message) throw new Error(`dispatch-agent: message ${row.message_id} not found`);

      // Re-read after all preparation. No other I/O may intervene between
      // this final handoff check and the Meta send request.
      const { data: latestConversation, error: latestConversationError } = await supabase
        .from("conversations")
        .select("customer_identifier, control_mode, next_wait_seconds, last_customer_message_at, last_human_message_at")
        .eq("id", row.conversation_id)
        .maybeSingle();
      if (latestConversationError) throw latestConversationError;
      if (!latestConversation || !isSafeToSendNow(toStateFromConversationRow(latestConversation), nowMs, inboundAtMs)) {
        await supabase.from("pending_replies").update({ status: "cancelled" }).eq("id", row.id);
        await supabase.from("messages").update({ status: "cancelled" }).eq("id", row.message_id);
        result.cancelled++;
        continue;
      }
      state = toStateFromConversationRow(latestConversation);

      const { platformMessageId } = await sendInstagramMessage({
        pageAccessToken,
        recipientId: latestConversation.customer_identifier,
        text: message.content,
        fetchImpl,
      });

      await supabase
        .from("messages")
        .update({ status: "sent", platform_message_id: platformMessageId })
        .eq("id", row.message_id);
      await supabase
        .from("pending_replies")
        .update({ status: "sent", sent_at: new Date(nowMs).toISOString() })
        .eq("id", row.id);

      // Never overwrite a handoff or a newer customer's wait decay that
      // occurred while the external send request was in flight.
      if (state.controlMode === "human") {
        const nextState = afterSuccessfulAiSend(state);
        let reclaim = supabase.from("conversations")
          .update({ control_mode: nextState.controlMode, next_wait_seconds: nextState.nextWaitSeconds })
          .eq("id", row.conversation_id).eq("control_mode", "human")
          .eq("last_customer_message_at", latestConversation.last_customer_message_at);
        reclaim = latestConversation.last_human_message_at === null
          ? reclaim.is("last_human_message_at", null)
          : reclaim.eq("last_human_message_at", latestConversation.last_human_message_at);
        const { error: reclaimError } = await reclaim;
        if (reclaimError) throw reclaimError;
      }
      if (inboundMessage) {
        await updateConversationSummaryAfterExchange({
          supabase,
          conversationId: row.conversation_id,
          inboundContent: inboundMessage.content,
          outboundContent: message.content,
          anthropicApiKey,
          fetchImpl,
        });
      }

      result.sent++;
    } catch (error) {
      console.error(`dispatch-agent: failed to dispatch pending reply ${row.id}`, error);
      try {
        // A failed/uncertain claim must never overwrite another worker's row.
        if (claimed) await supabase.from("pending_replies").update({ status: "failed" }).eq("id", row.id);
      } catch (updateError) {
        console.error(`dispatch-agent: failed to mark pending reply ${row.id} as failed`, updateError);
      }
      result.failed++;
    }
  }

  return result;
}
