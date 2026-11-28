#!/usr/bin/env bash
# =====================================================================
# PenflowAI: start the tools the engine needs. Run inside Kali (WSL).
#
# HOW TO RUN :
#   1. Start Docker Desktop and the Juice Shop containers.
#   2. Open Kali and type:  penflow
#   3. Wait for "[OK] ZAP is up", then run the engine from PowerShell.
#
# MANUAL RUN:
#   cd "/mnt/e/PENFLOW AI"
#   bash scripts/start_all.sh                 # start what is not running
#   bash scripts/start_all.sh --restart-zap   # kill ZAP, then start fresh
#
# IF YOU SEE $'\r' or "bad interpreter" ERRORS:
#   The file has Windows line endings. Fix once with:
#   find scripts -name "*.sh" -exec sed -i 's/\r$//' {} +
#   (The penflow alias already does this on every start.)
#   Prevent it: VS Code setting files.eol = \n, and a .gitattributes
#   file with the line:  *.sh text eol=lf
#
# TO ADD ANOTHER TOOL LATER: add a section like the ZAP one below.
# =====================================================================

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ZAP_URL="http://127.0.0.1:8080"

up() { [ "$(curl -s -o /dev/null -m 3 -w '%{http_code}' "$1")" != "000" ]; }

wait_for() { # url, name, seconds
  for _ in $(seq 1 "$3"); do
    up "$1" && { echo "[OK] $2 is up"; return 0; }
    sleep 1
  done
  echo "[FAIL] $2 did not start in $3s"
  return 1
}

# --- Juice Shop targets (check only, started from Docker Desktop) ---
for port in 3000 3001 3002; do
  if up "http://127.0.0.1:$port"; then
    echo "[OK] Juice Shop on port $port"
  else
    echo "[WARN] Nothing on port $port (start the container if you need it)"
  fi
done

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
echo "Ready. Now run the engine from PowerShell:"
echo "  cd \"E:\\PENFLOW AI\\core\""
echo "  .venv\\Scripts\\Activate.ps1"
echo "  python main.py --run-id <RUN_ID>"