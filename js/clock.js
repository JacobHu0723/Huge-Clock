'use strict';

/* ══════════════════════════════════════════════
   时钟
   每 500 ms 刷新一次，确保整秒切换时不会漏掉
   ══════════════════════════════════════════════ */
const mainEl = document.getElementById('main');

function updateClock() {
  const d   = new Date();
  const pad = n => String(n).padStart(2, '0');
  mainEl.textContent =
    `${pad(d.getHours())} : ${pad(d.getMinutes())} : ${pad(d.getSeconds())}`;
}

setInterval(updateClock, 500);
updateClock(); // 立即渲染，避免首次显示延迟

/* ══════════════════════════════════════════════
   字体与布局自适应
   ══════════════════════════════════════════════ */
function recalcLayout() {
  const w = document.body.clientWidth;
  const h = document.body.clientHeight;
  if (!w) return;
  mainEl.style.top      = (h / 3.5) + 'px';
  mainEl.style.fontSize = (w / 6)   + 'px';
}

// 脚本位于 <body> 末尾，DOM 已就绪，可直接调用
recalcLayout();
// 屏幕旋转 / 窗口缩放时重新计算
const resizeEvt = 'orientationchange' in window ? 'orientationchange' : 'resize';
window.addEventListener(resizeEvt, recalcLayout);

/* ══════════════════════════════════════════════
   全屏切换
   ══════════════════════════════════════════════ */
function toggleFullscreen() {
  const inFullscreen =
    document.fullscreenElement       ||
    document.mozFullScreenElement    ||
    document.webkitFullscreenElement;

  if (!inFullscreen) {
    // 进入全屏
    const el = document.documentElement;
    if      (el.requestFullscreen)       el.requestFullscreen();
    else if (el.mozRequestFullScreen)    el.mozRequestFullScreen();
    else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen();
  } else {
    // 退出全屏
    if      (document.exitFullscreen)        document.exitFullscreen();
    else if (document.mozCancelFullScreen)   document.mozCancelFullScreen();
    else if (document.webkitExitFullscreen)  document.webkitExitFullscreen();
  }
}

/* ══════════════════════════════════════════════
   PWA：注册 Service Worker
   ══════════════════════════════════════════════ */
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/Huge-Clock/sw.js')
    .then(reg => console.log('SW registered, scope:', reg.scope))
    .catch(err => console.error('SW registration failed:', err));
}

/* ══════════════════════════════════════════════
   NoSleep：阻止屏幕休眠
   ══════════════════════════════════════════════ */
const noSleep = new NoSleep();
window.addEventListener('load', () => noSleep.enable(), { once: true });
