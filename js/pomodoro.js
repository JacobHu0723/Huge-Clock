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
let pomSessionIntInterrupts = 0; // 当前未使用待办的内部中断
let pomSessionExtInterrupts = 0; // 当前未使用待办的外部中断
// ── 今日待办 状态 ────────────────────────────
let pomActiveDate = null;  // 当前工作日锚点
let pomTodos = [];
let pomInventory = []; // 活动清单
// { id: timestamp, text: string, est: number, done: number, completed: boolean }
let pomHistory = {}; // 形如 { "2023-10-01": [todos...], ... }
let pomCurrentTodoId = null;
let pomTodoEstValue  = 1;
let pomTodoVisible   = false;
let pomViewMode   = 'today'; // 'today', 'inventory', 'history'
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
const pomBtnInt       = document.getElementById('pom-btn-int-interrupt');
const pomBtnExt       = document.getElementById('pom-btn-ext-interrupt');
const pomIntBadge     = document.getElementById('pom-int-badge');
const pomExtBadge     = document.getElementById('pom-ext-badge');
const todoPanelEl   = document.getElementById('pom-todo-panel');
const todoDropdown  = document.getElementById('todo-view-dropdown');
const todoTrigger   = document.getElementById('todo-view-trigger');
const todoViewText  = document.getElementById('todo-view-text');
const todoMenuItems = document.querySelectorAll('.dropdown-item');
const todoListEl    = document.getElementById('todo-list');
const todoInvListEl = document.getElementById('todo-inv-list');
const todoHistListEl= document.getElementById('todo-history-list');
const todoAddArea   = document.getElementById('todo-add-area');
const todoInputEl   = document.getElementById('todo-input');
const todoEstRow    = document.getElementById('todo-est-row');
const todoEstValEl  = document.getElementById('todo-est-val');
const todoAddBtn    = document.getElementById('todo-add-btn');
const todoAddBtnSimple = document.getElementById('todo-add-btn-simple');
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
  pomSessCountEl.textContent = `${pomTargetSessions}`;

  // 同步阶段样式（用于隐藏中断记录栏）
  if (pomPhaseIdx !== 0) {
    pomPanelEl.classList.add('break-phase');
  } else {
    pomPanelEl.classList.remove('break-phase');
  }

  // 同步中断记录
  let intTarget = pomSessionIntInterrupts;
  let extTarget = pomSessionExtInterrupts;
  if (pomCurrentTodoId) {
    const t = pomTodos.find(x => x.id === pomCurrentTodoId);
    if (t) {
      intTarget = t.intInterrupts || 0;
      extTarget = t.extInterrupts || 0;
    }
  }
  pomIntBadge.textContent = intTarget;
  pomIntBadge.style.display = intTarget > 0 ? 'inline-block' : 'none';
  pomExtBadge.textContent = extTarget;
  pomExtBadge.style.display = extTarget > 0 ? 'inline-block' : 'none';
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
let pomNotifWidthTimer = null;
function pomNotify(msg, playSoundAndSys = false) {
  if (pomNotifEl.classList.contains('visible') && pomNotifEl.textContent !== msg) {
    // 若通知横幅已经处于显示状态，计算自适应宽度并执行过渡动画
    const oldWidth = pomNotifEl.offsetWidth;
    
    // 暂时关闭过渡以换取新宽度
    pomNotifEl.style.transition = 'none';
    pomNotifEl.style.width = 'auto';
    pomNotifEl.textContent = msg;
    const newWidth = pomNotifEl.offsetWidth;
    
    // 强制先使用旧宽度渲染
    pomNotifEl.style.width = oldWidth + 'px';
    void pomNotifEl.offsetWidth; // 触发重绘
    
    // 恢复过渡并设定新宽度
    pomNotifEl.style.transition = '';
    pomNotifEl.style.width = newWidth + 'px';
    
    // 动画结束后解除定宽，回归自适应
    clearTimeout(pomNotifWidthTimer);
    pomNotifWidthTimer = setTimeout(() => {
      pomNotifEl.style.transition = 'none';
      pomNotifEl.style.width = 'auto';
      void pomNotifEl.offsetWidth;
      pomNotifEl.style.transition = '';
    }, 350);
  } else {
    pomNotifEl.style.width = 'auto';
    pomNotifEl.textContent = msg;
    pomNotifEl.classList.add('visible');
  }

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

  // 开始计时时，如果是自己手动填写的未关联任务（或半途修改导致已解绑），自动在今日待办中新建一个并关联
  const taskName = pomTaskInputEl.value.trim();
  if (taskName && !pomCurrentTodoId) {
    // 创建一个新的待办，目标番茄数取面板上设定好的（通过加减号得来）或者默认 1
    const newItem = {
      id: Date.now(),
      text: taskName,
      est: pomTargetSessions || 1,
      done: pomTotalFocusDone || 0,
      completed: false,
      isNew: true,
      intInterrupts: pomSessionIntInterrupts || 0,
      extInterrupts: pomSessionExtInterrupts || 0
    };
    pomTodos.push(newItem);
    pomCurrentTodoId = newItem.id;
    pomSaveTodos();
    if(pomViewMode === 'today') {
      pomRenderTodos();
    }
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
    // 如果有绑定的待办事项，更新其进度
    if (pomCurrentTodoId) {
      const t = pomTodos.find(x => x.id === pomCurrentTodoId);
      if (t) {
        t.done++;
        if (taskDone) t.completed = true;
        pomSaveTodos();
        pomRenderTodos();
      }
    }
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
      pomCurrentTodoId  = null;
      pomSessionIntInterrupts = 0;
      pomSessionExtInterrupts = 0;
      pomRender();
      pomRenderTodos();
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
// R：重置到最开始的专注阶段
function pomKeyR() {
  if (!pomVisible) return;
  pomPauseTimer();
  pomPhaseIdx = 0;
  pomTimeLeft = POM_PHASES[0].duration;
  pomRounds = 0;
  pomTotalFocusDone = 0;
  let clearedInterrupts = false;

  if (pomCurrentTodoId) {
    const t = pomTodos.find(x => x.id === pomCurrentTodoId);
    if (t) {
      if (t.intInterrupts > 0 || t.extInterrupts > 0) clearedInterrupts = true;
      t.intInterrupts = 0;
      t.extInterrupts = 0;
      t.done = 0;
      t.completed = false;
      pomSaveTodos();
      if(pomViewMode === 'today') pomRenderTodos();
    }
  } else {
    if (pomSessionIntInterrupts > 0 || pomSessionExtInterrupts > 0) clearedInterrupts = true;
    pomSessionIntInterrupts = 0;
    pomSessionExtInterrupts = 0;
  }
  
  if (clearedInterrupts) {
    pomNotify('🔄 计时与中断数已重置', false);
  } else {
    pomNotify('🔄 计时已重置', false);
  }
  pomRender();
}
// Esc：关闭面板
function pomKeyEsc() {
  if (pomTodoVisible) {
    pomToggleTodoPanel(false);
  } else if (pomVisible) {
    pomHide();
  }
}

// 记录内部中断
function pomKeyInt() {
  if (!pomRunning || pomPhaseIdx !== 0) return; // 只能在专注期间记录
  if (pomCurrentTodoId) {
    const t = pomTodos.find(x => x.id === pomCurrentTodoId);
    if (t) {
      t.intInterrupts = (t.intInterrupts || 0) + 1;
      pomSaveTodos();
      if(pomViewMode === 'today') pomRenderTodos();
    }
  } else {
    pomSessionIntInterrupts++;
  }
  pomRender();
}

// 记录外部中断
function pomKeyExt() {
  if (!pomRunning || pomPhaseIdx !== 0) return; // 只能在专注期间记录
  if (pomCurrentTodoId) {
    const t = pomTodos.find(x => x.id === pomCurrentTodoId);
    if (t) {
      t.extInterrupts = (t.extInterrupts || 0) + 1;
      pomSaveTodos();
      if(pomViewMode === 'today') pomRenderTodos();
    }
  } else {
    pomSessionExtInterrupts++;
  }
  pomRender();
}

// 全局导出
window._pomKeyP   = pomKeyP;
window._pomKeyR   = pomKeyR;
window._pomKeyEsc = pomKeyEsc;
window._pomKeyL   = pomKeyL;
window._pomKeyInt = pomKeyInt;
window._pomKeyExt = pomKeyExt;
// ── 事件绑定 ──────────────────────────────────
// 悬浮按钮点击：仅切换面板显示/隐藏，不暂停/开始
pomFabEl.addEventListener('click', () => {
  if (pomVisible) {
    pomHide();
  } else {
    pomShow();
  }
});
// 阻止双击番茄按钮触发全屏
pomFabEl.addEventListener('dblclick', e => e.stopPropagation());
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

// 输入框内容发生变化时
pomTaskInputEl.addEventListener('input', e => {
  // 1. 如果修改了事件标题，且存在当前关联的待办，则解除绑定（已不是最初那件事）
  if (pomCurrentTodoId) {
    const currentTodo = pomTodos.find(x => x.id === pomCurrentTodoId);
    // 判断是否发生了实际的名称更改
    if (currentTodo && pomTaskInputEl.value.trim() !== currentTodo.text) {
      pomCurrentTodoId = null;
      pomRenderTodos(); // 重新渲染列表以解除高亮样式
    }
  }
});
// 步进器：减少 / 增加目标番茄数（范围 1 ~ 12）
pomSessDecEl.addEventListener('click', e => {
  e.stopPropagation();
  if (pomTargetSessions > 1) { pomTargetSessions--; pomRender(); }
});
// 阻止 dblclick 冒泡触发全屏
pomSessDecEl.addEventListener('dblclick', e => e.stopPropagation());
pomSessIncEl.addEventListener('click', e => {
  e.stopPropagation();
  if (pomTargetSessions < 12) { pomTargetSessions++; pomRender(); }
});
// 阻止 dblclick 冒泡触发全屏
pomSessIncEl.addEventListener('dblclick', e => e.stopPropagation());
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
  pomHide();
});
pomBtnInt.addEventListener('click', e => {
  e.stopPropagation();
  pomKeyInt();
});
pomBtnExt.addEventListener('click', e => {
  e.stopPropagation();
  pomKeyExt();
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

window._pomNextDay = function() {
  const currentDay = pomGetDateStr();
  if (pomTodos.length > 0) {
    if (pomHistory[currentDay]) {
      pomHistory[currentDay] = pomHistory[currentDay].concat(pomTodos);
    } else {
      pomHistory[currentDay] = [...pomTodos];
    }
  }
  pomTodos = [];
  pomCurrentTodoId = null;
  pomSaveTodos();

  if (typeof pomRenderTodos === 'function' && pomViewMode === 'today') pomRenderTodos();
  if (typeof pomRenderHistory === 'function' && pomViewMode === 'history') pomRenderHistory();

  console.log(`%c[Debug] %c已模拟进入下一天，当前待办已归档至 ${currentDay}`, 'color: #3498db; font-weight: bold;', 'color: inherit;');
  return "模拟跨天完成，任务已归档";
};
// ── 今日待办逻辑 ──────────────────────────────
// 获取当前本地日期字符串 (YYYY-MM-DD)
function pomGetDateStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
// 本地存储读写
function pomSaveTodos() {
  const data = {
    today: pomActiveDate || pomGetDateStr(),
    todos: pomTodos,
    inventory: pomInventory,
    history: pomHistory
  };
  localStorage.setItem('pomodoro_data', JSON.stringify(data));
}
function pomLoadTodos() {
  try {
    const raw = localStorage.getItem('pomodoro_data');
    const currentDay = pomGetDateStr();
    pomActiveDate = currentDay; // 默认将活跃天设为当前真实日期

    if (!raw) return;
    const data = JSON.parse(raw);
    pomHistory = data.history || {};
    pomInventory = data.inventory || [];
    
    // 如果日期变了，将上一天的任务归档，清空今日任务
    if (data.today && data.today !== currentDay) {
      if (data.todos && data.todos.length > 0) {
        pomHistory[data.today] = data.todos;
      }
      pomTodos = [];
      pomCurrentTodoId = null;
    } else {
      pomTodos = data.todos || [];
      pomActiveDate = data.today || currentDay; // 恢复保存时的活跃日期
    }
  } catch(e) {
    console.warn("读取番茄钟数据失败", e);
  }
}
function pomAnimateAdd(el, isFirst = false) {
  el.style.opacity = '0';
  requestAnimationFrame(() => {
    const h = el.offsetHeight;
    if (h === 0) { el.style.opacity = '1'; return; }
    
    if (isFirst) {
      el.style.transition = 'opacity 0.25s cubic-bezier(0.4, 0, 0.2, 1)';
      el.style.opacity = '1';
      setTimeout(() => {
        el.style.transition = '';
      }, 260);
      return;
    }

    el.style.overflow = 'hidden';
    el.style.boxSizing = 'border-box';
    el.style.height = '0px';
    el.style.paddingTop = '0px';
    el.style.paddingBottom = '0px';
    
    // 抵消 gap：当元素生成时，我们需要它顺畅地将 gap 撑开，所以给一个与 gap 抵消的负边距初始值
    if (el.previousElementSibling) {
      el.style.marginTop = '-10px';
    } else if (el.nextElementSibling) {
      el.style.marginBottom = '-10px';
    } else {
      el.style.marginTop = '0px';
    }
    
    el.style.borderTopWidth = '0px';
    el.style.borderBottomWidth = '0px';
    void el.offsetHeight;
    
    el.style.transition = 'height 0.25s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.25s cubic-bezier(0.4, 0, 0.2, 1), padding 0.25s cubic-bezier(0.4, 0, 0.2, 1), margin 0.25s cubic-bezier(0.4, 0, 0.2, 1), border-width 0.25s cubic-bezier(0.4, 0, 0.2, 1)';
    el.style.opacity = '1';
    el.style.height = h + 'px';
    el.style.paddingTop = '';
    el.style.paddingBottom = '';
    el.style.marginTop = '';
    el.style.marginBottom = '';
    el.style.borderTopWidth = '';
    el.style.borderBottomWidth = '';
    setTimeout(() => {
      el.style.height = ''; el.style.overflow = ''; el.style.transition = ''; el.style.boxSizing = '';
    }, 260);
  });
}

function pomAnimateRemove(el, callback, isLast = false) {
  const h = el.offsetHeight;
  el.style.boxSizing = 'border-box';
  el.style.height = h + 'px';
  el.style.overflow = 'hidden';
  void el.offsetHeight;
  
  if (isLast) {
    el.style.transition = 'opacity 0.25s cubic-bezier(0.4, 0, 0.2, 1)';
    el.style.opacity = '0';
  } else {
    el.style.transition = 'height 0.25s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.25s cubic-bezier(0.4, 0, 0.2, 1), padding 0.25s cubic-bezier(0.4, 0, 0.2, 1), margin 0.25s cubic-bezier(0.4, 0, 0.2, 1), border-width 0.25s cubic-bezier(0.4, 0, 0.2, 1)';
    el.style.height = '0px';
    el.style.paddingTop = '0px';
    el.style.paddingBottom = '0px';
    
    // 针对最后一个元素的收缩特殊处理：如果不做处理，最后一项由于底部没有 nextSibling，只会高度变成 0，但前方的 gap(10px) 依然存在。
    // 此时一旦节点被 remove() 删掉，10px 的 gap 瞬间消失会导致下方出现突兀的闪烁跳变。
    // 解决方式：如果在中间就把 bottom 收缩 -10px，如果是最后一个就把 top 收缩 -10px
    if (el.nextElementSibling) {
      el.style.marginBottom = '-10px';
      el.style.marginTop = '0px';
    } else if (el.previousElementSibling) {
      el.style.marginTop = '-10px';
      el.style.marginBottom = '0px';
    } else {
      el.style.marginTop = '0px';
      el.style.marginBottom = '0px';
    }
    
    el.style.borderTopWidth = '0px';
    el.style.borderBottomWidth = '0px';
    el.style.opacity = '0';
  }
  
  setTimeout(callback, 250);
}
function pomRenderTodos() {
  todoListEl.innerHTML = '';
  if (pomTodos.length === 0) {
    todoListEl.innerHTML = `<div class="todo-empty-state">暂无待办，赶快添加一个吧！</div>`;
    return;
  }
  pomTodos.forEach(item => {
    const el = document.createElement('div');
    el.className = `todo-item ${item.completed ? 'completed' : ''} ${pomCurrentTodoId === item.id ? 'active' : ''}`;
    // 生成番茄图标
    let poms = '';
    for (let i = 0; i < item.est; i++) {
      if (i < item.done) poms += '🍅';
      else poms += '<span class="todo-poms-empty">⚪</span>';
    }
    // 增加超出预期的番茄展示
    for (let i = item.est; i < item.done; i++) {
        poms += '🍅';
    }

    // 生成中断统计 HTML
    let interruptsHtml = '';
    const intCount = item.intInterrupts || 0;
    const extCount = item.extInterrupts || 0;
    if (intCount > 0 || extCount > 0) {
      interruptsHtml = `<div class="todo-interrupts" style="margin-left: 10px; margin-top: 0;">`;
      if (intCount > 0) interruptsHtml += `<span title="内部中断: ${intCount}次">💭 ${intCount}</span>`;
      if (extCount > 0) interruptsHtml += `<span title="外部中断: ${extCount}次">💬 ${extCount}</span>`;
      interruptsHtml += `</div>`;
    }

    el.innerHTML = `
      <div class="todo-main-row"><input type="checkbox" class="todo-chk" ${item.completed ? 'checked' : ''}><div class="todo-info"><div class="todo-name" title="${item.text}">${item.text}</div><div style="display:flex; align-items:center;"><div class="todo-poms">${poms}</div>${interruptsHtml}</div></div><button class="todo-play" title="应用此待办到番茄钟">▶</button><button class="todo-del" title="删除此待办">✕</button></div>`;

    // 允许点击预计番茄图标区域来修改番茄数
    const pomsContainer = el.querySelector('.todo-poms');
    pomsContainer.style.cursor = 'pointer';
    pomsContainer.title = '点击修改预计番茄数';
    pomsContainer.addEventListener('click', (e) => {
      e.stopPropagation();
      let dropdown = el.querySelector('.inv-est-dropdown');
      if (dropdown) {
        dropdown.classList.toggle('show'); if (!dropdown.classList.contains('show')) { setTimeout(() => { if(!dropdown.classList.contains('show')) dropdown.remove(); }, 260); }
        if (dropdown.classList.contains('show')) {
          dropdown.querySelector('.inv-est-input').focus();
        }
        return;
      }
      dropdown = document.createElement('div');
      dropdown.className = 'inv-est-dropdown';
      dropdown.innerHTML = `
        <div style="display:flex; align-items:center; justify-content:space-between; width:100%; height:30px; overflow:hidden;"><div style="display:flex; align-items:center; gap: 6px; padding-left: 4px; white-space:nowrap; overflow:hidden;"><span style="font-size:13px; color:rgba(255,255,255,0.6);">🎯 目标</span><div class="todo-est-stepper" style="padding:2px 6px; margin-left: 7px;"><button class="inv-est-minus" tabindex="-1">−</button><input type="number" class="inv-est-input" value="${item.est}" min="1" max="8" style="width:14px; text-align:center; padding:0; font-weight:bold; font-size:14px;" /><button class="inv-est-plus" tabindex="-1">＋</button></div></div><div class="inv-est-actions" style="margin-left: auto; padding-right: 4px; gap: 6px; flex-shrink: 0;"><button class="inv-est-cancel" tabindex="-1">取消</button><button class="inv-est-confirm" tabindex="-1">确认</button></div></div>
        `;
      dropdown.addEventListener('click', ev => ev.stopPropagation());
      
        el.appendChild(dropdown);
      // 强制重绘以触发 transition 展开
      void dropdown.offsetWidth;
      dropdown.classList.add('show');

      const inputEl = dropdown.querySelector('.inv-est-input');
      const minusBtn = dropdown.querySelector('.inv-est-minus');
      const plusBtn = dropdown.querySelector('.inv-est-plus');
      const cancelBtn = dropdown.querySelector('.inv-est-cancel');
      const confirmBtn = dropdown.querySelector('.inv-est-confirm');

      inputEl.focus();

      minusBtn.addEventListener('click', () => {
        let val = parseInt(inputEl.value) || 1;
        if (val > 1) inputEl.value = val - 1;
      });
      plusBtn.addEventListener('click', () => {
        let val = parseInt(inputEl.value) || 1;
        if (val < 8) inputEl.value = val + 1;
      });
      inputEl.addEventListener('keydown', ev => {
        if (ev.key === 'Enter') confirmBtn.click();
        if (ev.key === 'Escape') cancelBtn.click();
      });

      cancelBtn.addEventListener('click', () => { dropdown.classList.remove('show'); setTimeout(() => { if(!dropdown.classList.contains('show')) dropdown.remove(); }, 260); });

      confirmBtn.addEventListener('click', () => {
        let val = parseInt(inputEl.value) || 1;
        if (val < 1) val = 1;
        item.est = val;
        
        // 如果当前正在计时该任务，则同步更新面板显示
        if (pomCurrentTodoId === item.id) {
          pomTargetSessions = val;
          pomRender();
        }
        
        pomSaveTodos();
        pomRenderTodos();
      });
    });

    // 勾选完成
    const chk = el.querySelector('.todo-chk');
    chk.addEventListener('change', (e) => {
      item.completed = e.target.checked;
      // 如果有来源于活动清单的记录，联动同步其状态并保存
      if (item.inventoryOriginalId) {
        const invItem = pomInventory.find(i => i.id === item.inventoryOriginalId);
        if (invItem) {
          invItem.completed = item.completed;
          pomSaveTodos();
        }
      }
      pomSaveTodos();
      // 重新渲染以更新中断标记的位置
      if(pomViewMode === 'today') {
        pomRenderTodos();
      } else {
        if (item.completed) el.classList.add('completed');
        else el.classList.remove('completed');
      }
      pomRenderInventory();
    });
    // 绑定删除按钮
    const delBtn = el.querySelector('.todo-del');
    delBtn.addEventListener('click', () => {
      pomAnimateRemove(el, () => {
        pomTodos = pomTodos.filter(x => x.id !== item.id);
        if (pomCurrentTodoId === item.id) {
          pomCurrentTodoId = null;
        }
        pomSaveTodos();
        pomRenderTodos();
      }, pomTodos.length === 1);
    });
    // 开始任务
    const playBtn = el.querySelector('.todo-play');
    playBtn.addEventListener('click', () => {
      if (pomCurrentTodoId === item.id) return; // 已经是当前任务
      pomCurrentTodoId = item.id;
      // 强制覆盖当前的番茄钟面板数据
      pomTaskInputEl.value = item.text;
      pomTargetSessions = item.est;
      pomTotalFocusDone = item.done;
      // 如果还没弹出番茄钟面板，则弹出来
      if (!pomVisible) pomShow();
      pomRender();
      pomRenderTodos();
      // 在手机设备上收起待办面板让出视野
      if (window.innerWidth <= 600) pomToggleTodoPanel(false);
    });
    todoListEl.appendChild(el);
    if (item.isNew) {
      pomAnimateAdd(el, pomTodos.length === 1);
      delete item.isNew;
    }
  });
}
function pomRenderInventory() {
  todoInvListEl.innerHTML = '';
  if (pomInventory.length === 0) {
    todoInvListEl.innerHTML = `<div class="todo-empty-state">暂无活动清单，随时记录想做的事！</div>`;
    return;
  }
  pomInventory.forEach(item => {
    const el = document.createElement('div');
    el.className = `todo-item ${item.completed ? 'completed' : ''}`;
    el.innerHTML = `
      <div class="todo-main-row"><div class="todo-info" style="padding-left: 8px;"><div class="todo-name" title="${item.text}">${item.text}</div></div><button class="todo-play" title="添加到今日待办" style="font-size: 14px; margin-right: 8px;">＋</button><button class="todo-del" title="删除此活动">✕</button></div>`;
    // 移入今日待办
    const addBtn = el.querySelector('.todo-play');
    addBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const alreadyInToday = pomTodos.find(t => t.inventoryOriginalId === item.id && !t.completed);
      if (alreadyInToday) {
        pomNotify('不可重复添加：该活动已在今日待办中', false);
        return;
      }
      let dropdown = el.querySelector('.inv-est-dropdown');
      if (dropdown) {
        dropdown.classList.toggle('show'); if (!dropdown.classList.contains('show')) { setTimeout(() => { if(!dropdown.classList.contains('show')) dropdown.remove(); }, 260); }
        if (dropdown.classList.contains('show')) {
          dropdown.querySelector('.inv-est-input').focus();
        }
        return;
      }
      // 首次点击，动态渲染内联预计番茄数设置界面
      dropdown = document.createElement('div');
      dropdown.className = 'inv-est-dropdown';
      dropdown.innerHTML = `
        <div style="display:flex; align-items:center; justify-content:space-between; width:100%; height:30px; overflow:hidden;"><div style="display:flex; align-items:center; gap: 6px; padding-left: 4px; white-space:nowrap; overflow:hidden;"><span style="font-size:13px; color:rgba(255,255,255,0.6);">🎯 目标</span><div class="todo-est-stepper" style="padding:2px 6px; margin-left: 7px;"><button class="inv-est-minus" tabindex="-1">−</button><input type="number" class="inv-est-input" value="${item.est}" min="1" max="8" style="width:14px; text-align:center; padding:0; font-weight:bold; font-size:14px;" /><button class="inv-est-plus" tabindex="-1">＋</button></div></div><div class="inv-est-actions" style="margin-left: auto; padding-right: 4px; gap: 6px; flex-shrink: 0;"><button class="inv-est-cancel" tabindex="-1">取消</button><button class="inv-est-confirm" tabindex="-1">确认</button></div></div>
        `;
      // 防止点击冒泡关闭自身
      dropdown.addEventListener('click', ev => ev.stopPropagation());
      
        el.appendChild(dropdown);
      // 强制重绘以触发 transition 展开
      void dropdown.offsetWidth;
      dropdown.classList.add('show');

      const inputEl = dropdown.querySelector('.inv-est-input');
      const minusBtn = dropdown.querySelector('.inv-est-minus');
      const plusBtn = dropdown.querySelector('.inv-est-plus');
      const cancelBtn = dropdown.querySelector('.inv-est-cancel');
      const confirmBtn = dropdown.querySelector('.inv-est-confirm');

      inputEl.focus();

      minusBtn.addEventListener('click', () => {
        let val = parseInt(inputEl.value) || 1;
        if (val > 1) inputEl.value = val - 1;
      });
      plusBtn.addEventListener('click', () => {
        let val = parseInt(inputEl.value) || 1;
        if (val < 8) inputEl.value = val + 1;
      });
      inputEl.addEventListener('keydown', ev => {
        if (ev.key === 'Enter') confirmBtn.click();
        if (ev.key === 'Escape') cancelBtn.click();
      });

      cancelBtn.addEventListener('click', () => { dropdown.classList.remove('show'); setTimeout(() => { if(!dropdown.classList.contains('show')) dropdown.remove(); }, 260); });

      confirmBtn.addEventListener('click', () => {
        let val = parseInt(inputEl.value) || 1;
        if (val < 1) val = 1;
        const todoItem = { ...item, id: Date.now(), est: val, isNew: true };
        todoItem.inventoryOriginalId = item.id;
        item.todayInstances = item.todayInstances || [];
        item.todayInstances.push(todoItem.id);
        
        pomTodos.push(todoItem);
        pomSaveTodos();
        pomRenderTodos();
        pomNotify(`已将 "${item.text}" 提取至今日待办`, false);
        dropdown.classList.remove('show'); setTimeout(() => { if(!dropdown.classList.contains('show')) dropdown.remove(); }, 260);
      });
    });
    // 删除
    const delBtn = el.querySelector('.todo-del');
    delBtn.addEventListener('click', () => {
      pomAnimateRemove(el, () => {
        pomInventory = pomInventory.filter(x => x.id !== item.id);
        pomSaveTodos();
        pomRenderInventory();
      }, pomInventory.length === 1);
    });
    todoInvListEl.appendChild(el);
    if (item.isNew) {
      pomAnimateAdd(el, pomInventory.length === 1);
      delete item.isNew;
    }
  });
}
function pomAddTodo() {
  const text = todoInputEl.value.trim();
  if (!text) return;
  const newItem = {
    id: Date.now(),
    text,
    est: pomTodoEstValue,
    done: 0,
    completed: false,
    isNew: true
  };
  if (pomViewMode === 'inventory') {
    pomInventory.push(newItem);
    pomRenderInventory();
  } else {
    pomTodos.push(newItem);
    pomRenderTodos();
  }
  todoInputEl.value = '';
  pomTodoEstValue = 1;
  todoEstValEl.textContent = '1';
  pomSaveTodos();
}
function pomRenderHistory() {
  todoHistListEl.innerHTML = '';
  const dates = Object.keys(pomHistory).sort((a,b) => b.localeCompare(a)); // 倒序
  if (dates.length === 0) {
    todoHistListEl.innerHTML = `<div class="hist-empty">暂无历史记录</div>`;
    return;
  }
  dates.forEach((date, index) => {
    const tasks = pomHistory[date];
    if (!tasks || tasks.length === 0) return;

    let totalTasks = tasks.length;
    let completedCount = 0;
    
    let totalDone = 0; // 日总番茄（无论是否完成任务，付出的时间都需要留存记录）
    let totalInt = 0;
    let totalExt = 0;
    
    let completedDonePoms = 0;
    let completedEstPoms = 0;

    tasks.forEach(t => {
      totalDone += t.done || 0;
      totalInt += t.intInterrupts || 0;
      totalExt += t.extInterrupts || 0;
      if (t.completed) {
        completedCount++;
        completedDonePoms += t.done || 0;
        completedEstPoms += t.est || 0;
      }
    });

    const completionRate = totalTasks > 0 ? Math.round((completedCount / totalTasks) * 100) : 0;
    
    // 结项误差：仅对已经打勾（completed）的任务计算估算偏差
    const diff = completedDonePoms - completedEstPoms;
    let diffClass = diff > 0 ? 'warn' : (diff < 0 ? 'good' : 'neutral');
    let diffSign = diff > 0 ? '+' : '';
    let diffDisplay = completedCount === 0 ? '-' : `${diffSign}${diff}`;
    
    let interruptsTotal = totalInt + totalExt;
    let intClass = interruptsTotal > (totalDone * 1.5) && totalDone > 0 ? 'warn' : (interruptsTotal === 0 ? 'good' : 'neutral');

    const groupEl = document.createElement('div');
    // 默认展开第一天（最新的一天），其余折叠
    groupEl.className = `hist-group ${index === 0 ? 'expanded' : ''}`;
    groupEl.style.marginBottom = '12px';

    // 格式化日期：加上星期几
    let dStr = date;
    try {
      const dObj = new Date(date);
      const days = ['日','一','二','三','四','五','六'];
      dStr = `${date} (周${days[dObj.getDay()]})`;
    } catch(e) {}

    let html = `
      <div class="hist-summary" title="点击展开/折叠">
        <div class="hist-summary-head">
          <div style="display: flex; flex-direction: column; gap: 4px;">
            <div class="hist-date">${dStr}</div>
            <div class="hist-completion">达成: ${completedCount}/${totalTasks} 项 (${completionRate}%)</div>
          </div>
          <div class="hist-toggle-icon">
            <svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>
          </div>
        </div>
        <div class="hist-stats">
          <div class="hist-stat-item" title="本日内专注执行过的所有番茄数总量">
            <span class="hist-stat-val">${totalDone}</span>
            <span class="hist-stat-label">日总番茄</span>
          </div>
          <div class="hist-stat-item" title="仅计算已完成任务的「预估番茄」与「实际花费」之差">
            <span class="hist-stat-val ${diffClass}">${diffDisplay}</span>
            <span class="hist-stat-label">结项误差</span>
          </div>
          <div class="hist-stat-item" title="累计内部/外部被打断的次数汇总">
            <span class="hist-stat-val ${intClass}">${totalInt}/${totalExt}</span>
            <span class="hist-stat-label">内/外中断</span>
          </div>
        </div>
      </div>
      <div class="hist-tasks-wrapper">
        <div class="hist-tasks-inner">
          <div class="hist-tasks" style="margin-bottom: 4px;">
    `;

    tasks.forEach(item => {
      let poms = '';
      for (let i = 0; i < item.est; i++) {
        if (i < item.done) poms += '🍅';
        else poms += '<span class="todo-poms-empty">⚪</span>';
      }
      for (let i = item.est; i < item.done; i++) {
          poms += '🍅';
      }

      let intsHtml = '';
      const tInt = item.intInterrupts || 0;
      const tExt = item.extInterrupts || 0;
      if (tInt > 0 || tExt > 0) {
        if (tInt > 0) intsHtml += `<span title="内部中断: ${tInt}次">💭${tInt}</span>`;
        if (tExt > 0) intsHtml += `<span title="外部中断: ${tExt}次">💬${tExt}</span>`;
      } else {
        intsHtml = '<span style="opacity:0.3">无中断</span>';
      }

      let taskDiffText = '';
      let taskDiffClass = '';
      if (item.completed) {
        let taskDiff = item.done - item.est;
        taskDiffClass = taskDiff > 0 ? 'over' : (taskDiff < 0 ? 'under' : 'exact');
        taskDiffText = `预 ${item.est} / 实 ${item.done}`;
      } else {
        taskDiffClass = 'uncompleted';
        taskDiffText = `预 ${item.est} / 实 ${item.done}`;
      }

      html += `
        <div class="hist-task-item ${item.completed ? 'completed' : 'uncompleted'}">
          <div class="hist-task-main">
            <div class="hist-task-name" title="${item.text}">${item.text}</div>
            <div class="hist-task-diff ${taskDiffClass}">${taskDiffText}</div>
          </div>
          <div class="hist-task-details">
            <div class="hist-task-poms">${poms}</div>
            <div class="hist-task-ints">${intsHtml}</div>
          </div>
        </div>
      `;
    });

    html += `</div></div></div>`;
    groupEl.innerHTML = html;
    
    // 绑定点击事件，处理展开/折叠
    const summaryEl = groupEl.querySelector('.hist-summary');
    summaryEl.addEventListener('click', (e) => {
      groupEl.classList.toggle('expanded');
    });

    todoHistListEl.appendChild(groupEl);
  });
}function pomToggleTodoPanel(forceStage) {
  if (typeof forceStage === 'boolean') {
    if (pomTodoVisible === forceStage) return; // 如果状态一致则直接返回
    pomTodoVisible = forceStage;
  } else {
    pomTodoVisible = !pomTodoVisible;
  }
  // 根据当前番茄钟主面板是否显示，决定动画来源
  // 如果主面板打开：从底部按钮处弹出（移除 from-side）
  // 如果主面板关闭：从侧边滑出（添加 from-side）
  if (!pomVisible) {
    todoPanelEl.classList.add('from-side');
  } else {
    todoPanelEl.classList.remove('from-side');
  }
  if (pomTodoVisible) {
    // 【核心修复】开启面板时，由于可能涉及改变动画的初始锚点（from-side 切换），
    // 必须瞬间禁用 transition 让它回归正确的隐藏状态起点，再开始带有 transition 的展示动画。
    // 否则浏览器会计算从“上一次关闭位置”到“当前打开位置”的斜向混乱动画。
    todoPanelEl.style.transition = 'none';
    void todoPanelEl.offsetHeight; // 强制重绘，应用起点位置
    todoPanelEl.style.transition = ''; // 恢复 CSS 过渡
    todoPanelEl.classList.add('visible');
    setTimeout(() => todoInputEl.focus(), 50);
  } else {
    todoPanelEl.classList.remove('visible');
  }
}
function pomKeyL() {
  // 直接通过快捷键切换待办面板
  pomToggleTodoPanel();
}
// 待办面板事件绑定
function pomSetViewMode(mode) {
  pomViewMode = mode;
  const oldHeight = todoPanelEl.offsetHeight;
  todoPanelEl.style.height = oldHeight + 'px';
  todoListEl.classList.remove('list-fade-in');
  todoHistListEl.classList.remove('list-fade-in');
  if(todoInvListEl) todoInvListEl.classList.remove('list-fade-in');
  todoListEl.style.display = 'none';
  todoHistListEl.style.display = 'none';
  if(todoInvListEl) todoInvListEl.style.display = 'none';
  todoAddArea.style.display = 'flex';
  todoEstRow.style.display = 'flex';
  if (mode === 'history') {
    todoAddArea.style.display = 'none';
    todoHistListEl.style.display = 'flex';
    pomRenderHistory();
    todoHistListEl.classList.add('list-fade-in');
  } else if (mode === 'inventory') {
    todoInvListEl.style.display = 'flex';
    todoEstRow.style.display = 'none'; // 隐藏预计番茄数
    if (todoAddBtnSimple) todoAddBtnSimple.style.display = 'block'; // 显示单输入框旁的添加按钮
    pomRenderInventory();
    todoInvListEl.classList.add('list-fade-in');
  } else {
    todoListEl.style.display = 'flex';
    if (todoAddBtnSimple) todoAddBtnSimple.style.display = 'none'; // 隐藏单输入框旁的添加按钮
    pomRenderTodos();
    todoListEl.classList.add('list-fade-in');
  }
  todoPanelEl.style.height = 'auto';
  const newHeight = todoPanelEl.offsetHeight;
  todoPanelEl.style.height = oldHeight + 'px';
  void todoPanelEl.offsetHeight; 
  todoPanelEl.style.transition = 'height 0.35s cubic-bezier(0.2, 1, 0.4, 1), opacity 0.35s ease, transform 0.45s cubic-bezier(0.2, 1.15, 0.4, 1)';
  todoPanelEl.style.height = newHeight + 'px';
  setTimeout(() => {
    todoPanelEl.style.height = '';
    todoPanelEl.style.transition = '';
  }, 350);
}
document.getElementById('pom-btn-todo').addEventListener('click', e => {
  e.stopPropagation();
  pomToggleTodoPanel();
});
document.getElementById('todo-close-btn').addEventListener('click', e => {
  e.stopPropagation();
  pomToggleTodoPanel(false);
});
if (todoTrigger) {
  const highlightPill = document.getElementById('todo-view-highlight');
  const todoMenuParent = document.getElementById('todo-view-menu');
  function updateHighlight(targetEl, smooth = true) {
    if (!highlightPill || !targetEl) return;
    if (!smooth) highlightPill.style.transition = 'none';
    highlightPill.style.opacity = '1';
    highlightPill.style.transform = `translateY(${targetEl.offsetTop}px)`;
    highlightPill.style.height = `${targetEl.offsetHeight}px`;
    if (!smooth) {
      void highlightPill.offsetHeight; // force repaint
      highlightPill.style.transition = '';
    }
  }
  todoTrigger.addEventListener('click', (e) => {
    e.stopPropagation();
    const isOpening = !todoDropdown.classList.contains('open');
    todoDropdown.classList.toggle('open');
    if (isOpening) {
      // 打开时先将游标偷偷移动到当前 active 项，不带动画
      const activeItem = todoMenuParent.querySelector('.dropdown-item.active');
      if (activeItem) updateHighlight(activeItem, false);
    }
  });
  // 点击外部关闭下拉菜单
  document.addEventListener('click', () => {
    if (todoDropdown) todoDropdown.classList.remove('open');
  });
  todoMenuItems.forEach(item => {
    // Hover 触发游标滑动 (流体粘连效果)
    item.addEventListener('mouseenter', () => {
      updateHighlight(item);
    });
    item.addEventListener('click', (e) => {
      e.stopPropagation();
      const mode = item.dataset.value;
      todoViewText.textContent = item.textContent;
      todoMenuItems.forEach(i => i.classList.remove('active'));
      item.classList.add('active');
      todoDropdown.classList.remove('open');
      pomSetViewMode(mode);
    });
  });
  // 鼠标离开菜单区域时，游标滑回 active 选项
  if (todoMenuParent) {
    todoMenuParent.addEventListener('mouseleave', () => {
      const activeItem = todoMenuParent.querySelector('.dropdown-item.active');
      if (activeItem) updateHighlight(activeItem);
    });
  }
}
// 添加与步进器
todoAddBtn.addEventListener('click', pomAddTodo);
if (todoAddBtnSimple) todoAddBtnSimple.addEventListener('click', pomAddTodo);
todoInputEl.addEventListener('keydown', e => {
  if (e.key === 'Enter') {
    e.preventDefault();
    e.stopPropagation(); // 阻止冒泡，防止触发全局的 Enter 全屏事件
    pomAddTodo();
  }
});
document.getElementById('todo-est-minus').addEventListener('click', () => {
  if (pomTodoEstValue > 1) { pomTodoEstValue--; todoEstValEl.textContent = pomTodoEstValue; }
});
document.getElementById('todo-est-plus').addEventListener('click', () => {
  if (pomTodoEstValue < 12) { pomTodoEstValue++; todoEstValEl.textContent = pomTodoEstValue; }
});
// 防止点击待办面板触发底层的隐藏
todoPanelEl.addEventListener('click', e => e.stopPropagation());
// 防止双击待办面板触发全屏
todoPanelEl.addEventListener('dblclick', e => e.stopPropagation());
// 失去焦点时隐藏所有的活动清单展开界面
document.addEventListener('click', () => {
  document.querySelectorAll('.inv-est-dropdown.show').forEach(el => {
    el.classList.remove('show'); setTimeout(() => { if(!el.classList.contains('show')) el.remove(); }, 260);
  });
});

