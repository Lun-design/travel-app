/*
 * Lightweight offline shell for the Expo Router web export.
 * The build step replaces __BUILD_VERSION__ so every deployment produces a
 * new service-worker byte sequence and Safari checks for an update.
 */
const BUILD_VERSION = '__BUILD_VERSION__';
const CACHE_PREFIX = 'travel-planner-v7-';
const STATIC_CACHE = `${CACHE_PREFIX}static-${BUILD_VERSION}`;
const RUNTIME_CACHE = `${CACHE_PREFIX}runtime-${BUILD_VERSION}`;
const PRECACHE_URLS = ['/', '/manifest.json', '/icon.png', '/favicon.png', '/apple-touch-icon.png'];
const BUILD_PRECACHED_URLS = [];
/* __PRECACHE_MANIFEST__ */

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then((cache) => cache.addAll([...PRECACHE_URLS, ...BUILD_PRECACHED_URLS]))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys
          .filter((key) => key.startsWith(CACHE_PREFIX) && key !== STATIC_CACHE && key !== RUNTIME_CACHE)
          .map((key) => caches.delete(key)),
      ))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SHOW_ITINERARY_REMINDER') {
    const reminder = event.data.reminder || {};
    event.waitUntil(self.registration.showNotification(reminder.title || '⏰ 出發提醒', {
      body: reminder.body || '行程即將開始，請準備出發。',
      tag: reminder.tag || `itinerary-reminder-${reminder.itemId || 'next'}`,
      icon: '/icon.png',
      badge: '/icon.png',
      data: reminder.data || {},
    }));
    return;
  }
  if (event.data?.type !== 'CLEAR_RUNTIME_CACHE') return;
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys
        .filter((key) => key.startsWith(`${CACHE_PREFIX}runtime-`))
        .map((key) => caches.delete(key)),
    )),
  );
});

self.addEventListener('notificationclick', (event) => {
  const url = event.notification?.data?.url;
  event.notification.close();
  if (!url) return;
  event.waitUntil(self.clients.openWindow(url));
});

function isSameOrigin(request) {
  return new URL(request.url).origin === self.location.origin;
}

function isStaticAsset(url) {
  return url.pathname.startsWith('/_expo/')
    || /\.(?:js|css|png|jpe?g|gif|svg|webp|woff2?|ttf|json|pdf)$/i.test(url.pathname);
}

function isPrivateDataResource(url) {
  return /\/(?:auth\/v1|rest\/v1|storage\/v1)\//i.test(url.pathname)
    || /(?:documents|vouchers|travel-documents|tickets|receipts)/i.test(url.pathname);
}

// Trip-scoped read endpoints are safe to keep in the runtime cache so the
// last loaded itinerary can be opened offline. Mutations and auth endpoints
// never enter this path; logout also clears the runtime cache.
function isTripDataResource(request, url) {
  if (request.method !== 'GET') return false;
  if (!/\/rest\/v1\/(?:itinerary_items|trip_places|trips|trip_members|expenses|packing_items)(?:[/?]|$)/i.test(url.pathname)) return false;
  return url.searchParams.has('trip_id') || url.searchParams.has('id');
}

async function networkFirst(request) {
  const cache = await caches.open(RUNTIME_CACHE);
  try {
    const response = await fetch(request, { cache: 'no-store' });
    if (response.ok) await cache.put(request, response.clone());
    return response;
  } catch {
    const cached = await caches.match(request);
    return cached || new Response(JSON.stringify({ data: [], offline: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
    });
  }
}

function isCacheableResource(request, url) {
  if (isTripDataResource(request, url)) return true;
  // Only cache assets served by this app. This prevents signed/private files
  // hosted on a third-party CDN from becoming persistent browser cache data.
  if (url.origin !== self.location.origin) return false;
  if (isPrivateDataResource(url)) return false;
  return isStaticAsset(url)
    || request.destination === 'image'
    || request.destination === 'document';
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const sameOrigin = isSameOrigin(request);
  const url = new URL(request.url);
  if (isTripDataResource(request, url)) {
    event.respondWith(networkFirst(request));
    return;
  }
  if (!sameOrigin && !isCacheableResource(request, url)) return;

  if (request.mode === 'navigate') {
    if (!sameOrigin) return;
    event.respondWith((async () => {
      try {
        const response = await fetch(request, { cache: 'no-store' });
        if (response.ok) {
          const cache = await caches.open(RUNTIME_CACHE);
          await cache.put('/', response.clone());
        }
        return response;
      } catch {
        return (await caches.match(request)) || (await caches.match('/')) || new Response('離線模式：目前無法載入頁面。', {
          status: 503,
          headers: { 'Content-Type': 'text/plain; charset=utf-8' },
        });
      }
    })());
    return;
  }

  if (!isCacheableResource(request, url)) return;
  event.respondWith((async () => {
    const cache = await caches.open(RUNTIME_CACHE);
    const cached = await cache.match(request);
    const network = fetch(request)
      .then(async (response) => {
        if (response.ok || response.type === 'opaque') await cache.put(request, response.clone());
        return response;
      })
      .catch(() => undefined);

    if (cached) {
      // Serve immediately while refreshing the cached asset in the background.
      void network;
      return cached;
    }
    return (await network) || new Response('', { status: 504 });
  })());
});
