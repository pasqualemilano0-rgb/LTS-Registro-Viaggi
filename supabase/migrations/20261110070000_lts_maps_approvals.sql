-- Proposte Maps: i nuovi clienti degli autisti restano privati fino al consenso MFA.
create table if not exists public.lts_maps_approval_requests (
  id uuid primary key default gen_random_uuid(),
  submitted_by uuid not null references auth.users(id),
  name text not null check (char_length(name) between 2 and 500),
  city text not null check (char_length(city) between 2 and 500),
  address text not null check (char_length(address) between 4 and 1000),
  maps_url text not null check (char_length(maps_url) between 20 and 4096),
  site_key text not null check (site_key ~ '^[0-9a-f]{64}$'),
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  submitted_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users(id),
  fare_cents integer check (fare_cents between 0 and 99999999)
);
create unique index if not exists lts_maps_approvals_pending_url
 on public.lts_maps_approval_requests (maps_url) where status='pending';
create unique index if not exists lts_maps_approvals_pending_site
 on public.lts_maps_approval_requests (site_key) where status='pending';
create index if not exists lts_maps_approvals_status_date
 on public.lts_maps_approval_requests (status,submitted_at desc);
alter table public.lts_maps_approval_requests enable row level security;
revoke all on public.lts_maps_approval_requests from public,anon,authenticated;
grant select,insert,update on public.lts_maps_approval_requests to service_role;

-- Una singola transazione approva sede e tariffa, oppure annulla entrambe.
-- Chiamabile soltanto dal backend con service_role, dopo controllo admin e MFA.
create or replace function public.lts_maps_approve_request(
 p_request_id uuid,p_admin_id uuid,p_cents integer
) returns jsonb
language plpgsql security definer set search_path=''
as $$
declare
 v public.lts_maps_approval_requests%rowtype;
 v_customer_id uuid;
 v_existing_cents integer;
 v_identity text;
begin
 if p_cents is null or p_cents<0 or p_cents>99999999 then
  raise exception 'Tariffa non valida';
 end if;
 select * into v from public.lts_maps_approval_requests
  where id=p_request_id for update;
 if not found or v.status<>'pending' then
  raise exception 'Richiesta già elaborata o inesistente';
 end if;
 if not exists(select 1 from public.lts_account_access
   where user_id=p_admin_id and role='admin' and enabled=true and removed_at is null) then
  raise exception 'Amministratore non valido';
 end if;
 select id into v_customer_id from public.lts_shared_maps_customers
  where site_key=v.site_key or maps_url=v.maps_url limit 1;
 if v_customer_id is null then
  v_identity:=encode(sha256(convert_to(v.name||chr(31)||v.city||chr(31)||v.address,'UTF8')),'hex');
  insert into public.lts_shared_maps_customers
    (identity_key,name,city,address,maps_url,created_by)
   values (v_identity,v.name,v.city,v.address,v.maps_url,v.submitted_by)
   on conflict do nothing returning id into v_customer_id;
  if v_customer_id is null then
   select id into v_customer_id from public.lts_shared_maps_customers
    where site_key=v.site_key or maps_url=v.maps_url or identity_key=v_identity limit 1;
  end if;
  if v_customer_id is null then raise exception 'Conflitto nella sede aziendale'; end if;
 end if;
 select cents into v_existing_cents from public.lts_company_tariffs
  where client=v.name and city=v.city for update;
 if found then
  if v_existing_cents<>p_cents then
   raise exception 'Tariffa aziendale già esistente con importo differente: controllare il tariffario';
  end if;
 else
  insert into public.lts_company_tariffs (client,city,cents,updated_by)
   values (v.name,v.city,p_cents,p_admin_id)
   on conflict do nothing;
  select cents into v_existing_cents from public.lts_company_tariffs
   where client=v.name and city=v.city;
  if v_existing_cents is distinct from p_cents then
   raise exception 'Tariffa modificata contemporaneamente: aggiornare la richiesta';
  end if;
 end if;
 update public.lts_maps_approval_requests
  set status='approved',reviewed_by=p_admin_id,reviewed_at=now(),fare_cents=p_cents
  where id=p_request_id;
 return jsonb_build_object('approved',true,'requestId',p_request_id,'customerId',v_customer_id);
end;
$$;
revoke all on function public.lts_maps_approve_request(uuid,uuid,integer) from public,anon,authenticated;
grant execute on function public.lts_maps_approve_request(uuid,uuid,integer) to service_role;
