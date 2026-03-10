#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:-https://public-secrets.onrender.com}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
OUT_DIR="${1:-backups/live/${STAMP}}"

mkdir -p "${OUT_DIR}"

fetch_json() {
  local name="$1"
  local path="$2"
  local out_file="${OUT_DIR}/${name}.json"
  echo "-> ${name} (${path})"
  curl -fsS "${BASE_URL}${path}" -o "${out_file}"
}

fetch_json "questions" "/api/questions"
fetch_json "comments" "/api/comments"
fetch_json "events" "/api/events"
fetch_json "initiatives" "/api/initiatives"
fetch_json "people" "/api/people"

cat > "${OUT_DIR}/manifest.json" <<MANIFEST
{
  "createdAt": "${STAMP}",
  "source": "${BASE_URL}",
  "files": [
    "questions.json",
    "comments.json",
    "events.json",
    "initiatives.json",
    "people.json"
  ]
}
MANIFEST

(
  cd "${OUT_DIR}"
  shasum -a 256 *.json > SHA256SUMS
)

echo "Backup fertig: ${OUT_DIR}"
echo "Pruefsummen: ${OUT_DIR}/SHA256SUMS"
