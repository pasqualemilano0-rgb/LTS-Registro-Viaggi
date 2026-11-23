-- Production Phase 2 follow-up: the Edge service_role may only READ test seats.
-- Privileged SQL owner assigns test users after separate authorization.
-- No user rows are inserted, edited, enabled or removed by this migration.
revoke all on public.lts_payroll_test_allowlist from public, anon, authenticated, service_role;
grant select on public.lts_payroll_test_allowlist to service_role;
