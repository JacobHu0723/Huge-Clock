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
const POM_MAX_ROUNDS = 4; // 连续专注数达到上限后进入长休息
const POM_CONTINUITY_GAP = 45 * 60 * 1000; // 超过该间隔视为中断连续专注（毫秒）
// ── 状态 ──────────────────────────────────────
let pomVisible  = false;
let pomRunning  = false;
let pomPhaseIdx = 0;
let pomTimeLeft = POM_PHASES[0].duration;
let pomFocusStreak = 0;       // 连续专注次数（跨任务，受间隔限制）
let pomLastFocusEndAt = null; // 最近一次专注结束时间
let pomFocusStartAt = null;   // 当前专注开始时间
let pomBreakStartAt = null;   // 当前休息开始时间
let pomInterval = null;
let pomEndAt = null;         // 当前阶段结束的绝对时间戳（时间戳驱动计时）
let pomTargetSessions = 4;   // 预计需要的番茄数（默认 4）
let pomTotalFocusDone = 0;   // 当前任务已完成的专注次数
let pomSessionIntInterrupts = 0; // 当前未使用待办的内部中断
let pomSessionExtInterrupts = 0; // 当前未使用待办的外部中断
let pomSessionSkippedBreaks = 0; // 自由番茄（未绑定待办）的跳过休息计数
let pomSessionResets = 0;        // 自由番茄（未绑定待办）的重置计数
// ── 今日待办 状态 ────────────────────────────
let pomActiveDate = null;  // 当前工作日锚点
let pomTodos = [];
let pomInventory = []; // 活动清单
// { id: timestamp, text: string, est: number, done: number, completed: boolean }
let pomHistory = {}; // 形如 { "2023-10-01": [todos...], ... }
let pomCurrentTodoId = null;
let pomTodoEstValue  = 1;
let pomTodoVisible   = false;
let pomImportVisible = false;
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
const todoImportBtn = document.getElementById('todo-import-btn');
const pomImportBackdrop = document.getElementById('pom-import-backdrop');
const pomImportDialog = document.getElementById('pom-import-dialog');
const pomImportInput = document.getElementById('pom-import-input');
const pomImportCancelBtn = document.getElementById('pom-import-cancel');
const pomImportConfirmBtn = document.getElementById('pom-import-confirm');
const pomImportCloseBtn = document.getElementById('pom-import-close');
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
// 通知图标：相对路径解析为绝对 URL，本地调试与 GitHub Pages 部署均可用
const NOTIFICATION_ICON = new URL('files/clock.png', location.href).href;

