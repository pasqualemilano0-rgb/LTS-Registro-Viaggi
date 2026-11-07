-- Already applied on Supabase on 2026-11-07.
-- LTS private realtime only sends a minimal "changed" hint.
-- The authenticated endpoints remain the sole source of actual data.
create schema if not exists lts_internal;
revoke all on schema lts_internal from public, anon;
grant usage on schema lts_internal to authenticated;

create or replace function lts_internal.may_receive_realtime(p_topic text)
returns boolean language sql stable security definer
set search_path = ''
as $$
 select exists (
  select 1 from public.lts_account_access access
  where access.user_id = (select auth.uid())
    and access.enabled = true and access.removed_at is null
    and (
      p_topic = 'lts:v1:catalog'
      or (p_topic = 'lts:v1:admin' and access.role = 'admin')
      or (p_topic = 'lts:v1:driver:' || access.user_id::text and access.role = 'driver')
    )
 );
$$;
revoke all on function lts_internal.may_receive_realtime(text) from public,anon;
grant execute on function lts_internal.may_receive_realtime(text) to authenticated;

create policy lts_private_change_hints_receive
on realtime.messages for select to authenticated
using (
 private is true and extension = 'broadcast'
 and lts_internal.may_receive_realtime((select realtime.topic()))
);

create or replace function lts_internal.emit_change_hint()
returns trigger language plpgsql security definer
set search_path = ''
as $$
declare v_owner uuid;
begin
 if tg_table_name = 'lts_account_archives' then
  v_owner := case when tg_op = 'DELETE' then old.user_id else new.user_id end;
  perform realtime.send('{"kind":"archive"}'::jsonb,'changed','lts:v1:driver:' || v_owner::text,true);
  perform realtime.send('{"kind":"archive"}'::jsonb,'changed','lts:v1:admin',true);
 elsif tg_table_name in ('lts_company_tariffs','lts_company_extra_rates','lts_shared_maps_customers') then
  perform realtime.send('{"kind":"catalog"}'::jsonb,'changed','lts:v1:catalog',true);
  perform realtime.send('{"kind":"catalog"}'::jsonb,'changed','lts:v1:admin',true);
 end if;
 return null;
end;
$$;
revoke all on function lts_internal.emit_change_hint() from public,anon,authenticated;

create trigger lts_archive_realtime_notice
after insert or update or delete on public.lts_account_archives
for each row execute function lts_internal.emit_change_hint();
create trigger lts_tariffs_realtime_notice
after insert or update or delete on public.lts_company_tariffs
for each row execute function lts_internal.emit_change_hint();
create trigger lts_extras_realtime_notice
after insert or update or delete on public.lts_company_extra_rates
for each row execute function lts_internal.emit_change_hint();
create trigger lts_maps_realtime_notice
after insert or update or delete on public.lts_shared_maps_customers
for each row execute function lts_internal.emit_change_hint();
