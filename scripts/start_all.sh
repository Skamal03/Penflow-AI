#!/usr/bin/env bash
# PenflowAI: start the tools the engine needs. Run inside Kali (WSL).
# Juice Shop is started manually (Docker Desktop).
#
# Usage:
#   bash scripts/start_all.sh                 # start what is not running
#   bash scripts/start_all.sh --restart-zap   # kill ZAP, then start fresh
#
# Notes:
# - If you get "bad interpreter" or \r errors, fix line endings with:
#   sed -i 's/\r$//' scripts/start_all.sh
# - To add another tool later: add a section like the ZAP one below.

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ZAP_URL="http://127.0.0.1:8080"

up() { [ "$(curl -s -o /dev/null -m 3 -w '%{http_code}' "$1")" != "000" ]; }

wait_for() { # url, name, seconds
  for _ in $(seq 1 "$3"); do
    up "$1" && { echo "[OK] $2 is up"; return 0; }
    sleep 1
  done
  echo "[FAIL] $2 did not start in $3s"; return 1
}

# --- ZAP ---
if [ "$1" = "--restart-zap" ]; then
  echo "[..] Stopping ZAP"
  pkill -f zap.sh 2>/dev/null
  pkill -f 'zap-.*\.jar' 2>/dev/null
  sleep 5
fi

if up "$ZAP_URL"; then
  echo "[OK] ZAP already running"
else
  echo "[..] Starting ZAP"
  cd "$ROOT" || exit 1
  nohup bash scripts/start_zap.sh > ~/zap.log 2>&1 &
  wait_for "$ZAP_URL" "ZAP" 90 || echo "    Check: tail ~/zap.log"
fi

echo
echo "Ready. Run: cd core && python main.py --target http://127.0.0.1:3000 --only zap"
