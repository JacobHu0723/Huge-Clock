// 定义版本号和缓存名称
var cacheStorageKey = 'minimal-pwa-27';

// 定义需要缓存的文件列表
var cacheList = [
  '/',
  "https://jacobhu0723.github.io/Huge-Clock/index.html",
  "https://jacobhu0723.github.io/Huge-Clock/manifest.json",
  "https://jacobhu0723.github.io/Huge-Clock/js/audio.js",
];

// 监听 install 事件，在安装 Service Worker 时缓存文件
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(cacheStorageKey)
    .then(cache => cache.addAll(cacheList))
    .then(() => self.skipWaiting())
  );
});

// 监听 activate 事件，在激活 Service Worker 时清除旧缓存
self.addEventListener('activate', function(e) {
  e.waitUntil(
    Promise.all([
      caches.keys().then(cacheNames => {
        return cacheNames.map(name => {
          if (name !== cacheStorageKey) {
            return caches.delete(name);
          }
        });
      })
    ]).then(() => {
      return self.clients.claim();
    })
  );
});

// 监听 fetch 事件，在发起网络请求时返回缓存的响应
self.addEventListener('fetch', event => {
  console.log('[Service Worker] Fetching something ....', event);
  // This fixes a weird bug in Chrome when you open the Developer Tools
  if (event.request.cache === 'only-if-cached' && event.request.mode !== 'same-origin') {
    return;
  }
  event.respondWith(
    caches.match(event.request)
    .then(response => {
      return response || fetch(event.request);
    })
  );
});