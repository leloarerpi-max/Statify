const C='statify-v12';
const ASSETS=['./','index.html','statify.css','statify.js','prono.html','prono.css','prono.js','chart.umd.min.js','fa.css','fa-solid-900.woff2','manifest.webmanifest','icon-192.png','icon-512.png','icon-180.png'];
// un fichier manquant ne doit pas faire échouer toute l'installation
self.addEventListener('install',e=>{e.waitUntil(caches.open(C).then(c=>Promise.all(ASSETS.map(a=>c.add(a).catch(()=>{})))).then(()=>self.skipWaiting()));});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==C).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));});
// réseau d'abord, mais si le réseau traîne (> 3 s) on sert la copie en cache
function netFirst(req){
  return new Promise(resolve=>{
    let done=false;
    const fromCache=()=>caches.match(req).then(r=>r||caches.match('index.html'));
    const timer=setTimeout(()=>{ if(done) return; fromCache().then(r=>{ if(r&&!done){done=true;resolve(r);} }); },3000);
    fetch(req).then(r=>{
      clearTimeout(timer);
      if(r&&r.ok){ const cp=r.clone(); caches.open(C).then(c=>c.put(req,cp)).catch(()=>{}); }
      if(!done){done=true;resolve(r);}
    }).catch(()=>{
      clearTimeout(timer);
      if(!done) fromCache().then(r=>{done=true;resolve(r||Response.error());});
    });
  });
}
self.addEventListener('fetch',e=>{
  if(e.request.method!=='GET') return;
  const u=new URL(e.request.url);
  if(u.origin!==location.origin) return;
  e.respondWith(netFirst(e.request));
});
