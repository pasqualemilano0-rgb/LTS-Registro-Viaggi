/** Read-only diagnostics: never interpret HTTP reachability as login or Booking health. */
import {PORT_SOURCE_FEEDS,describePortSource} from '../shared/port-source-status.mjs';

export function summarizeReportSync(report,realtime='unknown',now=Date.now()){
 const socket=({'connected':'Realtime collegato','connecting':'Realtime in collegamento','reconnecting':'Realtime in riconnessione','offline':'Realtime offline','fallback':'Recupero tramite polling','paused':'Realtime sospeso','stopped':'Realtime fermo','unavailable':'Realtime non disponibile'})[realtime]||'Realtime non verificato';
 const checked=Date.parse(report?.reportedAt||'');
 if(!report||!Number.isFinite(checked)||checked>now+60_000)
  return {kind:'unknown',label:'Dati non verificati',detail:socket+'. Nessuna lettura aziendale verificata.',checkedAt:null};
 const age=now-checked;
 const incomplete=Number(report.incompleteArchives);
 if(report.stale===true||age>30*60_000||Number.isSafeInteger(incomplete)&&incomplete>0)
  return {kind:'warning',label:'Dati da verificare',detail:(report.stale===true?'Ultima lettura non aggiornata. ':age>30*60_000?'Ultima lettura oltre 30 minuti. ':'')+(incomplete>0?'Archivi incompleti: '+incomplete+'. ':'')+socket+'.',checkedAt:new Date(checked).toISOString()};
 return {kind:'ok',label:'Lettura aziendale recente',detail:'Ultima risposta dei report verificata. Non certifica ogni salvataggio autista. '+socket+'.',checkedAt:new Date(checked).toISOString()};
}

export function summarizePortCopies(snapshots,now=Date.now()){
 return PORT_SOURCE_FEEDS.map(feed=>{
  let value;
  try{value=describePortSource(snapshots?.[feed.id],feed,now);}
  catch{value={state:'unknown',label:'Non verificato',detail:'Fonte non verificabile.',acquiredAt:null};}
  return {id:feed.id,name:feed.label,kind:value.state==='recent'?'ok':value.state==='outdated'||value.state==='verify'?'warning':'unknown',
   label:value.label,detail:value.detail,checkedAt:value.acquiredAt};
 });
}

export function summarizeMainChecks(payload){
 const sha=payload?.sha;
 if(typeof sha!=='string'||!/^[a-f0-9]{40}$/i.test(sha)||!Array.isArray(payload.statuses))
  return {kind:'unknown',label:'CI non verificata',detail:'Risposta GitHub incompleta. Nessuna conclusione sul rilascio.',sha:null};
 const contexts=new Map();
 for(const item of payload.statuses){
  if(typeof item?.context==='string'&&item.context.startsWith('ci/circleci:')&&!contexts.has(item.context))
   contexts.set(item.context,item.state);
 }
 if(contexts.size===0)return {kind:'unknown',label:'Nessun controllo CircleCI per HEAD',detail:'Non significa che il rilascio sia riuscito.',sha:sha.slice(0,8)};
 const values=[...contexts.values()];
 const fail=values.filter(v=>v==='failure'||v==='error').length;
 const incomplete=values.filter(v=>v!=='success'&&v!=='failure'&&v!=='error').length;
 return {kind:fail?'warning':incomplete?'warning':'ok',
  label:fail?'Controlli CI falliti':incomplete?'Controlli CI incompleti':'Controlli CI superati',
  detail:values.filter(v=>v==='success').length+'/'+values.length+' job CircleCI su main. Non conferma deploy GitHub Pages, Cloudflare o Booking.',
  sha:sha.slice(0,8)};
}

export function summarizeBookingEvidence(){
 return {kind:'unknown',label:'Booking TFG non verificato',
  detail:'Serve una ricerca autenticata da un autista. La freschezza delle navi TFG non prova il funzionamento del Booking.'};
}
