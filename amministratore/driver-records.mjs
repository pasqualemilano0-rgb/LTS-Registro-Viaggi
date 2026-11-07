/** Audited driver records console. Never stores someone else's archive in localStorage.
 * All actions need a verified admin session/MFA and a server-side revision CAS.
 */
import {SERVICES,formatMoney,toCents} from '/LTS-Registro-Viaggi/shared/domain.mjs';
const $=id=>document.getElementById(id);
const make=(tag,className='',txt='')=>{
 const e=document.createElement(tag);
 if(className)e.className=className;
 e.textContent=String(txt);
 return e;
};
const money=value=>value===null||value===undefined?'—':formatMoney(value);
const clock=value=>{
 const time=Date.parse(value||'');
 return Number.isFinite(time)?new Date(time).toLocaleString('it-IT'):'—';
};
const tabs=[
 ['trip','Viaggi'],['customer','Clienti personali'],['tariff','Tariffe personali'],
 ['extra','Servizi extra'],['history','Modifiche']
];
const categories={trip:'trips',customer:'customers',tariff:'tariffs'};
const labels={trip:'Viaggio',customer:'Cliente personale',tariff:'Tariffa personale',extra:'Servizio extra'};
const extraLabel=Object.fromEntries(SERVICES.map(x=>[x.key,x.label]));
function field(form,title,name,value='',opts={}){
 const label=make('label','records-field');
 label.append(make('span','',title));
 let el;
 if(opts.kind==='textarea'){
  el=make('textarea');el.rows=opts.rows||3;
 }else{
  el=document.createElement('input');el.type=opts.kind||'text';
  if(opts.maxLength)el.maxLength=opts.maxLength;
  if(opts.inputmode)el.inputMode=opts.inputmode;
 }
 el.name=name;
 if(el.type==='checkbox')el.checked=Boolean(value);
 else el.value=String(value??'');
 if(opts.required)el.required=true;
 if(opts.placeholder)el.placeholder=opts.placeholder;
 label.append(el);form.append(label);
 return el;
}
const euro=cents=>cents===null||cents===undefined?'':(cents/100).toFixed(2).replace('.',',');
const price=val=>{
 if(!String(val??'').trim())return null;
 return toCents(String(val));
};
export function setupDriverRecords(account){
 const panel=$('admin-records-panel'),choose=$('records-driver'),
  refresh=$('records-refresh'),status=$('records-status'),
  filter=$('records-search'),list=$('records-list'),
  editor=$('records-editor'),add=$('records-add'),counter=$('records-count'),
  tabsRoot=$('records-tabs'),cancel=$('records-cancel');
 let drivers=[],selectedId='',revision=null,state=null,audit=[],
  category='trip',busy=false,loading=false,editing=false,epoch=0,
  desiredPhone='',visibleLimit=35;
 const authorized=()=>account.isVerified()&&account.getRole()==='admin'&&
  !$('dashboard').hidden&&$('dashboard').dataset.view==='records';
 const notice=(message,problem=false)=>{
  status.textContent=message;status.classList.toggle('records-error',problem);
 };
 function clearEditor(){editor.replaceChildren();editor.hidden=true;editing=false;}
 function metrics(){
  const counts=state?
   [state.trips.length,state.customers.length,state.tariffs.length]:null;
  for(const [key,value] of [['trips',counts?.[0]],['customers',counts?.[1]],['tariffs',counts?.[2]]])
   $('records-'+key).textContent=value===null||value===undefined?'—':String(value);
  $('records-revision').textContent=revision??'—';
 }
 function reset(){
  epoch++;drivers=[];selectedId='';revision=null;state=null;audit=[];
  category='trip';busy=false;loading=false;desiredPhone='';visibleLimit=35;
  choose.replaceChildren();list.replaceChildren();clearEditor();filter.value='';
  notice('Seleziona Archivi autisti per caricare gli inserimenti sincronizzati.');
  metrics();counter.textContent='';refresh.disabled=false;add.hidden=true;
  tabsRoot.querySelectorAll('button').forEach(b=>b.classList.toggle('selected',b.dataset.kind==='trip'));
 }
 function options(){
  choose.replaceChildren();
  for(const driver of drivers){
   const opt=make('option','',driver.name+' · '+(driver.phone||'senza telefono')+
    (driver.status==='removed'?' (rimosso)':''));
   opt.value=driver.id;choose.append(opt);
  }
  if(selectedId&&drivers.some(x=>x.id===selectedId))choose.value=selectedId;
 }
 function source(){
  if(!state)return [];
  if(category==='extra')return SERVICES.map(x=>({id:x.key,name:x.label,cents:state.extraRates[x.key]}));
  if(category==='history')return audit;
  const raw=state[categories[category]]||[];
  if(category==='trip')return [...raw].sort((a,b)=>b.date.localeCompare(a.date)||
   String(b.createdAt).localeCompare(String(a.createdAt)));
  return [...raw].sort((a,b)=>(a.name||a.client||'').localeCompare(b.name||b.client||'','it'));
 }
 function matches(item,term){
  if(!term)return true;
  const text=category==='trip'?[item.client,item.city,item.container,item.date,item.note]:
   category==='customer'?[item.name,item.city,item.address,item.phone]:
   category==='tariff'?[item.client,item.city]:
   category==='extra'?[item.name]:[item.category,item.action,item.reason,item.recordId,item.at];
  return text.join(' ').toLocaleUpperCase('it-IT').includes(term);
 }
 function summary(item){
  if(category==='trip')return [item.date,item.client+' · '+item.city,
   'Container: '+item.container+' · Trasferta: '+money(item.fareCents),
   item.secondClient?'Seconda presa: '+item.secondClient+' · '+item.secondCity:'',
   item.note?'Note: '+item.note:''].filter(Boolean);
  if(category==='customer')return [item.name,item.city||'Località non indicata',
   item.address||'Indirizzo non disponibile',item.phone?'Telefono: '+item.phone:''].filter(Boolean);
  if(category==='tariff')return [item.client,item.city,'Importo personale (storico): '+money(item.cents)];
  if(category==='extra')return [item.name,'Valore: '+money(item.cents)];
  return [item.action.toUpperCase()+' · '+(labels[item.category]||item.category),
   clock(item.at)+' · '+item.recordId,
   'Revisioni: '+item.beforeRevision+' → '+item.afterRevision,
   item.reason?'Motivo: '+item.reason:''].filter(Boolean);
 }
 function render(){
  metrics();clearEditor();
  const values=source(),term=filter.value.trim().toLocaleUpperCase('it-IT');
  const matched=values.filter(item=>matches(item,term));
  list.replaceChildren();counter.textContent=matched.length+' elementi visualizzabili';
  add.hidden=!state||!['trip','customer'].includes(category);
  add.textContent=category==='trip'?'Aggiungi viaggio':'Nuovo cliente personale';
  if(!state){
   list.append(make('p','records-empty','Nessun archivio sincronizzato. Il telefono dell’autista deve effettuare il primo invio online.'));
   return;
  }
  if(!matched.length){list.append(make('p','records-empty','Nessun elemento corrisponde alla ricerca.'));return;}
  for(const item of matched.slice(0,visibleLimit)){
   const card=make('article','records-card');
   const body=make('div','records-card-text');
   const lines=summary(item);
   lines.forEach((t,i)=>body.append(make(i===0?'h3':'p',i===0?'records-card-title':'',t)));
   const actions=make('div','records-card-actions');
   if(category==='history'){
    if(item.action==='delete'){
     const btn=make('button','button outline small','Ripristina');
     btn.type='button';btn.addEventListener('click',()=>void restore(item));
     actions.append(btn);
    }
   }else{
    const edit=make('button','button outline small','Modifica');
    edit.type='button';edit.addEventListener('click',()=>openEditor(item));
    actions.append(edit);
    if(category!=='extra'){
     const remove=make('button','button outline small records-danger','Elimina');
     remove.type='button';remove.addEventListener('click',()=>void remove(item));
     actions.append(remove);
    }
   }
   card.append(body,actions);list.append(card);
  }
  if(matched.length>visibleLimit){
   const more=make('button','button outline records-more',
    'Mostra altri '+(matched.length-visibleLimit)+' elementi');
   more.type='button';more.addEventListener('click',()=>{visibleLimit+=35;render();});
   list.append(more);
  }
 }
 async function load({silent=false}={}){
  if(!authorized()||busy||loading||(silent&&editing))return false;
  const token=++epoch;loading=true;refresh.disabled=true;
  if(!silent)notice('Aggiornamento archivi degli autisti…');
  try{
   const results=await account.adminRecords('list');
   if(token!==epoch||!authorized())return false;
   if(!Array.isArray(results?.drivers))throw new Error('Elenco autisti non valido.');
   drivers=results.drivers;
   if(desiredPhone){
    selectedId=drivers.find(x=>x.phone===desiredPhone)?.id||selectedId;
    desiredPhone='';
   }
   if(!drivers.some(x=>x.id===selectedId))selectedId=drivers[0]?.id||'';
   options();
   if(selectedId)await readSelected({silent,token});
   else{state=null;revision=null;render();notice('Non ci sono archivi autisti disponibili.');}
   return true;
  }catch(error){
   if(token===epoch)notice(error?.message||'Archivi non disponibili.',true);
   return false;
  }finally{if(token===epoch){loading=false;refresh.disabled=false;}}
 }
 async function readSelected({silent=false,token=epoch}={}){
  if(!selectedId||!authorized())return;
  const id=selectedId;
  const result=await account.adminRecords('read',{driverId:id});
  if(token!==epoch||selectedId!==id||!authorized())return;
  const record=result?.archive;
  if(record!==null&&record!==undefined&&!Array.isArray(record?.state?.trips))
   throw new Error('Archivio non valido: aggiornamento interrotto.');
  const changed=!silent||revision!==record?.revision||JSON.stringify(audit)!==JSON.stringify(result.audit);
  state=record?.state||null;revision=record?.revision??null;audit=result.audit||[];
  if(changed)render();
  const driver=drivers.find(x=>x.id===id);
  notice((driver?.name||'Autista')+' · '+(record?
    'archivio sincronizzato, revisione '+revision+
    '. Ultimo salvataggio: '+clock(record.updatedAt):
    'nessun archivio online. Le modifiche saranno disponibili dopo la prima sincronizzazione.'));
 }
 async function selectDriver(){
  if(!authorized()||busy)return;
  selectedId=choose.value;revision=null;state=null;audit=[];filter.value='';
  visibleLimit=35;clearEditor();render();const token=++epoch;
  notice('Caricamento dell’archivio selezionato…');
  try{await readSelected({token});}
  catch(error){if(token===epoch)notice(error.message,true);}
 }
 function openEditor(item=null){
  if(!authorized()||busy||!state)return;
  const kind=category;
  if(!['trip','customer','tariff','extra'].includes(kind))return;
  editing=true;editor.hidden=false;editor.replaceChildren();
  const form=make('form','records-edit-form');
  const title=make('h3','',item?'Modifica '+(labels[kind]||'elemento'):
   kind==='trip'?'Aggiungi viaggio all’autista':'Nuovo cliente personale');
  form.append(title);
  const note=make('p','records-editor-note',
   'La modifica viene registrata nell’audit amministrativo e sincronizzata sul registro dell’autista.');
  form.append(note);
  const values=item||{};
  let serviceBoxes=[];
  if(kind==='trip'){
   field(form,'Data','date',values.date||new Date().toISOString().slice(0,10),{kind:'date',required:true});
   field(form,'Cliente','client',values.client||'',{required:true,maxLength:500});
   field(form,'Località','city',values.city||'',{required:true,maxLength:500});
   field(form,'Container','container',values.container||'',{required:true,maxLength:500});
   field(form,'Tariffa registrata (€)','fareCents',euro(values.fareCents),{inputmode:'decimal',
    placeholder:'Vuoto = tariffa da completare'});
   field(form,'Cliente seconda presa','secondClient',values.secondClient||'');
   field(form,'Località seconda presa','secondCity',values.secondCity||'');
   field(form,'Tariffa seconda presa (€)','secondFareCents',euro(values.secondFareCents),
    {inputmode:'decimal'});
   field(form,'Somma le due prese','sumPickupFares',values.sumPickupFares!==false,
    {kind:'checkbox'});
   const section=make('fieldset','records-services');
   section.append(make('legend','','Servizi extra del viaggio'));
   for(const srv of SERVICES){
    const row=make('div','records-service-row');
    const box=document.createElement('input');box.type='checkbox';box.name='service:'+srv.key;
    box.checked=(values.services||[]).includes(srv.key);
    const label=make('label','',srv.label);label.prepend(box);
    const rate=document.createElement('input');rate.type='text';rate.name='rate:'+srv.key;
    rate.inputMode='decimal';rate.placeholder='Importo € (facoltativo)';
    rate.value=euro(values.extraCents?.[srv.key]);
    rate.setAttribute('aria-label','Importo '+srv.label);
    row.append(label,rate);section.append(row);serviceBoxes.push({key:srv.key,box,rate});
   }
   form.append(section);
   field(form,'Note del viaggio','note',values.note||'',{kind:'textarea',maxLength:2000});
  }else if(kind==='customer'){
   field(form,'Nome cliente','name',values.name||'',{required:true,maxLength:500});
   field(form,'Località','city',values.city||'',{maxLength:500});
   field(form,'Via e indirizzo','address',values.address||'',{maxLength:1000});
   field(form,'Telefono','phone',values.phone||'',{kind:'tel',maxLength:40});
   field(form,'Partita IVA','vat',values.vat||'',{maxLength:100});
  }else if(kind==='tariff'){
   form.append(make('p','records-editor-note',
    values.client+' · '+values.city+' — tariffa personale storica, distinta dal listino comune.'));
   field(form,'Importo personale (€)','cents',euro(values.cents),
    {inputmode:'decimal',required:true});
  }else if(kind==='extra'){
   form.append(make('p','records-editor-note',values.name));
   field(form,'Importo servizio (€)','cents',euro(values.cents),
    {inputmode:'decimal',placeholder:'Vuoto = non configurato'});
  }
  field(form,'Motivo della modifica (audit)','reason','',{maxLength:500,
   placeholder:'Esempio: correzione su richiesta dell’autista'});
  const buttons=make('div','records-form-actions');
  const submit=make('button','button primary','Salva modifica');
  submit.type='submit';buttons.append(submit);
  const cancelButton=make('button','button outline','Annulla');cancelButton.type='button';
  cancelButton.addEventListener('click',clearEditor);buttons.append(cancelButton);form.append(buttons);
  form.addEventListener('submit',event=>{
   event.preventDefault();
   const input=name=>form.elements.namedItem(name);
   const patch={};
   try{
    if(kind==='trip'){
     for(const field of ['date','client','city','container','secondClient','secondCity','note'])
      patch[field]=input(field).value;
     patch.fareCents=price(input('fareCents').value);
     patch.secondFareCents=price(input('secondFareCents').value);
     patch.sumPickupFares=input('sumPickupFares').checked;
     patch.services=serviceBoxes.filter(x=>x.box.checked).map(x=>x.key);
     patch.extraCents=Object.fromEntries(serviceBoxes.map(x=>[x.key,price(x.rate.value)]));
    }else if(kind==='customer'){
     for(const field of ['name','city','address','phone','vat'])patch[field]=input(field).value;
    }else patch.cents=price(input('cents').value);
    if(kind==='tariff'&&patch.cents===null)throw new Error('Inserisci un importo.');
   }catch(error){notice(error.message,true);return;}
   void mutate({operation:item?'update':'create',category:kind,
    recordId:item?.id||crypto.randomUUID(),patch,reason:input('reason').value});
  });
  editor.append(form);editor.scrollIntoView({block:'start',behavior:'smooth'});
  form.querySelector('input:not([type=checkbox])')?.focus({preventScroll:true});
 }
 async function mutate({operation,category:kind,recordId,patch={},reason='',auditId=null}){
  if(busy||!authorized()||!state||revision===null)return false;
  busy=true;refresh.disabled=true;
  editor.querySelectorAll('button,input,textarea').forEach(x=>x.disabled=true);
  notice('Registrazione della modifica in corso…');
  try{
   const r=await account.adminRecords('mutate',{
    driverId:selectedId,expectedRevision:revision,requestId:crypto.randomUUID(),
    operation,category:kind,recordId,patch,reason,...(auditId?{auditId}:{})
   });
   if(!Number.isSafeInteger(r?.revision)||!r?.state||!Array.isArray(r.audit))
    throw new Error('Salvataggio non confermato: aggiorna il registro.');
   revision=r.revision;state=r.state;audit=r.audit;
   render();notice('Modifica registrata e sincronizzata. Revisione '+revision+
    '. Lo storico precedente è conservato nell’audit.');
   return true;
  }catch(error){
   notice(error?.message||'Salvataggio non riuscito.',true);
   editor.querySelectorAll('button,input,textarea').forEach(x=>x.disabled=false);
   // Never replace the user's edited form after a 409 conflict.
   return false;
  }finally{busy=false;refresh.disabled=false;}
 }
 async function remove(item){
  if(!authorized())return;
  const name=summary(item)[0];
  if(!window.confirm('Eliminare '+(labels[category]||'elemento')+' · '+name+
   '? La rimozione verrà tracciata e potrà essere ripristinata. I viaggi storici non vengono cancellati quando elimini un cliente.'))return;
  const reason=window.prompt('Motivo della rimozione (almeno 8 caratteri):','');
  if(reason===null)return;
  if(reason.trim().length<8){notice('Inserisci almeno 8 caratteri per motivare la rimozione.',true);return;}
  await mutate({operation:'delete',category,recordId:item.id,reason:reason.trim()});
 }
 async function restore(entry){
  if(!authorized()||!window.confirm('Ripristinare questo elemento dall’audit? Non verranno sovrascritti eventuali elementi con lo stesso ID.'))return;
  await mutate({operation:'restore',category:entry.category,
   recordId:entry.recordId,auditId:entry.id,reason:'Ripristino da storico amministrativo'});
 }
 function setCategory(next){
  if(!tabs.some(x=>x[0]===next))return;
  category=next;filter.value='';visibleLimit=35;
  tabsRoot.querySelectorAll('button').forEach(b=>{
   const selected=b.dataset.kind===category;
   b.classList.toggle('selected',selected);b.setAttribute('aria-pressed',String(selected));
  });
  render();
 }
 function openForPhone(phone){
  desiredPhone=phone;selectedId='';void load();
 }
 choose.addEventListener('change',()=>void selectDriver());
 refresh.addEventListener('click',()=>void load());
 filter.addEventListener('input',()=>{visibleLimit=35;render();});
 add.addEventListener('click',()=>openEditor());
 cancel.addEventListener('click',clearEditor);
 for(const [key,label] of tabs){
  const b=make('button','records-tab'+(key===category?' selected':''),label);
  b.type='button';b.dataset.kind=key;b.setAttribute('aria-pressed',String(key===category));
  b.addEventListener('click',()=>setCategory(key));tabsRoot.append(b);
 }
 reset();
 return {load,reset,openForPhone,refreshActive(){
  if(busy||loading||editing||document.activeElement?.matches?.('input,select,textarea'))return false;
  void load({silent:true});return true;
 }};
}