pomLoadTodos();
pomRenderTodos();

/* ══════════════════════════════════════════════
   触摸橡皮筋效果支持（Overscroll 弹性回弹）
   针对 todo-list 类实现
   ══════════════════════════════════════════════ */
document.querySelectorAll('.todo-list').forEach(list => {
  let startY = 0;
  let isPulling = false;
  let pullOffset = 0;

  list.addEventListener('touchstart', e => {
    // 关键修正：强行清除列表切换时的淡入动画，避免动画锁死 transform
    list.classList.remove('list-fade-in');

    const isAtTop = list.scrollTop <= 0;
    const isAtBottom = Math.ceil(list.scrollTop + list.clientHeight) >= list.scrollHeight - 1;

    if (isAtTop || isAtBottom) {
      startY = e.touches[0].clientY;
      isPulling = true;
      pullOffset = 0;
      list.style.transition = 'none';
    }
  }, { passive: true });

  list.addEventListener('touchmove', e => {
    if (!isPulling) return;

    const currentY = e.touches[0].clientY;
    const dy = currentY - startY;

    const isAtTop = list.scrollTop <= 0;
    const isAtBottom = Math.ceil(list.scrollTop + list.clientHeight) >= list.scrollHeight - 1;

    // 向下拉（在顶部）
    if (isAtTop && dy > 0) {
      e.preventDefault();
      pullOffset = dy * 0.4;
      list.style.transform = `translateY(${pullOffset}px)`;
    } 
    // 向上拉（在底部）
    else if (isAtBottom && dy < 0) {
      e.preventDefault();
      pullOffset = dy * 0.4;
      list.style.transform = `translateY(${pullOffset}px)`;
    } else {
      isPulling = false;
      list.style.transform = 'translateY(0)';
    }
  }, { passive: false });

  list.addEventListener('touchend', () => {
    if (!isPulling) return;
    isPulling = false;

    // 回弹动画
    list.style.transition = 'transform 0.4s cubic-bezier(0.2, 1, 0.3, 1)';
    list.style.transform = 'translateY(0)';

    // 动画结束后清理内联样式
    setTimeout(() => {
      list.style.transition = '';
      if (list.style.transform === 'translateY(0px)' || list.style.transform === 'translateY(0)') {
        list.style.transform = '';
      }
    }, 400);
  });
});





