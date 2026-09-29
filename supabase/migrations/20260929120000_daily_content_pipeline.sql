-- Daily content pipeline: one planned piece of content per business per day
-- (story + post + reel from the same selected video), generated as several
-- candidates, approved by a human over Telegram, then published.
--
-- Additive only: new tables, plus widening one CHECK constraint on
-- approvals.target_type. No existing row is modified or deleted.
--
-- Nothing business-specific lives here. Which services to rotate through,
-- how many candidates to produce, reminder lead time, retry count, credit
-- warning threshold, approver Telegram chat ids -- all of it is read from
-- business_config.config -> 'content_pipeline' (see
-- config/business-config.example.md).

-- 1) One row per business per content day.
create table content_plans (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  plan_date date not null,
  service_key text not null,
  sub_topic text not null,
  competitor_analysis_id uuid,
  status text not null default 'planned' check (status in (
    'planned',            -- topic chosen, nothing generated yet
    'generating',         -- candidates being produced
    'awaiting_approval',  -- draft sent to Telegram
    'regenerating',       -- approver asked for a change
    'approved',           -- approved, waiting for publish slot
    'queued',             -- approved after its day ended; publish before next new content
    'publishing',
    'published',
    'expired',            -- no answer by its day's deadline; kept, never deleted
    'failed'
  )),
  scheduled_publish_at timestamptz,
  approval_requested_at timestamptz,
  reminder_sent_at timestamptz,
  decided_at timestamptz,
  published_at timestamptz,
  selected_candidate_id uuid,
  telegram_chat_id text,
  telegram_message_id text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, plan_date)
);

create index content_plans_status_idx on content_plans(business_id, status);

-- 2) Competitor videos analysed for scenario/edit structure only (never
--    their footage). Unique per business so the same video is never reused
--    or re-analysed, whether it was accepted or rejected.
create table competitor_analyses (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  source_url text not null,
  source_account text,
  service_key text,
  scenario jsonb not null default '{}'::jsonb,   -- beats, camera moves, pacing, hook
  fit_decision text not null check (fit_decision in ('accepted', 'rejected')),
  reject_reason text,
  analyzed_at timestamptz not null default now(),
  unique (business_id, source_url)
);

create index competitor_analyses_business_idx on competitor_analyses(business_id, analyzed_at desc);

alter table content_plans
  add constraint content_plans_competitor_fk
  foreign key (competitor_analysis_id) references competitor_analyses(id) on delete set null;

-- 3) The N candidate videos produced for a plan; one gets selected.
--    `features` carries the attributes the learner scores on (hook style,
--    voice, music mood, length bucket, scenario id...).
create table content_candidates (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  plan_id uuid not null references content_plans(id) on delete cascade,
  variant int not null,
  revision int not null default 1,
  image_url text,
  video_url text,
  voiceover_url text,
  caption text,
  hashtags text[] not null default '{}',
  music text,
  features jsonb not null default '{}'::jsonb,
  score numeric,
  score_breakdown jsonb,
  selected boolean not null default false,
  created_at timestamptz not null default now(),
  unique (plan_id, variant, revision)
);

create index content_candidates_plan_idx on content_candidates(plan_id);

alter table content_plans
  add constraint content_plans_selected_candidate_fk
  foreign key (selected_candidate_id) references content_candidates(id) on delete set null;

-- 4) "Değiştir" requests: which layer the approver wants changed.
create table content_change_requests (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  plan_id uuid not null references content_plans(id) on delete cascade,
  layer text not null check (layer in ('voiceover', 'video', 'text', 'tags', 'music', 'all')),
  note text,
  status text not null default 'open' check (status in ('open', 'done', 'cancelled')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create index content_change_requests_plan_idx on content_change_requests(plan_id);

-- 5) Post-publish performance per format; feeds candidate scoring and the
--    best-time-to-post estimate.
create table content_performance (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  plan_id uuid not null references content_plans(id) on delete cascade,
  format text not null check (format in ('story', 'post', 'reel')),
  platform_media_id text,
  published_at timestamptz,
  reach int, views int, likes int, comments int, saves int, shares int, dms int,
  measured_at timestamptz not null default now(),
  unique (plan_id, format)
);

create index content_performance_business_idx on content_performance(business_id, published_at desc);

-- 6) Shared credit pool for generation providers (CapCut, ElevenLabs, ...).
--    credential_ref is the NAME of a secret on the worker, never the secret.
create table generation_accounts (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  provider text not null,
  label text not null,
  credential_ref text not null,
  reset_period text not null default 'daily' check (reset_period in ('daily', 'monthly', 'none')),
  quota numeric not null default 0,
  credits_remaining numeric not null default 0,
  resets_at timestamptz,
  priority int not null default 100,
  active boolean not null default true,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, provider, label)
);

create table generation_credit_events (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  account_id uuid not null references generation_accounts(id) on delete cascade,
  plan_id uuid references content_plans(id) on delete set null,
  delta numeric not null,           -- negative = spent, positive = reset/top-up
  reason text,
  created_at timestamptz not null default now()
);

create index generation_credit_events_account_idx on generation_credit_events(account_id, created_at desc);

-- 7) Every automated step attempt (CapCut run, voiceover, merge, publish),
--    with the screenshot taken on failure.
create table automation_attempts (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  plan_id uuid references content_plans(id) on delete set null,
  step text not null,
  attempt int not null,
  status text not null check (status in ('running', 'succeeded', 'failed')),
  error text,
  screenshot_url text,
  account_id uuid references generation_accounts(id) on delete set null,
  started_at timestamptz not null default now(),
  finished_at timestamptz
);

create index automation_attempts_plan_idx on automation_attempts(plan_id, step);

-- 8) Approvals can now target a content plan.
alter table approvals drop constraint if exists approvals_target_type_check;
alter table approvals add constraint approvals_target_type_check
  check (target_type in ('content_item', 'content_layer', 'ad_campaign', 'content_plan'));

-- RLS: same defense-in-depth pattern as the core schema.
alter table content_plans enable row level security;
alter table competitor_analyses enable row level security;
alter table content_candidates enable row level security;
alter table content_change_requests enable row level security;
alter table content_performance enable row level security;
alter table generation_accounts enable row level security;
alter table generation_credit_events enable row level security;
alter table automation_attempts enable row level security;

create policy content_plans_isolation on content_plans
  using (business_id = (auth.jwt() ->> 'business_id')::uuid);
create policy competitor_analyses_isolation on competitor_analyses
  using (business_id = (auth.jwt() ->> 'business_id')::uuid);
create policy content_candidates_isolation on content_candidates
  using (business_id = (auth.jwt() ->> 'business_id')::uuid);
create policy content_change_requests_isolation on content_change_requests
  using (business_id = (auth.jwt() ->> 'business_id')::uuid);
create policy content_performance_isolation on content_performance
  using (business_id = (auth.jwt() ->> 'business_id')::uuid);
create policy generation_accounts_isolation on generation_accounts
  using (business_id = (auth.jwt() ->> 'business_id')::uuid);
create policy generation_credit_events_isolation on generation_credit_events
  using (business_id = (auth.jwt() ->> 'business_id')::uuid);
create policy automation_attempts_isolation on automation_attempts
  using (business_id = (auth.jwt() ->> 'business_id')::uuid);
