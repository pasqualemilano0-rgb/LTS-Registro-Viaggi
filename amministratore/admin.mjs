import * as account from '../account-access.mjs';
import {STATUS_LABELS,driverSummary,filterDrivers} from './model.mjs';

const byId=id=>document.getElementById(id);
const loginPanel=byId('login-panel'), dashboard=byId('dashboard');
const loginError=byId('login-error'),listError=byId('list-error');
let drivers=[],busy=false;
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
function lock(message='Accedi come amministratore per continuare.'){
 drivers=[];
 byId('roster').replaceChildren();hideCode();
 dashboard.hidden=true;loginPanel.hidden=false;byId('logout').hidden=true;
 setError(listError,'');
 inform(message,Boolean(message));
}
function showDashboard(){
 loginPanel.hidden=true;dashboard.hidden=false;byId('logout').hidden=false;
 setError(loginError,'');inform('');
}
async function authenticate(){
 if(!account.hasSession()){lock('');return;}
 try{
   await account.verifySession();
   if(account.getRole()!=='admin'){
     account.signOut();
     lock('Questo account non è autorizzato come amministratore.');
     return;
   }
   showDashboard();
   await loadDrivers();
 }catch(error){
   lock(errorText(error,'Verifica dell’account non riuscita. Riprova con Internet attivo.'));
 }
}
async function loadDrivers(){
 if(!account.isVerified()||account.getRole()!=='admin'){lock();return;}
 const refresh=byId('refresh');
 refresh.disabled=true;
 setError(listError,'');
 try{
   const result=await account.manageDrivers('list');
   if(!Array.isArray(result.drivers))throw new Error('Elenco autisti non valido.');
   drivers=result.drivers;
   renderRoster();inform('');
 }catch(error){
   drivers=[];renderRoster();
   setError(listError,errorText(error,'Impossibile aggiornare gli autisti.'));
   if(!account.isVerified()||account.getRole()!=='admin')lock('Accesso non più autorizzato.');
 }finally{refresh.disabled=false;}
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
     addAction('Rimuovi dall’elenco','remove-activated',{phone:entry.phone},
       'Rimuovere '+entry.phone+'? L’accesso sarà bloccato; lo stesso account e tutti i viaggi saranno conservati. Puoi reinserire il numero in seguito.');
   else if(['pending','invited','processing','expired','revoked'].includes(entry.status))
     addAction('Rimuovi dall’elenco','remove-pending',{phone:entry.phone},
       'Rimuovere '+entry.phone+' prima dell’attivazione? Eventuali inviti saranno annullati. Il numero potrà essere reinserito.');
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
  ?'Codice per '+number+'. L’accesso precedente è sospeso. Consegna il codice privatamente: scade fra 24 ore e permette di scegliere una nuova password.'
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
   showDashboard();await loadDrivers();
 }catch(error){lock('');setError(loginError,errorText(error,'Accesso non riuscito.'));}
 finally{button.disabled=false;}
});
byId('switch-account').addEventListener('click',()=>{
 account.signOut();lock('Sessione precedente chiusa.');byId('login-phone').focus();
});
byId('logout').addEventListener('click',()=>{account.signOut();lock('Accesso terminato.');});
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
window.addEventListener('offline',()=>lock('Connessione assente: gestione autisti bloccata fino alla verifica online.'));
window.addEventListener('online',authenticate);
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&account.hasSession())authenticate();});
authenticate();
