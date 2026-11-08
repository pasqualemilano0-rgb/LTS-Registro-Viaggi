/* QA PRIVATA — lettore Google Maps sintetico; nessuna richiesta Google. */

export const readMapsCustomer=async(link)=>{
 if(link==='https://maps.app.goo.gl/newDepot')
  return {name:'CLIENTE DELTA',city:'CASERTA',address:'VIA PORTO 8, CASERTA',mapsUrl:link,warnings:[]};
 if(link==='https://maps.app.goo.gl/exampleC')
  return {name:'CLIENTE GAMMA',city:'ROMA',address:'VIA INDUSTRIA 25, ROMA',mapsUrl:link,warnings:[]};
 return {name:'CLIENTE ALFA',city:'NAPOLI',address:'VIA TEST 1, NAPOLI',mapsUrl:link,warnings:[]};
};

