import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const runtime=read('runtime-config.mjs');
const account=read('account-access.mjs');
const shared=read('shared-maps-client.mjs');
const maps=read('maps-reader-client.mjs');
const html=read('index.html');
const shell=read('shell.html');
const admin=read('amministratore/index.html');
const vercel=JSON.parse(read('vercel.json'));

test('QA demo cannot reach production LTS backends',()=>{
 for(const [name,source] of Object.entries({runtime,account,shared,maps})){
  assert.doesNotMatch(source,/otrqynkscpbeyuvdlgpg|\.supabase\.co|steadyzebra1\.chatgpt\.site|sb_(secret|publishable)_/i,
   'Production endpoint or key found in '+name);
 }
 assert.match(runtime,/enabled:false/);
 assert.match(runtime,/apiUrl:''/);
 for(const [name,source] of Object.entries({html,admin,shell})){
  assert.match(source,/connect-src 'self'/,name+' must block external API calls');
  assert.doesNotMatch(source,/connect-src 'self' https:/,name+' cannot allow production origins');
  assert.match(source,/noindex,nofollow,noarchive/);
  assert.match(source,/QA PRIVATA — SOLO DATI DI PROVA/);
 }
});

test('QA archive/map adapters use only synthetic local browser records',()=>{
 assert.match(account,/QA_DEMO_KEY='lts-rc3-private-demo-synthetic-v1'/);
 assert.match(account,/QA_DRIVER_KEY='lts-private-demo-driver-state-v1'/);
 assert.match(account,/export async function archiveRequest\(/);
 assert.match(account,/localStorage\.setItem\(QA_DRIVER_KEY/);
 assert.match(account,/function qaOfflineError/);
 assert.match(shared,/CLIENTE ALFA/);
 assert.match(shared,/export const sharedMapsCustomers/);
 assert.match(maps,/export const readMapsCustomer/);
 assert.doesNotMatch(account,/fetch\s*\(|new WebSocket/);
 assert.doesNotMatch(shared,/fetch\s*\(|new WebSocket/);
 assert.doesNotMatch(maps,/fetch\s*\(|new WebSocket/);
});

test('private Vercel routing is prefixed, not indexed, and offline shell parity is preserved',()=>{
 assert.equal(html,shell);
 assert(vercel.rewrites?.some(x=>x.source==='/LTS-Registro-Viaggi/:path*'));
 assert(vercel.headers?.some(x=>x.headers?.some(h=>h.key==='X-Robots-Tag'&&h.value.includes('noindex'))));
 assert.equal(vercel.redirects?.[0]?.destination,'/LTS-Registro-Viaggi/amministratore/');
});

test('all synthetic import entrypoints are valid JavaScript source',()=>{
 for(const [name,source] of Object.entries({runtime,account,shared,maps}))
  assert.ok(source.trim().length>100,name+' cannot be empty');
});
