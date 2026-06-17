// Autonomic Map Offline Caching Service Worker (Mapbox & OpenFreeMap tiles)
const MAP_CACHE_NAME = 'uber-cleaner-map-tiles-v1';
const APP_SHELL_CACHE_NAME = 'uber-cleaner-app-shell-v1';

// Basic app shell assets for offline loading of UI skeleton
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/src/main.tsx',
  '/src/App.tsx',
  '/src/index.css'
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(APP_SHELL_CACHE_NAME).then((cache) => {
      console.log('[SW] Pre-caching offline support app assets...');
      return cache.addAll(STATIC_ASSETS).catch((err) => {
        console.warn('[SW] Non-blocking: Pre-caching dynamic dev files skipped:', err);
      });
    })
  );
});

self.addEventListener('activate', (event) => {
  console.log('[SW] Activated and taking control of clients.');
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);

  // We only intercept GET requests
  if (request.method !== 'GET') {
    return;
  }

  // Check if it is a map style, glyph/font, sprite, or tile request
  const isMapAsset =
    url.hostname.includes('tiles.openfreemap.org') ||
    url.hostname.includes('tile.openstreetmap.org') ||
    url.hostname.includes('api.mapbox.com') ||
    url.hostname.includes('basemaps.cartocdn.com') ||
    url.pathname.includes('/tiles/') ||
    url.pathname.includes('/styles/') ||
    url.pathname.includes('/fonts/') ||
    url.pathname.includes('/glyphs/') ||
    url.pathname.includes('/sprites/') ||
    url.href.includes('maplibre') ||
    url.href.includes('mapbox');

  if (isMapAsset) {
    // For map tiles, glyphs (fonts) and sprites (icons), use a Cache-First, fallback to Network with background update (Stale-While-Revalidate)
    // Map tile/font/sprite requests are static, large, and immutable, making Cache-First highly optimal for fast load time and complete offline reliability.
    const isImmutableMapAsset = 
      url.pathname.includes('/tiles/') ||
      url.pathname.includes('/fonts/') ||
      url.pathname.includes('/glyphs/') ||
      url.pathname.includes('/sprites/') ||
      url.href.includes('.png') ||
      url.href.includes('.pbf');

    if (isImmutableMapAsset) {
      event.respondWith(
        caches.open(MAP_CACHE_NAME).then((cache) => {
          return cache.match(request).then((cachedResponse) => {
            if (cachedResponse) {
              // Stale-While-Revalidate: Serve from cache immediately, then trigger fetch in background to refresh cache state if online
              fetch(request).then((networkResponse) => {
                if (networkResponse.status === 200 || networkResponse.type === 'opaque') {
                  cache.put(request, networkResponse);
                }
              }).catch(() => {}); // silent catch if offline
              return cachedResponse;
            }

            // Not in cache, fetch from network and cache
            return fetch(request).then((networkResponse) => {
              if (networkResponse.status === 200 || networkResponse.type === 'opaque') {
                cache.put(request, networkResponse.clone());
              }
              return networkResponse;
            }).catch((err) => {
              console.warn('[SW] Network offline. Failed to fetch map tile:', url.href);
              throw err;
            });
          });
        })
      );
    } else {
      // Network-First, fallback to Cache for map style sheets (e.g. style JSON files)
      // This allows updating the styling dynamic configurations but ensures fallback if offline.
      event.respondWith(
        caches.open(MAP_CACHE_NAME).then((cache) => {
          return fetch(request)
            .then((networkResponse) => {
              if (networkResponse.status === 200) {
                cache.put(request, networkResponse.clone());
              }
              return networkResponse;
            })
            .catch(() => {
              return cache.match(request).then((cachedResponse) => {
                if (cachedResponse) {
                  return cachedResponse;
                }
                // Return fallback style skeleton if completely offline and stylesheet missing
                return new Response(JSON.stringify({
                  version: 8,
                  sources: {},
                  layers: []
                }), {
                  status: 200,
                  headers: { 'Content-Type': 'application/json' }
                });
              });
            });
        })
      );
    }
  } else {
    // Normal files (HTML/JS/CSS/Local assets) - use Network-First, fallback to Cache
    // This maintains immediate consistency online, but allows full offline load.
    event.respondWith(
      caches.open(APP_SHELL_CACHE_NAME).then((cache) => {
        return fetch(request)
          .then((networkResponse) => {
            // Only cache valid GET responses of our own origin
            if (networkResponse.status === 200 && url.origin === location.origin) {
              cache.put(request, networkResponse.clone());
            }
            return networkResponse;
          })
          .catch(() => {
            return cache.match(request).then((cachedResponse) => {
              if (cachedResponse) {
                return cachedResponse;
              }
              
              // Handle main routing offline navigation (SPA index.html fallback)
              if (request.mode === 'navigate') {
                return cache.match('/index.html') || cache.match('/');
              }
            });
          });
      })
    );
  }
});
