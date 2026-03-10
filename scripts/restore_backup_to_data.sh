#!/usr/bin/env bash
set -euo pipefail

if [ "$#" -lt 1 ]; then
  echo "Usage: $0 <backup_dir> [target_data_dir]"
  exit 1
fi

BACKUP_DIR="$1"
TARGET_DATA_DIR="${2:-data}"

REQUIRED_FILES=(
  "questions.json"
  "comments.json"
  "events.json"
  "initiatives.json"
  "people.json"
)

for file in "${REQUIRED_FILES[@]}"; do
  if [ ! -f "${BACKUP_DIR}/${file}" ]; then
    echo "Fehlt im Backup: ${BACKUP_DIR}/${file}"
    exit 1
  fi
done

mkdir -p "${TARGET_DATA_DIR}"

# JSON-Validierung vor dem Ueberschreiben
for file in "${REQUIRED_FILES[@]}"; do
  node -e "JSON.parse(require('fs').readFileSync(process.argv[1], 'utf8'));" "${BACKUP_DIR}/${file}"
done

for file in "${REQUIRED_FILES[@]}"; do
  cp "${BACKUP_DIR}/${file}" "${TARGET_DATA_DIR}/${file}"
  echo "Restored: ${TARGET_DATA_DIR}/${file}"
done

echo "Restore fertig."
