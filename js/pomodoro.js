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
// ── 今日待办 状态 ────────────────────────────
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
// R：重置当前阶段（不跳转阶段）
function pomKeyR() {
  if (!pomVisible) return;
  pomPauseTimer();
  pomTimeLeft = POM_PHASES[pomPhaseIdx].duration;
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
// 全局导出
window._pomKeyP   = pomKeyP;
window._pomKeyR   = pomKeyR;
window._pomKeyEsc = pomKeyEsc;window._pomKeyL   = pomKeyL;
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
// ── 今日待办逻辑 ──────────────────────────────
// 获取当前本地日期字符串 (YYYY-MM-DD)
function pomGetDateStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
// 本地存储读写
function pomSaveTodos() {
  const data = {
    today: pomGetDateStr(),
    todos: pomTodos,
    inventory: pomInventory,
    history: pomHistory
  };
  localStorage.setItem('pomodoro_data', JSON.stringify(data));
}
function pomLoadTodos() {
  try {
    const raw = localStorage.getItem('pomodoro_data');
    if (!raw) return;
    const data = JSON.parse(raw);
    pomHistory = data.history || {};
    pomInventory = data.inventory || [];
    // 如果日期变了，将上一天的任务归档，清空今日任务
    const currentDay = pomGetDateStr();
    if (data.today && data.today !== currentDay) {
      if (data.todos && data.todos.length > 0) {
        pomHistory[data.today] = data.todos;
      }
      pomTodos = [];
      pomCurrentTodoId = null;
    } else {
      pomTodos = data.todos || [];
    }
  } catch(e) {
    console.warn("读取番茄钟数据失败", e);
  }
}
function pomRenderTodos() {
  todoListEl.innerHTML = '';
  if (pomTodos.length === 0) {
    todoListEl.innerHTML = `<div style="text-align:center; padding: 20px 0; color: rgba(255,255,255,0.4); font-size: 13px;">暂无待办，赶快添加一个吧！</div>`;
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
    el.innerHTML = `
      <input type="checkbox" class="todo-chk" ${item.completed ? 'checked' : ''}>
      <div class="todo-info">
        <div class="todo-name" title="${item.text}">${item.text}</div>
        <div class="todo-poms">${poms}</div>
      </div>
      <button class="todo-play" title="应用此待办到番茄钟">▶</button>
      <button class="todo-del" title="删除此待办">✕</button>
    `;
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
      if (item.completed) {
        el.classList.add('completed');
      } else {
        el.classList.remove('completed');
      }
      pomRenderInventory();
    });
    // 绑定删除按钮
    const delBtn = el.querySelector('.todo-del');
    delBtn.addEventListener('click', () => {
      pomTodos = pomTodos.filter(x => x.id !== item.id);
      if (pomCurrentTodoId === item.id) {
        pomCurrentTodoId = null;
      }
      pomSaveTodos();
      pomRenderTodos();
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
  });
}
function pomRenderInventory() {
  todoInvListEl.innerHTML = '';
  if (pomInventory.length === 0) {
    todoInvListEl.innerHTML = `<div style="text-align:center; padding: 20px 0; color: rgba(255,255,255,0.4); font-size: 13px;">暂无活动清单，随时记录想做的事！</div>`;
    return;
  }
  pomInventory.forEach(item => {
    const el = document.createElement('div');
    el.className = `todo-item ${item.completed ? 'completed' : ''}`;
    // 生成番茄图标
    let poms = '';
    for (let i = 0; i < item.est; i++) {
      poms += '<span class="todo-poms-empty">⚪</span>';
    }
    el.innerHTML = `
      <div class="todo-info" style="padding-left: 8px;">
        <div class="todo-name" title="${item.text}">${item.text}</div>
        <div class="todo-poms" style="opacity: 0.6;">${poms}</div>
      </div>
      <button class="todo-play" title="添加到今日待办并开始" style="font-size: 14px; margin-right: 8px;">＋</button>
      <button class="todo-del" title="删除此活动">✕</button>
    `;
    // 移入今日待办
    const addBtn = el.querySelector('.todo-play');
    addBtn.addEventListener('click', () => {
      // 严格番茄工作法：将活动直接复制（提取）到今日待办中，但原活动清单依然保留，
      // 以便在历史中或未来的活动管理中能够追溯，只有当今日代办被彻底勾选完成时才会触发后续可能的清理
      // 创建一个深拷贝并赋予新ID（以防重复添加产生冲突）
      const todoItem = { ...item, id: Date.now() };
      const estInput = prompt(`为任务【${item.text}】设定今日计划番茄数：`, item.est);
      if (estInput !== null) {
        const parsedEst = parseInt(estInput, 10);
        if (!isNaN(parsedEst) && parsedEst > 0) {
          todoItem.est = parsedEst;
        }
      } else { return; } // 取消则不添加
      // 为了让今日待办完成时能反向划除，我们需要互相记录引用ID
      todoItem.inventoryOriginalId = item.id;
      item.todayInstances = item.todayInstances || [];
      item.todayInstances.push(todoItem.id);
      pomTodos.push(todoItem);
      pomSaveTodos();
      pomRenderInventory(); // 重新渲染（可展现某种状态改变，如暂时不处理也可）
      pomRenderTodos();
      // 移除强制的视图跳转（不再使用 pomSetViewMode 和一系列的样式变更跳转到今日待办）
      pomNotify(`已将 "${item.text}" 提取至今日待办`, false);
    });
    // 删除
    const delBtn = el.querySelector('.todo-del');
    delBtn.addEventListener('click', () => {
      pomInventory = pomInventory.filter(x => x.id !== item.id);
      pomSaveTodos();
      pomRenderInventory();
    });
    todoInvListEl.appendChild(el);
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
    completed: false
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
  dates.forEach(date => {
    const header = document.createElement('div');
    header.className = 'hist-date';
    header.textContent = date;
    todoHistListEl.appendChild(header);
    pomHistory[date].forEach(item => {
      const el = document.createElement('div');
      el.className = `todo-item ${item.completed ? 'completed' : ''}`;
      let poms = '';
      for (let i = 0; i < item.est; i++) {
        if (i < item.done) poms += '🍅';
        else poms += '<span class="todo-poms-empty">⚪</span>';
      }
      for (let i = item.est; i < item.done; i++) {
          poms += '🍅';
      }
      el.innerHTML = `
        <div class="todo-info" style="padding-left: 8px;">
          <div class="todo-name" title="${item.text}">${item.text}</div>
          <div class="todo-poms">${poms}</div>
        </div>
      `;
      todoHistListEl.appendChild(el);
    });
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
pomLoadTodos();
pomRenderTodos();





