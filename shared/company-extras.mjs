/** Company-owned extra-service prices. Saved journeys keep their snapshots.
 * A missing/offline corporate rate NEVER falls back to personal legacy rates.
 */
export function companyExtraSnapshot(extraRates,loaded,key,{unchanged=false,previous=null}={}){
 if(unchanged)return previous??null;
 // A cached old company catalog must not accidentally re-enable REEFER for
 // a new journey; existing journey snapshots retain their original amount.
 if(key==='reefer')return null;
 if(!loaded)return null;
 const rate=(Array.isArray(extraRates)?extraRates:[]).find(x=>x.serviceKey===key);
 return rate&&(rate.cents===null||
  (Number.isSafeInteger(rate.cents)&&rate.cents>=0&&rate.cents<=99999999))
  ?rate.cents:null;
}
