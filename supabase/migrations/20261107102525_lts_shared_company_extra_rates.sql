-- Database migration deployed in Supabase 2026-11-07.
-- Global company prices: the same eight service types for every driver.
-- Legacy personal rates stay in old archives solely for historical recovery.
create table if not exists public.lts_company_extra_rates (
 service_key text primary key check (service_key in (
 'facchinaggioBilico','facchinaggioReefer','reefer','adr',
 'pernotto','sabatoPorto','sabatoTrasferta','preOrario'
 )),
 cents integer null check (cents between 0 and 99999999),
 revision bigint not null default 1 check (revision > 0),
 updated_at timestamptz not null default now(),
 updated_by uuid null references auth.users(id) on delete set null
);
alter table public.lts_company_extra_rates enable row level security;
revoke all on public.lts_company_extra_rates from public, anon, authenticated;
grant select,insert,update,delete on public.lts_company_extra_rates to service_role;
insert into public.lts_company_extra_rates(service_key,cents)
 values ('facchinaggioBilico',null),('facchinaggioReefer',null),
 ('reefer',null),('adr',null),('pernotto',null),
 ('sabatoPorto',null),('sabatoTrasferta',null),('preOrario',0)
on conflict (service_key) do nothing;
