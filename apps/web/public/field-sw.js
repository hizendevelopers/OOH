/* Public shell only. Auth, API responses, evidence and task HTML are NEVER cached. */
const CACHE='ibvs-public-field-v3-2';
self.addEventListener('install',event=>event.waitUntil((async()=>{
 const cache=await caches.open(CACHE);
 const response=await fetch('/field',{credentials:'omit',cache:'reload'});
 if(!response.ok)throw new Error('Offline shell download failed');
 const html=await response.clone().text();
 const assets=[...html.matchAll(/(?:src|href)="(\/_next\/static\/[^"<>]+)"/g)].map(match=>match[1].replaceAll('&amp;','&'));
 await cache.addAll([...new Set([...assets,'/field-192.png','/field-512.png','/manifest.webmanifest'])]);
 await cache.put('/field',response);
 // An update waits for existing clients to close; never interrupt a camera draft.
})()));
self.addEventListener('activate',event=>event.waitUntil((async()=>{for(const name of await caches.keys())if(name.startsWith('ibvs-public-field-')&&name!==CACHE)await caches.delete(name);await self.clients.claim();})()));
self.addEventListener('fetch',event=>{
 const request=event.request,url=new URL(request.url);
 if(request.method!=='GET'||url.origin!==self.location.origin||url.pathname.startsWith('/api/'))return;
 if(request.mode==='navigate'&&url.pathname==='/field'){
  event.respondWith((async()=>{try{const response=await fetch(request);if(response.ok)return response;}catch{/* Explicit offline fallback to a public, non-personalized shell. */}return (await caches.open(CACHE)).match('/field');})());return;
 }
 if(url.pathname.startsWith('/_next/static/')||['/field-192.png','/field-512.png','/manifest.webmanifest'].includes(url.pathname))event.respondWith((async()=>{const cache=await caches.open(CACHE);const cached=await cache.match(request);if(cached)return cached;const response=await fetch(request);if(response.ok)await cache.put(request,response.clone());return response;})());
});
