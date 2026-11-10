/** MFA-only review queue. No privileged data goes to drivers. */
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const projection=r=>({id:r.id,name:r.name,city:r.city,address:r.address,
 mapsUrl:r.maps_url,submittedBy:r.submitted_by,submittedAt:r.submitted_at});
export async function submitMapsProposal(db,parsed,siteKey,userId){
 const value={submitted_by:userId,name:parsed.name,city:parsed.city,
  address:parsed.address,maps_url:parsed.mapsUrl,site_key:siteKey};
 const saved=await db.from('lts_maps_approval_requests')
  .insert(value).select('id').maybeSingle();
 if(!saved.error&&saved.data?.id)return {pending:true,requestId:saved.data.id};
 if(saved.error?.code!=='23505')throw {status:503};
 // Concurrent identical proposal is the same request, never a new company row.
 const matched=await db.from('lts_maps_approval_requests').select('id')
  .eq('status','pending').or('site_key.eq.'+siteKey+',maps_url.eq.'+parsed.mapsUrl).limit(1);
 if(matched.error||!matched.data?.[0]?.id)throw {status:409,error:'Richiesta già elaborata: aggiorna l’elenco.'};
 return {pending:true,requestId:matched.data[0].id};
}
export async function mapsApprovalList(db){
 const {data,error}=await db.from('lts_maps_approval_requests')
  .select('id,name,city,address,maps_url,submitted_by,submitted_at')
  .eq('status','pending').order('submitted_at',{ascending:true}).limit(100);
 if(error||!Array.isArray(data))throw {status:503};
 const ids=[...new Set(data.map(r=>r.submitted_by))];
 let phoneById=new Map();
 if(ids.length){
  const lookup=await db.from('lts_account_access')
   .select('user_id,phone_e164').in('user_id',ids);
  if(lookup.error||!Array.isArray(lookup.data))throw {status:503};
  phoneById=new Map(lookup.data.map(r=>[r.user_id,r.phone_e164]));
 }
 return data.map(r=>({...projection(r),driver:phoneById.get(r.submitted_by)||'Autista'}));
}
export async function decideMapsApproval(db,input,adminId){
 if(!UUID.test(input.id||'')||!['approve','reject'].includes(input.decision))
  throw {status:422,error:'Richiesta non valida.'};
 if(input.decision==='approve'){
  if(!Number.isSafeInteger(input.cents)||input.cents<0||input.cents>99999999)
   throw {status:422,error:'Tariffa aziendale obbligatoria e non valida.'};
  const {data,error}=await db.rpc('lts_maps_approve_request',{
   p_request_id:input.id,p_admin_id:adminId,p_cents:input.cents});
  if(error)throw {status:error.code==='P0001'?409:503,error:
    error.code==='P0001'?error.message:'Non è stato possibile approvare sede e tariffa.'};
  if(data?.approved!==true)throw {status:503};
  return {approved:true};
 }
 const {data,error}=await db.from('lts_maps_approval_requests')
  .update({status:'rejected',reviewed_at:new Date().toISOString(),reviewed_by:adminId})
  .eq('id',input.id).eq('status','pending').select('id').maybeSingle();
 if(error)throw {status:503};
 if(!data)throw {status:409,error:'La richiesta è stata già elaborata.'};
 return {rejected:true};
}
