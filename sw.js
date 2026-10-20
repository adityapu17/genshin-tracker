const CACHE = 'genshin-tracker-v12';
const SHELL = [
  '/', '/index.html', '/manifest.json',
  '/css/style.css', '/js/api.js', '/js/app.js', '/js/push.js', '/js/splash.js',
  '/icons/icon-192.png', '/icons/icon-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Only cache app shell (static assets). Never cache API calls (Cloudflare Worker / Netlify functions)
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (url.origin !== self.location.origin) return; // cross-origin (Cloudflare Worker) -> always network
  if (url.pathname.startsWith('/.netlify/functions/')) return; // always network
  e.respondWith(
    caches.match(e.request).then((cached) => cached || fetch(e.request))
  );
});

// ---- Push (remote-triggered notifications) ----
// Payload yang dikirim send-push.js: { title, body, icon, data: { url } }
self.addEventListener('push', (e) => {
  let payload = {};
  try { payload = JSON.parse(e.data?.text?.() ?? '{}'); } catch { /* notifikasi tanpa data */ }
  const title = payload.title || 'Genshin Tracker';
  const opts = {
    body: payload.body || '',
    icon: payload.icon || '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    data: payload.data || { url: '/index.html' },
    tag: payload.tag,
    renotify: true,
  };
  e.waitUntil(self.registration.showNotification(title, opts));
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const target = e.notification.data?.url || '/index.html';
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const c of clientList) if (c.url === target) return c.focus();
      return self.clients.openWindow(target);
    })
  );
});
