// Dedicated, scope-restricted service worker for the public LTS Control Center.
// This does not intercept LTS driver/admin pages or GitHub API responses.
const BASE='/LTS-Registro-Viaggi/status/';
const CACHE='lts-control-center-v1-20261109';
const CORE=[BASE, BASE+'index.html',BASE+'status.css',BASE+'status.mjs',BASE+'manifest.webmanifest'];
self.addEventListener('install',event=>{
  event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(CORE)).then(()=>self.skipWaiting()));
});
self.addEventListener('activate',event=>{
  event.waitUntil(Promise.all([
    caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('lts-control-center-')&&k!==CACHE).map(k=>caches.delete(k)))),
    self.clients.claim()
  ]));
});
self.addEventListener('fetch',event=>{
  const req=event.request;
  if(req.method!=='GET')return;
  const url=new URL(req.url);
  if(url.origin!==self.location.origin||!url.pathname.startsWith(BASE))return;
  // Network first. Only public UI files are cached; never API/status responses.
  event.respondWith(fetch(req).then(async response=>{
    if(response.ok&&response.type==='basic'&&response.status===200){
      const cache=await caches.open(CACHE);
      await cache.put(req,response.clone());
    }
    return response;
  }).catch(async()=>{
    const match=await caches.match(req);
    if(match)return match;
    if(req.mode==='navigate')return (await caches.match(BASE+'index.html')) || Response.error();
    return Response.error();
  }));
});
self.addEventListener('notificationclick',event=>{
  event.notification.close();
  const url=new URL(BASE,self.location.origin).href;
  event.waitUntil(self.clients.matchAll({type:'window',includeUncontrolled:true}).then(async clients=>{
    for(const client of clients){
      if(client.url.startsWith(url)&&'focus' in client) return client.focus();
    }
    return self.clients.openWindow(url);
  }));
});
