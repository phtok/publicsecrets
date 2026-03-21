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

fetch_json_optional() {
  local name="$1"
  local path="$2"
  local out_file="${OUT_DIR}/${name}.json"
  echo "-> ${name} (${path})"
  if ! curl -fsS "${BASE_URL}${path}" -o "${out_file}"; then
    rm -f "${out_file}"
    echo "   optional endpoint nicht verfuegbar"
    return
  fi
}

fetch_json "questions" "/api/questions"
fetch_json "comments" "/api/comments"
fetch_json "events" "/api/events"
fetch_json "initiatives" "/api/initiatives"
fetch_json "people" "/api/people"
fetch_json_optional "site_settings" "/api/site-settings"

FILES=(
  "questions.json"
  "comments.json"
  "events.json"
  "initiatives.json"
  "people.json"
)

if [ -f "${OUT_DIR}/site_settings.json" ]; then
  FILES+=("site_settings.json")
fi

{
  printf '{\n'
  printf '  "createdAt": "%s",\n' "${STAMP}"
  printf '  "source": "%s",\n' "${BASE_URL}"
  printf '  "files": [\n'
  last_index=$((${#FILES[@]} - 1))
  for i in "${!FILES[@]}"; do
    suffix=","
    if [ "${i}" -eq "${last_index}" ]; then
      suffix=""
    fi
    printf '    "%s"%s\n' "${FILES[$i]}" "${suffix}"
  done
  printf '  ]\n'
  printf '}\n'
} > "${OUT_DIR}/manifest.json"

(
  cd "${OUT_DIR}"
  shasum -a 256 *.json > SHA256SUMS
)

echo "Backup fertig: ${OUT_DIR}"
echo "Pruefsummen: ${OUT_DIR}/SHA256SUMS"
