// Actually delivers a message to a customer via Meta's Instagram Send API --
// the piece that was missing entirely before this file existed (see
// reply-agent.ts's own header comment: it only ever drafted/stored a reply).
//
// Deliberately Deno-free, same reasoning as reply-agent.ts and lead-agent.ts:
// no `Deno.*` reference anywhere, the page access token and `fetch` are
// passed in as plain arguments, so this loads and unit-tests in a plain Node
// vm sandbox via tests/helpers/webhook-suite.cjs without hitting the network.

export type FetchLike = (input: string, init: unknown) => Promise<{
  ok: boolean;
  status: number;
  json: () => Promise<any>;
  text: () => Promise<string>;
}>;

const GRAPH_API_VERSION = "v20.0";

export interface SendInstagramMessageParams {
  pageAccessToken: string;
  recipientId: string;
  text: string;
  fetchImpl: FetchLike;
}

export interface SendInstagramMessageResult {
  platformMessageId: string;
}

export async function sendInstagramMessage(
  params: SendInstagramMessageParams,
): Promise<SendInstagramMessageResult> {
  const { pageAccessToken, recipientId, text, fetchImpl } = params;

  const url = `https://graph.facebook.com/${GRAPH_API_VERSION}/me/messages?access_token=${encodeURIComponent(pageAccessToken)}`;
  const response = await fetchImpl(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      recipient: { id: recipientId },
      message: { text },
    }),
  });

  if (!response.ok) {
    let detail = "";
    try {
      detail = await response.text();
    } catch {
      // ignore -- best-effort error detail only
    }
    throw new Error(`Meta Send API error ${response.status}: ${detail}`);
  }

  const data = await response.json();
  const platformMessageId = typeof data?.message_id === "string" ? data.message_id : null;
  if (!platformMessageId) {
    throw new Error("Meta Send API response missing message_id");
  }

  return { platformMessageId };
}
