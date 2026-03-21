# Backup-Automation

Stand: 2026-03-11

## Ziel
- lokales Backup der aktuellen JSON-Daten
- optional zusaetzlich Live-Backup der produktiven API
- automatische Bereinigung alter Sicherungen

## Script
- Einstiegspunkt: `scripts/run_backup_cycle.sh`

Das Script fuehrt standardmaessig aus:
- `./scripts/backup_local_data.sh`
- `./scripts/backup_live_data.sh`
- Bereinigung alter Ordner in `backups/local` und `backups/live`

Im lokalen Backup sind auch betriebliche JSON-Dateien enthalten, unter anderem:
- `site_settings.json`
- `deleted_items.json`
- `sessions.json`

## Wichtige Umgebungsvariablen
- `KEEP_DAYS`
  - Standard: `30`
  - loescht Sicherungen, die aelter sind als die angegebene Zahl Tage
- `SKIP_LOCAL=1`
  - ueberspringt das lokale Backup
- `SKIP_LIVE=1`
  - ueberspringt das Live-Backup
- `BASE_URL`
  - Ziel fuer `backup_live_data.sh`

## Manueller Test

```bash
cd /Users/philipptok/publicsecrets
./scripts/run_backup_cycle.sh
```

## Empfohlene Automation
- taeglich in der Nacht ausfuehren
- Erfolg oder Fehler samt erzeugter Backup-Pfade protokollieren
- Workspace: `/Users/philipptok/publicsecrets`
