import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const sql=readFileSync(new URL('../supabase/qa/f52-f49-production-candidate.sql',import.meta.url),'utf8');
test('F52 F49 migration retains all existing catalog routes and session checks',()=>{
 for(const name of ['lts_company_tariffs','lts_company_extra_rates','lts_shared_maps_customers','lts_shared_customers_manual'])assert.ok(sql.includes(name));
 assert.ok(sql.includes('public.lts_session_is_active(i.uid,i.sid)'));
 assert.ok(sql.includes("s.aal::text='aal2'"));
 assert.ok(sql.includes("p_topic='lts:v2:session:'||i.sid::text"));
 assert.ok(sql.includes('GRANT EXECUTE ON FUNCTION lts_internal.may_receive_realtime(text) TO authenticated'));
 assert.ok(!sql.includes('lts:v1:'));assert.ok(!sql.includes('DROP TRIGGER'));
});
