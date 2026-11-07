-- LTS manually entered shared company customers.
-- Applied to Supabase 2026-11-07; shared customers do not require Maps.
-- No direct authenticated/anon Data API access; all reads/writes pass
-- the existing authorized lts-shared-maps Edge API.
create table if not exists public.lts_shared_customers_manual (
 id uuid primary key default gen_random_uuid(),
 name text not null,
 city text not null,
 address text not null default '',
 notes text not null default '',
 created_by uuid not null,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 constraint lts_manual_name_len check (char_length(name) between 2 and 500),
 constraint lts_manual_city_len check (char_length(city) between 2 and 500),
 constraint lts_manual_address_len check (char_length(address) <= 1000),
 constraint lts_manual_notes_len check (char_length(notes) <= 1500)
);
create unique index if not exists lts_shared_customers_manual_name_city_key
 on public.lts_shared_customers_manual (upper(btrim(name)),upper(btrim(city)));
alter table public.lts_shared_customers_manual enable row level security;
revoke all on table public.lts_shared_customers_manual from public,anon,authenticated;
grant select,insert,update on table public.lts_shared_customers_manual to service_role;
create or replace function lts_internal.emit_manual_customer_change_hint()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 perform realtime.send('{"kind":"catalog"}'::jsonb,'changed','lts:v1:catalog',true);
 perform realtime.send('{"kind":"catalog"}'::jsonb,'changed','lts:v1:admin',true);
 return null;
end;
$$;
revoke all on function lts_internal.emit_manual_customer_change_hint() from public,anon,authenticated;
create trigger lts_manual_customer_realtime_notice
 after insert or update or delete on public.lts_shared_customers_manual
 for each row execute function lts_internal.emit_manual_customer_change_hint();
