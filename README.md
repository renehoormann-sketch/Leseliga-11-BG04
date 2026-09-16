# 📚 Leseliga 11BG04

Web-App für die Leseliga der Klasse 11BG04 mit GitHub Pages und Firebase.

## Funktionen

- Nicknames statt Klarnamen
- 1 XP für mindestens 20 Minuten, 2 XP für mindestens 40 Minuten
- maximal 2 XP pro Kalendertag
- Season-Rangliste und Klassenziel
- beendete Bücher, Buchbewertungen und Klassen-Bücherregal
- persönliche Streaks, Wochenvergleich und Badges
- Präsentationsansicht
- Lehrerbereich mit Korrekturen, Plausibilitäts-Hinweisen, CSV und Season-Archiv
- Wiederherstellungscodes für Schülerkonten

## Live-Betrieb

Die produktive App verwendet Firebase Authentication und Firebase Realtime Database.

- Schüler:innen: anonyme Firebase-Anmeldung
- Lehrkraft: Firebase Email/Password + Freigabe der UID unter `admins`
- Lehrer-Zugangsdaten werden **nicht** im Repository gespeichert.
- Der frühere fest codierte Demo-Lehrerlogin wurde aus Sicherheitsgründen entfernt.

## Firebase

### Authentication

Unter **Authentication → Sign-in method**:

- Anonymous aktivieren
- Email/Password für das Lehrerkonto aktivieren

### Realtime Database

Die Regeln aus `firebase-database.rules.json` in **Realtime Database → Rules** übernehmen und veröffentlichen.

### Web-Konfiguration

Die Firebase-Web-Konfiguration liegt in `config.js`. Diese Client-Konfiguration ist kein Passwort; der eigentliche Schutz erfolgt über Authentication und die Realtime-Database-Regeln.

### Adminfreigabe

Die UID des Firebase-Lehrerkontos unter folgendem Pfad freigeben:

```text
admins
  DEINE_FIREBASE_UID: true
```

## Sicherheit

**Keine Passwörter, privaten API-Schlüssel, Service-Account-JSONs, `.env`-Dateien oder privaten Schlüssel in dieses Repository committen.**

Das Lehrerkonto wird ausschließlich über Firebase Authentication geprüft. Falls ein Secret-Scanner einen Fund meldet, zuerst prüfen, ob es sich um ein echtes Geheimnis handelt. Ein tatsächlich veröffentlichtes Passwort oder Token muss beim jeweiligen Dienst sofort ersetzt werden; bloßes Löschen aus der aktuellen Datei reicht nicht aus.

Weitere Hinweise stehen in `SECURITY.md`.

## Datenschutz / Schule

Die App verwendet Nicknames. Detaillierte Leseeinträge sollen nur der jeweiligen Person und der Lehrkraft zugänglich sein; für Rangliste und Klassenansichten werden getrennte, datensparsame Wertungsdaten verwendet. Vor dem schulischen Einsatz sollten die schulischen Datenschutzvorgaben für Firebase und GitHub Pages geprüft werden.
