import test from 'node:test';
import assert from 'node:assert/strict';
import {FEEDS,vet,readAll,publish,hasRecoveryPoint,classifyGitHubRef422,terminalHealthDiagnostic,reportPublishError,PublishRejected,BASE} from '../cloudflare/public-snapshot-publisher/index.mjs';

const NOW=Date.parse('2026-11-12T17:20:00Z');
const NEW='2026-11-12T17:15:00.000Z',OLD='2026-11-11T21:00:00.000Z';
const A='a'.repeat(40),T='b'.repeat(40),N='c'.repeat(40);
function fixture(){
  const snapshots={},statuses={},previous={};
  for(const [t,spec] of Object.entries(FEEDS)){
    const row={vessel:'TEST VESSEL',...Object.fromEntries(spec.fields.filter(x=>x!=='vessel').map(k=>[k,'']))};
    snapshots[t]={source:spec.source,acquired_at:NEW,source_updated_at:t==='tfg'?'2026-11-12T13:08:54.000Z':null,
      rows:Array.from({length:6},()=>({...row})),monitor_origin:'cloudflare_official_read'};
    if(t==='tfg'){snapshots[t].live=true;snapshots[t].booking_verified=false}
    if(t==='sct'){snapshots[t].updated_at=NEW;snapshots[t].data_changed_at=NEW}
    statuses[t]={state:'ok',last_error_code:null,last_attempt_at:NEW,last_success_at:NEW,
      source_updated_at:snapshots[t].source_updated_at,rows:6};
    previous[t]={source:spec.source,acquired_at:OLD,source_updated_at:t==='tfg'?'2026-11-11T14:44:57.000Z':null,rows:Array.from({length:6},()=>({...row}))};
  }
  return{snapshots,statuses,previous};
}
function kv(f,{backups=true}={}){
  return {get:async(key)=>{const [kind,t]=key.split(':');return kind==='schedule'?f.snapshots[t]:f.statuses[t]},
    list:async({prefix})=>({keys:backups?[{name:prefix+'backup'}]:[],list_complete:true})};
}
function fakeGit(previous,{failAt='',blockUnsafe=true}={}){
  const calls=[],out={calls};
  const routes={};
  for(const [t,spec] of Object.entries(FEEDS))routes['/contents/porti/data/'+spec.filename+'?ref='+A]={
    encoding:'base64',content:Buffer.from(JSON.stringify(previous[t]),'utf8').toString('base64')};
  let blob=0;
  out.fetch=async(url,options={})=>{
    const u=new URL(url),path=u.pathname.replace('/repos/pasqualemilano0-rgb/LTS-Registro-Viaggi','')+u.search;
    if(blockUnsafe)assert.equal(url,BASE+path,'Never call unknown hosts');
    const method=options.method||'GET',body=options.body?JSON.parse(options.body):null;
    calls.push({method,path,body});
    if(path===failAt)return{ok:false,status:403,redirected:false,headers:new Headers(),text:async()=>JSON.stringify({message:'Forbidden'})};
    let value=routes[path];
    if(path==='/git/ref/heads/main'&&method==='GET')value={object:{sha:A}};
    else if(path==='/git/commits/'+A&&method==='GET')value={tree:{sha:T}};
    else if(path==='/git/blobs'&&method==='POST'){assert.equal(body.encoding,'utf-8');value={sha:(++blob).toString(16).repeat(40).slice(0,40)}}
    else if(path==='/git/trees'&&method==='POST'){assert.equal(body.base_tree,T);value={sha:N};}
    else if(path==='/git/commits'&&method==='POST'){assert.deepEqual(body.parents,[A]);value={sha:N};}
    else if(path==='/git/refs/heads/main'&&method==='PATCH'){assert.equal(body.force,false);assert.equal(body.sha,N);value={ref:'refs/heads/main'};}
    assert.ok(value,'Unexpected GitHub API request '+method+' '+path);
    return{ok:true,status:200,redirected:false,headers:new Headers({'content-type':'application/json'}),
      text:async()=>JSON.stringify(value)};
  };
  return out;
}
test('no credentials and disabled switch: zero external writes, zero GitHub reads',async()=>{
  let calls=0;const env={PUBLISH_ENABLED:'no',SCHEDULES_KV:kv(fixture())};
  await assert.rejects(publish(env,{now:NOW,fetcher:async()=>{calls++;throw Error('forbidden')}}),
    {message:'PUBLISH_DISABLED_OR_SECRET_MISSING'});
  assert.equal(calls,0);
  await assert.rejects(publish({...env,PUBLISH_ENABLED:'yes'},{now:NOW,fetcher:async()=>{calls++;throw Error('forbidden')}}),
    {message:'PUBLISH_DISABLED_OR_SECRET_MISSING'});
  assert.equal(calls,0);
});
test('public-only normalizer drops live flag and booking-verification from TFG',()=>{
  const f=fixture();const v=vet('tfg',f.snapshots.tfg,f.statuses.tfg,f.previous.tfg,NOW);
  const parsed=JSON.parse(v.body);
  assert.equal(parsed.live,undefined);
  assert.equal(parsed.booking_verified,undefined);
  assert.equal(parsed.rows.length,6);
});
test('rejects unknown personal fields at root and row levels',()=>{
  const f=fixture();f.snapshots.cnt.rows[0].booking='PRIVATE';
  assert.throws(()=>vet('cnt',f.snapshots.cnt,f.statuses.cnt,null,NOW),{message:'UNEXPECTED_PUBLIC_FIELD'});
  delete f.snapshots.cnt.rows[0].booking;
  f.snapshots.cnt.customer='PRIVATE';
  assert.throws(()=>vet('cnt',f.snapshots.cnt,f.statuses.cnt,null,NOW),{message:'UNEXPECTED_SNAPSHOT_FIELD'});
});
test('rejects stale, future, spoofed, mismatched and source-version rolled back values',()=>{
  const f=fixture(),p=f.snapshots.cnt,s=f.statuses.cnt;
  p.acquired_at='2026-11-12T16:20:00Z';
  assert.throws(()=>vet('cnt',p,s,null,NOW),{message:'STALE_OR_FUTURE'});
  p.acquired_at='2026-11-12T17:28:00Z';
  assert.throws(()=>vet('cnt',p,s,null,NOW),{message:'STALE_OR_FUTURE'});
  p.acquired_at=NEW;p.source='https://fake.example';
  assert.throws(()=>vet('cnt',p,s,null,NOW),{message:'UNVERIFIED_SOURCE'});
  p.source=FEEDS.cnt.source;s.last_success_at=OLD;
  assert.throws(()=>vet('cnt',p,s,null,NOW),{message:'MONITOR_MISMATCH'});
  f.snapshots.tfg.source_updated_at='2026-11-10T01:00:00Z';
  assert.throws(()=>vet('tfg',f.snapshots.tfg,f.statuses.tfg,f.previous.tfg,NOW),{message:'SOURCE_VERSION_MISMATCH'});
});
test('rejects unexpected vessel row loss and non-finite/nested fields',()=>{
  const f=fixture();f.snapshots.cnt.rows=[{vessel:'ONE'}];f.statuses.cnt.rows=1;
  assert.throws(()=>vet('cnt',f.snapshots.cnt,f.statuses.cnt,f.previous.cnt,NOW),{message:'UNEXPECTED_ROW_LOSS'});
  f.snapshots.cnt.rows=Array.from({length:6},()=>({vessel:'ABC'}));f.statuses.cnt.rows=6;
  f.snapshots.cnt.rows[0].notes={password:'SECRET'};
  assert.throws(()=>vet('cnt',f.snapshots.cnt,f.statuses.cnt,null,NOW),{message:'PRIVATE_OR_NESTED_VALUE'});
});
test('all three KV sources require verified backups before any Git write',async()=>{
  const f=fixture();
  await assert.rejects(readAll({SCHEDULES_KV:kv(f,{backups:false})},NOW,f.previous),
    {message:'RECOVERY_POINT_MISSING_cnt'});
});
test('publishes three files in ONE non-force Git tree/commit/ref update',async()=>{
  const f=fixture(),g=fakeGit(f.previous);
  const result=await publish({PUBLISH_ENABLED:'yes',GITHUB_PUBLIC_CONTENTS_TOKEN:'dummy-test-token-with-length',SCHEDULES_KV:kv(f)},
    {now:NOW,fetcher:g.fetch});
  assert.equal(result.status,'published');
  assert.deepEqual(result.updated,['cnt','tfg','sct']);
  assert.equal(g.calls.filter(c=>c.method==='POST'&&c.path==='/git/blobs').length,3);
  assert.equal(g.calls.filter(c=>c.method==='POST'&&c.path==='/git/trees').length,1);
  assert.equal(g.calls.filter(c=>c.method==='POST'&&c.path==='/git/commits').length,1);
  const update=g.calls.filter(c=>c.method==='PATCH');
  assert.equal(update.length,1);
  assert.equal(update[0].body.force,false);
  const tree=g.calls.find(c=>c.path==='/git/trees');
  assert.deepEqual(tree.body.tree.map(x=>x.path),[
    'porti/data/conateco.json','porti/data/tfg_schedule.json','porti/data/sct.json']);
});
test('bad TFG prevents ALL blob creations and public commits',async()=>{
  const f=fixture(),g=fakeGit(f.previous);
  f.snapshots.tfg.rows[0].customer='PRIVATE';
  await assert.rejects(publish({PUBLISH_ENABLED:'yes',GITHUB_PUBLIC_CONTENTS_TOKEN:'dummy-test-token-with-length',SCHEDULES_KV:kv(f)},
    {now:NOW,fetcher:g.fetch}),{message:'UNEXPECTED_PUBLIC_FIELD'});
  assert.equal(g.calls.filter(c=>c.method!=='GET').length,0);
});
test('GitHub permission failure leaves repository untouched',async()=>{
  const f=fixture(),g=fakeGit(f.previous,{failAt:'/git/ref/heads/main'});
  await assert.rejects(publish({PUBLISH_ENABLED:'yes',GITHUB_PUBLIC_CONTENTS_TOKEN:'dummy-test-token-with-length',SCHEDULES_KV:kv(f)},
    {now:NOW,fetcher:g.fetch}),{message:'GITHUB_GET_HTTP_403'});
  assert.equal(g.calls.filter(c=>c.method!=='GET').length,0);
});
test('does not overwrite newer public data',async()=>{
  const f=fixture(),g=fakeGit({...f.previous,tfg:{...f.previous.tfg,acquired_at:'2026-11-12T17:30:00Z'}});
  await assert.rejects(publish({PUBLISH_ENABLED:'yes',GITHUB_PUBLIC_CONTENTS_TOKEN:'dummy-test-token-with-length',SCHEDULES_KV:kv(f)},
    {now:NOW,fetcher:g.fetch}),{message:'ACQUISITION_ROLLBACK'});
  assert.equal(g.calls.filter(c=>c.method!=='GET').length,0);
});
test('idempotent: same acquisition has no Git write',async()=>{
  const f=fixture();const current={};
  for(const t of Object.keys(FEEDS))current[t]={...f.previous[t],acquired_at:NEW,
    source_updated_at:f.snapshots[t].source_updated_at};
  const g=fakeGit(current);
  const result=await publish({PUBLISH_ENABLED:'yes',GITHUB_PUBLIC_CONTENTS_TOKEN:'dummy-test-token-with-length',SCHEDULES_KV:kv(f)},
    {now:NOW,fetcher:g.fetch});
  assert.equal(result.status,'unchanged');
  assert.equal(g.calls.filter(c=>c.method!=='GET').length,0);
});

