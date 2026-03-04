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
   调整音量（钳位在 0 ~ 1 之间）
   ══════════════════════════════════════════════ */
function adjustVolume(delta) {
  music.volume = Math.min(1, Math.max(0, music.volume + delta));
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

document.addEventListener('touchstart', e => {
  touchStartX = e.changedTouches[0].clientX;
  touchStartY = e.changedTouches[0].clientY;
}, { passive: true });

// 必须为非 passive，才能在竖向滑动时调用 preventDefault()
// 阻止移动端浏览器的"下拉刷新"默认行为
document.addEventListener('touchmove', e => {
  const dx = e.changedTouches[0].clientX - touchStartX;
  const dy = e.changedTouches[0].clientY - touchStartY;
  // 判定为竖向手势时屏蔽默认行为（含下拉刷新）
  if (Math.abs(dy) > Math.abs(dx)) {
    e.preventDefault();
  }
}, { passive: false });

document.addEventListener('touchend', e => {
  const dx = e.changedTouches[0].clientX - touchStartX;
  const dy = e.changedTouches[0].clientY - touchStartY;
  const absDx = Math.abs(dx);
  const absDy = Math.abs(dy);

  if (absDx >= absDy && absDx >= 50) {
    // 水平滑动：切换曲目
    changeTrack(dx < 0 ? +1 : -1);  // 左划下一曲，右划上一曲
  } else if (absDy > absDx && absDy >= 50) {
    // 垂直滑动：按滑动距离比例调节音量（整屏滑完 = 音量满量程）
    // dy < 0 → 上划 → 音量增大；dy > 0 → 下划 → 音量减小
    adjustVolume(-dy / window.innerHeight);
  }
}, { passive: true });