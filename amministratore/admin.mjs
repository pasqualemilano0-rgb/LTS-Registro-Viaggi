import * as account from '../account-access.mjs?v=20261107-realtime-v1';
import realtimeConfig from '../runtime-config.mjs';
import {createLtsRealtime} from '../realtime-client.mjs';
import {STATUS_LABELS,driverSummary,filterDrivers} from './model.mjs';
import {setupReport} from './report.mjs?v=20261107-driver-customer-picker-v1';
import {rememberPosition,readPosition,clearPosition} from './admin-position.mjs';

const byId=id=>document.getElementById(id);
const loginPanel=byId('login-panel'), dashboard=byId('dashboard');
const loginError=byId('login-error'),listError=byId('list-error');
let drivers=[],busy=false,mfaFactorId=null,mfaMode='login';
let resumingDashboard=false;
function rememberAdminPosition(){
 if(dashboard.hidden||!account.isVerified()||account.getRole()!=='admin')return;
 rememberPosition(account.getAccountId(),dashboard.dataset.view,window.scrollX,window.scrollY);
}
function readAdminPosition(){
 if(!account.isVerified()||account.getRole()!=='admin')return null;
 return readPosition(account.getAccountId());
}
function clearAdminPosition(){clearPosition();}
function restoreAdminPosition(saved){
 if(!saved)return;
 requestAnimationFrame(()=>requestAnimationFrame(()=>{
  if(dashboard.hidden||!account.isVerified()||account.getRole()!=='admin'||
     account.getAccountId()!==saved.owner||dashboard.dataset.view!==saved.view)return;
  window.scrollTo({left:saved.x,top:saved.y,behavior:'instant'});
 }));
}
const companyView=setupReport(account);
let adminRealtime=null;
function startAdminRealtime(){
 if(!account.isVerified()||account.getRole()!=='admin'||dashboard.hidden||
    typeof account.getRealtimeCredentials!=='function')return;
 adminRealtime?.stop();
 adminRealtime=createLtsRealtime({
  config:realtimeConfig.realtime,authenticate:account.getRealtimeCredentials,
  onChange:()=>{
   if(dashboard.hidden||document.hidden||!account.isVerified()||
      account.getRole()!=='admin'||resumingDashboard)return;
   if(dashboard.dataset.view==='drivers'){
    if(!document.activeElement?.matches?.('input:not([type=hidden]),textarea,select'))
     void loadDrivers({silent:true});
   }else companyView.refreshActive();
  }
 });
 adminRealtime.start();
}

