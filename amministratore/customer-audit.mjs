/** Read-only UI for cross-driver customer audits. Nothing is stored on device. */
const el=id=>document.getElementById(id);
const text=(tag,value,className='')=>{
 const node=document.createElement(tag);if(className)node.className=className;
 node.textContent=String(value??'');return node;
};
const types={within:'Duplicato nello stesso archivio',cross:'Corrispondenza tra autisti',
 maps:'Abbinamento Google Maps',address:'Indirizzo da completare'};
const confidence={high:'Alta',probable:'Probabile',review:'Da verificare'};
const FIELDS=['within','cross','maps','address'];
export function setupCustomerAudit(account){
 const root=el('customer-audit'),status=el('customer-audit-status'),error=el('customer-audit-error');
 const driver=el('customer-audit-driver'),type=el('customer-audit-type'),
  trust=el('customer-audit-confidence'),search=el('customer-audit-search'),
  count=el('customer-audit-results-count'),list=el('customer-audit-results'),
  more=el('customer-audit-more'),refresh=el('customer-audit-refresh');
 let state=null,sequence=0,active=false,visible=40;
 function empty(){
  state=null;visible=40;
  driver.replaceChildren(text('option','Tutti gli autisti'));driver.firstChild.value='';
  type.value='';trust.value='';search.value='';
  for(const id of ['customer-audit-personal','customer-audit-within','customer-audit-cross',
    'customer-audit-maps','customer-audit-address'])el(id).textContent='—';
  count.textContent='';list.replaceChildren();more.hidden=true;
  status.textContent='Apri Anomalie per controllare gli archivi sincronizzati.';
  error.hidden=true;error.textContent='';
 }
 function render(){
  if(!state)return;
  const owner=driver.value,q=search.value.normalize('NFD')
   .replace(/[\u0300-\u036f]/gu,'').toLocaleLowerCase('it-IT').trim();
  const matches=state.findings.filter(item=>
    (!owner||item.driverIds.includes(owner))&&
    (!type.value||item.type===type.value)&&
    (!trust.value||item.confidence===trust.value)&&
    (!q||[item.reason,item.details,...item.driverNames,
      ...item.entries.flatMap(x=>[x.name,x.city,x.driverName])].join(' ')
       .normalize('NFD').replace(/[\u0300-\u036f]/gu,'').toLocaleLowerCase('it-IT').includes(q)));
  count.textContent=matches.length+' segnalazioni corrispondenti · '+state.summary.findings+' totali';
  list.replaceChildren();
  for(const finding of matches.slice(0,visible)){
   const card=text('article','','customer-audit-item');
   const header=text('div','','customer-audit-item-head');
   const label=text('strong',types[finding.type]||'Segnalazione');
   const badge=text('span',confidence[finding.confidence]||'Da verificare',
     'customer-audit-confidence '+(finding.confidence||'review'));
   header.append(label,badge);
   card.append(header,text('p',finding.reason,'customer-audit-reason'));
   for(const entry of finding.entries){
    card.append(text('p',(entry.driverName||'Archivio')+' · '+entry.name+' — '+entry.city,
      'customer-audit-entry'));
   }
   if(finding.details)card.append(text('p',finding.details,'customer-audit-detail'));
   list.append(card);
  }
  if(!matches.length)list.append(text('p','Nessuna segnalazione per i filtri selezionati.','customer-audit-empty'));
  more.hidden=matches.length<=visible;
  more.textContent='Mostra altre segnalazioni ('+(matches.length-visible)+')';
 }
 function setData(result){
  if(!result||result.readOnly!==true||!Array.isArray(result.findings)||
      !Array.isArray(result.drivers)||!result.summary||
      !Number.isInteger(result.summary.personalCustomers))throw Error('Controllo clienti non valido.');
  if(result.findings.some(x=>!FIELDS.includes(x.type)||!Array.isArray(x.entries)||
     !Array.isArray(x.driverIds)||!Array.isArray(x.driverNames)||
     !['high','probable','review'].includes(x.confidence)))throw Error('Segnalazioni incomplete.');
  state=result;
  driver.replaceChildren(text('option','Tutti gli autisti'));driver.firstChild.value='';
  for(const d of state.drivers){
   const option=text('option',d.name+' ('+d.count+')');option.value=d.id;driver.append(option);
  }
  el('customer-audit-personal').textContent=String(result.summary.personalCustomers);
  el('customer-audit-within').textContent=String(result.summary.duplicates);
  el('customer-audit-cross').textContent=String(result.summary.cross);
  el('customer-audit-maps').textContent=String(result.summary.maps);
  el('customer-audit-address').textContent=String(result.summary.missingAddress+result.summary.invalidAddress);
  status.textContent='Sola lettura · '+result.summary.sharedSites+
   ' sedi condivise · '+result.summary.drivers+' autisti · aggiornato '+
   new Date(result.reportedAt).toLocaleString('it-IT')+'. '+
   (result.incompleteArchives?'Attenzione: '+result.incompleteArchives+' archivi non leggibili. ':'')+
   (result.source||'Solo archivi sincronizzati.');
  render();
 }
 async function load(){
  if(!active||!account.isVerified()||account.getRole()!=='admin')return;
  const seq=++sequence;const owner=account.getAccountId();
  refresh.disabled=true;error.hidden=true;error.textContent='';
  status.textContent='Analisi delle rubriche sincronizzate in corso…';
  try{
   const data=await account.customerAudit();
   if(seq!==sequence||!active||!account.isVerified()||
      account.getAccountId()!==owner)return;
   setData(data);
  }catch(e){
   if(seq!==sequence||!active)return;
   state=null;list.replaceChildren();
   error.hidden=false;error.textContent=e?.message||'Controllo clienti non disponibile.';
   status.textContent='Controllo non disponibile: riprova quando sei online.';
  }finally{if(seq===sequence)refresh.disabled=false;}
 }
 function open(){active=true;if(!state)void load();else render();}
 function close(){active=false;sequence++;refresh.disabled=false;}
 function reset(){close();empty();}
 for(const control of [driver,type,trust,search])control.addEventListener(
  control===search?'input':'change',()=>{visible=40;render();});
 more.addEventListener('click',()=>{visible+=40;render();});
 refresh.addEventListener('click',()=>{state=null;void load();});
 empty();
 return {open,close,reset};
}
