const STORAGE_KEY = "leseliga-reading-stopwatch-v1";
const $ = (id) => document.getElementById(id);

let tickHandle = null;
let timerState = loadState();

function loadState() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
    if (!parsed || typeof parsed !== "object") throw new Error("invalid");
    return {
      running: Boolean(parsed.running),
      startedAt: Number(parsed.startedAt || 0),
      elapsedMs: Math.max(0, Number(parsed.elapsedMs || 0))
    };
  } catch {
    return { running: false, startedAt: 0, elapsedMs: 0 };
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(timerState));
}

function elapsedMs() {
  return timerState.elapsedMs + (timerState.running && timerState.startedAt ? Math.max(0, Date.now() - timerState.startedAt) : 0);
}

function formatDuration(ms) {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return [hours, minutes, seconds].map((n) => String(n).padStart(2, "0")).join(":");
}

function formatRemaining(ms) {
  const seconds = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return `${minutes}:${String(rest).padStart(2, "0")}`;
}

function currentXp(ms) {
  if (ms >= 40 * 60 * 1000) return 2;
  if (ms >= 20 * 60 * 1000) return 1;
  return 0;
}

function render() {
  const watch = $("stopwatchTime");
  if (!watch) return;

  const ms = elapsedMs();
  const xp = currentXp(ms);
  watch.textContent = formatDuration(ms);

  const startBtn = $("stopwatchStartBtn");
  const resetBtn = $("stopwatchResetBtn");
  const useBtn = $("stopwatchUseBtn");
  const badge = $("stopwatchBadge");
  const note = $("stopwatchNote");
  const fill = $("stopwatchFill");

  startBtn.textContent = timerState.running ? "Pause" : (ms > 0 ? "Weiter" : "Start");
  resetBtn.disabled = ms <= 0;
  useBtn.disabled = xp === 0;
  fill.style.width = `${Math.min(100, (ms / (40 * 60 * 1000)) * 100)}%`;

  if (xp === 0) {
    badge.textContent = timerState.running ? "⏱️ läuft" : "bereit";
    badge.className = timerState.running ? "badge live" : "badge";
    note.textContent = `Noch ${formatRemaining(20 * 60 * 1000 - ms)} bis 1 XP.`;
  } else if (xp === 1) {
    badge.textContent = "✓ 1 XP erreicht";
    badge.className = "badge live";
    note.textContent = `20 Minuten geschafft. Noch ${formatRemaining(40 * 60 * 1000 - ms)} bis 2 XP.`;
  } else {
    badge.textContent = "✓ 2 XP erreicht";
    badge.className = "badge live";
    note.textContent = "40 Minuten geschafft – damit sind für heute maximal 2 XP erreichbar.";
  }
}

function startOrPause() {
  if (timerState.running) {
    timerState.elapsedMs = elapsedMs();
    timerState.running = false;
    timerState.startedAt = 0;
  } else {
    timerState.running = true;
    timerState.startedAt = Date.now();
  }
  saveState();
  render();
}

function reset() {
  timerState = { running: false, startedAt: 0, elapsedMs: 0 };
  saveState();
  render();
}

function useForEntry() {
  const xp = currentXp(elapsedMs());
  if (!xp) return;
  const input = document.querySelector(`input[name="xp"][value="${xp}"]`);
  if (input) input.click();
  $("logForm")?.scrollIntoView({ behavior: "smooth", block: "start" });
  $("bookInput")?.focus({ preventScroll: true });
}

function init() {
  if (!$("stopwatchTime")) return;
  $("stopwatchStartBtn")?.addEventListener("click", startOrPause);
  $("stopwatchResetBtn")?.addEventListener("click", reset);
  $("stopwatchUseBtn")?.addEventListener("click", useForEntry);
  render();
  tickHandle = window.setInterval(render, 1000);
  document.addEventListener("visibilitychange", render);
  window.addEventListener("beforeunload", () => {
    saveState();
    if (tickHandle) clearInterval(tickHandle);
  });
}

init();
