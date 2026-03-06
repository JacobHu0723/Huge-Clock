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

/* ══════════════════════════════════════════════
   OLED 防烧屏空闲检测 (Idle Mode / Screensaver)
   在长时间(默认2分钟)无任何鼠标、键盘或触摸交互时
   切换为全黑文字+细框阴影的「空心字」，配合像素平移杜绝烧屏。
   ══════════════════════════════════════════════ */
let oledIdleTime = 0;
const OLED_IDLE_TIMEOUT = 120; // 120秒（2分钟）进入防烧屏待机

function resetOledIdle() {
  oledIdleTime = 0;
  if (document.body.classList.contains('oled-idle-mode')) {
    document.body.classList.remove('oled-idle-mode');
  }
}

// 监听常用交互动作重置计时器
window.addEventListener('mousemove', resetOledIdle, { passive: true });
window.addEventListener('keydown', resetOledIdle, { passive: true });
window.addEventListener('touchstart', resetOledIdle, { passive: true });
window.addEventListener('click', resetOledIdle, { passive: true });
window.addEventListener('wheel', resetOledIdle, { passive: true });

setInterval(() => {
  oledIdleTime++;
  if (oledIdleTime >= OLED_IDLE_TIMEOUT && typeof aodEnabled !== "undefined" && aodEnabled) {
    document.body.classList.add('oled-idle-mode');
  }
}, 1000);

/* ══════════════════════════════════════════════
   AOD 行为开关选项 (可使用 localStorage 记录用户设置)
   ══════════════════════════════════════════════ */
let aodEnabled = true; // 默认开启防烧屏AOD

function initAodToggle() {
  const toggleWrap = document.getElementById('aod-switch-wrap');
  const toggleBtn = document.getElementById('aod-toggle');
  
  if (!toggleBtn) return;
  
  // 恢复状态
  const savedState = localStorage.getItem('aodEnabled');
  if (savedState === 'false') {
    aodEnabled = false;
    toggleBtn.classList.remove('on');
  } else {
    aodEnabled = true;
    toggleBtn.classList.add('on');
  }

  // 点击事件
  toggleBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    aodEnabled = !aodEnabled;
    
    // UI 动画切换
    if (aodEnabled) {
      toggleBtn.classList.add('on');
      localStorage.setItem('aodEnabled', 'true');
    } else {
      toggleBtn.classList.remove('on');
      localStorage.setItem('aodEnabled', 'false');
      // 如果当前正在息屏模式中，被秒关了，则瞬间退出息屏
      if (document.body.classList.contains('oled-idle-mode')) {
        document.body.classList.remove('oled-idle-mode');
        oledIdleTime = 0;
      }
    }
  });
}

document.addEventListener('DOMContentLoaded', initAodToggle);

// 修改拦截机制：如果 AOD 是关的，永远不去加类名


