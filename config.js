// LESLIGA Konfiguration
// Solange diese Werte leer bleiben, läuft die App automatisch im DEMO-MODUS.
// Für den Live-Betrieb mit 30 Schüler:innen trägst du hier später die Firebase-Web-Konfiguration ein.

export const FIREBASE_CONFIG = {
  apiKey: "",
  authDomain: "",
  databaseURL: "",
  projectId: "",
  storageBucket: "",
  messagingSenderId: "",
  appId: ""
};

export const DEFAULT_CONFIG = {
  className: "LESELIGA 11",
  seasonLabel: "September 2026",
  activeMonth: "2026-09",
  goalXp: 180,
  raffleXp: 8,
  maxDailyXp: 2,
  minutesPerXp: 20
};

export const isFirebaseConfigured = () => {
  const required = ["apiKey", "authDomain", "databaseURL", "projectId", "appId"];
  return required.every((key) => typeof FIREBASE_CONFIG[key] === "string" && FIREBASE_CONFIG[key].trim().length > 0);
};
