import { FIREBASE_CONFIG, DEFAULT_CONFIG, isFirebaseConfigured } from "./config.js";

const SDK_VERSION = "12.18.0";
const DEMO_DB_KEY = "leseliga_demo_db_v2";
const DEMO_UID_KEY = "leseliga_demo_uid_v2";
const DEMO_EVENT = "leseliga-demo-change";
const STUDENT_ID_KEY = "leseliga_student_id_v1";
const RECOVERY_CODE_KEY = "leseliga_recovery_code_v1";
const RECOVERY_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const demoSubscribers = new Set();

function yyyyMm(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function yyyyMmDd(date = new Date()) {
  return `${yyyyMm(date)}-${String(date.getDate()).padStart(2, "0")}`;
}

function germanMonthLabel(monthKey) {
  const [y, m] = monthKey.split("-").map(Number);
  return new Intl.DateTimeFormat("de-DE", { month: "long", year: "numeric" }).format(new Date(y, m - 1, 1));
}

function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return yyyyMmDd(d);
}

function normalizeRecoveryCode(value = "") {
  const compact = String(value).toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (!compact.startsWith("LIGA") || compact.length !== 20) return null;
  return compact;
}

function formatRecoveryCode(compact) {
  const normalized = normalizeRecoveryCode(compact);
  if (!normalized) return "";
  const body = normalized.slice(4);
  return `LIGA-${body.slice(0,4)}-${body.slice(4,8)}-${body.slice(8,12)}-${body.slice(12,16)}`;
}

function makeRecoveryCode() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  let body = "";
  for (const byte of bytes) body += RECOVERY_ALPHABET[byte % RECOVERY_ALPHABET.length];
  return formatRecoveryCode(`LIGA${body}`);
}

async function hashRecoveryCode(value) {
  const compact = normalizeRecoveryCode(value);
  if (!compact) throw new Error("Der Wiederherstellungscode hat nicht das richtige Format.");
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(compact));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

function makeDemoSeed() {
  const month = yyyyMm();
  const profiles = {
    demo01: { nickname: "BookDragon", createdAt: Date.now() - 300000 },
    demo02: { nickname: "Nachteule", createdAt: Date.now() - 280000 },
    demo03: { nickname: "PlotTwist", createdAt: Date.now() - 260000 },
    demo04: { nickname: "Raven", createdAt: Date.now() - 240000 },
    demo05: { nickname: "PageTurner", createdAt: Date.now() - 220000 },
    demo06: { nickname: "KafkaKeks", createdAt: Date.now() - 200000 },
    demo07: { nickname: "InkRunner", createdAt: Date.now() - 180000 },
    demo08: { nickname: "KapitelElf", createdAt: Date.now() - 160000 }
  };

  const xpTargets = { demo01: 18, demo02: 15, demo03: 14, demo04: 11, demo05: 9, demo06: 7, demo07: 5, demo08: 4 };
  const sampleBooks = ["Tschick", "1984", "One Piece", "Der Trafikant", "Dune", "Die Tribute von Panem", "QualityLand", "Das Parfum"];
  const days = {};
  Object.entries(xpTargets).forEach(([uid, total], i) => {
    days[uid] = {};
    let left = total;
    let offset = 1;
    while (left > 0 && offset < 28) {
      const date = daysAgo(offset);
      if (!date.startsWith(month)) break;
      const xp = Math.min(2, left);
      days[uid][date] = {
        xp,
        book: sampleBooks[i % sampleBooks.length],
        section: `Kapitel ${Math.max(1, 12 - offset)}`,
        updatedAt: Date.now() - offset * 86400000
      };
      left -= xp;
      offset += (i % 3) + 1;
    }
  });

  return {
    config: {
      ...DEFAULT_CONFIG,
      activeMonth: month,
      seasonLabel: germanMonthLabel(month)
    },
    profiles,
    days
  };
}

function loadDemoDb() {
  const raw = localStorage.getItem(DEMO_DB_KEY);
  if (!raw) {
    const seed = makeDemoSeed();
    localStorage.setItem(DEMO_DB_KEY, JSON.stringify(seed));
    return seed;
  }
  try {
    return JSON.parse(raw);
  } catch {
    const seed = makeDemoSeed();
    localStorage.setItem(DEMO_DB_KEY, JSON.stringify(seed));
    return seed;
  }
}

