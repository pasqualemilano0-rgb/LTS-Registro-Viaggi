import * as account from '../account-access.mjs?v=20261107-realtime-v1';
import realtimeConfig from '../runtime-config.mjs';
import {createLtsRealtime} from '../realtime-client.mjs?v=20261107-roster-realtime-v1';
import {STATUS_LABELS,driverSummary,filterDrivers,driverInitial} from './model.mjs?v=20261109-alpha-v1';
import {setupReport} from './report.mjs?v=20261111-control-center-v1';
import {mustRevalidateOnReturn} from '../shared/foreground-resume.mjs';
import {setupSmartConsole} from './smart-console.mjs?v=20261111-control-center-v1';
import {setupAdminStatus} from './admin-status.mjs';
import {setupControlCenter} from './control-center-home.mjs?v=20261111-control-center-v1';
import {setupMapsApprovals} from './maps-approvals.mjs?v=20261111-control-center-v1';
import {rememberPosition,readPosition,clearPosition} from './admin-position.mjs?v=20261110-audit-v1';

const byId=id=>document.getElementById(id);
const loginPanel=byId('login-panel'), dashboard=byId('dashboard');
const loginError=byId('login-error'),listError=byId('list-error');
let rosterLoaded=false;
let drivers=[],busy=false,mfaFactorId=null,mfaMode='login';
let resumingDashboard=false;
let lastAdminVerifiedAt=0;
let adminBackgroundAt=null;
let adminInlineResumeActive=false;
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
const mapsApprovals=setupMapsApprovals(account,{onApproved:()=>companyView.refreshActive()});
const adminStatus=setupAdminStatus(account);
const smartConsole=setupSmartConsole({
 authorized:()=>account.isVerified()&&account.getRole()==='admin'&&
  !dashboard.hidden&&byId('mfa-panel').hidden&&byId('admin-resume-guard').hidden,
 getDrivers:()=>drivers,
 getReport:()=>companyView.peek(),
 getCustomers:()=>companyView.peekCustomers(),
 openView:view=>companyView.open(view),
 openRecords:(phone,kind)=>companyView.openRecordsForPhone(phone,kind),
 openCustomer:site=>companyView.openRateForSite(site),
 prepareRateInline:site=>companyView.prepareRateInline(site),
 openManualCustomer:()=>companyView.openManualCustomer(),
 clearPrivateCode:()=>hideCode()
});
function openControlView(view,filters={}){
 if(view==='customers')return companyView.openCustomers();
 if(view==='approvals')return openControlApprovals();
 companyView.open(view,null,'trip',['trips','analysis','alerts','exports'].includes(view)?filters:null);
 if(dashboard.dataset.view!==view)return false;
 if(view==='drivers'){
  byId('status-filter').value=typeof filters.status==='string'?filters.status:'all';
  byId('search').value=filters.phone||filters.query||'';selectedInitial='';
  renderRoster();
 }
 return true;
}
function openControlApprovals(id=null){
 companyView.open('overview');if(dashboard.dataset.view!=='overview')return false;
 dashboard.dataset.homeSection='approvals';
 byId('workspace-title').textContent='Approvazioni Google Maps';
 byId('workspace-description').textContent='Verifica i clienti proposti e conferma le tariffe aziendali.';
 requestAnimationFrame(()=>{
  const card=id?[...byId('maps-approvals-list').querySelectorAll('[data-approval-id]')].find(x=>x.dataset.approvalId===String(id)):null;
  (card||byId('maps-approvals')).scrollIntoView({block:'start',behavior:'auto'});
  const focus=card?.querySelector('input,button')||byId('maps-approvals-refresh');focus.focus({preventScroll:true});
 });
 return true;
}
const controlCenter=setupControlCenter({account,
 authorized:()=>account.isVerified()&&account.getRole()==='admin'&&!dashboard.hidden&&!dashboard.inert&&!adminInlineResumeActive&&byId('mfa-panel').hidden&&byId('admin-resume-guard').hidden,
 getRoster:()=>rosterLoaded?drivers:null,getReport:()=>companyView.peek(),
 getCustomers:()=>companyView.peekCustomers(),getApprovals:()=>mapsApprovals.peek(),
 openView:openControlView,openTrip:row=>smartConsole.openTrip(row),
 openCustomer:site=>companyView.openRateForSite(site),openApprovals:openControlApprovals,
 setReportFilters:filters=>{
  const ok=companyView.setReportFilters(filters);
  if(ok&&filters.refresh===true){void loadDrivers({silent:true});void mapsApprovals.load({silent:true});}
  return ok;
 }
});
let adminRealtime=null;
function startAdminRealtime(){
 if(!account.isVerified()||account.getRole()!=='admin'||dashboard.hidden||
    typeof account.getRealtimeCredentials!=='function')return;
 adminRealtime?.stop();
 adminRealtime=createLtsRealtime({
  config:realtimeConfig.realtime,authenticate:account.getRealtimeCredentials,
  onChange:kind=>{
   if(dashboard.hidden||document.hidden||!account.isVerified()||
      account.getRole()!=='admin'||resumingDashboard)return;
   // Invite/access/reset changes refresh the roster without waiting for polling.
   if(kind==='roster'||kind==='ready'){
    if(dashboard.dataset.view!=='drivers'||
       !document.activeElement?.matches?.('input:not([type=hidden]),textarea,select'))
     void loadDrivers({silent:true});
   }
   if(kind!=='roster'&&dashboard.dataset.view!=='drivers')
    companyView.refreshActive();
   if(kind==='archive'||kind==='catalog')controlCenter.refresh({forceInsights:true});
  }
 });
 adminRealtime.start();
}

