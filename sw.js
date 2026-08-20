const CACHE='fila-cero-v014-shell-1';
const SHELL=['/','/index.html','/styles.css','/config.js','/supabase-client.js','/auth.js','/app.js','/features-v013.js','/features-v014.js','/pwa.js','/calendar.js','/offline.html','/pago.html','/manifest.webmanifest','/icons/icon-192.png','/icons/icon-512.png'];
self.addEventListener('install',event=>{event.waitUntil(caches.open(CACHE).then(c=>c.addAll(SHELL)).then(()=>self.skipWaiting()))});
self.addEventListener('activate',event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()))});
self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET')return;
  const url=new URL(event.request.url);
  if(url.origin!==self.location.origin)return;
  if(event.request.mode==='navigate'){
    event.respondWith(fetch(event.request).then(r=>{const copy=r.clone();caches.open(CACHE).then(c=>c.put(event.request,copy));return r}).catch(()=>caches.match(event.request).then(r=>r||caches.match('/offline.html'))));
    return;
  }
  event.respondWith(caches.match(event.request).then(cached=>cached||fetch(event.request).then(r=>{if(r.ok){const copy=r.clone();caches.open(CACHE).then(c=>c.put(event.request,copy))}return r})));
});
self.addEventListener('push',event=>{
  let data={};try{data=event.data?event.data.json():{}}catch{data={body:event.data?.text()||''}}
  const title=data.title||'Fila Cero';
  const options={body:data.body||'Tienes una nueva actualización.',icon:'/icons/icon-192.png',badge:'/icons/icon-192.png',tag:data.tag||'fila-cero',data:{url:data.url||'/cuenta.html#notificaciones'},renotify:true};
  event.waitUntil(self.registration.showNotification(title,options));
});
self.addEventListener('notificationclick',event=>{
  event.notification.close();
  const target=new URL(event.notification.data?.url||'/',self.location.origin).href;
  event.waitUntil(self.clients.matchAll({type:'window',includeUncontrolled:true}).then(clients=>{for(const c of clients){if(c.url===target&&'focus'in c)return c.focus()}return self.clients.openWindow?self.clients.openWindow(target):undefined}));
});
