const CACHE_NAME = 'streams-cache-v13.2';

const ASSETS_TO_CACHE = [
  '/index.html',
  '/polygol.html',
  '/streams.png',
  '/favicon.png'
];

// INSTALL: Cache all assets. This now uses a single, simpler call.
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('[SW] Caching core assets for new version.');
        // THE FIX: Use cache.addAll for the entire list.
        // It correctly handles CORS requests for cross-origin assets like fonts.
        return cache.addAll(ASSETS_TO_CACHE);
      })
      .catch(err => {
        console.error('[SW] Core asset caching failed:', err);
      })
  );
});

// ACTIVATE: Clean up old caches when this SW finally activates.
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            console.log(`[SW] Deleting old cache: ${cacheName}`);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => self.clients.claim()) // Take control of open clients
  );
});

// MESSAGE: Listen for commands from the main application.
self.addEventListener('message', event => {
    if (!event.data) return;

    // Command to activate the new, waiting service worker
    if (event.data.action === 'skipWaiting') {
        console.log('[SW] Received skipWaiting command. Activating new version.');
        self.skipWaiting();
    }

    // Command to cache a newly installed app's files
    if (event.data.action === 'cache-app') {
        const filesToCache = event.data.files;
        if (filesToCache && filesToCache.length > 0) {
            console.log(`[SW] Caching ${filesToCache.length} files for new app.`);
            event.waitUntil(
                caches.open(CACHE_NAME).then(cache => {
                    return cache.addAll(filesToCache)
                        .then(() => console.log('[SW] App caching complete.'))
                        .catch(err => console.warn(`[SW] Failed to cache one or more app files. The app may not work offline.`, err));
                })
            );
        }
    }

    // Command to remove a deleted app's files from the cache
    if (event.data.action === 'uncache-app') {
        const filesToDelete = event.data.filesToDelete;
        if (filesToDelete && filesToDelete.length > 0) {
            console.log(`[SW] Deleting ${filesToDelete.length} files for uninstalled app.`);
            event.waitUntil(
                caches.open(CACHE_NAME).then(cache => {
                    const deletePromises = filesToDelete.map(url => {
                        return cache.delete(url).then(wasDeleted => {
                            if (wasDeleted) {
                                console.log(`[SW] Uncached: ${url}`);
                            }
                        });
                    });
                    return Promise.allSettled(deletePromises);
                })
            );
        }
    }
});

// FETCH: Serve assets using a combination of strategies.
self.addEventListener('fetch', event => {
    const { request } = event;
    const url = new URL(request.url);

    // Strategy 1: Network Only for external APIs
    if (url.hostname === 'api.open-meteo.com' || url.hostname === 'nominatim.openstreetmap.org') {
        event.respondWith(fetch(request));
        return;
    }

    // Strategy 2: Cache First for everything else (core assets, fonts, app files)
    // This is fast and reliable for offline use. Updates are handled by the new SW version.
    event.respondWith(
        caches.match(request)
            .then(cachedResponse => {
                if (cachedResponse) {
                    return cachedResponse;
                }
                // If not in cache, fetch from network, cache it, and return it.
                return fetch(request).then(networkResponse => {
                    if (networkResponse && networkResponse.status === 200) {
                       return caches.open(CACHE_NAME).then(cache => {
                            // Use put for all requests, including opaque ones from CDNs
                            cache.put(request, networkResponse.clone());
                            return networkResponse;
                        });
                    }
                    return networkResponse;
                });
            })
    );
});
