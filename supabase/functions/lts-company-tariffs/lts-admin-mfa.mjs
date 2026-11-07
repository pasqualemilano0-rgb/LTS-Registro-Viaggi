/**
 * Supabase Auth getUser(jwt) MUST succeed before using JWT aal claims.
 * Claims are never authority by themselves. SQL checks whether the user's
 * first-party verified TOTP factor exists (no secret exposed).
 */
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
export function jwtAssurance(jwt){
 if(typeof jwt!=='string'||jwt.length>4096)return 'aal1';
 const p=jwt.split('.')[1];
 if(!p||p.length>8192||!/^[A-Za-z0-9_-]+$/.test(p))return 'aal1';
 try{
  const value=p.replace(/-/g,'+').replace(/_/g,'/');
  const parsed=JSON.parse(atob(value.padEnd(Math.ceil(value.length/4)*4,'=')));
  return parsed?.aal==='aal2'?'aal2':'aal1';
 }catch{return 'aal1'}
}
export async function adminFactor(admin,userId){
 if(!UUID.test(userId||''))throw {status:401};
 const {data,error}=await admin.rpc('lts_admin_verified_totp_factor',{p_user_id:userId});
 if(error||!(data===null||data===undefined||UUID.test(data)))throw {status:503};
 return data||null;
}
/** Called only AFTER validated Supabase Auth JWT and account role. */
export async function requireAdminMfa(admin,jwt,userId){
 const factorId=await adminFactor(admin,userId);
 if(factorId&&jwtAssurance(jwt)!=='aal2')throw {status:428};
 return {enrolled:Boolean(factorId),verified:factorId?true:false,factorId};
}
