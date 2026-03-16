#!/usr/bin/env bash
set -euo pipefail

if ! command -v doctl >/dev/null 2>&1; then
  echo "doctl is not installed or not on PATH."
  exit 1
fi

echo "doctl version:"
doctl version

echo
echo "Auth status:"
doctl auth list || true

echo
echo "Visible apps:"
doctl apps list || true

echo
echo "Managed databases:"
doctl databases list || true

echo
echo "Spaces buckets (if permission allows):"
doctl compute cdn list || true

echo
echo "DigitalOcean checks completed."
