// October Arc service worker: app-shell caching for offline use.
// Navigations: network-first, falling back to the cached shell.
// Static assets (hashed by Vite): cache-first. API calls are never cached.
const CACHE = 'oa-shell-v2';
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

// ---- Notification taps and action buttons ----

const localDate = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('october-arc');
    // The app creates the schema; never create an empty DB from here.
    req.onupgradeneeded = () => req.transaction.abort();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

const done = (tx) => new Promise((res, rej) => { tx.oncomplete = res; tx.onerror = () => rej(tx.error); tx.onabort = () => rej(tx.error); });
const result = (r) => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });

/** Log water exactly like the app does: the record plus an outbox entry for sync. */
async function logWater(ml) {
  const db = await openDb();
  try {
    const now = Date.now();
    const date = localDate();
    const id = crypto.randomUUID();
    const record = { id, updatedAt: now, date, ml, at: now };
    const tx = db.transaction(['water', 'outbox'], 'readwrite');
    tx.objectStore('water').put(record);
    tx.objectStore('outbox').put({ key: `water:${id}`, table: 'water', id, at: now });
    await done(tx);
    const rtx = db.transaction(['water', 'settings'], 'readonly');
    const entries = await result(rtx.objectStore('water').index('date').getAll(date));
    const settings = await result(rtx.objectStore('settings').get('settings'));
    return { record, total: entries.reduce((a, w) => a + w.ml, 0), goal: settings?.goals?.waterMl ?? 0 };
  } finally {
    db.close();
  }
}

// Same format as the app: 3000 -> "3.0 L", 2250 -> "2.25 L", 1500 -> "1.5 L".
const liters = (ml) => {
  const l = ml / 1000;
  return `${l % 1 === 0 ? l.toFixed(1) : l.toFixed(2).replace(/0$/, '')} L`;
};

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const m = /^water-add:(\d+)$/.exec(e.action || '');
  if (m) {
    const ml = Number(m[1]);
    e.waitUntil(
      logWater(ml)
        .then(async ({ record, total, goal }) => {
          const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
          clients.forEach((c) => c.postMessage({ type: 'water-logged', ml, record }));
          const complete = goal && total >= goal;
          await self.registration.showNotification(complete ? '🎉 Daily hydration goal completed!' : `💧 +${ml} ml logged`, {
            body: goal ? `${liters(total)} / ${liters(goal)} today.` : `${liters(total)} today.`,
            tag: 'water',
            icon: '/icon.svg',
            silent: true,
          });
        })
        .catch(() => self.clients.openWindow('/#/today/water')),
    );
    return;
  }
  const type = e.notification.data?.type || e.notification.tag;
  const target = type === 'night' ? '/#/checkin' : String(type).startsWith('water') ? '/#/today/water' : '/#/';
  e.waitUntil(
    self.clients.matchAll({ type: 'window' }).then((cs) => {
      const c = cs[0];
      if (c) return c.focus().then(() => c.navigate(target));
      return self.clients.openWindow(target);
    }),
  );
});
