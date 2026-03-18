#!/usr/bin/env bash
# Installs Ceol V1 as a macOS login item using launchd.
# V1 is always run from a dedicated directory (~/Documents/Ceol-V1) locked to
# the V1 branch, so V2 development in the main folder never affects startup.
#
# Run this once: bash install-autostart-mac.sh
# After that, Ceol V1 starts automatically at login.
set -euo pipefail

V1_BRANCH="claude/trad-music-web-app-fwneF"
REPO_URL="https://github.com/glenachulish/Ceol.git"
V1_DIR="$HOME/Documents/Ceol-V1"
PLIST_NAME="com.ceol.app"
PLIST_DEST="$HOME/Library/LaunchAgents/${PLIST_NAME}.plist"
LOG_DIR="$HOME/Library/Logs/Ceol"

echo "=== Ceol V1 Autostart Setup ==="
echo ""

# --- Set up / update the V1 directory ---
if [ -d "$V1_DIR/.git" ]; then
    echo "Updating V1 directory at $V1_DIR ..."
    git -C "$V1_DIR" fetch origin "$V1_BRANCH"
    git -C "$V1_DIR" checkout "$V1_BRANCH"
    git -C "$V1_DIR" pull origin "$V1_BRANCH"
else
    echo "Cloning V1 branch into $V1_DIR ..."
    git clone --branch "$V1_BRANCH" --single-branch "$REPO_URL" "$V1_DIR"
fi

# --- Install Python dependencies in V1 venv ---
if [ ! -f "$V1_DIR/.venv/bin/uvicorn" ]; then
    echo "Creating virtual environment and installing dependencies ..."
    python3 -m venv "$V1_DIR/.venv"
    "$V1_DIR/.venv/bin/pip" install --quiet -r "$V1_DIR/requirements.txt"
fi
UVICORN="$V1_DIR/.venv/bin/uvicorn"

mkdir -p "$LOG_DIR"

# --- Write the launchd plist ---
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
    <string>${V1_DIR}</string>

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
echo "✓ Ceol V1 is now locked to branch: $V1_BRANCH"
echo "✓ Running from: $V1_DIR"
echo "✓ Will start automatically at every login."
echo "✓ Running now at http://localhost:8000"
echo ""
echo "Your V2 development in 'Ceol Github' is completely separate and"
echo "will never affect what runs on startup."
echo ""
echo "Useful commands:"
echo "  Stop:    launchctl unload ~/Library/LaunchAgents/${PLIST_NAME}.plist"
echo "  Start:   launchctl load   ~/Library/LaunchAgents/${PLIST_NAME}.plist"
echo "  Logs:    tail -f ${LOG_DIR}/ceol.log"
echo "  Errors:  tail -f ${LOG_DIR}/ceol-error.log"