const errorText=(error,fallback)=>error?.message||fallback;
function inform(message,bad=false){
 const node=byId('notice');node.textContent=message;node.hidden=!message;node.classList.toggle('danger',bad);
}
function setError(node,message){node.textContent=message||'';node.hidden=!message;}
function make(tag,className='',text=''){
 const node=document.createElement(tag);
 if(className)node.className=className;
 node.textContent=text;
 return node;
}
function hideCode(){
 byId('secret-code').value='';
 byId('secret-panel').hidden=true;
}
function clearMfa(){
 mfaFactorId=null;mfaMode='login';
 byId('mfa-code').value='';byId('mfa-secret').textContent='';
 byId('mfa-qr').removeAttribute('src');byId('mfa-qr').hidden=true;
 byId('mfa-setup-secret').hidden=true;
 byId('mfa-factor-choice').replaceChildren();
 byId('mfa-factor-choice-wrap').hidden=true;
 setError(byId('mfa-error'),'');
}
function showMfaPanel(setup=false,resumed=false,purpose='primary'){
 adminRealtime?.stop();
 if(!setup)clearMfa();
 mfaMode=setup?(purpose==='backup'?'backup':'setup'):'login';
 const backup=mfaMode==='backup';
 loginPanel.hidden=true;dashboard.hidden=true;byId('mfa-panel').hidden=false;
 byId('logout').hidden=false;
 byId('mfa-title').textContent=backup?'Configura Authenticator di riserva':'Verifica a due fattori';
 byId('mfa-cancel').textContent=setup?'Annulla configurazione':'Torna all’accesso';
 byId('mfa-instructions').textContent=resumed
  ?(backup?'Configurazione della riserva recuperata: inserisci il codice del secondo Authenticator già associato.':
    'Configurazione recuperata: inserisci il codice LTS già aggiunto alla tua app Authenticator. Non generare un nuovo QR.')
  :backup
  ?'Aggiungi questa chiave a un dispositivo DIFFERENTE dal telefono principale, poi conferma il codice temporaneo.'
  :setup
  ?'Collega un’app Authenticator e inserisci il suo codice di sei cifre per attivare la protezione.'
  :'Apri la tua app Authenticator e inserisci il codice temporaneo a sei cifre.';
 byId('mfa-setup-secret').hidden=!setup||resumed;
 byId('mfa-resume-help').hidden=!resumed;
 byId('mfa-factor-choice-wrap').hidden=true;
 if(resumed)byId('mfa-cancel').textContent='Annulla e genera un nuovo QR';
 byId('mfa-code').focus();
}
async function loadLoginFactors(){
 const user=account.getAccountId();
 try{
  const factors=await account.listAdminMfaFactors();
  if(user!==account.getAccountId()||mfaMode!=='login'||byId('mfa-panel').hidden)return;
  const field=byId('mfa-factor-choice');field.replaceChildren();
  for(const item of factors){
   const option=make('option','',item.label);
   option.value=item.id;field.append(option);
  }
  byId('mfa-factor-choice-wrap').hidden=factors.length<2;
  if(!factors.length)setError(byId('mfa-error'),'Nessun Authenticator verificato disponibile.');
 }catch(error){setError(byId('mfa-error'),errorText(error,'Impossibile elencare gli Authenticator.'));}
}
async function loadBackupFactors(){
 if(!account.isVerified()||account.getRole()!=='admin')return;
 const user=account.getAccountId();
 const button=byId('mfa-backup-start');button.hidden=true;
 try{
  const factors=await account.listAdminMfaFactors();
  if(account.getAccountId()!==user||dashboard.hidden)return;
  const hasBackup=factors.some(f=>f.label==='Authenticator di riserva');
  byId('mfa-backup-status').textContent=hasBackup
    ?'Authenticator di riserva verificato e pronto. Potrai selezionarlo alla prossima verifica di accesso.'
    :'È presente solo l’Authenticator principale. Registra quello di riserva su un altro dispositivo.';
  button.hidden=hasBackup;
 }catch(error){byId('mfa-backup-status').textContent=errorText(error,'Stato backup non disponibile. Riprova online.');}
}
function lock(message='Accedi come amministratore per continuare.'){
 adminRealtime?.stop();adminRealtime=null;
 clearAdminPosition();
 drivers=[];companyView.reset();clearMfa();
 byId('roster').replaceChildren();hideCode();
 byId('mfa-panel').hidden=true;
 dashboard.hidden=true;loginPanel.hidden=false;byId('logout').hidden=true;
 setError(listError,'');
 inform(message,Boolean(message));
}
function showDashboard(status={}){
 const previousPosition=readAdminPosition();
 companyView.reset();clearMfa();byId('mfa-panel').hidden=true;
 byId('mfa-warning').hidden=status.mfa_enrolled===true;
 byId('mfa-backup-card').hidden=!(status.mfa_enrolled&&status.mfa_verified);
 loginPanel.hidden=true;dashboard.hidden=false;byId('logout').hidden=false;
 setError(loginError,'');inform('');
 companyView.open(previousPosition?.view||
  (status.mfa_enrolled===true&&status.mfa_verified===true?'overview':'security'));
 startAdminRealtime();
 return previousPosition;
}
async function authenticate(){
 if(!account.hasSession()){lock('');return;}
 try{
   const status=await account.verifySession();
   if(account.getRole()!=='admin'){
     account.signOut();
     lock('Questo account non è autorizzato come amministratore.');
     return;
   }
   if(status.mfa_enrolled&&!status.mfa_verified){
     showMfaPanel();
     await loadLoginFactors();
     return;
   }
   const pending=account.pendingAdminMfaInfo();
   if(pending&&((pending.purpose==='primary'&&!status.mfa_enrolled)||
      (pending.purpose==='backup'&&status.mfa_enrolled&&status.mfa_verified))){
     mfaFactorId=pending.factor_id;
     showMfaPanel(true,true,pending.purpose);
     return;
   }
   if(pending)account.forgetPendingAdminMfa();
   const previousPosition=showDashboard(status);
   await Promise.all([loadDrivers(),status.mfa_enrolled&&status.mfa_verified?
     loadBackupFactors():Promise.resolve()]);
   restoreAdminPosition(previousPosition);
 }catch(error){
   lock(errorText(error,'Verifica dell’account non riuscita. Riprova con Internet attivo.'));
 }
}
let driverRequest=0;
async function loadDrivers({silent=false}={}){
 if(!account.isVerified()||account.getRole()!=='admin'){lock();return false;}
 const refresh=byId('refresh');
 if(silent&&refresh.disabled)return false;
 const token=++driverRequest;
 refresh.disabled=true;
 if(!silent)setError(listError,'');
 try{
   const result=await account.manageDrivers('list');
   if(token!==driverRequest||dashboard.hidden)return false;
   if(!Array.isArray(result.drivers))throw new Error('Elenco autisti non valido.');
   const changed=JSON.stringify(drivers)!==JSON.stringify(result.drivers);
   drivers=result.drivers;
   if(changed||!silent)renderRoster();
   setError(listError,'');
   if(!silent)inform('');
   return true;
 }catch(error){
   if(token!==driverRequest)return false;
   // Never turn a transient network error into an empty driver roster.
   setError(listError,'Aggiornamento non riuscito: '+
    errorText(error,'impossibile leggere gli autisti.')+
    ' Sono visibili soltanto gli ultimi dati caricati.');
   if(!account.isVerified()||account.getRole()!=='admin')lock('Accesso non più autorizzato.');
   return false;
 }finally{
   if(token===driverRequest)refresh.disabled=false;
 }
}
function renderRoster(){
 const summary=driverSummary(drivers);
 for(const name of ['total','active','blocked','pending'])byId('stat-'+name).textContent=String(summary[name]);
 const nodes=filterDrivers(drivers,byId('search').value,byId('status-filter').value);
 const roster=byId('roster');roster.replaceChildren();
 byId('empty').hidden=nodes.length!==0;
 for(const entry of nodes){
   const item=make('article','driver-row');
   const top=make('div','driver-top');
   const identity=make('div','identity');
   identity.append(make('strong','driver-name',[entry.firstName,entry.lastName].filter(Boolean).join(' ')||'Autista'),
     make('span','driver-phone',entry.phone||'Numero assente'));
   const status=make('span','status status-'+entry.status,STATUS_LABELS[entry.status]||'Da verificare');
   top.append(identity,status);item.append(top);
   const actions=make('div','driver-actions');
   const addAction=(caption,action,parameters,confirmation)=>{
     const button=make('button','button small outline',caption);button.type='button';
     button.addEventListener('click',()=>runAction(button,action,parameters,confirmation));
     actions.append(button);
   };
   if(entry.status==='active'||entry.status==='disabled'){
     const isDisabled=entry.status==='disabled';
     addAction(isDisabled?'Riattiva login':'Blocca login','set-access',
       {phone:entry.phone,enabled:isDisabled},
       (isDisabled?'Riattivare':'Bloccare')+' il login di '+entry.phone+'?');
     addAction('Ripristina password','issue-reset',{phone:entry.phone},
       'Sospendere subito la password precedente e generare un nuovo codice per '+entry.phone+'? L’account e i viaggi resteranno invariati.');
   }else if(entry.status==='resetting'){
     addAction('Annulla ripristino','revoke-reset',{phone:entry.phone},
       'Annullare i codici di ripristino per '+entry.phone+'? Il login resterà disattivato.');
   }else if(['invited','processing'].includes(entry.status)){
     addAction('Annulla invito','revoke-invite',{phone:entry.phone},
       'Annullare il codice di invito per '+entry.phone+'?');
   }
   if(['pending','expired','revoked'].includes(entry.status)){
     const fill=make('button','button small outline','Genera invito');
     fill.type='button';fill.addEventListener('click',()=>{
       byId('invite-first').value=entry.firstName||'';
       byId('invite-last').value=entry.lastName||'';
       byId('invite-phone').value=entry.phone||'';
       byId('invite-form').scrollIntoView({behavior:'smooth',block:'center'});
       byId('invite-first').focus();
     });actions.append(fill);
   }
   if(['active','disabled','resetting'].includes(entry.status))
     addAction('Scollega tutti i dispositivi','revoke-sessions',{phone:entry.phone},
       'Revocare tutte le sessioni salvate di '+entry.phone+'? Dovrà accedere di nuovo con la password, ma non perderà i viaggi.');
   if(['active','disabled','resetting'].includes(entry.status))
     addAction('Rimuovi dall’elenco','remove-activated',{phone:entry.phone},
       'Rimuovere '+entry.phone+'? L’accesso sarà bloccato; lo stesso account e tutti i viaggi saranno conservati. Puoi reinserire il numero in seguito.');
   else if(['pending','invited','processing','expired','revoked'].includes(entry.status))
     addAction('Rimuovi dall’elenco','remove-pending',{phone:entry.phone},
       'Rimuovere '+entry.phone+' prima dell’attivazione? Eventuali inviti saranno annullati. Il numero potrà essere reinserito.');
   if(['active','disabled','resetting'].includes(entry.status)){
    const openData=make('button','button small primary','Apri dati e viaggi');
    openData.type='button';
    openData.addEventListener('click',()=>companyView.openRecordsForPhone(entry.phone));
    actions.prepend(openData);
   }
   if(actions.childNodes.length)item.append(actions);
   roster.append(item);
 }
}
function revealCode(result,kind){
 const code=result?.code;
 if(typeof code!=='string'||!/^[A-Za-z0-9_-]{43}$/.test(code))
   throw new Error('Codice non valido nella risposta del servizio.');
 const number=result.phone||'questo autista';
 byId('secret-title').textContent=kind==='reset'?'Recupero credenziali':'Invito di attivazione';
 byId('secret-explanation').textContent=kind==='reset'
  ?'Codice per '+number+'. L’accesso precedente è sospeso. Consegna il codice privatamente: scade fra 24 ore. L’autista apre LTS → Recupera password e sceglie la nuova password.'
  :'Codice per '+number+'. Consegnalo privatamente: scade fra 24 ore ed è utilizzabile una sola volta.';
 byId('secret-code').value=code;
 byId('secret-panel').hidden=false;
 byId('secret-panel').scrollIntoView({behavior:'smooth',block:'center'});
}
async function runAction(button,action,data,question){
 if(busy||!account.isVerified()||account.getRole()!=='admin')return;
 if(question&&!window.confirm(question))return;
 busy=true;button.disabled=true;hideCode();setError(listError,'');
 try{
   const result=await account.manageDrivers(action,data);
   if(action==='issue-reset')revealCode(result,'reset');
   else inform(action==='remove-activated'?'Autista rimosso, login bloccato e viaggi conservati.':
     action==='remove-pending'?'Autista non attivato rimosso.':
     'Operazione completata.');
   await loadDrivers();
   if(action==='revoke-sessions')inform('Sessioni revocate. L’autista deve inserire nuovamente le credenziali. I viaggi sono conservati.');
 }catch(error){setError(listError,errorText(error,'Operazione non riuscita.'));}
 finally{busy=false;button.disabled=false;}
}
async function handleSubmit(event,action,ids){
 event.preventDefault();
 if(busy||!account.isVerified()||account.getRole()!=='admin')return;
 const form=event.currentTarget,button=form.querySelector('[type=submit]');
 const values=Object.fromEntries(Object.entries(ids).map(([key,id])=>[key,byId(id).value.trim()]));
 if(!Object.values(values).every(Boolean)){inform('Compila tutti i campi.',true);return;}
 if(action==='reinsert-activated'&&!window.confirm(
    'Reinserire lo stesso numero '+values.phone+'? Verranno riabilitati l’account e la password esistenti, senza perdere viaggi.'))return;
 busy=true;button.disabled=true;hideCode();inform('');
 try{
   const result=await account.manageDrivers(action,values);
   if(action==='issue')revealCode(result,'invite');
   else inform('Autista reinserito con lo stesso account e tutti i suoi viaggi.');
   form.reset();await loadDrivers();
 }catch(error){inform(errorText(error,'Richiesta non riuscita.'),true);}
 finally{busy=false;button.disabled=false;}
}
byId('login-form').addEventListener('submit',async event=>{
 event.preventDefault();
 const button=event.currentTarget.querySelector('[type=submit]');
 if(button.disabled)return;
 button.disabled=true;setError(loginError,'');inform('');
 const password=byId('login-password').value;
 byId('login-password').value='';
 try{
   if(account.hasSession())account.signOut();
   await account.login(byId('login-phone').value.trim(),password);
   if(account.getRole()!=='admin'){account.signOut();throw new Error('Permesso amministratore non presente.');}
   await authenticate();
 }catch(error){lock('');setError(loginError,errorText(error,'Accesso non riuscito.'));}
 finally{button.disabled=false;}
});

