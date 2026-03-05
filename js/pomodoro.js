'use strict';

/* ══════════════════════════════════════════════
   番茄钟（Pomodoro Timer）
   ──────────────────────────────────────────────
   [P]   首次调出并开始；再按 → 暂停 / 恢复
   [R]   重置当前阶段倒计时
   [Esc] 关闭面板（计时同步暂停）
   🍅   右下角浮动按钮，等同 [P]
   点击面板 → 开始 / 暂停
   ══════════════════════════════════════════════ */

// ── 阶段配置 ───────────────────────────────────
const POM_PHASES = [
  { id: 'focus',       label: '专注',    duration: 25 * 60, color: '#ff7043' },
  { id: 'short-break', label: '短休息',  duration:  5 * 60, color: '#43d08a' },
  { id: 'long-break',  label: '长休息',  duration: 15 * 60, color: '#4db6ff' },
];

const POM_MAX_ROUNDS = 4; // 几轮专注后进入长休息

// ── 状态 ──────────────────────────────────────
let pomVisible  = false;
let pomRunning  = false;
let pomPhaseIdx = 0;
let pomTimeLeft = POM_PHASES[0].duration;
let pomRounds   = 0;       // 当前大轮内已完成的专注次数
let pomInterval = null;
let pomTargetSessions = 4;   // 预计需要的番茄数（默认 4）
let pomTotalFocusDone = 0;   // 当前任务已完成的专注次数

// ── DOM 引用 ───────────────────────────────────
const pomPanelEl  = document.getElementById('pom-panel');
const pomLabelEl  = document.getElementById('pom-label');
const pomRingFgEl = document.getElementById('pom-ring-fg');
const pomTimeEl   = document.getElementById('pom-time');
const pomDotsEl   = document.getElementById('pom-dots');
const pomNotifEl  = document.getElementById('pom-notif');
const pomFabEl       = document.getElementById('pom-fab');
const pomTaskInputEl = document.getElementById('pom-task-input');
const pomSessDecEl   = document.getElementById('pom-sess-dec');
const pomSessIncEl   = document.getElementById('pom-sess-inc');
const pomSessCountEl  = document.getElementById('pom-sess-count');
const pomToggleIconEl = document.getElementById('pom-toggle-icon');

// ── SVG 圆环初始化 ─────────────────────────────
const POM_RING_R    = 50;
const POM_RING_CIRC = parseFloat((2 * Math.PI * POM_RING_R).toFixed(3)); // ≈ 314.159

pomRingFgEl.style.strokeDasharray  = POM_RING_CIRC;
pomRingFgEl.style.strokeDashoffset = 0; // 满圆（全时间剩余时的初始状态）

// ── 渲染 UI ────────────────────────────────────
function pomRender() {
  const phase = POM_PHASES[pomPhaseIdx];

  // 阶段标签
  pomLabelEl.textContent = phase.label;
  pomLabelEl.style.color = phase.color;

  // 阶段图标（严格番茄工作法：不显示剩余时间，仅用图标提示当前阶段）
  const PHASE_ICONS = ['🍅', '☕', '🌿'];
  pomTimeEl.textContent = PHASE_ICONS[pomPhaseIdx];

  // 圆环：剩余时间越少，缺口越大（顺时针消耗）
  // remaining 从 1 降至 0 → dashoffset 从 0 升至 CIRC（圆弧从满到空）
  const remaining = pomTimeLeft / phase.duration;
  pomRingFgEl.style.strokeDashoffset = (POM_RING_CIRC * (1 - remaining)).toFixed(3);
  pomRingFgEl.style.stroke = phase.color;

  // 会话圆点（任务进度：已完成 / 预计番茄数）
  const fc = POM_PHASES[0].color;
  const maxDots = Math.min(pomTargetSessions, 8);
  let dotsHTML = '';
  for (let i = 0; i < maxDots; i++) {
    if (i < pomTotalFocusDone) {
      // 已完成
      dotsHTML += `<span class="pom-dot done" style="background:${fc}99;border-color:${fc}cc"></span>`;
    } else if (i === pomTotalFocusDone && pomPhaseIdx === 0) {
      // 当前专注进行中
      dotsHTML += `<span class="pom-dot active" style="background:${fc};border-color:${fc}"></span>`;
    } else {
      // 待完成
      dotsHTML += '<span class="pom-dot"></span>';
    }
  }
  if (pomTargetSessions > 8) {
    dotsHTML += `<span class="pom-dot-more">+${pomTargetSessions - 8}</span>`;
  }
  pomDotsEl.innerHTML = dotsHTML;

  // 同步步进器显示
  pomSessCountEl.textContent = `×${pomTargetSessions}`;
}

