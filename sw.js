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

const CACHE_NAME = 'chula-embarques-v7';
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

// fetch() no tiene límite de tiempo por su cuenta — en datos celulares con señal débil,
// una petición se puede quedar "colgada" sin fallar nunca, y como nunca falla, nunca cae
// al respaldo de caché de abajo (la página se queda esperando en vez de abrir con lo que
// ya había guardado). Esto le pone un límite: si la red no responde a tiempo, se aborta y
// se sigue con el catch de abajo como si hubiera fallado.
function fetchWithTimeout(request, ms) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  return fetch(request, { signal: controller.signal }).finally(() => clearTimeout(timer));
}

// El HTML principal siempre se pide primero a la red (para que cualquier cambio se
// vea de inmediato, sin depender de subir un número de versión nuevo). Si no hay
// internet (o tarda demasiado), usa la última copia guardada para que la app no se
// quede en blanco.
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
        // caches.match() puede regresar undefined (primera vez en este celular, o iOS ya
        // había borrado la caché por no usarse varios días) — pasarle undefined a
        // respondWith() tronaba la carga entera en vez de intentar algo más. Con datos
        // celulares de señal débil, la red SÍ suele responder, solo tarda más de los 5s
        // del timeout de arriba — así que sin caché de respaldo, se reintenta con un
        // fetch normal (sin límite de tiempo) en vez de darse por vencido.
        .catch(() => caches.match(event.request).then((cached) => cached || fetch(event.request)))
    );
    return;
  }

  // Íconos y manifest: caché primero (casi nunca cambian, así carga más rápido)
  event.respondWith(
    caches.match(event.request).then((response) => response || fetch(event.request))
  );
});
