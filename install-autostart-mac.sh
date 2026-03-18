#!/usr/bin/env bash
# Installs Ceol as a macOS login item using launchd.
# Run this once: bash install-autostart-mac.sh
# After that, Ceol starts automatically at login.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PLIST_NAME="com.ceol.app"
PLIST_DEST="$HOME/Library/LaunchAgents/${PLIST_NAME}.plist"
LOG_DIR="$HOME/Library/Logs/Ceol"
GUI_UID="gui/$(id -u)"

# Find uvicorn — prefer the project venv
if [ -f "$SCRIPT_DIR/.venv/bin/uvicorn" ]; then
    UVICORN="$SCRIPT_DIR/.venv/bin/uvicorn"
    VENV_BIN="$SCRIPT_DIR/.venv/bin"
elif command -v uvicorn &>/dev/null; then
    UVICORN="$(command -v uvicorn)"
    VENV_BIN="$(dirname "$UVICORN")"
else
    echo "Error: uvicorn not found. Run: pip install uvicorn from the project directory."
    exit 1
fi

# Build PATH: venv/bin + standard system paths launchd omits
LAUNCH_PATH="${VENV_BIN}:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"

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

    <key>EnvironmentVariables</key>
    <dict>
        <key>PATH</key>
        <string>${LAUNCH_PATH}</string>
        <key>PYTHONPATH</key>
        <string>${SCRIPT_DIR}</string>
        <key>PYTHONUNBUFFERED</key>
        <string>1</string>
    </dict>

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

# launchd requires 644 permissions on the plist
chmod 644 "$PLIST_DEST"

# Unregister first if already registered (ignore errors)
launchctl bootout "${GUI_UID}" "$PLIST_DEST" 2>/dev/null || true

# Register with launchd (modern API, works on macOS 10.10+)
launchctl bootstrap "${GUI_UID}" "$PLIST_DEST"

echo ""
echo "Ceol will now start automatically at login."
echo "Running now at http://localhost:8000"
echo ""
echo "Useful commands:"
echo "  Stop:    launchctl bootout  ${GUI_UID} ~/Library/LaunchAgents/${PLIST_NAME}.plist"
echo "  Start:   launchctl bootstrap ${GUI_UID} ~/Library/LaunchAgents/${PLIST_NAME}.plist"
echo "  Status:  launchctl print ${GUI_UID}/${PLIST_NAME}"
echo "  Logs:    tail -f ${LOG_DIR}/ceol.log"
echo "  Errors:  tail -f ${LOG_DIR}/ceol-error.log"
