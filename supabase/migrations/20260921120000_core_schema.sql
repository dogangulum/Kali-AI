-- Core multi-tenant schema: businesses, their config, conversations/messages,
-- leads, appointments, and an audit trail. No business-specific data lives in
-- code; per-business behavior is driven entirely by business_config rows.

create extension if not exists pgcrypto;

create table businesses (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  timezone text not null default 'Europe/Istanbul',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- One JSON blob per business: services, prices, hours, tone/persona, etc.
-- Nothing business-specific is ever hardcoded elsewhere.
create table business_config (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade unique,
  config jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table conversations (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  platform text not null check (platform in ('instagram', 'whatsapp')),
  customer_identifier text not null,
  summary text,
  status text not null default 'open' check (status in ('open', 'closed', 'escalated')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index conversations_business_id_idx on conversations(business_id);
create index conversations_customer_identifier_idx on conversations(customer_identifier);

create table messages (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  conversation_id uuid not null references conversations(id) on delete cascade,
  direction text not null check (direction in ('inbound', 'outbound')),
  content text not null,
  created_at timestamptz not null default now()
);

create index messages_business_id_idx on messages(business_id);
create index messages_conversation_id_idx on messages(conversation_id);

create table leads (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  conversation_id uuid not null references conversations(id) on delete cascade,
  qualification_score int,
  status text not null default 'new' check (status in ('new', 'qualified', 'disqualified', 'converted')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index leads_business_id_idx on leads(business_id);
create index leads_conversation_id_idx on leads(conversation_id);

create table appointments (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  lead_id uuid not null references leads(id) on delete cascade,
  scheduled_at timestamptz not null,
  status text not null default 'pending' check (status in ('pending', 'confirmed', 'cancelled', 'completed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index appointments_business_id_idx on appointments(business_id);
create index appointments_scheduled_at_idx on appointments(scheduled_at);

-- Records approvals/rejections and other sensitive events for traceability.
-- business_id is nullable to allow system-level (non-business-scoped) events.
create table audit_log (
  id uuid primary key default gen_random_uuid(),
  business_id uuid references businesses(id) on delete set null,
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index audit_log_business_id_idx on audit_log(business_id);

-- Ad campaigns run through Meta. No campaign-specific numbers/budgets live in
-- code; they're rows here, scoped per business.
create table ad_campaigns (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  meta_campaign_id text,
  name text not null,
  objective text,
  budget numeric(12, 2),
  status text not null default 'draft' check (status in ('draft', 'active', 'paused', 'completed')),
  started_at timestamptz,
  ended_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index ad_campaigns_business_id_idx on ad_campaigns(business_id);

-- A piece of content going through the production pipeline (a reel, an ad,
-- a post). Each content_item has one or more layers below.
create table content_items (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  ad_campaign_id uuid references ad_campaigns(id) on delete set null,
  topic text,
  content_type text not null check (content_type in ('reel', 'image', 'text')),
  status text not null default 'draft' check (status in ('draft', 'researching', 'generating', 'ready_for_review', 'approved', 'published')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index content_items_business_id_idx on content_items(business_id);
create index content_items_ad_campaign_id_idx on content_items(ad_campaign_id);

-- Modular production layers (visual/video, voiceover, subtitle). Choosing
-- "Değiştir" on one layer only regenerates that layer's row, not the whole
-- content_item.
create table content_layers (
  id uuid primary key default gen_random_uuid(),
  content_item_id uuid not null references content_items(id) on delete cascade,
  layer_type text not null check (layer_type in ('visual', 'voiceover', 'subtitle')),
  version int not null default 1,
  asset_url text,
  status text not null default 'pending' check (status in ('pending', 'generating', 'ready', 'approved', 'rejected')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index content_layers_content_item_id_idx on content_layers(content_item_id);

-- Generic approval log for the human approval workflow (Onayla / Değiştir /
-- Reddet), usable against a content_layer, a content_item, or a campaign.
create table approvals (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  target_type text not null check (target_type in ('content_item', 'content_layer', 'ad_campaign')),
  target_id uuid not null,
  action text not null check (action in ('approve', 'change', 'reject')),
  notes text,
  actor text,
  created_at timestamptz not null default now()
);

create index approvals_business_id_idx on approvals(business_id);
create index approvals_target_idx on approvals(target_type, target_id);

-- A conversation handed off from the AI to a human rep.
create table escalations (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  conversation_id uuid not null references conversations(id) on delete cascade,
  reason text,
  status text not null default 'open' check (status in ('open', 'in_progress', 'resolved')),
  assigned_to text,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create index escalations_business_id_idx on escalations(business_id);
create index escalations_conversation_id_idx on escalations(conversation_id);

-- Which provider/model handled a given message, and at what cost — powers
-- model routing decisions and cost optimization reporting.
create table model_routing_log (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  message_id uuid references messages(id) on delete set null,
  provider text not null,
  model text not null,
  cost_usd numeric(10, 6),
  latency_ms int,
  created_at timestamptz not null default now()
);

create index model_routing_log_business_id_idx on model_routing_log(business_id);
create index model_routing_log_message_id_idx on model_routing_log(message_id);

-- KPI funnel tracking: Reel/reklam -> DM -> nitelikli lead -> randevu -> müşteri.
create table funnel_events (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  conversation_id uuid references conversations(id) on delete set null,
  lead_id uuid references leads(id) on delete set null,
  event_type text not null check (event_type in ('reel_view', 'dm_started', 'lead_qualified', 'appointment_booked', 'customer_converted')),
  created_at timestamptz not null default now()
);

create index funnel_events_business_id_idx on funnel_events(business_id);
create index funnel_events_event_type_idx on funnel_events(event_type);

-- Row Level Security: backend services use the Supabase service role key,
-- which bypasses RLS, so these policies are a defense-in-depth boundary for
-- any future direct/client-side access. They isolate rows by business_id
-- using a custom JWT claim ("business_id") that a future auth setup would
-- issue per business user. Until that auth model exists, only the service
-- role can read/write these tables.

alter table businesses enable row level security;
alter table business_config enable row level security;
alter table conversations enable row level security;
alter table messages enable row level security;
alter table leads enable row level security;
alter table appointments enable row level security;
alter table audit_log enable row level security;
alter table ad_campaigns enable row level security;
alter table content_items enable row level security;
alter table content_layers enable row level security;
alter table approvals enable row level security;
alter table escalations enable row level security;
alter table model_routing_log enable row level security;
alter table funnel_events enable row level security;

create policy business_config_isolation on business_config
  using (business_id = (auth.jwt() ->> 'business_id')::uuid);

create policy conversations_isolation on conversations
  using (business_id = (auth.jwt() ->> 'business_id')::uuid);

create policy messages_isolation on messages
  using (business_id = (auth.jwt() ->> 'business_id')::uuid);

create policy leads_isolation on leads
  using (business_id = (auth.jwt() ->> 'business_id')::uuid);

create policy appointments_isolation on appointments
  using (business_id = (auth.jwt() ->> 'business_id')::uuid);

create policy audit_log_isolation on audit_log
  using (business_id = (auth.jwt() ->> 'business_id')::uuid);

create policy ad_campaigns_isolation on ad_campaigns
  using (business_id = (auth.jwt() ->> 'business_id')::uuid);

create policy content_items_isolation on content_items
  using (business_id = (auth.jwt() ->> 'business_id')::uuid);

-- content_layers has no business_id of its own; isolate via its parent content_item.
create policy content_layers_isolation on content_layers
  using (exists (
    select 1 from content_items
    where content_items.id = content_layers.content_item_id
    and content_items.business_id = (auth.jwt() ->> 'business_id')::uuid
  ));

create policy approvals_isolation on approvals
  using (business_id = (auth.jwt() ->> 'business_id')::uuid);

create policy escalations_isolation on escalations
  using (business_id = (auth.jwt() ->> 'business_id')::uuid);

create policy model_routing_log_isolation on model_routing_log
  using (business_id = (auth.jwt() ->> 'business_id')::uuid);

create policy funnel_events_isolation on funnel_events
  using (business_id = (auth.jwt() ->> 'business_id')::uuid);
