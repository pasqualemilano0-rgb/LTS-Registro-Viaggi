/**
 * Checked only after Supabase Auth getUser() has validated the bearer JWT.
 * The unverified decoded claims NEVER establish identity or authorization:
 * Postgres verifies session ownership and live non-revoked auth.sessions row.
 */
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function sessionIdFromJwt(jwt){
 if(typeof jwt!=='string'||jwt.length>4096)return null;
 const parts=jwt.split('.');
 if(parts.length!==3||!parts[1]||parts[1].length>8192||
   !/^[A-Za-z0-9_-]+$/.test(parts[1]))return null;
 try{
   const encoded=parts[1].replace(/-/g,'+').replace(/_/g,'/');
   const payload=JSON.parse(atob(encoded.padEnd(Math.ceil(encoded.length/4)*4,'=')));
   return UUID.test(payload?.session_id||'')?payload.session_id:null;
 }catch{return null}
}
export async function checkLtsSession(admin,jwt,userId){
 const sessionId=sessionIdFromJwt(jwt);
 if(!UUID.test(userId||'')||!sessionId)throw {status:401};
 const {data,error}=await admin.rpc('lts_session_is_active',
   {p_user_id:userId,p_session_id:sessionId});
 if(error||typeof data!=='boolean')throw {status:503};
 if(!data)throw {status:403};
 return sessionId;
}
