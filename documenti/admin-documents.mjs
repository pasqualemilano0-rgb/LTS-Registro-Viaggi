import * as account from '../account-access.mjs';
import runtime from '../runtime-config.mjs';
import * as api from './document-api.mjs';
const $=id=>document.getElementById(id);
let roster=[],offset=0,loading=false;
const months=['Gennaio','Febbraio','Marzo','Aprile','Maggio','Giugno','Luglio','Agosto','Settembre','Ottobre','Novembre','Dicembre'];
const labels={cedolino:'CEDOLINO',cu:'CU',altri:'ALTRI DOCUMENTI'};
function notice(message='',error=false){
 $('notice').textContent=message;$('notice').hidden=!message;
 $('notice').classList.toggle('error',error);
}
const MAX_PDF_SIZE=8388608;
function uploadFeedback(message='',kind='info'){
 const status=$('upload-feedback');
 status.textContent=message;status.hidden=!message;
 status.classList.toggle('error',kind==='error');
 status.classList.toggle('success',kind==='success');
}
function uploadedFilesLabel(files){
 if(!files.length)return 'Nessun PDF selezionato.';
 if(files.length===1)return 'PDF selezionato: '+files[0].name+
  ' ('+(files[0].size/1048576).toFixed(2)+' MB).';
 return files.length+' PDF selezionati: '+files.map(file=>file.name).join(', ')+'.';
}
function validateUploadFields({recipient,category,year,month,label,files}){
 if(!recipient?.documents_enabled)
  return {field:'driver',message:'Destinatario non abilitato: il caricamento è riservato a MILANO PASQUALE.'};
 if(!['cedolino','cu','altri'].includes(category))
  return {field:'category',message:'Seleziona una categoria valida.'};
 if(!Number.isInteger(Number(year))||Number(year)<2000||Number(year)>2100||String(year).trim()==='')
  return {field:'year',message:'Inserisci un anno valido (dal 2000 al 2100).'};
 if(category==='cedolino'&&!/^(?:[1-9]|1[0-2])$/.test(String(month)))
  return {field:'month',message:'Seleziona il mese del cedolino prima di caricare.'};
 if(!String(label||'').trim()||String(label).trim().length>160)
  return {field:'label',message:'Inserisci una descrizione del documento (massimo 160 caratteri).'};
 if(!files.length)
  return {field:'files',message:'Premi “Scegli file” e seleziona almeno un PDF.'};
 for(const file of files){
  if(!file||typeof file.name!=='string'||!file.name.toLowerCase().endsWith('.pdf')||
     !Number.isFinite(file.size)||file.size<10||file.size>MAX_PDF_SIZE||
     (file.type&&file.type!=='application/pdf'))
   return {field:'files',message:'Il file '+(file?.name||'selezionato')+
    ' non è valido. Utilizza PDF fino a 8 MB ciascuno.'};
 }
 return null;
}
function view(name){
 for(const id of ['login','mfa','setup','workspace'])$(id).hidden=id!==name;
}
function node(tag,cls,text){
 const n=document.createElement(tag);
 if(cls)n.className=cls;
 if(text!==undefined)n.textContent=String(text);
 return n;
}
function option(value,text){
 const e=document.createElement('option');e.value=value;e.textContent=text;return e;
}
function busy(value){
 loading=value;
 for(const b of document.querySelectorAll('button[type=submit],#refresh,#more'))b.disabled=value;
}
function protect(){
 roster=[];offset=0;$('documents').replaceChildren();$('summary').textContent='';
 $('driver').replaceChildren(option('','Seleziona autista'));
 $('filter-driver').replaceChildren(option('','Tutti gli autisti'));
 view('login');
}
async function mfa(){
 view('mfa');
 $('mfa-code').value='';$('mfa-factor').replaceChildren();
 try{
  const factors=await account.listAdminMfaFactors();
  if(!factors.length){view('setup');return;}
  for(const factor of factors)$('mfa-factor').append(option(factor.id,factor.label||'Authenticator'));
 }catch(error){notice(error.message||'Impossibile caricare la verifica MFA.',true);}
}
async function check(){
 if(!account.hasSession()){protect();return;}
 try{
  const session=await account.verifySession();
  if(session.role!=='admin'){protect();notice('È richiesto un account amministratore LTS.',true);return;}
  if(!session.mfa_enrolled){view('setup');return;}
  if(!session.mfa_verified||!account.isVerified()){await mfa();return;}
  await startWorkspace();
 }catch(error){protect();notice(error.message||'Accesso non verificato.',true);}
}
async function startWorkspace(){
 if(!account.isVerified()||account.getRole()!=='admin'){protect();return;}
 view('workspace');
 await refreshRoster();
 await refreshDocs();
}
async function refreshRoster(){
 try{
  const result=await api.drivers();
  if(!Array.isArray(result.drivers))throw Error('Elenco autisti non valido.');
  roster=result.drivers;
  const selected=$('driver').value,filter=$('filter-driver').value;
  $('driver').replaceChildren(option('','Seleziona autista'));
  $('filter-driver').replaceChildren(option('','Tutti gli autisti'));
  const eligible=roster.filter(x=>x.documents_enabled);
  // The upload picker intentionally exposes only the backend-approved pilot.
  // The archive filter still supports viewing existing records for all drivers.
  for(const driver of roster){
   if(driver.documents_enabled)
    $('driver').append(option(driver.id,driver.name+' · unico destinatario dei test'));
   $('filter-driver').append(option(driver.id,driver.name));
  }
  $('driver').value=eligible.length===1?eligible[0].id:'';
  $('filter-driver').value=roster.some(x=>x.id===filter)?filter:'';
  if(eligible.length!==1)
   notice('Nessun destinatario autorizzato al caricamento. Verifica la scadenza dei test.',true);
 }catch(error){notice(error.message||'Sincronizzazione autisti non riuscita.',true);}
}
function metadata(doc){
 const type=labels[doc.category]||doc.category;
 return type+' · '+(doc.document_month?months[doc.document_month-1]+' ':'')+doc.document_year;
}
function renderRow(doc){
 const row=node('article','document-row');
 const information=node('div');
 information.append(node('strong','',doc.label));
 const driver=roster.find(x=>x.id===doc.driver_id);
 information.append(node('small','',metadata(doc)+(driver?' · '+driver.name:'')));
 information.append(node('small','',doc.original_filename));
 const format=stamp=>new Intl.DateTimeFormat('it-IT',{dateStyle:'short',timeStyle:'short'}).format(new Date(stamp));
 const tracking=doc.state==='archived'?'Revocato: accesso al PDF disabilitato':doc.state==='draft'?'Bozza: non ancora disponibile al dipendente'
  :doc.acknowledged_at?'Messa a disposizione confermata il '+format(doc.acknowledged_at)+
    (doc.first_accessed_at?' · primo accesso PDF il '+format(doc.first_accessed_at):' · PDF non ancora aperto')
  :doc.category==='cedolino'?'Pubblicato · conferma obbligatoria prima del PDF'
  :doc.first_accessed_at?'Primo accesso PDF il '+format(doc.first_accessed_at)
  :'Pubblicato il '+(doc.published_at?format(doc.published_at):'—')+' · nessun accesso PDF registrato';
 information.append(node('small','',tracking));
 const actions=node('div','actions');
 actions.append(node('span','status '+doc.state,doc.state==='archived'?'Revocato':doc.state==='published'?'Pubblicato':'Bozza'));
 const download=node('button','outline','PDF');
 download.type='button';download.disabled=doc.state==='archived';
 download.addEventListener('click',async()=>{
  download.disabled=true;notice('');
  try{const file=await api.download(doc.id);api.savePdf(file,doc.original_filename);}
  catch(error){notice(error.message||'Impossibile aprire il PDF.',true);}
  finally{download.disabled=false;}
 });
 actions.append(download);
 if(doc.state==='draft'){
  const publish=node('button','primary','Pubblica');
  publish.type='button';
  const recipient=roster.find(x=>x.id===doc.driver_id);
  // Defense in depth: the Edge also verifies this at publication time.
  if(!recipient?.documents_enabled){
   publish.disabled=true;
   publish.title='La pubblicazione è possibile solo per gli autisti abilitati al test.';
   publish.setAttribute('aria-label','Pubblicazione non disponibile per autista non abilitato');
  }
  publish.addEventListener('click',async()=>{
   const owner=roster.find(x=>x.id===doc.driver_id);
   if(!window.confirm('Pubblicare "'+doc.label+'" per '+(owner?.name||'questo autista')+'?'))return;
   publish.disabled=true;notice('');
   try{await api.publish(doc.id);notice('Documento pubblicato per il destinatario.');await refreshDocs();}
   catch(error){notice(error.message||'Pubblicazione non riuscita.',true);}
   finally{publish.disabled=false;}
  });
  actions.append(publish);
 }
 if(doc.state==='published'){
  const revoke=node('button','outline','Revoca');revoke.type='button';
  revoke.addEventListener('click',async()=>{
   if(!window.confirm('Revocare questo documento? Non sarà più accessibile. Le conferme già registrate rimangono nello storico.'))return;
   revoke.disabled=true;notice('');
   try{await api.revoke(doc.id);await refreshDocs();notice('Documento revocato. Storico conservato.');}
   catch(error){notice(error.message||'Revoca non riuscita.',true);revoke.disabled=false;}
  });
  actions.append(revoke);
 }
 row.append(information,actions);
 return row;
}
async function refreshDocs(append=false){
 if(loading)return;
 busy(true);
 if(!append){offset=0;$('documents').replaceChildren();}
 try{
  const q={offset};
  if($('filter-driver').value)q.driverId=$('filter-driver').value;
  if($('filter-category').value)q.category=$('filter-category').value;
  const result=await api.documents(q);
  if(!Array.isArray(result.documents))throw Error('Elenco documenti non valido.');
  const rows=result.documents;
  for(const doc of rows)$('documents').append(renderRow(doc));
  offset+=rows.length;$('more').hidden=rows.length<50;
  $('summary').textContent=roster.length+' autisti sincronizzati · '+roster.filter(d=>d.documents_enabled).length+' abilitati alla ricezione durante i test · '+offset+' documenti visualizzati';
  if(!offset)$('documents').append(node('p','hint','Nessun documento in questa selezione.'));
 }catch(error){notice(error.message||'Archivio documenti non disponibile.',true);}
 finally{busy(false);}
}
$('login-form').addEventListener('submit',async event=>{
 event.preventDefault();if(loading)return;
 const form=event.currentTarget;const password=form.elements.password.value;
 form.elements.password.value='';busy(true);notice('');
 try{
  if(account.hasSession())account.signOut();
  const result=await account.login(form.elements.phone.value.trim(),password);
  if(result.role!=='admin'){account.signOut();throw Error('Accesso riservato all’amministratore.');}
  // The dedicated sign-in is complete; unblock the initial protected data loads.
  busy(false);
  await check();
 }catch(error){protect();notice(error.message||'Accesso non riuscito.',true);}
 finally{busy(false);}
});
$('mfa-form').addEventListener('submit',async event=>{
 event.preventDefault();if(loading)return;busy(true);notice('');
 try{await account.verifyAdminTotp($('mfa-code').value.trim(),$('mfa-factor').value||null);busy(false);await check();}
 catch(error){$('mfa-code').value='';notice(error.message||'Verifica MFA fallita.',true);}
 finally{busy(false);}
});
async function logout(){
 view('login');busy(true);notice('');
 try{
  const result=await account.logout();
  if(!result.revoked)notice('Sessione locale chiusa; revoca online non confermata.',true);
 }catch{account.signOut();notice('Sessione locale chiusa; revoca online da verificare.',true);}
 finally{account.signOut();protect();busy(false);}
}
$('logout').addEventListener('click',logout);
$('clear-session').addEventListener('click',logout);
$('setup-exit').addEventListener('click',logout);
$('mfa-back').addEventListener('click',()=>{protect();notice('Conferma il secondo fattore per entrare.',true);});
for(let m=1;m<=12;m++)$('month').append(option(String(m),months[m-1]));
$('year').value=String(new Date().getFullYear());
$('category').addEventListener('change',()=>{
 const isPayslip=$('category').value==='cedolino';
 $('month-wrap').hidden=!isPayslip;
 $('month').required=isPayslip;
 if(!isPayslip)$('month').value='';
});
$('month').required=true;
let descriptionEdited=false;
function suggestDocumentDescription(){
 if(descriptionEdited)return;
 const category=$('category').value,year=$('year').value,month=Number($('month').value);
 if(category==='cedolino'&&!month){$('label').value='';return;}
 const suggestion=category==='cedolino'
  ?'Cedolino '+(months[month-1]||'')+' '+year
  :category==='cu'?'CU '+year:'Documento '+year;
 $('label').value=suggestion.trim();
}
$('label').addEventListener('input',()=>{descriptionEdited=true;});
$('category').addEventListener('change',suggestDocumentDescription);
$('month').addEventListener('change',suggestDocumentDescription);
$('year').addEventListener('change',suggestDocumentDescription);
$('files').addEventListener('change',()=>{
 const chosen=Array.from($('files').files||[]);
 $('file-selection').textContent=uploadedFilesLabel(chosen);
 if(!loading)uploadFeedback('');
});
$('upload-form').addEventListener('input',()=>{if(!loading)uploadFeedback('');});
$('upload-form').addEventListener('change',()=>{if(!loading)uploadFeedback('');});
$('upload-form').addEventListener('submit',async event=>{
 event.preventDefault();
 if(loading)return;
 const chosen=Array.from($('files').files||[]);
 const selected=roster.find(x=>x.id===$('driver').value);
 const values={recipient:selected,category:$('category').value,year:$('year').value,
  month:$('month').value,label:$('label').value,files:chosen};
 const issue=validateUploadFields(values);
 if(issue){
  uploadFeedback(issue.message,'error');
  $(issue.field)?.focus();
  return;
 }
 if(!window.confirm('Caricare '+chosen.length+' PDF come BOZZE per '+selected.name+
   '? I file non verranno pubblicati automaticamente.')){
  uploadFeedback('Caricamento annullato. Nessun PDF inviato.');
  return;
 }
 busy(true);notice('');
 $('upload-form').setAttribute('aria-busy','true');
 $('upload-submit').textContent='Caricamento in corso…';
 let success=0;
 try{
  for(const file of chosen){
   uploadFeedback('Caricamento PDF '+(success+1)+' di '+chosen.length+' in corso…');
   await api.upload(file,{driverId:selected.id,category:values.category,
    year:Number(values.year),month:values.category==='cedolino'?values.month:null,
    label:values.label.trim()});
   success++;
  }
  $('files').value='';
  $('file-selection').textContent=uploadedFilesLabel([]);
  $('filter-driver').value=selected.id;
  $('filter-category').value=values.category;
  uploadFeedback(success+' PDF caricati in bozza per '+selected.name+
   '. Ora li trovi nell’archivio qui sotto: per renderli disponibili serve pubblicarli.','success');
 }catch(error){
  if(success){
   $('files').value='';
   $('file-selection').textContent=uploadedFilesLabel([]);
  }
  uploadFeedback(success+' PDF caricati. '+(error?.name==='AbortError'
   ?'Connessione scaduta: verifica l’archivio prima di riprovare.'
   :'Operazione interrotta: '+(error?.message||'errore imprevisto')),'error');
 }finally{
  busy(false);
  $('upload-form').removeAttribute('aria-busy');
  $('upload-submit').textContent='Carica in bozza, senza pubblicare';
  if(success)await refreshDocs();
 }
});
$('filter-driver').addEventListener('change',()=>void refreshDocs());
$('filter-category').addEventListener('change',()=>void refreshDocs());
$('refresh').addEventListener('click',async()=>{await refreshRoster();await refreshDocs();});
$('more').addEventListener('click',()=>void refreshDocs(true));
setInterval(()=>{
 if(document.visibilityState==='visible'&&!loading&&!$('workspace').hidden&&account.isVerified()&&account.getRole()==='admin'){
  void refreshRoster().then(()=>refreshDocs());
 }
},60000);
// Hide private metadata immediately when the browser moves to the background.
document.addEventListener('visibilitychange',()=>{
 if(document.hidden){$('workspace').inert=true;return;}
 if(!$('workspace').hidden){
  void check().finally(()=>{$('workspace').inert=false;});
 }
});

// Always display an independent payroll login, even when LTS Admin is already open.
protect();
if(typeof runtime.accountAuth?.payrollEndpoint!=='string'||!runtime.accountAuth.payrollEndpoint.trim()){
 $('login').querySelector('h1').textContent='Gestione documenti — In preparazione';
 $('login').querySelector('p').textContent='La gestione dei cedolini non è ancora attiva. Nessun documento personale può essere caricato o aperto da questa pagina.';
 $('login-form').hidden=true;
 $('clear-session').hidden=true;
}
window.addEventListener('pageshow',event=>{if(event.persisted)protect();});
