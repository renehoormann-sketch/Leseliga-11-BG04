const SDK_VERSION = "12.18.0";

const [{ getApps }, authMod, dbMod] = await Promise.all([
  import(`https://www.gstatic.com/firebasejs/${SDK_VERSION}/firebase-app.js`),
  import(`https://www.gstatic.com/firebasejs/${SDK_VERSION}/firebase-auth.js`),
  import(`https://www.gstatic.com/firebasejs/${SDK_VERSION}/firebase-database.js`)
]);

let days = {};
let unsubscribeDays = null;

function formatEntryTime(value) {
  const timestamp = Number(value);
  if (!Number.isFinite(timestamp) || timestamp <= 0) return "–";
  return `${new Intl.DateTimeFormat("de-DE", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Berlin"
  }).format(new Date(timestamp))} Uhr`;
}

function ensureTimeHeader() {
  const body = document.getElementById("activityBody");
  const row = body?.closest("table")?.querySelector("thead tr");
  if (!row || row.querySelector("[data-entry-time-header]")) return;
  const th = document.createElement("th");
  th.dataset.entryTimeHeader = "true";
  th.textContent = "Eingetragen um";
  row.insertBefore(th, row.lastElementChild);
}

function enrichActivityTable() {
  ensureTimeHeader();
  const body = document.getElementById("activityBody");
  if (!body) return;

  body.querySelectorAll("tr").forEach((row) => {
    const deleteBtn = row.querySelector(".delete-entry");
    if (!deleteBtn) {
      const onlyCell = row.querySelector("td[colspan]");
      if (onlyCell) onlyCell.colSpan = 6;
      return;
    }

    let cell = row.querySelector("[data-entry-time-cell]");
    if (!cell) {
      cell = document.createElement("td");
      cell.dataset.entryTimeCell = "true";
      row.insertBefore(cell, row.lastElementChild);
    }

    const entry = days?.[deleteBtn.dataset.uid]?.[deleteBtn.dataset.date];
    const text = formatEntryTime(entry?.updatedAt);
    if (cell.textContent !== text) cell.textContent = text;
  });
}

const body = document.getElementById("activityBody");
if (body) {
  new MutationObserver(enrichActivityTable).observe(body, { childList: true, subtree: true });
  enrichActivityTable();
}

async function waitForFirebaseApp() {
  for (let i = 0; i < 100; i += 1) {
    const apps = getApps();
    if (apps.length) return apps[0];
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  return null;
}

const app = await waitForFirebaseApp();
if (app) {
  const auth = authMod.getAuth(app);
  const db = dbMod.getDatabase(app);
  authMod.onAuthStateChanged(auth, (user) => {
    unsubscribeDays?.();
    unsubscribeDays = null;
    if (!user) return;
    unsubscribeDays = dbMod.onValue(dbMod.ref(db, "days"), (snapshot) => {
      days = snapshot.val() || {};
      enrichActivityTable();
    });
  });
}
