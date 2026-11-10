/** Server-side validation and scoped duplicate handling for manual customer proposals.
 * This helper is deliberately not connected to production routes until the
 * migration, MFA review, atomic customer+tariff commit and deployment are ready.
 */
const normalize=value=>String(value??'').normalize('NFKC').trim().replace(/\s+/g,' ');
export function validatedManualProposal(input){
 if(!input||typeof input!=='object'||Array.isArray(input))throw {status:422,error:'Richiesta cliente non valida.'};
 const name=normalize(input.name),city=normalize(input.city),address=normalize(input.address);
 if(name.length<2||name.length>500||city.length<2||city.length>500||address.length>1000)
  throw {status:422,error:'Inserisci nome e località validi.'};
 return {name,city,address};
}
export async function submitManualProposal(db,input,userId){
 if(!/^[0-9a-f-]{36}$/i.test(String(userId??'')))throw {status:403};
 const proposal=validatedManualProposal(input);
 const row={submitted_by:userId,...proposal};
 const result=await db.from('lts_manual_customer_requests').insert(row).select('id').maybeSingle();
 if(!result.error&&typeof result.data?.id==='string')return {pending:true,requestId:result.data.id};
 if(result.error?.code!=='23505')throw {status:503};
 const found=await db.from('lts_manual_customer_requests').select('id')
  .eq('submitted_by',userId).eq('name',proposal.name).eq('city',proposal.city)
  .eq('status','pending').maybeSingle();
 if(found.error||!found.data?.id)throw {status:409,error:'Richiesta già elaborata. Aggiorna la lista.'};
 return {pending:true,requestId:found.data.id};
}
