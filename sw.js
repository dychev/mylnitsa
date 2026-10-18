/* ph-y service worker: opens instantly from cache, updates in the background (works offline and on slow EDGE) */
const CACHE='phy-v13';
const CORE=['./','index.html','util.js?v=13','gl.js?v=13','presets.js?v=13','sample.js?v=13','app.js?v=13','manifest.webmanifest','icon-180.png','icon-192.png','icon-512.png'];
self.addEventListener('install',e=>{ e.waitUntil(caches.open(CACHE).then(c=>Promise.allSettled(CORE.map(u=>c.add(u))).then(()=>Promise.allSettled([c.add('heic2any.min.js')]))).then(()=>self.skipWaiting())); });
self.addEventListener('activate',e=>{ e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())); });
self.addEventListener('fetch',e=>{
  const req=e.request; if(req.method!=='GET') return;
  const url=new URL(req.url); if(url.origin!==location.origin) return;
  if(req.mode==='navigate'){
    e.respondWith(caches.open(CACHE).then(async c=>{
      const cached=await c.match('index.html');
      const net=fetch(req).then(r=>{ if(r.ok) c.put('index.html',r.clone()); return r; }).catch(()=>null);
      if(cached){ e.waitUntil(net); return cached; }
      return (await net) || new Response('<h1 style="font-family:system-ui">ph-y: нет сети</h1>',{headers:{'Content-Type':'text/html; charset=utf-8'}});
    }));
    return;
  }
  e.respondWith(caches.open(CACHE).then(async c=>{
    const hit=await c.match(req); if(hit) return hit;
    try { const r=await fetch(req); if(r.ok) c.put(req,r.clone()); return r; } catch(err){ return new Response('',{status:504}); }
  }));
});
