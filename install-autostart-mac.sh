#!/usr/bin/env bash
# Installs Ceol as a macOS login item using launchd.
# Run this once: bash install-autostart-mac.sh
# After that, Ceol starts automatically at login.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PLIST_NAME="com.ceol.app"
PLIST_DEST="$HOME/Library/LaunchAgents/${PLIST_NAME}.plist"
LOG_DIR="$HOME/Library/Logs/Ceol"

# Find uvicorn — prefer the project venv
if [ -f "$SCRIPT_DIR/.venv/bin/uvicorn" ]; then
    UVICORN="$SCRIPT_DIR/.venv/bin/uvicorn"
elif command -v uvicorn &>/dev/null; then
    UVICORN="$(command -v uvicorn)"
else
    echo "Error: uvicorn not found. Run: pip install uvicorn from the project directory."
    exit 1
fi

mkdir -p "$LOG_DIR"

cat > "$PLIST_DEST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>${PLIST_NAME}</string>

    <key>ProgramArguments</key>
    <array>
        <string>${UVICORN}</string>
        <string>backend.main:app</string>
        <string>--host</string>
        <string>0.0.0.0</string>
        <string>--port</string>
        <string>8000</string>
    </array>

    <key>WorkingDirectory</key>
    <string>${SCRIPT_DIR}</string>

    <key>RunAtLoad</key>
    <true/>

    <key>KeepAlive</key>
    <true/>

    <key>StandardOutPath</key>
    <string>${LOG_DIR}/ceol.log</string>

    <key>StandardErrorPath</key>
    <string>${LOG_DIR}/ceol-error.log</string>
</dict>
</plist>
EOF

# Unload first if already registered (ignore errors)
launchctl unload "$PLIST_DEST" 2>/dev/null || true
launchctl load "$PLIST_DEST"

echo ""
echo "✓ Ceol will now start automatically at login."
echo "✓ Running now at http://localhost:8000"
echo ""
echo "Useful commands:"
echo "  Stop:    launchctl unload ~/Library/LaunchAgents/${PLIST_NAME}.plist"
echo "  Start:   launchctl load   ~/Library/LaunchAgents/${PLIST_NAME}.plist"
echo "  Logs:    tail -f ${LOG_DIR}/ceol.log"
