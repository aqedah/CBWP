/* Offline support: the app itself updates whenever online (network first);
   the Bible text, icons, fonts and libraries are kept after the first visit (cache first).
   Team data is handled by Firestore's own offline cache. */
const V="cbwp-v2";
const SHELL=["./","index.html","platform.js","config.js","manifest.webmanifest","icons/icon-192.png","icons/icon-512.png"];
self.addEventListener("install",e=>{e.waitUntil(caches.open(V).then(c=>c.addAll(SHELL)).then(()=>self.skipWaiting()));});
self.addEventListener("activate",e=>{e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==V).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));});
self.addEventListener("fetch",e=>{const r=e.request;if(r.method!=="GET")return;const u=new URL(r.url);
  if(/googleapis\.com$|firebaseio\.com$|identitytoolkit|securetoken/.test(u.hostname)&&!/fonts\.googleapis\.com/.test(u.hostname))return;
  const sameShell=u.origin===location.origin&&!/bible\.json$|\/icons\//.test(u.pathname);
  if(sameShell){e.respondWith(fetch(r).then(res=>{const cp=res.clone();caches.open(V).then(c=>c.put(r,cp));return res;}).catch(()=>caches.match(r).then(m=>m||caches.match("index.html"))));return;}
  e.respondWith(caches.match(r).then(m=>m||fetch(r).then(res=>{if(res.ok||res.type==="opaque"){const cp=res.clone();caches.open(V).then(c=>c.put(r,cp));}return res;})));});
