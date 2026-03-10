#!/usr/bin/env bash
set -euo pipefail

STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
OUT_DIR="${1:-backups/local/${STAMP}}"

mkdir -p "${OUT_DIR}"

FILES=(
  "questions.json"
  "comments.json"
  "events.json"
  "initiatives.json"
  "people.json"
  "member_login_tokens.json"
  "member_login_outbox.json"
)

for file in "${FILES[@]}"; do
  cp "data/${file}" "${OUT_DIR}/${file}"
  echo "-> ${file}"
done

cat > "${OUT_DIR}/manifest.json" <<MANIFEST
{
  "createdAt": "${STAMP}",
  "source": "local-data-dir",
  "files": [
    "questions.json",
    "comments.json",
    "events.json",
    "initiatives.json",
    "people.json",
    "member_login_tokens.json",
    "member_login_outbox.json"
  ]
}
MANIFEST

(
  cd "${OUT_DIR}"
  shasum -a 256 *.json > SHA256SUMS
)

echo "Lokales Backup fertig: ${OUT_DIR}"
