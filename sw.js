// 版本号变更会触发 Service Worker 更新并清除旧缓存
const CACHE_VERSION = 'huge-clock-v49';

// 缓存清单：相对路径（相对于 sw.js 作用域），首项 './' 即应用目录入口本身，
// 恰好等于 PWA start_url 的导航请求（.../Huge-Clock/），离线导航可精确命中。
const CACHE_FILES = [
  './',
  './index.html',
  './manifest.json',
  './css/style.css',
  './js/clock.js',
  './js/pomodoro.js',
  './js/audio.js',
  './files/clock.png',
  './files/clock-apple.png',
  './files/maskable_icon_x192.png',
];

// 安装：逐个缓存并容错，任一资源失败不阻塞整体安装（addAll 原子性会导致全盘失败）
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_VERSION)
      .then(cache => Promise.all(
        CACHE_FILES.map(url => cache.add(url).catch(() => {
          console.warn('SW 缓存跳过（资源不可用）:', url);
        }))
      ))
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

// 请求拦截：优先缓存，未命中走网络（成功后回写缓存）；导航请求离线时兜底返回缓存的应用页
self.addEventListener('fetch', event => {
  // Chrome DevTools 打开时会产生 only-if-cached + cors 的请求，需跳过
  if (event.request.cache === 'only-if-cached' && event.request.mode !== 'same-origin') {
    return;
  }
  // 导航请求（页面跳转/刷新/启动）：缓存命中 → 网络（回写）→ 离线回退到缓存的 index.html
  if (event.request.mode === 'navigate') {
    event.respondWith(
      caches.match(event.request)
        .then(cached => cached || fetch(event.request).then(response => {
          if (response.ok) { // 仅成功响应回写缓存，避免 404/500 导航响应被缓存投毒
            const copy = response.clone();
            caches.open(CACHE_VERSION).then(cache => cache.put(event.request, copy));
          }
          return response;
        }))
        .catch(() => caches.match('./index.html'))
    );
    return;
  }
  event.respondWith(
    caches.match(event.request)
      .then(cached => {
        if (cached) return cached;
        return fetch(event.request).then(response => {
          if (response.ok && event.request.method === 'GET') {
            const copy = response.clone();
            caches.open(CACHE_VERSION).then(cache => cache.put(event.request, copy));
          }
          return response;
        });
      })
  );
});
