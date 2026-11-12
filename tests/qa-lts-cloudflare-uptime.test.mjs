import test from 'node:test';
import assert from 'node:assert/strict';
import worker,{inspect} from '../cloudflare/uptime-monitor/index.mjs';

const ORIGIN='https://pasqualemilano0-rgb.github.io';
const AUTH='https://otrqynkscpbeyuvdlgpg.supabase.co/functions/v1/lts-phone-auth';
function success(url,options){
  if(url===AUTH) return Promise.resolve({url,status:204,headers:new Headers({'access-control-allow-origin':ORIGIN})});
  const text=url.endsWith('/amministratore/')?'<title>LTS Admin</title><section id="login-panel">OK</section>':
   url.endsWith('app.mjs')?'import {x} from "y"':'<title>LTS</title><div id="app">';
  return Promise.resolve({url,status:200,headers:new Headers({'content-type':url.endsWith('app.mjs')?'text/javascript':'text/html'}),body:new Response(text).body});
}
test('all four probes are read-only and CORS preflight uses exact allowed origin',async()=>{
  const seen=[];
  const result=await inspect((url,opts)=>{seen.push({url,opts});return success(url,opts)});
  assert.deepEqual(result.map(x=>x.name),['site','admin','bundle','auth']);
  assert.ok(result.every(x=>x.ok));
  const cors=seen.find(x=>x.url===AUTH);
  assert.equal(cors.opts.method,'OPTIONS');
  assert.equal(cors.opts.headers.Origin,ORIGIN);
  assert.equal(cors.opts.headers['Access-Control-Request-Method'],'POST');
  assert.equal(seen.filter(x=>x.opts.method==='GET').length,3);
});
test('reject a wildcard CORS response',async()=>{
  const result=await inspect((url,opts)=>url===AUTH?Promise.resolve({url,status:204,headers:new Headers({'access-control-allow-origin':'*'})}):success(url,opts));
  assert.deepEqual(result.find(x=>x.name==='auth'),{name:'auth',ok:false,reason:'AUTH_CORS_ORIGIN_MISMATCH'});
});
test('reject a 200 response without the administrator marker',async()=>{
  const result=await inspect((url,opts)=>url.endsWith('amministratore/')?Promise.resolve({url,status:200,headers:new Headers({'content-type':'text/html'}),body:new Response('<title>LTS</title>').body}):success(url,opts));
  assert.equal(result.find(x=>x.name==='admin').reason,'MISSING_REQUIRED_MARKER');
});
test('reject cross-origin redirect targets',async()=>{
  const result=await inspect((url,opts)=>url.endsWith('app.mjs')?Promise.resolve({url:'https://evil.example/other',status:200,headers:new Headers(),body:new Response('import x').body}):success(url,opts));
  assert.equal(result.find(x=>x.name==='bundle').reason,'UNEXPECTED_REDIRECT_ORIGIN');
});
test('the worker does not expose an HTTP management API',async()=>{
  const response=await worker.fetch(new Request('https://example.org/check'));
  assert.equal(response.status,404);
});