test('read-only preview verifies GitHub baseline and KV without creating blobs or commits',async()=>{
  const f=fixture(),g=fakeGit(f.previous);
  const {preview}=await import('../cloudflare/public-snapshot-publisher/index.mjs');
  const result=await preview({PUBLISH_ENABLED:'no',SCHEDULES_KV:kv(f)},{now:NOW,fetcher:g.fetch});
  assert.equal(result.status,'ready');
  assert.equal(result.mode,'read_only');
  assert.deepEqual(result.updated,['cnt','tfg','sct']);
  assert.equal(g.calls.length,5,'Only read public ref, commit and three previous JSONs');
  assert.ok(g.calls.every(c=>c.method==='GET'));
});

test('public preview route remains inaccessible outside explicitly enabled QA',async()=>{
  const {default:worker}=await import('../cloudflare/public-snapshot-publisher/index.mjs');
  const req=new Request('https://publisher.workers.dev/preview',{method:'GET'});
  let res=await worker.fetch(req,{PUBLISH_ENABLED:'no'});
  assert.equal(res.status,404);
  res=await worker.fetch(req,{PUBLISH_ENABLED:'yes',QA_PREVIEW_ENABLED:'yes'});
  assert.equal(res.status,404);
});

test('KV pagination: an empty tombstone page does not hide real recovery points',async()=>{
  const f=fixture(),queries=[],store=kv(f);
  store.list=async options=>{
    queries.push({...options});
    if(!options.cursor)return{keys:[],list_complete:false,cursor:options.prefix+'after-tombstone'};
    return{keys:[{name:options.prefix+'2026-11-12T17:00:00.000Z'}],list_complete:true};
  };
  const vetted=await readAll({SCHEDULES_KV:store},NOW,f.previous);
  assert.deepEqual(Object.keys(vetted),['cnt','tfg','sct']);
  assert.equal(queries.length,6);
  assert.ok(queries.every(q=>q.limit===100));
  for(const term of Object.keys(FEEDS)){
    const termQueries=queries.filter(q=>q.prefix==='backup:v1:'+term+':');
    assert.equal(termQueries.length,2);
    assert.equal(termQueries[1].cursor,termQueries[0].prefix+'after-tombstone');
  }
});
test('KV recovery gate rejects unrelated keys and a genuinely absent recovery point',async()=>{
  const f=fixture(),store=kv(f);
  store.list=async()=>({keys:[{name:'backup:v1:wrong:2026-11-12'}],list_complete:true});
  assert.equal(await hasRecoveryPoint(store,'cnt'),false);
  await assert.rejects(readAll({SCHEDULES_KV:store},NOW,f.previous),
    {message:'RECOVERY_POINT_MISSING_cnt'});
});
test('KV recovery gate fails closed on repeated cursors, malformed pages, and too many pages',async()=>{
  const store={list:async()=>({keys:[],list_complete:false,cursor:'repeat'})};
  await assert.rejects(hasRecoveryPoint(store,'cnt'),{message:'RECOVERY_POINT_LIST_INVALID_cnt'});
  store.list=async()=>({keys:null,list_complete:true});
  await assert.rejects(hasRecoveryPoint(store,'cnt'),{message:'RECOVERY_POINT_LIST_INVALID_cnt'});
  let n=0;
  store.list=async()=>({keys:[],list_complete:false,cursor:'p'+(++n)});
  await assert.rejects(hasRecoveryPoint(store,'cnt'),{message:'RECOVERY_POINT_LIST_INCOMPLETE_cnt'});
  assert.equal(n,10);
});
test('missing backup across all KV pages prevents every GitHub write',async()=>{
  const f=fixture(),g=fakeGit(f.previous),store=kv(f);
  store.list=async({cursor})=>cursor
    ?{keys:[],list_complete:true}:{keys:[],list_complete:false,cursor:'last'};
  await assert.rejects(publish({
    PUBLISH_ENABLED:'yes',GITHUB_PUBLIC_CONTENTS_TOKEN:'dummy-test-token-with-length',SCHEDULES_KV:store
  },{now:NOW,fetcher:g.fetch}),{message:'RECOVERY_POINT_MISSING_cnt'});
  assert.ok(g.calls.every(c=>c.method==='GET'));
});

