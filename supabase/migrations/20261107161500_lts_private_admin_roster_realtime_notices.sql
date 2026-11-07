-- Private, content-free roster hints. Only already authorized admins listen
-- to lts:v1:admin (existing realtime.messages SELECT policy).
create or replace function lts_internal.emit_roster_change_hint()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
 perform realtime.send('{"kind":"roster"}'::jsonb,'changed','lts:v1:admin',true);
 return null;
end;
$$;
revoke all on function lts_internal.emit_roster_change_hint() from public,anon,authenticated;
create trigger lts_access_roster_realtime_notice
 after insert or update or delete on public.lts_account_access
 for each row execute function lts_internal.emit_roster_change_hint();
create trigger lts_pending_roster_realtime_notice
 after insert or update or delete on public.lts_pending_drivers
 for each row execute function lts_internal.emit_roster_change_hint();
create trigger lts_invites_roster_realtime_notice
 after insert or update or delete on public.lts_driver_invites
 for each row execute function lts_internal.emit_roster_change_hint();
create trigger lts_resets_roster_realtime_notice
 after insert or update or delete on public.lts_driver_credential_resets
 for each row execute function lts_internal.emit_roster_change_hint();