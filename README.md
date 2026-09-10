# 📚 Leseliga 11 – Testversion

Eine kleine, GitHub-Pages-taugliche Web-App für einen Lesewettbewerb in einer Schulklasse.

## Was die Testversion kann

- Schüler:innen wählen einen Nickname.
- Sie tragen **selbstständig +1 XP (20 min) oder +2 XP (40+ min)** ein.
- Pro Kalendertag existiert genau ein Eintrag und maximal 2 XP.
- Buch + Seiten/Kapitel werden als kurzer Leselog gespeichert.
- Live-Rangliste mit Podium.
- Gemeinsames Klassenziel.
- Persönliche Monats-XP, Platzierung und Lesestreak.
- Präsentationsansicht für Beamer/Display.
- Lehrerbereich mit Monatswechsel, Korrektur, Löschen und CSV-Export.
- Monatswechsel löscht alte Daten **nicht**; die aktive Runde wird nur über `activeMonth` gewechselt.

## Sofort testen – ohne Firebase

Solange `config.js` keine Firebase-Zugangsdaten enthält, startet die Seite automatisch im **DEMO-Modus**.

Am einfachsten lokal:

```bash
python3 -m http.server 8000
```

Danach im Browser öffnen:

- Schüleransicht: `http://localhost:8000/`
- Präsentation: `http://localhost:8000/presentation.html`
- Lehrerbereich: `http://localhost:8000/admin.html`

Demo-Lehrerlogin:

- E-Mail: `lehrer@demo.de`
- Passwort: `leseliga`

Die Demo-Daten liegen nur im `localStorage` des Browsers. Öffne Schüleransicht und Präsentation in zwei Tabs: Änderungen erscheinen direkt in beiden Ansichten.

## GitHub Pages testen

1. Neues GitHub-Repository erstellen, z. B. `leseliga-11`.
2. Alle Dateien dieses Ordners in das Repository hochladen.
3. GitHub → **Settings → Pages**.
4. Unter *Build and deployment* `Deploy from a branch` wählen.
5. Branch `main`, Ordner `/ (root)` wählen und speichern.
6. Nach der Veröffentlichung die angezeigte GitHub-Pages-Adresse öffnen.

Im Demo-Modus synchronisieren sich Tabs/Geräte **nicht über verschiedene Geräte hinweg**. Für die echte Klasse folgt Firebase.

## Firebase für echten Live-Betrieb einrichten

### 1. Projekt anlegen

In der Firebase Console ein Projekt erstellen und darin eine **Web App** anlegen.

### 2. Authentication aktivieren

Authentication → Sign-in method:

- **Anonymous** aktivieren (Schüler:innen)
- **Email/Password** aktivieren (Lehrkraft)

### 3. Realtime Database anlegen

Realtime Database erstellen. Für eine deutsche Schule ist eine EU-nahe Datenbankregion sinnvoll, soweit in deinem Firebase-Projekt angeboten.

Danach die Regeln aus `firebase.rules.json` in **Realtime Database → Rules** übernehmen und veröffentlichen.

### 4. Web-Konfiguration eintragen

Firebase zeigt dir ein Objekt ähnlich diesem:

```js
const firebaseConfig = {
  apiKey: "...",
  authDomain: "...",
  databaseURL: "...",
  projectId: "...",
  storageBucket: "...",
  messagingSenderId: "...",
  appId: "..."
};
```

Die Werte in `config.js` bei `FIREBASE_CONFIG` eintragen. Nach dem nächsten GitHub-Pages-Deploy zeigt die App automatisch **LIVE** statt **DEMO**.

Wichtig: Die Firebase-Web-Konfiguration ist **kein geheimes Passwort**. Der Schutz erfolgt über Authentication + Database Security Rules.

### 5. Lehrer-Konto erstellen

In Firebase → Authentication → Users ein E-Mail/Passwort-Konto für dich erstellen.

Die UID dieses Kontos kopieren.

Dann in der Realtime Database einmal manuell folgenden Datensatz anlegen:

```text
admins
  DEINE_FIREBASE_UID: true
```

Die Security Rules erlauben anschließend genau diesem Konto den Adminzugriff.

### 6. Startkonfiguration in der Datenbank

Unter `config` diese Werte anlegen:

```json
{
  "className": "LESELIGA 11",
  "seasonLabel": "September 2026",
  "activeMonth": "2026-09",
  "goalXp": 180,
  "raffleXp": 8,
  "maxDailyXp": 2,
  "minutesPerXp": 20
}
```

Danach kann alles Weitere im Lehrerbereich verändert werden.

## Wichtiger Hinweis zur anonymen Anmeldung

Firebase Anonymous Auth merkt sich den Schüler auf demselben Browser/Gerät. Werden Browserdaten gelöscht oder wird das Gerät gewechselt, entsteht ein neues anonymes Konto.

Für eine erste Klassenrunde ist das einfach und datensparsam. Für Version 2 wäre sinnvoll:

- Wiederherstellungscode pro Schüler oder
- schulischer SSO/Login.

## Datenschutz / Schule

Die App ist bewusst auf Nicknames ausgelegt. Trotzdem sollte vor dem echten Einsatz geprüft werden, ob Firebase/GitHub Pages mit den schulischen Datenschutzvorgaben und ggf. einem AV-Vertrag vereinbar sind. Die Testversion ersetzt keine schulische Datenschutzfreigabe.
