/** Snapshot editable trip controls; omitted fields preserve stored values. */
const TEXT_FIELDS=['date','client','city','container','secondClient','secondCity','adminNote'];
const MONEY_FIELDS=['fareCents','secondFareCents'];
export function snapshotAdminTripForm(input,serviceBoxes){
 return {
  fields:Object.fromEntries([...TEXT_FIELDS,...MONEY_FIELDS].map(key=>[key,input(key).value])),
  sumPickupFares:input('sumPickupFares').checked,
  services:serviceBoxes.map(({key,box,rate})=>({key,checked:box.checked,rate:rate.value,disabled:box.disabled}))
 };
}
export function buildAdminTripPatch(current,baseline,price){
 const patch={};
 for(const key of TEXT_FIELDS)
  if(!baseline||current.fields[key]!==baseline.fields[key])patch[key]=current.fields[key];
 for(const key of MONEY_FIELDS)
  if(!baseline||current.fields[key]!==baseline.fields[key]){
   const value=price(current.fields[key]);
   if(!baseline||value!==price(baseline.fields[key]))patch[key]=value;
  }
 if(!baseline||current.sumPickupFares!==baseline.sumPickupFares)patch.sumPickupFares=current.sumPickupFares;
 const previous=new Map((baseline?.services||[]).map(service=>[service.key,service]));
 if(!baseline||current.services.some(service=>!service.disabled&&service.checked!==previous.get(service.key)?.checked))
  patch.services=current.services.filter(service=>service.disabled&&baseline?previous.get(service.key)?.checked:service.checked).map(service=>service.key);
 const extraCents={};
 for(const service of current.services){
  if(service.disabled)continue;
  const old=previous.get(service.key);
  if(!baseline||!old||service.rate!==old.rate){
   const value=price(service.rate);
   if(!baseline||!old||value!==price(old.rate))extraCents[service.key]=value;
  }
 }
 if(!baseline||Object.keys(extraCents).length)patch.extraCents=extraCents;
 return patch;
}
