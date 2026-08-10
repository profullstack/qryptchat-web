/**
 * @fileoverview Simple Service Worker for QryptChat PWA
 * Basic offline functionality without ES module imports
 */

// Bumped to v1 -> v2 so clients running the old cache-first worker drop the
// stale app shell they precached on install.
const CACHE_NAME = 'qryptchat-v2';
const OFFLINE_SHELL = '/';
const STATIC_CACHE_URLS = [
  OFFLINE_SHELL,
  '/manifest.json',
  '/icons/icon-192x192.png',
  '/icons/icon-512x512.png',
  '/favicon.svg'
];

/**
 * Content-addressed or rarely-changing assets that are safe to serve from cache.
 * Everything else (API routes, SSE streams, auth) must always hit the network —
 * encrypted message payloads must never come back from a cache.
 * @param {URL} url
 * @returns {boolean}
 */
function isCacheableAsset(url) {
  if (url.pathname.startsWith('/api/')) return false;
  return (
    url.pathname.startsWith('/_next/static/') ||
    url.pathname.startsWith('/icons/') ||
    url.pathname.startsWith('/fonts/') ||
    url.pathname === '/manifest.json' ||
    /\.(?:png|jpe?g|svg|webp|ico|woff2?|css)$/.test(url.pathname)
  );
}

// Install event - cache static resources
self.addEventListener('install', (event) => {
  console.log('Service Worker installing...');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('Opened cache');
        return cache.addAll(STATIC_CACHE_URLS);
      })
      .then(() => {
        // Skip waiting to activate immediately
        return self.skipWaiting();
      })
  );
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  console.log('Service Worker activating...');
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log('Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => {
      // Take control of all pages
      return self.clients.claim();
    })
  );
});

// Fetch event
self.addEventListener('fetch', (event) => {
  const { request } = event;

  // Never intercept uploads/mutations or third-party origins (Supabase, analytics).
  if (request.method !== 'GET') return;

  let url;
  try {
    url = new URL(request.url);
  } catch {
    return;
  }
  if (url.origin !== self.location.origin) return;

  // Page loads are network-first with the cached shell as an offline fallback.
  // Cache-first here pinned the installed app to the HTML captured at install
  // time, whose hashed Next.js chunks stop existing after the next deploy.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok && url.pathname === OFFLINE_SHELL) {
            const copy = response.clone();
            event.waitUntil(
              caches.open(CACHE_NAME).then((cache) => cache.put(OFFLINE_SHELL, copy))
            );
          }
          return response;
        })
        .catch(async () => {
          const cached = await caches.match(OFFLINE_SHELL);
          return cached || Response.error();
        })
    );
    return;
  }

  if (!isCacheableAsset(url)) return;

  event.respondWith(
    caches.match(request).then((cached) => cached || fetch(request))
  );
});

// Handle push notifications
self.addEventListener('push', (event) => {
  if (!event.data) return;

  try {
    const data = event.data.json();
    const { title, body, icon, tag } = data;

    const options = {
      body: body || 'New message received',
      icon: icon || '/icons/icon-192x192.png',
      tag: tag || 'qryptchat-message',
      requireInteraction: true,
      actions: [
        {
          action: 'view',
          title: 'View'
        }
      ]
    };

    event.waitUntil(
      self.registration.showNotification(title || 'QryptChat', options)
    );
  } catch (error) {
    console.error('Error handling push notification:', error);
    // Show a generic notification
    event.waitUntil(
      self.registration.showNotification('QryptChat', {
        body: 'New message received',
        icon: '/icons/icon-192x192.png'
      })
    );
  }
});

// Handle notification clicks
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const url = '/chat';

  event.waitUntil(
    self.clients.matchAll({ type: 'window' }).then((clientList) => {
      // Check if app is already open
      for (const client of clientList) {
        if (client.url.includes('/chat') && 'focus' in client) {
          return client.focus();
        }
      }

      // Open new window if app is not open
      if (self.clients.openWindow) {
        return self.clients.openWindow(url);
      }
    })
  );
});

// Handle app updates
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

console.log('Service Worker loaded');