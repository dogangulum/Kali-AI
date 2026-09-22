// Pure timing/state-machine logic for the Instagram auto-reply vs. human
// (Ayşe) handoff rules Doğan specified (2026-09-22):
//
//   - 1st customer message in a fresh conversation: wait 60s for the human
//     rep to answer first; if she doesn't, the AI-drafted reply is sent.
//   - Each subsequent customer message, while the human rep still hasn't
//     taken over: the wait decreases by 5s each time (60 -> 55 -> 50 -> ...),
//     floored at 15s.
//   - The instant the human rep sends her own message, the system stands
//     down completely for that conversation.
//   - While she's in control: if the customer messages again and she stays
//     silent for 3+ minutes, the system reclaims control.
//   - If the customer goes silent for 30+ minutes, the next message is
//     treated as a fresh conversation (wait resets to 60s).
//   - When the system reclaims control after her silence, the decay also
//     restarts at 60s.
//
// Deliberately Deno-free and side-effect-free (no DB/network calls, no
// `Date.now()` call inside -- callers pass `nowMs` explicitly), so this loads
// and unit-tests in a plain Node vm sandbox via tests/helpers/webhook-suite.cjs
// with zero mocking, same reasoning as reply-agent.ts/lead-agent.ts.

export const DEFAULT_WAIT_SECONDS = 60;
export const MIN_WAIT_SECONDS = 15;
export const WAIT_DECAY_SECONDS = 5;
export const IDLE_RESET_MS = 30 * 60 * 1000;
export const HUMAN_RECLAIM_MS = 3 * 60 * 1000;

export type ControlMode = "bot" | "human";

export interface ConversationHandoffState {
  controlMode: ControlMode;
  nextWaitSeconds: number;
  lastCustomerMessageAtMs: number | null;
  lastHumanMessageAtMs: number | null;
}

export interface InboundReplyPlan {
  waitSeconds: number;
  nextState: ConversationHandoffState;
}

// Called once per inbound customer message, before drafting/scheduling a
// reply. Decides how long to wait before the system may send its draft, and
// how the conversation's own state should be updated.
export function planInboundReply(
  state: ConversationHandoffState,
  nowMs: number,
): InboundReplyPlan {
  const isFreshConversation =
    state.lastCustomerMessageAtMs == null ||
    nowMs - state.lastCustomerMessageAtMs > IDLE_RESET_MS;

  const baseWaitSeconds = isFreshConversation ? DEFAULT_WAIT_SECONDS : state.nextWaitSeconds;

  if (state.controlMode === "human") {
    // The human rep is (or was) handling this conversation. Schedule a
    // reclaim-check reply 3 minutes out; the dispatcher re-verifies at send
    // time whether she has replied since, so an active rep simply lets this
    // get cancelled and never actually sent (see instagram-reply-dispatcher).
    return {
      waitSeconds: Math.round(HUMAN_RECLAIM_MS / 1000),
      nextState: {
        ...state,
        nextWaitSeconds: isFreshConversation ? DEFAULT_WAIT_SECONDS : state.nextWaitSeconds,
        lastCustomerMessageAtMs: nowMs,
      },
    };
  }

  return {
    waitSeconds: baseWaitSeconds,
    nextState: {
      ...state,
      controlMode: "bot",
      nextWaitSeconds: Math.max(MIN_WAIT_SECONDS, baseWaitSeconds - WAIT_DECAY_SECONDS),
      lastCustomerMessageAtMs: nowMs,
    },
  };
}

// Called when the webhook observes the human rep's own message (a Meta
// message-echo event that doesn't match a message this system itself sent).
// She always takes over immediately, regardless of what was happening before.
export function applyHumanMessage(
  state: ConversationHandoffState,
  nowMs: number,
): ConversationHandoffState {
  return {
    ...state,
    controlMode: "human",
    lastHumanMessageAtMs: nowMs,
  };
}

// Called by the dispatcher right before it would actually send a scheduled
// AI reply -- the "last-instant check" that prevents a double/conflicting
// reply if the human rep answered in the meantime.
export function isSafeToSendNow(
  state: ConversationHandoffState,
  nowMs: number,
  inboundAtMs: number | null = state.lastCustomerMessageAtMs,
): boolean {
  // An answer to this specific customer message permanently invalidates
  // its draft, even if the dispatcher is late by hours or control changed.
  if (inboundAtMs === null || !Number.isFinite(inboundAtMs)) return false;
  if (state.lastHumanMessageAtMs !== null && state.lastHumanMessageAtMs >= inboundAtMs) return false;
  if (state.controlMode !== "human") return true;
  // Reclaim only after a NEW customer message has waited a full 3 minutes.
  return nowMs - inboundAtMs >= HUMAN_RECLAIM_MS;
}

// Called by the dispatcher after a scheduled AI reply was actually sent.
// If this was a reclaim (the conversation was in human mode), control
// returns to the bot and the decay restarts at the default wait; otherwise
// the wait was already decremented at schedule time (planInboundReply), so
// nothing further changes here.
export function afterSuccessfulAiSend(state: ConversationHandoffState): ConversationHandoffState {
  if (state.controlMode !== "human") return state;
  return {
    ...state,
    controlMode: "bot",
    nextWaitSeconds: Math.max(MIN_WAIT_SECONDS, DEFAULT_WAIT_SECONDS - WAIT_DECAY_SECONDS),
  };
}