function showNewMfaCode(result,purpose='primary'){
 mfaFactorId=result.factor_id;
 showMfaPanel(true,false,purpose);
 byId('mfa-secret').textContent=result.secret;
 if(/^data:image\/svg\+xml(?:;[^,]*)?,/.test(result.qr_code)){
   byId('mfa-qr').src=result.qr_code;
   byId('mfa-qr').hidden=false;
 }
}
byId('mfa-backup-start').addEventListener('click',async()=>{
 const button=byId('mfa-backup-start');if(button.disabled||busy)return;
 button.disabled=true;inform('');
 try{
   const result=await account.enrollBackupAdminTotp();
   showNewMfaCode(result,'backup');
 }catch(error){inform(errorText(error,'Impossibile preparare l’Authenticator di riserva.'),true);}
 finally{button.disabled=false;}
});
byId('mfa-start').addEventListener('click',async()=>{
 const button=byId('mfa-start');if(button.disabled||busy)return;
 button.disabled=true;inform('');
 try{
   const result=await account.enrollAdminTotp();
   showNewMfaCode(result);
 }catch(error){inform(errorText(error,'Impossibile avviare il secondo fattore.'),true);}
 finally{button.disabled=false;}
});
byId('mfa-verify-form').addEventListener('submit',async event=>{
 event.preventDefault();const button=event.currentTarget.querySelector('[type=submit]');
 if(button.disabled)return;
 button.disabled=true;setError(byId('mfa-error'),'');
 try{
   const code=byId('mfa-code').value.trim();
   const selected=mfaFactorId||byId('mfa-factor-choice').value||null;
   await account.verifyAdminTotp(code,selected);
   clearMfa();
   await authenticate();
 }catch(error){byId('mfa-code').value='';setError(byId('mfa-error'),
   errorText(error,'Codice non verificato. Riprova.'));}
 finally{button.disabled=false;}
});
byId('mfa-cancel').addEventListener('click',()=>{
 const setup=mfaMode==='setup'||mfaMode==='backup';
 account.forgetPendingAdminMfa();
 clearMfa();
 if(setup){void authenticate();return;}
 lock('Conferma il secondo fattore prima di gestire gli autisti.');
});
byId('mfa-exit').addEventListener('click',()=>{
 void account.logout().then(result=>{
   if(!result.revoked)inform('Revoca online non confermata.',true);
 });
 lock('Sessione amministratore chiusa.');
});

