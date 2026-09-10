import { FIREBASE_CONFIG, DEFAULT_CONFIG, isFirebaseConfigured } from "./config.js";

const SDK_VERSION = "12.18.0";
const DEMO_DB_KEY = "leseliga_demo_db_v2";
const DEMO_UID_KEY = "leseliga_demo_uid_v2";
const DEMO_EVENT = "leseliga-demo-change";
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
      return { uid: getDemoUid(), isAnonymous: true };
    },
    async getProfile(uid) {
      return loadDemoDb().profiles?.[uid] || null;
    },
    async saveProfile(uid, nickname) {
      const db = loadDemoDb();
      db.profiles ||= {};
      const existing = db.profiles[uid];
      db.profiles[uid] = { nickname: nickname.trim(), createdAt: existing?.createdAt || Date.now() };
      saveDemoDb(db);
      return db.profiles[uid];
    },
    subscribeState(callback) {
      demoSubscribers.add(callback);
      callback(snapshotDemo());
      return () => demoSubscribers.delete(callback);
    },
    async saveToday(uid, entry) {
      const db = loadDemoDb();
      db.days ||= {};
      db.days[uid] ||= {};
      db.days[uid][yyyyMmDd()] = { ...entry, updatedAt: Date.now() };
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

  return {
    mode: "firebase",
    async initStudentSession() {
      const user = await ensureStudent();
      return { uid: user.uid, isAnonymous: user.isAnonymous };
    },
    async getProfile(uid) {
      const snap = await dbMod.get(dbMod.ref(db, `profiles/${uid}`));
      return snap.exists() ? snap.val() : null;
    },
    async saveProfile(uid, nickname) {
      const current = await this.getProfile(uid);
      const profile = {
        nickname: nickname.trim(),
        createdAt: current?.createdAt || dbMod.serverTimestamp()
      };
      await dbMod.set(dbMod.ref(db, `profiles/${uid}`), profile);
      return profile;
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
    async saveToday(uid, entry) {
      await dbMod.set(dbMod.ref(db, `days/${uid}/${yyyyMmDd()}`), {
        ...entry,
        updatedAt: dbMod.serverTimestamp()
      });
    },
    async resetLocalStudent() {
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
    async resetDemoData() {
      throw new Error("Nur im Demo-Modus verfügbar.");
    }
  };
}

export async function createDataService() {
  return isFirebaseConfigured() ? createFirebaseService() : createDemoService();
}

export const dateUtils = { yyyyMm, yyyyMmDd, germanMonthLabel };
