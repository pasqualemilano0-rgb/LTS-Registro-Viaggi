export const sharedMapsEnabled=()=>true;
/* QA PRIVATA — solo sedi sintetiche. */

let rows=[
 {name:'CLIENTE ALFA',city:'NAPOLI',address:'VIA TEST 1, NAPOLI',
  mapsUrl:'https://maps.app.goo.gl/exampleA',source:'google_maps_link',operationalNotes:''},
 {name:'CLIENTE BETA',city:'SALERNO',address:'VIA TEST 2, SALERNO',
  mapsUrl:'https://maps.app.goo.gl/exampleB',source:'google_maps_link',operationalNotes:''},
 {name:'CLIENTE GAMMA',city:'ROMA',address:'INDIRIZZO STRADALE DA CONFERMARE',
  mapsUrl:'https://maps.app.goo.gl/exampleC',source:'google_maps_link',operationalNotes:''}
];
export const sharedMapsCustomers=async()=>structuredClone(rows);
export const saveSharedMapsCustomer=async(mapsUrl,site)=>{
 const known=rows.find(row=>row.mapsUrl===mapsUrl);
 if(known){
  if(known.address.includes('DA CONFERMARE')&&known.name===site.name&&known.city===site.city){
   known.address=site.address;
   return {customer:structuredClone(known),created:false,updated:true};
  }
  return {customer:structuredClone(known),created:false};
 }
 const created={...site,mapsUrl,source:'google_maps_link',operationalNotes:''};
 rows.push(created);return {customer:structuredClone(created),created:true};
};
export const saveSharedManualCustomer=async site=>{
 const known=rows.find(row=>row.name===site.name&&row.city===site.city);
 if(known)return {customer:structuredClone(known),created:false};
 const created={name:site.name,city:site.city,address:site.address||'',
  mapsUrl:'',source:'manual',operationalNotes:site.notes||''};
 rows.push(created);
 return {customer:structuredClone(created),created:true};
};

