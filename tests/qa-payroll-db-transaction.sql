-- QA ONLY. SQL integration checks, NOT authenticated HTTP or physical WebAuthn E2E.
-- Synthetic metadata is rolled back; no PDF bytes or receipt survives the test.
begin;
do $$
declare a uuid; b uuid; m uuid; d uuid:=gen_random_uuid(); at1 timestamptz; at2 timestamptz; n int;
begin
 select user_id into a from public.lts_account_access where role='driver' and enabled and removed_at is null order by user_id limit 1;
 select user_id into b from public.lts_account_access where role='driver' and enabled and removed_at is null and user_id<>a limit 1;
 select user_id into m from public.lts_account_access where role='admin' and enabled and removed_at is null limit 1;
 assert a is not null and b is not null and m is not null, 'Requires two QA drivers and one admin';
 insert into public.lts_payroll_documents_secure_qa(id,driver_id,uploaded_by,category,document_year,document_month,label,original_filename,object_path,file_size,sha256_hex)
 values(d,a,m,'cedolino',2026,11,'SYNTHETIC TRANSACTION TEST','synthetic.pdf',a||'/test/'||d||'.pdf',100,repeat('a',64));
 assert public.lts_payroll_secure_qa_acknowledge(d,a) is null, 'Draft receipt denied';
 assert public.lts_payroll_secure_qa_mark_first_access(d,a) is null, 'Draft access denied';
 update public.lts_payroll_documents_secure_qa set state='published',published_by=m,published_at=now() where id=d;
 assert public.lts_payroll_secure_qa_acknowledge(d,a) is null, 'Receipt before access denied';
 assert public.lts_payroll_secure_qa_mark_first_access(d,b) is null, 'Cross-driver access denied';
 assert public.lts_payroll_secure_qa_acknowledge(d,b) is null, 'Cross-driver receipt denied';
 at1:=public.lts_payroll_secure_qa_mark_first_access(d,a);
 assert at1 is not null, 'Owner first access';
 assert (select acknowledged_at is null from public.lts_payroll_documents_secure_qa where id=d), 'No automatic receipt';
 at1:=public.lts_payroll_secure_qa_acknowledge(d,a);
 at2:=public.lts_payroll_secure_qa_acknowledge(d,a);
 assert at1 is not null and at1=at2, 'Idempotent receipt';
 select count(*) into n from public.lts_payroll_audit_secure_qa where document_id=d and event='acknowledge';
 assert n=1, 'Exactly one receipt audit';
 assert public.lts_payroll_secure_qa_revoke(d,a) is null, 'Driver cannot revoke';
 assert public.lts_payroll_secure_qa_revoke(d,m) is not null, 'Admin revoke';
 assert public.lts_payroll_secure_qa_revoke(d,m) is null, 'No duplicate revocation';
 assert public.lts_payroll_secure_qa_mark_first_access(d,a) is null, 'Revoked access denied';
 assert public.lts_payroll_secure_qa_acknowledge(d,a) is null, 'Revoked receipt denied';
 assert (select acknowledged_at=at1 and state='archived' from public.lts_payroll_documents_secure_qa where id=d), 'Receipt preserved';
 select count(*) into n from public.lts_payroll_audit_secure_qa where document_id=d and event='archive' and actor_id=m;
 assert n=1, 'Revocation audit bound to administrator';
 assert not has_function_privilege('anon','public.lts_payroll_secure_qa_revoke(uuid,uuid)','EXECUTE'), 'Anon RPC denied';
 assert not has_function_privilege('authenticated','public.lts_payroll_secure_qa_revoke(uuid,uuid)','EXECUTE'), 'Direct authenticated RPC denied';
end;
$$;
rollback;
select 'PASS: 19 SQL assertions; all synthetic rows rolled back' as result;
