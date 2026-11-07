/** Transient diagnostic for Google Maps' public shortlink redirect chain.
 * Print host + path only, never credentials, query strings or IP addresses.
 */
const start='https://maps.app.goo.gl/rC9kQ6YrYGj9gjsU9';
let current=new URL(start);
for(let i=0;i<6;i++){
 const safe=(u)=>u.hostname.toLowerCase();
 let response;
 try{
  response=await fetch(current.href,{method:'GET',redirect:'manual',
   headers:{Accept:'text/html','Accept-Language':'it-IT,it;q=0.9'},
   signal:AbortSignal.timeout(9000)});
 }catch(e){
  console.log('MAPS_CHAIN '+JSON.stringify({hop:i,host:safe(current),path:current.pathname,
    networkError:e?.name||'unknown'}));break;
 }
 const loc=response.headers.get('location');
 let next=null;
 if(loc){try{next=new URL(loc,current);}catch{}}
 console.log('MAPS_CHAIN '+JSON.stringify({hop:i,status:response.status,
  host:safe(current),path:current.pathname,
  nextHost:next?.hostname||null,nextPath:next?.pathname||null,
  contentType:response.headers.get('content-type')?.split(';')[0]||null}));
 if(!next||![301,302,303,307,308].includes(response.status))break;
 current=next;
}
