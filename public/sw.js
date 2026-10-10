// SolarFlow PWA Service Worker
const CACHE_NAME = 'solarflow-cache-v52';
const ASSETS_TO_CACHE = [
  '/site.webmanifest',
  '/icons/icon-192.png',
  '/icons/icon-512.png'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(ASSETS_TO_CACHE).catch(() => {});
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
      );
    })
  );
  self.clients.claim();
});

// Network-first with cache fallback
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  if (event.request.url.includes('/api/')) return; // Always dynamic for API

  // HTML navigation & build assets: ALWAYS fetch fresh from network to avoid stale hashed script errors
  if (event.request.mode === 'navigate' || event.request.url.includes('/build/')) {
    event.respondWith(
      fetch(event.request).catch(() => caches.match(event.request))
    );
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then(response => {
        if (response.status === 200) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        }
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});

// Push Notifications Handler
self.addEventListener('push', event => {
  let payload = {
    title: 'SolarFlow Notification',
    body: 'Daily Solar Generation & Revenue Summary',
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    url: '/'
  };

  try {
    if (event.data) {
      payload = { ...payload, ...event.data.json() };
    }
  } catch (e) {
    if (event.data) {
      payload.body = event.data.text();
    }
  }

  const options = {
    body: payload.body,
    icon: payload.icon || '/icons/icon-192.png',
    badge: payload.badge || '/icons/icon-192.png',
    data: { url: payload.url || '/' },
    vibrate: payload.vibrate || [300, 150, 300, 150, 400],
    sound: payload.sound || '/sounds/alert.mp3',
    requireInteraction: true,
    silent: false,
    tag: payload.tag || 'solarflow-alert-' + Date.now(),
    renotify: true
  };

  event.waitUntil(
    Promise.all([
      self.registration.showNotification(payload.title, options),
      // Also notify any open app windows to play audible chime
      self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clients => {
        clients.forEach(client => {
          client.postMessage({ type: 'PUSH_NOTIFICATION_RECEIVED', payload: payload });
        });
      })
    ])
  );
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const urlToOpen = event.notification.data?.url || '/';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(windowClients => {
      for (let client of windowClients) {
        if (client.url === urlToOpen && 'focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(urlToOpen);
      }
    })
  );
});
