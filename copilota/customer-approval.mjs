/** Deterministic client approval contract. No persistence or privileged action. */
const normalize=v=>String(v??'').normalize('NFKC').trim().replace(/\s+/g,' ');
const canonical=v=>normalize(v).toLocaleUpperCase('it-IT');
export const REQUEST_STATUSES=Object.freeze(['pending','approved','rejected']);
export function customerRequestKey({ownerId,customerName,city=''}){
 const owner=normalize(ownerId),name=canonical(customerName),place=canonical(city);
 if(!owner||name.length<2||name.length>160||place.length>120)throw new Error('Dati richiesta cliente non validi');
 return JSON.stringify([owner,name,place]);
}
export function prepareApprovalRequest({ownerId,customerName,city='',container,existingRequests=[]}){
 const key=customerRequestKey({ownerId,customerName,city});
 const duplicate=(Array.isArray(existingRequests)?existingRequests:[]).find(r=>r?.status==='pending'&&r?.key===key);
 if(duplicate)return {status:'existing_pending',requestId:duplicate.id??null,key};
 const normalizedContainer=normalize(container).toUpperCase().replace(/\s/g,'');
 if(!/^[A-Z]{4}\d{7}$/.test(normalizedContainer))throw new Error('Container non valido');
 return {status:'ready_to_submit',payload:{customerName:normalize(customerName),city:normalize(city),container:normalizedContainer},key};
}
export function transitionApprovalStatus(request,nextStatus,{actorRole,adminMfaVerified=false}={}){
 if(!request||request.status!=='pending')throw new Error('Richiesta non in attesa');
 if(!['approved','rejected'].includes(nextStatus))throw new Error('Stato non valido');
 if(actorRole!=='admin'||adminMfaVerified!==true)throw new Error('Approvazione riservata ad admin MFA');
 return {...request,status:nextStatus};
}
