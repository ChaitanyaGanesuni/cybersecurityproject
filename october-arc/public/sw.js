// October Arc service worker: app-shell caching for offline use.
// Navigations: network-first, falling back to the cached shell.
// Static assets (hashed by Vite): cache-first. API calls are never cached.
const CACHE = 'oa-shell-v1';
const SHELL = ['/', '/index.html', '/manifest.webmanifest', '/icon.svg'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin || url.pathname.startsWith('/api/')) return;
  if (e.request.mode === 'navigate') {
    e.respondWith(
      fetch(e.request)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put('/index.html', copy));
          return res;
        })
        .catch(() => caches.match('/index.html')),
    );
    return;
  }
  e.respondWith(
    caches.match(e.request).then(
      (hit) =>
        hit ||
        fetch(e.request).then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(e.request, copy));
          }
          return res;
        }),
    ),
  );
});

// Focus the app when a reminder is tapped.
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const target = e.notification.tag === 'night' ? '/#/checkin' : '/#/';
  e.waitUntil(
    self.clients.matchAll({ type: 'window' }).then((cs) => {
      const c = cs[0];
      if (c) return c.focus().then(() => c.navigate(target));
      return self.clients.openWindow(target);
    }),
  );
});
