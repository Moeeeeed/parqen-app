// // PRAQEN app-shell service worker.
// //
// // This is intentionally minimal and NEVER caches anything under /api/ — this is a
// // financial trading app, and serving a stale cached balance, price, or trade status
// // while offline would be actively misleading. It only makes the static app shell
// // (JS/CSS/images/fonts) load faster on repeat visits and gives a real offline page
// // instead of the browser's default "no internet" error when navigation fails.
//
// const CACHE_NAME = 'praqen-shell-v1';
//
// const PRECACHE_URLS = [
//   '/',
//   '/offline.html',
//   '/manifest.json',
//   '/favicon.ico',
//   '/logo192.png',
//   '/logo512.png',
// ];
//
// self.addEventListener('install', (event) => {
//   event.waitUntil(
//     caches.open(CACHE_NAME)
//       .then((cache) => cache.addAll(PRECACHE_URLS))
//       .then(() => self.skipWaiting())
//   );
// });
//
// self.addEventListener('activate', (event) => {
//   event.waitUntil(
//     caches.keys()
//       .then((names) => Promise.all(
//         names.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n))
//       ))
//       .then(() => self.clients.claim())
//   );
// });
//
// self.addEventListener('fetch', (event) => {
//   const { request } = event;
//   if (request.method !== 'GET') return;
//
//   const url = new URL(request.url);
//
//   // Never touch API calls — always go to the network, never cache or intercept.
//   if (url.pathname.startsWith('/api/')) return;
//
//   // Only handle same-origin requests; let cross-origin (CDNs, Supabase, etc.) pass through.
//   if (url.origin !== self.location.origin) return;
//
//   // Navigation (HTML page loads): network-first, offline fallback if the network fails.
//   if (request.mode === 'navigate') {
//     event.respondWith(
//       fetch(request).catch(() =>
//         caches.match(request).then((cached) => cached || caches.match('/offline.html'))
//       )
//     );
//     return;
//   }
//
//   // Static assets (JS/CSS/images/fonts): cache-first, refresh the cache in the background.
//   event.respondWith(
//     caches.match(request).then((cached) => {
//       const networkFetch = fetch(request)
//         .then((response) => {
//           if (response && response.status === 200) {
//             const clone = response.clone();
//             caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
//           }
//           return response;
//         })
//         .catch(() => cached);
//       return cached || networkFetch;
//     })
//   );
// });
