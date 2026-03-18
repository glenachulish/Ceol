#!/usr/bin/env bash
# Snapshot the Ceol database to a named backup file.
# Usage:
#   bash backup-db.sh v1        → data/ceol-v1.db
#   bash backup-db.sh           → data/ceol-<date>.db
set -euo pipefail

cd "$(dirname "$0")"
DB="data/ceol.db"

if [ ! -f "$DB" ]; then
    echo "Error: $DB not found."
    exit 1
fi

LABEL="${1:-$(date +%Y-%m-%d)}"
DEST="data/ceol-${LABEL}.db"

cp "$DB" "$DEST"
echo "Saved: $DEST"
