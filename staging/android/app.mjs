// Standalone QA-only booking client. No production imports, storage or service worker.
const AUTH='https://sywxretbfgwxwhvdcknq.supabase.co/functions/v1/lts-phone-auth';
const BOOKING='https://lts-tfg-booking-qa-gateway.pasqualemilano0.workers.dev/api/tfg_booking';
let token=null,expiresAt=0,role=null;
const $=id=>document.getElementById(id);
function message(id,value){$(id).textContent=value}
async function post(url,body,bearer){
 const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),15000);
 try{
  const response=await fetch(url,{method:'POST',mode:'cors',credentials:'omit',redirect:'error',cache:'no-store',signal:controller.signal,headers:{'Content-Type':'application/json','Accept':'application/json',...(bearer?{Authorization:'Bearer '+bearer}:{})},body:JSON.stringify(body)});
  const data=await response.json().catch(()=>({}));
  if(!response.ok)throw Error(response.status===401?'Sessione non valida':response.status===403?'Accesso non autorizzato':'Servizio QA non disponibile');
  return data;
 }finally{clearTimeout(timeout)}
}
function clear(){token=null;expiresAt=0;role=null;$('booking').hidden=true;$('login').hidden=false;$('password').value='';message('result','')}
async function verify(){
 if(!token||Date.now()>expiresAt-15000)throw Error('Sessione scaduta. Accedi nuovamente.');
 const state=await post(AUTH,{action:'session'},token);
 if(state.active!==true||state.role!==role||!['driver','admin'].includes(state.role))throw Error('Sessione QA non autorizzata.');
 if(state.role==='admin'&&state.mfa_verified!==true)throw Error('Per l’amministratore è obbligatoria la verifica MFA.');
}
$('login-form').addEventListener('submit',async event=>{
 event.preventDefault();const button=event.target.querySelector('button');button.disabled=true;message('login-status','Verifica account QA…');
 try{
  const data=await post(AUTH,{action:'login',phone:$('phone').value.trim(),password:$('password').value});
  if(!/^[A-Za-z0-9._-]{50,4096}$/.test(data.access_token||'')||!Number.isSafeInteger(data.expires_in)||data.expires_in<=0||!['admin','driver'].includes(data.role))throw Error('Risposta login QA non valida.');
  token=data.access_token;role=data.role;expiresAt=Date.now()+data.expires_in*1000;
  await verify();$('password').value='';$('login').hidden=true;$('booking').hidden=false;message('login-status','');
 }catch(error){clear();message('login-status',error.message||'Accesso non riuscito.')}
 finally{button.disabled=false}
});
$('booking-form').addEventListener('submit',async event=>{
 event.preventDefault();const button=event.target.querySelector('button');button.disabled=true;message('result','Verifica TFG in corso…');
 try{
  const booking=$('number').value.trim().toUpperCase();
  if(!/^[A-Z0-9][A-Z0-9/-]{3,49}$/.test(booking))throw Error('Numero booking non valido.');
  await verify();
  const data=await post(BOOKING,{booking},token);
  if(data.booking_authorized!==false||data.source!=='https://tfg.bucci.it/@/TFGW_WW_BKK')throw Error('Risposta TFG non verificabile.');
  message('result',data.status==='found'?'Nave: '+data.vessel+'\nViaggio: '+data.voyage+'\nAccettazione booking: NON CONFERMATA':data.status==='not_found'?'Booking non trovato.':'Booking non verificabile.');
 }catch(error){message('result',error.message||'Ricerca non riuscita.');if(/Sessione|MFA|autorizzata/i.test(error.message||''))clear()}
 finally{button.disabled=false}
});
$('logout').addEventListener('click',()=>{clear();message('login-status','Sessione locale chiusa.')});
