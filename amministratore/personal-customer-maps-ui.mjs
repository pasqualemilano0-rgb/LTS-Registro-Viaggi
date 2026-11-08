/** Admin edit panel: verify a personal customer using Google Maps and merge
 * into the company-wide directory only after the operator reviews the site.
 * Archived journey data is never rewritten by this client.
 */
import {readMapsCustomer} from '../maps-reader-client.mjs';
import {sharedMapsCustomers,saveSharedMapsCustomer} from '../shared-maps-client.mjs';
import {reviewPersonalCustomerCertification} from './personal-customer-certification.mjs';

function el(tag,cls,text){
 const node=document.createElement(tag);
 if(cls)node.className=cls;
 if(text!==undefined)node.textContent=String(text);
 return node;
}
const recordSignature=customer=>JSON.stringify([
 customer?.id,customer?.name,customer?.city,customer?.address,
 customer?.phone,customer?.vat
]);

export function attachPersonalCustomerCertification({
 form,customer,isActive,isUnchanged,currentCustomers,removePersonal,notice
}){
 const panel=el('section','records-certify-panel');
 panel.setAttribute('aria-label','Certifica cliente personale con Google Maps');
 const title=el('h4','records-certify-title','Certifica con Google Maps');
 const description=el('p','records-certify-description',
  'Verifica la sede con un link Google Maps. Se è già condivisa, puoi unificare il duplicato personale. Se non lo è, puoi aggiungerla al condiviso prima di rimuoverla dai personali.');
 const label=el('label','records-certify-label');
 label.append(el('span','','Link Google Maps della sede'));
 const link=document.createElement('input');
 link.type='url';link.inputMode='url';link.maxLength=4096;
 link.placeholder='https://maps.app.goo.gl/…';link.autocomplete='off';
 link.spellcheck=false;link.setAttribute('aria-label','Link Google Maps per certificare il cliente');
 // Deliberately unnamed: never sent with the standard customer edit form.
 label.append(link);
 const read=el('button','button outline records-certify-read','Verifica Google Maps');
 read.type='button';
 const status=el('p','records-certify-status','Incolla il link della sede e premi Verifica Google Maps.');
 status.setAttribute('role','status');status.setAttribute('aria-live','polite');
 const preview=el('div','records-certify-preview');preview.hidden=true;
 const siteTitle=el('strong','records-certify-site-title');
 const siteCity=el('span','records-certify-site-city');
 const siteAddress=el('span','records-certify-site-address');
 const modeText=el('p','records-certify-result');
 const warnings=el('p','records-certify-warnings');warnings.hidden=true;
 const privateWarning=el('p','records-certify-warnings');
 privateWarning.textContent=(customer.phone||customer.vat)?
  'Attenzione: telefono e partita IVA del cliente personale non saranno trasferiti nella rubrica condivisa. Il dato eliminato resta recuperabile dallo storico amministrativo.':
  'I viaggi storici e i loro importi non vengono modificati.';
 const choice=el('label','records-certify-choice');
 const checked=document.createElement('input');checked.type='checkbox';
 checked.setAttribute('aria-label','Confermo che Google Maps indica la stessa sede del cliente personale');
 choice.append(checked,el('span','',
  'Confermo che questa sede corrisponde al cliente personale selezionato e autorizzo l’unificazione.'));
 const submit=el('button','button primary records-certify-submit','Certifica e unifica');
 submit.type='button';submit.disabled=true;
 preview.append(siteTitle,siteCity,siteAddress,modeText,warnings,privateWarning,choice,submit);
 panel.append(title,description,label,read,status,preview);
 // Place alongside other edit fields, before the audit reason.
 const auditInput=form.elements.namedItem('reason');
 if(auditInput?.parentElement)form.insertBefore(panel,auditInput.parentElement);
 else form.append(panel);
 let seq=0,controller=null,disposed=false,working=false,selected=null;
 const active=()=>!disposed&&panel.isConnected&&isActive();
 const message=(value,error=false)=>{status.textContent=value;status.dataset.error=String(error);};
 const reset=()=>{
  seq++;controller?.abort();controller=null;selected=null;
  preview.hidden=true;checked.checked=false;submit.disabled=true;
 };
 const dispose=()=>{disposed=true;reset();};
 const busyControls=value=>{
  read.disabled=value;link.disabled=value;submit.disabled=value||!selected||!checked.checked;
  checked.disabled=value;
 };
 link.addEventListener('input',()=>{
  if(working)return;
  reset();
  message('Link modificato: premi Verifica Google Maps per ricontrollare la sede.');
 });
 checked.addEventListener('change',()=>{submit.disabled=working||!selected||!checked.checked;});
 read.addEventListener('click',async()=>{
  if(working||!active())return;
  if(!isUnchanged()){
   message('Salva prima le modifiche al cliente, poi riapri Modifica per certificare la sede.',true);return;
  }
  const url=link.value.trim();
  if(!url){message('Incolla un link Google Maps valido.',true);return;}
  reset();
  const stamp=seq,abort=new AbortController();controller=abort;
  working=true;busyControls(true);
  message('Verifica Google Maps e confronto con l’elenco condiviso…');
  try{
   const proposal=await readMapsCustomer(url,{signal:abort.signal});
   const shared=await sharedMapsCustomers();
   if(stamp!==seq||!active()||link.value.trim()!==url)return;
   const outcome=reviewPersonalCustomerCertification(
    customer,proposal,shared,currentCustomers());
   if(outcome.mode==='blocked'){
    message(outcome.reason,true);return;
   }
   selected={proposal,outcome,url,signature:recordSignature(customer)};
   siteTitle.textContent=proposal.name;
   siteCity.textContent=proposal.city;
   siteAddress.textContent=proposal.address;
   warnings.textContent=(proposal.warnings||[]).join(' ');
   warnings.hidden=!warnings.textContent;
   modeText.textContent=outcome.mode==='existing'
    ?'Sede già nella lista condivisa. Dopo la conferma, il cliente personale duplicato verrà rimosso.'
    :'Sede non ancora condivisa. Dopo la conferma verrà inserita nella lista condivisa e il cliente personale sarà rimosso.';
   submit.textContent=outcome.mode==='existing'
    ?'Certifica e rimuovi il duplicato'
    :'Condividi, certifica e unifica';
   checked.checked=false;preview.hidden=false;
   message('Controlla nome, località e indirizzo. Nessuna modifica è stata ancora salvata.');
  }catch(error){
   if(stamp===seq&&active()&&error?.name!=='AbortError')
    message(error?.message||'Impossibile certificare il cliente.',true);
  }finally{
   if(stamp===seq){
    working=false;busyControls(false);
   }
  }
 });
 submit.addEventListener('click',async()=>{
  if(working||!active()||!selected||!checked.checked)return;
  if(!isUnchanged()){
   message('Ci sono modifiche non salvate. Salvale prima di procedere.',true);return;
  }
  if(recordSignature(currentCustomers().find(row=>row.id===customer.id))!==selected.signature){
   message('Il cliente personale è cambiato: aggiorna l’archivio e ripeti la certificazione.',true);return;
  }
  const stamp=seq,proposal=selected.proposal;
  working=true;busyControls(true);
  let confirmedShared=false,created=false;
  message('Controllo finale dell’elenco condiviso…');
  try{
   // Mandatory second read: the company directory may change after preview.
   const shared=await sharedMapsCustomers();
   if(stamp!==seq||!active())return;
   const outcome=reviewPersonalCustomerCertification(customer,proposal,shared,currentCustomers());
   if(outcome.mode==='blocked')throw new Error(outcome.reason);
   if(outcome.mode==='new'){
    message('Aggiunta della sede verificata all’elenco condiviso…');
    const result=await saveSharedMapsCustomer(proposal.mapsUrl,{
     name:proposal.name,city:proposal.city,address:proposal.address
    });
    created=result.created;
    // A successful write may resolve to an existing row via server deduplication;
    // revalidate the returned identity, do not trust any "created" flag alone.
    const checkedSite=reviewPersonalCustomerCertification(
     customer,proposal,[result.customer],currentCustomers());
    if(checkedSite.mode!=='existing')
     throw new Error('La sede restituita dal registro aziendale non corrisponde alla sede certificata. Il cliente personale non è stato eliminato.');
   }
   confirmedShared=true;
   if(stamp!==seq||!active()||!isUnchanged())
    throw new Error('La schermata è cambiata. La sede condivisa è conservata, ma il cliente personale NON è stato eliminato.');
   if(recordSignature(currentCustomers().find(row=>row.id===customer.id))!==selected.signature)
    throw new Error('L’archivio personale è cambiato. Sede condivisa confermata, ma cliente personale non eliminato.');
   message('Sede condivisa verificata. Rimozione del solo duplicato personale in corso…');
   const done=await removePersonal(
    'Unificazione con sede aziendale certificata tramite Google Maps');
   if(done){
    notice((created?'Sede condivisa creata. ':'Sede condivisa già presente. ')+
     'Cliente personale duplicato eliminato e registrato nello storico. I viaggi non sono stati modificati.');
    return;
   }
   // The underlying CAS or permission error is shown by the records console.
   throw new Error('La sede condivisa è verificata, ma la rimozione del cliente personale non è riuscita. Aggiorna l’archivio e riprova.');
  }catch(error){
   if(stamp===seq&&active()){
    message((confirmedShared?'La sede condivisa è stata confermata. ':'')+
     (error?.message||'Operazione non completata.'),true);
   }else if(confirmedShared&&!disposed){
    notice('Sede condivisa confermata; verifica il cliente personale dopo aver aggiornato l’archivio.',true);
   }
  }finally{
   if(stamp===seq){
    working=false;busyControls(false);
   }
  }
 });
 return {dispose,panel};
}
