-- LTS documenti fase 2: production test audience, initially EMPTY.
-- Never add real drivers without authorization. Keep LTS_PAYROLL_ENABLED OFF.
-- At most two testers with driver role and one enrolled admin MFA tester.
-- No public Data API access: service-role Edge can only SELECT.
create table if not exists public.lts_payroll_test_allowlist (
 slot text primary key check (slot in ('driver_a','driver_b','admin')),
 user_id uuid not null unique references auth.users(id) on delete cascade,
 role text not null check (role in ('driver','admin')),
 enabled boolean not null default false,
 created_at timestamptz not null default now(),
 expires_at timestamptz not null,
 constraint payroll_test_slot_role check (
  (slot in ('driver_a','driver_b') and role='driver')
  or (slot='admin' and role='admin')
 ),
 constraint payroll_test_max_duration check (
  expires_at > created_at and expires_at <= created_at + interval '7 days'
 )
);
comment on table public.lts_payroll_test_allowlist is
 'Manual, temporary LTS payroll test audience. Zero rows = zero API access even if the feature flag is accidentally enabled. Never store passwords, tokens or PDF data.';
alter table public.lts_payroll_test_allowlist enable row level security;
revoke all on public.lts_payroll_test_allowlist from public,anon,authenticated,service_role;
grant select on public.lts_payroll_test_allowlist to service_role;
-- No policies; no application INSERT/UPDATE/DELETE, no automatic testers.
