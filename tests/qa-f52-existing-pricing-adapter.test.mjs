import test from 'node:test';
import assert from 'node:assert/strict';
import {integrateNotesIntoExistingPricing} from '../supabase/qa/f52-existing-pricing-adapter.mjs';
test('F52 production compatibility adapter leaves authorization, company pricing and CAS unchanged',()=>{
 const base=['import { checkLtsSession } from "./lts-session.mjs";','  const checked=checkedState(applyCompanyRates(body.state,rates));','  const prior=await currentRecord(admin,account.id);','  if((prior?.revision??0)!==body.baseRevision)throw {status:409};','    const user=await authorized(req,pair,checkSession,checkAdminMfa);','    const rates=await loadCompanyRates(pair.admin);','    if(input.action==="write")return send(await write(pair.admin,user,input,rates),200,origin);'].join('\n');
 const next=integrateNotesIntoExistingPricing(base);
 assert.ok(next.indexOf('const prior=')<next.indexOf('const checked='));
 assert.ok(next.includes('applyCompanyRates(preserveOmittedNotes(body.state,prior?.payload),rates)'));
 assert.ok(next.indexOf('const user=await authorized')<next.indexOf('if(input.action==="note-history")'));
 assert.ok(next.includes('if((prior?.revision??0)!==body.baseRevision)throw {status:409};'));
 assert.ok(next.includes('if(input.action==="write")return send(await write(pair.admin,user,input,rates),200,origin);'));
 assert.throws(()=>integrateNotesIntoExistingPricing(next));
 assert.throws(()=>integrateNotesIntoExistingPricing(base+'\nconst QA_ROLES={};'));
});
