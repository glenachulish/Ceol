#!/usr/bin/env python3
"""
Export the v1 Ceol database into a ZIP file that v3's library import accepts.

Run from anywhere on your Mac:
    python3 export_v1_for_v3.py

The output file (ceol-v1-export-<date>.zip) can then be uploaded via
Settings → Library → Import in the v3 app.

Adjust V1_DB below if your v1 database is in a different location.
"""

import argparse
import io
import json
import re
import sqlite3
import zipfile
from datetime import date
from pathlib import Path

_parser = argparse.ArgumentParser()
_parser.add_argument("--db", type=Path, default=Path("/Users/callummaclellan/Ceol/v1/data/ceol.db"))
_args, _ = _parser.parse_known_args()

V1_DB = _args.db
OUT   = Path(f"ceol-v1-export-{date.today().isoformat()}.zip")


# ── Helpers ───────────────────────────────────────────────────────────────────

def clean_abc(abc_text: str) -> tuple[str, str | None]:
    """Strip %%thecraic: metadata block from ABC; return (clean_abc, source_url)."""
    if not abc_text or "%%thecraic:" not in abc_text:
        return abc_text, None

    source_url = None
    m = re.search(r"%%thecraic:sourceurl=(.+)", abc_text)
    if m:
        source_url = m.group(1).strip()

    lines = abc_text.splitlines()
    clean, in_meta = [], False
    for line in lines:
        stripped = line.strip()
        if stripped == "%%thecraic:starttunemetadata":
            in_meta = True
            continue
        if stripped == "%%thecraic:endtunemetadata":
            in_meta = False
            continue
        if not in_meta:
            clean.append(line)

    return "\n".join(clean).strip(), source_url


def rows_as_dicts(conn: sqlite3.Connection, table: str) -> list[dict]:
    try:
        rows = conn.execute(f"SELECT * FROM {table}").fetchall()
        return [dict(r) for r in rows]
    except Exception:
        return []


# ── Main ──────────────────────────────────────────────────────────────────────

def main() -> None:
    if not V1_DB.exists():
        print(f"ERROR: v1 database not found at {V1_DB}")
        print("Edit V1_DB at the top of this script and try again.")
        return

    conn = sqlite3.connect(V1_DB)
    conn.row_factory = sqlite3.Row

    data: dict = {}

    # ── tunes (add source_url, clean TheCraic metadata from ABC) ─────────────
    tunes_raw = conn.execute("""
        SELECT id, craic_id, session_id, title, type, key, mode, abc, notes,
               imported_at, created_at, updated_at,
               parent_id, version_label, rating, on_hitlist
        FROM tunes ORDER BY id
    """).fetchall()

    tunes_out = []
    for t in tunes_raw:
        clean_ab, source_url = clean_abc(t["abc"])
        tunes_out.append({
            "id":            t["id"],
            "craic_id":      t["craic_id"],
            "session_id":    t["session_id"],
            "title":         t["title"],
            "type":          t["type"],
            "key":           t["key"],
            "mode":          t["mode"],
            "abc":           clean_ab,
            "notes":         t["notes"] or None,
            "source_url":    source_url,
            "imported_at":   t["imported_at"],
            "created_at":    t["created_at"],
            "updated_at":    t["updated_at"],
            "parent_id":     t["parent_id"],
            "version_label": t["version_label"] or "",
            "rating":        t["rating"] or 0,
            "on_hitlist":    t["on_hitlist"] or 0,
        })
    data["tunes"] = tunes_out
    print(f"  tunes:          {len(tunes_out)}")

    # ── remaining tables copied as-is ─────────────────────────────────────────
    for table in ["tune_aliases", "tags", "tune_tags", "sets", "set_tunes",
                  "achievements", "note_documents", "note_attachments",
                  "app_settings"]:
        rows = rows_as_dicts(conn, table)
        data[table] = rows
        print(f"  {table:<20} {len(rows)}")

    # theory_notes didn't exist in v1 — leave empty so v3 import won't error
    data["theory_notes"] = []

    conn.close()

    # ── write ZIP ─────────────────────────────────────────────────────────────
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr("library.json", json.dumps(data, indent=2, default=str))
    buf.seek(0)

    OUT.write_bytes(buf.read())
    print(f"\nWrote {OUT}  ({OUT.stat().st_size // 1024} KB)")
    print("Upload this file via Settings → Library → Import in the v3 app.")


if __name__ == "__main__":
    main()