byId('switch-account').addEventListener('click',()=>{
 void account.logout().then(result=>{if(!result.revoked)inform('Accesso locale chiuso; revoca online non confermata.',true);});
 lock('Sessione precedente chiusa.');byId('login-phone').focus();
});
byId('logout').addEventListener('click',()=>{
 void account.logout().then(result=>{if(!result.revoked)inform('Accesso locale terminato. Revoca online non confermata.',true);});
 lock('Accesso terminato.');
});
byId('security-check').addEventListener('click',async()=>{
 const button=byId('security-check');
 if(button.disabled||!account.isVerified()||account.getRole()!=='admin')return;
 button.disabled=true;
 byId('security-result').textContent='Verifica autorizzazioni in corso…';
 try{
  const status=await account.verifySession();
  if(account.getRole()!=='admin'||!account.isVerified()){
   lock('Sessione amministratore non più autorizzata.');return;
  }
  byId('security-result').textContent=status.mfa_verified===true?
   'Sessione amministratore verificata. MFA confermata; dati aziendali accessibili solo con autenticazione valida.':
   'Sessione verificata, ma MFA non confermata. Le statistiche richiedono una verifica MFA valida.';
  if(status.mfa_enrolled&&status.mfa_verified)await loadBackupFactors();
 }catch(error){
  byId('security-result').textContent=errorText(error,'Verifica della sessione non riuscita.');
  if(!account.isVerified()||account.getRole()!=='admin')lock('Verifica amministratore non valida.');
 }finally{button.disabled=false;}
});
byId('refresh').addEventListener('click',()=>{hideCode();loadDrivers();});
byId('search').addEventListener('input',renderRoster);
byId('status-filter').addEventListener('change',renderRoster);
byId('invite-form').addEventListener('submit',e=>handleSubmit(e,'issue',
 {firstName:'invite-first',lastName:'invite-last',phone:'invite-phone'}));
