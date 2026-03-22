#!/usr/bin/env bash
# Build Ceol.app and wrap it in a .dmg for macOS distribution.
# Run this script from the repo root:  bash desktop/build-mac.sh
#
# Requirements:
#   pip install -r requirements.txt -r desktop/requirements.txt
#   brew install create-dmg          ← for the final .dmg step

set -euo pipefail
cd "$(dirname "$0")"   # run from desktop/

echo "==> Installing / updating Python dependencies…"
pip install -q -r ../requirements.txt -r requirements.txt

echo "==> Running PyInstaller…"
pyinstaller ceol-mac.spec --noconfirm

APP="dist/Ceol.app"
DMG="dist/Ceol-macOS.dmg"

if [ ! -d "$APP" ]; then
  echo "ERROR: build failed — $APP not found." >&2
  exit 1
fi

echo "==> Built: $APP"

# ── Create .dmg (requires `brew install create-dmg`) ─────────────────────────
if command -v create-dmg &>/dev/null; then
  echo "==> Creating .dmg…"
  rm -f "$DMG"
  create-dmg \
    --volname "Ceol" \
    --window-pos 200 120 \
    --window-size 600 400 \
    --icon-size 128 \
    --icon "Ceol.app" 175 190 \
    --hide-extension "Ceol.app" \
    --app-drop-link 425 190 \
    "$DMG" \
    "dist/"
  echo "==> Done!  Distributable: $DMG"
else
  echo ""
  echo "NOTE: create-dmg not found — skipping .dmg creation."
  echo "      Install it with:  brew install create-dmg"
  echo "      Or distribute the .app bundle directly from: $APP"
  echo ""
  echo "==> Done!  App bundle: $APP"
fi

echo ""
echo "────────────────────────────────────────────────────"
echo " To open on a Mac showing a security warning:"
echo "   Right-click the app → Open → click Open again."
echo "────────────────────────────────────────────────────"
