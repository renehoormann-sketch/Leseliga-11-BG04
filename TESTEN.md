# Schnelltest

Die produktive Leseliga läuft ausschließlich mit Firebase; ein fest codierter Demo-Lehrerlogin ist deaktiviert.

## Schüleransicht testen

1. Live-Seite öffnen.
2. Nickname wählen bzw. vorhandenes Testprofil verwenden.
3. +1 oder +2 XP eintragen und Buch + Abschnitt ergänzen.
4. Optional Stoppuhr und Klassen-Bücherregal testen.
5. Präsentationsansicht in einem zweiten Tab öffnen und prüfen, ob Rangliste und Klassenziel aktualisiert werden.

## Lehrerbereich testen

1. `admin.html` öffnen.
2. Mit dem echten, in Firebase Authentication hinterlegten Administratorkonto anmelden.
3. Rangliste, Korrekturen, CSV, Wiederherstellung und Season-Steuerung prüfen.

## Sicherheitsregel

Keine Testpasswörter oder echten Zugangsdaten in Quellcode, README oder Testanleitungen eintragen. Für Tests ausschließlich das Firebase-Administratorkonto oder getrennte, nicht im Repository gespeicherte Testkonten verwenden.
