import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createLtsRealtime} from '../realtime-client.mjs';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const identity={userId:'3bfc2a56-6f4f-490e-bafe-84a6b11c33e4',role:'driver',
 accessToken:'a'.repeat(100)};
const config={enabled:true,
 url:'wss://otrqynkscpbeyuvdlgpg.supabase.co/realtime/v1/websocket',
 publishableKey:'sb_publishable_testPublicKey42'};
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
class SocketMock {
 static connections=[];
 constructor(url){this.url=url;this.readyState=0;this.sent=[];SocketMock.connections.push(this);}
 open(){this.readyState=1;this.onopen?.();}
 send(data){this.sent.push(JSON.parse(data));}
 receive(message){this.onmessage?.({data:JSON.stringify(message)});}
 close(){this.readyState=3;this.onclose?.({code:1000});}
}
async function joined(role='driver'){
 SocketMock.connections=[];
 const updates=[];
 const actor={...identity,role};
 const bridge=createLtsRealtime({config,authenticate:async()=>actor,
  onChange:kind=>updates.push(kind),SocketImpl:SocketMock,
  visible:()=>true,online:()=>true});
 assert.equal(bridge.start(),true);
 await wait(5);
 const socket=SocketMock.connections[0];
 assert.ok(socket,'WebSocket opened');
 socket.open();
 const joins=socket.sent.filter(x=>x.event==='phx_join');
 for(const item of joins)socket.receive({
  topic:item.topic,event:'phx_reply',payload:{status:'ok'},ref:item.ref
 });
 await wait(285);
 return {bridge,updates,socket,joins};
}
test('driver joins only own archive and company catalog with JWT in private message',async()=>{
 const {bridge,updates,socket,joins}=await joined();
 assert.equal(joins.length,2);
 assert.deepEqual(joins.map(x=>x.topic).sort(),[
  'realtime:lts:v1:catalog',
  'realtime:lts:v1:driver:'+identity.userId
 ]);
 assert.ok(joins.every(x=>x.payload.config.private&&x.payload.access_token===identity.accessToken));
 assert.ok(!socket.url.includes(identity.accessToken),'never put bearer token in WebSocket URL');
 assert.ok(socket.url.includes('apikey=sb_publishable_'));
 assert.deepEqual(updates,['ready']);
 socket.receive({topic:'realtime:lts:v1:driver:'+identity.userId,event:'broadcast',
  payload:{event:'changed',type:'broadcast',payload:{kind:'archive'}}});
 await wait(285);
 assert.deepEqual(updates,['ready','archive']);
 socket.receive({topic:'realtime:lts:v1:catalog',event:'broadcast',
  payload:{event:'changed',type:'broadcast',payload:{kind:'catalog'}}});
 await wait(285);
 assert.deepEqual(updates,['ready','archive','catalog']);
 // Forged/wrong-topic messages must never dispatch refresh callbacks.
 socket.receive({topic:'realtime:lts:v1:driver:847a5fd9-d9f8-4ad3-a9ce-ba18920499f0',
  event:'broadcast',payload:{event:'changed',payload:{kind:'archive'}}});
 socket.receive({topic:'realtime:lts:v1:catalog',event:'broadcast',
  payload:{event:'changed',payload:{kind:'secret'}}});
 await wait(285);
 assert.equal(updates.length,3);
 bridge.stop();
});
test('admin joins only private admin topic; no driver archive subscriptions',async()=>{
 const {bridge,joins}=await joined('admin');
 assert.deepEqual(joins.map(x=>x.topic),['realtime:lts:v1:admin']);
 bridge.stop();
});
test('offline fallback is harmless and never opens a socket without verified token',async()=>{
 SocketMock.connections=[];
 const bridge=createLtsRealtime({config,authenticate:async()=>{throw new Error('No session')},
  onChange:()=>{throw new Error('Must not be called')},
  SocketImpl:SocketMock,visible:()=>true,online:()=>false});
 bridge.start();await wait(5);
 assert.equal(SocketMock.connections.length,0);
 bridge.stop();
 const invalid=createLtsRealtime({config:{...config,url:'ws://evil.example/socket'},
  authenticate:async()=>identity,onChange:()=>{},
  SocketImpl:SocketMock,visible:()=>true,online:()=>true});
 assert.equal(invalid.start(),false);
 invalid.stop();
});
test('backend migration has role-scoped private topics and no sensitive record payload',()=>{
 const sql=read('supabase/migrations/20261107130000_lts_realtime_private_change_hints.sql');
 const client=read('realtime-client.mjs');
 const app=read('app.mjs');
 const admin=read('amministratore/admin.mjs');
 const auth=read('account-access.mjs');
 const worker=read('sw.js');
 for(const id of ['lts_account_archives','lts_shared_maps_customers','lts_company_tariffs','lts_company_extra_rates'])
  assert.match(sql,new RegExp('on public[.]'+id));
 assert.match(sql,/on realtime[.]messages for select to authenticated/);
 assert.match(sql,/access[.]user_id = \(select auth[.]uid\(\)\)/);
 assert.match(sql,/access[.]enabled = true and access[.]removed_at is null/);
 assert.match(sql,/private is true and extension = 'broadcast'/);
 assert.match(sql,/lts:v1:driver:/);
 assert.match(sql,/lts:v1:admin/);
 assert.match(sql,/realtime[.]send\('/);
 assert.doesNotMatch(sql,/realtime[.]broadcast_changes/);
 assert.doesNotMatch(sql,/create policy .*for insert/i);
 assert.match(client,/phx_join/);
 assert.match(client,/access_token/);
 assert.match(client,/setInterval/);
 assert.match(client,/schedule\(\)/);
 assert.match(client,/queue\('ready'\)/);
 assert.match(app,/store[.]syncPending\(\)/);
 assert.match(app,/beginLtsRealtime\(\)/);
 assert.match(admin,/startAdminRealtime\(\)/);
 assert.match(admin,/adminRealtime[?][.]stop/);
 assert.match(auth,/export async function getRealtimeCredentials\(/);
 assert.match(worker,/realtime-client[.]mjs/);
 for(const path of ['index.html','shell.html','amministratore/index.html'])
  assert.match(read(path),/wss:\/\/otrqynkscpbeyuvdlgpg[.]supabase[.]co/);
});
