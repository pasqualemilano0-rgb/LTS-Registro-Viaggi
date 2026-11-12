/** LTS private Supabase Realtime transport (Phoenix JSON protocol v1).
 * Realtime transports NO business data, only commit-triggered change hints.
 * The authenticated Edge APIs remain the only trusted data source.
 *
 * Subscriptions: driver -> own archive + company catalog; admin -> admin hints.
 * All listeners are RLS-checked by realtime.messages policy on the server.
 * Polling remains the independent recovery mechanism when this socket is down.
 */
const UUID=/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i;
const allowedKinds=new Set(['archive','catalog','roster']);
const VALID_ROLES=new Set(['admin','driver']);
const CONNECT_TIMEOUT=15000,JOIN_TIMEOUT=12000,HEARTBEAT_INTERVAL=20000,HEARTBEAT_TIMEOUT=10000;
const activeConnections=new Set();

/** Only an acknowledged private subscription with a live heartbeat can slow polling. */
export function realtimeHealthy(){
 for(const connected of activeConnections)if(connected())return true;
 return false;
}

export function createLtsRealtime({config,authenticate,onChange,
 onStatus=()=>{},SocketImpl=globalThis.WebSocket,
 visible=()=>!document.hidden,online=()=>navigator.onLine!==false}={}){
 if(typeof authenticate!=='function'||typeof onChange!=='function')
  throw new TypeError('Realtime requires authenticated session and a data refresh callback.');
 let started=false,socket=null,connecting=false,connectId=0,retryCount=0,retryTimer=null;
 let connectTimer=null,joinTimer=null,heartbeatTimer=null,heartbeatDeadline=null,rotationTimer=null,wakeTimer=null;
 let seq=0,token='',identity=null,topics=new Map(),joining=new Set(),pendingKinds=new Set();
 let lastReady=false,heartbeatConfirmed=false,heartbeatRef=null,rotationId=0;
 const enabled=Boolean(config?.enabled&&typeof SocketImpl==='function'&&
  /^sb_publishable_[A-Za-z0-9_-]+$/.test(config?.publishableKey||'')&&
  /^wss:\/\/[a-z0-9-]+[.]supabase[.]co\/realtime\/v1\/websocket$/i.test(config?.url||''));
 const isConnected=()=>Boolean(started&&lastReady&&heartbeatConfirmed&&socket?.readyState===1&&visible()&&online());
 const emit=status=>{try{onStatus(status);}catch{}};
 const clearTimers=()=>{
  for(const timer of [retryTimer,connectTimer,joinTimer,heartbeatDeadline,rotationTimer,wakeTimer])
   if(timer!==null)clearTimeout(timer);
  retryTimer=connectTimer=joinTimer=heartbeatDeadline=rotationTimer=wakeTimer=null;
  if(heartbeatTimer!==null){clearInterval(heartbeatTimer);heartbeatTimer=null;}
 };
 const drop=()=>{
  connectId++;clearTimers();
  const previous=socket;socket=null;connecting=false;joining.clear();topics.clear();
  lastReady=false;heartbeatConfirmed=false;heartbeatRef=null;rotationId=0;token='';identity=null;
  pendingKinds.clear();
  if(previous&&previous.readyState<2)try{previous.close(1000,'LTS paused');}catch{}
 };
 function queue(kind){
  if(!started||!allowedKinds.has(kind)&&kind!=='ready')return;
  pendingKinds.add(kind);
  if(wakeTimer!==null)return;
  wakeTimer=setTimeout(()=>{
   wakeTimer=null;
   const kinds=pendingKinds.has('ready')?['ready']:[...pendingKinds];pendingKinds.clear();
   if(!started||!visible()||!online())return;
   for(const current of kinds)try{Promise.resolve(onChange(current)).catch(()=>{});}catch{}
  },250);
 }
 function schedule(){
  if(!started||!enabled||!visible()||!online()||retryTimer!==null)return;
  const ceiling=Math.min(30000,1200*2**Math.min(retryCount++,5));
  const delay=Math.round(ceiling*(0.75+Math.random()*0.25));
  emit('reconnecting');
  retryTimer=setTimeout(()=>{retryTimer=null;void connect();},delay);
 }
 function fail(ws,nonce,status='offline'){
  if(nonce!==connectId||ws&&ws!==socket)return;
  drop();emit(status);schedule();
 }
 function send(ws,topic,event,payload,joinRef=null){
  if(ws.readyState!==1)return null;
  const ref=String(++seq);
  try{ws.send(JSON.stringify({topic,event,payload,ref,join_ref:event==='phx_join'?ref:joinRef}));}
  catch{return null;}
  return ref;
 }
 function markConnected(){
  if(isConnected()){retryCount=0;emit('connected');}
 }
 async function rotate(ws,sessionId){
  if(rotationId===sessionId||ws!==socket||ws.readyState!==1)return;
  rotationId=sessionId;
  rotationTimer=setTimeout(()=>fail(ws,sessionId,'unavailable'),CONNECT_TIMEOUT);
  try{
   const fresh=await authenticate();
   if(sessionId!==connectId||ws!==socket)return;
   if(fresh?.userId!==identity?.userId||fresh?.role!==identity?.role||
      !UUID.test(fresh.userId||'')||!VALID_ROLES.has(fresh.role)||
      typeof fresh.accessToken!=='string'||fresh.accessToken.length<80)throw new Error('LTS identity changed');
   if(fresh.accessToken!==token){
    token=fresh.accessToken;
    for(const [topic,joinRef] of topics)
     if(!send(ws,topic,'access_token',{access_token:token},joinRef))throw new Error('LTS socket unavailable');
   }
  }catch{fail(ws,sessionId,'unavailable');}
  finally{
   if(rotationId===sessionId){
    rotationId=0;
    if(rotationTimer!==null){clearTimeout(rotationTimer);rotationTimer=null;}
   }
  }
 }
 function heartbeat(ws,nonce){
  if(nonce!==connectId||ws!==socket||ws.readyState!==1)return;
  if(heartbeatRef!==null){fail(ws,nonce);return;}
  heartbeatRef=send(ws,'phoenix','heartbeat',{});
  if(heartbeatRef===null){fail(ws,nonce);return;}
  heartbeatDeadline=setTimeout(()=>fail(ws,nonce),HEARTBEAT_TIMEOUT);
 }
 async function connect(){
  if(!started||!enabled||!visible()||!online()||socket||connecting)return;
  const nonce=++connectId;connecting=true;
  connectTimer=setTimeout(()=>fail(null,nonce,'unavailable'),CONNECT_TIMEOUT);
  try{
   const credentials=await authenticate();
   if(!started||nonce!==connectId)return;
   if(!visible()||!online()){drop();emit('paused');return;}
   if(!UUID.test(credentials?.userId||'')||!VALID_ROLES.has(credentials?.role)||
      typeof credentials?.accessToken!=='string'||credentials.accessToken.length<80)
    throw new Error('Realtime authentication unavailable');
   identity={userId:credentials.userId,role:credentials.role};token=credentials.accessToken;
   const names=identity.role==='admin'
    ?['lts:v1:admin']:['lts:v1:driver:'+identity.userId,'lts:v1:catalog'];
   const url=new URL(config.url);
   url.searchParams.set('apikey',config.publishableKey);
   url.searchParams.set('vsn','1.0.0');
   const ws=new SocketImpl(url.toString());socket=ws;
   emit('connecting');
   ws.onopen=()=>{
    if(nonce!==connectId||socket!==ws)return;
    connecting=false;
    if(connectTimer!==null){clearTimeout(connectTimer);connectTimer=null;}
    joinTimer=setTimeout(()=>fail(ws,nonce),JOIN_TIMEOUT);
    for(const name of names){
     const topic='realtime:'+name;
     const joinRef=send(ws,topic,'phx_join',{
      config:{private:true,broadcast:{ack:false,self:false},presence:{enabled:false}},
      access_token:token
     });
     if(!joinRef){fail(ws,nonce);return;}
     topics.set(topic,joinRef);joining.add(topic);
    }
    heartbeat(ws,nonce);
    if(nonce!==connectId)return;
    heartbeatTimer=setInterval(()=>{
     heartbeat(ws,nonce);
     void rotate(ws,nonce);
    },HEARTBEAT_INTERVAL);
   };
   ws.onmessage=event=>{
    if(nonce!==connectId||ws!==socket||typeof event.data!=='string')return;
    let msg;try{msg=JSON.parse(event.data);}catch{return;}
    if(!msg||typeof msg!=='object')return;
    if(msg.topic==='phoenix'&&msg.event==='phx_reply'){
     if(heartbeatRef===null||msg.ref!==heartbeatRef||msg.join_ref!=null)return;
     if(msg.payload?.status!=='ok'){fail(ws,nonce);return;}
     heartbeatRef=null;
     if(heartbeatDeadline!==null){clearTimeout(heartbeatDeadline);heartbeatDeadline=null;}
     const firstHeartbeat=!heartbeatConfirmed;heartbeatConfirmed=true;
     if(firstHeartbeat)markConnected();
     return;
    }
    const joinRef=topics.get(msg.topic);
    if(!joinRef)return;
    if(msg.event==='phx_reply'){
     // Phoenix v1 may omit join_ref; the topic and exact request ref still bind the ACK.
     if(!joining.has(msg.topic)||msg.ref!==joinRef||msg.join_ref!=null&&msg.join_ref!==joinRef)return;
     if(msg.payload?.status!=='ok'){fail(ws,nonce);return;}
     joining.delete(msg.topic);
     if(!joining.size&&!lastReady){
      lastReady=true;
      if(joinTimer!==null){clearTimeout(joinTimer);joinTimer=null;}
      markConnected();
      queue('ready'); // Catch changes committed between initial HTTP read and join.
     }
    }else if(msg.event==='broadcast'&&msg.payload?.event==='changed'&&lastReady){
     const kind=msg.payload?.payload?.kind;
     if(allowedKinds.has(kind))queue(kind);
    }else if(msg.event==='phx_error'||msg.event==='phx_close'||
       msg.event==='system'&&msg.payload?.status==='error'){
     fail(ws,nonce);
    }
   };
   ws.onerror=()=>fail(ws,nonce,'unavailable');
   ws.onclose=()=>fail(ws,nonce);
  }catch{fail(null,nonce,'unavailable');}
 }
 function resume(){
  if(!started||!enabled)return;
  if(!visible()||!online()){drop();emit('paused');return;}
  if(!socket&&!connecting&&retryTimer===null)void connect();
 }
 function start(){
  if(started)return enabled;
  started=true;activeConnections.add(isConnected);
  if(enabled)resume();else emit('fallback');
  return enabled;
 }
 function stop(){started=false;activeConnections.delete(isConnected);drop();retryCount=0;emit('stopped');}
 return {start,stop,resume,isAvailable:()=>enabled,isConnected};
}
