// QA account-state integration. Call only AFTER the existing authorized() checks.

export async function readNoteHistory(req,admin,user,input,sessionIdFromJwt){
 if(user?.role!=='driver')throw {status:403};
 if(!input||Object.keys(input).some(k=>!['action','tripId','before'].includes(k))||
  typeof input.tripId!=='string'||!input.tripId.trim()||input.tripId.length>128||
  (input.before!=null&&(typeof input.before!=='string'||!/^\d{1,19}$/.test(input.before)||BigInt(input.before)<=0n||BigInt(input.before)>9223372036854775807n)))throw {status:400};
 const sessionId=sessionIdFromJwt((req.headers.get('Authorization')||'').replace(/^Bearer /,''));
 if(!sessionId)throw {status:401};
 const {data,error}=await admin.rpc('lts_read_trip_note_history',{
  p_user_id:user.id,p_session_id:sessionId,p_trip_id:input.tripId,p_before:input.before??null});
 if(error)throw {status:error.code==='42501'?403:error.code==='22023'?400:503};
 if(!Array.isArray(data)||data.length>21)throw {status:503};
 const rows=data.slice(0,20);
 return {userId:user.clientId,tripId:input.tripId,rows,nextBefore:data.length>20?rows.at(-1).event_id:null};
}
