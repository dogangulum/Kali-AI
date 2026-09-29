// Minimal Telegram Bot API helpers for the content approval flow. The bot
// token is passed in by the caller (from secrets); nothing is hardcoded.

export type TelegramSend = (method: string, body: Record<string, unknown>) => Promise<any>;

export function createTelegramSender(botToken: string, fetchImpl: typeof fetch): TelegramSend {
  return async (method, body) => {
    const res = await fetchImpl(`https://api.telegram.org/bot${botToken}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || json.ok === false) {
      throw new Error(`telegram ${method} failed: ${res.status} ${json.description || ''}`.trim());
    }
    return json.result;
  };
}

// callback_data is capped at 64 bytes: a UUID (36) plus a short prefix fits.
//   a:<planId>          -> Onayla
//   c:<planId>          -> Değiştir (show layer options)
//   l:<planId>:<layer>  -> change this layer
export function approvalKeyboard(planId: string) {
  return {
    inline_keyboard: [[
      { text: '✅ Onayla', callback_data: `a:${planId}` },
      { text: '✏️ Değiştir', callback_data: `c:${planId}` },
    ]],
  };
}

export function changeKeyboard(planId: string, layers: readonly { key: string; label: string }[]) {
  const rows: { text: string; callback_data: string }[][] = [];
  for (let i = 0; i < layers.length; i += 2) {
    rows.push(layers.slice(i, i + 2).map((l) => ({ text: l.label, callback_data: `l:${planId}:${l.key}` })));
  }
  return { inline_keyboard: rows };
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function parseCallbackData(data: unknown):
  | { kind: 'approve' | 'change'; planId: string }
  | { kind: 'layer'; planId: string; layer: string }
  | null {
  if (typeof data !== 'string') return null;
  const [kind, planId, layer] = data.split(':');
  if (!planId || !UUID_RE.test(planId)) return null;
  if (kind === 'a' && layer === undefined) return { kind: 'approve', planId };
  if (kind === 'c' && layer === undefined) return { kind: 'change', planId };
  if (kind === 'l' && layer && /^[a-z]+$/.test(layer)) return { kind: 'layer', planId, layer };
  return null;
}

// Constant-time comparison for the X-Telegram-Bot-Api-Secret-Token header.
export function secretMatches(given: string | null, expected: string | undefined): boolean {
  if (!given || !expected || given.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < given.length; i++) diff |= given.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}

export function formatLocalTime(iso: string, timezone: string): string {
  return new Intl.DateTimeFormat('tr-TR', {
    timeZone: timezone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).format(new Date(iso));
}
