import { createDataService, dateUtils } from "./data-service.js";
import { computeLeaderboard, rankLeaderboard, totalClassXp, userRecords, userTotalXp, currentStreak, activeMonthMatchesToday } from "./stats.js";

const $ = (id) => document.getElementById(id);
let service, session, profile, state, unsubscribe;

function esc(value = "") {
  return String(value).replace(/[&<>'"]/g, (c) => ({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[c]));
}
function fmtDate(date) {
  return new Intl.DateTimeFormat("de-DE", { day:"2-digit", month:"2-digit" }).format(new Date(`${date}T12:00:00`));
}
function setMessage(el, text, type = "ok") {
  el.innerHTML = text ? `<div class="notice ${type}">${esc(text)}</div>` : "";
}
function studentId() {
  return session?.studentId || session?.uid;
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
  const card = $("recoveryCard");
  card.classList.remove("hidden");

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
    $("recoveryUnavailable").textContent = "Für dieses Konto wurde ein neuer Code erstellt. Bitte frage deine Lehrkraft nach dem aktuellen Wiederherstellungscode.";
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
  const rows = rankLeaderboard(computeLeaderboard(state));
  const my = rows.find((r) => r.uid === sid);
  const total = totalClassXp(state);
  const goal = Math.max(1, Number(cfg.goalXp || 180));
  const percent = Math.min(100, Math.round(total / goal * 100));
  const records = userRecords(state, sid);
  const today = dateUtils.yyyyMmDd();
  const todayEntry = state.days?.[sid]?.[today];

  $("brandTitle").textContent = cfg.className || "LESELIGA 11";
  $("seasonText").textContent = cfg.seasonLabel || cfg.activeMonth;
  $("activeMonthLabel").textContent = cfg.seasonLabel || cfg.activeMonth;
  $("helloName").textContent = profile.nickname;
  $("myXp").textContent = userTotalXp(state, sid);
  $("myRank").textContent = my ? `#${my.rank}` : "–";
  $("myStreak").textContent = currentStreak(state, sid);
  $("todayStatus").textContent = `${todayEntry?.xp || 0} / ${cfg.maxDailyXp || 2} XP`;
  $("todayHint").textContent = todayEntry ? "Du kannst deinen heutigen Eintrag noch bearbeiten." : "Trage deine heutige Lesezeit ein.";
  if (todayEntry) {
    document.querySelector(`input[name="xp"][value="${todayEntry.xp}"]`)?.click();
    $("bookInput").value = todayEntry.book || "";
    $("sectionInput").value = todayEntry.section || "";
    $("saveLogBtn").textContent = "Heutigen Eintrag aktualisieren";
  }

  const monthOk = activeMonthMatchesToday(cfg.activeMonth);
  $("monthMismatch").classList.toggle("hidden", monthOk);
  if (!monthOk) $("monthMismatch").textContent = `Die aktive Runde ist ${cfg.activeMonth}. Heute ist ${dateUtils.yyyyMm()}. Bitte die Lehrkraft informieren; Einträge sind bis zur Umstellung gesperrt.`;
  $("saveLogBtn").disabled = !monthOk;

  $("goalText").textContent = `${total} / ${goal} XP`;
  $("goalPercent").textContent = `${percent} %`;
  $("goalBar").style.width = `${percent}%`;
  $("goalNote").textContent = total >= goal ? "🎉 Klassenziel erreicht! Alles Weitere ist Bonus." : `Noch ${goal - total} XP bis zum gemeinsamen Ziel.`;
  $("participantCount").textContent = `${rows.length} Teilnehmer`;

  renderPodium(rows);
  $("leaderboard").innerHTML = rows.map((r) => `<div class="rank-row ${r.uid===sid?"me":""}"><div class="rank">${r.rank}</div><div class="player"><b>${esc(r.nickname)}${r.uid===sid?" · du":""}</b><small>${r.xp >= Number(cfg.raffleXp || 8) ? "🎟️ Verlosung erreicht" : `${Math.max(0, Number(cfg.raffleXp || 8)-r.xp)} XP bis Verlosung`}</small></div><div class="score">${r.xp} XP</div></div>`).join("") || `<div class="empty">Noch keine Teilnehmer.</div>`;

  $("history").innerHTML = records.length ? records.map((r) => `<div class="history-row"><time>${fmtDate(r.date)}</time><div><span class="xp-pill">+${r.xp}</span></div><div><b>${esc(r.book)}</b><br><small>${esc(r.section)}</small></div></div>`).join("") : `<div class="empty">Noch kein Eintrag in dieser Runde.</div>`;
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
  if (!profile) {
    $("setupView").classList.remove("hidden");
  } else {
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
  } catch (err) { setMessage($("setupMessage"), err.message || "Nickname konnte nicht gespeichert werden.", "error"); }
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
  if (!activeMonthMatchesToday(cfg.activeMonth)) return setMessage($("logMessage"), "Die Monatsrunde muss zuerst von der Lehrkraft aktualisiert werden.", "error");
  if (![1,2].includes(xp) || xp > Number(cfg.maxDailyXp || 2)) return setMessage($("logMessage"), "Für einen Tag sind maximal 2 XP erlaubt.", "error");
  if (!book || !section) return setMessage($("logMessage"), "Bitte Buchtitel und Seiten/Kapitel ergänzen.", "error");
  try {
    await service.saveToday(studentId(), { xp, book, section });
    setMessage($("logMessage"), `${xp} XP gespeichert. Gute Runde!`, "ok");
  } catch (err) { setMessage($("logMessage"), err.message || "Eintrag konnte nicht gespeichert werden.", "error"); }
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
  try {
    await service.saveProfile(studentId(), nickname);
  } catch (err) {
    alert(err.message || "Nickname konnte nicht geändert werden.");
  }
});

$("copyRecoveryBtn").addEventListener("click", () => copyCode("recoveryCode", "recoveryCopyMessage"));
$("copyModalRecoveryBtn").addEventListener("click", () => copyCode("modalRecoveryCode", "modalRecoveryMessage"));
$("recoveryModalDone").addEventListener("click", () => $("recoveryModal").classList.add("hidden"));

start().catch((err) => {
  $("loadingView").innerHTML = `<div class="notice error">Startfehler: ${esc(err.message || err)}</div>`;
});