function pomSystemNotify(msg) {
  if (!("Notification" in window)) return;

  const showNotification = () => {
    try {
      // 桌面端浏览器优先直接调用
      new Notification("Huge Clock", { body: msg, icon: NOTIFICATION_ICON });
    } catch (e) {
      // 安卓等移动端浏览器会抛出 TypeError，要求必须使用 Service Worker
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.ready.then(registration => {
          registration.showNotification("Huge Clock", { body: msg, icon: NOTIFICATION_ICON });
        });
      }
    }
  };

  if (Notification.permission === "granted") {
    showNotification();
  } else if (Notification.permission !== "denied") {
    try {
      const promise = Notification.requestPermission();
      if (promise && promise.then) {
        promise.then(permission => {
          if (permission === "granted") {
            showNotification();
          }
        }).catch(e => console.warn("通知权限请求错误或被限制", e));
      }
    } catch (e) {
      console.warn("请求通知权限时发生错误", e);
    }
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
function pomGetCurrentTodo() {
  if (!pomCurrentTodoId) return null;
  return pomTodos.find(x => x.id === pomCurrentTodoId) || null;
}
function pomIsCurrentTodoCompleted() {
  const t = pomGetCurrentTodo();
  return !!(t && t.completed);
}
function pomStopForCompletedTodo(message) {
  pomTotalFocusDone = 0;
  pomSessionIntInterrupts = 0;
  pomSessionExtInterrupts = 0;
  pomCurrentTodoId = null;
  pomFocusStartAt = null;
  pomPauseTimer();           // 同时解锁输入框
  pomClearSession();
  pomTaskInputEl.value = '';
  pomRender();
  pomRenderTodos();
  pomNotify(message, true);
}
// ── 计时器逻辑 ────────────────────────────────
function pomTick() {
  // 时间戳驱动：按 endAt 与当前时间的差值计算剩余，后台 setInterval 被节流时依然计时准确
  if (pomEndAt == null) {
    pomEndAt = Date.now() + pomTimeLeft * 1000;
  }
  const remaining = Math.max(0, Math.round((pomEndAt - Date.now()) / 1000));
  if (remaining > 0) {
    if (remaining !== pomTimeLeft) {
      pomTimeLeft = remaining;
      pomRender();
      if (pomPhaseIdx === 0) pomSaveSession(); // 专注冻结：被杀时保留最近一次剩余
    }
  } else {
    pomTimeLeft = 0;
    clearInterval(pomInterval);
    pomRunning = false;
    pomPanelEl.classList.remove('running');
    pomFabEl.classList.remove('running');
    pomOnPhaseEnd();
  }
}
function pomStartTimer() {
  // 请求通知权限，防止在计时结时由于非用户点击导致浏览器拦截权限请求
  try {
    if ("Notification" in window && Notification.permission !== "granted" && Notification.permission !== "denied") {
      const promise = Notification.requestPermission();
      if (promise && promise.catch) {
        promise.catch(e => console.warn("通知权限请求被拒绝或需要用户交互", e));
      }
    }
  } catch (e) {
    console.warn("请求通知权限时发生错误", e);
  }

  // 若即将开启专注，但当前任务已被标记为完成，则不再继续计时
  if (pomPhaseIdx === 0 && pomIsCurrentTodoCompleted()) {
    pomStopForCompletedTodo('✅ 任务已完成，开始下个任务吧！');
    return;
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
      completedAt: null,
      firstFocusAt: null,
      lastFocusAt: null,
      focusSessions: [],
      breakSessions: [],
      skippedBreaks: 0,
      resetCount: 0,
      revertCount: 0,
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

  if (pomPhaseIdx === 0) {
    const now = Date.now();
    if (!pomFocusStartAt || pomTimeLeft === POM_PHASES[0].duration) {
      pomFocusStartAt = now;
    }
    const t = pomGetCurrentTodo();
    if (t) {
      if (!t.firstFocusAt) t.firstFocusAt = pomFocusStartAt;
      pomSaveTodos();
      if (pomViewMode === 'today') pomRenderTodos();
    }
  } else {
    // 休息阶段开始，记录休息开始时间
    if (!pomBreakStartAt) {
      pomBreakStartAt = Date.now();
    }
  }

  clearInterval(pomInterval);
  pomRunning = true;
  pomPanelEl.classList.add('running');
  pomFabEl.classList.add('running');
  pomTaskInputEl.setAttribute('readonly', '');
  pomToggleIconEl.textContent = '⏸';
  pomEndAt = Date.now() + pomTimeLeft * 1000;
  pomSaveSession();
  pomInterval = setInterval(pomTick, 1000);
}
function pomPauseTimer() {
  clearInterval(pomInterval);
  pomEndAt = null;
  pomRunning = false;
  pomPanelEl.classList.remove('running');
  pomFabEl.classList.remove('running');
  pomTaskInputEl.removeAttribute('readonly');
  pomToggleIconEl.textContent = '▶';
  pomSaveSession();
}
// ── 阶段切换 ──────────────────────────────────
function pomOnPhaseEnd() {
  if (pomPhaseIdx === 0) {
    // 专注阶段结束
    pomTotalFocusDone++;
    const now = Date.now();
    const focusStartAt = pomFocusStartAt || now;
    if (pomLastFocusEndAt && (focusStartAt - pomLastFocusEndAt) > POM_CONTINUITY_GAP) {
      pomFocusStreak = 0;
    }
    pomFocusStreak++;
    pomLastFocusEndAt = now;
    pomFocusStartAt = null;
    const taskName = pomTaskInputEl.value.trim();
    const taskDone = pomTotalFocusDone >= pomTargetSessions;
    // 如果有绑定的待办事项，更新其进度
    if (pomCurrentTodoId) {
      const t = pomTodos.find(x => x.id === pomCurrentTodoId);
      if (t) {
        t.done++;
        t.lastFocusAt = now;
        if (!t.firstFocusAt) t.firstFocusAt = focusStartAt;
        if (!Array.isArray(t.focusSessions)) t.focusSessions = [];
        if (focusStartAt && now >= focusStartAt) {
          t.focusSessions.push({ startAt: focusStartAt, endAt: now });
        }
        pomSaveTodos();
        pomRenderTodos();
      }
    }
    // 确定下一个休息阶段
    if (pomFocusStreak >= POM_MAX_ROUNDS) {
      pomFocusStreak = 0;
      pomPhaseIdx = 2;
      pomTimeLeft = POM_PHASES[2].duration;
    } else {
      pomPhaseIdx = 1;
      pomTimeLeft = POM_PHASES[1].duration;
    }
    if (taskDone) {
      const nameStr = taskName ? `"${taskName}" ` : '';
      pomNotify(`⏰ ${nameStr}目标番茄数已达标！共专注 ${pomTotalFocusDone} 个🍅`, true);
    } else {
      const breakLabel = pomPhaseIdx === 2 ? '长休息' : '短休息';
      pomNotify(`✅ 专注结束，开始${breakLabel}（${pomTotalFocusDone}/${pomTargetSessions}）`, true);
    }
    pomRender();
    pomStartTimer();
  } else {
    // 休息结束
    const breakEndAt = Date.now();
    // 记录休息时间段到前一个专注所属的任务
    if (pomCurrentTodoId && pomBreakStartAt && breakEndAt >= pomBreakStartAt) {
      const t = pomTodos.find(x => x.id === pomCurrentTodoId);
      if (t) {
        if (!Array.isArray(t.breakSessions)) t.breakSessions = [];
        t.breakSessions.push({ startAt: pomBreakStartAt, endAt: breakEndAt });
        pomSaveTodos();
      }
    }
    pomBreakStartAt = null;
    pomPhaseIdx = 0;
    pomTimeLeft = POM_PHASES[0].duration;
    if (pomIsCurrentTodoCompleted()) {
      pomStopForCompletedTodo('✅ 任务已完成，开始下个任务吧！');
      return;
    }
    if (pomTotalFocusDone >= pomTargetSessions) {
      // 任务已达标：重置进度，暂停等待用户开始下一个任务
      pomTotalFocusDone = 0;
      pomCurrentTodoId  = null;
      pomSessionIntInterrupts = 0;
      pomSessionExtInterrupts = 0;
      pomRender();
      pomRenderTodos();
      pomPauseTimer();           // 同时解锁输入框
      pomClearSession();
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
  let autoStartNextFocus = false;
  
  if (pomPhaseIdx === 0) {
    // 1. 当前在专注中 -> 重置当前计时
    pomFocusStartAt = null;
    pomTimeLeft = POM_PHASES[0].duration;
    const t = pomGetCurrentTodo();
    if (t) {
      t.resetCount = (t.resetCount || 0) + 1;
      pomSaveTodos();
    } else {
      pomSessionResets++; // 自由番茄：重置计数记入会话
    }
    pomSaveSession(); // 同步重置后的剩余时间到会话，避免刷新恢复到旧值
    pomNotify('🔄 计时已重置', false);
  } else {
    // 2. 当前在休息中(1或2) -> 跳过休息，进入下一个番茄状态
    if (pomCurrentTodoId) {
      const t = pomGetCurrentTodo();
      if (t) {
        t.skippedBreaks = (t.skippedBreaks || 0) + 1;
        pomSaveTodos();
        if (pomViewMode === 'today') pomRenderTodos();
      }
    } else {
      pomSessionSkippedBreaks++; // 自由番茄：跳过休息计数记入会话
    }
    pomPhaseIdx = 0;
    pomTimeLeft = POM_PHASES[0].duration;
    pomNotify('⏭️ 已跳过休息，进入专注', false);
    autoStartNextFocus = true;
  }
  
  if(pomViewMode === 'today') pomRenderTodos();
  pomRender();
  if (autoStartNextFocus) {
    pomStartTimer();
  }
}

// 长按倒退上一番茄钟的专项逻辑
function revertOnePomodoro() {
  pomPauseTimer();
  pomPhaseIdx = 0;
  pomTimeLeft = POM_PHASES[0].duration;
  
  // 核心回退：已经完成的专注次数减1，对应任务的打卡减1
  if (pomTotalFocusDone > 0) pomTotalFocusDone--;
  if (pomFocusStreak > 0) pomFocusStreak--;
  pomLastFocusEndAt = null;
  pomFocusStartAt = null;
  
  // 若有关联的待办事项，撤销其一次完成量
  if (pomCurrentTodoId) {
    const t = pomTodos.find(x => x.id === pomCurrentTodoId);
    if (t && t.done > 0) {
      t.done--;
      t.completed = false; // 撤销完成状态
      t.completedAt = null;
      t.revertCount = (t.revertCount || 0) + 1;
      if (Array.isArray(t.focusSessions) && t.focusSessions.length > 0) {
        t.focusSessions.pop();
      }
      if (Array.isArray(t.focusSessions) && t.focusSessions.length > 0) {
        t.firstFocusAt = t.focusSessions[0].startAt || null;
        t.lastFocusAt = t.focusSessions[t.focusSessions.length - 1].endAt || null;
      } else {
        t.firstFocusAt = null;
        t.lastFocusAt = null;
      }
      pomSaveTodos();
    }
  }
  if(pomViewMode === 'today') pomRenderTodos();
  pomSaveSession(); // 同步重置后的剩余时间到会话
  pomRender();
}
// Esc：关闭面板
function pomKeyEsc() {
  if (pomImportVisible) {
    pomToggleImportDialog(false);
  } else if (pomTodoVisible) {
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

/* === 初始化气泡 DOM === */
const resetBtn = document.getElementById('pom-btn-reset');
const resetBubble = document.createElement('div');
resetBubble.className = 'pom-reset-bubble';
resetBubble.innerText = '上滑撤销番茄钟';
resetBtn.appendChild(resetBubble);

/* === 长按与上滑交互变量 === */
let resetPressTimer = null;
let resetIsLongPress = false;
let resetStartY = 0;
let resetBubbleReady = false;

resetBtn.addEventListener('pointerdown', e => {
  e.stopPropagation();
  // 只响应左键或单指触摸
  if (e.pointerType === 'mouse' && e.button !== 0) return;
  
  resetBtn.setPointerCapture(e.pointerId);
  resetIsLongPress = false;
  resetBubbleReady = false;
  resetStartY = e.clientY;
  
  // 500ms 触发长按气泡
  resetPressTimer = setTimeout(() => {
    resetIsLongPress = true;
    resetBtn.classList.add('hide-shortcut'); // 隐藏原本默认快捷键气泡
    resetBubble.classList.add('active');
    // 提供触觉反馈 (如果在支持振动的移动端设备)
    if (navigator.vibrate) navigator.vibrate(50); 
  }, 500);
});

resetBtn.addEventListener('pointermove', e => {
  if (!resetIsLongPress) return;
  // 长按启动后，检测上滑幅度 (例如上移少于 40px)
  const dy = resetStartY - e.clientY;
  
  if (dy > 40) {
    if (!resetBubbleReady) {
      resetBubbleReady = true;
      resetBubble.classList.add('ready');
      resetBubble.innerText = '释放以撤销';
      if (navigator.vibrate) navigator.vibrate(50); // 滑动到位再次给反馈
    }
  } else {
    if (resetBubbleReady) {
      resetBubbleReady = false;
      resetBubble.classList.remove('ready');
      resetBubble.innerText = '上滑撤销番茄钟';
    }
  }
});

function handleResetEnd(e) {
  clearTimeout(resetPressTimer);
  
  if (resetIsLongPress) {
    // 处理长按结束
    if (resetBubbleReady) {
      revertOnePomodoro(); // 执行撤销逻辑
      pomNotify('↩️ 已撤销上一个番茄钟', false);
    }
    // 恢复状态与气泡
    resetBubble.classList.remove('active', 'ready');
    resetBtn.classList.remove('hide-shortcut');
    resetBubble.innerText = '上滑撤销番茄钟';
  } else {
    // 走正常点击流程，如果移动距离很短
    const dy = Math.abs(resetStartY - e.clientY);
    if (dy < 10) {
      pomKeyR();
    }
    resetBtn.classList.remove('hide-shortcut');
  }
  
  resetIsLongPress = false;
  resetBubbleReady = false;
  try { resetBtn.releasePointerCapture(e.pointerId); } catch(err){}
}

resetBtn.addEventListener('pointerup', handleResetEnd);
resetBtn.addEventListener('pointercancel', handleResetEnd);

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
  if (pomRunning) { pomEndAt = Date.now() + seconds * 1000; pomSaveSession(); }
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
  pomInventory = pomInventory.filter(i => !i.completed);
  pomSaveTodos();

  if (typeof pomRenderTodos === 'function' && pomViewMode === 'today') pomRenderTodos();
  if (typeof pomRenderInventory === 'function' && pomViewMode === 'inventory') pomRenderInventory();
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
  if (typeof pomRenderHistory === 'function' && pomViewMode === 'history') pomRenderHistory();
}
// ── 运行中会话持久化（刷新 / 进程被杀后恢复计时）──
const POM_SESSION_KEY = 'pomodoro_session';
function pomSaveSession() {
  const data = {
    phaseIdx: pomPhaseIdx,
    running: pomRunning,
    currentTodoId: pomCurrentTodoId,
    focusStreak: pomFocusStreak,
    lastFocusEndAt: pomLastFocusEndAt,
    focusStartAt: pomFocusStartAt,
    breakStartAt: pomBreakStartAt,
    targetSessions: pomTargetSessions,
    totalFocusDone: pomTotalFocusDone,
    sessionIntInterrupts: pomSessionIntInterrupts,
    sessionExtInterrupts: pomSessionExtInterrupts,
    sessionSkippedBreaks: pomSessionSkippedBreaks,
    sessionResets: pomSessionResets,
    taskName: pomTaskInputEl.value.trim(),
  };
  if (pomPhaseIdx === 0) {
    // 专注：退出即冻结，保存剩余秒数（被杀/刷新后回到同一剩余值）
    data.focusTimeLeft = Math.max(1, Math.round(pomTimeLeft));
  } else if (pomRunning && pomEndAt != null) {
    // 休息运行中：时间正常流逝，保存绝对结束时间戳
    data.restEndAt = pomEndAt;
  } else {
    // 休息暂停：冻结剩余秒数
    data.restTimeLeft = Math.max(1, Math.round(pomTimeLeft));
  }
  localStorage.setItem(POM_SESSION_KEY, JSON.stringify(data));
}
function pomClearSession() {
  localStorage.removeItem(POM_SESSION_KEY);
}
function pomRestoreSession() {
  let s = null;
  try { s = JSON.parse(localStorage.getItem(POM_SESSION_KEY) || 'null'); } catch (e) { s = null; }
  if (!s || !Number.isFinite(s.phaseIdx)) return;
  pomPhaseIdx = Math.min(Math.max(s.phaseIdx, 0), POM_PHASES.length - 1);
  pomCurrentTodoId = s.currentTodoId || null;
  pomFocusStreak = s.focusStreak || 0;
  pomLastFocusEndAt = s.lastFocusEndAt || null;
  pomBreakStartAt = s.breakStartAt || null;
  if (Number.isFinite(s.targetSessions)) pomTargetSessions = s.targetSessions;
  if (Number.isFinite(s.totalFocusDone)) pomTotalFocusDone = s.totalFocusDone;
  pomSessionIntInterrupts = s.sessionIntInterrupts || 0;
  pomSessionExtInterrupts = s.sessionExtInterrupts || 0;
  pomSessionSkippedBreaks = s.sessionSkippedBreaks || 0;
  pomSessionResets = s.sessionResets || 0;
  if (s.taskName) pomTaskInputEl.value = s.taskName;
  // 切回暂停态 UI（非运行）
  const pauseUI = () => {
    pomRunning = false;
    pomEndAt = null;
    pomPanelEl.classList.remove('running');
    pomFabEl.classList.remove('running');
    pomTaskInputEl.removeAttribute('readonly');
    pomToggleIconEl.textContent = '▶';
  };
  if (pomPhaseIdx === 0) {
    // 专注：恢复冻结的剩余秒数，暂停等待（“准备”状态，等待用户点击开始）
    pomTimeLeft = Number.isFinite(s.focusTimeLeft) ? s.focusTimeLeft : POM_PHASES[0].duration;
    pomFocusStartAt = null; // 被杀/暂停时段不计入本次专注，重新开始后重新计时
    pauseUI();
    if (pomIsCurrentTodoCompleted()) {
      pomClearSession();
      pomCurrentTodoId = null;
      pomTaskInputEl.value = '';
    } else {
      pomSaveSession(); // 同步 session 为暂停态
    }
    pomNotify('🔄 已恢复专注（暂停中），点击开始继续', false);
  } else if (Number.isFinite(s.restEndAt)) {
    // 休息运行中被杀：时间照常流逝
    const remaining = Math.max(0, Math.round((s.restEndAt - Date.now()) / 1000));
    if (remaining > 0) {
      // 休息尚未结束：继续倒计时（误差不超过 setInterval 粒度）
      pomTimeLeft = remaining;
      pomEndAt = s.restEndAt;
      pomRunning = true;
      pomPanelEl.classList.add('running');
      pomFabEl.classList.add('running');
      pomTaskInputEl.setAttribute('readonly', '');
      pomToggleIconEl.textContent = '⏸';
      clearInterval(pomInterval);
      pomInterval = setInterval(pomTick, 1000);
      pomNotify('🔄 已恢复休息计时', false);
    } else {
      // 休息早已结束：进入下一个番茄钟，暂停等待（“准备”状态）
      pomPhaseIdx = 0;
      pomTimeLeft = POM_PHASES[0].duration;
      pomFocusStartAt = null;
      pomBreakStartAt = null;
      pauseUI();
      pomSaveSession();
      pomNotify('⏱ 休息已结束，准备开始下一个番茄钟', false);
    }
  } else {
    // 休息暂停中被杀：恢复冻结的剩余秒数，暂停等待
    pomTimeLeft = Number.isFinite(s.restTimeLeft) ? s.restTimeLeft : POM_PHASES[pomPhaseIdx].duration;
    pauseUI();
    pomNotify('🔄 已恢复休息（暂停中）', false);
  }
  pomRender();
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
    const normalizeSkippedBreaks = (arr) => {
      if (!Array.isArray(arr)) return;
    arr.forEach(item => {
      if (!item) return;
      if (item.skippedBreaks == null && item.skippedPoms != null) {
        item.skippedBreaks = item.skippedPoms;
      }
      delete item.skippedPoms; // 老字段迁移后清理，保持数据格式统一
      if (!Array.isArray(item.focusSessions)) {
        item.focusSessions = [];
      } else {
        item.focusSessions = item.focusSessions
          .filter(s => s && Number.isFinite(s.startAt) && Number.isFinite(s.endAt) && s.endAt >= s.startAt)
          .map(s => ({ startAt: s.startAt, endAt: s.endAt }))
          .sort((a, b) => a.startAt - b.startAt);
      }
      if (item.focusSessions.length === 0 && item.firstFocusAt && item.lastFocusAt && item.lastFocusAt >= item.firstFocusAt) {
        item.focusSessions = [{ startAt: item.firstFocusAt, endAt: item.lastFocusAt }];
      }
      if (!Array.isArray(item.breakSessions)) {
        item.breakSessions = [];
      } else {
        item.breakSessions = item.breakSessions
          .filter(s => s && Number.isFinite(s.startAt) && Number.isFinite(s.endAt) && s.endAt >= s.startAt)
          .map(s => ({ startAt: s.startAt, endAt: s.endAt }))
          .sort((a, b) => a.startAt - b.startAt);
      }
      if (item.resetCount == null) {
        item.resetCount = 0;
      }
      if (item.revertCount == null) {
        item.revertCount = 0;
      }
    });
  };
    normalizeSkippedBreaks(pomInventory);
    Object.keys(pomHistory).forEach(k => normalizeSkippedBreaks(pomHistory[k]));
    
    // 如果日期变了，将上一天的任务归档，清空今日任务
    if (data.today && data.today !== currentDay) {
      if (data.todos && data.todos.length > 0) {
        normalizeSkippedBreaks(data.todos); // 归档前先归一化，保证历史数据格式统一
        data.todos.forEach(t => { if (t) delete t.isNew; }); // 清理 UI 动画标记，避免残留进历史
        pomHistory[data.today] = data.todos;
      }
      pomTodos = [];
      pomCurrentTodoId = null;
      // 跨天时清理活动清单中已完成的任务，保留未完成的
      pomInventory = pomInventory.filter(i => !i.completed);
    } else {
      pomTodos = data.todos || [];
      pomActiveDate = data.today || currentDay; // 恢复保存时的活跃日期
    }
    normalizeSkippedBreaks(pomTodos);
  } catch(e) {
    console.warn("读取番茄钟数据失败", e);
  }
}
// HTML 转义：所有用户输入文本渲染进 innerHTML 前必须经过此函数（防 XSS）
function pomEscapeHtml(str) {
  return String(str == null ? '' : str).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}
function pomGeneratePomsHtml(item) {
  // 上限保护：防止导入或历史脏数据中的超大预估/完成数导致渲染海量 emoji 卡死
  let est = Math.min(item.est || 1, 12);
  let ext1 = Math.min(item.ext1 || 0, 12);
  let ext2 = Math.min(item.ext2 || 0, 12);
  let done = Math.min(item.done || 0, 36);
  let html = '';
  for (let i = 0; i < est; i++) {
    if (done > i) html += '🍅';
    else html += '<span class="todo-poms-empty">⚪</span>';
  }
  if (ext1 > 0 || done > est) {
    let doneAfterNormal = Math.max(0, done - est);
    for (let i = 0; i < ext1; i++) {
      if (doneAfterNormal > i) html += '🔵';
      else html += '<span class="todo-poms-empty" style="opacity:0.6; filter:saturate(0);">🔵</span>';
    }
  }
  if (ext2 > 0 || done > est + ext1) {
    let doneAfterExt1 = Math.max(0, done - est - ext1);
    for (let i = 0; i < ext2; i++) {
      if (doneAfterExt1 > i) html += '🟣';
      else html += '<span class="todo-poms-empty" style="opacity:0.6; filter:saturate(0);">🟣</span>';
    }
  }
  let plannedTotal = est + ext1 + ext2;
  for (let i = plannedTotal; i < done; i++) {
    html += '🔴'; 
  }
  return html;
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
    let poms = pomGeneratePomsHtml(item);

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
      <div class="todo-main-row"><input type="checkbox" class="todo-chk" ${item.completed ? 'checked' : ''}><div class="todo-info"><div class="todo-name" title="${pomEscapeHtml(item.text)}">${pomEscapeHtml(item.text)}</div><div style="display:flex; align-items:center;"><div class="todo-poms">${poms}</div>${interruptsHtml}</div></div><button class="todo-play" title="应用此待办到番茄钟"><span class="todo-btn-glyph">▶</span></button><button class="todo-del" title="删除此待办"><span class="todo-btn-glyph">✕</span></button></div>`;

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
      let est = item.est || 1;
      let ext1 = item.ext1 || 0;
      let ext2 = item.ext2 || 0;
      let done = item.done || 0;

      dropdown.innerHTML = `
        <div style="display:flex; flex-direction:column; gap:8px; padding: 6px; width:100%; box-sizing:border-box;">
          <div class="row-est" style="display:flex; align-items:center; justify-content:space-between; ${done >= est && (ext1 > 0 || done > est) ? 'opacity:0.5; pointer-events:none;' : ''}">
            <span style="font-size:13px; color:rgba(255,255,255,0.6);">🎯 预估目标</span>
            <div class="todo-est-stepper" style="padding:2px 6px;"><button class="step-btn step-minus" data-type="est" tabindex="-1">−</button><input type="number" class="inv-est-input step-input" data-type="est" value="${est}" min="1" max="12" style="width:20px; text-align:center; padding:0; font-weight:bold; font-size:14px;" readonly /><button class="step-btn step-plus" data-type="est" tabindex="-1">＋</button></div>
          </div>
          
          <div class="row-ext1" style="display:flex; align-items:center; justify-content:space-between; ${done < est ? 'display:none;' : (done >= est + ext1 && ext1 > 0 ? 'opacity:0.5; pointer-events:none;' : '')}">
            <span style="font-size:13px; color:rgba(255,255,255,0.6);">🔵 首次追加</span>
            <div class="todo-est-stepper" style="padding:2px 6px;"><button class="step-btn step-minus" data-type="ext1" tabindex="-1">−</button><input type="number" class="inv-est-input step-input" data-type="ext1" value="${ext1}" min="0" max="12" style="width:20px; text-align:center; padding:0; font-weight:bold; font-size:14px;" readonly /><button class="step-btn step-plus" data-type="ext1" tabindex="-1">＋</button></div>
          </div>

          <div class="row-ext2" style="display:flex; align-items:center; justify-content:space-between; ${ext1 === 0 || done < est + ext1 ? 'display:none;' : ''}">
            <span style="font-size:13px; color:rgba(255,255,255,0.6);">🟣 再次追加</span>
            <div class="todo-est-stepper" style="padding:2px 6px;"><button class="step-btn step-minus" data-type="ext2" tabindex="-1">−</button><input type="number" class="inv-est-input step-input" data-type="ext2" value="${ext2}" min="0" max="12" style="width:20px; text-align:center; padding:0; font-weight:bold; font-size:14px;" readonly /><button class="step-btn step-plus" data-type="ext2" tabindex="-1">＋</button></div>
          </div>
          <div class="inv-est-actions" style="margin-top:4px; display:flex; justify-content:flex-end; gap:6px;">
            <button class="inv-est-cancel" tabindex="-1">取消</button>
            <button class="inv-est-confirm" tabindex="-1">确认</button>
          </div>
        </div>
      `;
      dropdown.addEventListener('click', ev => ev.stopPropagation());
      
        el.appendChild(dropdown);
      // 强制重绘以触发 transition 展开
      void dropdown.offsetWidth;
      dropdown.classList.add('show');

      const cancelBtn = dropdown.querySelector('.inv-est-cancel');
      const confirmBtn = dropdown.querySelector('.inv-est-confirm');
      const inputs = {
        est: dropdown.querySelector('.step-input[data-type="est"]'),
        ext1: dropdown.querySelector('.step-input[data-type="ext1"]'),
        ext2: dropdown.querySelector('.step-input[data-type="ext2"]')
      };

      dropdown.querySelectorAll('.step-minus').forEach(btn => {
        btn.addEventListener('click', () => {
          let type = btn.dataset.type;
          let input = inputs[type];
          let val = parseInt(input.value) || 0;
          let min = type === 'est' ? 1 : 0;
          
          if (type === 'ext1' && val === 1 && parseInt(inputs.ext2.value) > 0) return; // 不能在有二加时归零一加
          
          if (val > min) input.value = val - 1;
        });
      });
      dropdown.querySelectorAll('.step-plus').forEach(btn => {
        btn.addEventListener('click', () => {
          let type = btn.dataset.type;
          let input = inputs[type];
          let val = parseInt(input.value) || 0;
          if (val < 12) input.value = val + 1;
        });
      });

      cancelBtn.addEventListener('click', () => { dropdown.classList.remove('show'); setTimeout(() => { if(!dropdown.classList.contains('show')) dropdown.remove(); }, 260); });

      confirmBtn.addEventListener('click', () => {
        item.est = Math.max(1, parseInt(inputs.est.value) || 1);
        item.ext1 = Math.max(0, parseInt(inputs.ext1.value) || 0);
        item.ext2 = Math.max(0, parseInt(inputs.ext2.value) || 0);
        
        // 如果当前正在计时该任务，则同步更新面板显示
        if (pomCurrentTodoId === item.id) {
          pomTargetSessions = item.est + item.ext1 + item.ext2;
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
      if (item.completed) item.completedAt = item.completedAt || Date.now();
      else item.completedAt = null;
      // 如果有来源于活动清单的记录，联动同步其状态并保存
      if (item.inventoryOriginalId) {
        const invItem = pomInventory.find(i => i.id === item.inventoryOriginalId);
        if (invItem) {
          invItem.completed = item.completed;
          if (invItem.completed) invItem.completedAt = invItem.completedAt || item.completedAt || Date.now();
          else invItem.completedAt = null;
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
      pomTargetSessions = (item.est || 1) + (item.ext1 || 0) + (item.ext2 || 0);
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
  const sortedInventory = [...pomInventory].sort((a, b) => {
    if (a.completed === b.completed) return 0;
    return a.completed ? 1 : -1;
  });
  sortedInventory.forEach(item => {
    const el = document.createElement('div');
    el.className = `todo-item ${item.completed ? 'completed' : ''}`;
    el.innerHTML = `
      <div class="todo-main-row"><div class="todo-info" style="padding-left: 8px;"><div class="todo-name" title="${pomEscapeHtml(item.text)}">${pomEscapeHtml(item.text)}</div></div><button class="todo-play todo-inv-add" title="添加到今日待办" style="margin-right: 8px;"><span class="todo-btn-glyph" style="font-size: 20px;">＋</span></button><button class="todo-del" title="删除此活动"><span class="todo-btn-glyph">✕</span></button></div>`;
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
      
      let est = item.est || 1;
      let ext1 = item.ext1 || 0;
      let ext2 = item.ext2 || 0;
      let done = item.done || 0;

      dropdown.innerHTML = `
        <div style="display:flex; flex-direction:column; gap:8px; padding: 6px; width:100%; box-sizing:border-box;">
          <div class="row-est" style="display:flex; align-items:center; justify-content:space-between; ${done >= est && (ext1 > 0 || done > est) ? 'opacity:0.5; pointer-events:none;' : ''}">
            <span style="font-size:13px; color:rgba(255,255,255,0.6);">🎯 预估目标</span>
            <div class="todo-est-stepper" style="padding:2px 6px;"><button class="step-btn step-minus" data-type="est" tabindex="-1">−</button><input type="number" class="inv-est-input step-input" data-type="est" value="${est}" min="1" max="12" style="width:20px; text-align:center; padding:0; font-weight:bold; font-size:14px;" readonly /><button class="step-btn step-plus" data-type="est" tabindex="-1">＋</button></div>
          </div>
          
          <div class="row-ext1" style="display:flex; align-items:center; justify-content:space-between; ${done < est ? 'display:none;' : (done >= est + ext1 && ext1 > 0 ? 'opacity:0.5; pointer-events:none;' : '')}">
            <span style="font-size:13px; color:rgba(255,255,255,0.6);">🔵 首次追加</span>
            <div class="todo-est-stepper" style="padding:2px 6px;"><button class="step-btn step-minus" data-type="ext1" tabindex="-1">−</button><input type="number" class="inv-est-input step-input" data-type="ext1" value="${ext1}" min="0" max="12" style="width:20px; text-align:center; padding:0; font-weight:bold; font-size:14px;" readonly /><button class="step-btn step-plus" data-type="ext1" tabindex="-1">＋</button></div>
          </div>

          <div class="row-ext2" style="display:flex; align-items:center; justify-content:space-between; ${ext1 === 0 || done < est + ext1 ? 'display:none;' : ''}">
            <span style="font-size:13px; color:rgba(255,255,255,0.6);">🟣 再次追加</span>
            <div class="todo-est-stepper" style="padding:2px 6px;"><button class="step-btn step-minus" data-type="ext2" tabindex="-1">−</button><input type="number" class="inv-est-input step-input" data-type="ext2" value="${ext2}" min="0" max="12" style="width:20px; text-align:center; padding:0; font-weight:bold; font-size:14px;" readonly /><button class="step-btn step-plus" data-type="ext2" tabindex="-1">＋</button></div>
          </div>
          <div class="inv-est-actions" style="margin-top:4px; display:flex; justify-content:flex-end; gap:6px;">
            <button class="inv-est-cancel" tabindex="-1">取消</button>
            <button class="inv-est-confirm" tabindex="-1">确认</button>
          </div>
        </div>
      `;
      // 防止点击冒泡关闭自身
      dropdown.addEventListener('click', ev => ev.stopPropagation());
      
        el.appendChild(dropdown);
      // 强制重绘以触发 transition 展开
      void dropdown.offsetWidth;
      dropdown.classList.add('show');

      const cancelBtn = dropdown.querySelector('.inv-est-cancel');
      const confirmBtn = dropdown.querySelector('.inv-est-confirm');
      const inputs = {
        est: dropdown.querySelector('.step-input[data-type="est"]'),
        ext1: dropdown.querySelector('.step-input[data-type="ext1"]'),
        ext2: dropdown.querySelector('.step-input[data-type="ext2"]')
      };

      dropdown.querySelectorAll('.step-minus').forEach(btn => {
        btn.addEventListener('click', () => {
          let type = btn.dataset.type;
          let input = inputs[type];
          let val = parseInt(input.value) || 0;
          let min = type === 'est' ? 1 : 0;
          if (val > min) input.value = val - 1;
        });
      });
      dropdown.querySelectorAll('.step-plus').forEach(btn => {
        btn.addEventListener('click', () => {
          let type = btn.dataset.type;
          let input = inputs[type];
          let val = parseInt(input.value) || 0;
          if (val < 12) input.value = val + 1;
        });
      });

      cancelBtn.addEventListener('click', () => { dropdown.classList.remove('show'); setTimeout(() => { if(!dropdown.classList.contains('show')) dropdown.remove(); }, 260); });

      confirmBtn.addEventListener('click', () => {
        const todoItem = { ...item, id: Date.now(), isNew: true };
        todoItem.est = Math.max(1, parseInt(inputs.est.value) || 1);
        todoItem.ext1 = Math.max(0, parseInt(inputs.ext1.value) || 0);
        todoItem.ext2 = Math.max(0, parseInt(inputs.ext2.value) || 0);
        todoItem.focusSessions = [];
        todoItem.breakSessions = [];
        todoItem.resetCount = 0;
        todoItem.revertCount = 0;
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
    completedAt: null,
    firstFocusAt: null,
    lastFocusAt: null,
    focusSessions: [],
    breakSessions: [],
    skippedBreaks: 0,
    resetCount: 0,
    revertCount: 0,
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
function pomToggleImportDialog(force) {
  if (!pomImportDialog || !pomImportBackdrop) return;
  const next = typeof force === 'boolean' ? force : !pomImportVisible;
  if (next === pomImportVisible) return;
  pomImportVisible = next;
  if (pomImportVisible) {
    pomImportBackdrop.classList.add('visible');
    pomImportDialog.classList.add('visible');
    // 不自动聚焦输入框，避免手机端打开导入框即弹出输入法
  } else {
    pomImportBackdrop.classList.remove('visible');
    pomImportDialog.classList.remove('visible');
  }
}
function pomParseImport(text) {
  const lines = String(text || '').split(/\r?\n/);
  const items = [];
  for (let i = 0; i < lines.length; i++) {
    let raw = lines[i].trim();
    if (!raw) continue;
    if (raw.startsWith('#') || raw.startsWith('//')) continue;
    if (/^HC-IMPORT/i.test(raw)) continue;
    if (/^(date|日期)\s*[:：]/i.test(raw)) continue;
    raw = raw.replace(/｜/g, '|');
    const parts = raw.split('|').map(s => s.trim()).filter(Boolean);
    if (parts.length < 2) {
      return { error: `第 ${i + 1} 行缺少预估番茄数` };
    }
    if (parts.length > 2) {
      return { error: `第 ${i + 1} 行格式应为：任务名 | 预估` };
    }
    const name = parts[0];
    const est = parseInt(parts[1], 10);
    if (!name) return { error: `第 ${i + 1} 行任务名为空` };
    if (!Number.isFinite(est) || est < 1 || est > 12) return { error: `第 ${i + 1} 行预估番茄数应在 1~12 之间` };
    items.push({ text: name, est });
  }
  if (items.length === 0) return { error: '未识别到任何任务' };
  return { items };
}
function pomApplyImport(text) {
  const parsed = pomParseImport(text);
  if (parsed.error) {
    pomNotify(`⚠️ 导入失败：${parsed.error}`, false);
    return;
  }

  const base = Date.now();
  let seq = 0;
  let addedTodos = 0;
  let addedInventory = 0;

  parsed.items.forEach(item => {
    const todoId = base + (seq++);
    const todoItem = {
      id: todoId,
      text: item.text,
      est: item.est,
      ext1: 0,
      ext2: 0,
      done: 0,
      completed: false,
      completedAt: null,
      firstFocusAt: null,
      lastFocusAt: null,
      focusSessions: [],
      breakSessions: [],
      skippedBreaks: 0,
      resetCount: 0,
      revertCount: 0,
      isNew: true
    };

    const normalized = item.text.trim().toLowerCase();
    // 同名但已完成的活动清单项不复用，视为不存在并新建条目
    let invItem = pomInventory.find(i => !i.completed && (i.text || '').trim().toLowerCase() === normalized);
    if (!invItem) {
      const invId = base + 1000 + (seq++);
      invItem = {
        id: invId,
        text: item.text,
        est: item.est,
        ext1: 0,
        ext2: 0,
        done: 0,
        completed: false,
        completedAt: null,
        firstFocusAt: null,
        lastFocusAt: null,
        focusSessions: [],
        breakSessions: [],
        skippedBreaks: 0,
        resetCount: 0,
        revertCount: 0,
        isNew: true
      };
      pomInventory.push(invItem);
      addedInventory++;
    }
    todoItem.inventoryOriginalId = invItem.id;
    pomTodos.push(todoItem);
    addedTodos++;
  });

  if (addedTodos > 0) {
    pomSaveTodos();
    pomRenderInventory();
    if (pomViewMode === 'today') pomRenderTodos();
  }

  pomNotify(`✅ 已导入 ${addedTodos} 项待办，新增 ${addedInventory} 项到活动清单`, false);
  if (pomImportInput) pomImportInput.value = '';
  pomToggleImportDialog(false);
}
function pomCopyToClipboard(text) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    return navigator.clipboard.writeText(text);
  }
  return new Promise((resolve, reject) => {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    textarea.style.left = '-9999px';
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    try {
      const ok = document.execCommand('copy');
      document.body.removeChild(textarea);
      if (ok) resolve();
      else reject(new Error('复制失败'));
    } catch (err) {
      document.body.removeChild(textarea);
      reject(err);
    }
  });
}
function pomFormatTime(ts) {
  if (!ts) return '-';
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
}
function pomFormatTimeRange(start, end) {
  if (!start || !end) return '-';
  return `${pomFormatTime(start)}-${pomFormatTime(end)}`;
}
function pomMergeIntervals(intervals, maxGap = POM_CONTINUITY_GAP) {
  if (!Array.isArray(intervals) || intervals.length === 0) return [];
  const normalized = intervals
    .filter(i => i && Number.isFinite(i.startAt) && Number.isFinite(i.endAt) && i.endAt >= i.startAt)
    .sort((a, b) => a.startAt - b.startAt);
  if (normalized.length === 0) return [];
  const merged = [{ startAt: normalized[0].startAt, endAt: normalized[0].endAt }];
  for (let i = 1; i < normalized.length; i++) {
    const curr = normalized[i];
    const last = merged[merged.length - 1];
    if ((curr.startAt - last.endAt) <= maxGap) {
      if (curr.endAt > last.endAt) last.endAt = curr.endAt;
    } else {
      merged.push({ startAt: curr.startAt, endAt: curr.endAt });
    }
  }
  return merged;
}
function pomGetTaskIntervals(task) {
  if (!task) return [];
  const sessions = Array.isArray(task.focusSessions) ? task.focusSessions : [];
  const base = sessions.length > 0
    ? sessions
    : (task.firstFocusAt && task.lastFocusAt && task.lastFocusAt >= task.firstFocusAt
      ? [{ startAt: task.firstFocusAt, endAt: task.lastFocusAt }]
      : []);
  if (base.length === 0) return [];

  const sorted = base
    .filter(i => i && Number.isFinite(i.startAt) && Number.isFinite(i.endAt) && i.endAt >= i.startAt)
    .slice()
    .sort((a, b) => a.startAt - b.startAt);
  if (sorted.length === 0) return [];

  const breaks = Array.isArray(task.breakSessions) ? task.breakSessions : [];
  const merged = [{ startAt: sorted[0].startAt, endAt: sorted[0].endAt }];

  for (let i = 1; i < sorted.length; i++) {
    const curr = sorted[i];
    const last = merged[merged.length - 1];
    const gap = curr.startAt - last.endAt;

    if (gap > POM_CONTINUITY_GAP) {
      // 间隔超过阈值，不合并
      merged.push({ startAt: curr.startAt, endAt: curr.endAt });
      continue;
    }

    // 检查间隔期间是否有完整休息记录
    const hasBreakBetween = breaks.some(b =>
      b.startAt >= last.endAt && b.endAt <= curr.startAt
    );

    if (hasBreakBetween) {
      // 间隔期间是正常休息，合并
      if (curr.endAt > last.endAt) last.endAt = curr.endAt;
    } else {
      // 间隔期间无休息记录（其他任务/跳过休息/退出网页/空闲），不合并
      merged.push({ startAt: curr.startAt, endAt: curr.endAt });
    }
  }

  // completedAt 延伸逻辑保持不变
  if (merged.length > 0 && task.completedAt && task.completedAt >= merged[merged.length - 1].endAt) {
    if ((task.completedAt - merged[merged.length - 1].endAt) <= POM_CONTINUITY_GAP) {
      merged[merged.length - 1].endAt = task.completedAt;
    }
  }
  return merged;
}
function pomFormatIntervalList(intervals) {
  if (!Array.isArray(intervals) || intervals.length === 0) return '-';
  return intervals.map(i => pomFormatTimeRange(i.startAt, i.endAt)).join('; ');
}
function pomSumIntervalDuration(intervals) {
  if (!Array.isArray(intervals) || intervals.length === 0) return 0;
  let total = 0;
  intervals.forEach(i => {
    if (!i || !Number.isFinite(i.startAt) || !Number.isFinite(i.endAt) || i.endAt < i.startAt) return;
    total += (i.endAt - i.startAt);
  });
  return total;
}
function pomFormatDuration(ms) {
  if (!Number.isFinite(ms) || ms <= 0) return '-';
  const totalMinutes = Math.round(ms / 60000);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  if (h > 0) return `${h}小时${m}分`;
  return `${m}分`;
}
function pomGetHistoryViewData() {
  const snapshot = { ...pomHistory };
  const today = pomGetDateStr();
  if (pomTodos && pomTodos.length > 0) {
    snapshot[today] = pomTodos.map(t => ({ ...t }));
  }
  return snapshot;
}
function pomBuildHistoryExport(date, tasks) {
  let totalTasks = tasks.length;
  let completedCount = 0;
  let totalDone = 0;
  let totalInt = 0;
  let totalExt = 0;
  let totalEst = 0;
  let totalExt1 = 0;
  let totalExt2 = 0;
  let totalSkipped = 0;
  let totalResets = 0;
  let totalReverts = 0;
  const dayIntervalsRaw = [];
  let completedDone = 0;
  let completedEst = 0;

  tasks.forEach(t => {
    const est = t.est || 1;
    const ext1 = t.ext1 || 0;
    const ext2 = t.ext2 || 0;
    const done = t.done || 0;
    totalEst += est;
    totalExt1 += ext1;
    totalExt2 += ext2;
    totalDone += done;
    totalInt += t.intInterrupts || 0;
    totalExt += t.extInterrupts || 0;
    totalSkipped += (t.skippedBreaks || t.skippedPoms || 0);
    totalResets += (t.resetCount || 0);
    totalReverts += (t.revertCount || 0);
    const taskIntervals = pomGetTaskIntervals(t);
    taskIntervals.forEach(i => dayIntervalsRaw.push(i));
    if (t.completed) {
      completedCount++;
      completedDone += done;
      completedEst += est + ext1 + ext2;
    }
  });

  let dStr = date;
  try {
    const dObj = new Date(date);
    const days = ['日', '一', '二', '三', '四', '五', '六'];
    dStr = `${date} (周${days[dObj.getDay()]})`;
  } catch(e) {}

  const completionRate = totalTasks > 0 ? Math.round((completedCount / totalTasks) * 100) : 0;
  const totalPlanned = totalEst + totalExt1 + totalExt2;
  const diff = completedCount > 0 ? completedDone - completedEst : null;
  const diffText = diff === null ? '-' : `${diff > 0 ? '+' : ''}${diff}`;
  const dayIntervals = pomMergeIntervals(dayIntervalsRaw);
  const dayRangeText = pomFormatIntervalList(dayIntervals);
  const daySpanText = pomFormatDuration(pomSumIntervalDuration(dayIntervals));

  const lines = [];
  lines.push('Huge-Clock 导出 v2');
  lines.push(`日期: ${dStr}`);
  lines.push(`任务数: ${totalTasks}`);
  lines.push(`完成: ${completedCount}/${totalTasks} (${completionRate}%)`);
  lines.push(`日总番茄: ${totalDone}`);
  lines.push(`预估合计: ${totalEst} | 二次: ${totalExt1} | 三次: ${totalExt2} | 总计: ${totalPlanned}`);
  lines.push(`内/外中断: ${totalInt}/${totalExt}`);
  lines.push(`跳过休息: ${totalSkipped}`);
  lines.push(`重置番茄钟: ${totalResets}`);
  lines.push(`撤销番茄钟: ${totalReverts}`);
  lines.push(`工作区间: ${dayRangeText} | 跨度: ${daySpanText}`);
  lines.push(`结项误差(已完成): ${diffText}`);
  lines.push('');
  lines.push('任务明细:');

  tasks.forEach((t, idx) => {
    const est = t.est || 1;
    const ext1 = t.ext1 || 0;
    const ext2 = t.ext2 || 0;
    const done = t.done || 0;
    const planned = est + ext1 + ext2;
    const taskDiff = done - planned;
    const taskDiffText = `${taskDiff > 0 ? '+' : ''}${taskDiff}`;
    const taskIntervals = pomGetTaskIntervals(t);
    const taskRange = pomFormatIntervalList(taskIntervals);
    const taskSpan = pomFormatDuration(pomSumIntervalDuration(taskIntervals));
    lines.push(`${idx + 1}. ${t.text}`);
    lines.push(`   状态: ${t.completed ? '已完成' : '未完成'}`);
    lines.push(`   预估: ${est} | 二次: ${ext1} | 三次: ${ext2} | 总计: ${planned}`);
    lines.push(`   实际: ${done}`);
    lines.push(`   误差: ${taskDiffText}`);
    lines.push(`   内/外中断: ${(t.intInterrupts || 0)}/${(t.extInterrupts || 0)}`);
    lines.push(`   跳过休息: ${(t.skippedBreaks || t.skippedPoms || 0)}`);
    lines.push(`   重置番茄钟: ${(t.resetCount || 0)}`);
    lines.push(`   撤销番茄钟: ${(t.revertCount || 0)}`);
    lines.push(`   时间区间: ${taskRange} | 跨度: ${taskSpan}`);
    lines.push(`   完成时刻: ${t.completedAt ? pomFormatTime(t.completedAt) : '-'}`);
  });
  return lines.join('\n');
}
function pomRenderHistory() {
  todoHistListEl.innerHTML = '';
  const historyView = pomGetHistoryViewData();
  const dates = Object.keys(historyView).sort((a,b) => b.localeCompare(a)); // 倒序
  if (dates.length === 0) {
    todoHistListEl.innerHTML = `<div class="hist-empty">暂无历史记录</div>`;
    return;
  }
  dates.forEach((date, index) => {
    const tasks = historyView[date];
    if (!tasks || tasks.length === 0) return;

    let totalTasks = tasks.length;
    let completedCount = 0;
    
    let totalDone = 0; // 日总番茄（无论是否完成任务，付出的时间都需要留存记录）
    let totalInt = 0;
    let totalExt = 0;
    
    let totalExt1Poms = 0; // 二次预估番茄数
    let totalExt2Poms = 0; // 三次预估番茄数

    let completedDonePoms = 0;
    let completedEstPoms = 0;

    tasks.forEach(t => {
      totalDone += t.done || 0;
      totalInt += t.intInterrupts || 0;
      totalExt += t.extInterrupts || 0;
      
      totalExt1Poms += t.ext1 || 0;
      totalExt2Poms += t.ext2 || 0;

      if (t.completed) {
        completedCount++;
        completedDonePoms += t.done || 0;
        completedEstPoms += (t.est || 1) + (t.ext1 || 0) + (t.ext2 || 0);
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
          <div class="hist-summary-actions">
            <button class="hist-export-btn" type="button" aria-label="导出 ${dStr}"><span>⤴︎</span><span>导出</span></button>
            <div class="hist-toggle-icon">
              <svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>
            </div>
          </div>
        </div>
        <div class="hist-stats">
          <div class="hist-stat-item" title="本日内专注执行过的所有番茄数总量">
            <span class="hist-stat-val">${totalDone}</span>
            <span class="hist-stat-label">日总番茄</span>
          </div>
          <div class="hist-stat-item" title="今日的所有二次与三次预估番茄总数">
            <span class="hist-stat-val" style="color:#0078D7;">${totalExt1Poms}/${totalExt2Poms}</span>
            <span class="hist-stat-label">二/三次预估</span>
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
        let poms = pomGeneratePomsHtml(item);

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
      let itemTotalEst = (item.est || 1) + (item.ext1 || 0) + (item.ext2 || 0);
      let estStr = `${item.est || 1}${item.ext1 ? '(+'+item.ext1+')' : ''}${item.ext2 ? '(+'+item.ext2+')' : ''}`;
      if (item.completed) {
        let taskDiff = item.done - itemTotalEst;
        taskDiffClass = taskDiff > 0 ? 'over' : (taskDiff < 0 ? 'under' : 'exact');  
        taskDiffText = `预 ${estStr} / 实 ${item.done}`;
      } else {
        taskDiffClass = 'uncompleted';
        taskDiffText = `预 ${estStr} / 实 ${item.done}`;
      }

      html += `
        <div class="hist-task-item ${item.completed ? 'completed' : 'uncompleted'}">
          <div class="hist-task-main">
            <div class="hist-task-name" title="${pomEscapeHtml(item.text)}">${pomEscapeHtml(item.text)}</div>
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

    const exportBtn = groupEl.querySelector('.hist-export-btn');
    if (exportBtn) {
      exportBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const exportText = pomBuildHistoryExport(date, tasks);
        pomCopyToClipboard(exportText)
          .then(() => pomNotify('✅ 已复制到剪贴板', false))
          .catch(() => pomNotify('⚠️ 复制失败，请检查浏览器权限', false));
      });
    }

    todoHistListEl.appendChild(groupEl);
  });
}
function pomToggleTodoPanel(forceStage) {
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
    // 不再自动聚焦输入框：手机端打开面板会直接弹出输入法遮挡屏幕
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
  if (todoImportBtn) todoImportBtn.style.display = mode === 'today' ? 'inline-flex' : 'none';
  if (mode === 'history') {
    todoAddArea.style.display = 'none';
    todoHistListEl.style.display = 'flex';
    pomRenderHistory();
    todoHistListEl.classList.add('list-fade-in');
  } else if (mode === 'inventory') {
    todoInvListEl.style.display = 'flex';
    todoEstRow.style.display = 'none'; // 隐藏预计番茄数
    if (todoAddBtnSimple) todoAddBtnSimple.style.display = 'inline-flex'; // 显示单输入框旁的添加按钮
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
if (todoImportBtn) {
  todoImportBtn.addEventListener('click', e => {
    e.stopPropagation();
    pomToggleImportDialog(true);
  });
}
if (pomImportDialog) {
  pomImportDialog.addEventListener('click', (e) => {
    if (e.target === pomImportDialog) pomToggleImportDialog(false);
  });
}
if (pomImportCancelBtn) {
  pomImportCancelBtn.addEventListener('click', () => pomToggleImportDialog(false));
}
if (pomImportCloseBtn) {
  pomImportCloseBtn.addEventListener('click', () => pomToggleImportDialog(false));
}
if (pomImportConfirmBtn) {
  pomImportConfirmBtn.addEventListener('click', () => {
    const raw = pomImportInput ? pomImportInput.value : '';
    pomApplyImport(raw);
  });
}
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
pomRestoreSession();
pomRenderTodos();
if (todoImportBtn) todoImportBtn.style.display = 'inline-flex';

// 回前台立即重算剩余时间（后台 setInterval 可能被浏览器节流，导致计时走慢）
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && pomRunning) pomTick();
});

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



