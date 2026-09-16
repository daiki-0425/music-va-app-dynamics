#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
if [[ ! -x .venv/bin/python || ! -d frontend/node_modules ]]; then
  echo '先に make setup を実行してください。'
  exit 1
fi
backend_pid=''
frontend_pid=''
cleanup() {
  if [[ -n "$backend_pid" ]]; then kill "$backend_pid" 2>/dev/null || true; fi
  if [[ -n "$frontend_pid" ]]; then kill "$frontend_pid" 2>/dev/null || true; fi
}
trap cleanup EXIT INT TERM
.venv/bin/uvicorn app.main:app --app-dir backend --host 127.0.0.1 --port 8000 --reload --env-file .env &
backend_pid=$!
npm --prefix frontend run dev &
frontend_pid=$!
wait -n "$backend_pid" "$frontend_pid"
