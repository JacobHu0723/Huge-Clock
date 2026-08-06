'use strict';

/* ══════════════════════════════════════════════
   时钟
   每 500 ms 轮询，秒数变化才写 DOM（避免每秒 2 次无效写入）；
   页面切后台时停表，回前台立即刷新并恢复。
   ══════════════════════════════════════════════ */
const mainEl = document.getElementById('main');
let lastClockSeconds = -1;
let clockInterval = null;

function updateClock(force = false) {
  const d   = new Date();
  const pad = n => String(n).padStart(2, '0');
  const s   = d.getSeconds();
  if (!force && s === lastClockSeconds) return; // 秒数未变，跳过 DOM 写入
  lastClockSeconds = s;
  mainEl.textContent =
    `${pad(d.getHours())} : ${pad(d.getMinutes())} : ${pad(s)}`;
}

function startClock() {
  clearInterval(clockInterval);
  clockInterval = setInterval(() => updateClock(), 500);
}

startClock();
updateClock(true); // 立即渲染，避免首次显示延迟

// 后台停表：页面不可见时不写 DOM，回前台立即刷新当前时间
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    clearInterval(clockInterval);
    clockInterval = null;
  } else {
    updateClock(true);
    startClock();
  }
});

/* ══════════════════════════════════════════════
   OLED 防烧屏像素位移（JS 离散跳变）
   替代原 360s CSS 连续动画：每 60 秒瞬间平移 1~2 像素，
   避免 GPU 持续合成动画层导致发热；后台时暂停跳变。
   ══════════════════════════════════════════════ */
const BURN_IN_PATTERN = [
  { x: -1, y: -1 },
  { x:  1, y: -1 },
  { x:  1, y:  1 },
  { x: -1, y:  1 },
];
let burnInStep = 0;
setInterval(() => {
  if (document.hidden) return; // 后台屏幕不显示，无需位移
  burnInStep = (burnInStep + 1) % BURN_IN_PATTERN.length;
  const p = BURN_IN_PATTERN[burnInStep];
  mainEl.style.transform = `translate(${p.x}px, ${p.y}px)`;
}, 60000);

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
   Wake Lock：阻止屏幕休眠（原生 Screen Wake Lock API）
   用户首次交互后才启用，避免页面一打开就保活耗电；
   切后台时浏览器自动释放，回前台重新申请；
   不支持 Wake Lock 的设备降级为不保活（屏幕正常休眠）。
   ══════════════════════════════════════════════ */
let wakeLockSentinel = null;

async function requestWakeLock() {
  if (!('wakeLock' in navigator)) return; // 不支持：降级为不保活
  try {
    if (wakeLockSentinel) return; // 已持有，不重复申请
    wakeLockSentinel = await navigator.wakeLock.request('screen');
    // 被系统释放（切后台 / 省电策略）后置空，便于回前台重新申请
    wakeLockSentinel.addEventListener('release', () => { wakeLockSentinel = null; });
  } catch (e) {
    wakeLockSentinel = null;
  }
}

const enableWakeLockOnFirstInteraction = () => {
  requestWakeLock();
  document.removeEventListener('pointerdown', enableWakeLockOnFirstInteraction);
  document.removeEventListener('keydown', enableWakeLockOnFirstInteraction);
};
document.addEventListener('pointerdown', enableWakeLockOnFirstInteraction);
document.addEventListener('keydown', enableWakeLockOnFirstInteraction);

// 切到后台时 Wake Lock 被浏览器自动释放；回前台重新申请
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) requestWakeLock();
});

/* ══════════════════════════════════════════════
   OLED 防烧屏空闲检测 (Idle Mode / Screensaver)
   在长时间(默认2分钟)无任何鼠标、键盘或触摸交互时
   切换为全黑文字+细框阴影的「空心字」，配合像素平移杜绝烧屏。
   ══════════════════════════════════════════════ */
let oledIdleTime = 0;
const OLED_IDLE_TIMEOUT = 120; // 120秒（2分钟）进入防烧屏待机

// 独立的鼠标隐藏逻辑参数
let mouseIdleTime = 0;
const MOUSE_IDLE_TIMEOUT = 5; // 无操作5秒后隐藏鼠标光标

function resetIdeState() {
  oledIdleTime = 0;
  mouseIdleTime = 0;
  
  if (document.body.classList.contains('oled-idle-mode')) {
    document.body.classList.remove('oled-idle-mode');
  }
  
  if (document.body.classList.contains('hide-cursor')) {
    document.body.classList.remove('hide-cursor');
  }
}

// 监听常用交互动作重置计时器
window.addEventListener('mousemove', resetIdeState, { passive: true });
window.addEventListener('keydown', resetIdeState, { passive: true });
window.addEventListener('touchstart', resetIdeState, { passive: true });
window.addEventListener('click', resetIdeState, { passive: true });
window.addEventListener('wheel', resetIdeState, { passive: true });

setInterval(() => {
  oledIdleTime++;
  mouseIdleTime++;
  
  if (oledIdleTime >= OLED_IDLE_TIMEOUT && typeof aodEnabled !== "undefined" && aodEnabled) {
    document.body.classList.add('oled-idle-mode');
  }
  
  // 如果超过了设定的秒数且不在隐藏状态，则自动隐藏光标
  if (mouseIdleTime >= MOUSE_IDLE_TIMEOUT) {
    document.body.classList.add('hide-cursor');
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