test('422 error categories distinguish rulesets, stale refs, invalid hashes, and unknown safely',()=>{
  assert.equal(classifyGitHubRef422({message:'Repository rule violations found for refs/heads/main'}),'RULESET');
  assert.equal(classifyGitHubRef422({message:'Validation Failed',errors:[{message:'Changes must be made through a pull request.'}]}),'RULESET');
  assert.equal(classifyGitHubRef422({message:'Update is not a fast forward'}),'NON_FAST_FORWARD');
  assert.equal(classifyGitHubRef422({message:'Invalid sha'}),'INVALID_REF');
  assert.equal(classifyGitHubRef422({message:'Sensitive bearer TOKEN_DO_NOT_LOG'}),'UNKNOWN');
  assert.equal(classifyGitHubRef422(null),'UNKNOWN');
});
test('GitHub PATCH 422 is fail-closed and logs only a fixed category',async()=>{
  const f=fixture(),g=fakeGit(f.previous);
  const fetcher=async(url,options={})=>{
    if(new URL(url).pathname.endsWith('/git/refs/heads/main'))
      return new Response(JSON.stringify({
        message:'Repository rule violations found for refs/heads/main',
        errors:[{message:'Token TOKEN_DO_NOT_LOG'}]
      }),{status:422,headers:{'Content-Type':'application/json'}});
    return g.fetch(url,options);
  };
  await assert.rejects(publish({
    PUBLISH_ENABLED:'yes',GITHUB_PUBLIC_CONTENTS_TOKEN:'dummy-test-token-with-length',
    SCHEDULES_KV:kv(f)
  },{now:NOW,fetcher}),{message:'GITHUB_PATCH_HTTP_422_RULESET'});
  assert.equal(g.calls.filter(x=>x.method==='PATCH').length,0);
});
test('generic GitHub 422 never exposes response text or secrets',async()=>{
  const f=fixture(),g=fakeGit(f.previous);
  const fetcher=async(url,options={})=>new URL(url).pathname.endsWith('/git/refs/heads/main')
    ? new Response(JSON.stringify({message:'Validation Failed TOKEN_DO_NOT_LOG'}),{
        status:422,headers:{'Content-Type':'application/json'}})
    :g.fetch(url,options);
  await assert.rejects(publish({
    PUBLISH_ENABLED:'yes',GITHUB_PUBLIC_CONTENTS_TOKEN:'dummy-test-token-with-length',
    SCHEDULES_KV:kv(f)
  },{now:NOW,fetcher}),{message:'GITHUB_PATCH_HTTP_422_UNKNOWN'});
});

