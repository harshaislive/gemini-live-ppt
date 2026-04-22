#!/usr/bin/env bash
set -euo pipefail

cleanup() {
  true
}

trap cleanup EXIT INT TERM

cd /app/client
exec npm run start -- -H 0.0.0.0 -p "${PORT:-3000}"
