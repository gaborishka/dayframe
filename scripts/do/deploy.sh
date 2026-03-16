#!/usr/bin/env bash
set -euo pipefail

if ! command -v doctl >/dev/null 2>&1; then
  echo "doctl is not installed or not on PATH."
  exit 1
fi

if [ -z "${DO_APP_DATABASE_URL:-}" ]; then
  DO_APP_DATABASE_URL="$(doctl databases list -o json | node -e "let d=''; process.stdin.on('data', c => d += c); process.stdin.on('end', () => { const rows = JSON.parse(d); const match = rows.find((row) => row.name === 'dayframe-db' && row.status === 'online'); if (!match?.connection?.uri) process.exit(1); process.stdout.write(match.connection.uri); });")"
  export DO_APP_DATABASE_URL
fi

if [ -z "${DO_APP_DATABASE_URL:-}" ]; then
  echo "No online managed database URI is available for App Platform deployment."
  exit 1
fi

tmp_spec="$(mktemp)"
trap 'rm -f "$tmp_spec"' EXIT

node ./scripts/do/render-app-spec.mjs > "$tmp_spec"

echo "Validating rendered App Platform spec..."
doctl apps spec validate "$tmp_spec"

echo
echo "Creating or updating DayFrame on App Platform..."
set +e
output="$(doctl apps create --upsert --spec "$tmp_spec" 2>&1)"
status=$?
set -e

printf "%s\n" "$output"

if [ "$status" -ne 0 ]; then
  if printf "%s" "$output" | grep -q "GitHub user not authenticated"; then
    echo
    echo "DigitalOcean App Platform cannot access the configured GitHub source yet."
    echo "Connect GitHub to the DigitalOcean account or switch the app spec to an image-based deployment source."
  fi
  exit "$status"
fi
