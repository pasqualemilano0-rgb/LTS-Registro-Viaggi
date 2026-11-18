-- LTS Registro Viaggi: payroll documents (private; Edge Function service role only).
-- Apply only after staging verification, before enabling the client feature.
create table if not exists public.lts_payroll_documents (
 id uuid primary key default gen_random_uuid(),
 employee_id uuid not null references public.lts_account_access(user_id),
 uploaded_by uuid not null references public.lts_account_access(user_id),
 category text not null check (category in ('CEDOLINO','CU','ALTRI')),
 document_year integer not null check (document_year between 2000 and 2100),
 document_month integer check (document_month between 1 and 12),
 title text not null check (length(btrim(title)) between 1 and 160),
 original_filename text not null check (length(original_filename) between 1 and 180),
 object_path text not null unique check (length(object_path) between 40 and 160),
 size_bytes integer not null check (size_bytes between 10 and 8388608),
 sha256 text not null check (sha256 ~ '^[a-f0-9]{64}$'),
 status text not null default 'draft' check (status in ('draft','published','revoked')),
 created_at timestamptz not null default now(),
 published_at timestamptz,
 revoked_at timestamptz,
 constraint lts_payroll_month_rule check (
    (category='CEDOLINO' and document_month is not null)
    or (category='CU' and document_month is null)
    or category='ALTRI'
 ),
 constraint lts_payroll_status_dates check (
    (status='draft' and published_at is null and revoked_at is null)
    or (status='published' and published_at is not null and revoked_at is null)
    or (status='revoked' and revoked_at is not null)
 )
);
create index if not exists lts_payroll_employee_idx
 on public.lts_payroll_documents(employee_id,document_year desc,created_at desc)
 where status='published';
create index if not exists lts_payroll_status_idx
 on public.lts_payroll_documents(status,created_at desc);
alter table public.lts_payroll_documents enable row level security;
alter table public.lts_payroll_documents force row level security;
revoke all on public.lts_payroll_documents from public,anon,authenticated;
grant select,insert,update,delete on public.lts_payroll_documents to service_role;

create table if not exists public.lts_payroll_audit (
 id uuid primary key default gen_random_uuid(),
 document_id uuid not null references public.lts_payroll_documents(id),
 actor_id uuid not null references public.lts_account_access(user_id),
 action text not null check (action in ('upload','publish','revoke','download')),
 happened_at timestamptz not null default now()
);
create index if not exists lts_payroll_audit_doc_idx
 on public.lts_payroll_audit(document_id,happened_at desc);
alter table public.lts_payroll_audit enable row level security;
alter table public.lts_payroll_audit force row level security;
revoke all on public.lts_payroll_audit from public,anon,authenticated;
grant select,insert on public.lts_payroll_audit to service_role;

-- Atomically change status and record the action; service-role callers only.
create or replace function public.lts_payroll_transition(p_id uuid,p_actor uuid,p_next text)
returns text language plpgsql security invoker set search_path = ''
as $
declare result text;
begin
 if p_next not in ('published','revoked') then
  raise exception 'Invalid payroll transition';
 end if;
 update public.lts_payroll_documents
 set status = p_next,
     published_at = case when p_next='published' then now() else published_at end,
     revoked_at = case when p_next='revoked' then now() else null end
 where id=p_id and status=case when p_next='published' then 'draft' else 'published' end
 returning status into result;
 if result is null then
  raise exception 'Payroll transition conflict' using errcode='P0002';
 end if;
 insert into public.lts_payroll_audit(document_id,actor_id,action)
 values (p_id,p_actor,case when p_next='published' then 'publish' else 'revoke' end);
 return result;
end;
$;
revoke all on function public.lts_payroll_transition(uuid,uuid,text)
 from public,anon,authenticated;
grant execute on function public.lts_payroll_transition(uuid,uuid,text) to service_role;

-- No anon/authenticated storage.objects policies: all file operations
-- must go through lts-payroll Edge Function after online auth and ACL checks.
insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('lts-payroll-private','lts-payroll-private',false,8388608,array['application/pdf'])
on conflict (id) do update set public=false,file_size_limit=excluded.file_size_limit,
  allowed_mime_types=excluded.allowed_mime_types;
