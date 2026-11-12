import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {createLtsRealtime,realtimeHealthy} from '../realtime-client.mjs';

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
 const heartbeat=socket.sent.find(x=>x.event==='heartbeat');
 socket.receive({topic:'phoenix',event:'phx_reply',payload:{status:'ok'},ref:heartbeat.ref,join_ref:null});
 assert.equal(bridge.isConnected(),true);
 assert.equal(realtimeHealthy(),true);
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
 assert.equal(realtimeHealthy(),false);
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


function fakeClock(){
 let now=0,nextId=0;
 const timers=new Map();
 const add=(fn,delay,repeat)=>{const id=++nextId;timers.set(id,{fn,at:now+delay,repeat});return id;};
 const flush=async()=>{for(let count=0;count<12;count++)await Promise.resolve();};
 return {
  get now(){return now;},
  setTimeout:(fn,delay)=>add(fn,delay,0),clearTimeout:id=>timers.delete(id),
  setInterval:(fn,delay)=>add(fn,delay,delay),clearInterval:id=>timers.delete(id),
  nextDelay:()=>Math.min(...[...timers.values()].map(timer=>timer.at-now)),
  async advance(to){
   await flush();
   while(true){
    let chosen=null;
    for(const [id,timer] of timers)
     if(timer.at<=to&&(!chosen||timer.at<chosen[1].at))chosen=[id,timer];
    if(!chosen)break;
    const [id,timer]=chosen;now=timer.at;
    if(timer.repeat)timer.at+=timer.repeat;else timers.delete(id);
    timer.fn();await flush();
   }
   now=to;await flush();
  }
 };
}
function syntheticRealtime({authenticate=async()=>identity,random=0.5}={}){
 const clock=fakeClock(),updates=[],statuses=[];
 let visible=true,online=true;
 class Socket extends SocketMock {
  static connections=[];
  constructor(url){super(url);Socket.connections.push(this);this.closes=0;}
  close(){this.closes++;super.close();}
 }
 const math=Object.create(Math);math.random=()=>random;
 const context=vm.createContext({URL,Promise,Math:math,
  ...Object.fromEntries(['setTimeout','clearTimeout','setInterval','clearInterval'].map(name=>[name,clock[name]]))});
 const source=read('realtime-client.mjs').replace(/export function /g,'function ');
 vm.runInContext(source+'\nglobalThis.create=createLtsRealtime;globalThis.healthy=realtimeHealthy;',context);
 const bridge=context.create({config,authenticate,onChange:kind=>updates.push(kind),onStatus:status=>statuses.push(status),
  SocketImpl:Socket,visible:()=>visible,online:()=>online});
 const heartbeat=socket=>socket.sent.filter(item=>item.event==='heartbeat').at(-1);
 // The Phoenix v1 serializer returns topic/event/payload/ref and omits join_ref.
 const reply=(socket,item,changes={})=>socket.receive({topic:item.topic,event:'phx_reply',ref:item.ref,
  payload:{status:'ok'},...changes});
 const join=socket=>{for(const item of socket.sent.filter(item=>item.event==='phx_join'))reply(socket,item);};
 const ready=socket=>{join(socket);reply(socket,heartbeat(socket));};
 return {clock,updates,statuses,Socket,bridge,heartbeat,reply,join,ready,healthy:context.healthy,
  setVisible:value=>{visible=value;},setOnline:value=>{online=value;}};
}
test('only matching join and heartbeat acknowledgments establish a healthy private socket',async()=>{
 const h=syntheticRealtime();h.bridge.start();await h.clock.advance(0);
 const socket=h.Socket.connections[0];socket.open();
 const joins=socket.sent.filter(item=>item.event==='phx_join');
 assert.ok(joins.every(item=>item.ref===item.join_ref),'join_ref identifies the exact join');
 for(const item of joins){
  h.reply(socket,item,{ref:'unrelated'});
  h.reply(socket,item,{join_ref:'unrelated'});
 }
 assert.equal(h.bridge.isConnected(),false);
 h.join(socket);
 assert.equal(h.bridge.isConnected(),false,'join ACKs alone never slow polling');
 h.reply(socket,h.heartbeat(socket),{ref:'unrelated'});
 assert.equal(h.healthy(),false);
 h.reply(socket,h.heartbeat(socket));
 assert.equal(h.healthy(),true);
 h.reply(socket,joins[0],{ref:'unrelated',payload:{status:'error'}});
 assert.equal(h.healthy(),true,'an unrelated reply cannot close an established socket');
 socket.receive({topic:joins[0].topic,event:'broadcast',payload:{event:'changed',payload:{kind:'archive'}}});
 socket.receive({topic:joins[1].topic,event:'broadcast',payload:{event:'changed',payload:{kind:'catalog'}}});
 await h.clock.advance(250);
 assert.deepEqual(h.updates,['ready'],'ready absorbs all overlapping resource refresh hints');
 h.bridge.stop();assert.equal(h.healthy(),false);
});
test('a silent heartbeat is closed by deadline and a stale ACK cannot renew it',async()=>{
 const h=syntheticRealtime();h.bridge.start();await h.clock.advance(0);
 const socket=h.Socket.connections[0];socket.open();h.ready(socket);
 const first=h.heartbeat(socket);await h.clock.advance(20000);
 assert.notEqual(h.heartbeat(socket).ref,first.ref);
 h.reply(socket,first);
 await h.clock.advance(29999);assert.equal(h.healthy(),true);
 await h.clock.advance(30000);
 assert.equal(h.bridge.isConnected(),false);assert.equal(h.healthy(),false);
 assert.equal(socket.closes,1);
 assert.ok(h.clock.nextDelay()>=900&&h.clock.nextDelay()<=1200,'retry is jittered and bounded');
 await h.clock.advance(31200);assert.equal(h.Socket.connections.length,2);
 h.reply(socket,h.heartbeat(socket));assert.equal(h.healthy(),false,'retired socket cannot restore health');
 h.bridge.stop();
});
test('join, first heartbeat and unopened socket each have a deadline',async()=>{
 const join=syntheticRealtime();join.bridge.start();await join.clock.advance(0);
 const pendingJoin=join.Socket.connections[0];pendingJoin.open();
 join.reply(pendingJoin,join.heartbeat(pendingJoin));
 await join.clock.advance(11999);assert.equal(pendingJoin.closes,0);
 await join.clock.advance(12000);assert.equal(pendingJoin.closes,1);assert.equal(join.healthy(),false);join.bridge.stop();
 const heartbeat=syntheticRealtime();heartbeat.bridge.start();await heartbeat.clock.advance(0);
 const pendingHeartbeat=heartbeat.Socket.connections[0];pendingHeartbeat.open();heartbeat.join(pendingHeartbeat);
 await heartbeat.clock.advance(10000);assert.equal(pendingHeartbeat.closes,1);heartbeat.bridge.stop();
 const connect=syntheticRealtime();connect.bridge.start();await connect.clock.advance(0);
 const unopened=connect.Socket.connections[0];await connect.clock.advance(15000);
 assert.equal(unopened.closes,1);assert.equal(connect.healthy(),false);connect.bridge.stop();
});
test('authentication timeout permits retry and discards the old credentials',async()=>{
 const pending=[];
 const h=syntheticRealtime({authenticate:()=>new Promise(resolve=>pending.push(resolve))});
 h.bridge.start();h.bridge.resume();h.bridge.resume();await h.clock.advance(0);
 assert.equal(pending.length,1,'resume cannot duplicate an in-flight authentication');
 await h.clock.advance(16200);assert.equal(pending.length,2,'hung authentication does not block reconnection');
 pending[0](identity);await h.clock.advance(16200);
 assert.equal(h.Socket.connections.length,0,'credentials returned after timeout cannot open a socket');
 pending[1](identity);await h.clock.advance(16200);assert.equal(h.Socket.connections.length,1);
 h.bridge.stop();
});
test('socket error, offline and hidden state immediately restore fallback polling',async()=>{
 for(const mode of ['error','offline','hidden']){
  const h=syntheticRealtime();h.bridge.start();await h.clock.advance(0);
  const socket=h.Socket.connections[0];socket.open();h.ready(socket);assert.equal(h.healthy(),true);
  if(mode==='error')socket.onerror?.();
  else if(mode==='offline')h.setOnline(false);
  else h.setVisible(false);
  assert.equal(h.healthy(),false,mode);
  h.bridge.resume();assert.equal(socket.closes,1);
  h.bridge.stop();
 }
});
test('healthy idle socket acknowledges every heartbeat without reconnecting over two minutes',async()=>{
 const h=syntheticRealtime();h.bridge.start();await h.clock.advance(0);
 const socket=h.Socket.connections[0];socket.open();h.ready(socket);
 for(let time=20000;time<=120000;time+=20000){
  await h.clock.advance(time);h.reply(socket,h.heartbeat(socket));assert.equal(h.healthy(),true);
 }
 assert.equal(socket.sent.filter(item=>item.event==='heartbeat').length,7);
 assert.equal(socket.closes,0);assert.equal(h.Socket.connections.length,1);
 assert.deepEqual(h.updates,['ready']);h.bridge.stop();
});
test('failed retries back off with jitter and never exceed thirty seconds',async()=>{
 for(const random of [0,1]){
  const h=syntheticRealtime({authenticate:async()=>{throw new Error('Unavailable');},random});
  h.bridge.start();await h.clock.advance(0);
  const expected=[1200,2400,4800,9600,19200,30000,30000];
  for(const ceiling of expected){
   const delay=h.clock.nextDelay();assert.ok(delay>=ceiling*0.75&&delay<=ceiling);
   await h.clock.advance(h.clock.now+delay);
  }
  h.bridge.stop();
 }
});
test('token rotation refuses another owner or an invalid replacement token',async()=>{
 for(const replacement of [{...identity,userId:'847a5fd9-d9f8-4ad3-a9ce-ba18920499f0'},
  {...identity,accessToken:'short'}]){
  let calls=0;
  const h=syntheticRealtime({authenticate:async()=>++calls===1?identity:replacement});
  h.bridge.start();await h.clock.advance(0);const socket=h.Socket.connections[0];socket.open();h.ready(socket);
  await h.clock.advance(20000);assert.equal(h.healthy(),false);assert.equal(socket.closes,1);
  assert.equal(socket.sent.filter(item=>item.event==='access_token').length,0);h.bridge.stop();
 }
});
