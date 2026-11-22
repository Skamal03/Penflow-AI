#!/usr/bin/env bash
# Run INSIDE WSL Kali. Starts ZAP headless on port 8080, reachable from Windows too.
# Needs ZAP_API_KEY (env var, or a line ZAP_API_KEY=... in the repo's .env).
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
KEY="${ZAP_API_KEY:-$(grep -E '^ZAP_API_KEY=' "$ROOT/.env" 2>/dev/null | head -1 | cut -d= -f2- | tr -d '\r"')}"
BIND="${ZAP_BIND:-0.0.0.0}"

if [ -z "$KEY" ]; then
  echo "ERROR: ZAP_API_KEY is not set. Add a line to $ROOT/.env, e.g.  ZAP_API_KEY=$(openssl rand -hex 16)"
  exit 1
fi

# Prefer the official ZAP download (includes the scan rules); fall back to Kali's zaproxy.
if [ -z "${ZAP_BIN:-}" ]; then
  if [ -x "$HOME/ZAP_2.17.0/zap.sh" ]; then ZAP_BIN="$HOME/ZAP_2.17.0/zap.sh"; else ZAP_BIN=zaproxy; fi
fi

echo "Starting $ZAP_BIN on $BIND:8080 (API key required)"
exec "$ZAP_BIN" -daemon -dir "$HOME/.ZAP_penflow" -host "$BIND" -port 8080 \
  -config "api.key=$KEY" \
  -config api.addrs.addr.name=.* \
  -config api.addrs.addr.regex=true
