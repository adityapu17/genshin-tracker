const CACHE = 'genshin-tracker-v2';
const SHELL = [
  '/', '/index.html', '/manifest.json',
  '/css/style.css', '/js/app.js', '/js/api.js',
  '/icons/icon-192.png', '/icons/icon-512.png'
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
