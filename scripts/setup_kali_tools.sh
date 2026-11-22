#!/usr/bin/env bash
# Run INSIDE WSL Kali:  bash scripts/setup_kali_tools.sh
# Installs each tool separately so one failure doesn't stop the rest.
set -u

PACKAGES=(nmap whatweb wafw00f nikto sqlmap ffuf dirb wordlists nuclei zaproxy python3-venv python3-pip curl)

sudo apt update
for pkg in "${PACKAGES[@]}"; do
  echo "=== installing $pkg ==="
  sudo apt install -y "$pkg" || echo "!!! FAILED: $pkg"
done

command -v nuclei >/dev/null && nuclei -update-templates || echo "!!! nuclei templates not updated"

# Python venv for the engine (run from the repo root)
if [ -f core/requirements.txt ]; then
  python3 -m venv .venv
  ./.venv/bin/pip install -r core/requirements.txt
  echo "Venv ready: source .venv/bin/activate"
fi

echo
echo "Done. Verify with:  cd core && python check_tools.py"
