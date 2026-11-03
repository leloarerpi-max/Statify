const C='statify-v28';
const IMG='statify-img-v1';
const ASSETS=['./','index.html','backup.js','xlsx.js','statify.css','statify.js','statify-studio.js','goal.mp3','prono.html','prono.css','prono.js','chart.umd.min.js','fa.css','fa-solid-900.woff2','manifest.webmanifest','icon-192.png','icon-512.png','icon-180.png'];
// un fichier manquant ne doit pas faire échouer toute l'installation
self.addEventListener('install',e=>{e.waitUntil(caches.open(C).then(c=>Promise.all(ASSETS.map(a=>c.add(a).catch(()=>{})))).then(()=>self.skipWaiting()));});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==C&&k!==IMG).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));});
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
  // logos et photos (ESPN, NBA…) : copie gardée pour les revoir hors ligne
  if(u.origin!==location.origin){
    if(e.request.destination==='image'){
      e.respondWith(caches.open(IMG).then(c=>c.match(e.request).then(hit=>{
        const net=fetch(e.request).then(r=>{ if(r&&(r.ok||r.type==='opaque')){ c.put(e.request,r.clone()).then(()=>c.keys()).then(ks=>{ if(ks.length>600) c.delete(ks[0]); }).catch(()=>{}); } return r; }).catch(()=>hit||Response.error());
        return hit||net;
      })));
    }
    return;
  }
  e.respondWith(netFirst(e.request));
});
