import {kilometresRequest} from '/LTS-Registro-Viaggi/kilometres-client.mjs';
import {KILOMETRES_MONTH_RULE,weekLabel,validKilometres} from '/LTS-Registro-Viaggi/shared/kilometres.mjs';
/** Mount into the existing register. Unauthorized accounts never receive the panel. */
export function mountKilometres(main,month,{request=kilometresRequest,onChange=()=>{}}={}) {
 const host=document.createElement('div');main.append(host);
 let data=null,pending=false,editing=null,requestId=null,lastPayload=null,dirty=false;
 const node=(tag,text,attrs={})=>{const e=document.createElement(tag);e.textContent=text;Object.assign(e,attrs);return e;};
 const number=n=>n.toLocaleString('it-IT');
 async function refresh(){
  if(pending||!host.isConnected)return;
  try{const next=await request('list',{month});if(!host.isConnected)return;
   data=next;if(!data.authorized){host.replaceChildren();return;}if(!editing&&!dirty)draw();
  }catch{if(host.isConnected&&data?.authorized&&!editing){const msg=host.querySelector('[role="status"]');if(msg)msg.textContent='Connessione non disponibile. Premi Aggiorna prima di inserire dati.';}}
 }
 function draw(){
  if(!data?.authorized){host.replaceChildren();return;}
  host.replaceChildren();const panel=node('section','',{className:'panel kilometres-panel'});panel.setAttribute('aria-label','CHILOMETRI');
  const heading=node('div','',{className:'kilometres-heading'});heading.append(node('h2','CHILOMETRI'),node('strong',number(data.total)+' km'));
  const status=node('p','',{className:'muted'});status.setAttribute('role','status');
  panel.append(heading,node('p','Chilometri percorsi nella settimana. Inserimento venerdì o sabato, ora italiana.'),node('p',KILOMETRES_MONTH_RULE,{className:'muted'}));
  const list=node('div','',{className:'kilometres-history'});
  for(const row of data.entries){const line=node('div','',{className:'kilometres-row'});line.append(node('span',weekLabel(row.weekStart)),node('strong',number(row.km)+' km'));
   const edit=node('button',row.editAllowed?'Modifica autorizzata':'Modifica bloccata',{type:'button',className:'secondary-button',disabled:!row.editAllowed||!data.canSubmit});
   edit.onclick=()=>{editing=row;draw();};line.append(edit);list.append(line);}
  if(!data.entries.length)list.append(node('p','Nessuna rilevazione in questo mese.'));
  panel.append(list);
  const current=data.entries.find(r=>r.weekStart===data.currentWeek);
  const mayCreate=data.currentMonth===month&&!current;
  if(editing||mayCreate){
   const form=node('form','',{className:'kilometres-form'});const label=node('label',editing?'Modifica settimana '+weekLabel(editing.weekStart):'Settimana '+weekLabel(data.currentWeek));
   const input=node('input','',{type:'number',min:'0',max:'20000',step:'1',inputMode:'numeric',required:true,value:editing?.km??'',disabled:!data.canSubmit});
   input.oninput=()=>{dirty=true;};
   input.setAttribute('aria-label','Chilometri percorsi nella settimana');label.append(input);
   const save=node('button',editing?'Salva modifica':'Salva chilometri',{type:'submit',className:'primary-button',disabled:!data.canSubmit});
   form.append(label,save);
   if(editing){const cancel=node('button','Annulla',{type:'button',className:'secondary-button'});cancel.onclick=()=>{editing=null;dirty=false;draw();};form.append(cancel);}
   form.onsubmit=async event=>{
    event.preventDefault();if(pending)return;const km=input.value.trim()===''?NaN:Number(input.value);
    if(!validKilometres(km)){status.textContent='Inserisci un numero intero da 0 a 20.000 km.';return;}
    const payload={weekStart:editing?.weekStart||data.currentWeek,km,expectedRevision:editing?.revision||0};
    const fingerprint=JSON.stringify(payload);if(fingerprint!==lastPayload){lastPayload=fingerprint;requestId=crypto.randomUUID();}
    let saved=false;pending=true;save.disabled=true;status.textContent='Salvataggio…';
    try{await request('save',{...payload,requestId});editing=null;dirty=false;lastPayload=null;requestId=null;saved=true;onChange();status.textContent='Chilometri salvati e sincronizzati.';}
    catch(error){status.textContent=error.message||'Salvataggio non confermato. Riprova: nessun duplicato verrà creato.';}
    finally{pending=false;save.disabled=false;if(saved)await refresh();}
   };panel.append(form);
  }
  if(!data.canSubmit)panel.append(node('p','Inserimento disponibile venerdì e sabato.'));
  panel.append(node('p','Per correggere una rilevazione serve l’autorizzazione dell’amministrazione.',{className:'muted'}));
  const update=node('button','Aggiorna',{type:'button',className:'secondary-button'});update.onclick=()=>{editing=null;dirty=false;void refresh();};panel.append(update,status);host.append(panel);
 }
 const timer=setInterval(()=>{if(!host.isConnected){clearInterval(timer);return;}if(document.visibilityState==='visible')void refresh();},30000);
 void refresh();return {refresh,destroy(){clearInterval(timer);host.remove();}};
}
