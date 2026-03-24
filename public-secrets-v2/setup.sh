#!/bin/bash
set -e
cd "$(dirname "$0")"

# .env anlegen falls nicht vorhanden
if [ ! -f .env ]; then
  SECRET=$(openssl rand -hex 32)
  cat > .env <<EOF
PORT=3000
JWT_SECRET=$SECRET
RESEND_API_KEY=re_HIER_DEINEN_KEY_EINTRAGEN
FROM_EMAIL=hallo@publicsecrets.app
BASE_URL=http://localhost:3000
DB_PATH=publicsecrets.db
EOF
  echo "✓ .env angelegt (bitte RESEND_API_KEY eintragen)"
fi

# Abhängigkeiten
npm install --silent

# Datenbank seeden falls noch keine da
EXPORT="$HOME/publicsecrets_outside/exports/all-data-export-2026-03-24.json"
if [ ! -f publicsecrets.db ] && [ -f "$EXPORT" ]; then
  node seed.js "$EXPORT"
fi

echo ""
echo "▶  http://localhost:3000"
echo ""
node server.js
