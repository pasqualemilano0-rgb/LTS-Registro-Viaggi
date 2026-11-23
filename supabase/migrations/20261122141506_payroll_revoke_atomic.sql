-- Candidate production migration: NOT applied to production.
-- Receipt and document bytes remain immutable; revoke preserves all history.
create or replace function public.lts_payroll_revoke(p_document_id uuid,p_actor_id uuid)
returns timestamptz language plpgsql security invoker set search_path=''
as $$
declare v_at timestamptz;
begin
 if not exists(select 1 from public.lts_account_access where user_id=p_actor_id
  and role='admin' and enabled=true and removed_at is null) then
  return null;
 end if;
 update public.lts_payroll_documents set state='archived',archived_at=now()
 where id=p_document_id and state='published'
 returning archived_at into v_at;
 if v_at is not null then
  insert into public.lts_payroll_audit(document_id,actor_id,event)
   values(p_document_id,p_actor_id,'archive');
 end if;
 return v_at;
end;
$$;
revoke all on function public.lts_payroll_revoke(uuid,uuid) from public,anon,authenticated;
grant execute on function public.lts_payroll_revoke(uuid,uuid) to service_role;
