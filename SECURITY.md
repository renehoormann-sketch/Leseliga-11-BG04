# Sicherheit

## Keine Geheimnisse im Repository

Dieses Repository ist öffentlich. Deshalb dürfen hier niemals gespeichert werden:

- Passwörter
- private API-Schlüssel oder Tokens
- Firebase-Service-Account-Dateien
- private Schlüssel oder Zertifikate
- `.env`-Dateien mit Zugangsdaten
- Wiederherstellungscodes von Schüler:innen

Die Firebase-Web-Konfiguration in `config.js` ist Client-Konfiguration und wird durch Authentication und Realtime-Database-Regeln abgesichert. Sie ersetzt keine sicheren Datenbankregeln.

## Lehrerzugang

Der Lehrerbereich verwendet ausschließlich Firebase Authentication. Das Passwort gehört nur in Firebase bzw. in einen Passwortmanager und niemals in HTML, JavaScript, Markdown oder GitHub-Issues.

## Wenn ein Secret-Scanner anschlägt

1. Fundstelle prüfen, ohne das Secret weiterzuverbreiten.
2. Bei einem echten Passwort oder Token: zuerst beim betroffenen Dienst rotieren bzw. ändern.
3. Danach den Fund aus dem aktuellen Code entfernen.
4. Falls das Secret echt war, zusätzlich die Git-Historie bereinigen bzw. das Secret als kompromittiert behandeln.
5. Bei einem nachweislichen Platzhalter/False Positive den Fund beim Scanner entsprechend kennzeichnen.

## Änderungen an Firebase-Regeln

Datenschutz- oder Berechtigungsänderungen immer zuerst auf Syntax und Zugriffslogik prüfen. Schüler dürfen keine fremden detaillierten Leseprotokolle lesen oder verändern; Adminrechte werden ausschließlich über die freigegebene Firebase-UID vergeben.
