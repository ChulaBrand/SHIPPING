// Service Worker propio de /check-in — al registrarse desde aquí, su scope por defecto
// es "/check-in/", así que solo controla páginas dentro de esta carpeta y no interfiere
// con el Service Worker de la raíz (que sigue controlando el resto del sitio).

const CACHE_NAME = 'chula-checkin-v1';
const urlsToCache = [
  './index.html',
  './manifest.json',
  '../icons/icon-192.png',
  '../icons/icon-512.png'
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(urlsToCache))
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(
        names.filter((name) => name !== CACHE_NAME).map((name) => caches.delete(name))
      )
    )
  );
  self.clients.claim();
});

function fetchWithTimeout(request, ms) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  return fetch(request, { signal: controller.signal }).finally(() => clearTimeout(timer));
}

self.addEventListener('fetch', (event) => {
  const url = event.request.url;

  if (url.includes('script.google.com')) return; // siempre red, datos en vivo del Sheet

  const isMainPage = url.includes('index.html') || event.request.mode === 'navigate';

  if (isMainPage) {
    event.respondWith(
      fetchWithTimeout(event.request, 5000)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
          return response;
        })
        .catch(() => caches.match(event.request).then((cached) => cached || fetch(event.request)))
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then((response) => response || fetch(event.request))
  );
});
