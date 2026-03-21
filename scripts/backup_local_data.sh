#!/usr/bin/env bash
set -euo pipefail

STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
OUT_DIR="${1:-backups/local/${STAMP}}"

mkdir -p "${OUT_DIR}"

REQUIRED_FILES=(
  "questions.json"
  "comments.json"
  "events.json"
  "initiatives.json"
  "people.json"
  "member_login_tokens.json"
  "member_login_outbox.json"
)

OPTIONAL_FILES=(
  "site_settings.json"
  "deleted_items.json"
  "sessions.json"
)

COPIED_FILES=()

for file in "${REQUIRED_FILES[@]}"; do
  cp "data/${file}" "${OUT_DIR}/${file}"
  echo "-> ${file}"
  COPIED_FILES+=("${file}")
done

for file in "${OPTIONAL_FILES[@]}"; do
  if [ ! -f "data/${file}" ]; then
    continue
  fi
  cp "data/${file}" "${OUT_DIR}/${file}"
  echo "-> ${file}"
  COPIED_FILES+=("${file}")
done

{
  printf '{\n'
  printf '  "createdAt": "%s",\n' "${STAMP}"
  printf '  "source": "local-data-dir",\n'
  printf '  "files": [\n'
  last_index=$((${#COPIED_FILES[@]} - 1))
  for i in "${!COPIED_FILES[@]}"; do
    suffix=","
    if [ "${i}" -eq "${last_index}" ]; then
      suffix=""
    fi
    printf '    "%s"%s\n' "${COPIED_FILES[$i]}" "${suffix}"
  done
  printf '  ]\n'
  printf '}\n'
} > "${OUT_DIR}/manifest.json"

(
  cd "${OUT_DIR}"
  shasum -a 256 *.json > SHA256SUMS
)

echo "Lokales Backup fertig: ${OUT_DIR}"
