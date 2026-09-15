import { createDataService, dateUtils } from "./data-service.js";
import {
  computeLeaderboard,
  rankLeaderboard,
  totalClassXp,
  userRecords,
  userTotalXp,
  completedBooksCount,
  currentStreak,
  activeSeasonMatchesToday,
  getActiveSeason,
  getSeasonGoal
} from "./stats.js?v=20260915-seasons1";

const $ = (id) => document.getElementById(id);
let service, session, profile, state, unsubscribe;

function esc(value = "") {
  return String(value).replace(/[&<>'"]/g, (c) => ({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[c]));
}
function fmtDate(date) {
  return new Intl.DateTimeFormat("de-DE", { day:"2-digit", month:"2-digit" }).format(new Date(`${date}T12:00:00`));
}
function fmtFullDate(date) {
  return new Intl.DateTimeFormat("de-DE", { day:"2-digit", month:"2-digit", year:"numeric" }).format(new Date(`${date}T12:00:00`));
}
function setMessage(el, text, type = "ok") {
  el.innerHTML = text ? `<div class="notice ${type}">${esc(text)}</div>` : "";
}
function studentId() {
  return session?.studentId || session?.uid;
}

function localDateKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
function mondayOfWeek(date = new Date()) {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const daysSinceMonday = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - daysSinceMonday);
  return d;
}
function addDays(date, amount) {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  d.setDate(d.getDate() + amount);
  return d;
}
function xpBetween(dates = {}, startDate, endDate) {
  const start = localDateKey(startDate);
  const end = localDateKey(endDate);
  return Object.entries(dates || {}).reduce((sum, [date, entry]) => {
    if (date < start || date > end) return sum;
    return sum + Number(entry?.xp || 0);
  }, 0);
}

function ensureWeeklyProgressCard() {
  if ($("weeklyProgressCard")) return;
  const card = document.createElement("section");
  card.id = "weeklyProgressCard";
  card.className = "card";
  card.innerHTML = `
    <div class="section-head">
      <div><h3>Dein Wochenvergleich</h3><p>Deine Entwicklung im Vergleich zur Vorwoche</p></div>
      <span id="weeklyTrendBadge" class="badge">–</span>
    </div>
    <div class="metrics">
      <div class="metric"><b id="weekCurrentXp">0 XP</b><span>diese Woche bis heute</span></div>
      <div class="metric"><b id="weekPreviousXp">0 XP</b><span>Vorwoche, gleicher Zeitraum</span></div>
      <div class="metric"><b id="weekChange">–</b><span>Veränderung</span></div>
    </div>
    <div id="weeklyProgressNote" class="notice ok" style="margin-top:14px">Sobald Vergleichsdaten vorhanden sind, siehst du hier deine Entwicklung.</div>
    <p style="margin:10px 2px 0;color:var(--muted);font-size:12px;line-height:1.5">Verglichen wird immer Montag bis heute mit denselben Wochentagen der Vorwoche.</p>`;
  const recoveryCard = $("recoveryCard");
  if (recoveryCard) recoveryCard.insertAdjacentElement("afterend", card);
  else $("appView")?.prepend(card);
}

function renderWeeklyProgress(currentState, sid) {
  ensureWeeklyProgressCard();
  const now = new Date();
  const thisMonday = mondayOfWeek(now);
  const elapsedDays = (now.getDay() + 6) % 7;
  const previousMonday = addDays(thisMonday, -7);
  const previousComparableEnd = addDays(previousMonday, elapsedDays);
  const myDates = currentState.days?.[sid] || {};
  const currentXp = xpBetween(myDates, thisMonday, now);
  const previousXp = xpBetween(myDates, previousMonday, previousComparableEnd);

  $("weekCurrentXp").textContent = `${currentXp} XP`;
  $("weekPreviousXp").textContent = `${previousXp} XP`;
  const badge = $("weeklyTrendBadge");
  const change = $("weekChange");
  const note = $("weeklyProgressNote");
  badge.className = "badge";
  note.className = "notice ok";

  if (previousXp === 0) {
    if (currentXp === 0) {
      change.textContent = "–";
      badge.textContent = "Noch kein Vergleich";
      note.textContent = "In beiden Vergleichszeiträumen stehen bisher 0 XP.";
    } else {
      change.textContent = "Neu";
      badge.textContent = "↗ gestartet";
      note.textContent = `Du hast diese Woche bereits ${currentXp} XP gesammelt. In der Vorwoche waren es im gleichen Zeitraum 0 XP.`;
    }
    return;
  }

  const percentChange = Math.round(((currentXp - previousXp) / previousXp) * 100);
  change.textContent = `${percentChange > 0 ? "+" : ""}${percentChange} %`;
  if (percentChange > 0) {
    badge.textContent = `↗ +${percentChange} %`;
    badge.className = "badge live";
    note.textContent = `Stark: ${percentChange} % mehr XP als im gleichen Zeitraum der Vorwoche.`;
  } else if (percentChange < 0) {
    badge.textContent = `↘ ${percentChange} %`;
    note.className = "notice";
    note.textContent = `Aktuell ${Math.abs(percentChange)} % weniger XP als im gleichen Zeitraum der Vorwoche.`;
  } else {
    badge.textContent = "→ 0 %";
    note.textContent = "Du liegst genau auf dem Niveau des gleichen Zeitraums der Vorwoche.";
  }
}

function ensureSeasonArchiveCard() {
  if ($("seasonArchiveCard")) return;
  const card = document.createElement("section");
  card.id = "seasonArchiveCard";
  card.className = "card hidden";
  card.innerHTML = `<div class="section-head"><div><h3>Vergangene Seasons</h3><p>Deine bisherigen Zwischenergebnisse</p></div></div><div id="seasonArchiveList" class="leaderboard"></div>`;
  const weekly = $("weeklyProgressCard");
  if (weekly) weekly.insertAdjacentElement("afterend", card);
  else $("recoveryCard")?.insertAdjacentElement("afterend", card);
}

function renderSeasonArchive(currentState, sid) {
  ensureSeasonArchiveCard();
  const archives = currentState.config?.seasonArchives || {};
  const entries = Object.values(archives)
    .filter(Boolean)
    .sort((a,b) => String(a.start || "").localeCompare(String(b.start || "")))
    .map((archive) => {
      const row = (archive.rows || []).find((item) => item.uid === sid);
      return row ? { archive, row } : null;
    })
    .filter(Boolean);
  $("seasonArchiveCard").classList.toggle("hidden", entries.length === 0);
  if (!entries.length) return;
  $("seasonArchiveList").innerHTML = entries.map(({archive,row}) => `
    <div class="rank-row me">
      <div class="rank">#${row.rank}</div>
      <div class="player"><b>${esc(archive.label || "Season")}</b><small>${esc(fmtFullDate(archive.start))} – ${esc(fmtFullDate(archive.end))}</small></div>
      <div class="score">${row.xp} XP<br><small>📚 ${row.books || 0}</small></div>
    </div>`).join("");
}

function renderMode() {
  $("modeBadge").textContent = service.mode === "demo" ? "● DEMO" : "● LIVE";
  $("modeBadge").className = `badge ${service.mode === "demo" ? "demo" : "live"}`;
  $("recoverSetupBox").classList.toggle("hidden", service.mode !== "firebase");
}

function renderPodium(rows) {
  const medals = ["🥈","🥇","🥉"];
  const order = [rows[1], rows[0], rows[2]];
  $("podium").innerHTML = order.map((r, i) => r ? `<div class="podium-card ${i===1?"first":""}"><div class="podium-place">${medals[i]}</div><b>${esc(r.nickname)}</b><span>${r.xp} XP</span></div>` : `<div></div>`).join("");
}

function showRecoveryCode(result, forceModal = false) {
  if (service.mode !== "firebase") return;
  $("recoveryCard").classList.remove("hidden");
  if (result?.code) {
    $("recoveryCode").textContent = result.code;
    $("recoveryCodeBox").classList.remove("hidden");
    $("recoveryUnavailable").classList.add("hidden");
    if (result.isNew || forceModal) {
      $("modalRecoveryCode").textContent = result.code;
      $("recoveryModal").classList.remove("hidden");
    }
  } else if (result?.pendingRules) {
    $("recoveryCodeBox").classList.add("hidden");
    $("recoveryUnavailable").classList.remove("hidden");
    $("recoveryUnavailable").textContent = "Die Code-Funktion wird gerade eingerichtet. Dein Leseliga-Konto funktioniert trotzdem weiter.";
  } else {
    $("recoveryCodeBox").classList.add("hidden");
    $("recoveryUnavailable").classList.remove("hidden");
    $("recoveryUnavailable").textContent = "Bitte frage deine Lehrkraft nach dem aktuellen Wiederherstellungscode.";
  }
}

async function prepareRecovery({ forceModal = false } = {}) {
  if (service.mode !== "firebase" || !profile) return;
  const result = await service.ensureRecoveryCode(studentId());
  showRecoveryCode(result, forceModal);
}

async function copyCode(sourceId, messageId) {
  const code = $(sourceId).textContent.trim();
  if (!code || code === "–") return;
  try {
    await navigator.clipboard.writeText(code);
    if (messageId) setMessage($(messageId), "Code kopiert.", "ok");
  } catch {
    if (messageId) setMessage($(messageId), "Bitte den Code markieren und manuell kopieren.", "error");
  }
}

function renderState() {
  if (!state || !profile) return;
  const cfg = state.config;
  const sid = studentId();
  const season = getActiveSeason(state);
  const rows = rankLeaderboard(computeLeaderboard(state));
  const my = rows.find((r) => r.uid === sid);
  const total = totalClassXp(state);
  const goal = getSeasonGoal(state);
  const percent = Math.min(100, Math.round(total / Math.max(1, goal) * 100));
  const records = userRecords(state, sid);
  const today = dateUtils.yyyyMmDd();
  const todayEntry = state.days?.[sid]?.[today];

  $("brandTitle").textContent = cfg.className || "LESELIGA 11";
  $("seasonText").textContent = season.label;
  $("activeMonthLabel").textContent = season.label;
  $("helloName").textContent = profile.nickname;
  $("myXp").textContent = userTotalXp(state, sid);
  $("myRank").textContent = my ? `#${my.rank}` : "–";
  $("myStreak").textContent = currentStreak(state, sid);
  $("myBooks").textContent = completedBooksCount(state, sid);
  $("todayStatus").textContent = `${todayEntry?.xp || 0} / ${cfg.maxDailyXp || 2} XP`;
  $("todayHint").textContent = todayEntry ? "Du kannst deinen heutigen Eintrag noch bearbeiten." : "Trage deine heutige Lesezeit ein.";
  $("finishedInput").checked = Boolean(todayEntry?.finished);
  if (todayEntry) {
    document.querySelector(`input[name="xp"][value="${todayEntry.xp}"]`)?.click();
    $("bookInput").value = todayEntry.book || "";
    $("sectionInput").value = todayEntry.section || "";
    $("saveLogBtn").textContent = "Heutigen Eintrag aktualisieren";
  }

  const seasonOk = activeSeasonMatchesToday(state);
  $("monthMismatch").classList.toggle("hidden", seasonOk);
  if (!seasonOk) $("monthMismatch").textContent = `${season.label} läuft vom ${fmtFullDate(season.start)} bis ${fmtFullDate(season.end)}. Bitte die Lehrkraft informieren, falls die nächste Season noch nicht gestartet wurde.`;
  $("saveLogBtn").disabled = !seasonOk;

  $("goalText").textContent = `${total} / ${goal} XP`;
  $("goalPercent").textContent = `${percent} %`;
  $("goalBar").style.width = `${percent}%`;
  $("goalNote").textContent = total >= goal ? "🎉 Season-Klassenziel erreicht! Alles Weitere ist Bonus." : `Noch ${goal - total} XP bis zum gemeinsamen Season-Ziel.`;
  $("participantCount").textContent = `${rows.length} Teilnehmer`;

  renderWeeklyProgress(state, sid);
  renderSeasonArchive(state, sid);
  renderPodium(rows);
  $("leaderboard").innerHTML = rows.map((r) => `<div class="rank-row ${r.uid===sid?"me":""}"><div class="rank">${r.rank}</div><div class="player"><b>${esc(r.nickname)}${r.uid===sid?" · du":""}</b><small>${r.xp >= Number(cfg.raffleXp || 8) ? "🎟️ Verlosung erreicht" : `${Math.max(0, Number(cfg.raffleXp || 8)-r.xp)} XP bis Verlosung`}</small></div><div class="score">${r.xp} XP</div></div>`).join("") || `<div class="empty">Noch keine Teilnehmer.</div>`;

  $("history").innerHTML = records.length ? records.map((r) => `<div class="history-row"><time>${fmtDate(r.date)}</time><div><span class="xp-pill">+${r.xp}</span></div><div><b>${esc(r.book)}</b><br><small>${esc(r.section)}</small>${r.finished === true ? '<br><small>📚 Buch beendet</small>' : ''}</div></div>`).join("") : `<div class="empty">Noch kein Eintrag in dieser Season.</div>`;
}

function openApp() {
  $("setupView").classList.add("hidden");
  $("appView").classList.remove("hidden");
  unsubscribe?.();
  unsubscribe = service.subscribeState((next) => {
    state = next;
    profile = state.profiles?.[studentId()] || profile;
    renderState();
  });
}

async function start() {
  service = await createDataService();
  renderMode();
  session = await service.initStudentSession();
  profile = await service.getProfile(studentId());
  $("loadingView").classList.add("hidden");
  if (!profile) $("setupView").classList.remove("hidden");
  else {
    openApp();
    await prepareRecovery();
  }
}

$("nicknameForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const nickname = $("nicknameInput").value.trim();
  if (nickname.length < 2) return setMessage($("setupMessage"), "Bitte mindestens 2 Zeichen verwenden.", "error");
  try {
    profile = await service.saveProfile(studentId(), nickname);
    openApp();
    await prepareRecovery({ forceModal: true });
  } catch (err) {
    setMessage($("setupMessage"), err.message || "Nickname konnte nicht gespeichert werden.", "error");
  }
});

