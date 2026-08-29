'use strict';

const CACHE_NAME = 'ratownik-plk-v2-2.6.0';
const APP_SHELL = [
  './',
  './index.html',
  './styles.css',
  './data.js',
  './app.js',
  './manifest.webmanifest',
  './assets/icons/icon-192.png',
  './assets/icons/icon-512.png',
  './assets/topics/sec01.jpg',
  './assets/topics/sec02.jpg',
  './assets/topics/sec03.jpg',
  './assets/topics/sec04.jpg',
  './assets/topics/sec05.jpg',
  './assets/topics/sec06.jpg',
  './assets/topics/sec07.jpg',
  './assets/topics/sec08.jpg',
  './assets/topics/sec09.jpg',
  './assets/topics/sec10.jpg'
];
const CACHEABLE_PATHS = new Set(APP_SHELL.map(function (path) { return new URL(path, self.location.href).pathname; }));
const PUBLIC_SCOPE_PATH = new URL(self.registration.scope).pathname;
const PUBLIC_NAVIGATION_PATHS = new Set([PUBLIC_SCOPE_PATH, PUBLIC_SCOPE_PATH + 'index.html']);

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(function (cache) { return cache.addAll(APP_SHELL); })
  );
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys()
      .then(function (keys) {
        return Promise.all(keys.filter(function (key) { return key !== CACHE_NAME; }).map(function (key) { return caches.delete(key); }));
      })
      .then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('message', function (event) {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

function cleanNotificationText(value, fallback, maximum) {
  const cleaned = String(value == null ? '' : value).replace(/[\u0000-\u001f\u007f]/g, ' ').trim();
  return cleaned.slice(0, maximum || 180) || fallback;
}

function safeNotificationUrl(value) {
  const fallback = new URL('./internal/', self.registration.scope).href;
  try {
    const candidate = new URL(value || fallback, fallback);
    const internalPath = new URL('./internal/', self.registration.scope).pathname;
    return candidate.origin === self.location.origin && candidate.pathname.startsWith(internalPath)
      ? candidate.href
      : fallback;
  } catch (error) {
    return fallback;
  }
}

self.addEventListener('push', function (event) {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch (error) {
    payload = {};
  }

  const title = cleanNotificationText(payload.title, 'Ratownik PLK — potrzebna pomoc', 90);
  const options = {
    body: cleanNotificationText(payload.body, 'Otwórz panel, aby zobaczyć szczegóły alarmu.', 220),
    icon: './assets/icons/icon-192.png',
    badge: './assets/icons/icon-192.png',
    tag: cleanNotificationText(payload.tag, 'ratownik-plk-alert', 120),
    renotify: true,
    requireInteraction: true,
    data: {
      openUrl: safeNotificationUrl(payload.openUrl)
    }
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', function (event) {
  event.notification.close();
  const targetUrl = safeNotificationUrl(event.notification.data && event.notification.data.openUrl);
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (windows) {
      const existing = windows.find(function (client) {
        return client.url === targetUrl || client.url.startsWith(targetUrl);
      });
      if (existing) return existing.focus();
      return self.clients.openWindow(targetUrl);
    })
  );
});

self.addEventListener('fetch', function (event) {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  if (event.request.mode === 'navigate') {
    // Panel wewnętrzny pozostaje poza publicznym cache i fallbackiem offline.
    if (!PUBLIC_NAVIGATION_PATHS.has(url.pathname)) return;
    event.respondWith(
      fetch(event.request)
        .then(function (response) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then(function (cache) { cache.put('./index.html', copy); });
          return response;
        })
        .catch(function () { return caches.match('./index.html'); })
    );
    return;
  }

  if (!CACHEABLE_PATHS.has(url.pathname)) return;

  event.respondWith(
    caches.match(event.request).then(function (cached) {
      if (cached) return cached;
      return fetch(event.request).then(function (response) {
        if (!response || response.status !== 200 || response.type !== 'basic') return response;
        const copy = response.clone();
        caches.open(CACHE_NAME).then(function (cache) { cache.put(event.request, copy); });
        return response;
      });
    })
  );
});
