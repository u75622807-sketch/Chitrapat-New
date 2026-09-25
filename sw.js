// sw.js — Service Worker: ऐप को तेज़ और ऑफ़लाइन चलने लायक बनाता है
//
// पुरानी गड़बड़ियाँ (जो अब ठीक हैं):
//  1. यह फ़ाइल कहीं register ही नहीं थी (अब js/pwa.js में register होती है)
//  2. जिन फ़ाइलों को cache करना था (/assets/..., /icons/...) वो मौजूद ही नहीं थीं → install फ़ेल
//  3. "/" से शुरू होने वाले पाथ GitHub Pages के /Chitrapat-New/ फ़ोल्डर में ग़लत जगह जाते थे
//  4. हर चीज़ (वीडियो, Firebase डेटा) cache हो रही थी — अब सिर्फ़ ऐप की अपनी फ़ाइलें
const VERSION = 'v2.0.0';
const SHELL_CACHE = `chitrapat-shell-${VERSION}`;
const RUNTIME_CACHE = `chitrapat-runtime-${VERSION}`;

// सभी पाथ "relative" हैं — यानी साइट किसी भी फ़ोल्डर/डोमेन पर हो, चलेगी
const SHELL = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './config.js',
  './manifest.json',
  './js/utils.js',
  './js/store.js',
  './js/backend.js',
  './js/ui.js',
  './js/pages.js',
  './js/pwa.js',
  './js/demo-data.js',
  './icons/icon.svg',
  './icons/icon-192.png',
  './icons/favicon-32.png',
  './assets/fonts/mukta-devanagari-400-normal.woff2',
  './assets/fonts/mukta-devanagari-600-normal.woff2',
  './assets/fonts/mukta-devanagari-700-normal.woff2',
  './assets/fonts/mukta-latin-400-normal.woff2',
  './assets/fonts/mukta-latin-600-normal.woff2',
  './assets/fonts/mukta-latin-700-normal.woff2',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE)
      .then((cache) => cache.addAll(SHELL))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => k.startsWith('chitrapat-') && k !== SHELL_CACHE && k !== RUNTIME_CACHE)
          .map((k) => caches.delete(k)),
      ))
      .then(() => self.clients.claim()),
  );
});

// पहले नेटवर्क (ताकि हमेशा नया वर्ज़न मिले), नेट न हो तो cache
async function networkFirst(request, fallbackUrl) {
  const cache = await caches.open(SHELL_CACHE);
  try {
    const response = await fetch(request);
    if (response.ok && response.type === 'basic') cache.put(request, response.clone());
    return response;
  } catch (err) {
    const cached = await cache.match(request, { ignoreSearch: request.mode === 'navigate' });
    if (cached) return cached;
    if (fallbackUrl) {
      const fallback = await cache.match(fallbackUrl);
      if (fallback) return fallback;
    }
    throw err;
  }
}

// पहले cache (Firebase SDK जैसी फ़ाइलें जो वर्ज़न के साथ कभी नहीं बदलतीं)
async function cacheFirst(request) {
  const cache = await caches.open(RUNTIME_CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) cache.put(request, response.clone());
  return response;
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  // वीडियो (Range requests) कभी cache न करें — ये बहुत बड़े होते हैं
  if (request.headers.has('range') || request.destination === 'video' || request.destination === 'audio') return;

  const url = new URL(request.url);
  if (url.origin === self.location.origin) {
    if (/\.(mp4|webm|mov|m3u8)$/i.test(url.pathname)) return;
    event.respondWith(networkFirst(request, request.mode === 'navigate' ? './index.html' : null));
    return;
  }
  if (url.hostname === 'www.gstatic.com' && url.pathname.startsWith('/firebasejs/')) {
    event.respondWith(cacheFirst(request));
  }
  // बाकी सब (Firestore, Cloudinary, Analytics) — ब्राउज़र ख़ुद संभाले
});
