/** One MFA-gated LTS diagnostic view in the existing administrator Home.
 * Strictly read-only; never send account tokens or personal data to public APIs. */
import {PORT_SOURCE_FEEDS} from '../shared/port-source-status.mjs';
import {summarizeReportSync,summarizePortCopies,summarizeMainChecks,summarizeBookingEvidence} from './unified-diagnostics-model.mjs';

const GITHUB='https://api.github.com/repos/pasqualemilano0-rgb/LTS-Registro-Viaggi/commits/main/status';
const make=(tag,cls,value)=>{const el=document.createElement(tag);if(cls)el.className=cls;if(value!==undefined)el.textContent=String(value);return el;};
const when=value=>{const n=Date.parse(value||'');return Number.isFinite(n)?new Intl.DateTimeFormat('it-IT',{timeZone:'Europe/Rome',dateStyle:'short',timeStyle:'short'}).format(n):'—';};
const empty=()=>({kind:'unknown',label:'Non verificato',detail:'Premi Verifica stato per controllare questa fonte.'});
async function jsonFrom(url){
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),10000);
 try{
  const response=await fetch(url,{method:'GET',credentials:'omit',cache:'no-store',redirect:'error',signal:controller.signal,headers:{Accept:'application/json'}});
  if(!response.ok)throw new Error('HTTP '+response.status);
  return await response.json();
 }finally{clearTimeout(timer);}
}

export function setupUnifiedDiagnostics({account,authorized=()=>false,getReport=()=>null,getRealtimeStatus=()=>null}={}){
 const dashboard=document.getElementById('dashboard');
 const home=document.getElementById('control-center-home');
 const hero=home?.querySelector('.cc-hero');
 if(!dashboard||!home||!hero)return {reset(){},setRealtimeStatus(){}};
 const panel=make('section','lts-diag','');
 panel.id='lts-unified-diagnostics';
 panel.setAttribute('aria-label','Diagnostica unica LTS');
 const header=make('div','lts-diag-head');
 const copy=make('div');copy.append(make('p','lts-diag-eyebrow','LTS · CONTROLLO OPERATIVO'),make('h2','','Diagnostica unica'));
 const refresh=make('button','button outline small','Verifica stato');refresh.type='button';refresh.id='lts-diag-refresh';
 header.append(copy,refresh);
 const note=make('p','lts-diag-intro','Fonti separate, risultati con data e nessuna conclusione automatica sul Booking o sul rilascio.');
 const status=make('p','lts-diag-status','In attesa di verifica amministrativa.');status.id='lts-diag-status';status.setAttribute('role','status');status.setAttribute('aria-live','polite');
 const cards=make('div','lts-diag-grid'),nodes=new Map();
 function card(key,title){
  const wrap=make('article','lts-diag-item');wrap.dataset.diagnostic=key;
  const heading=make('h3','',title),value=make('strong','lts-diag-value','Non verificato');
  const detail=make('p','lts-diag-detail','Dati non ancora controllati.');
  const time=make('small','lts-diag-time','—');
  wrap.append(heading,value,detail,time);cards.append(wrap);
  nodes.set(key,{wrap,value,detail,time});
 }
 card('sync','Sincronizzazione dati');
 for(const feed of PORT_SOURCE_FEEDS)card('port-'+feed.id,'Porti · '+feed.label);
 card('booking','Booking TFG');
 card('ci','Controlli CircleCI · main');
 panel.append(header,note,cards,status);
 hero.insertAdjacentElement('afterend',panel);
 let run=0,owner=null,ports=null,ci=null,realtime='unknown';
 const permitted=()=>account?.hasSession?.()===true&&account?.isVerified?.()===true&&account?.getRole?.()==='admin'&&
  authorized()&&!dashboard.hidden&&!dashboard.inert&&document.getElementById('mfa-panel')?.hidden===true&&
  document.getElementById('admin-resume-guard')?.hidden===true&&!document.hidden;
 const onHome=()=>dashboard.dataset.view==='overview'&&(!dashboard.dataset.homeSection||dashboard.dataset.homeSection==='');
 function paint(key,item){
  const el=nodes.get(key);if(!el)return;
  const value=item||empty();
  el.value.textContent=value.label;
  el.value.className='lts-diag-value lts-diag-'+(value.kind||'unknown');
  el.detail.textContent=value.detail;
  el.time.textContent=value.checkedAt?'Ultima acquisizione: '+when(value.checkedAt):
   value.sha?'Commit: '+value.sha:'—';
 }
 function render(){
  if(!permitted()){reset();return;}
  if(owner!==account.getAccountId()){owner=account.getAccountId();ports=null;ci=null;}
  paint('sync',summarizeReportSync(getReport(),realtime));
  for(const feed of summarizePortCopies(ports))paint('port-'+feed.id,ports?feed:null);
  paint('booking',summarizeBookingEvidence());
  paint('ci',ci?ci:null);
 }
 function reset(){
  run++;owner=null;ports=null;ci=null;realtime='unknown';refresh.disabled=false;
  for(const key of nodes.keys())paint(key,empty());
  status.textContent='In attesa di verifica amministrativa.';
 }
 async function check(){
  if(!permitted()){reset();return;}
  const expected=account.getAccountId(),sequence=++run;refresh.disabled=true;
  status.textContent='Verifico la sessione con MFA…';
  try{
   const session=await account.verifySession();
   if(sequence!==run||!permitted()||expected!==account.getAccountId()||
     session?.mfa_enrolled!==true||session?.mfa_verified!==true){reset();return;}
   status.textContent='Leggo solo programmi portuali pubblici e stato CI di GitHub…';
   const requests=[...PORT_SOURCE_FEEDS.map(feed=>jsonFrom('../porti/data/'+feed.file)),jsonFrom(GITHUB)];
   const responses=await Promise.allSettled(requests);
   if(sequence!==run||!permitted()||expected!==account.getAccountId())return;
   owner=expected;ports={};
   PORT_SOURCE_FEEDS.forEach((feed,i)=>{ports[feed.id]=responses[i].status==='fulfilled'?responses[i].value:null;});
   ci=responses[3].status==='fulfilled'?summarizeMainChecks(responses[3].value):null;
   render();
   const failures=responses.filter(item=>item.status!=='fulfilled').length;
   status.textContent=failures?'Verifica parziale: '+failures+' fonte/i non raggiungibile/i. Nessuno stato verde presunto.':
    'Controllo completato. I dati non provano disponibilità del Booking o pubblicazione avvenuta.';
  }catch{
   if(sequence!==run||!permitted()||expected!==account.getAccountId())return;
   ports=null;ci=null;render();status.textContent='Verifica non riuscita. Non significa che LTS sia offline.';
  }finally{if(sequence===run)refresh.disabled=false;}
 }
 refresh.addEventListener('click',()=>{void check();});
 function syncFromApp(){if(permitted()&&onHome())render();else if(!permitted())reset();}
 for(const event of ['lts-admin-data-refreshed','lts-admin-roster-refreshed'])window.addEventListener(event,syncFromApp);
 window.addEventListener('lts-account-locked',reset);
 document.addEventListener('visibilitychange',()=>{if(document.hidden)reset();else syncFromApp();});
 new MutationObserver(syncFromApp).observe(dashboard,{attributes:true,attributeFilter:['hidden','inert','data-view','data-home-section']});
 render();
 return {reset,setRealtimeStatus(value){realtime=value;syncFromApp();},refreshLocal:syncFromApp};
}