function saveDemoDb(db) {
  localStorage.setItem(DEMO_DB_KEY, JSON.stringify(db));
  window.dispatchEvent(new CustomEvent(DEMO_EVENT));
}

function getDemoUid() {
  let uid = localStorage.getItem(DEMO_UID_KEY);
  if (!uid) {
    uid = `student-${crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2)}`;
    localStorage.setItem(DEMO_UID_KEY, uid);
  }
  return uid;
}

function snapshotDemo() {
  const db = loadDemoDb();
  return JSON.parse(JSON.stringify(db));
}

function notifyDemoSubscribers() {
  const state = snapshotDemo();
  demoSubscribers.forEach((cb) => cb(state));
}
window.addEventListener("storage", (event) => {
  if (event.key === DEMO_DB_KEY) notifyDemoSubscribers();
});
window.addEventListener(DEMO_EVENT, notifyDemoSubscribers);

async function createDemoService() {
  return {
    mode: "demo",
    async initStudentSession() {
      const uid = getDemoUid();
      return { uid, studentId: uid, isAnonymous: true };
    },
    async getProfile(studentId) {
      return loadDemoDb().profiles?.[studentId] || null;
    },
    async saveProfile(studentId, nickname) {
      const db = loadDemoDb();
      db.profiles ||= {};
      const existing = db.profiles[studentId];
      db.profiles[studentId] = { nickname: nickname.trim(), createdAt: existing?.createdAt || Date.now() };
      saveDemoDb(db);
      return db.profiles[studentId];
    },
    async ensureRecoveryCode() {
      return { code: null, isNew: false, demo: true };
    },
    async recoverWithCode() {
      throw new Error("Wiederherstellung ist nur im LIVE-Modus verfügbar.");
    },
    subscribeState(callback) {
      demoSubscribers.add(callback);
      callback(snapshotDemo());
      return () => demoSubscribers.delete(callback);
    },
    async saveToday(studentId, entry) {
      const db = loadDemoDb();
      db.days ||= {};
      db.days[studentId] ||= {};
      db.days[studentId][yyyyMmDd()] = { ...entry, updatedAt: Date.now() };
      saveDemoDb(db);
    },
    async resetLocalStudent() {
      localStorage.removeItem(DEMO_UID_KEY);
      location.reload();
    },
    async adminSignIn(email, password) {
      if (email.trim().toLowerCase() !== "lehrer@demo.de" || password !== "leseliga") {
        throw new Error("Demo-Zugang: lehrer@demo.de / leseliga");
      }
      return { uid: "demo-admin", email: "lehrer@demo.de" };
    },
    async adminSignOut() {},
    async adminSaveConfig(patch) {
      const db = loadDemoDb();
      db.config = { ...db.config, ...patch };
      saveDemoDb(db);
    },
    async adminUpsertDay(uid, date, entry) {
      const db = loadDemoDb();
      db.days ||= {};
      db.days[uid] ||= {};
      db.days[uid][date] = { ...entry, updatedAt: Date.now() };
      saveDemoDb(db);
    },
    async adminDeleteDay(uid, date) {
      const db = loadDemoDb();
      if (db.days?.[uid]?.[date]) delete db.days[uid][date];
      saveDemoDb(db);
    },
    async adminCreateRecoveryCode() {
      throw new Error("Wiederherstellungscodes sind nur im LIVE-Modus verfügbar.");
    },
    async resetDemoData() {
      localStorage.setItem(DEMO_DB_KEY, JSON.stringify(makeDemoSeed()));
      window.dispatchEvent(new CustomEvent(DEMO_EVENT));
    }
  };
}

