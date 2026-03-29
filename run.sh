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

# Claude AI transcription (optional — enables "AI Transcribe" button)
# Get a key at https://console.anthropic.com
ANTHROPIC_API_KEY=

# Audiveris local OMR (optional — enables "Audiveris" transcription button)
# Download from https://github.com/Audiveris/audiveris/releases
# Example (Apple Silicon Mac):
# AUDIVERIS_JAR=/Applications/Audiveris.app/Contents/app/Audiveris.jar
AUDIVERIS_JAR=
ENVEOF
  echo "Created .env — edit it to add your ANTHROPIC_API_KEY and/or AUDIVERIS_JAR path."
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
