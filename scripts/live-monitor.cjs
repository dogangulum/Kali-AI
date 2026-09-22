#!/usr/bin/env node
// Live message monitor for manual test sessions: polls Supabase for the most
// recent inbound/outbound messages and model routing decisions, prints them
// in a readable timeline. Handles real customer identifiers and message
// content (PII), so this stays Claude's own tool per AGENTS.md -- not
// delegated. Read-only: never writes, never sends anything.
//
// Requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the environment
// (same names used by the webhooks). Reads only from .env.local if present;
// values are never printed except as part of the message rows themselves,
// which the person running this tool already owns and is choosing to view.

const fs = require('fs');
const path = require('path');

function loadEnvLocal() {
  const envPath = path.join(__dirname, '..', '.env.local');
  const env = {};
  if (!fs.existsSync(envPath)) return env;
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq > 0) env[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim();
  }
  return env;
}

async function fetchRecent(baseUrl, serviceKey, table, params) {
  const url = `${baseUrl.replace(/\/$/, '')}/rest/v1/${table}?${params}`;
  const res = await fetch(url, {
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
    },
  });
  if (!res.ok) throw new Error(`${table}: HTTP ${res.status} - ${await res.text()}`);
  return res.json();
}

function fmtTime(iso) {
  return new Date(iso).toLocaleString('tr-TR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

async function main() {
  const fileEnv = loadEnvLocal();
  const SUPABASE_URL = process.env.SUPABASE_URL || fileEnv.SUPABASE_URL;
  const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || fileEnv.SUPABASE_SERVICE_ROLE_KEY;

  if (!SUPABASE_URL || !SERVICE_KEY) {
    console.error('HATA: SUPABASE_URL ve SUPABASE_SERVICE_ROLE_KEY gerekli (.env.local veya ortam değişkeni olarak).');
    process.exitCode = 1;
    return;
  }

  const limit = Number(process.argv[2]) || 15;

  const [messages, routing] = await Promise.all([
    fetchRecent(SUPABASE_URL, SERVICE_KEY, 'messages',
      `select=id,direction,content,created_at,conversation_id&order=created_at.desc&limit=${limit}`),
    fetchRecent(SUPABASE_URL, SERVICE_KEY, 'model_routing_log',
      `select=message_id,model,cost_usd,latency_ms,created_at&order=created_at.desc&limit=${limit}`),
  ]);

  const conversationIds = [...new Set(messages.map((m) => m.conversation_id))];
  let conversations = [];
  if (conversationIds.length > 0) {
    conversations = await fetchRecent(SUPABASE_URL, SERVICE_KEY, 'conversations',
      `select=id,platform,customer_identifier&id=in.(${conversationIds.join(',')})`);
  }
  const convById = new Map(conversations.map((c) => [c.id, c]));
  const routingByMessageId = new Map(routing.map((r) => [r.message_id, r]));

  console.log(`CANLI MESAJ İZLEME — son ${limit} mesaj\n`);

  if (messages.length === 0) {
    console.log('Henüz kayıtlı mesaj yok. Bir test mesajı gönderip tekrar çalıştırın.');
    return;
  }

  for (const msg of messages.slice().reverse()) {
    const conv = convById.get(msg.conversation_id) || {};
    const dirLabel = msg.direction === 'inbound' ? 'GELEN' : 'GİDEN (taslak)';
    console.log(`[${fmtTime(msg.created_at)}] ${dirLabel} — ${conv.platform || '?'} / ${conv.customer_identifier || '?'}`);
    console.log(`  "${msg.content}"`);
    const route = routingByMessageId.get(msg.id);
    if (route) {
      console.log(`  Model: ${route.model} — Maliyet: $${Number(route.cost_usd || 0).toFixed(5)} — Süre: ${route.latency_ms}ms`);
    }
    console.log('');
  }

  console.log('Not: "GİDEN (taslak)" satırları müşteriye gönderilmiş anlamına gelmez — sistem henüz gerçek gönderim yapmıyor, sadece kaydediyor.');
}

main().catch((error) => {
  console.error('HATA:', error.message);
  process.exitCode = 1;
});
