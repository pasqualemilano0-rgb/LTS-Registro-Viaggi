import * as account from '../account-access.mjs';
import * as api from './document-api.mjs';
const $=id=>document.getElementById(id);
let roster=[],offset=0,loading=false;
const months=['Gennaio','Febbraio','Marzo','Aprile','Maggio','Giugno','Luglio','Agosto','Settembre','Ottobre','Novembre','Dicembre'];
const labels={cedolino:'CEDOLINO',cu:'CU',altri:'ALTRI DOCUMENTI'};
function notice(message='',error=false){
 $('notice').textContent=message;$('notice').hidden=!message;
 $('notice').classList.toggle('error',error);
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
  for(const driver of roster){
   $('driver').append(option(driver.id,driver.name+' · '+driver.phone));
   $('filter-driver').append(option(driver.id,driver.name));
  }
  $('driver').value=roster.some(x=>x.id===selected)?selected:'';
  $('filter-driver').value=roster.some(x=>x.id===filter)?filter:'';
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
 const tracking=doc.state==='draft'?'Bozza: non ancora disponibile al dipendente'
  :doc.acknowledged_at?'Ricezione confermata il '+format(doc.acknowledged_at)
  :doc.first_accessed_at?
    'Primo accesso PDF il '+format(doc.first_accessed_at)+
      (doc.category==='cedolino'?' · conferma facoltativa non effettuata':'')
  :'Pubblicato il '+(doc.published_at?format(doc.published_at):'—')+' · nessun accesso PDF registrato';
 information.append(node('small','',tracking));
 const actions=node('div','actions');
 actions.append(node('span','status '+doc.state,doc.state==='published'?'Pubblicato':'Bozza'));
 const download=node('button','outline','PDF');
 download.type='button';
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
  $('summary').textContent=roster.length+' autisti sincronizzati · '+offset+' documenti visualizzati';
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
 try{await account.verifyAdminTotp($('mfa-code').value.trim(),$('mfa-factor').value||null);await check();}
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
$('upload-form').addEventListener('submit',async event=>{
 event.preventDefault();if(loading)return;
 const chosen=Array.from($('files').files||[]);
 if(!chosen.length)return;
 const selected=roster.find(x=>x.id===$('driver').value);
 if(!selected){notice('Seleziona un autista valido.',true);return;}
 if(!window.confirm('Caricare '+chosen.length+' PDF come BOZZE per '+selected.name+
   '? Tutti i file saranno assegnati a questo autista, senza pubblicazione.'))return;
 busy(true);notice('');
 let success=0;
 try{
  for(const file of chosen){
   await api.upload(file,{driverId:selected.id,category:$('category').value,
    year:Number($('year').value),month:$('month').value||null,label:$('label').value.trim()});
   success++;
  }
  $('files').value='';
  notice(success+' PDF caricati in bozza per '+selected.name+'. Verifica prima di pubblicare.');
 }catch(error){notice(success+' PDF caricati; operazione interrotta: '+error.message,true);}
 finally{busy(false);await refreshDocs();}
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
// Always display an independent payroll login, even when LTS Admin is already open.
protect();
window.addEventListener('pageshow',event=>{if(event.persisted)protect();});
