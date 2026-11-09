// Retire the formerly public Control Center PWA.
self.addEventListener('install',event=>event.waitUntil(self.skipWaiting()));
self.addEventListener('activate',event=>event.waitUntil((async()=>{
 const keys=await caches.keys();
 await Promise.all(keys.filter(key=>key.startsWith('lts-control-center-')).map(key=>caches.delete(key)));
 await self.clients.claim();
 await self.registration.unregister();
})()));
self.addEventListener('fetch',event=>{
 const url=new URL(event.request.url);
 if(event.request.method!=='GET'||url.origin!==self.location.origin||!url.pathname.startsWith('/LTS-Registro-Viaggi/status/'))return;
 event.respondWith(fetch(event.request,{cache:'no-store'}).catch(()=>Response.redirect('/LTS-Registro-Viaggi/amministratore/',302)));
});
