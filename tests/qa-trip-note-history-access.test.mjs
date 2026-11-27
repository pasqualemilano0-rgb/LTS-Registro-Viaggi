import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {readNoteHistory} from '../supabase/qa/note-history-handler.mjs';
import {integrateNoteHistory} from '../supabase/qa/integrate-note-history.mjs';
const owner='synthetic-owner',session='synthetic-session';
const req=new Request('https://example.invalid',{headers:{Authorization:'Bearer synthetic-token'}});
const user={id:owner,clientId:'account:'+owner,role:'driver'};
const input={action:'note-history',tripId:'trip-one',before:null};
const parse=token=>token==='synthetic-token'?session:null;
test('history uses authenticated owner and session, limits output and paginates',async()=>{
 let call;
 const admin={rpc:async(name,args)=>{call={name,args};return {data:Array.from({length:21},(_,i)=>({event_id:String(99-i),note_kind:'note',previous_note:'synthetic'}))}}};
 const result=await readNoteHistory(req,admin,user,input,parse);
 assert.deepEqual(call,{name:'lts_read_trip_note_history',args:{p_user_id:owner,p_session_id:session,p_trip_id:'trip-one',p_before:null}});
 assert.equal(result.userId,user.clientId);assert.equal(result.tripId,input.tripId);
 assert.equal(result.rows.length,20);assert.equal(result.nextBefore,'80');
});
test('history refuses forged owner, admin, missing session, invalid cursor and revoked session',async()=>{
 let called=0;const admin={rpc:async()=>{called++;return {error:{code:'42501'}}}};
 for(const [u,i,p,status] of [[user,{...input,userId:'other'},parse,400],[{...user,role:'admin'},input,parse,403],[user,input,()=>null,401],[user,{...input,before:'9223372036854775808'},parse,400],[user,{...input,before:'0'},parse,400],[user,input,parse,403]]){
  await assert.rejects(readNoteHistory(req,admin,u,i,p),e=>e.status===status);
 }
 assert.equal(called,1);
});
test('history integration adds one action without changing existing write or auth path',()=>{
 const source='import { checkLtsSession } from "./lts-session.mjs";\n    const user=await authorized(req,pair,checkSession,checkAdminMfa);\n    if(input.action==="write")return send(await write(pair.admin,user,input),200,origin);';
 const patched=integrateNoteHistory(source);
 assert.ok(patched.includes('const user=await authorized(req,pair,checkSession,checkAdminMfa)'));
 assert.ok(patched.includes('if(input.action==="write")return send(await write(pair.admin,user,input),200,origin)'));
 assert.ok(patched.includes('readNoteHistory(req,pair.admin,user,input,sessionIdFromJwt)'));
 assert.throws(()=>integrateNoteHistory(patched));
});
test('history read and restore stay bound to current account and draft',()=>{
 const app=readFileSync(new URL('../app.mjs',import.meta.url),'utf8');
 const access=readFileSync(new URL('../account-access.mjs',import.meta.url),'utf8');
 const sql=readFileSync(new URL('../supabase/qa/trip-note-history-access.sql',import.meta.url),'utf8');
 assert.ok(app.includes('accountAccess.getAccountId()===historyOwner'));
 assert.ok(app.includes('editingId===historyTripId'));
 assert.ok(app.includes('target.value=value;collect();keepEditorScratchpad()'));
 assert.ok(app.includes('Salva il viaggio per confermare.'));
 assert.ok(access.includes('result?.userId!==owner||result?.tripId!==tripId'));
 assert.match(sql,/NOT public\.lts_session_is_active\(p_user_id,p_session_id\)/);
 assert.match(sql,/h\.user_id=p_user_id AND h\.trip_id=p_trip_id/);
 assert.match(sql,/LANGUAGE sql STABLE SECURITY INVOKER/);
 assert.match(sql,/REVOKE ALL ON FUNCTION public\.lts_read_trip_note_history.*FROM PUBLIC,anon,authenticated,service_role/);
});
