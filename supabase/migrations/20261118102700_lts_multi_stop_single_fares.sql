-- One container, two ordered customer delivery stops, one corporate fare.
-- Deployment order: this migration, then lts-company-tariffs Edge Function,
-- then driver/admin webapp. This migration does not modify existing trips.
create table if not exists public.lts_company_multi_stop_fares (
 id uuid primary key default gen_random_uuid(),
 client text not null check (char_length(client) between 2 and 500),
 city text not null check (char_length(city) between 1 and 500),
 second_client text not null check (char_length(second_client) between 2 and 500),
 second_city text not null check (char_length(second_city) between 1 and 500),
 cents integer not null check (cents between 0 and 99999999),
 enabled boolean not null default true,
 revision bigint not null default 1 check (revision > 0),
 updated_at timestamptz not null default now(),
 updated_by uuid null references auth.users(id) on delete set null,
 constraint lts_multi_stop_distinct_sites check (client <> second_client or city <> second_city),
 constraint lts_multi_stop_unique_ordered_pair unique (client,city,second_client,second_city)
);
alter table public.lts_company_multi_stop_fares enable row level security;
revoke all on public.lts_company_multi_stop_fares from public, anon, authenticated;
grant select,insert,update,delete on public.lts_company_multi_stop_fares to service_role;
comment on table public.lts_company_multi_stop_fares is
 'Admin MFA protected ordered pair fare catalog. Historical trip amounts stay snapshots.';
