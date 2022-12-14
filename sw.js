var cacheStorageKey = 'minimal-pwa-25'

var cacheList = [
  '/',
  "https://jacobhu0723.github.io/Huge-Clock/index.html",
  "https://jacobhu0723.github.io/Huge-Clock/manifest.json",
  "https://jacobhu0723.github.io/Huge-Clock/js/audio.js",
]

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(cacheStorageKey)
    .then(cache => cache.addAll(cacheList))
    .then(() => self.skipWaiting())
  )
})

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(cacheStorageKey)
    .then(cache => cache.addAll(cacheList))
    .then(() => self.skipWaiting())
  )
})

self.addEventListener('activate', function(e) {
  e.waitUntil(
    Promise.all([
      caches.keys().then(cacheNames => {
        return cacheNames.map(name => {
          if (name !== cacheStorageKey) {
            return caches.delete(name)
          }
        })
      })
    ]).then(() => {
      return self.clients.claim()
    })
  )
})

self.addEventListener('fetch', event => {
  console.log('[Service Worker] Fetching something ....', event);
  // This fixes a weird bug in Chrome when you open the Developer Tools
  if (event.request.cache === 'only-if-cached' && event.request.mode !== 'same-origin') {
      return;
  }
  event.respondWith(fetch(event.request));
});