byId('restore-form').addEventListener('submit',e=>handleSubmit(e,'reinsert-activated',
 {firstName:'restore-first',lastName:'restore-last',phone:'restore-phone'}));
byId('close-secret').addEventListener('click',hideCode);
byId('copy-secret').addEventListener('click',async()=>{
 const field=byId('secret-code');if(!field.value)return;
 try{await navigator.clipboard.writeText(field.value);inform('Codice copiato. Consegnalo solo al destinatario.');}
 catch{field.focus();field.select();inform('Seleziona e copia manualmente il codice.');}
});
window.addEventListener('lts-account-locked',()=>lock('Sessione non più autorizzata.'));
window.addEventListener('offline',()=>{
 // An offline MFA tab contains no privileged records and must not lose its QR.
 if(!byId('mfa-panel').hidden){
   setError(byId('mfa-error'),'Connessione assente. Torna online prima di confermare il codice.');
   return;
 }
 lock('Connessione assente: gestione autisti bloccata fino alla verifica online.');
});
async function verifyDashboardOnResume(){
 if(resumingDashboard||dashboard.hidden)return;
 resumingDashboard=true;
 const owner=account.getAccountId(),view=dashboard.dataset.view;
 const saved=readAdminPosition();
 // Hide private content without collapsing layout while authorization is
 // rechecked. Collapsing the dashboard would reset mobile scroll position.
 dashboard.style.visibility='hidden';
 try{
  const status=await account.verifySession();
  if(account.getRole()!=='admin'||!account.isVerified()||
     account.getAccountId()!==owner)
   throw new Error('Sessione amministratore non più autorizzata.');
  if(status.mfa_enrolled&&!status.mfa_verified){
   showMfaPanel();await loadLoginFactors();return;
  }
  // Do NOT call authenticate()/showDashboard()/companyView.open() here:
  // those reset the selected tab, reports and the scroll position.
  adminRealtime?.resume();
  if(dashboard.dataset.view===view){
   restoreAdminPosition(saved);
   if(view==='drivers')void loadDrivers({silent:true});
   else companyView.refreshActive();
  }
 }catch(error){
  lock(errorText(error,'Verifica amministratore non riuscita. Riprova online.'));
 }finally{
  dashboard.style.visibility='';
  resumingDashboard=false;
 }
}
function resumeWhenSafe(){
 if(document.hidden){rememberAdminPosition();return;}
 if(!account.hasSession())return;
 if(!byId('mfa-panel').hidden)return;
 if(!dashboard.hidden){void verifyDashboardOnResume();return;}
 void authenticate();
}
// Refresh the active admin pane only. Do not reset the current page, selected
// month/driver, scroll, MFA workflow or an unsaved tariff form.
setInterval(()=>{
 if(dashboard.hidden||document.hidden||navigator.onLine===false||
    !account.isVerified()||account.getRole()!=='admin'||resumingDashboard)return;
 if(dashboard.dataset.view==='drivers'){
  if(document.activeElement?.matches?.('input:not([type=hidden]),textarea,select'))return;
  void loadDrivers({silent:true});
 }else companyView.refreshActive();
},10000);
window.addEventListener('pagehide',rememberAdminPosition);
window.addEventListener('pageshow',event=>{if(event.persisted)resumeWhenSafe();});
window.addEventListener('online',()=>adminRealtime?.resume());
window.addEventListener('focus',()=>adminRealtime?.resume());
window.addEventListener('offline',()=>adminRealtime?.resume());
window.addEventListener('online',resumeWhenSafe);
document.addEventListener('visibilitychange',()=>adminRealtime?.resume());
document.addEventListener('visibilitychange',resumeWhenSafe);
/** Do not activate the administrator login inside an external site frame. */
function denyEmbeddedAdmin(){
 if(window.top===window.self)return false;
 document.querySelectorAll('input').forEach(field=>{field.value='';field.disabled=true;});
 document.querySelector('main')?.replaceChildren(make('p','notice','Per sicurezza, apri il pannello LTS direttamente nel browser.'));
 return true;
}
if(!denyEmbeddedAdmin())authenticate();
