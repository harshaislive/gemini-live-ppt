#!/usr/bin/env bash
set -euo pipefail

cleanup() {
  if [[ -n "${AGENT_PID:-}" ]]; then
    kill "${AGENT_PID}" 2>/dev/null || true
    wait "${AGENT_PID}" 2>/dev/null || true
  fi
}

trap cleanup EXIT INT TERM

cd /app/server
/app/server/.venv/bin/python agent.py start &
AGENT_PID=$!

cd /app/client
exec npm run start -- -H 0.0.0.0 -p "${PORT:-3000}"
