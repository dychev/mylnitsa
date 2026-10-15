const CACHE='mylnitsa-v1';
const FILES=['./','index.html','util.js','gl.js','presets.js','sample.js','app.js','heic2any.min.js','manifest.webmanifest','icon-180.png','icon-192.png','icon-512.png'];
self.addEventListener('install',e=>{ e.waitUntil(caches.open(CACHE).then(c=>c.addAll(FILES)).then(()=>self.skipWaiting())); });
self.addEventListener('activate',e=>{ e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())); });
self.addEventListener('fetch',e=>{
  if(e.request.method!=='GET') return;
  // network first for the page so updates arrive, cache first for everything else
  if(e.request.mode==='navigate'){ e.respondWith(fetch(e.request).then(r=>{ const cp=r.clone(); caches.open(CACHE).then(c=>c.put('index.html',cp)); return r; }).catch(()=>caches.match('index.html'))); return; }
  e.respondWith(caches.match(e.request,{ignoreSearch:true}).then(m=>m||fetch(e.request)));
});