// ── 系统提示音 ────────────────────────────────
function pomPlayChime() {
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    const ctx = new AudioContext();
    const now = ctx.currentTime;
    
    // 获取全局音乐音量设置（听从 audio.js 中 music 对象的值）
    const sysVolume = (typeof music !== 'undefined' && music !== null) ? music.volume : 1.0;
    if (sysVolume <= 0) return; // 如果全局静音，则不发声

    // 顶层主音量控制
    const masterGain = ctx.createGain();
    masterGain.gain.value = sysVolume;
    masterGain.connect(ctx.destination);
    
    // 合成短促、干净的现代“Din”提示音，并带有舒适的延音
    // 起音极快，随后平滑衰减，整体发声时长约 2.5 秒
    const envelopeGain = ctx.createGain();
    envelopeGain.connect(masterGain);
    
    // 迅猛起音（强化“D”的动态），随后平缓衰减
    envelopeGain.gain.setValueAtTime(0, now);
    envelopeGain.gain.linearRampToValueAtTime(1.0, now + 0.005);
    envelopeGain.gain.exponentialRampToValueAtTime(0.001, now + 2.0);

    // 大幅拉高基频，构造高亢、空灵、极其清脆的“Din”
    const baseFreq = 2600; 
    
    const partials = [
      { mult: 1.0, type: 'sine', gain: 1.0, decay: 2.0 },   // 高频纯净主延音（留存最久，制造玻璃/冰块的清透感）
      { mult: 2.0, type: 'sine', gain: 0.4, decay: 0.1 },  // 更高八度的瞬间闪烁感
      { mult: 3.0, type: 'sine', gain: 0.2, decay: 0.03 }  // 极高频瞬态敲击点
    ];

    partials.forEach(p => {
      const osc = ctx.createOscillator();
      osc.type = p.type;
      osc.frequency.value = baseFreq * p.mult;
      
      const vca = ctx.createGain();
      
      // 让衰减变得更利落坚决
      vca.gain.setValueAtTime(0, now);
      vca.gain.linearRampToValueAtTime(p.gain, now + 0.005);
      vca.gain.exponentialRampToValueAtTime(0.001, now + p.decay);
      
      osc.connect(vca);
      vca.connect(envelopeGain);
      
      osc.start(now);
      osc.stop(now + 3.0);
    });

  } catch(e) {
    console.warn("无法播放番茄钟提示音", e);
  }
}

// ── 发送系统通知 ──────────────────────────────
function pomSystemNotify(msg) {
  if (!("Notification" in window)) return;
  if (Notification.permission === "granted") {
    new Notification("Huge Clock", { body: msg, icon: "favicon.ico" });
  } else if (Notification.permission !== "denied") {
    Notification.requestPermission().then(permission => {
      if (permission === "granted") {
        new Notification("Huge Clock", { body: msg, icon: "favicon.ico" });
      }
    });
  }
}

// ── 通知横幅 ──────────────────────────────────
let pomNotifTimer = null;
function pomNotify(msg, playSoundAndSys = false) {
  pomNotifEl.textContent = msg;
  pomNotifEl.classList.add('visible');
  clearTimeout(pomNotifTimer);
  pomNotifTimer = setTimeout(() => pomNotifEl.classList.remove('visible'), 3500);

  if (playSoundAndSys) {
    pomPlayChime();
    pomSystemNotify(msg);
  }
}

// ── 计时器逻辑 ────────────────────────────────
function pomTick() {
  if (pomTimeLeft > 0) {
    pomTimeLeft--;
    pomRender();
  } else {
    clearInterval(pomInterval);
    pomRunning = false;
    pomPanelEl.classList.remove('running');
    pomFabEl.classList.remove('running');
    pomOnPhaseEnd();
  }
}

function pomStartTimer() {
  // 请求通知权限，防止在计时结时由于非用户点击导致浏览器拦截权限请求
  if ("Notification" in window && Notification.permission !== "granted" && Notification.permission !== "denied") {
    Notification.requestPermission();
  }

  clearInterval(pomInterval);
  pomRunning = true;
  pomPanelEl.classList.add('running');
  pomFabEl.classList.add('running');
  pomTaskInputEl.setAttribute('readonly', '');
  pomToggleIconEl.textContent = '⏸';
  pomInterval = setInterval(pomTick, 1000);
}

function pomPauseTimer() {
  clearInterval(pomInterval);
  pomRunning = false;
  pomPanelEl.classList.remove('running');
  pomFabEl.classList.remove('running');
  pomTaskInputEl.removeAttribute('readonly');
  pomToggleIconEl.textContent = '▶';
}

