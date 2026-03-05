'use strict';

/* ══════════════════════════════════════════════
   曲目列表
   增删歌曲只需修改这里，无需改动其他任何地方
   ══════════════════════════════════════════════ */
const TRACKS = [
  'files/rain.mp3',
  'files/meditation.mp3',
  'files/Wait on the Lord.mp3',
  'files/YanDaiXieJie.mp3',
  'files/XingChaHui.mp3',
  'files/SuoNianJieXingHe.mp3',
];

let currentIndex = 0;
let isPlaying    = false;

const music  = new Audio(TRACKS[currentIndex]);
music.loop   = true;

/* ══════════════════════════════════════════════
   播放 / 暂停
   ══════════════════════════════════════════════ */
function togglePlay() {
  if (isPlaying) {
    music.pause();
  } else {
    // play() 返回 Promise，捕获浏览器自动播放策略拦截的错误
    music.play().catch(() => {});
  }
  isPlaying = !isPlaying;
}

/* ══════════════════════════════════════════════
   切换曲目（delta: +1 下一首，-1 上一首）
   ══════════════════════════════════════════════ */
function changeTrack(delta) {
  currentIndex = (currentIndex + delta + TRACKS.length) % TRACKS.length;
  music.src  = TRACKS[currentIndex];
  music.loop = true;
  if (isPlaying) music.play().catch(() => {});
}

/* ══════════════════════════════════════════════
   音量 HUD
   ══════════════════════════════════════════════ */
const volumeHud    = document.getElementById('volume-hud');
const volumeTextEl = document.getElementById('volume-text');
let   volumeHudTimer = null;

function showVolumeHud() {
  volumeTextEl.textContent = Math.round(music.volume * 100) + '%';
  volumeHud.classList.add('visible');
  document.body.classList.add('vol-hud-active');
  clearTimeout(volumeHudTimer);
  volumeHudTimer = setTimeout(() => {
    volumeHud.classList.remove('visible');
    document.body.classList.remove('vol-hud-active');
  }, 1800);
}

/* ══════════════════════════════════════════════
   调整音量（钳位在 0 ~ 1 之间）
   ══════════════════════════════════════════════ */
function adjustVolume(delta) {
  music.volume = Math.min(1, Math.max(0, music.volume + delta));
  showVolumeHud();
}

/* ══════════════════════════════════════════════
   键盘事件（使用标准 e.key，替代已废弃的 e.keyCode）
   ══════════════════════════════════════════════ */
function handleKeyDown(e) {
  switch (e.key) {
    case 'ArrowLeft':  changeTrack(-1);                        break;
    case 'ArrowRight': changeTrack(1);                         break;
    case 'ArrowUp':    adjustVolume(0.05);                     break;
    case 'ArrowDown':  adjustVolume(-0.05);                    break;
    case ' ':          e.preventDefault(); togglePlay();       break;
    case 'Enter':      toggleFullscreen();                     break;
    case 'F11':        e.preventDefault(); toggleFullscreen(); break;
    case 'p':
    case 'P':          if (window._pomKeyP)   window._pomKeyP();   break;
    case 'r':
    case 'R':          if (window._pomKeyR)   window._pomKeyR();   break;
    case 'Escape':     if (window._pomKeyEsc) window._pomKeyEsc(); break;
  }
}

/* ══════════════════════════════════════════════
   滚轮事件（使用标准 deltaY，替代非标准 wheelDelta）
   ══════════════════════════════════════════════ */
function handleWheel(e) {
  adjustVolume(e.deltaY < 0 ? 0.05 : -0.05);
}

/* ══════════════════════════════════════════════
   绑定所有事件（集中管理，不使用 HTML 内联属性）
   ══════════════════════════════════════════════ */
mainEl.addEventListener('click',   togglePlay);
document.addEventListener('dblclick',  toggleFullscreen);
document.addEventListener('keydown',   handleKeyDown);
window.addEventListener('wheel',       handleWheel, { passive: true });

/* ══════════════════════════════════════════════
   触摸滑动事件
     左划  → 下一曲      右划  → 上一曲
     上划  → 音量增大    下划  → 音量减小
   最小触发距离 50px；以位移较大的轴判断方向
   ══════════════════════════════════════════════ */
let touchStartX = 0;
let touchStartY = 0;
let lastTouchY  = 0;
let touchDir    = null; // null | 'vertical' | 'horizontal'
let touchOnUI   = false; // 是否触摸在番茄钟面板 / FAB 上

document.addEventListener('touchstart', e => {
  // 首次触摸：标记为触摸设备，禁用快捷键 tooltip
  if (!document.body.classList.contains('is-touch')) {
    document.body.classList.add('is-touch');
  }
  touchOnUI = !!e.target.closest('#pom-panel, #pom-fab');
  if (touchOnUI) { touchDir = null; return; }
  touchStartX = e.changedTouches[0].clientX;
  touchStartY = e.changedTouches[0].clientY;
  lastTouchY  = touchStartY;
  touchDir    = null;
}, { passive: true });

// 必须为非 passive，才能在竖向滑动时调用 preventDefault()
// 阻止移动端浏览器的"下拉刷新"默认行为
document.addEventListener('touchmove', e => {
  if (touchOnUI) return;
  const touch = e.changedTouches[0];
  const dx = touch.clientX - touchStartX;
  const dy = touch.clientY - touchStartY;

  // 累积位移超过 8px 后确定手势方向（只判定一次）
  if (touchDir === null && (Math.abs(dx) > 8 || Math.abs(dy) > 8)) {
    touchDir = Math.abs(dy) >= Math.abs(dx) ? 'vertical' : 'horizontal';
  }

  if (touchDir === 'vertical') {
    e.preventDefault();
    // 用与上一帧的增量实时调节音量，整屏滑完 = 满量程
    const deltaY = touch.clientY - lastTouchY;
    lastTouchY = touch.clientY;
    adjustVolume(-deltaY / window.innerHeight);
  }
}, { passive: false });

document.addEventListener('touchend', e => {
  if (touchOnUI) { touchDir = null; return; }
  const touch = e.changedTouches[0];
  const dx = touch.clientX - touchStartX;

  // 水平手势：松手时切换曲目（最小 50px）
  if (touchDir === 'horizontal' && Math.abs(dx) >= 50) {
    changeTrack(dx < 0 ? +1 : -1);
  }
  touchDir = null;
}, { passive: true });