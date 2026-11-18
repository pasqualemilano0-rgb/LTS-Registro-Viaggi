/**
 * Pure, unprivileged performance helpers. No authentication or network decisions.
 * A wake gate only coalesces passive UI sync requests; explicit server events,
 * online notifications and session revalidation must bypass it.
 */
export function createPassiveWakeGate({gapMs=1500,now=()=>Date.now()}={}){
 if(!Number.isFinite(gapMs)||gapMs<0)throw new TypeError('Intervallo di coalescenza non valido.');
 if(typeof now!=='function')throw new TypeError('Orologio non valido.');
 let lastAt=null;
 return function mayRefreshAfterWake(){
  const current=now();
  if(!Number.isFinite(current))return true;
  if(lastAt!==null&&current>=lastAt&&current-lastAt<gapMs)return false;
  // A clock correction must never leave the refresh path blocked.
  lastAt=current;
  return true;
 };
}

/**
 * Customer choices depend on the account-specific state and shared directory.
 * Build on first search, reuse during typing, invalidate after every catalog
 * or archive update. Instances are local to the currently rendered form.
 */
export function createLazyCustomerChoices(build){
 if(typeof build!=='function')throw new TypeError('Generatore clienti non valido.');
 let valid=false;
 let value;
 return {
  get(){
   if(!valid){value=build();valid=true;}
   return value;
  },
  invalidate(){valid=false;value=undefined;}
 };
}
