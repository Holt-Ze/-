const STORE_KEY = "kaoyan-daily-tracker-v3";
const SUBJECT_CONFIG_KEY = "kaoyan-subject-config-v1";
const ACTIVE_TIMER_KEY = "kaoyan-active-timer-v1";

const OLD_STORE_KEYS = ["kaoyan-daily-tracker-v2", "kaoyan-daily-tracker-v1"];
const OLD_CONFIG_KEYS = ["kaoyan-task-config-v1"];

const EMOJI_LIST = ["📐","📊","📚","📝","🔬","💻","📖","🗂️","📋","🎯","💡","🔥","⭐","📌","📏","🔢","🧮","🗣️","🌐","🧪","📡","🏃","🎵","🧘","📈","💪","🧠","🏆"];

const $ = id => document.getElementById(id);
const pad = n => String(n).padStart(2, "0");
const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};
const weekNames = ["周日","周一","周二","周三","周四","周五","周六"];

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeAttr(value) {
  return escapeHtml(value);
}

function formatSeconds(totalSec, compact = false) {
  const sec = Math.max(0, Math.floor(Number(totalSec) || 0));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (compact) {
    if (h > 0) return `${h}h ${pad(m)}m`;
    if (m > 0) return `${m}m`;
    return `${s}s`;
  }
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

function makeId(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function getFieldValue(id) {
  const el = $(id);
  if (!el) return undefined;
  return el.type === "checkbox" ? el.checked : el.value;
}

function setFieldValue(id, value) {
  const el = $(id);
  if (!el) return;
  if (el.type === "checkbox") {
    el.checked = Boolean(value);
    syncCheckboxUI(id);
  } else if (value !== undefined && value !== null) {
    el.value = value;
  }
}

// ── Navigation ──
function switchTab(tabName) {
  document.querySelectorAll(".tab-page").forEach(p => p.classList.remove("active"));
  document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
  const page = $(`tab-${tabName}`);
  if (page) page.classList.add("active");
  const btn = document.querySelector(`.tab-btn[data-tab="${tabName}"]`);
  if (btn) btn.classList.add("active");
  if (tabName === "timer") renderTimerTab();
  if (tabName === "stats") renderStatsTab();
  if (tabName === "settings") renderSettingsTab();
}

window.switchTab = switchTab;

// ── Subject config ──
function normalizeSubject(subject) {
  return {
    id: subject.id || makeId("subject"),
    name: String(subject.name || "未命名专项").trim() || "未命名专项",
    icon: subject.icon || "📝",
    enabled: subject.enabled !== false,
    subtasks: Array.isArray(subject.subtasks)
      ? subject.subtasks.map(st => ({
          id: st.id || makeId("subtask"),
          title: String(st.title || "").trim()
        })).filter(st => st.title)
      : []
  };
}

function readSubjectConfig() {
  try {
    const saved = JSON.parse(localStorage.getItem(SUBJECT_CONFIG_KEY));
    if (Array.isArray(saved)) return saved.map(normalizeSubject);
  } catch {}
  writeSubjectConfig([]);
  return [];
}

function writeSubjectConfig(config) {
  localStorage.setItem(SUBJECT_CONFIG_KEY, JSON.stringify(config.map(normalizeSubject)));
}

function getEnabledSubjects() {
  return readSubjectConfig().filter(subject => subject.enabled);
}

// Keep old names as thin aliases while the UI still uses taskGrid wording.
const readTaskConfig = readSubjectConfig;
const getEnabledTasks = getEnabledSubjects;

// ── Data store ──
function migrateData() {
  if (!localStorage.getItem(SUBJECT_CONFIG_KEY)) writeSubjectConfig([]);
  OLD_STORE_KEYS.forEach(key => localStorage.removeItem(key));
  OLD_CONFIG_KEYS.forEach(key => localStorage.removeItem(key));

  const active = readActiveTimer();
  if (active && !readSubjectConfig().some(subject => subject.id === active.taskId)) {
    writeActiveTimer(null);
  }
}

function readStore() {
  try { return JSON.parse(localStorage.getItem(STORE_KEY)) || {}; }
  catch { return {}; }
}

function writeStore(data) {
  localStorage.setItem(STORE_KEY, JSON.stringify(data));
}

function subtaskFieldId(subjectId, subtaskId) {
  return `subject-${subjectId}-subtask-${subtaskId}`;
}

function getTimerSessions(record) {
  return Array.isArray(record?.timerSessions) ? record.timerSessions : [];
}

function totalTimerSeconds(record) {
  return getTimerSessions(record).reduce((sum, session) => sum + (Number(session.durationSec) || 0), 0);
}

function timerTotalsByTask(records) {
  const totals = {};
  records.forEach(record => {
    getTimerSessions(record).forEach(session => {
      const key = session.taskId || session.taskName || "unknown";
      if (!totals[key]) {
        totals[key] = {
          taskId: session.taskId || key,
          taskName: session.taskName || "未命名专项",
          icon: session.icon || "⏱️",
          durationSec: 0
        };
      }
      totals[key].durationSec += Number(session.durationSec) || 0;
    });
  });
  return Object.values(totals).sort((a, b) => b.durationSec - a.durationSec);
}

// ── Scoring ──
function scoreCurrent() {
  const subjects = getEnabledSubjects();
  let total = 0;
  let done = 0;

  subjects.forEach(subject => {
    (subject.subtasks || []).forEach(subtask => {
      total += 1;
      if (getFieldValue(subtaskFieldId(subject.id, subtask.id))) done += 1;
    });
  });

  return total > 0 ? Math.round((done / total) * 100) : 0;
}

function currentRecord(dateOverride) {
  const date = dateOverride || $("date").value;
  const existing = readStore()[date] || {};
  const record = {
    date,
    percent: scoreCurrent(),
    updatedAt: new Date().toISOString(),
    timerSessions: getTimerSessions(existing),
    review: getFieldValue("review") || ""
  };

  getEnabledSubjects().forEach(subject => {
    (subject.subtasks || []).forEach(subtask => {
      record[subtaskFieldId(subject.id, subtask.id)] = getFieldValue(subtaskFieldId(subject.id, subtask.id));
    });
  });

  return record;
}

// ── Checkbox UI ──
function syncCheckboxUI(id) {
  const el = document.getElementById(id);
  if (!el || el.type !== "checkbox") return;
  const row = el.closest(".checkbox-row");
  if (!row) return;
  row.classList.toggle("checked", el.checked);
}

function syncAllCheckboxUI() {
  document.querySelectorAll('.checkbox-row input[type="checkbox"]').forEach(el => {
    const row = el.closest(".checkbox-row");
    if (row) row.classList.toggle("checked", el.checked);
  });
}

function captureSubjectValues() {
  const vals = {};
  readSubjectConfig().forEach(subject => {
    (subject.subtasks || []).forEach(subtask => {
      vals[subtaskFieldId(subject.id, subtask.id)] = getFieldValue(subtaskFieldId(subject.id, subtask.id));
    });
  });
  vals.review = getFieldValue("review");
  return vals;
}

function restoreSubjectValues(vals) {
  Object.entries(vals).forEach(([id, val]) => {
    if (val !== undefined) setFieldValue(id, val);
  });
}

function safeRerender() {
  const vals = captureSubjectValues();
  renderSubjectCards();
  restoreSubjectValues(vals);
  syncAllCheckboxUI();
  updateTodayUi();
}

// ── Today subjects ──
function renderSubjectCards() {
  const subjects = getEnabledSubjects();
  const grid = $("taskGrid");
  if (!grid) return;

  if (!subjects.length) {
    grid.innerHTML = '<div class="empty-hint">还没有专项<br><small>去「设置」里添加你的第一个专项</small></div>';
    return;
  }

  grid.innerHTML = subjects.map(subject => {
    const subtasks = subject.subtasks || [];
    const subtasksHtml = subtasks.length ? subtasks.map(subtask => `
      <label class="checkbox-row">
        <input id="${subtaskFieldId(subject.id, subtask.id)}" type="checkbox">
        <span class="fake-check">✓</span>
        <span><strong>${escapeHtml(subtask.title)}</strong></span>
      </label>
    `).join("") : '<div class="empty-hint">这个专项还没有小任务<br><small>去「设置」里添加</small></div>';

    return `
      <article class="task-card">
        <h3 class="task-heading">${escapeHtml(subject.icon)} ${escapeHtml(subject.name)}</h3>
        <div class="subject-subtasks">${subtasksHtml}</div>
      </article>
    `;
  }).join("");
}

const renderTaskCards = renderSubjectCards;

function loadDate(date) {
  const data = readStore();
  const record = data[date];

  readSubjectConfig().forEach(subject => {
    (subject.subtasks || []).forEach(subtask => {
      setFieldValue(subtaskFieldId(subject.id, subtask.id), false);
    });
  });
  setFieldValue("review", "");

  if (record) {
    readSubjectConfig().forEach(subject => {
      (subject.subtasks || []).forEach(subtask => {
        const id = subtaskFieldId(subject.id, subtask.id);
        if (record[id] !== undefined) setFieldValue(id, record[id]);
      });
    });
    if (record.review !== undefined) setFieldValue("review", record.review);
  }

  syncAllCheckboxUI();
  updateTodayUi();
}

function saveCurrentRecord({ date = null } = {}) {
  const data = readStore();
  const record = currentRecord(date);
  data[record.date] = record;
  writeStore(data);
  updateTodayUi();
  return record;
}

function setAutosaveStatus(text, active = false) {
  const status = $("autosaveStatus");
  if (!status) return;
  status.textContent = text;
  status.classList.toggle("active", active);
}

function scheduleAutoSave() {
  clearTimeout(autosaveTimer);
  pendingAutosaveDate = $("date")?.value || todayIso();
  setAutosaveStatus("正在自动保存...", true);
  autosaveTimer = setTimeout(() => {
    autosaveTimer = null;
    saveCurrentRecord({ date: pendingAutosaveDate });
    pendingAutosaveDate = null;
    setAutosaveStatus("已自动保存", true);
    clearTimeout(setAutosaveStatus.timer);
    setAutosaveStatus.timer = setTimeout(() => {
      setAutosaveStatus("自动保存已开启", false);
    }, 1400);
  }, 450);
}

function flushAutoSave() {
  if (!autosaveTimer) return;
  clearTimeout(autosaveTimer);
  autosaveTimer = null;
  saveCurrentRecord({ date: pendingAutosaveDate });
  pendingAutosaveDate = null;
  setAutosaveStatus("已自动保存", true);
}

function resetDay() {
  clearTimeout(autosaveTimer);
  autosaveTimer = null;
  pendingAutosaveDate = null;
  const date = $("date").value;
  const data = readStore();
  delete data[date];
  writeStore(data);
  loadDate(date);
  showToast("当天已重置");
}

function updateDateText() {
  const value = $("date").value;
  const d = new Date(`${value}T00:00:00`);
  if ($("dateText")) $("dateText").textContent = `${value} ${weekNames[d.getDay()]}`;
  if ($("dayPill")) $("dayPill").textContent = weekNames[d.getDay()];
}

function updateTodayUi() {
  updateDateText();
  const pct = scoreCurrent();
  $("todayPercent").textContent = `${pct}%`;
  $("progressFill").style.setProperty("--progress", `${pct}%`);
}

// ── Timer ──
let selectedTimerTaskId = null;
let timerInterval = null;
let autosaveTimer = null;
let pendingAutosaveDate = null;
let selectedStatsDate = null;

function readActiveTimer() {
  try { return JSON.parse(localStorage.getItem(ACTIVE_TIMER_KEY)) || null; }
  catch { return null; }
}

function writeActiveTimer(timer) {
  if (timer) localStorage.setItem(ACTIVE_TIMER_KEY, JSON.stringify(timer));
  else localStorage.removeItem(ACTIVE_TIMER_KEY);
}

function activeTimerElapsed(timer = readActiveTimer()) {
  if (!timer) return 0;
  const base = Number(timer.accumulatedSec) || 0;
  if (!timer.running) return base;
  const last = Number(timer.lastStartedAt) || new Date(timer.startedAt).getTime() || Date.now();
  return base + Math.max(0, Math.floor((Date.now() - last) / 1000));
}

function currentTimerTask() {
  const active = readActiveTimer();
  if (active) return active;
  const subjects = getEnabledSubjects();
  return subjects.find(subject => subject.id === selectedTimerTaskId) || subjects[0] || null;
}

function renderTimerTab() {
  const container = $("timerContent");
  if (!container) return;

  const active = readActiveTimer();
  const subjects = getEnabledSubjects();
  const current = currentTimerTask();
  if (!selectedTimerTaskId && current) selectedTimerTaskId = current.taskId || current.id;

  const selectedId = active?.taskId || selectedTimerTaskId || current?.id;
  const subjectButtons = subjects.length ? subjects.map(subject => `
    <button class="timer-subject ${selectedId === subject.id ? "active" : ""}" data-timer-task="${escapeAttr(subject.id)}" type="button">
      <span>${escapeHtml(subject.icon)}</span>
      <strong>${escapeHtml(subject.name)}</strong>
    </button>
  `).join("") : '<div class="empty-hint">还没有启用专项<br><small>去「设置」页面添加专项</small></div>';

  const data = readStore();
  const date = $("date")?.value || todayIso();
  const todayRecord = data[date] || {};
  const todayTotal = totalTimerSeconds(todayRecord);
  const todayBySubject = timerTotalsByTask([todayRecord]);
  const todayList = todayBySubject.length ? todayBySubject.map(item => `
    <div class="timer-summary-row">
      <span>${escapeHtml(item.icon)} ${escapeHtml(item.taskName)}</span>
      <strong>${formatSeconds(item.durationSec, true)}</strong>
    </div>
  `).join("") : '<div class="empty-hint">今天还没有计时</div>';

  const allRecords = Object.values(data);
  const allTotal = allRecords.reduce((sum, record) => sum + totalTimerSeconds(record), 0);
  const title = current ? `${current.icon || "⏱️"} ${current.taskName || current.name}` : "选择专项";

  container.innerHTML = `
    <section class="panel timer-panel">
      <div class="timer-current">
        <div class="timer-task-name" id="timerTaskName">${escapeHtml(title)}</div>
        <div class="timer-clock" id="timerClock">00:00:00</div>
        <div class="timer-state" id="timerState">准备开始</div>
      </div>
      <div class="timer-subjects">${subjectButtons}</div>
      <div class="actions timer-actions">
        <button class="btn primary" id="timerStartBtn" type="button">开始</button>
        <button class="btn" id="timerPauseBtn" type="button">暂停</button>
        <button class="btn danger" id="timerStopBtn" type="button">停止并保存</button>
      </div>
    </section>

    <div class="stats-grid timer-stats">
      <div class="stat-card">
        <div class="stat-icon">⏱️</div>
        <div class="stat-label">今日计时</div>
        <div class="stat-value">${formatSeconds(todayTotal, true)}</div>
      </div>
      <div class="stat-card">
        <div class="stat-icon">Σ</div>
        <div class="stat-label">累计计时</div>
        <div class="stat-value">${formatSeconds(allTotal, true)}</div>
      </div>
    </div>

    <section class="panel">
      <h2 class="section-title">📌 今日专项计时</h2>
      <div class="timer-summary">${todayList}</div>
    </section>
  `;

  document.querySelectorAll("[data-timer-task]").forEach(btn => {
    btn.addEventListener("click", () => selectTimerTask(btn.dataset.timerTask));
  });
  $("timerStartBtn")?.addEventListener("click", startTimer);
  $("timerPauseBtn")?.addEventListener("click", pauseTimer);
  $("timerStopBtn")?.addEventListener("click", stopTimer);
  renderTimerClock();
}

function renderTimerClock() {
  const active = readActiveTimer();
  const current = currentTimerTask();
  const clock = $("timerClock");
  const state = $("timerState");
  const name = $("timerTaskName");
  const startBtn = $("timerStartBtn");
  const pauseBtn = $("timerPauseBtn");
  const stopBtn = $("timerStopBtn");

  if (clock) clock.textContent = formatSeconds(activeTimerElapsed(active));
  if (name && current) name.textContent = `${current.icon || "⏱️"} ${current.taskName || current.name}`;
  if (state) state.textContent = active ? (active.running ? "专注中" : "已暂停") : "准备开始";
  if (startBtn) startBtn.textContent = active && !active.running ? "继续" : "开始";
  if (pauseBtn) pauseBtn.disabled = !active || !active.running;
  if (stopBtn) stopBtn.disabled = !active;
}

function selectTimerTask(taskId) {
  if (readActiveTimer()) {
    showToast("当前计时结束后再切换专项");
    return;
  }
  selectedTimerTaskId = taskId;
  renderTimerTab();
}

function startTimer() {
  let active = readActiveTimer();
  if (active) {
    if (!active.running) {
      active.running = true;
      active.lastStartedAt = Date.now();
      writeActiveTimer(active);
      showToast("继续计时");
    }
    renderTimerTab();
    return;
  }

  const subject = currentTimerTask();
  if (!subject) {
    showToast("请先添加一个专项");
    return;
  }
  const now = new Date();
  active = {
    taskId: subject.id,
    taskName: subject.name,
    icon: subject.icon,
    date: $("date")?.value || todayIso(),
    startedAt: now.toISOString(),
    accumulatedSec: 0,
    running: true,
    lastStartedAt: now.getTime()
  };
  selectedTimerTaskId = subject.id;
  writeActiveTimer(active);
  renderTimerTab();
  showToast("开始计时");
}

function pauseTimer() {
  const active = readActiveTimer();
  if (!active || !active.running) return;
  active.accumulatedSec = activeTimerElapsed(active);
  active.running = false;
  active.lastStartedAt = null;
  writeActiveTimer(active);
  renderTimerTab();
  showToast("已暂停");
}

function stopTimer() {
  const active = readActiveTimer();
  if (!active) return;
  const endedAt = new Date();
  const durationSec = Math.max(1, activeTimerElapsed(active));
  const data = readStore();
  const date = active.date || todayIso();
  const isVisibleDate = $("date")?.value === date;
  const baseRecord = isVisibleDate ? currentRecord() : (data[date] || { date, percent: 0, updatedAt: endedAt.toISOString() });
  const sessions = getTimerSessions(baseRecord);
  baseRecord.timerSessions = sessions.concat({
    taskId: active.taskId,
    taskName: active.taskName,
    icon: active.icon,
    startedAt: active.startedAt,
    endedAt: endedAt.toISOString(),
    durationSec
  });
  baseRecord.updatedAt = endedAt.toISOString();
  if (isVisibleDate) baseRecord.percent = scoreCurrent();

  data[date] = baseRecord;
  writeStore(data);
  writeActiveTimer(null);
  if (isVisibleDate) loadDate(date);
  renderTimerTab();
  updateTodayUi();
  showToast(`已保存 ${formatSeconds(durationSec, true)}`);
}

function startTimerTicker() {
  clearInterval(timerInterval);
  timerInterval = setInterval(renderTimerClock, 1000);
}

// ── Stats ──
function formatDateWithWeek(date) {
  const d = new Date(`${date}T00:00:00`);
  return `${date} ${weekNames[d.getDay()]}`;
}

function renderTimerSummaryRows(items, totalSec = 0) {
  return items.length ? items.map(item => {
    const pct = totalSec > 0 ? Math.round((item.durationSec / totalSec) * 100) : 0;
    return `
      <div class="timer-summary-row stacked">
        <div class="timer-summary-main">
          <span>${escapeHtml(item.icon)} ${escapeHtml(item.taskName)}</span>
          <strong>${formatSeconds(item.durationSec, true)}</strong>
        </div>
        <div class="timer-summary-track"><span style="--timer-pct:${pct}%"></span></div>
      </div>
    `;
  }).join("") : '<div class="empty-hint">还没有计时数据</div>';
}

function buildTimeCompareChart(records) {
  if (!records.length) return '<div class="empty-hint">还没有计时数据</div>';
  const width = 320;
  const height = 140;
  const padX = 18;
  const padTop = 14;
  const padBottom = 28;
  const plotH = height - padTop - padBottom;
  const maxSec = Math.max(...records.map(record => totalTimerSeconds(record)), 1);
  const step = (width - padX * 2) / records.length;
  const points = records.map((record, index) => {
    const seconds = totalTimerSeconds(record);
    const barH = Math.max(seconds > 0 ? 4 : 0, (seconds / maxSec) * plotH);
    const x = padX + index * step + step / 2;
    return { x, barH, seconds, label: record.date.slice(5) };
  });
  const barWidth = Math.max(14, Math.min(26, step * .58));
  const bars = points.map(point => `
    <rect class="trend-bar" x="${point.x - barWidth / 2}" y="${padTop + plotH - point.barH}" width="${barWidth}" height="${point.barH}" rx="6" fill="url(#timeBarGradient)"></rect>
  `).join("");
  const dots = points.map(point => `
    <text class="trend-value" x="${point.x}" y="${Math.max(12, padTop + plotH - point.barH - 6)}">${escapeHtml(formatSeconds(point.seconds, true))}</text>
    <text class="trend-label" x="${point.x}" y="${height - 8}">${escapeHtml(point.label)}</text>
  `).join("");

  return `
    <svg class="trend-chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="最近7天计时时长对比">
      <defs>
        <linearGradient id="timeBarGradient" x1="0" y1="1" x2="0" y2="0">
          <stop offset="0%" stop-color="#14b8a6"></stop>
          <stop offset="100%" stop-color="#4f46e5"></stop>
        </linearGradient>
      </defs>
      <line class="trend-grid-line" x1="${padX}" y1="${padTop + plotH}" x2="${width - padX}" y2="${padTop + plotH}"></line>
      ${bars}
      ${dots}
    </svg>
  `;
}

function buildTimerDonut(items, totalSec) {
  if (!items.length || totalSec <= 0) return '<div class="empty-hint">还没有专项计时数据</div>';
  const colors = ["#4f46e5", "#14b8a6", "#f59e0b", "#ef4444", "#8b5cf6", "#06b6d4", "#84cc16"];
  const cx = 120, cy = 120, r = 105;
  const textR = r * 0.58;
  let startAngle = -Math.PI / 2;

  const slices = [];
  const legendItems = [];
  items.forEach((item, index) => {
    const fraction = Math.max(0, (Number(item.durationSec) || 0) / totalSec);
    const sliceAngle = fraction * 2 * Math.PI;
    const endAngle = startAngle + sliceAngle;
    const midAngle = startAngle + sliceAngle / 2;
    const largeArc = sliceAngle > Math.PI ? 1 : 0;

    const x1 = cx + r * Math.cos(startAngle);
    const y1 = cy + r * Math.sin(startAngle);
    const x2 = cx + r * Math.cos(endAngle);
    const y2 = cy + r * Math.sin(endAngle);

    const timeStr = formatSeconds(item.durationSec, true);
    const tx = cx + textR * Math.cos(midAngle);
    const ty = cy + textR * Math.sin(midAngle);

    slices.push(
      `<path class="pie-slice" d="M${cx},${cy} L${x1.toFixed(2)},${y1.toFixed(2)} A${r},${r} 0 ${largeArc} 1 ${x2.toFixed(2)},${y2.toFixed(2)} Z" fill="${colors[index % colors.length]}"></path>` +
      (sliceAngle > 0.2 ? `<text class="pie-inner-label" x="${tx.toFixed(1)}" y="${ty.toFixed(1)}" text-anchor="middle" dominant-baseline="central" fill="#fff">${escapeHtml(timeStr)}</text>` : '')
    );

    const pct = Math.round(fraction * 100);
    legendItems.push(`
      <div class="donut-legend-item">
        <span class="donut-dot" style="--dot:${colors[index % colors.length]}"></span>
        <span>${escapeHtml(item.icon)} ${escapeHtml(item.taskName)}</span>
        <strong>${pct}%</strong>
      </div>
    `);

    startAngle = endAngle;
  });

  return `
    <div class="donut-layout">
      <div class="donut-wrap">
        <svg class="donut-chart pie-chart" viewBox="0 0 240 240" role="img" aria-label="专项计时比例">
          ${slices.join("")}
        </svg>
      </div>
      <div class="donut-legend">${legendItems.join("")}</div>
    </div>
  `;
}

function renderStatsDayDetail(date, record) {
  if (!record) {
    return `
      <section class="panel stats-day-detail">
        <h3 class="section-title">🔎 ${escapeHtml(formatDateWithWeek(date))}</h3>
        <div class="empty-hint">这一天还没有保存记录</div>
      </section>
    `;
  }

  const dayTotal = totalTimerSeconds(record);
  const dayBySubject = timerTotalsByTask([record]);
  return `
    <section class="panel stats-day-detail">
      <h3 class="section-title">🔎 ${escapeHtml(formatDateWithWeek(date))}</h3>
      <div class="day-detail-grid">
        <div>
          <span>完成度</span>
          <strong>${Number(record.percent || 0)}%</strong>
        </div>
        <div>
          <span>计时总量</span>
          <strong>${formatSeconds(dayTotal, true)}</strong>
        </div>
      </div>
      <div class="day-review">
        <span>复盘</span>
        <p>${escapeHtml(record.review || "无复盘")}</p>
      </div>
      <div class="timer-summary">${renderTimerSummaryRows(dayBySubject, dayTotal)}</div>
    </section>
  `;
}

function renderStatsTab() {
  const data = readStore();
  const all = Object.values(data).sort((a, b) => a.date.localeCompare(b.date));
  const records = all.length;
  const queryDate = selectedStatsDate || $("date")?.value || todayIso();
  const average = records ? Math.round(all.reduce((sum, r) => sum + Number(r.percent || 0), 0) / records) : 0;
  const allTimerSec = all.reduce((sum, r) => sum + totalTimerSeconds(r), 0);
  const timerBySubject = timerTotalsByTask(all);
  const last7 = all.slice(-7);
  const chartHtml = buildTimeCompareChart(last7);
  const donutHtml = buildTimerDonut(timerBySubject, allTimerSec);
  const emptyNotice = records ? "" : '<div class="empty-hint stats-empty">还没有数据<br>先添加专项，今日页会自动保存</div>';

  $("statsContent").innerHTML = `
    <section class="panel stats-query-panel">
      <div class="stats-query">
        <label>
          <span>查询日期</span>
          <input id="statsDateInput" type="date" value="${escapeAttr(queryDate)}">
        </label>
        <button class="btn primary" id="statsQueryBtn" type="button">查询</button>
      </div>
    </section>

    ${emptyNotice}

    <div class="stats-grid stats-overview compact">
      <div class="stat-card">
        <div class="stat-icon">📅</div>
        <div class="stat-label">记录天数</div>
        <div class="stat-value">${records}</div>
      </div>
      <div class="stat-card">
        <div class="stat-icon">📈</div>
        <div class="stat-label">平均完成度</div>
        <div class="stat-value">${average}%</div>
      </div>
    </div>

    <section class="panel stats-donut-panel">
      <h3 class="section-title">⏱️ 专项计时比例</h3>
      ${donutHtml}
    </section>

    <section class="panel stats-chart-panel">
      <h3 class="section-title">📊 最近7天时间对比</h3>
      ${chartHtml}
    </section>
  `;

  $("statsQueryBtn")?.addEventListener("click", () => {
    selectedStatsDate = $("statsDateInput")?.value || queryDate;
    renderStatsTab();
  });
  $("statsDateInput")?.addEventListener("change", e => {
    selectedStatsDate = e.target.value || queryDate;
  });
}

// ── Settings ──
let editingSubjectId = null;

function renderSettingsTab() {
  const config = readSubjectConfig();
  const enabledSubjects = config.filter(subject => subject.enabled);

  const subjectListHtml = config.length ? config.map(subject => `
    <div class="task-list-item">
      <label class="toggle-switch">
        <input type="checkbox" ${subject.enabled ? "checked" : ""} onchange="window.toggleSubject('${escapeAttr(subject.id)}', this.checked)">
        <span class="toggle-track"></span>
      </label>
      <span style="font-size:20px">${escapeHtml(subject.icon)}</span>
      <span class="task-name">${escapeHtml(subject.name)}</span>
      <span class="task-meta">${subject.subtasks.length} 小任务</span>
      <button onclick="window.editSubject('${escapeAttr(subject.id)}')" title="编辑" style="flex-shrink:0">✎</button>
      <button class="del" onclick="window.deleteSubject('${escapeAttr(subject.id)}')" title="删除" style="flex-shrink:0">✕</button>
    </div>
  `).join("") : '<div class="empty-hint">还没有专项<br><small>从这里开始搭自己的任务系统</small></div>';

  $("settingsContent").innerHTML = `
    <div class="settings-section">
      <h3>📋 专项管理 (${enabledSubjects.length}/${config.length} 启用)</h3>
      <div id="settingsTaskList">${subjectListHtml}</div>
      <button class="btn primary block" onclick="window.showAddForm()" style="margin-top:8px">＋ 添加专项</button>
    </div>

    <div class="settings-section" id="taskFormContainer"></div>

    <div class="settings-section">
      <h3>💾 数据</h3>
      <div class="actions">
        <button class="btn" onclick="window.exportAllData()">导出全部数据</button>
        <button class="btn danger" onclick="window.clearAllData()">清除所有数据</button>
      </div>
    </div>
  `;
}

window.showAddForm = function() {
  editingSubjectId = "__new__";
  renderSettingsForm();
  document.getElementById("taskFormContainer").scrollIntoView({ behavior: "smooth" });
};

window.editSubject = function(id) {
  editingSubjectId = id;
  renderSettingsForm();
  document.getElementById("taskFormContainer").scrollIntoView({ behavior: "smooth" });
};

window.editTask = window.editSubject;

window.cancelEdit = function() {
  editingSubjectId = null;
  renderSettingsTab();
};

function renderSettingsForm() {
  const config = readSubjectConfig();
  const container = $("taskFormContainer");
  if (!container) return;
  if (editingSubjectId === null) { container.innerHTML = ""; return; }

  const subject = editingSubjectId === "__new__"
    ? { id: "", name: "", icon: "📝", enabled: true, subtasks: [{ id: makeId("subtask"), title: "" }] }
    : config.find(s => s.id === editingSubjectId);

  if (!subject && editingSubjectId !== "__new__") {
    editingSubjectId = null;
    container.innerHTML = "";
    return;
  }

  const isNew = editingSubjectId === "__new__";
  const emojis = EMOJI_LIST.map(e => `
    <button class="${subject.icon === e ? "selected" : ""}" onclick="window.selectEmoji('${e}')" type="button">${e}</button>
  `).join("");
  const subtasks = subject.subtasks.length ? subject.subtasks : [{ id: makeId("subtask"), title: "" }];
  const subtaskRows = subtasks.map(st => `
    <div class="subtask-edit-row">
      <input class="form-subtask-input" data-subtask-id="${escapeAttr(st.id)}" value="${escapeAttr(st.title)}" placeholder="小任务名称">
      <button class="del" onclick="window.removeSubtaskRow(this)" type="button">✕</button>
    </div>
  `).join("");

  container.innerHTML = `
    <div class="form-section">
      <h3>${isNew ? "新建专项" : "编辑 " + escapeHtml(subject.name)}</h3>
      <div class="form-grid">
        <label>专项名称
          <input id="formName" value="${escapeAttr(subject.name)}" placeholder="例如：英语阅读 / 高数 / 408">
        </label>
        <label>图标
          <div class="emoji-picker" id="emojiPicker">${emojis}</div>
        </label>
        <label class="full">小任务
          <div class="subtask-editor" id="subtaskEditor">${subtaskRows}</div>
          <button class="btn" onclick="window.addSubtaskRow()" type="button">＋ 添加小任务</button>
        </label>
      </div>
      <div class="actions">
        <button class="btn primary" onclick="window.saveSubject('${escapeAttr(editingSubjectId)}')" type="button">保存</button>
        <button class="btn" onclick="window.cancelEdit()" type="button">取消</button>
      </div>
    </div>
  `;
}

window.selectEmoji = function(emoji) {
  document.querySelectorAll("#emojiPicker button").forEach(b => {
    b.classList.toggle("selected", b.textContent === emoji);
  });
};

window.addSubtaskRow = function() {
  const editor = $("subtaskEditor");
  if (!editor) return;
  const row = document.createElement("div");
  row.className = "subtask-edit-row";
  row.innerHTML = `
    <input class="form-subtask-input" data-subtask-id="${makeId("subtask")}" placeholder="小任务名称">
    <button class="del" onclick="window.removeSubtaskRow(this)" type="button">✕</button>
  `;
  editor.appendChild(row);
};

window.removeSubtaskRow = function(btn) {
  const row = btn.closest(".subtask-edit-row");
  if (row) row.remove();
};

window.saveSubject = function(editingId) {
  const config = readSubjectConfig();
  const isNew = editingId === "__new__";
  const name = ($("formName").value || "").trim();
  if (!name) { showToast("请输入专项名称"); return; }

  const selectedEmoji = document.querySelector("#emojiPicker button.selected");
  const icon = selectedEmoji ? selectedEmoji.textContent : "📝";
  const subtasks = [...document.querySelectorAll(".form-subtask-input")]
    .map(input => ({ id: input.dataset.subtaskId || makeId("subtask"), title: input.value.trim() }))
    .filter(st => st.title);

  const subjectData = normalizeSubject({ name, icon, enabled: true, subtasks });

  if (isNew) {
    config.push({ ...subjectData, id: makeId("subject") });
  } else {
    const idx = config.findIndex(s => s.id === editingId);
    if (idx >= 0) {
      config[idx] = { ...subjectData, id: config[idx].id, enabled: config[idx].enabled };
    }
  }

  writeSubjectConfig(config);
  editingSubjectId = null;
  safeRerender();
  renderSettingsTab();
  renderTimerTab();
  showToast(isNew ? "专项已添加" : "专项已更新");
};

window.toggleSubject = function(id, enabled) {
  const config = readSubjectConfig();
  const subject = config.find(s => s.id === id);
  if (subject) {
    subject.enabled = enabled;
    writeSubjectConfig(config);
    safeRerender();
    renderSettingsTab();
    renderTimerTab();
  }
};

window.toggleTask = window.toggleSubject;

window.deleteSubject = function(id) {
  const config = readSubjectConfig();
  const subject = config.find(s => s.id === id);
  if (!subject) return;
  if (!confirm(`确定删除专项“${subject.name}”？`)) return;
  writeSubjectConfig(config.filter(s => s.id !== id));
  safeRerender();
  renderSettingsTab();
  renderTimerTab();
  showToast(`已删除 ${subject.name}`);
};

window.deleteTask = window.deleteSubject;

window.exportAllData = function() {
  const payload = JSON.stringify({
    subjects: readSubjectConfig(),
    records: readStore()
  }, null, 2);
  const blob = new Blob([payload], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `kaoyan-tracker-${todayIso()}.json`;
  a.click();
  URL.revokeObjectURL(url);
  showToast("数据已导出 📥");
};

window.clearAllData = function() {
  if (!confirm("确定清除所有数据？此操作不可恢复！")) return;
  localStorage.removeItem(STORE_KEY);
  localStorage.removeItem(SUBJECT_CONFIG_KEY);
  localStorage.removeItem(ACTIVE_TIMER_KEY);
  OLD_STORE_KEYS.forEach(key => localStorage.removeItem(key));
  OLD_CONFIG_KEYS.forEach(key => localStorage.removeItem(key));
  location.reload();
};

// ── Toast ──
function showToast(message) {
  const toast = $("toast");
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.remove("show"), 2000);
}

// ── Native chrome ──
async function enableFullscreenStatusBar() {
  try {
    const statusBar = window.Capacitor?.Plugins?.StatusBar;
    if (!statusBar) return;
    await statusBar.setOverlaysWebView?.({ overlay: true });
    await statusBar.hide?.({ animation: "NONE" });
  } catch {}
}

// ── Init ──
enableFullscreenStatusBar();
migrateData();

$("date").value = todayIso();
selectedStatsDate = $("date").value;
renderSubjectCards();
loadDate($("date").value);

$("date").addEventListener("change", e => {
  flushAutoSave();
  renderSubjectCards();
  loadDate(e.target.value);
  renderTimerTab();
  if ($("tab-stats")?.classList.contains("active")) renderStatsTab();
});
$("resetBtn").addEventListener("click", resetDay);

document.addEventListener("change", e => {
  if (e.target.type === "checkbox") {
    syncCheckboxUI(e.target.id);
    updateTodayUi();
    if ($("taskGrid")?.contains(e.target)) scheduleAutoSave();
  } else if (e.target === $("review")) {
    updateTodayUi();
    scheduleAutoSave();
  }
});

document.addEventListener("input", e => {
  if (e.target === $("review")) {
    updateTodayUi();
    scheduleAutoSave();
  }
});

document.querySelectorAll(".tab-btn").forEach(btn => {
  btn.addEventListener("touchstart", function() {
    this.click();
  }, { passive: true });
});

startTimerTicker();
