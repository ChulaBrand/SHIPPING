// Notificaciones push (Firebase Cloud Messaging) — solo se disparan cuando llega un
// push y esta pantalla NO está abierta/enfocada (con la pantalla abierta, Firebase lo
// entrega directo al JS de la página en vez de aquí). Va en un try/catch: si esto
// falla (CDN de Firebase no disponible, navegador raro), el resto del Service Worker
// (caché sin conexión, lo que ya llevaba funcionando) debe seguir funcionando igual.
try {
  importScripts('https://www.gstatic.com/firebasejs/10.7.0/firebase-app-compat.js');
  importScripts('https://www.gstatic.com/firebasejs/10.7.0/firebase-messaging-compat.js');
  firebase.initializeApp({
    apiKey: "AIzaSyBmZfwEFOpN4O1TRynOrac57yM6YKWPhJI",
    authDomain: "chula-shipping.firebaseapp.com",
    projectId: "chula-shipping",
    storageBucket: "chula-shipping.firebasestorage.app",
    messagingSenderId: "558898601922",
    appId: "1:558898601922:web:9b028a38e28bd1e08b805b"
  });
  const messaging = firebase.messaging();
  messaging.onBackgroundMessage((payload) => {
    const title = (payload.notification && payload.notification.title) || 'Chula Brand';
    const body = (payload.notification && payload.notification.body) || '';
    self.registration.showNotification(title, { body, icon: './icons/icon-192.png' });
  });
} catch (e) { /* sin avisos en segundo plano, pero el resto del Service Worker sigue igual */ }

const CACHE_NAME = 'chula-embarques-v6';
const urlsToCache = [
  './index.html',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png'
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

// El HTML principal siempre se pide primero a la red (para que cualquier cambio se
// vea de inmediato, sin depender de subir un número de versión nuevo). Si no hay
// internet, usa la última copia guardada para que la app no se quede en blanco.
self.addEventListener('fetch', (event) => {
  const url = event.request.url;

  if (url.includes('script.google.com')) return; // siempre red, datos en vivo del Sheet

  const isMainPage = url.includes('index.html') || event.request.mode === 'navigate';

  if (isMainPage) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
          return response;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // Íconos y manifest: caché primero (casi nunca cambian, así carga más rápido)
  event.respondWith(
    caches.match(event.request).then((response) => response || fetch(event.request))
  );
});