test('terminal health diagnostics identify all three failing ports without exposing KV payloads',async()=>{
  for(const terminal of Object.keys(FEEDS)){
    const f=fixture(),g=fakeGit(f.previous);
    f.statuses[terminal]={...f.statuses[terminal],state:'fallback',
      last_error_code:'SOURCE_HTTP',last_attempt_at:NEW,last_success_at:OLD};
    let failure;
    try{
      await publish({PUBLISH_ENABLED:'yes',GITHUB_PUBLIC_CONTENTS_TOKEN:'dummy-test-token-with-length',
        SCHEDULES_KV:kv(f)},{now:NOW,fetcher:g.fetch});
      assert.fail('unhealthy terminal must prevent publishing');
    }catch(error){failure=error;}
    assert.ok(failure instanceof PublishRejected);
    assert.equal(failure.message,'UNHEALTHY_TERMINAL');
    assert.deepEqual(failure.terminalHealth,{
      terminal,state:'fallback',error_code:'SOURCE_HTTP',
      last_attempt_at:NEW,last_success_at:OLD
    });
    const logged=[];
    reportPublishError(failure,{error:(...args)=>logged.push(args.join(' '))});
    assert.equal(logged.length,2);
    assert.ok(logged[0].startsWith('PUBLIC_PORTI_TERMINAL_HEALTH '));
    assert.deepEqual(JSON.parse(logged[0].slice('PUBLIC_PORTI_TERMINAL_HEALTH '.length)),
      failure.terminalHealth);
    assert.equal(logged[1],'PUBLIC_PORTI_PUBLISH_ERROR UNHEALTHY_TERMINAL');
    assert.ok(g.calls.every(c=>c.method==='GET'),'no blobs, tree, commits or ref writes on unhealthy status');
  }
});
test('unrecognized monitor values and timestamps are always sanitized in diagnostics',()=>{
  const suspicious='SECRET_TOKEN_MUST_NOT_LEAK';
  const v=terminalHealthDiagnostic('sct',{state:'error-'+suspicious,
    last_error_code:suspicious,
    last_attempt_at:'2026-11-12T17:15:00.000Z '+suspicious,
    last_success_at:'2026-99-99T17:15:00.000Z'});
  assert.deepEqual(v,{terminal:'sct',state:'unknown',error_code:'UNCLASSIFIED',
    last_attempt_at:null,last_success_at:null});
  assert.equal(JSON.stringify(v).includes(suspicious),false);
  const failure=new PublishRejected('UNHEALTHY_TERMINAL');
  failure.terminalHealth={terminal:'sct',state:'fallback',
    error_code:suspicious,last_attempt_at:suspicious,last_success_at:suspicious,
    private_key:suspicious};
  const logged=[];
  reportPublishError(failure,{error:(...args)=>logged.push(args.join(' '))});
  assert.equal(logged.length,2);
  assert.ok(logged[0].includes('"terminal":"sct"'));
  assert.doesNotMatch(logged.join('\n'),/SECRET_TOKEN_MUST_NOT_LEAK/);
});
test('error status without recognized monitor code remains fail-closed and writes nothing',async()=>{
  const f=fixture(),g=fakeGit(f.previous);
  f.statuses.tfg.state='error';
  f.statuses.tfg.last_error_code='UNEXPECTED_SECRET_VALUE';
  const store=kv(f);
  await assert.rejects(publish({PUBLISH_ENABLED:'yes',GITHUB_PUBLIC_CONTENTS_TOKEN:'dummy-test-token-with-length',
    SCHEDULES_KV:store},{now:NOW,fetcher:g.fetch}),error=>{
    assert.equal(error.message,'UNHEALTHY_TERMINAL');
    assert.deepEqual(error.terminalHealth,{
      terminal:'tfg',state:'error',error_code:'UNCLASSIFIED',
      last_attempt_at:NEW,last_success_at:NEW
    });
    return true;
  });
  assert.ok(g.calls.every(x=>x.method==='GET'));
});
test('other publisher failures retain original generic errors without health details',()=>{
  const logs=[];
  reportPublishError(new PublishRejected('RECOVERY_POINT_MISSING_cnt'),
    {error:(...args)=>logs.push(args.join(' '))});
  assert.deepEqual(logs,['PUBLIC_PORTI_PUBLISH_ERROR RECOVERY_POINT_MISSING_cnt']);
  const unrelated=[];
  reportPublishError(new Error('PRIVATE_TOKEN_DO_NOT_LOG'),
    {error:(...args)=>unrelated.push(args.join(' '))});
  assert.deepEqual(unrelated,['PUBLIC_PORTI_PUBLISH_ERROR UNEXPECTED_FAILURE']);
});
