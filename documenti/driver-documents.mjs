import * as account from '../account-access.mjs';
import * as api from './document-api.mjs';
import * as passkey from './device-passkey.mjs';
const $=id=>document.getElementById(id);
let category='cedolino',offset=0,busy=false,deviceBusy=false,unlockTimer=null;
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
function locked(message=''){
 api.clearDeviceUnlock();
 $('content').hidden=true;$('device-gate').hidden=true;$('locked').hidden=false;
 $('documents').replaceChildren();
 if(message)note(message,true);
}
function lockArea(){
 if(unlockTimer){clearTimeout(unlockTimer);unlockTimer=null;}
 $('content').hidden=true;
 $('documents').replaceChildren();offset=0;
 const wasUnlocked=api.hasDeviceUnlock();
 if(wasUnlocked)void api.lockDocuments().catch(()=>{});
 else api.clearDeviceUnlock();
 if(!$('locked').hidden){
  $('device-gate').hidden=true;return;
 }
 $('device-gate').hidden=false;
 note('Documenti protetti: ripeti lo sblocco del dispositivo.');
}
function showDeviceGate(enrolled){
 $('locked').hidden=true;$('content').hidden=true;
 $('device-gate').hidden=false;
 $('unlock-panel').hidden=!enrolled;
 $('device-setup-form').hidden=enrolled;
 $('device-description').textContent=enrolled
  ?'Usa la passkey registrata per accedere ai documenti personali LTS.'
  :'Per la prima attivazione, registra una passkey protetta con il blocco schermo.';
}
async function authenticate(){
 if(deviceBusy)return;
 $('content').hidden=true;$('locked').hidden=true;$('device-gate').hidden=true;
 api.clearDeviceUnlock();
 try{
  if(!account.hasSession())await account.restoreDriverSession();
  const status=await account.verifySession();
  if(status.role!=='driver'||!account.isVerified()){
   locked('Accedi con un account autista.');return;
  }
  const device=await api.deviceStatus();
  if(typeof device.enrolled!=='boolean')throw Error('Verifica dispositivo non disponibile.');
  showDeviceGate(device.enrolled);
  if(!await passkey.supported())
   note('Il browser o il blocco schermo non supporta WebAuthn. Nessun documento verrà mostrato.',true);
  else note('');
 }catch(error){locked(error.message||'Verifica account non disponibile.');}
}
async function doUnlock(){
 if(deviceBusy||!$('content').hidden)return;
 deviceBusy=true;$('unlock-device').disabled=true;note('');
 try{
  const {challengeId,options}=await api.deviceUnlockOptions();
  const credential=await passkey.verifyPasskey(options);
  const result=await api.deviceUnlockVerify(challengeId,credential);
  if(!api.hasDeviceUnlock())throw Error('Sblocco non confermato.');
  if(document.visibilityState!=='visible'){lockArea();return;}
  $('device-gate').hidden=true;$('content').hidden=false;
  unlockTimer=setTimeout(()=>lockArea(),result.expiresInMs);
  await load();
 }catch(error){lockArea();note(error?.message||'Impossibile sbloccare i documenti.',true);}
 finally{deviceBusy=false;$('unlock-device').disabled=false;}
}
$('unlock-device').addEventListener('click',()=>void doUnlock());
$('device-setup-form').addEventListener('submit',async event=>{
 event.preventDefault();if(deviceBusy)return;
 deviceBusy=true;$('device-register').disabled=true;note('');
 const password=$('device-password').value;
 $('device-password').value='';
 try{
  if(!await passkey.supported())
   throw Error('Attiva impronta, Face ID o PIN del dispositivo e usa un browser compatibile.');
  const {challengeId,options}=await api.registerDeviceOptions(password);
  const credential=await passkey.createPasskey(options);
  const result=await api.registerDeviceVerify(challengeId,credential);
  if(result.registered!==true)throw Error('Registrazione della passkey non confermata.');
  showDeviceGate(true);
  note('Sblocco configurato. Premi «Sblocca con Face ID, impronta o PIN».');
 }catch(error){note(error.message||'Impossibile registrare il dispositivo.',true);}
 finally{deviceBusy=false;$('device-register').disabled=false;}
});
function display(doc){
 const row=element('article','document-row');
 const details=element('div');
 details.append(element('strong','',doc.label));
 const month=doc.document_month?months[doc.document_month-1]+' ':'';
 details.append(element('small','',month+doc.document_year+' · '+doc.original_filename));
 if(doc.category==='cedolino'){
  const when=text=>new Intl.DateTimeFormat('it-IT',{dateStyle:'short',timeStyle:'short'}).format(new Date(text));
  const receiptStatus=doc.acknowledged_at
   ?'Ricezione confermata il '+when(doc.acknowledged_at)
   :doc.first_accessed_at
    ?'Primo accesso PDF registrato il '+when(doc.first_accessed_at)
    :'Non risulta ancora un accesso al PDF';
  details.append(element('small','',receiptStatus));
 }
 const actions=element('div','actions');
 const button=element('button','outline','Scarica PDF');
 button.type='button';
 button.addEventListener('click',async()=>{
  button.disabled=true;note('');
  try{
   const file=await api.download(doc.id);
   api.savePdf(file,doc.original_filename);
   // Refresh server-side first-access timestamp. The receipt action remains optional.
   await load();
  }catch(error){note(error.message||'Download non disponibile.',true);}
  finally{button.disabled=false;}
 });
 actions.append(button);
 if(doc.category==='cedolino'&&!doc.acknowledged_at){
  const confirm=element('button','outline','Ho ricevuto il cedolino');
  confirm.type='button';confirm.disabled=!doc.first_accessed_at;
  confirm.title=doc.first_accessed_at
   ?'Conferma volontaria di ricezione; non è una firma né una prova del pagamento.'
   :'Apri prima il PDF. Non è obbligatorio confermarne la ricezione.';
  confirm.addEventListener('click',async()=>{
   if(!window.confirm('Confermo soltanto di aver ricevuto il cedolino PDF. '+
      'NON confermo il pagamento dello stipendio, né la correttezza degli importi. Proseguire?'))return;
   confirm.disabled=true;note('');
   try{
    await api.acknowledge(doc.id);
    await load();
    note('Ricezione del cedolino confermata. Non equivale alla firma o alla prova di pagamento.');
   }catch(error){note(error.message||'Conferma non registrata.',true);}
   finally{confirm.disabled=false;}
  });
  actions.append(confirm);
 }else if(doc.category==='cedolino'){
  actions.append(element('span','status published','Ricezione confermata'));
 }
 row.append(details,actions);
 return row;
}
async function load(append=false){
 if(busy||$('content').hidden)return;
 busy=true;$('refresh').disabled=true;$('more').disabled=true;
 if(!append){offset=0;$('documents').replaceChildren();}
 try{
  const filter={category,offset};
  if($('year').value)filter.year=Number($('year').value);
  const result=await api.documents(filter);
  if(!Array.isArray(result.documents))throw Error('Archivio documenti non valido.');
  for(const doc of result.documents){
   if(doc.state!=='published'||!['cedolino','cu','altri'].includes(doc.category))
    throw Error('Risposta documenti non autorizzata.');
   $('documents').append(display(doc));
  }
  offset+=result.documents.length;
  $('more').hidden=result.documents.length<50;
  if(!offset)$('documents').append(element('p','hint','Non ci sono documenti pubblicati in questa categoria.'));
  note('');
 }catch(error){note(error.message||'Impossibile aggiornare i documenti.',true);}
 finally{busy=false;$('refresh').disabled=false;$('more').disabled=false;}
}
for(const button of document.querySelectorAll('[data-category]')){
 button.addEventListener('click',()=>{
  category=button.dataset.category;
  for(const item of document.querySelectorAll('[data-category]')){
   const chosen=item===button;item.classList.toggle('selected',chosen);
   item.setAttribute('aria-pressed',String(chosen));
  }
  $('category-title').textContent=category==='cedolino'?'CEDOLINO':category==='cu'?'CU':'ALTRI DOCUMENTI';
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
 if(document.hidden){if(!deviceBusy)lockArea();}
 else if(!deviceBusy&&(!$('locked').hidden||$('device-gate').hidden===false))
   void authenticate();
});
// Never keep the PDF list exposed when navigating back to a page from BFCache.
window.addEventListener('pageshow',event=>{
 if(event.persisted&&!deviceBusy){lockArea();void authenticate();}
});
void authenticate();
