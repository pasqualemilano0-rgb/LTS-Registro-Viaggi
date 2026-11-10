import test from 'node:test';import assert from 'node:assert/strict';import {prepareMapsApprovalFromAssistant,mapsApprovalStatus,submitExistingMapsApproval} from '../copilota/maps-approval-adapter.mjs';
const valid={url:'https://www.google.com/maps/place/Napoli',customer:{name:'Alfa',city:'Napoli',address:'Via Roma 1'}};
test('name-only request is not silently submitted through Maps endpoint',()=>{assert.throws(()=>prepareMapsApprovalFromAssistant({customer:{name:'Alfa'}}));});
test('rejects invalid or non Maps URL',()=>{assert.throws(()=>prepareMapsApprovalFromAssistant({...valid,url:'https://example.com/place'}));});
test('pending state only follows actual server confirmation',()=>{assert.deepEqual(mapsApprovalStatus({pending:true,requestId:'r-1'}),{status:'pending',requestId:'r-1'});assert.throws(()=>mapsApprovalStatus({pending:true}));});
test('no endpoint wired means no submission',async()=>{await assert.rejects(submitExistingMapsApproval(valid),/non collegato/);});
test('delegates to existing LTS authenticated method and returns pending id',async()=>{let called=0;const result=await submitExistingMapsApproval(valid,{saveSharedMapsCustomer:async(url,customer)=>{called++;assert.equal(url,valid.url);assert.equal(customer.name,'Alfa');return {pending:true,requestId:'r-42'};}});assert.equal(called,1);assert.equal(result.requestId,'r-42');});
