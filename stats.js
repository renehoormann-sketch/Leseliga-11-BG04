export function getMonthRecords(state, activeMonth) {
  const records = [];
  Object.entries(state.days || {}).forEach(([uid, dates]) => {
    Object.entries(dates || {}).forEach(([date, entry]) => {
      if (date.startsWith(activeMonth)) records.push({ uid, date, ...entry });
    });
  });
  return records;
}

export function computeLeaderboard(state) {
  const activeMonth = state.config?.activeMonth || "";
  const totals = {};
  Object.keys(state.profiles || {}).forEach((uid) => { totals[uid] = 0; });
  getMonthRecords(state, activeMonth).forEach((r) => {
    totals[r.uid] = (totals[r.uid] || 0) + Number(r.xp || 0);
  });
  return Object.entries(state.profiles || {})
    .map(([uid, profile]) => ({ uid, nickname: profile.nickname || "Ohne Namen", xp: totals[uid] || 0 }))
    .sort((a, b) => b.xp - a.xp || a.nickname.localeCompare(b.nickname, "de"));
}

export function rankLeaderboard(rows) {
  let lastXp = null;
  let lastRank = 0;
  return rows.map((row, index) => {
    if (row.xp !== lastXp) lastRank = index + 1;
    lastXp = row.xp;
    return { ...row, rank: lastRank };
  });
}

export function totalClassXp(state) {
  return computeLeaderboard(state).reduce((sum, row) => sum + row.xp, 0);
}

export function userRecords(state, uid) {
  const activeMonth = state.config?.activeMonth || "";
  return Object.entries(state.days?.[uid] || {})
    .filter(([date]) => date.startsWith(activeMonth))
    .map(([date, entry]) => ({ date, ...entry }))
    .sort((a, b) => b.date.localeCompare(a.date));
}

export function userTotalXp(state, uid) {
  return userRecords(state, uid).reduce((sum, r) => sum + Number(r.xp || 0), 0);
}

export function currentStreak(state, uid) {
  const set = new Set(userRecords(state, uid).filter((r) => Number(r.xp) > 0).map((r) => r.date));
  if (!set.size) return 0;
  let cursor = new Date();
  const fmt = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  if (!set.has(fmt(cursor))) {
    cursor.setDate(cursor.getDate() - 1);
    if (!set.has(fmt(cursor))) return 0;
  }
  let count = 0;
  while (set.has(fmt(cursor))) {
    count += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return count;
}

export function activeMonthMatchesToday(activeMonth) {
  const d = new Date();
  const todayMonth = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  return activeMonth === todayMonth;
}
