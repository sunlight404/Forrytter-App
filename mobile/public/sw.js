const CACHE = 'forrytter-offline-v1';
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.add('/offline.html')).then(() => self.skipWaiting()));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('forrytter-offline-') && key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});
// Only an offline explanation is cached. Never cache accounts, tasks or API responses.
self.addEventListener('fetch', event => {
  if (event.request.mode === 'navigate' && new URL(event.request.url).origin === self.location.origin) {
    event.respondWith(fetch(event.request).catch(() => caches.match('/offline.html')));
  }
});

self.addEventListener('push',event=>{
 let data={};try{data=event.data?.json()||{};}catch{}
 event.waitUntil(self.registration.showNotification(data.title||'Fôrrytter App',{
  body:data.body||'Åpne appen for å se oppdateringen.',icon:'/icon-192.png',
  tag:data.id||'forrytter-update',data:{url:data.url||'/'},
 }));
});
self.addEventListener('notificationclick',event=>{
 event.notification.close();
 let url=new URL('/',self.location.origin);
 try{const candidate=new URL(event.notification.data?.url||'/',self.location.origin);if(candidate.origin===self.location.origin)url=candidate;}catch{}
 event.waitUntil(self.clients.matchAll({type:'window',includeUncontrolled:true}).then(async clients=>{
  for(const client of clients){if(new URL(client.url).origin===url.origin){await client.navigate(url.href);return client.focus();}}
  return self.clients.openWindow(url.href);
 }));
});