$("showRecoveryBtn").addEventListener("click", () => {
  $("recoveryForm").classList.toggle("hidden");
  $("recoveryCodeInput").focus();
});

$("recoveryForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  setMessage($("recoveryMessage"), "");
  try {
    session = await service.recoverWithCode($("recoveryCodeInput").value);
    profile = await service.getProfile(studentId());
    if (!profile) throw new Error("Zu diesem Code wurde kein Leseliga-Profil gefunden.");
    openApp();
    await prepareRecovery();
    setMessage($("logMessage"), `Willkommen zurück, ${profile.nickname}. Dein bisheriger Stand wurde wiederhergestellt.`, "ok");
  } catch (err) {
    setMessage($("recoveryMessage"), err.message || "Wiederherstellung fehlgeschlagen.", "error");
  }
});

$("logForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const cfg = state?.config || {};
  const xp = Number(document.querySelector('input[name="xp"]:checked')?.value || 1);
  const book = $("bookInput").value.trim();
  const section = $("sectionInput").value.trim();
  const finished = $("finishedInput").checked;
  if (!activeSeasonMatchesToday(state)) return setMessage($("logMessage"), "Die nächste Season muss zuerst von der Lehrkraft gestartet werden.", "error");
  if (![1,2].includes(xp) || xp > Number(cfg.maxDailyXp || 2)) return setMessage($("logMessage"), "Für einen Tag sind maximal 2 XP erlaubt.", "error");
  if (!book || !section) return setMessage($("logMessage"), "Bitte Buchtitel und Seiten/Kapitel ergänzen.", "error");
  try {
    await service.saveToday(studentId(), { xp, book, section, finished });
    setMessage($("logMessage"), finished ? `${xp} XP gespeichert. 📚 Glückwunsch zum beendeten Buch!` : `${xp} XP gespeichert. Gute Runde!`, "ok");
  } catch (err) {
    setMessage($("logMessage"), err.message || "Eintrag konnte nicht gespeichert werden.", "error");
  }
});

$("changeProfileBtn").addEventListener("click", async () => {
  if (service.mode === "demo") {
    if (confirm("Demo-Testprofil auf diesem Browser wechseln? Die Demo-Rangliste bleibt erhalten.")) {
      unsubscribe?.();
      await service.resetLocalStudent();
    }
    return;
  }
  const next = prompt("Neuen Nickname eingeben:", profile?.nickname || "");
  if (next === null) return;
  const nickname = next.trim();
  if (nickname.length < 2 || nickname.length > 24) {
    alert("Der Nickname muss 2–24 Zeichen lang sein.");
    return;
  }
  try { await service.saveProfile(studentId(), nickname); }
  catch (err) { alert(err.message || "Nickname konnte nicht geändert werden."); }
});

$("copyRecoveryBtn").addEventListener("click", () => copyCode("recoveryCode", "recoveryCopyMessage"));
$("copyModalRecoveryBtn").addEventListener("click", () => copyCode("modalRecoveryCode", "modalRecoveryMessage"));
$("recoveryModalDone").addEventListener("click", () => $("recoveryModal").classList.add("hidden"));

start().catch((err) => {
  $("loadingView").innerHTML = `<div class="notice error">Startfehler: ${esc(err.message || err)}</div>`;
});
