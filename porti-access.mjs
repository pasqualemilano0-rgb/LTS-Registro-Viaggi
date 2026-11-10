// Porti is a verified subview of LTS; it cannot start as an independent application.
// Maintenance switch for the controlled LTS Porti migration.
// Change ONLY this flag to false after the acceptance tests and rollback check.
const MAINTENANCE_ENABLED = false;

// Sunday in Europe/Rome is the one weekly pause. This is a UI policy,
// not an authorization control; the verified LTS parent remains required.
function isPortiSundayInRome(at=new Date()){
 return new Intl.DateTimeFormat('en-US',{timeZone:'Europe/Rome',weekday:'short'}).format(at)==='Sun';
}
function showMaintenance(reason='maintenance') {
  const main=document.createElement('main');
  main.className='shell';
  main.setAttribute('role','status');
  const header=document.createElement('header');header.className='top';
  const brand=document.createElement('h1');brand.textContent='LTS Registro Viaggi';
  header.append(brand);
  const section=document.createElement('section');section.className='panel';
  const title=document.createElement('h2');title.textContent=reason==='sunday'?
   'Porti sospesi la domenica':'Porti e Booking temporaneamente sospesi';
  const message=document.createElement('p');
  message.textContent=reason==='sunday'?
   'La sezione Porti riprenderà automaticamente lunedì. Registro Viaggi, clienti e dashboard rimangono disponibili.':
   'Stiamo completando la migrazione tecnica e i controlli di sicurezza. Registro Viaggi, clienti e dashboard restano disponibili.';
  const note=document.createElement('p');
  note.textContent='Per operazioni urgenti verifica direttamente sui siti ufficiali dei terminali. Questa pagina non conferma accettazioni o autorizzazioni al carico.';
  const home=document.createElement('a');
  home.href='/LTS-Registro-Viaggi/';home.target='_top';
  home.className='secondary-btn';home.textContent='Torna a Registro Viaggi';
  const sources=document.createElement('div');sources.className='source-grid';
  for(const [name,url] of [
    ['CO.NA.TE.CO.','https://www.conateco.it/berth-forecast/'],
    ['TFG Napoli','https://tfg.bucci.it/@/TFGW_TP_ETA'],
    ['SCT Salerno','https://www.salernocontainerterminal.com/vessel-schedule/']]){
    const link=document.createElement('a');
    link.href=url;link.target='_blank';link.rel='noopener noreferrer';
    link.textContent=name;sources.append(link);
  }
  section.append(title,message,note,home,sources);
  main.append(header,section);
  document.body.replaceChildren(main);
  document.body.hidden=false;
}
const BASE='/LTS-Registro-Viaggi/';
const PARENT_PATHS=new Set([BASE,BASE+'index.html',BASE+'shell.html']);
const sameOriginParent=()=>{
 if(window.parent===window)return false;
 try{return window.parent.location.origin===location.origin
   && PARENT_PATHS.has(window.parent.location.pathname);}catch{return false;}
};
if(MAINTENANCE_ENABLED){
 showMaintenance();
}else if(isPortiSundayInRome()){
 showMaintenance('sunday');
}else if(!sameOriginParent()){
 location.replace(BASE);
}else{
 let authorized=false;
 const denied=()=>{
  if(authorized)return;
  document.body.replaceChildren();
  const main=document.createElement('main');
  main.setAttribute('role','alert');
  main.textContent='Per usare Porti e booking, accedi a LTS Registro Viaggi e apri la sezione Porti.';
  const link=document.createElement('a');
  link.href=BASE;link.target='_top';link.textContent='Apri LTS Registro Viaggi';
  main.append(document.createElement('p'),link);
  document.body.append(main);document.body.hidden=false;
 };
 const timeout=setTimeout(denied,10000);
 window.addEventListener('message',async event=>{
  if(authorized||event.source!==window.parent||event.origin!==location.origin
    ||event.data?.type!=='lts-porti-authorized')return;
  if(isPortiSundayInRome()){clearTimeout(timeout);showMaintenance('sunday');return;}
  authorized=true;clearTimeout(timeout);
  try{
   await import('./porti/app.js?v=20261110-accetta-carico-v1');
   await import('./porti/driver-ui.mjs?v=20261031-v44');
   document.body.hidden=false;
  }catch{
   authorized=false;denied();
  }
 },{once:false});
 window.parent.postMessage({type:'lts-porti-ready'},location.origin);
}
