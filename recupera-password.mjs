// LTS password recovery: no service-role secrets, no user data or session storage.
// Publishable key is intentionally public; this page never uses admin privileges.
const SUPABASE='https://otrqynkscpbeyuvdlgpg.supabase.co';
const API_KEY='sb_publishable_9yp1GCs-X5lJ9EJth_oB1g_jzG7m5OJ';
const RECOVERY_URL='https://pasqualemilano0-rgb.github.io/LTS-Registro-Viaggi/recupera-password.html';
const $=id=>document.getElementById(id);
const requestForm=$('request-form'),changeForm=$('change-form'),status=$('status');
const requestButton=$('request-submit'),changeButton=$('change-submit');
let recoveryToken=null;

function say(message,kind='info'){
  status.textContent=message;status.dataset.kind=kind;
}
function showRequest(message){
  requestForm.hidden=false;changeForm.hidden=true;
  if(message)say(message,'error');
}
function validPassword(s){
  return typeof s==='string'&&s.length>=12&&s.length<=128&&
    s.trim()===s&&!/[\u0000-\u001f\u007f]/.test(s)&&
    /[A-Za-z]/.test(s)&&/[0-9]/.test(s);
}
async function requestApi(path,{method='GET',body=null,token=null}={}){
  const headers={apikey:API_KEY,Accept:'application/json'};
  if(body!==null)headers['Content-Type']='application/json';
  if(token)headers.Authorization='Bearer '+token;
  let response;
  try{
    response=await fetch(SUPABASE+'/auth/v1/'+path,{
      method,headers,body:body===null?undefined:JSON.stringify(body),
      mode:'cors',credentials:'omit',redirect:'error',cache:'no-store',
      referrerPolicy:'no-referrer',signal:AbortSignal.timeout(15000)
    });
  }catch{throw Error('Servizio di autenticazione temporaneamente non raggiungibile.');}
  if(!response.ok){
    if(response.status===429)throw Error('Troppe richieste. Riprova più tardi.');
    if(response.status===401||response.status===403)throw Error('Link di recupero scaduto o non valido. Richiedine uno nuovo.');
    if(response.status===422)throw Error('Password non accettata da Supabase oppure link scaduto. Scegli una password diversa o richiedi un nuovo link.');
    throw Error('Operazione non riuscita. Verifica la configurazione di recupero e riprova.');
  }
  const contentType=response.headers.get('Content-Type')||'';
  if(!contentType.includes('application/json'))return {};
  try{return await response.json();}catch{throw Error('Risposta incompleta dal servizio di autenticazione.');}
}
// Only five hex digits of SHA-1 are sent to Have I Been Pwned; never the password or full hash.
// SHA-1 here is only an index for a breach check: Supabase Auth hashes the stored password.
export async function compromisedPassword(password,fetchImpl=fetch){
  const digest=await crypto.subtle.digest('SHA-1',new TextEncoder().encode(password));
  const hash=Array.from(new Uint8Array(digest),x=>x.toString(16).padStart(2,'0')).join('').toUpperCase();
  let response;
  try{
    response=await fetchImpl('https://api.pwnedpasswords.com/range/'+hash.slice(0,5),{
      method:'GET',headers:{'Add-Padding':'true'},mode:'cors',credentials:'omit',
      redirect:'error',cache:'no-store',referrerPolicy:'no-referrer',
      signal:AbortSignal.timeout(8000)
    });
  }catch{throw Error('Verifica sicurezza password non disponibile. Riprova più tardi.');}
  if(!response?.ok)throw Error('Verifica sicurezza password non disponibile. Riprova più tardi.');
  const text=await response.text();
  if(!text||text.length>350000)throw Error('Verifica sicurezza password non disponibile. Riprova più tardi.');
  const suffix=hash.slice(5);
  for(const line of text.trim().split(/\r?\n/)){
    const pair=/^([0-9a-f]{35}):([0-9]{1,10})$/i.exec(line.trim());
    if(!pair)throw Error('Verifica sicurezza password non disponibile. Riprova più tardi.');
    if(pair[1].toUpperCase()===suffix&&Number(pair[2])>0)return true;
  }
  return false;
}
export function parseRecoveryHash(value){
  const hash=new URLSearchParams((value||'').replace(/^#/,''));
  if(hash.has('error')||hash.has('error_code'))return {error:'Il link è scaduto o non valido. Richiedine uno nuovo.'};
  const token=hash.get('access_token')||'';
  if(hash.get('type')!=='recovery'||!/^[-A-Za-z0-9._~]{40,4096}$/.test(token))
    return {error:'Apri il link di recupero che riceverai via email per scegliere una nuova password.'};
  return {token};
}
async function init(){
  // Clear the one-use credentials from visible URL and browser history immediately.
  const fragment=window.location.hash;
  if(fragment)history.replaceState(null,'',window.location.pathname);
  const parsed=parseRecoveryHash(fragment);
  if(!parsed.token){showRequest(fragment?parsed.error:null);return;}
  recoveryToken=parsed.token;
  requestForm.hidden=true;changeForm.hidden=true;
  say('Controllo il link ricevuto via email...');
  try{
    const user=await requestApi('user',{token:recoveryToken});
    if(!user?.id||!user?.email)throw Error('Identità del link non verificabile.');
    changeForm.hidden=false;say('Email verificata. Scegli una nuova password personale.');
  }catch{
    recoveryToken=null;
    showRequest('Link scaduto o non valido. Richiedi un altro messaggio email.');
  }
}
requestForm.addEventListener('submit',async event=>{
  event.preventDefault();
  const email=$('email').value.trim();
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||email.length>254){
    say('Inserisci un indirizzo email valido.','error');return;
  }
  requestButton.disabled=true;
  try{
    await requestApi('recover?redirect_to='+encodeURIComponent(RECOVERY_URL),{
      method:'POST',body:{email}
    });
    // Do not reveal whether the email is registered.
    say('Se la Gmail è associata a un account, riceverai un link per impostare la password. Controlla anche Spam.');
    $('email').value='';
  }catch(error){say(error.message,'error');}
  finally{requestButton.disabled=false;}
});
changeForm.addEventListener('submit',async event=>{
  event.preventDefault();
  if(!recoveryToken){say('Apri prima il link inviato via email.','error');return;}
  const pass=$('password').value,confirm=$('confirm').value;
  if(!validPassword(pass)){say('Usa da 12 a 128 caratteri, con almeno una lettera e un numero.','error');return;}
  if(pass!==confirm){say('Le due password non coincidono.','error');return;}
  changeButton.disabled=true;
  try{
    if(await compromisedPassword(pass)){
      say('Questa password è presente in violazioni note: scegline una diversa.','error');return;
    }
    const user=await requestApi('user',{method:'PUT',body:{password:pass},token:recoveryToken});
    if(!user?.id)throw Error('Aggiornamento non confermato. Richiedi un nuovo link.');
    // Do not persist recovery tokens; never automatically activate a browser session.
    const token=recoveryToken;recoveryToken=null;
    try{await requestApi('logout',{method:'POST',token});}catch{}
    $('password').value='';$('confirm').value='';
    changeForm.hidden=true;
    say('Password impostata correttamente. Torna a LTS e accedi con il tuo numero di cellulare.','success');
    $('login-link').hidden=false;
  }catch(error){say(error.message,'error');}
  finally{changeButton.disabled=false;}
});
init();
