-- QA ONLY: WebAuthn tables; verify all names/privileges before runtime deploy.
-- LTS · Step-up WebAuthn for IL TUO PROFILO / I MIEI DOCUMENTI.
-- Apply ONLY after 20261118_private_payroll_documents.sql, in isolated staging.
-- No biometric, PIN, password or unencrypted bearer token is stored here.
-- WebAuthn platform authentication is checked server-side before PDFs can be listed.
create table if not exists public.lts_payroll_passkeys (
  credential_id text primary key check (length(credential_id) between 24 and 1024),
  user_id uuid not null references auth.users(id),
  public_key text not null check (length(public_key) between 40 and 8192),
  counter bigint not null default 0 check (counter >= 0),
  transports text[] not null default '{}',
  device_type text not null check (device_type in ('singleDevice','multiDevice')),
  backed_up boolean not null default false,
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at timestamptz
);
create index if not exists lts_payroll_passkeys_active_by_user
 on public.lts_payroll_passkeys(user_id) where revoked_at is null;

create table if not exists public.lts_payroll_webauthn_challenges (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  session_id uuid not null,
  purpose text not null check(purpose in ('register','unlock')),
  challenge text not null check (length(challenge) between 32 and 512),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  consumed_at timestamptz,
  constraint lts_payroll_challenge_expiry check(expires_at > created_at)
);
create index if not exists lts_payroll_webauthn_challenges_user
 on public.lts_payroll_webauthn_challenges(user_id,created_at desc);

create table if not exists public.lts_payroll_device_unlocks (
  user_id uuid not null references auth.users(id),
  session_id uuid not null,
  token_hash text not null check (token_hash ~ '^[0-9a-f]{64}$'),
  credential_id text not null references public.lts_payroll_passkeys(credential_id),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  primary key(user_id,session_id),
  constraint lts_payroll_unlock_expiry check(expires_at > created_at)
);

-- Database-backed enrollment rate limit. Never permit unlimited password attempts
-- simply because the caller possesses an already authenticated LTS session.
create table if not exists public.lts_payroll_enroll_limits (
  user_id uuid primary key references auth.users(id),
  window_started_at timestamptz not null default now(),
  attempts int not null default 0 check (attempts between 0 and 100000)
);
create or replace function public.lts_payroll_claim_enroll_attempt(p_user uuid)
returns boolean language plpgsql security invoker
set search_path=''
as $$
declare v_attempts int;
begin
 insert into public.lts_payroll_enroll_limits(user_id,window_started_at,attempts)
 values(p_user,now(),1)
 on conflict(user_id) do update set
  attempts=case when public.lts_payroll_enroll_limits.window_started_at <
     now()-interval '15 minutes' then 1
     else public.lts_payroll_enroll_limits.attempts+1 end,
  window_started_at=case when public.lts_payroll_enroll_limits.window_started_at <
     now()-interval '15 minutes' then now()
     else public.lts_payroll_enroll_limits.window_started_at end
 returning attempts into v_attempts;
 return v_attempts<=5;
end;
$$;
revoke all on function public.lts_payroll_claim_enroll_attempt(uuid) from public,anon,authenticated;
grant execute on function public.lts_payroll_claim_enroll_attempt(uuid) to service_role;

-- Consume a one-time challenge atomically, bound to the verified Supabase session.
-- A replay returns NULL, and all server verifications fail closed.
create or replace function public.lts_payroll_consume_webauthn_challenge(
 p_id uuid,p_user uuid,p_session uuid,p_purpose text
) returns text language plpgsql security invoker
set search_path = ''
as $$
declare v_challenge text;
begin
 update public.lts_payroll_webauthn_challenges
  set consumed_at=now()
 where id=p_id and user_id=p_user and session_id=p_session
   and purpose=p_purpose and consumed_at is null and expires_at>now()
 returning challenge into v_challenge;
 return v_challenge;
end;
$$;
revoke all on function public.lts_payroll_consume_webauthn_challenge(uuid,uuid,uuid,text)
 from public,anon,authenticated;
grant execute on function public.lts_payroll_consume_webauthn_challenge(uuid,uuid,uuid,text)
 to service_role;

alter table public.lts_payroll_passkeys enable row level security;
alter table public.lts_payroll_enroll_limits enable row level security;
revoke all on public.lts_payroll_enroll_limits from anon,authenticated;
alter table public.lts_payroll_webauthn_challenges enable row level security;
alter table public.lts_payroll_device_unlocks enable row level security;
revoke all on public.lts_payroll_passkeys from anon,authenticated;
revoke all on public.lts_payroll_webauthn_challenges from anon,authenticated;
revoke all on public.lts_payroll_device_unlocks from anon,authenticated;
-- Do not add public/authenticated RLS access or functions. Edge backend uses
-- its private service_role client only AFTER verifying getUser(), active session,
-- enabled driver account and the cryptographic WebAuthn assertion.
