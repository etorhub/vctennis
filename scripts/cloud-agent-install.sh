#!/usr/bin/env bash
# Cloud Agent bootstrap: install deps and ensure a local .env exists for `dev:local`.
# Idempotent — safe to re-run. Only used by the Cursor Cloud Agent environment.
set -euo pipefail

cd "$(dirname "$0")/.."

npm install

# `dev:local` uses a local SQLite file DB (no Turso needed) but Better Auth still
# needs a signing secret and public URL. Seed a gitignored .env if missing/blank.
if [ ! -f .env ]; then
  cp .env.example .env
fi

ensure_var() {
  local key="$1" value="$2"
  if grep -qE "^${key}=\"?.+\"?$" .env && ! grep -qE "^${key}=\"\"$" .env; then
    return 0
  fi
  if grep -qE "^${key}=" .env; then
    # Replace blank/empty assignment in place.
    node -e "const fs=require('fs');const k=process.argv[1],v=process.argv[2];let s=fs.readFileSync('.env','utf8');s=s.replace(new RegExp('^'+k+'=.*$','m'),k+'=\"'+v+'\"');fs.writeFileSync('.env',s);" "$key" "$value"
  else
    printf '%s="%s"\n' "$key" "$value" >> .env
  fi
}

ensure_var BETTER_AUTH_SECRET "$(openssl rand -base64 32)"
ensure_var BETTER_AUTH_URL "http://localhost:4321"

echo "Cloud Agent install complete."
