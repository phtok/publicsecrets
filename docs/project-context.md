# Public Secrets Projektkontext

Stand: 2026-03-19

Diese Datei buendelt die wesentlichen Entscheidungen und den relevanten Projektkontext aus den archivierten Codex-Threads sowie aus dem aktuellen Repo-Stand. Sie ist die Arbeitsgrundlage fuer weitere Entwicklung in diesem Repository.

## Kanonischer Arbeitsort
- Seit 2026-03-10 ist `/Users/philipptok/publicsecrets` das zentrale Repo fuer die Website.
- Der aktuelle Stand wurde aus dem frueheren Monorepo-Kontext `goeloggen/public-secrete` uebernommen.
- Die konzeptionellen und produktiven Entscheidungen aus den archivierten Threads gelten weiter, sofern sie nicht spaeter im Repo explizit geaendert werden.

## Produktkern
- Ausgangspunkt war die Idee "Public Secrets - Die Frage": einzelne Fragen gross praesentieren, bewerten, kommentieren und in einer fortlaufenden Dramaturgie erfahrbar machen.
- Daraus ist eine vollere Ensemble-Website geworden mit den oeffentlichen Bereichen `Menschen`, `Fragen`, `Initiativen` und `Momente`.
- Die Seite ist nicht nur Archiv, sondern redaktionell gepflegte Arbeitsoberflaeche fuer Fragen, Veranstaltungen, Initiativen und Mitgliederprofile.

## Wichtige Entscheidungen aus den archivierten Threads
- Kein schweres Framework: das Projekt laeuft als schlanke Node-Anwendung mit statischen Dateien plus eigener JSON-API.
- Persistenz liegt aktuell in JSON-Dateien unter `data/`; laut aktuellem Entscheidungsprotokoll ist das eine Zwischenstufe vor Datenbank-Migration.
- Deployment-Ziel fuer den produktiven Betrieb ist Render; `Dockerfile` und `render.yaml` sind darauf ausgelegt.
- Daten muessen vor groesseren Aenderungen und vor Deployments gesichert werden; dafuer gibt es lokale Backup-/Restore-Skripte.
- Es gibt zwei Haupt-Backends:
  - Redaktion unter `/admin.html`
  - Mitgliederbereich unter `/member-area.html`
- Mitglieder-Login wurde iterativ erweitert:
  - Magic-Link Login per Token
  - optionaler E-Mail-Versand via Resend
  - Fallback-Outbox, falls kein Mailversand konfiguriert ist
  - Passwort-Login
  - `mustChangePassword` fuer Erstlogins
- Login-Alias-Mapping ist vorgesehen, damit mehrere Mailadressen auf dasselbe Mitglied zeigen koennen.
- Ein konkreter uebernommener Sonderfall ist der Alias `philipp@anderzeit.com` -> `philipp-tok`.
- Bildpflege wurde um Uploads und Portrait-Fokuswerte erweitert, damit Ensemble-Bilder im Frontend sauber ausgeschnitten werden koennen.

## Aktueller technischer Stand im Repo
- Oeffentliche App: `index.html`, `app.js`, `styles.css`
- Redaktion: `admin.html`, `admin.js`
- Mitglieder-Login: `login.html`, `login.js`
- Mitgliederbereich: `member-area.html`, `member-area.js`
- Backend/API: `server.js`
- Render-Deployment: `Dockerfile`, `render.yaml`
- Sicherung und Ruecksicherung: `scripts/backup_live_data.sh`, `scripts/backup_local_data.sh`, `scripts/restore_backup_to_data.sh`

## Datenbestand im aktuellen Stand
Lokaler Stand aus den JSON-Dateien am 2026-03-10:

- 28 Fragen
- 36 Veranstaltungen
- 11 Initiativen
- 32 Mitglieder
- 3 Kommentare

Diese Zahlen sind keine Produktvorgabe, sondern nur ein Snapshot des aktuell importierten Datenbestands.

## Betriebsannahmen
- Standard-Editor-Login im aktuellen Code: `philipp@saetzerei.com` / `public-secrets-123`
- Weitere Editor-Logins koennen ueber `PUBLIC_SECRETE_EDITORS` gesetzt werden.
- Render-Datenpersistenz wird ueber `PUBLIC_SECRETE_DATA_DIR` gesteuert.
- Fuer Magic-Link Versand werden `RESEND_API_KEY` und `PUBLIC_SECRETE_FROM_EMAIL` erwartet.
- Ohne Mail-Konfiguration schreibt das System Login-Links in `data/member_login_outbox.json`.

## Was bei kuenftigen Aenderungen mitgedacht werden sollte
- `data/` ist der eigentliche Inhalt der Anwendung; Schema-Aenderungen brauchen Migrationsdisziplin.
- Sitzungen werden inzwischen in `data/sessions.json` persistiert und bei Aktivitaet fuer Mitglieder verlaengert.
- Die JSON-basierte Architektur ist bewusst einfach, aber nicht fuer komplexe Mehrbenutzer- oder Revisionslogik optimiert.
- Backup vor Deploy bleibt Pflicht, nicht Option.
- Konzeption und aktuelle UI sind nicht deckungsgleich: das Ursprungskonzept "Die Frage" bleibt wichtig, aber die aktuelle Site-Architektur ist breiter.

## Offene Linien aus bisherigen Threads
- Staging-Umgebung und sauberer Restore-Test wurden als naechste Betriebsstufe benannt.
- Die Datenbank-Migration ist beschlossen, aber noch nicht umgesetzt; Reihenfolge laut Entscheidungslog: Backups, Admin-Export/Import, danach Migration.
- Export/Import fuer Admin und robustere Moderation wurden mehrfach als sinnvolle Ausbaustufe angelegt.
- Das Repo enthaelt nur sehr wenig automatisierte Absicherung; Aenderungen sollten deshalb lokal bewusst durchgeklickt werden.

## Referenzdokumente
- Entscheidungsprotokoll: `docs/decision-log.md`
- Produktkonzept: `docs/public-secrets-web-konzept.md`
- Betrieb und Sicherung: `docs/ops-and-roadmap.md`
- Hauptuebersicht: `README.md`