// ── 阶段切换 ──────────────────────────────────
function pomOnPhaseEnd() {
  if (pomPhaseIdx === 0) {
    // 专注阶段结束
    pomTotalFocusDone++;
    pomRounds++;
    const taskName = pomTaskInputEl.value.trim();
    const taskDone = pomTotalFocusDone >= pomTargetSessions;

    // 确定下一个休息阶段
    if (pomRounds >= POM_MAX_ROUNDS) {
      pomRounds   = 0;
      pomPhaseIdx = 2;
      pomTimeLeft = POM_PHASES[2].duration;
    } else {
      pomPhaseIdx = 1;
      pomTimeLeft = POM_PHASES[1].duration;
    }

    if (taskDone) {
      const nameStr = taskName ? `"${taskName}" ` : '';
      pomNotify(`🎉 ${nameStr}完成！共专注 ${pomTotalFocusDone} 个🍅`, true);
    } else {
      const breakLabel = pomPhaseIdx === 2 ? '长休息' : '短休息';
      pomNotify(`✅ 专注结束，开始${breakLabel}（${pomTotalFocusDone}/${pomTargetSessions}）`, true);
    }
    pomRender();
    pomStartTimer();

  } else {
    // 休息结束
    pomPhaseIdx = 0;
    pomTimeLeft = POM_PHASES[0].duration;

    if (pomTotalFocusDone >= pomTargetSessions) {
      // 任务已达标：重置进度，暂停等待用户开始下一个任务
      pomTotalFocusDone = 0;
      pomRounds         = 0;
      pomRender();
      pomPauseTimer();           // 同时解锁输入框
      pomTaskInputEl.value = '';
      pomNotify('✨ 开始下一个任务吧！', true);
    } else {
      pomNotify('⏱ 休息结束，开始新的专注！', true);
      pomRender();
      pomStartTimer();
    }
  }
}

// ── 面板显示 / 隐藏 ────────────────────────────
function pomShow() {
  pomVisible = true;
  pomPanelEl.classList.add('visible');
  pomRender();
}

function pomHide() {
  pomVisible = false;
  // pomPauseTimer(); /* 取消暂停，使其可以在后台打卡 */
  pomPanelEl.classList.remove('visible');
}

// ── 键盘接口（供 audio.js 调用）──────────────────

// P：面板隐藏 → 仅显示（可先填写任务名和番茄数，再按 P 或点击开始）；运行中 → 暂停；暂停中 → 开始
function pomKeyP() {
  if (!pomVisible) {
    pomShow();
  } else if (pomRunning) {
    pomPauseTimer();
  } else {
    pomStartTimer();
  }
}

// R：重置当前阶段（不跳转阶段）
function pomKeyR() {
  if (!pomVisible) return;
  pomPauseTimer();
  pomTimeLeft = POM_PHASES[pomPhaseIdx].duration;
  pomRender();
}

// Esc：关闭面板
function pomKeyEsc() {
  if (pomVisible) pomHide();
}

// 全局导出
window._pomKeyP   = pomKeyP;
window._pomKeyR   = pomKeyR;
window._pomKeyEsc = pomKeyEsc;

// ── 事件绑定 ──────────────────────────────────

// 悬浮按钮点击：仅切换面板显示/隐藏，不暂停/开始
pomFabEl.addEventListener('click', () => {
  if (pomVisible) {
    pomHide();
  } else {
    pomShow();
  }
});

// 面板点击：仅阻止冒泡，防止触发全屏等（开始/暂停由专属按钮负责）
pomPanelEl.addEventListener('click', e => e.stopPropagation());

// 阻止面板双击触发全屏
pomPanelEl.addEventListener('dblclick', e => e.stopPropagation());

// 任务输入框：阻止冒泡（保留，防止冒泡到 document）
pomTaskInputEl.addEventListener('click',    e => e.stopPropagation());
pomTaskInputEl.addEventListener('dblclick', e => e.stopPropagation());
// Enter 键确认后失焦
pomTaskInputEl.addEventListener('keydown', e => {
  if (e.key === 'Enter') { e.preventDefault(); pomTaskInputEl.blur(); }
});

// 步进器：减少 / 增加目标番茄数（范围 1 ~ 12）
pomSessDecEl.addEventListener('click', e => {
  e.stopPropagation();
  if (pomTargetSessions > 1) { pomTargetSessions--; pomRender(); }
});
pomSessIncEl.addEventListener('click', e => {
  e.stopPropagation();
  if (pomTargetSessions < 12) { pomTargetSessions++; pomRender(); }
});

// 操作按钮（鼠标 & 触摸通用）
document.getElementById('pom-btn-toggle').addEventListener('click', e => {
  e.stopPropagation();
  if (pomRunning) pomPauseTimer(); else pomStartTimer();
});
document.getElementById('pom-btn-reset').addEventListener('click', e => {
  e.stopPropagation();
  pomKeyR();
});
document.getElementById('pom-btn-close').addEventListener('click', e => {
  e.stopPropagation();
  pomKeyEsc();
});

// ── 初始化渲染 ────────────────────────────────
pomRender();

// ── 调试辅助函数 ──────────────────────────────
window._pomSkip = function(seconds = 10) {
  pomTimeLeft = seconds;
  pomRender();
  console.log(`%c[Debug] %c番茄钟已快进至剩余 ${seconds} 秒`, 'color: #ff7043; font-weight: bold;', 'color: inherit;');
  return `快进成功: 剩 ${seconds} 秒`;
};
