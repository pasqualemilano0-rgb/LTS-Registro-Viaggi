import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {F51_WRITE,F51_SAVE,adaptAccountState,adaptCompanyTariffs} from '../supabase/qa/f52-f51-release-adapter.mjs';
const sql=readFileSync(new URL('../supabase/qa/f52-f51-additive-candidate.sql',import.meta.url),'utf8');
test('F52 F51 routines preserve receipts, note omissions, CAS and tariff RPC',()=>{
 assert.ok(F51_WRITE.includes('preserveOmittedNotes(body.state,prior?.payload)'));
 assert.ok(F51_WRITE.includes('requestReceipt(body.requestId,body.baseRevision,checked)'));
 assert.ok(F51_WRITE.includes('row.revision>=body.baseRevision+1'));
 assert.ok(F51_WRITE.includes('.eq("revision",body.baseRevision)'));
 assert.ok(F51_SAVE.includes("rpc('lts_reprice_company_tariff'"));
 assert.ok(F51_SAVE.includes("p_expected_revision:input.expectedRevision"));
 assert.ok(F51_SAVE.includes("result.error?.code==='40001'"));
 assert.throws(()=>adaptAccountState('unexpected baseline'));
 assert.throws(()=>adaptCompanyTariffs('const QA_USERS=new Map();'));
});
test('F52 F51 additive migration preserves catalogs and uses private audit',()=>{
 assert.doesNotMatch(sql,/CREATE TABLE public\.lts_company_tariffs|DROP TABLE|TRUNCATE|INSERT INTO public\.lts_company_tariffs/i);
 assert.match(sql,/ALTER TABLE lts_internal\.company_tariff_reprice_audit ENABLE ROW LEVEL SECURITY/);
 assert.match(sql,/REVOKE ALL ON FUNCTION public\.lts_reprice_company_tariff\(uuid,bigint,integer,uuid,text,text\) FROM PUBLIC,anon,authenticated,service_role/);
 assert.match(sql,/CREATE TRIGGER lts_retroactive_fares_guard/);
 assert.match(sql,/CREATE TRIGGER lts_tariffs_reprice_after_update/);
 assert.match(sql,/notification_targets\(text,uuid\)/);
 assert.match(sql,/DEFERRABLE INITIALLY DEFERRED/);
});
