/** LTS private shared customer list. Only a Maps link is sent for creation. */
import runtime from '/LTS-Registro-Viaggi/runtime-config.mjs';
import * as account from '/LTS-Registro-Viaggi/account-access.mjs';
const HOST='otrqynkscpbeyuvdlgpg.supabase.co';
const PATH='/functions/v1/lts-shared-maps';
export function sharedMapsEnabled(){return typeof runtime.accountAuth?.sharedMapsEndpoint==='string'&&
 runtime.accountAuth.sharedMapsEndpoint.length>0;}
function endpoint(){
 if(!sharedMapsEnabled())throw new Error('Archivio clienti aziendali non ancora disponibile.');
 const url=new URL(runtime.accountAuth.sharedMapsEndpoint);
 if(url.protocol!=='https:'||url.hostname!==HOST||url.pathname!==PATH||
    url.username||url.password||url.search||url.hash||url.port)
  throw new Error('Servizio aziendale configurato in modo non sicuro.');
 return url.href;
}
function validCustomer(c){
 if(!c||typeof c!=='object'||!['google_maps_link','manual'].includes(c.source)||
    !['name','city','address','mapsUrl'].every(k=>typeof c[k]==='string'&&c[k].length<=4096)||
    !c.name.trim()||!c.city.trim())throw new Error('Registro clienti aziendale non valido.');
 if(c.source==='google_maps_link'){
  if(!c.address.trim()||!c.mapsUrl.trim())throw new Error('Sede Google Maps incompleta.');
  const url=new URL(c.mapsUrl);
  if(url.protocol!=='https:'||!['www.google.com','google.com','www.google.it','google.it',
      'maps.google.com','maps.google.it','maps.app.goo.gl','goo.gl'].includes(url.hostname))
   throw new Error('Link cliente non riconosciuto.');
 }else if(c.mapsUrl!==''){
  throw new Error('Un cliente manuale non può dichiarare un link Maps.');
 }
 if(c.operationalNotes!==undefined&&
    (typeof c.operationalNotes!=='string'||c.operationalNotes.length>1500))
  throw new Error('Indicazioni operative cliente non valide.');
 return {name:c.name,city:c.city,address:c.address,mapsUrl:c.mapsUrl,
  source:c.source,operationalNotes:c.operationalNotes||''};
}
async function post(payload){
 const url=endpoint();
 const bearer=await account.getVerifiedAccessToken();
 const owner=account.getAccountId();
 const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),14000);
 try{
  const response=await fetch(url,{method:'POST',mode:'cors',credentials:'omit',
   redirect:'error',cache:'no-store',signal:controller.signal,
   headers:{Accept:'application/json','Content-Type':'application/json',
    Authorization:'Bearer '+bearer},body:JSON.stringify(payload)});
  if(!(response.headers.get('content-type')||'').includes('application/json'))
   throw new Error('Risposta del registro aziendale non valida.');
  const result=await response.json();
  if(owner!==account.getAccountId())throw new Error('Account cambiato durante la richiesta.');
  if(!response.ok){
   const err=new Error(typeof result?.error==='string'?result.error:'Registro aziendale non disponibile.');
   err.status=response.status;throw err;
  }
  return result;
 }finally{clearTimeout(timeout);}
}
export async function sharedMapsCustomers(){
 const result=await post({action:'list'});
 if(!Array.isArray(result?.customers)||result.customers.length>500)
  throw new Error('Risposta del registro clienti condiviso non valida.');
 return result.customers.map(validCustomer);
}
export async function saveSharedMapsCustomer(url,customer){
 if(typeof url!=='string'||url.trim().length<20||url.length>4096)
  throw new Error('Incolla un link Google Maps valido.');
 if(!customer||!['name','city','address'].every(key=>
  typeof customer[key]==='string'&&customer[key].trim()&&customer[key].length<=1000))
  throw new Error('Controlla nome, città e indirizzo per condividere il cliente.');
 const result=await post({action:'save-link',url,name:customer.name,
  city:customer.city,address:customer.address});
 if(result?.pending===true&&typeof result.requestId==='string')
  return {pending:true,requestId:result.requestId};
 if(typeof result?.created!=='boolean')
  throw new Error('Conferma di salvataggio aziendale non valida.');
 return {customer:validCustomer(result.customer),created:result.created,updated:result.updated===true};
}

/** Administrator-only addition: no fabricated Maps URL, company-wide visibility.
 * The backend checks live admin session, MFA, normalized name/city and duplicates.
 */
export async function saveSharedManualCustomer(customer){
 if(!customer||typeof customer!=='object'||Array.isArray(customer))
  throw new Error('Compila i dati del cliente aziendale.');
 const name=String(customer.name||'').trim(),city=String(customer.city||'').trim();
 const address=String(customer.address||'').trim(),notes=String(customer.notes||'').trim();
 if(name.length<2||name.length>500||city.length<2||city.length>500||
    address.length>1000||notes.length>1500)
  throw new Error('Controlla nome, località, indirizzo e note del cliente.');
 const result=await post({action:'save-manual',name,city,address,notes});
 if(typeof result?.created!=='boolean')
  throw new Error('Conferma di condivisione cliente non valida.');
 return {customer:validCustomer(result.customer),created:result.created};
}

/** Read-only review queue; server verifies administrator role and MFA. */
export async function pendingMapsApprovals(){
 const result=await post({action:'approval-list'});
 if(!Array.isArray(result?.requests)||result.requests.length>100)
  throw new Error('Risposta delle richieste da approvare non valida.');
 return result.requests.map(row=>{
  if(!row||typeof row.id!=='string'||!['name','city','address','mapsUrl','driver','submittedAt']
   .every(key=>typeof row[key]==='string'&&row[key].length<=4096))
   throw new Error('Dati della richiesta non validi.');
  return row;
 });
}
export async function decideMapsApproval(id,decision,cents){
 if(typeof id!=='string'||!['approve','reject'].includes(decision))
  throw new Error('Richiesta non valida.');
 if(decision==='approve'&&(!Number.isSafeInteger(cents)||cents<0||cents>99999999))
  throw new Error('Inserisci una tariffa valida.');
 const result=await post({action:'approval-decide',id,decision,
  ...(decision==='approve'?{cents}:{})});
 if(result?.[decision==='approve'?'approved':'rejected']!==true)
  throw new Error('L’operazione non è stata confermata dal server.');
 return result;
}
