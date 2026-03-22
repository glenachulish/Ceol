#!/usr/bin/env bash
# Start the Ceol web server.
# Accessible from desktop and mobile on the same local network.
set -euo pipefail

cd "$(dirname "$0")"

# Load .env if it exists (e.g. ANTHROPIC_API_KEY=sk-ant-...)
if [ -f .env ]; then
  set -o allexport
  # shellcheck disable=SC1091
  source .env
  set +o allexport
fi

# Create a template .env if none exists
if [ ! -f .env ]; then
  cat > .env <<'ENVEOF'
# Ceol environment variables
# Paste your Anthropic API key below to enable the "Transcribe to ABC" feature.
# Get a key at https://console.anthropic.com
ANTHROPIC_API_KEY=
ENVEOF
  echo "Created .env — add your ANTHROPIC_API_KEY there to enable ABC transcription."
fi

# Install / update Python dependencies silently
python3 -m pip install -q -r requirements.txt

HOST="${HOST:-0.0.0.0}"   # bind to all interfaces so mobile can reach it
PORT="${PORT:-8001}"

echo "Starting Ceol on http://${HOST}:${PORT}"
echo "  → Local:   http://localhost:${PORT}"
# Print LAN IP for mobile access
LAN_IP=$(python3 -c "
import socket
s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
s.connect(('8.8.8.8', 80))
print(s.getsockname()[0])
s.close()
" 2>/dev/null || echo "check your IP manually")
echo "  → Network: http://${LAN_IP}:${PORT}"

exec uvicorn backend.main:app --host "$HOST" --port "$PORT" --reload
