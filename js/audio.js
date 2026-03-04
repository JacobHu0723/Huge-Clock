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