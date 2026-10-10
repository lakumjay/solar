// SolarFlow PWA Service Worker
const CACHE_NAME = 'solarflow-cache-v53';
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

// Push Notifications Handler (With High-Priority AI Incoming Voice Call Support)
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

  const isEmergencyCall = payload.type === 'EMERGENCY_VOICE_CALL' || payload.data?.type === 'EMERGENCY_VOICE_CALL';

  const options = {
    body: payload.body,
    icon: payload.icon || '/icons/icon-192.png',
    badge: payload.badge || '/icons/icon-192.png',
    data: payload.data || { url: payload.url || '/' },
    vibrate: isEmergencyCall ? [800, 250, 800, 250, 1000, 300, 1200] : (payload.vibrate || [300, 150, 300, 150, 400]),
    sound: payload.sound || '/sounds/alert.mp3',
    requireInteraction: true,
    silent: false,
    tag: payload.tag || (isEmergencyCall ? 'solarflow-emergency-call' : 'solarflow-alert-' + Date.now()),
    renotify: true,
    actions: isEmergencyCall ? [
      { action: 'accept_call', title: '📞 કૉલ ઉપાડો (Accept)' },
      { action: 'decline_call', title: '❌ કૉલ કાપો (Decline)' }
    ] : []
  };

  event.waitUntil(
    Promise.all([
      self.registration.showNotification(payload.title, options),
      // Broadcast to all open app windows to trigger instant incoming phone call UI
      self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clients => {
        clients.forEach(client => {
          client.postMessage({
            type: isEmergencyCall ? 'EMERGENCY_VOICE_CALL' : 'PUSH_NOTIFICATION_RECEIVED',
            payload: payload
          });
        });
      })
    ])
  );
});

self.addEventListener('notificationclick', event => {
  event.notification.close();

  if (event.action === 'decline_call') {
    return;
  }

  const isEmergencyCall = event.action === 'accept_call' || event.notification.data?.type === 'EMERGENCY_VOICE_CALL';
  const urlToOpen = isEmergencyCall ? '/?incoming_call=1&auto_answer=1' : (event.notification.data?.url || '/');

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(windowClients => {
      for (let client of windowClients) {
        if ('focus' in client) {
          if (isEmergencyCall) {
            client.postMessage({
              type: 'EMERGENCY_VOICE_CALL_ACCEPT',
              payload: event.notification.data
            });
          }
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(urlToOpen);
      }
    })
  );
});