async function createFirebaseService() {
  const [{ initializeApp }, authMod, dbMod] = await Promise.all([
    import(`https://www.gstatic.com/firebasejs/${SDK_VERSION}/firebase-app.js`),
    import(`https://www.gstatic.com/firebasejs/${SDK_VERSION}/firebase-auth.js`),
    import(`https://www.gstatic.com/firebasejs/${SDK_VERSION}/firebase-database.js`)
  ]);

  const app = initializeApp(FIREBASE_CONFIG);
  const auth = authMod.getAuth(app);
  const db = dbMod.getDatabase(app);

  async function ensureStudent() {
    if (auth.currentUser) return auth.currentUser;
    const cred = await authMod.signInAnonymously(auth);
    return cred.user;
  }

  async function createUniqueRecovery(studentId) {
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const code = makeRecoveryCode();
      const hash = await hashRecoveryCode(code);
      const mappingRef = dbMod.ref(db, `recovery/${hash}`);
      const existing = await dbMod.get(mappingRef);
      if (existing.exists()) continue;
      await dbMod.set(mappingRef, studentId);
      return { code, hash };
    }
    throw new Error("Es konnte kein eindeutiger Wiederherstellungscode erzeugt werden.");
  }

  return {
    mode: "firebase",
    async initStudentSession() {
      const user = await ensureStudent();
      let studentId = localStorage.getItem(STUDENT_ID_KEY) || user.uid;

      if (studentId !== user.uid) {
        try {
          const claimSnap = await dbMod.get(dbMod.ref(db, `claims/${studentId}/${user.uid}`));
          if (!claimSnap.exists()) {
            localStorage.removeItem(STUDENT_ID_KEY);
            localStorage.removeItem(RECOVERY_CODE_KEY);
            studentId = user.uid;
          }
        } catch {
          localStorage.removeItem(STUDENT_ID_KEY);
          localStorage.removeItem(RECOVERY_CODE_KEY);
          studentId = user.uid;
        }
      }

      localStorage.setItem(STUDENT_ID_KEY, studentId);
      return { uid: user.uid, studentId, isAnonymous: user.isAnonymous };
    },
    async getProfile(studentId) {
      const snap = await dbMod.get(dbMod.ref(db, `profiles/${studentId}`));
      return snap.exists() ? snap.val() : null;
    },
    async saveProfile(studentId, nickname) {
      const current = await this.getProfile(studentId);
      const profile = {
        nickname: nickname.trim(),
        createdAt: current?.createdAt || dbMod.serverTimestamp()
      };
      await dbMod.set(dbMod.ref(db, `profiles/${studentId}`), profile);
      return profile;
    },
    async ensureRecoveryCode(studentId) {
      const user = await ensureStudent();
      const activeRef = dbMod.ref(db, `recoveryByStudent/${studentId}`);
      const localCode = localStorage.getItem(RECOVERY_CODE_KEY);

      try {
        const activeSnap = await dbMod.get(activeRef);
        const activeHash = activeSnap.exists() ? activeSnap.val() : null;

        if (localCode) {
          const localHash = await hashRecoveryCode(localCode);
          if (activeHash === localHash) return { code: formatRecoveryCode(localCode), isNew: false };

          if (!activeHash && studentId === user.uid) {
            const mappingRef = dbMod.ref(db, `recovery/${localHash}`);
            const mappingSnap = await dbMod.get(mappingRef);
            if (!mappingSnap.exists()) await dbMod.set(mappingRef, studentId);
            else if (mappingSnap.val() !== studentId) throw new Error("Code-Kollision");
            await dbMod.set(activeRef, localHash);
            return { code: formatRecoveryCode(localCode), isNew: false };
          }
          localStorage.removeItem(RECOVERY_CODE_KEY);
        }

        if (activeHash) return { code: null, isNew: false, unavailable: true };
        if (studentId !== user.uid) return { code: null, isNew: false, unavailable: true };

        const created = await createUniqueRecovery(studentId);
        await dbMod.set(activeRef, created.hash);
        localStorage.setItem(RECOVERY_CODE_KEY, created.code);
        return { code: created.code, isNew: true };
      } catch (err) {
        return { code: localCode ? formatRecoveryCode(localCode) : null, isNew: false, pendingRules: true, error: err };
      }
    },
    async recoverWithCode(value) {
      const user = await ensureStudent();
      const code = formatRecoveryCode(value);
      if (!code) throw new Error("Bitte einen vollständigen Code im Format LIGA-XXXX-XXXX-XXXX-XXXX eingeben.");
      const hash = await hashRecoveryCode(code);

      let mappingSnap;
      try {
        mappingSnap = await dbMod.get(dbMod.ref(db, `recovery/${hash}`));
      } catch {
        throw new Error("Die Wiederherstellung ist in Firebase noch nicht freigeschaltet.");
      }
      if (!mappingSnap.exists()) throw new Error("Dieser Wiederherstellungscode wurde nicht gefunden.");

      const studentId = mappingSnap.val();
      const activeSnap = await dbMod.get(dbMod.ref(db, `recoveryByStudent/${studentId}`));
      if (!activeSnap.exists() || activeSnap.val() !== hash) {
        throw new Error("Dieser Wiederherstellungscode ist nicht mehr gültig. Bitte die Lehrkraft nach einem neuen Code fragen.");
      }

      if (studentId !== user.uid) {
        const claimRef = dbMod.ref(db, `claims/${studentId}/${user.uid}`);
        const claimSnap = await dbMod.get(claimRef);
        if (!claimSnap.exists()) await dbMod.set(claimRef, hash);
      }

      localStorage.setItem(STUDENT_ID_KEY, studentId);
      localStorage.setItem(RECOVERY_CODE_KEY, code);
      return { uid: user.uid, studentId, isAnonymous: user.isAnonymous };
    },
    subscribeState(callback) {
      const cache = { config: null, profiles: null, days: null };
      const emit = () => {
        if (cache.config && cache.profiles && cache.days) callback(JSON.parse(JSON.stringify(cache)));
      };
      const unsubs = [
        dbMod.onValue(dbMod.ref(db, "config"), (s) => { cache.config = { ...DEFAULT_CONFIG, ...(s.val() || {}) }; emit(); }),
        dbMod.onValue(dbMod.ref(db, "profiles"), (s) => { cache.profiles = s.val() || {}; emit(); }),
        dbMod.onValue(dbMod.ref(db, "days"), (s) => { cache.days = s.val() || {}; emit(); })
      ];
      return () => unsubs.forEach((u) => u());
    },
    async saveToday(studentId, entry) {
      await dbMod.set(dbMod.ref(db, `days/${studentId}/${yyyyMmDd()}`), {
        ...entry,
        updatedAt: dbMod.serverTimestamp()
      });
    },
    async resetLocalStudent() {
      localStorage.removeItem(STUDENT_ID_KEY);
      localStorage.removeItem(RECOVERY_CODE_KEY);
      await authMod.signOut(auth);
      location.reload();
    },
    async adminSignIn(email, password) {
      const cred = await authMod.signInWithEmailAndPassword(auth, email, password);
      const adminSnap = await dbMod.get(dbMod.ref(db, `admins/${cred.user.uid}`));
      if (!adminSnap.exists() || adminSnap.val() !== true) {
        await authMod.signOut(auth);
        throw new Error("Dieses Firebase-Konto ist nicht als Admin freigeschaltet.");
      }
      return cred.user;
    },
    async adminSignOut() {
      await authMod.signOut(auth);
    },
    async adminSaveConfig(patch) {
      await dbMod.update(dbMod.ref(db, "config"), patch);
    },
    async adminUpsertDay(uid, date, entry) {
      await dbMod.set(dbMod.ref(db, `days/${uid}/${date}`), {
        ...entry,
        updatedAt: dbMod.serverTimestamp()
      });
    },
    async adminDeleteDay(uid, date) {
      await dbMod.remove(dbMod.ref(db, `days/${uid}/${date}`));
    },
    async adminCreateRecoveryCode(studentId) {
      const activeRef = dbMod.ref(db, `recoveryByStudent/${studentId}`);
      const oldSnap = await dbMod.get(activeRef);
      const oldHash = oldSnap.exists() ? oldSnap.val() : null;
      const created = await createUniqueRecovery(studentId);
      await dbMod.set(activeRef, created.hash);
      if (oldHash && oldHash !== created.hash) {
        try { await dbMod.remove(dbMod.ref(db, `recovery/${oldHash}`)); } catch { /* active hash already invalidates the old code */ }
      }
      return created.code;
    },
    async resetDemoData() {
      throw new Error("Nur im Demo-Modus verfügbar.");
    }
  };
}

export async function createDataService() {
  return isFirebaseConfigured() ? createFirebaseService() : createDemoService();
}

export const dateUtils = { yyyyMm, yyyyMmDd, germanMonthLabel };
