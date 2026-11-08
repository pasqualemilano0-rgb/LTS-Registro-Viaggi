/* LTS RC3 REAL QA ONLY: isolated RLS-protected account storage.
 * Never import this file in production pages. No service-role key exists here.
 */
const URL_QA='https://sywxretbfgwxwhvdcknq.supabase.co';
const API_KEY='sb_publishable_9UUM_QdgCtoGhKqMj2HsiA_JI1MD2yP';
const SESSION_KEY='lts-rc3-qa-auth-session';
const DB_NAME='lts-rc3-qa-sync-local';
const TABLE='lts_rc3_sandbox_register';
const $=id=>document.getElementById(id);
const currency=new Intl.NumberFormat('it-IT',{style:'currency',currency:'EUR'});
const blank=()=>({trips:[],customers:[],tariffs:[],extraRates:{}});
let session=null,remote=null,draft=null,busy=false;
function message(value,type=''){
 const el=$('status');el.textContent=value;el.className='notice'+(type?' '+type:'');
}
function connection(value,type=''){
 const el=$('connection');el.textContent=value;el.className='notice'+(type?' '+type:'');
}
function setBusy(value){
 busy=value;
 for(const id of ['login-button','signup-button','add-button','save-button','refresh-button','logout-button','discard-button'])
  $(id).disabled=value;
}
function parsePayload(input){
 const candidate=input&&typeof input==='object'&&!Array.isArray(input)?input:blank();
 return {...blank(),...candidate,trips:Array.isArray(candidate.trips)?candidate.trips:[]};
}
function createRecord(id){
 return {owner_id:id,revision:0,payload:blank(),last_request_id:null};
}
function headers(token,extra={}){
 return {'apikey':API_KEY,...(token?{Authorization:'Bearer '+token}:{}),...extra};
}
async function request(path,{method='GET',body=null,token=null,prefer=''}={}){
 const opts={method,headers:headers(token,body?{'Content-Type':'application/json'}:{})};
 if(prefer)opts.headers.Prefer=prefer;
 if(body)opts.body=JSON.stringify(body);
 let response;
 try{response=await fetch(URL_QA+path,opts);}
 catch(error){throw new Error('Connessione non disponibile. I dati locali non sono stati eliminati.');}
 const text=await response.text();
 let result=null;
 try{result=text?JSON.parse(text):null;}catch{}
 if(!response.ok){
  const error=new Error('Server QA: '+(result?.msg||result?.message||result?.error_description||'richiesta non riuscita')+' ('+response.status+').');
  error.status=response.status;throw error;
 }
 return result;
}
function openDatabase(){
 return new Promise((resolve,reject)=>{
  const req=indexedDB.open(DB_NAME,1);
  req.onupgradeneeded=()=>{
   if(!req.result.objectStoreNames.contains('outbox'))req.result.createObjectStore('outbox');
  };
  req.onsuccess=()=>resolve(req.result);
  req.onerror=()=>reject(req.error);
 });
}
async function localRead(userId){
 const db=await openDatabase();
 try{return await new Promise((resolve,reject)=>{
  const req=db.transaction('outbox','readonly').objectStore('outbox').get(userId);
  req.onsuccess=()=>resolve(req.result||null);
  req.onerror=()=>reject(req.error);
 });}
 finally{db.close();}
}
async function localWrite(userId,value){
 const db=await openDatabase();
 try{await new Promise((resolve,reject)=>{
  const req=db.transaction('outbox','readwrite').objectStore('outbox').put(value,userId);
  req.onsuccess=()=>resolve();
  req.onerror=()=>reject(req.error);
 });}
 finally{db.close();}
}
function totalAmount(payload){
 return payload.trips.reduce((sum,t)=>sum+(Number.isInteger(t.amountCents)?t.amountCents:0),0);
}
function render(){
 $('login-section').hidden=Boolean(session);
 $('workspace').hidden=!session;
 if(!session)return;
 const state=parsePayload(draft?.payload??remote?.payload);
 $('identity').textContent='Account QA autenticato: '+session.user.email;
 $('revision').textContent=remote?String(remote.revision):'—';
 $('count').textContent=String(state.trips.length);
 $('sum').textContent=currency.format(totalAmount(state)/100);
 $('trip-list').replaceChildren();
 if(!state.trips.length){
  const p=document.createElement('p');p.textContent='Nessun viaggio di prova registrato.';
  $('trip-list').append(p);
 }
 for(const trip of state.trips.slice().reverse()){
  const div=document.createElement('div');div.className='trip';
  const strong=document.createElement('strong');
  strong.textContent=trip.container+' · '+trip.client;
  const sub=document.createElement('small');
  sub.textContent=trip.date+' · '+trip.city+' · '+currency.format(trip.amountCents/100);
  div.append(strong,sub);$('trip-list').append(div);
 }
 if(draft?.pending)connection('Bozza conservata nel dispositivo. Revisione di partenza: '+draft.baseRevision+'. Non è ancora confermata sul server.','');
 else connection('Archivio QA sincronizzato con il server. Revisione '+remote.revision+'.','good');
}
async function serverRead(){
 const id=encodeURIComponent(session.user.id);
 const select='owner_id,revision,payload,last_request_id,updated_at';
 const path='/rest/v1/'+TABLE+'?select='+encodeURIComponent(select)+'&owner_id=eq.'+id;
 let rows=await request(path,{token:session.access_token});
 if(!rows.length){
  await request('/rest/v1/'+TABLE+'?on_conflict=owner_id',{
   method:'POST',token:session.access_token,
   body:createRecord(session.user.id),
   prefer:'resolution=ignore-duplicates,return=minimal'
  });
  rows=await request(path,{token:session.access_token});
 }
 if(rows.length!==1)throw new Error('Archivio QA non disponibile per questo account.');
 return {...rows[0],payload:parsePayload(rows[0].payload)};
}
async function afterAuth(data){
 if(!data?.access_token)throw new Error('Sessione QA non ottenuta.');
 const user=await request('/auth/v1/user',{token:data.access_token});
 if(!user?.id||!user?.email)throw new Error('Account QA non verificato dal server.');
 session={access_token:data.access_token,user:{id:user.id,email:user.email}};
 sessionStorage.setItem(SESSION_KEY,JSON.stringify(session));
 $('qa-password').value='';
 remote=await serverRead();
 const local=await localRead(session.user.id);
 if(local?.pending&&local?.payload)draft={
  pending:true,baseRevision:local.baseRevision,requestId:local.requestId,
  payload:parsePayload(local.payload)
 };
 else{
  draft={pending:false,baseRevision:remote.revision,payload:parsePayload(remote.payload)};
  await localWrite(session.user.id,draft);
 }
 render();message('Accesso QA verificato. Questo archivio è separato dalla produzione.','good');
}
async function enterPassword(email,password){
 return request('/auth/v1/token?grant_type=password',{
  method:'POST',body:{email,password}
 });
}
async function registerAccount(email,password){
 return request('/auth/v1/signup',{method:'POST',body:{email,password}});
}
async function pendingLocal(next){
 if(!session)throw new Error('Effettua prima l’accesso.');
 const nextDraft={
  pending:true,
  baseRevision:draft?.pending?draft.baseRevision:remote.revision,
  requestId:draft?.pending?draft.requestId:crypto.randomUUID(),
  payload:parsePayload(next)
 };
 await localWrite(session.user.id,nextDraft);
 draft=nextDraft;
 render();message('Viaggio fittizio salvato nella bozza locale.','good');
}
function isConflict(error){return error?.status===409||error?.code==='conflict';}
async function sync(){
 if(!session)throw new Error('Sessione di prova assente.');
 if(!draft?.pending){message('Non ci sono modifiche da inviare.');return;}
 const current=await serverRead();
 remote=current;
 if(current.last_request_id===draft.requestId){
  draft={pending:false,baseRevision:current.revision,payload:current.payload};
  await localWrite(session.user.id,draft);render();
  message('Invio precedente già confermato dal server QA.','good');return;
 }
 if(current.revision!==draft.baseRevision){
  render();
  const e=new Error('Conflitto di revisione: un altro dispositivo ha aggiornato l’archivio. La bozza locale è conservata; nessuna sovrascrittura automatica.');
  e.code='conflict';throw e;
 }
 const id=encodeURIComponent(session.user.id);
 const filter='?owner_id=eq.'+id+'&revision=eq.'+encodeURIComponent(draft.baseRevision)
  +'&select=revision,payload,last_request_id,updated_at';
 const rows=await request('/rest/v1/'+TABLE+filter,{
  method:'PATCH',token:session.access_token,
  body:{revision:draft.baseRevision+1,payload:draft.payload,last_request_id:draft.requestId,updated_at:new Date().toISOString()},
  prefer:'return=representation'
 });
 if(rows.length!==1){
  const fresh=await serverRead();
  if(fresh.last_request_id===draft.requestId){
   remote=fresh;
  }else{
   remote=fresh;render();
   const e=new Error('Conflitto tra due sessioni: il server non ha accettato la vecchia revisione. Bozza locale conservata.');
   e.code='conflict';throw e;
  }
 }else remote={...rows[0],payload:parsePayload(rows[0].payload)};
 draft={pending:false,baseRevision:remote.revision,payload:remote.payload};
 await localWrite(session.user.id,draft);
 render();message('Sincronizzazione reale completata. Revisione server: '+remote.revision+'.','good');
}
async function refresh(){
 if(!session)throw new Error('Effettua prima l’accesso.');
 remote=await serverRead();
 if(draft?.pending){
  render();message('Server aggiornato. La bozza locale è ancora presente: sincronizzala oppure abbandonala.','');
 }else{
  draft={pending:false,baseRevision:remote.revision,payload:remote.payload};
  await localWrite(session.user.id,draft);render();
  message('Dati riletti dal server QA.','good');
 }
}
async function withBusy(operation){
 if(busy)return;setBusy(true);
 try{await operation();}
 catch(error){message(error?.message||'Operazione non riuscita.','error');}
 finally{setBusy(false);}
}
$('login-form').addEventListener('submit',event=>{
 event.preventDefault();void withBusy(async()=>{
  const data=await enterPassword($('qa-email').value.trim(),$('qa-password').value);
  await afterAuth(data);
 });
});
$('signup-button').addEventListener('click',()=>void withBusy(async()=>{
 const data=await registerAccount($('qa-email').value.trim(),$('qa-password').value);
 if(data?.access_token)await afterAuth(data);
 else message('Account QA creato: controlla la tua email di prova per la conferma, poi accedi.','good');
}));
$('trip-form').addEventListener('submit',event=>{
 event.preventDefault();void withBusy(async()=>{
  const container=$('container').value.trim().toUpperCase();
  const client=$('client').value.trim().toUpperCase();
  const city=$('city').value.trim().toUpperCase();
  const date=$('trip-date').value;
  const amount=Number($('amount').value);
  if(!container||!client||!city||!/^\d{4}-\d{2}-\d{2}$/.test(date)||
      !Number.isFinite(amount)||amount<0||amount>999999)throw new Error('Compila tutti i campi con dati fittizi validi.');
  const payload=parsePayload(draft?.payload??remote?.payload);
  payload.trips.push({
   id:crypto.randomUUID(),date,container,client,city,
   amountCents:Math.round(amount*100),isSynthetic:true
  });
  await pendingLocal(payload);
 });
});
$('save-button').addEventListener('click',()=>void withBusy(sync));
$('refresh-button').addEventListener('click',()=>void withBusy(refresh));
$('discard-button').addEventListener('click',()=>void withBusy(async()=>{
 if(!draft?.pending){message('Nessuna bozza locale da abbandonare.');return;}
 if(!window.confirm('Abbandonare le modifiche fittizie non ancora sincronizzate?'))return;
 remote=await serverRead();
 draft={pending:false,baseRevision:remote.revision,payload:remote.payload};
 await localWrite(session.user.id,draft);
 render();message('Bozza QA abbandonata. Dati ripristinati dal server.','good');
}));
$('logout-button').addEventListener('click',()=>{
 sessionStorage.removeItem(SESSION_KEY);session=null;remote=null;draft=null;
 render();message('Uscita dal laboratorio QA. La bozza locale sintetica, se presente, resta sul dispositivo.');
});
window.addEventListener('online',()=>{
 if(session&&draft?.pending)void withBusy(sync);
});
$('trip-date').value=new Date().toISOString().slice(0,10);
(async()=>{
 try{
  const stored=JSON.parse(sessionStorage.getItem(SESSION_KEY)||'null');
  if(stored?.access_token)await afterAuth(stored);
 }catch{
  sessionStorage.removeItem(SESSION_KEY);session=null;
  render();message('Sessione scaduta. Accedi nuovamente con l’account QA.');
 }
})();
