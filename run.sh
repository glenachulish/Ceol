#!/usr/bin/env bash
# Start the Ceol web server.
# Accessible from desktop and mobile on the same local network.
set -euo pipefail

cd "$(dirname "$0")"

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
