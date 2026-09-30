-- Tables created by 20260929120000_daily_content_pipeline.sql are not
-- auto-granted in this project; the worker and edge functions use service_role.
grant select, insert, update, delete on
  content_plans, competitor_analyses, content_candidates, content_change_requests,
  content_performance, generation_accounts, generation_credit_events, automation_attempts
to service_role;
grant usage, select on all sequences in schema public to service_role;
