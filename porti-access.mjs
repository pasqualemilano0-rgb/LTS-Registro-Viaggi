// Porti is a verified subview of LTS; it cannot start as an independent application.
const BASE='/LTS-Registro-Viaggi/';
const PARENT_PATHS=new Set([BASE,BASE+'index.html',BASE+'shell.html']);
const sameOriginParent=()=>{
 if(window.parent===window)return false;
 try{return window.parent.location.origin===location.origin
   && PARENT_PATHS.has(window.parent.location.pathname);}catch{return false;}
};
if(!sameOriginParent()){
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
  authorized=true;clearTimeout(timeout);
  try{
   await import('./porti/app.js?v=20261102-lts-v66');
   await import('./porti/driver-ui.mjs?v=20261031-v44');
   document.body.hidden=false;
  }catch{
   authorized=false;denied();
  }
 },{once:false});
 window.parent.postMessage({type:'lts-porti-ready'},location.origin);
}
