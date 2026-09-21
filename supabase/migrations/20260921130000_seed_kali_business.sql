-- Seed the single tenant this deployment currently serves. Idempotent: safe
-- to run more than once (no-op if the row already exists). No business-
-- specific content (services, prices, hours, tone) lives here or anywhere in
-- code -- only the business's identity row, which the webhook Edge Functions
-- need in order to attribute inbound messages to a business_id.
--
-- After applying, read the generated id:
--   select id from businesses where name = 'Kali Beauty Center';
-- and set it as the KALI_BUSINESS_ID secret for the whatsapp-webhook and
-- instagram-webhook Edge Functions (see supabase/functions/*/index.ts for
-- why an env var is used instead of a name lookup on every request).
insert into businesses (name)
select 'Kali Beauty Center'
where not exists (
  select 1 from businesses where name = 'Kali Beauty Center'
);
