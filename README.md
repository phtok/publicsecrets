# Public Secrets

Schlankes Webprojekt fuer **"Public Secrets (Die Frage)"** mit Frontend und leichtgewichtigem Backend.

## Funktionen
- Fragenansicht mit 1-5 Sternebewertung und Kommentar (eindeutig pro Browser + Frage, jederzeit änderbar)
- Ansichten: Beliebteste, Chronologisch, Interaktionen, Nach Autoren
- Veranstaltungen aus Backend-Daten
- Initiativen aus Backend-Daten
- Ensemble mit Portraits und Kurzviten
- Eigene Seiten je Ensemble-Mitglied unter `members/*.html` (Fragen, Initiativen, Veranstaltungen)
- Redaktionsbereich mit Login (`/admin.html`)
- Mitgliederbereich mit Magic Link, Passwort-Login und Fallback-Outbox (`/login.html`, `/member-area.html`)
- CRUD fuer Fragen, Veranstaltungen, Initiativen und Mitglieder
- Globaler Not-Aus fuer Kommentare und Antworten durch Nichtmitglieder

## Projektkontext
- Historischer Kontext und uebernommene Entscheidungen: `docs/project-context.md`
- Ursprungskonzept: `docs/public-secrets-web-konzept.md`
- Betrieb, Backup, Migration: `docs/ops-and-roadmap.md`

## Start

```bash
cd /path/to/publicsecrets
./bin/node server.js
```

Dann im Browser:
- Webseite: <http://127.0.0.1:8787>
- Redaktion: <http://127.0.0.1:8787/admin.html>

## Online veröffentlichen (am einfachsten)
GitHub Pages reicht hier nicht, weil das Projekt ein Backend mit Login und schreibbaren Daten hat.

Einfachster Weg: **GitHub + Render** (Konfiguration liegt schon bereit: `Dockerfile`, `render.yaml`).

1. Projekt nach GitHub pushen
2. Bei Render: "New +" -> "Blueprint"
3. GitHub-Repo verbinden
4. Render liest `render.yaml` automatisch und erstellt die Web-App
5. Nach dem Deploy bekommst du direkt einen öffentlichen Link wie `https://public-secrets.onrender.com`

Wichtig fuer Persistenz auf Render:
- Bei `Docker`-Services ist der Standard-Datenpfad im Container `/app/data`.
- Du kannst den Pfad per Env-Variable setzen: `PUBLIC_SECRETE_DATA_DIR`.
- Falls deine Disk schon auf einem anderen Mount-Pfad haengt (z. B. `/opt/render/project/src/public-secrets/data`), setze `PUBLIC_SECRETE_DATA_DIR` genau auf diesen Pfad.
- Ohne gesetzte Variable versucht der Server auf Render automatisch zuerst `/opt/render/project/src/public-secrets/data`, danach `/app/data`.

## Backup & Restore
Live-Daten sichern:

```bash
cd /path/to/publicsecrets
./scripts/backup_live_data.sh
```

Lokalen Datenstand sichern:

```bash
./scripts/backup_local_data.sh
```

Beides automatisiert in einem Lauf:

```bash
./scripts/run_backup_cycle.sh
```

Backup zurueckspielen (Notfall):

```bash
./scripts/restore_backup_to_data.sh backups/live/<timestamp>
```

Mehr Details und Langfrist-Plan:
- `docs/ops-and-roadmap.md`
- `docs/backup-automation.md`

Lokale Backups liegen absichtlich ausserhalb von Git:
- `backups/`

## Login (MVP)
Standard-Zugang:
- Benutzername: `philipp@saetzerei.com`
- Passwort: `public-secrets-123`

Eigene Redakteure per Umgebungsvariable setzen:

```bash
export PUBLIC_SECRETE_EDITORS='[{"username":"redaktion","password":"dein-passwort"}]'
./bin/node server.js
```

## Node Installation (lokal im Projekt)
- Wrapper im Projekt:
  - `./bin/node`
  - `./bin/npm`
- Die Wrapper suchen zuerst `PUBLIC_SECRETS_NODE_BIN` bzw. `PUBLIC_SECRETS_NPM_BIN`, dann gaengige lokale Pfade.
- Wenn du ein eigenes Node-Binary nutzen willst:

```bash
export PUBLIC_SECRETS_NODE_BIN=/pfad/zu/node
export PUBLIC_SECRETS_NPM_BIN=/pfad/zu/npm
./bin/node server.js
```

## API (Kurz)
- `POST /api/auth/login`
- `POST /api/auth/logout`
- `GET /api/auth/me`
- `GET /api/questions`
- `POST /api/questions` (auth)
- `PUT /api/questions/:id` (auth)
- `DELETE /api/questions/:id` (auth)
- `GET /api/people`
- `POST /api/people` (auth)
- `PUT /api/people/:slug` (auth)
- `DELETE /api/people/:slug` (auth)
- `GET /api/events`
- `POST /api/events` (auth)
- `PUT /api/events/:id` (auth)
- `DELETE /api/events/:id` (auth)
- `GET /api/initiatives`
- `POST /api/initiatives` (auth)
- `PUT /api/initiatives/:id` (auth)
- `DELETE /api/initiatives/:id` (auth)
- `POST /api/member/auth/request`
- `POST /api/member/auth/password-login`
- `POST /api/member/auth/verify`
- `POST /api/member/auth/logout`
- `GET /api/member/auth/me`
- `GET /api/member/auth/outbox` (auth)
- `GET/PUT /api/site-settings` (`PUT` auth)
- `GET/PUT /api/member/profile`
- `GET/POST/PUT/DELETE /api/member/questions` (eigene)
- `GET/POST/PUT/DELETE /api/member/events` (eigene)
- `GET/POST/PUT/DELETE /api/member/initiatives` (eigene)

## Struktur
- `server.js` - Node HTTP-Server, API, Session-Auth, statische Dateien
- `index.html`, `app.js`, `styles.css` - Oeffentliche Webseite
- `admin.html`, `admin.js` - Redaktionsoberflaeche
- `login.html`, `login.js` - Mitglieder-Login (Magic Link + Passwort)
- `member-area.html`, `member-area.js` - Eigener Mitgliederbereich
- `data/*.json` - Persistenz fuer Inhalte, Sessions, Papierkorb und Site-Einstellungen
