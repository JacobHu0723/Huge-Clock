// 版本号变更会触发 Service Worker 更新并清除旧缓存
const CACHE_VERSION = 'huge-clock-v31';

const CACHE_FILES = [
  '/',
  'https://jacobhu0723.github.io/Huge-Clock/index.html',
  'https://jacobhu0723.github.io/Huge-Clock/manifest.json',
  'https://jacobhu0723.github.io/Huge-Clock/css/style.css',
  'https://jacobhu0723.github.io/Huge-Clock/js/clock.js',
  'https://jacobhu0723.github.io/Huge-Clock/js/audio.js',
  'https://jacobhu0723.github.io/Huge-Clock/js/NoSleep.min.js',
];

// 安装：缓存所有静态资源，安装完成后立即激活
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_VERSION)
      .then(cache => cache.addAll(CACHE_FILES))
      .then(() => self.skipWaiting())
  );
});

// 激活：删除所有旧版本缓存
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(names => Promise.all(
        names
          .filter(name => name !== CACHE_VERSION)
          .map(name => caches.delete(name))
      ))
      .then(() => self.clients.claim())
  );
});

// 请求拦截：优先返回缓存，缓存未命中则发起网络请求
self.addEventListener('fetch', event => {
  // Chrome DevTools 打开时会产生 only-if-cached + cors 的请求，需跳过
  if (event.request.cache === 'only-if-cached' && event.request.mode !== 'same-origin') {
    return;
  }
  event.respondWith(
    caches.match(event.request)
      .then(response => response || fetch(event.request))
  );
});