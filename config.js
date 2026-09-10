// LESELIGA Konfiguration
// Solange die databaseURL leer bleibt, läuft die App automatisch im DEMO-MODUS.
// Nach dem Anlegen der Firebase Realtime Database wird nur noch die databaseURL ergänzt.

export const FIREBASE_CONFIG = {
  apiKey: "AIzaSyDjsTFiGJ7fRtCl-NV6EST-O7l_y8mvHVM",
  authDomain: "leseliga-11-bg04.firebaseapp.com",
  databaseURL: "",
  projectId: "leseliga-11-bg04",
  storageBucket: "leseliga-11-bg04.firebasestorage.app",
  messagingSenderId: "20873221853",
  appId: "1:20873221853:web:76e515699ec3b056c7ed34"
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
