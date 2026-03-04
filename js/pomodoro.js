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
const pomSessCountEl = document.getElementById('pom-sess-count');

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

// ── 通知横幅 ──────────────────────────────────
let pomNotifTimer = null;
function pomNotify(msg) {
  pomNotifEl.textContent = msg;
  pomNotifEl.classList.add('visible');
  clearTimeout(pomNotifTimer);
  pomNotifTimer = setTimeout(() => pomNotifEl.classList.remove('visible'), 3500);
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
  clearInterval(pomInterval);
  pomRunning = true;
  pomPanelEl.classList.add('running');
  pomFabEl.classList.add('running');
  pomTaskInputEl.setAttribute('readonly', '');
  pomInterval = setInterval(pomTick, 1000);
}

function pomPauseTimer() {
  clearInterval(pomInterval);
  pomRunning = false;
  pomPanelEl.classList.remove('running');
  pomFabEl.classList.remove('running');
  pomTaskInputEl.removeAttribute('readonly');
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
      pomNotify(`🎉 ${nameStr}完成！共专注 ${pomTotalFocusDone} 个🍅`);
    } else {
      const breakLabel = pomPhaseIdx === 2 ? '长休息' : '短休息';
      pomNotify(`✅ 专注结束，开始${breakLabel}（${pomTotalFocusDone}/${pomTargetSessions}）`);
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
      pomNotify('✨ 开始下一个任务吧！');
    } else {
      pomNotify('⏱ 休息结束，开始新的专注！');
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
  pomPauseTimer();
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

// 悬浮按钮点击
pomFabEl.addEventListener('click', pomKeyP);

// 面板点击：开始 / 暂停（阻止冒泡，防止触发全屏等）
pomPanelEl.addEventListener('click', e => {
  e.stopPropagation();
  if (!pomVisible) return;
  if (pomRunning) pomPauseTimer();
  else pomStartTimer();
});

// 阻止面板双击触发全屏
pomPanelEl.addEventListener('dblclick', e => e.stopPropagation());

// 任务输入框：阻止冒泡，防止触发面板的开始/暂停
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

// ── 初始化渲染 ────────────────────────────────
pomRender();
