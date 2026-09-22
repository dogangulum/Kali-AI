-- Adds the state needed for the Instagram auto-reply / human-handoff timing
-- rules: which side currently "owns" a conversation (bot vs. the human rep),
-- the decaying wait used before the bot auto-replies, and a queue of
-- not-yet-sent AI replies (nothing can just sleep inside an Edge Function
-- request, so a delayed send is a row a periodic dispatcher polls instead).
-- See docs/PROJECT_HANDOFF.md and CLAUDE.md for the multi-tenant rule this
-- follows -- nothing business-specific lives here, only generic timing state.

alter table conversations
  add column control_mode text not null default 'bot'
    check (control_mode in ('bot', 'human')),
  add column next_wait_seconds int not null default 60,
  add column last_customer_message_at timestamptz,
  add column last_human_message_at timestamptz;

-- Distinguishes who authored an outbound row (the AI, or the human rep
-- replying from the native Instagram app) and records Meta's own message id
-- so an incoming "echo" webhook event can be matched back to a message this
-- system already knows about, instead of being mistaken for a new human
-- reply (see supabase/functions/instagram-webhook/index.ts). `status`
-- distinguishes a drafted-but-not-yet-sent AI reply from one actually
-- delivered or cancelled because the human rep took over first.
alter table messages
  add column author text check (author in ('ai', 'human')),
  add column status text not null default 'sent'
    check (status in ('draft', 'sent', 'cancelled')),
  add column platform_message_id text;

create unique index messages_platform_message_id_idx
  on messages(platform_message_id) where platform_message_id is not null;

create table pending_replies (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  conversation_id uuid not null references conversations(id) on delete cascade,
  message_id uuid not null references messages(id) on delete cascade,
  inbound_message_id uuid not null references messages(id) on delete cascade,
  send_after timestamptz not null,
  status text not null default 'scheduled'
    check (status in ('scheduled', 'processing', 'sent', 'cancelled', 'failed')),
  created_at timestamptz not null default now(),
  sent_at timestamptz
);

create index pending_replies_due_idx on pending_replies(status, send_after);
create index pending_replies_conversation_idx on pending_replies(conversation_id);

alter table pending_replies enable row level security;

create policy pending_replies_isolation on pending_replies
  using (business_id = (auth.jwt() ->> 'business_id')::uuid);
