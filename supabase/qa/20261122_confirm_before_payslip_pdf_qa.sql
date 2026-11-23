-- LTS PAYROLL QA ONLY — confirm availability BEFORE serving a cedolino PDF.
-- Apply only to isolated project sywxretbfgwxwhvdcknq, never production.
-- Requires no legacy unconfirmed first-access data; deliberately fails closed.
do $$
begin
 if exists(
   select 1 from public.lts_payroll_documents_secure_qa
   where category='cedolino'
     and first_accessed_at is not null and acknowledged_at is null
 ) then
  raise exception 'Existing cedolino access without confirmation: manual migration required.';
 end if;
end;
$$;

alter table public.lts_payroll_documents_secure_qa
 drop constraint payroll_receipt_consistent;
alter table public.lts_payroll_documents_secure_qa
 add constraint payroll_receipt_consistent check (
  (state <> 'draft' or (first_accessed_at is null and acknowledged_at is null))
  and (acknowledged_at is null or
       (category='cedolino' and published_at is not null))
  and (category <> 'cedolino' or first_accessed_at is null or
       acknowledged_at is not null)
 );

-- This RPC is called only AFTER auth.getUser + live LTS session + owner checks.
-- Service role is required; no direct anon/authenticated execution.
create or replace function public.lts_payroll_secure_qa_acknowledge(
 p_document_id uuid,p_driver_id uuid
) returns timestamptz language plpgsql security invoker
set search_path=''
as $$
declare v_at timestamptz;
begin
 update public.lts_payroll_documents_secure_qa
 set acknowledged_at=coalesce(acknowledged_at,now())
 where id=p_document_id and driver_id=p_driver_id and category='cedolino'
   and state='published'
 returning acknowledged_at into v_at;
 return v_at;
end;
$$;

create or replace function public.lts_payroll_secure_qa_mark_first_access(
 p_document_id uuid,p_driver_id uuid
) returns timestamptz language plpgsql security invoker
set search_path=''
as $$
declare v_at timestamptz;
begin
 update public.lts_payroll_documents_secure_qa
 set first_accessed_at=coalesce(first_accessed_at,now())
 where id=p_document_id and driver_id=p_driver_id and state='published'
   and (category <> 'cedolino' or acknowledged_at is not null)
 returning first_accessed_at into v_at;
 return v_at;
end;
$$;

revoke all on function public.lts_payroll_secure_qa_acknowledge(uuid,uuid)
 from public,anon,authenticated;
revoke all on function public.lts_payroll_secure_qa_mark_first_access(uuid,uuid)
 from public,anon,authenticated;
grant execute on function public.lts_payroll_secure_qa_acknowledge(uuid,uuid)
 to service_role;
grant execute on function public.lts_payroll_secure_qa_mark_first_access(uuid,uuid)
 to service_role;
