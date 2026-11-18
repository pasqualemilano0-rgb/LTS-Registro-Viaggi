-- LTS · private payroll documents; REVIEW + APPLY IN STAGING FIRST.
-- Do not import payroll content into personal registry archives, Github, or browser backups.
create table if not exists public.lts_payroll_documents (
  id uuid primary key default gen_random_uuid(),
  driver_id uuid not null references auth.users(id),
  uploaded_by uuid not null references auth.users(id),
  published_by uuid references auth.users(id),
  category text not null check (category in ('cedolino','cu','altri')),
  document_year int not null check (document_year between 2000 and 2100),
  document_month int check (document_month between 1 and 12),
  label text not null check (char_length(label) between 1 and 160),
  original_filename text not null check (char_length(original_filename) between 1 and 180),
  object_path text not null unique,
  file_size int not null check (file_size between 1 and 8388608),
  sha256_hex text not null check (sha256_hex ~ '^[a-f0-9]{64}$'),
  state text not null default 'draft' check (state in ('draft','published','archived')),
  created_at timestamptz not null default now(),
  published_at timestamptz,
  archived_at timestamptz,
  constraint payroll_month_required check (category <> 'cedolino' or document_month is not null),
  constraint payroll_publication_consistent check (
    (state='draft' and published_at is null and archived_at is null)
    or (state='published' and published_at is not null and archived_at is null)
    or (state='archived' and archived_at is not null)
  )
);
create index if not exists lts_payroll_documents_driver_sort
  on public.lts_payroll_documents (driver_id, document_year desc, created_at desc);
create index if not exists lts_payroll_documents_status
  on public.lts_payroll_documents (state, created_at desc);

create table if not exists public.lts_payroll_audit (
  id bigint generated always as identity primary key,
  document_id uuid not null references public.lts_payroll_documents(id),
  actor_id uuid not null references auth.users(id),
  event text not null check (event in ('upload','publish','archive','download')),
  happened_at timestamptz not null default now()
);
create index if not exists lts_payroll_audit_document
  on public.lts_payroll_audit (document_id, happened_at desc);

-- INSERT/UPDATE and their audit record share the SAME database transaction.
-- Runs with the caller (service_role); no direct anon/authenticated function access.
create or replace function public.lts_payroll_write_audit()
returns trigger language plpgsql security invoker
set search_path = ''
as $
begin
  if tg_op = 'INSERT' then
    insert into public.lts_payroll_audit (document_id, actor_id, event)
      values (new.id, new.uploaded_by, 'upload');
  elsif tg_op = 'UPDATE' and old.state = 'draft' and new.state = 'published' then
    if new.published_by is null then
      raise exception 'A publishing administrator is required.';
    end if;
    insert into public.lts_payroll_audit (document_id, actor_id, event)
      values (new.id, new.published_by, 'publish');
  end if;
  return new;
end;
$;
revoke all on function public.lts_payroll_write_audit() from public, anon, authenticated;
drop trigger if exists lts_payroll_write_audit_trg on public.lts_payroll_documents;
create trigger lts_payroll_write_audit_trg
after insert or update of state on public.lts_payroll_documents
for each row execute function public.lts_payroll_write_audit();

alter table public.lts_payroll_documents enable row level security;
alter table public.lts_payroll_audit enable row level security;
-- Deliberately NO anon or authenticated policies: ONLY trusted Edge backend with
-- service_role, independent JWT + live-session + account role + admin-MFA checks.
revoke all on public.lts_payroll_documents from anon, authenticated;
revoke all on public.lts_payroll_audit from anon, authenticated;
revoke all on sequence public.lts_payroll_audit_id_seq from anon, authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('lts-payroll-private','lts-payroll-private',false,8388608,array['application/pdf'])
on conflict (id) do update set public=false,
 file_size_limit=excluded.file_size_limit, allowed_mime_types=excluded.allowed_mime_types;
-- Never create SELECT/INSERT/UPDATE/DELETE storage.objects policies for anon/authenticated.
-- Edge function uses its private service_role client to access the bucket.
