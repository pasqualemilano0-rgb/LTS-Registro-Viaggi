/** LTS private Supabase Realtime transport (Phoenix JSON protocol v1).
 * Realtime transports NO business data, only commit-triggered change hints.
 * The authenticated Edge APIs remain the only trusted data source.
 *
 * Subscriptions: driver -> own archive + company catalog; admin -> admin hints.
 * All listeners are RLS-checked by realtime.messages policy on the server.
 * Polling remains the independent recovery mechanism when this socket is down.
 */
const UUID=/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i;
const allowedKinds=new Set(['archive','catalog']);
const VALID_ROLES=new Set(['admin','driver']);

export function createLtsRealtime({config,authenticate,onChange,
 onStatus=()=>{},SocketImpl=globalThis.WebSocket,
 visible=()=>!document.hidden,online=()=>navigator.onLine!==false}={}){
 if(typeof authenticate!=='function'||typeof onChange!=='function')
  throw new TypeError('Realtime requires authenticated session and a data refresh callback.');
 let started=false,socket=null,connectId=0,retryCount=0,retryTimer=null;
 let heartbeatTimer=null,wakeTimer=null,seq=0,token='',identity=null,topics=new Map();
 let joining=new Set(),pendingKinds=new Set(),lastReady=false,authInFlight=false;
 const enabled=Boolean(config?.enabled&&typeof SocketImpl==='function'&&
  /^sb_publishable_[A-Za-z0-9_-]+$/.test(config?.publishableKey||'')&&
  /^wss:\/\/[a-z0-9-]+[.]supabase[.]co\/realtime\/v1\/websocket$/i.test(config?.url||''));
 const emit=status=>{try{onStatus(status);}catch{}};
 const clearTimers=()=>{
  if(retryTimer!==null){clearTimeout(retryTimer);retryTimer=null;}
  if(heartbeatTimer!==null){clearInterval(heartbeatTimer);heartbeatTimer=null;}
  if(wakeTimer!==null){clearTimeout(wakeTimer);wakeTimer=null;}
 };
 const drop=()=>{
  connectId++;clearTimers();
  const previous=socket;socket=null;joining.clear();topics.clear();lastReady=false;token='';
  pendingKinds.clear();
  if(previous)try{previous.close(1000,'LTS paused');}catch{}
 };
 function queue(kind){
  if(!started||!allowedKinds.has(kind)&&kind!=='ready')return;
  pendingKinds.add(kind);
  if(wakeTimer!==null)return;
  wakeTimer=setTimeout(()=>{
   wakeTimer=null;
   if(!started||!visible())return;
   const kinds=[...pendingKinds];pendingKinds.clear();
   for(const current of kinds)try{Promise.resolve(onChange(current)).catch(()=>{});}catch{}
  },250);
 }
 function schedule(){
  if(!started||!enabled||!visible()||!online()||retryTimer!==null)return;
  const delay=Math.min(30000,1200*2**Math.min(retryCount++,5));
  emit('reconnecting');
  retryTimer=setTimeout(()=>{retryTimer=null;void connect();},delay);
 }
 function send(ws,topic,event,payload,joinRef=null){
  if(ws.readyState!==1)return null;
  const ref=String(++seq);
  ws.send(JSON.stringify({topic,event,payload,ref,join_ref:joinRef}));
  return ref;
 }
 async function rotate(ws,sessionId){
  if(authInFlight||ws!==socket||ws.readyState!==1)return;
  authInFlight=true;
  try{
   const fresh=await authenticate();
   if(sessionId!==connectId||ws!==socket)return;
   if(fresh?.userId!==identity?.userId||fresh?.role!==identity?.role||
      !UUID.test(fresh.userId||'')||!VALID_ROLES.has(fresh.role))throw new Error('LTS identity changed');
   if(fresh.accessToken!==token){
    token=fresh.accessToken;
    for(const [topic,joinRef] of topics)
     send(ws,topic,'access_token',{access_token:token},joinRef);
   }
  }catch{if(sessionId===connectId&&ws===socket)try{ws.close();}catch{}}
  finally{authInFlight=false;}
 }
 async function connect(){
  if(!started||!enabled||!visible()||!online()||socket)return;
  const nonce=++connectId;
  try{
   const credentials=await authenticate();
   if(!started||nonce!==connectId||!visible()||!online())return;
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
    for(const name of names){
     const topic='realtime:'+name;
     const joinRef=send(ws,topic,'phx_join',{
      config:{private:true,broadcast:{ack:false,self:false},presence:{enabled:false}},
      access_token:token
     });
     if(joinRef){topics.set(topic,joinRef);joining.add(topic);}
    }
    heartbeatTimer=setInterval(()=>{
     if(socket!==ws||ws.readyState!==1)return;
     send(ws,'phoenix','heartbeat',{});
     void rotate(ws,nonce);
    },20000);
   };
   ws.onmessage=event=>{
    if(nonce!==connectId||ws!==socket||typeof event.data!=='string')return;
    let msg;try{msg=JSON.parse(event.data);}catch{return;}
    if(!msg||!topics.has(msg.topic))return;
    if(msg.event==='phx_reply'){
     if(msg.payload?.status!=='ok'){try{ws.close();}catch{};return;}
     joining.delete(msg.topic);
     if(!joining.size&&!lastReady){
      lastReady=true;retryCount=0;emit('connected');
      queue('ready'); // Catch changes committed between initial HTTP read and join.
     }
    }else if(msg.event==='broadcast'&&msg.payload?.event==='changed'&&lastReady){
     const kind=msg.payload?.payload?.kind;
     if(allowedKinds.has(kind))queue(kind);
    }else if(msg.event==='phx_error'||msg.event==='phx_close'||
       msg.event==='system'&&msg.payload?.status==='error'){
     try{ws.close();}catch{}
    }
   };
   ws.onerror=()=>emit('unavailable');
   ws.onclose=()=>{
    if(ws!==socket||nonce!==connectId)return;
    socket=null;topics.clear();joining.clear();lastReady=false;token='';
    if(heartbeatTimer!==null){clearInterval(heartbeatTimer);heartbeatTimer=null;}
    emit('offline');schedule();
   };
  }catch{
   if(nonce===connectId){socket=null;emit('unavailable');schedule();}
  }
 }
 function resume(){
  if(!started||!enabled)return;
  if(!visible()||!online()){drop();emit('paused');return;}
  if(!socket&&retryTimer===null)void connect();
 }
 function start(){
  if(started)return enabled;
  started=true;
  if(enabled)resume();else emit('fallback');
  return enabled;
 }
 function stop(){started=false;drop();identity=null;retryCount=0;emit('stopped');}
 return {start,stop,resume,isAvailable:()=>enabled,isConnected:()=>lastReady};
}
