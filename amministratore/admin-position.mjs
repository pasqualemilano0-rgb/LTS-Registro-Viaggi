/** Admin-only location bookmark for the current browser tab.
 * Keeps no input values, driver/customer data, password, invitation or MFA code.
 */
const KEY='lts-admin-position-v1';
const VIEWS=new Set(['overview','drivers','trips','analysis','alerts','exports','security']);
const TTL=30*60*1000;
export function rememberPosition(owner,view,x,y,at=Date.now()){
 if(typeof owner!=='string'||!/^account:[0-9a-f-]{36}$/i.test(owner)||!VIEWS.has(view))return false;
 if(!Number.isFinite(x)||!Number.isFinite(y)||!Number.isFinite(at))return false;
 try{
  sessionStorage.setItem(KEY,JSON.stringify({
   owner,view,x:Math.max(0,Math.min(1000000,Math.round(x))),
   y:Math.max(0,Math.min(1000000,Math.round(y))),at
  }));
  return true;
 }catch{return false;}
}
export function readPosition(owner,now=Date.now()){
 if(typeof owner!=='string')return null;
 try{
  const saved=JSON.parse(sessionStorage.getItem(KEY)||'null');
  if(!saved||saved.owner!==owner||!VIEWS.has(saved.view)||
     !Number.isSafeInteger(saved.x)||!Number.isSafeInteger(saved.y)||
     saved.x<0||saved.y<0||saved.x>1000000||saved.y>1000000||
     !Number.isFinite(saved.at)||now-saved.at<0||now-saved.at>TTL)return null;
  return saved;
 }catch{return null;}
}
export function clearPosition(){
 try{sessionStorage.removeItem(KEY);}catch{}
}
