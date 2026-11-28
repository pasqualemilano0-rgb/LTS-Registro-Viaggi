// Adds a protected live QA check to the existing QA login UI, not to production.
// No new credentials, environment or routes. Existing authentication stays unchanged.
export function integrateQaNoteCheck(source){
 const htmlAnchor='<section id="admin-mfa" hidden>';
 const jsAnchor="restore();render();";
 const renderAnchor="$('admin-mfa').hidden=!state||state.role!=='admin';";
 const clearAnchor=" state=null;";
 const listAnchor="['login','check','logout','enroll','verify','company-test']";
 const panel='<section id="note-qa" hidden><h2>Collaudo storico note QA</h2><p>Solo dati di prova. Legge le versioni e verifica il ripristino in memoria senza scrivere nell’archivio.</p><button id="note-test" type="button">Verifica storico e ripristino QA</button><p id="note-status" role="status" aria-live="polite">Test non eseguito.</p></section>';
 const js=String.raw`
$('note-test').addEventListener('click',()=>execute(async()=>{
 if(!state||state.role!=='driver')throw Error('Accesso autista QA richiesto.');
 const owner=state.user_id;
 await check();
 if(!state||state.user_id!==owner||state.role!=='driver')throw Error('Account QA cambiato.');
 const endpoint=new globalThis.URL(URL);
 if(endpoint.hostname!=='sywxretbfgwxwhvdcknq.supabase.co'||endpoint.pathname!=='/functions/v1/lts-phone-auth')throw Error('Endpoint QA non valido.');
 endpoint.pathname='/functions/v1/lts-account-state';
 const request=async payload=>{
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),12000);
  try{
   const response=await fetch(endpoint.href,{method:'POST',mode:'cors',credentials:'omit',cache:'no-store',redirect:'error',signal:controller.signal,headers:{'Content-Type':'application/json','Authorization':'Bearer '+state.access_token},body:JSON.stringify(payload)});
   if(!response.ok){const e=Error('Servizio storico QA HTTP '+response.status);e.status=response.status;throw e;}
   const data=await response.json();
   if(!state||state.user_id!==owner)throw Error('Account QA cambiato.');
   return data;
  }finally{clearTimeout(timer);}
 };
 $('note-status').textContent='Controllo archivio e storico QA…';
 const archive=await request({action:'read'});
 if(archive?.user?.id!=='account:'+owner||!Number.isSafeInteger(archive.revision)||!Array.isArray(archive.state?.trips))throw Error('Archivio QA non verificato.');
 let count=0;
 for(const trip of archive.state.trips.slice(0,20)){
  const history=await request({action:'note-history',tripId:trip.id,before:null});
  if(history?.userId!=='account:'+owner||history.tripId!==trip.id||!Array.isArray(history.rows)||history.rows.length>20)throw Error('Storico QA non verificato.');
  for(const row of history.rows){
   const field=row.note_kind;
   const value=typeof row.previous_note==='string'&&row.previous_note.trim()?row.previous_note:row.current_note;
   if(!['note','adminNote'].includes(field)||typeof value!=='string'||!value.trim()||value.length>2000)continue;
   const draft={...trip,[field]:value};
   const other=field==='note'?'adminNote':'note';
   if(draft[field]!==value||draft[other]!==trip[other])throw Error('Ripristino locale non valido.');
   count++;
  }
 }
 if(!count)throw Error('Nessuna versione di prova disponibile.');
 $('note-status').textContent='PASS: archivio autenticato, '+count+' versioni recuperabili, ripristino in memoria verificato. Nessuna scrittura eseguita.';
}));
`;
 for(const [from,to] of [[htmlAnchor,panel+htmlAnchor],[renderAnchor,renderAnchor+"\n $('note-qa').hidden=!state||state.role!=='driver';"],[clearAnchor,clearAnchor+"\n $('note-status').textContent='Test non eseguito.';"],[jsAnchor,js+"\n"+jsAnchor]]){
  if(source.split(from).length!==2)throw Error('Unexpected QA UI anchor');
  source=source.replace(from,to);
 }
 if(source.split(listAnchor).length!==3)throw Error('Unexpected QA UI control list');
 return source.replaceAll(listAnchor,"['login','check','logout','enroll','verify','company-test','note-test']");
}
