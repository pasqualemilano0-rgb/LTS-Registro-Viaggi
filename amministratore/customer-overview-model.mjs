/** Pure read-only metrics for the authenticated company customer directory. */
export function hasUsableAddress(value){
  if(typeof value!=='string'||!value.trim())return false;
  return !/INDIRIZZO STRADALE DA CONFERMARE|INDIRIZZO DA CONFERMARE|^DA CONFERMARE$/iu.test(value);
}
export function customerDirectoryStats(customers){
  const rows=Array.isArray(customers)?customers:[];
  const complete=rows.filter(row=>hasUsableAddress(row?.address)).length;
  return {total:rows.length,complete,incomplete:rows.length-complete,
    coverage:rows.length?Math.round(100*complete/rows.length):0};
}
export function selectedCustomerSites(customers,filter='incomplete'){
  const rows=Array.isArray(customers)?customers:[];
  const selected=rows.filter(row=>filter==='all'||
    (filter==='complete'?hasUsableAddress(row.address):!hasUsableAddress(row.address)));
  return selected.sort((a,b)=>
    Number(hasUsableAddress(a.address))-Number(hasUsableAddress(b.address))||
    a.name.localeCompare(b.name,'it')||a.city.localeCompare(b.city,'it'));
}