const errorText=(error,fallback)=>error?.message||fallback;
function inform(message,bad=false){
 const node=byId('notice');node.textContent=message;node.hidden=!message;node.classList.toggle('danger',bad);
}
function setError(node,message){node.textContent=message||'';node.hidden=!message;}
// Keep the same protected dashboard and its unsaved forms in memory while
// a resumed mobile connection is verified. No cached data can be interacted with.
function showInlineAdminResume(message='Controllo connessione…'){
 if(!byId('admin-resume-guard').hidden)return;
 adminInlineResumeActive=true;
 dashboard.inert=true;
 const note=byId('admin-resume-inline');
 note.textContent=message;
 note.hidden=false;
}
function hideInlineAdminResume(){
 adminInlineResumeActive=false;
 byId('admin-resume-inline').hidden=true;
 if(byId('admin-resume-guard').hidden)dashboard.inert=false;
}
function showResumeGuard(message='Verifica sicura della sessione in corso…',failed=false){
 hideInlineAdminResume();
 const guard=byId('admin-resume-guard');
 guard.hidden=false;guard.dataset.failed=String(failed);
 byId('admin-resume-title').textContent=failed?'Verifica temporaneamente non disponibile':'Verifico la sessione';
 byId('admin-resume-message').textContent=message;
 byId('admin-resume-retry').hidden=!failed;
 byId('admin-resume-exit').hidden=!failed;
 dashboard.inert=true;
 adminRealtime?.stop();
}
function hideResumeGuard(){
 byId('admin-resume-guard').hidden=true;
 hideInlineAdminResume();
 dashboard.inert=false;
}
function setPasswordVisibility(visible){
 const password=byId('login-password'),button=byId('login-password-toggle');
 password.type=visible?'text':'password';
 button.textContent=visible?'Nascondi':'Mostra';
 button.setAttribute('aria-pressed',String(visible));
 button.setAttribute('aria-label',visible?'Nascondi password':'Mostra password');
}
function transientAdminError(error){
 return account.hasSession()&&account.getRole()==='admin'&&
  ![401,403].includes(error?.status);
}
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
 hideResumeGuard();
 smartConsole.reset();byId('smart-command-open').hidden=true;
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
 hideResumeGuard();
 setPasswordVisibility(false);
 byId('switch-account').hidden=!account.hasSession();
 adminStatus.reset();
 mapsApprovals.reset();
 selectedInitial='';
 byId('search').value='';byId('status-filter').value='all';
 smartConsole.reset();byId('smart-command-open').hidden=true;
 adminRealtime?.stop();adminRealtime=null;
 clearAdminPosition();
 drivers=[];rosterLoaded=false;controlCenter.reset();companyView.reset();clearMfa();
 byId('roster').replaceChildren();byId('roster-count').textContent='';
 for(const key of ['total','active','blocked','pending'])byId('stat-'+key).textContent='—';
 for(const button of byId('roster-letters').querySelectorAll('button')){
  button.setAttribute('aria-pressed',String(button.dataset.letter===''));
  button.disabled=Boolean(button.dataset.letter);
 }
 hideCode();
 byId('mfa-panel').hidden=true;
 dashboard.hidden=true;loginPanel.hidden=false;byId('logout').hidden=true;
 setError(listError,'');
 inform(message,Boolean(message));
}
function showDashboard(status={}){
 lastAdminVerifiedAt=Date.now();
 adminBackgroundAt=null;
 hideResumeGuard();
 byId('switch-account').hidden=true;
 const previousPosition=readAdminPosition();
 companyView.reset();clearMfa();byId('mfa-panel').hidden=true;
 byId('mfa-warning').hidden=status.mfa_enrolled===true;
 byId('mfa-backup-card').hidden=!(status.mfa_enrolled&&status.mfa_verified);
 loginPanel.hidden=true;dashboard.hidden=false;byId('logout').hidden=false;
 byId('smart-command-open').hidden=false;
 setError(loginError,'');inform('');
 companyView.open(previousPosition?.view||
  (status.mfa_enrolled===true&&status.mfa_verified===true?'overview':'security'));
 startAdminRealtime();
 void mapsApprovals.load();
 return previousPosition;
}
// Only accept a server-confirmed response returned by the SAME in-flight login
// or MFA verification. Startup and account restoration always call the server.
function immediatelyVerifiedAdminStatus(status){
 return status&&status.role==='admin'&&typeof status.user_id==='string'&&
  status.user_id.length>0&&account.hasSession()&&account.getRole()==='admin'&&
  account.getAccountId()==='account:'+status.user_id&&
  typeof status.mfa_enrolled==='boolean'&&typeof status.mfa_verified==='boolean'&&
  (status.mfa_enrolled||!status.mfa_verified)&&
  (!status.mfa_verified||account.isVerified()) ? status : null;
}
async function authenticate(freshStatus=null){
 if(!account.hasSession()){lock('');return;}
 // A verified login or MFA response is already an online session check:
 // do not request a duplicate network round trip before showing the next step.
 const statusFromCompletedVerification=immediatelyVerifiedAdminStatus(freshStatus);
 if(!statusFromCompletedVerification&&account.getRole()==='admin'&&
    dashboard.hidden&&byId('mfa-panel').hidden){
  loginPanel.hidden=true;
  showResumeGuard('Ripristino sicuro del pannello in corso…');
 }
 try{
   const status=statusFromCompletedVerification||await account.verifySession();
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
   // Dashboard is available immediately after server authentication; roster,
   // backup-factor labels and reports load independently in the background.
   void Promise.allSettled([loadDrivers(),status.mfa_enrolled&&status.mfa_verified?
     loadBackupFactors():Promise.resolve()]).then(()=>restoreAdminPosition(previousPosition));
 }catch(error){
   if(transientAdminError(error))
    showResumeGuard('La connessione non ha completato la verifica. La sessione rimane conservata: riprova quando sei online.',true);
   else lock(errorText(error,'Verifica dell’account non riuscita. Riprova con Internet attivo.'));
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
   drivers=result.drivers;rosterLoaded=true;
   window.dispatchEvent(new Event('lts-admin-roster-refreshed'));
   if(changed||!silent)renderRoster();
  smartConsole.refresh();
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
let selectedInitial='';
function renderLetters(){
 const area=byId('roster-letters');
 if(!area.childElementCount){
  for(const letter of ['',...'ABCDEFGHIJKLMNOPQRSTUVWXYZ','#']){
   const button=make('button','roster-letter',letter||'Tutte');
   button.type='button';button.dataset.letter=letter;
   button.setAttribute('aria-label',letter?
    'Mostra cognomi con iniziale '+letter:'Mostra tutti i cognomi');
   button.addEventListener('click',()=>{
    selectedInitial=selectedInitial===letter?'':letter;
    renderRoster();
   });
   area.append(button);
  }
 }
 const available=new Set(drivers.map(driverInitial));
 if(selectedInitial&&!available.has(selectedInitial))selectedInitial='';
 for(const button of area.querySelectorAll('button')){
  const letter=button.dataset.letter;
  button.disabled=Boolean(letter)&&!available.has(letter);
  button.setAttribute('aria-pressed',String(selectedInitial===letter));
 }
}
function renderRoster(){
 renderLetters();
 const summary=driverSummary(drivers);
 for(const name of ['total','active','blocked','pending'])byId('stat-'+name).textContent=String(summary[name]);
 const nodes=filterDrivers(drivers,byId('search').value,byId('status-filter').value,selectedInitial);
 byId('roster-count').textContent=nodes.length+' su '+drivers.length+
  ' autisti · ordine alfabetico per cognome'+(selectedInitial?' · iniziale '+selectedInitial:'');
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
    const openCustomers=make('button','button small outline','Clienti personali');
    openCustomers.type='button';
    openCustomers.setAttribute('aria-label',
     'Modifica clienti personali di '+[entry.firstName,entry.lastName].filter(Boolean).join(' '));
    openCustomers.addEventListener('click',()=>companyView.openRecordsForPhone(entry.phone,'customer'));
    const openData=make('button','button small primary','Apri dati e viaggi');
    openData.type='button';
    openData.addEventListener('click',()=>companyView.openRecordsForPhone(entry.phone));
    actions.prepend(openData,openCustomers);
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
byId('login-password-toggle').addEventListener('click',()=>setPasswordVisibility(
 byId('login-password').type==='password'));
byId('login-form').addEventListener('submit',async event=>{
 event.preventDefault();
 const button=event.currentTarget.querySelector('[type=submit]');
 if(button.disabled)return;
 button.disabled=true;setError(loginError,'');inform('');
 const password=byId('login-password').value;
 byId('login-password').value='';
 setPasswordVisibility(false);
 try{
   if(account.hasSession())account.signOut();
   const verifiedLogin=await account.login(byId('login-phone').value.trim(),password);
   if(account.getRole()!=='admin'){account.signOut();throw new Error('Permesso amministratore non presente.');}
   await authenticate(verifiedLogin);
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
   const verifiedMfa=await account.verifyAdminTotp(code,selected);
   clearMfa();
   await authenticate(verifiedMfa);
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
 // Mobile may report a brief offline event while suspending the PWA.
 // Never replace the entire dashboard with a loading screen in background.
 if(document.hidden){adminRealtime?.stop();return;}
 if(!byId('mfa-panel').hidden){
  setError(byId('mfa-error'),'Connessione assente. Torna online prima di confermare il codice.');
  return;
 }
 if(!dashboard.hidden){
  showInlineAdminResume('Connessione assente · operazioni sospese.');
  adminRealtime?.stop();
 }else if(account.hasSession()&&account.getRole()==='admin'){
  showResumeGuard('Connessione assente. Riprova quando la rete sarà disponibile.',true);
 }else inform('Connessione assente. Il login richiede Internet.',true);
});
async function verifyDashboardOnResume(){
 if(resumingDashboard||dashboard.hidden||document.hidden)return;
 resumingDashboard=true;
 const owner=account.getAccountId(),view=dashboard.dataset.view;
 const saved=readAdminPosition();
 if(byId('admin-resume-guard').hidden)showInlineAdminResume();
 else showResumeGuard('Verifica sicura della sessione in corso…');
 try{
  const status=await account.verifySession();
  if(account.getRole()!=='admin'||!account.isVerified()||
     account.getAccountId()!==owner)
   throw new Error('Sessione amministratore non più autorizzata.');
  if(status.mfa_enrolled&&!status.mfa_verified){
   showMfaPanel();await loadLoginFactors();return;
  }
  // Revalidate in place, without a full-screen loading page or losing draft edits.
  lastAdminVerifiedAt=Date.now();
  adminBackgroundAt=null;
  hideResumeGuard();
  // stop() shuts down the socket; start() is needed after revalidation.
  adminRealtime?.start();
  void mapsApprovals.load({silent:true});
  if(dashboard.dataset.view===view){
   restoreAdminPosition(saved);
   if(view==='drivers')void loadDrivers({silent:true});
   else companyView.refreshActive();
  }
 }catch(error){
  if(!transientAdminError(error)||account.getAccountId()!==owner){
   lock(errorText(error,'Sessione amministratore scaduta o revocata.'));
  }else{
   showResumeGuard('Verifica non completata. Non hai perso l’accesso: il pannello resta protetto e puoi riprovare.',true);
  }
 }finally{resumingDashboard=false;}
}
function resumeWhenSafe(){
 if(document.hidden){
  rememberAdminPosition();
  if(!dashboard.hidden&&adminBackgroundAt===null)adminBackgroundAt=Date.now();
  return;
 }
 if(!account.hasSession()){
  if(!dashboard.hidden)lock('Sessione terminata. Accedi nuovamente.');
  return;
 }
 if(!byId('mfa-panel').hidden)return;
 if(!dashboard.hidden){
  const required=mustRevalidateOnReturn({
   verified:account.isVerified(),hasSession:account.hasSession(),
   sameOwner:account.getRole()==='admin',lastVerifiedAt:lastAdminVerifiedAt,
   backgroundAt:adminBackgroundAt,
   blocked:adminInlineResumeActive||!byId('admin-resume-guard').hidden||navigator.onLine===false
  });
  adminBackgroundAt=null;
  if(required)void verifyDashboardOnResume();
  else adminRealtime?.start();
  return;
 }
 void authenticate();
}
// Refresh the active admin pane only. Do not reset the current page, selected
// month/driver, scroll, MFA workflow or an unsaved tariff form.
setInterval(()=>{
 if(dashboard.hidden||document.hidden||navigator.onLine===false||
    !byId('admin-resume-guard').hidden||!account.isVerified()||account.getRole()!=='admin'||resumingDashboard)return;
 if(dashboard.dataset.view==='drivers'){
  if(document.activeElement?.matches?.('input:not([type=hidden]),textarea,select'))return;
  void loadDrivers({silent:true});
 }else companyView.refreshActive();
},10000);
// Review queue does not interrupt unsaved tariff forms.
setInterval(()=>{
 if(!dashboard.hidden&&!document.hidden&&navigator.onLine!==false&&
   byId('admin-resume-guard').hidden&&account.isVerified()&&
   account.getRole()==='admin'&&!resumingDashboard)
  void mapsApprovals.load({silent:true});
},25000);
byId('admin-resume-retry').addEventListener('click',()=>{
 if(!account.hasSession()){lock('Sessione non disponibile. Accedi nuovamente.');return;}
 if(!dashboard.hidden)void verifyDashboardOnResume();
 else void authenticate();
});
byId('admin-resume-exit').addEventListener('click',()=>{
 void account.logout().catch(()=>{});
 lock('Hai chiuso la sessione amministratore.');
});
window.addEventListener('pagehide',()=>{rememberAdminPosition();if(!dashboard.hidden)adminBackgroundAt=Date.now();});
window.addEventListener('pageshow',event=>{if(event.persisted)resumeWhenSafe();});
window.addEventListener('online',()=>{if(byId('admin-resume-guard').hidden&&!adminInlineResumeActive)adminRealtime?.start();});
window.addEventListener('focus',()=>{if(byId('admin-resume-guard').hidden&&!adminInlineResumeActive)adminRealtime?.resume();});
window.addEventListener('offline',()=>adminRealtime?.stop());
window.addEventListener('online',resumeWhenSafe);
document.addEventListener('visibilitychange',()=>{if(document.hidden){adminRealtime?.stop();if(!dashboard.hidden)adminBackgroundAt=Date.now();}});
document.addEventListener('visibilitychange',resumeWhenSafe);
/** Do not activate the administrator login inside an external site frame. */
function denyEmbeddedAdmin(){
 if(window.top===window.self)return false;
 document.querySelectorAll('input').forEach(field=>{field.value='';field.disabled=true;});
 document.querySelector('main')?.replaceChildren(make('p','notice','Per sicurezza, apri il pannello LTS direttamente nel browser.'));
 return true;
}
if(!denyEmbeddedAdmin()){
 if(account.hasSession()&&account.getRole()==='admin'){
  loginPanel.hidden=true;
  showResumeGuard('Ripristino del pannello amministratore in corso…');
 }
 void authenticate();
}
