import * as account from '../account-access.mjs';
import runtime from '../runtime-config.mjs';
import * as api from './document-api.mjs';
const $=id=>document.getElementById(id);
// A normal href="../" creates a NEW register page and replays the truck
// splash. When Documents was opened from the LTS profile, use browser history
// to restore the existing register page (including its in-memory UI state).
// Direct links, fresh tabs and modified clicks keep the ordinary home fallback.
const openedFromProfile=new URLSearchParams(window.location.search).get('from')==='profile';
function previousEntryIsRegister(){
 try{
  // History length and a query parameter cannot establish the previous page.
  // If the browser cannot expose the entry, use the explicit ../ link.
  const navigation=window.navigation;
  const index=navigation?.currentEntry?.index;
  if(!Number.isInteger(index)||index<1)return false;
  const previous=navigation.entries().find(entry=>entry.index===index-1);
  if(!previous?.url)return false;
  const url=new URL(previous.url);
  return url.origin===window.location.origin &&
   ['/LTS-Registro-Viaggi/','/LTS-Registro-Viaggi/index.html','/LTS-Registro-Viaggi/shell.html'].includes(url.pathname);
 }catch{return false;}
}
for(const link of document.querySelectorAll('a[data-back-to-register]')){
 link.addEventListener('click',event=>{
  if(event.defaultPrevented||event.button!==0||
     event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;
  if(openedFromProfile&&window.history.length>1&&previousEntryIsRegister()) {
   event.preventDefault();
   window.history.back();
  }
 });
}
let category='cedolino',offset=0,busy=false,activePdfPreview=null;
let viewGeneration=0,listRequest=0;
const months=['Gennaio','Febbraio','Marzo','Aprile','Maggio','Giugno','Luglio','Agosto','Settembre','Ottobre','Novembre','Dicembre'];
function note(message='',error=false){
 $('notice').textContent=message;$('notice').hidden=!message;
 $('notice').classList.toggle('error',error);
}
function element(tag,cls,text){
 const el=document.createElement(tag);if(cls)el.className=cls;
 if(text!==undefined)el.textContent=String(text);
 return el;
}
// Clear sensitive content when the app is backgrounded or the account changes.
function hideDocuments(){
 viewGeneration++;listRequest++;busy=false;
 $('refresh').disabled=false;$('more').disabled=false;$('more').hidden=true;
 $('documents').setAttribute('aria-busy','false');
 closePdfPreview();
 $('content').hidden=true;
 $('documents').replaceChildren();offset=0;
}
function locked(message=''){
 hideDocuments();
 $('locked').hidden=false;
 if(message)note(message,true);
}
// A missing payroll endpoint is a permanent OFF state for this page, not an
// API error. Every re-entry (visibility/focus/BFCache/refresh) must obey it.
function payrollConfigured(){
 return typeof runtime.accountAuth?.payrollEndpoint==='string'&&
  Boolean(runtime.accountAuth.payrollEndpoint.trim());
}
function showNotConfigured(){
 hideDocuments();
 $('locked').hidden=false;
 $('locked').querySelector('h1').textContent='I MIEI DOCUMENTI — In preparazione';
 $('locked').querySelector('p').textContent='Il servizio paghe non è ancora attivo. Nessun PDF personale è disponibile da questa pagina.';
 $('locked').querySelector('a').textContent='Torna al Registro Viaggi';
 note('');
}
async function authenticate(){
 // Required even on visibilitychange/pageshow; don't open the document list.
 if(!payrollConfigured()){showNotConfigured();return;}
 hideDocuments();
 $('locked').hidden=true;
 const generation=viewGeneration;
 try{
  if(!account.hasSession())await account.restoreDriverSession();
  const status=await account.verifySession();
  if(generation!==viewGeneration||document.hidden)return;
  if(status.role!=='driver'||!account.isVerified()||account.getRole()!=='driver'){
   locked('Accedi con un account autista.');return;
  }
  $('locked').hidden=true;$('content').hidden=false;
  note('');
  await load();
 }catch(error){
  if(generation===viewGeneration)locked(error.message||'Verifica account non disponibile.');
 }
}
function closePdfPreview(){
 if(activePdfPreview?.open)activePdfPreview.close();
 activePdfPreview=null;
}
function openPdfPreview(blob,doc){
 // The PDF remains in memory only while this guarded dialog is open.
 const url=URL.createObjectURL(blob);
 const viewer=element('dialog','document-preview');
 const heading=element('h2','',doc.label||'Documento PDF');
 const help=element('p','hint','Visualizza il PDF sul telefono oppure scaricalo. Il file salvato fuori dall’app resta accessibile dal dispositivo.');
 const links=element('div','preview-actions');
 const preview=element('button','primary','Visualizza PDF');
 preview.type='button';
 const frame=element('iframe','document-pdf-frame');
 frame.hidden=true;
 frame.title='Anteprima del documento PDF';
 frame.setAttribute('sandbox','allow-downloads');
 frame.setAttribute('referrerpolicy','no-referrer');
 frame.src=url;
 preview.addEventListener('click',()=>{
  frame.hidden=false;preview.disabled=true;
 });
 const save=element('a','outline link-button','Scarica PDF');
 save.href=url;save.download=String(doc.original_filename||'LTS-documento.pdf').replace(/[^a-zA-Z0-9._-]/g,'_').slice(0,120);
 const close=element('button','text-button','Chiudi');
 close.type='button';close.addEventListener('click',()=>viewer.close());
 links.append(preview,save);
 viewer.append(heading,help,links,frame);
 viewer.append(close);
 viewer.addEventListener('close',()=>{
  URL.revokeObjectURL(url);
  viewer.remove();
  if(activePdfPreview===viewer)activePdfPreview=null;
 },{once:true});
 if(typeof viewer.showModal!=='function'){
  URL.revokeObjectURL(url);viewer.remove();
  throw Error('Anteprima PDF non supportata. Usa un browser Chrome o Safari aggiornato.');
 }
 document.body.append(viewer);
 activePdfPreview=viewer;
 viewer.showModal();
}
function display(doc){
 const row=element('article','document-row');
 const details=element('div');
 details.append(element('strong','',doc.label));
 const month=doc.document_month?months[doc.document_month-1]+' ':'';
 details.append(element('small','',month+doc.document_year+' · '+doc.original_filename));
 if(doc.category==='cedolino'){
  const when=text=>new Intl.DateTimeFormat('it-IT',{dateStyle:'short',timeStyle:'short'}).format(new Date(text));
  const receiptStatus=doc.acknowledged_at
   ?'Messa a disposizione confermata il '+when(doc.acknowledged_at)
   :'Conferma obbligatoria prima di aprire o scaricare il PDF';
  details.append(element('small','',receiptStatus));
 }
 const actions=element('div','actions');
 const button=element('button','outline','Apri PDF');
 button.type='button';
 button.addEventListener('click',async()=>{
  button.disabled=true;note('');
  try{
   const generation=viewGeneration;
   if(doc.category==='cedolino'&&!doc.acknowledged_at){
    const accepted=window.confirm(
     'Il cedolino '+(doc.label||'')+' è disponibile per il tuo account LTS. '+
     'Per aprire o scaricare il PDF devi confermare che ti è stato messo a disposizione. '+
     'La conferma NON attesta lettura, pagamento né accettazione degli importi. Confermi?'
    );
    if(!accepted)return;
    // Server records availability BEFORE any request for PDF bytes.
    await api.acknowledge(doc.id);
   }
   if(generation!==viewGeneration||document.hidden||!account.isVerified()||account.getRole()!=='driver')
    throw Error('Verifica nuovamente l’account LTS per leggere il PDF.');
   const file=await api.download(doc.id);
   if(generation!==viewGeneration||document.hidden||!account.isVerified()||account.getRole()!=='driver')
    throw Error('Verifica nuovamente l’account LTS per leggere il PDF.');
   openPdfPreview(file,doc);
   await load();
  }catch(error){note(error.message||'Documento PDF non disponibile.',true);}
  finally{button.disabled=false;}
 });
 actions.append(button);
 row.append(details,actions);
 return row;
}
function emptyCategoryState(){
 const labels={
  cedolino:'Nessun cedolino pubblicato',
  cu:'Nessuna CU pubblicata',
  altri:'Nessun documento pubblicato'
 };
 const box=element('div','empty-documents');
 const symbol=element('span','empty-documents-icon');
 symbol.setAttribute('aria-hidden','true');
 const copy=element('div','empty-documents-copy');
 copy.append(element('strong','',labels[category]||'Nessun documento pubblicato'),
  element('p','','Non ci sono documenti pubblicati in questa categoria. Quando saranno disponibili, compariranno qui.'));
 box.append(symbol,copy);
 return box;
}
async function load(append=false){
 if(!payrollConfigured()){showNotConfigured();return;}
 if($('content').hidden||document.hidden||!account.isVerified()||account.getRole()!=='driver')return;
 // Filter changes supersede an in-flight list. Pagination alone is serialized.
 if(append&&(busy||$('more').hidden))return;
 const generation=viewGeneration,request=++listRequest,owner=account.getAccountId();
 const filter={category,offset:append?offset:0};
 if($('year').value)filter.year=Number($('year').value);
 const current=()=>request===listRequest&&generation===viewGeneration&&
  !$('content').hidden&&!document.hidden&&account.isVerified()&&
  account.getRole()==='driver'&&account.getAccountId()===owner&&
  category===filter.category&&($('year').value?Number($('year').value):undefined)===filter.year;
 busy=true;$('refresh').disabled=true;$('more').disabled=true;
 $('documents').setAttribute('aria-busy','true');
 if(!append){offset=0;$('more').hidden=true;$('documents').replaceChildren();}
 note('Caricamento documenti…');
 try{
  const result=await api.documents(filter);
  if(!current())return;
  if(!Array.isArray(result.documents)||result.documents.length>50)throw Error('Archivio documenti non valido.');
  // Validate the entire page before exposing any row. A stale or unexpected
  // category/year must never be rendered under the active filter.
  for(const doc of result.documents){
   if(!doc||doc.state!=='published'||doc.category!==filter.category||
      (filter.year!==undefined&&doc.document_year!==filter.year))
    throw Error('Risposta documenti non autorizzata.');
  }
  const rows=result.documents.map(display);
  $('documents').append(...rows);
  offset+=result.documents.length;
  $('more').hidden=result.documents.length<50;
  if(!offset)$('documents').append(emptyCategoryState());
  note('');
 }catch(error){if(current())note(error.message||'Impossibile aggiornare i documenti.',true);}
 finally{
  if(request===listRequest&&generation===viewGeneration){
   busy=false;$('refresh').disabled=false;$('more').disabled=false;
   $('documents').setAttribute('aria-busy','false');
  }
 }
}
for(const button of document.querySelectorAll('[data-category]')){
 button.addEventListener('click',()=>{
  category=button.dataset.category;
  for(const item of document.querySelectorAll('[data-category]')){
   const chosen=item===button;item.classList.toggle('selected',chosen);
   item.setAttribute('aria-pressed',String(chosen));
  }
  $('category-title').textContent=category==='cedolino'?'CEDOLINO':category==='cu'?'CU':'ALTRI DOCUMENTI';
  $('cedolino-info').hidden=category!=='cedolino';
  void load();
 });
}
const current=new Date().getFullYear();
for(let year=current+1;year>=2020;year--){
 const option=document.createElement('option');
 option.value=String(year);option.textContent=String(year);$('year').append(option);
}
$('year').addEventListener('change',()=>void load());
$('refresh').addEventListener('click',()=>void load());
$('more').addEventListener('click',()=>void load(true));
document.addEventListener('visibilitychange',()=>{
 if(document.hidden)hideDocuments();
 else void authenticate();
});
window.addEventListener('lts-account-locked',()=>{
 if(!payrollConfigured())showNotConfigured();
 else locked('Sessione chiusa. Accedi nuovamente.');
});
window.addEventListener('pagehide',()=>hideDocuments());
// A restored BFCache page must recheck the account before rendering a PDF list.
window.addEventListener('pageshow',event=>{
 if(event.persisted)void authenticate();
});
// Direct open and foreground restoration share the same safe gating logic.
if(!payrollConfigured())showNotConfigured();
else void authenticate();

