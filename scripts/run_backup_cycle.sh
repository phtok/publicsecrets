#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
KEEP_DAYS="${KEEP_DAYS:-30}"
SKIP_LOCAL="${SKIP_LOCAL:-0}"
SKIP_LIVE="${SKIP_LIVE:-0}"

cd "${ROOT_DIR}"

run_local_backup() {
  if [ "${SKIP_LOCAL}" = "1" ]; then
    echo "Lokales Backup uebersprungen."
    return
  fi
  ./scripts/backup_local_data.sh
}

run_live_backup() {
  if [ "${SKIP_LIVE}" = "1" ]; then
    echo "Live-Backup uebersprungen."
    return
  fi
  ./scripts/backup_live_data.sh
}

prune_old_backups() {
  local dir="$1"
  if [ ! -d "${dir}" ]; then
    return
  fi
  find "${dir}" -mindepth 1 -maxdepth 1 -type d -mtime +"${KEEP_DAYS}" -print -exec rm -rf {} +
}

run_local_backup
run_live_backup

prune_old_backups "${ROOT_DIR}/backups/local"
prune_old_backups "${ROOT_DIR}/backups/live"

echo "Backup-Zyklus abgeschlossen."
