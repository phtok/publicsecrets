# Public Secrets - Betrieb, Sicherung, Migration

## Ziel
Die Daten aus dem Prototyp muessen erhalten bleiben und in kuenftige Versionen migrierbar sein.

## Backup-Standard (ab sofort)
Vor jedem Deploy und mindestens 1x pro Woche:

```bash
cd /path/to/publicsecrets
./scripts/backup_live_data.sh
```

Zusaetzlich den lokalen Entwicklungsstand sichern:

```bash
./scripts/backup_local_data.sh
```

Optional anderer Zielordner:

```bash
./scripts/backup_live_data.sh backups/live/manual-YYYYMMDD
```

Backups liegen in `backups/live/<timestamp>/` mit:
- `questions.json`
- `comments.json`
- `events.json`
- `initiatives.json`
- `people.json`
- `manifest.json`
- `SHA256SUMS`

## Restore (Notfall)
```bash
cd /path/to/publicsecrets
./scripts/restore_backup_to_data.sh backups/live/<timestamp>
```

Dann Service neu starten/deployen.

## Migrationsregel fuer kuenftige Versionen
1. JSON-Backup ziehen.
2. Struktur-/Schema-Aenderung nur ueber explizite Migrationsskripte.
3. Migration zuerst auf Staging testen.
4. Produktionsmigration erst mit verifiziertem Backup und Rollback-Pfad.
5. Nach Migration erneut Backup erzeugen.

## Naechste Schritte (Prioritaet)
1. Staging-Umgebung anlegen (eigene Render-Service-URL).
2. Export/Import-Endpunkte fuer Admin ergaenzen (ein Klick Backup/Restore).
3. Datenbank-Migration planen: JSON -> Postgres (stabil fuer 7+ Jahre Wachstum).
4. Schema versionieren (`schema_version`) und idempotente Migrationsskripte einführen.
5. Automatisierte Backups einrichten (taeglich) und extern speichern (z. B. GitHub private repo oder S3-kompatibel).
6. Monitoring/Alerting fuer 5xx-Fehler aktivieren.

## Erinnerung/Arbeitsrhythmus
- Bei jeder groesseren Aenderung: erst Backup, dann Deploy.
- Woechentlich: Backup-Pruefung + kurzer Restore-Test auf Staging.
