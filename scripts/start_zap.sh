#!/usr/bin/env bash
# Run INSIDE WSL Kali. Starts ZAP headless with its API on 127.0.0.1:8080.
# Local lab only: API key is disabled. Set ZAP_API_KEY and remove api.disablekey if you change that.
exec zaproxy -daemon -host 127.0.0.1 -port 8080 -config api.disablekey=true
