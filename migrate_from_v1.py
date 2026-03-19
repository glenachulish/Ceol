#!/usr/bin/env python3
"""
Migrate Ceol v1 data into v3.

Run this on your Mac, from the Ceol Github directory:
    python3 migrate_from_v1.py

Adjust V1_DB and V3_DB paths below if needed.
"""

import re
import sqlite3
from pathlib import Path

V1_DB = Path("/Users/callummaclellan/Ceol/v1/data/ceol.db")
V3_DB = Path("/Users/callummaclellan/Documents/Ceol Github/data/ceol.db")


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


def migrate():
    if not V1_DB.exists():
        print(f"ERROR: v1 database not found at {V1_DB}")
        return
    if not V3_DB.exists():
        print(f"ERROR: v3 database not found at {V3_DB}")
        print("Start the v3 app once first so it creates the database, then re-run.")
        return

    src = sqlite3.connect(V1_DB)
    src.row_factory = sqlite3.Row
    dst = sqlite3.connect(V3_DB)
    dst.row_factory = sqlite3.Row
    dst.execute("PRAGMA foreign_keys = OFF")

    # ── Check target is empty ────────────────────────────────────────────────
    existing = dst.execute("SELECT COUNT(*) FROM tunes").fetchone()[0]
    if existing > 0:
        print(f"WARNING: v3 database already has {existing} tunes.")
        answer = input("Continue and APPEND (may create duplicates)? [y/N] ").strip().lower()
        if answer != "y":
            print("Aborted.")
            return

    # ── 1. Tunes (two passes for parent_id) ─────────────────────────────────
    tunes = src.execute("""
        SELECT id, craic_id, session_id, title, type, key, mode, abc, notes,
               imported_at, created_at, updated_at,
               parent_id, version_label, rating, on_hitlist
        FROM tunes ORDER BY id
    """).fetchall()

    tune_id_map: dict[int, int] = {}

    print(f"Migrating {len(tunes)} tunes…")
    for t in tunes:
        clean_ab, source_url = clean_abc(t["abc"])

        notes = t["notes"] or ""
        if source_url:
            prefix = f"Source: {source_url}"
            notes = f"{prefix}\n\n{notes}".strip() if notes else prefix

        cur = dst.execute(
            """INSERT INTO tunes
               (craic_id, session_id, title, type, key, mode, abc, notes,
                imported_at, created_at, updated_at, version_label, rating, on_hitlist)
               VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
            (
                t["craic_id"], t["session_id"], t["title"], t["type"],
                t["key"], t["mode"], clean_ab, notes or None,
                t["imported_at"], t["created_at"], t["updated_at"],
                t["version_label"] or "", t["rating"] or 0, t["on_hitlist"] or 0,
            ),
        )
        tune_id_map[t["id"]] = cur.lastrowid

    # Pass 2: fix parent_ids
    for t in tunes:
        if t["parent_id"] is not None:
            new_parent = tune_id_map.get(t["parent_id"])
            if new_parent:
                dst.execute(
                    "UPDATE tunes SET parent_id=? WHERE id=?",
                    (new_parent, tune_id_map[t["id"]]),
                )

    # ── 2. Tune aliases ──────────────────────────────────────────────────────
    aliases = src.execute("SELECT tune_id, alias FROM tune_aliases").fetchall()
    print(f"Migrating {len(aliases)} tune aliases…")
    for row in aliases:
        new_id = tune_id_map.get(row["tune_id"])
        if new_id:
            dst.execute(
                "INSERT INTO tune_aliases (tune_id, alias) VALUES (?,?)",
                (new_id, row["alias"]),
            )

    # ── 3. Tags and tune_tags ────────────────────────────────────────────────
    tag_id_map: dict[int, int] = {}
    for row in src.execute("SELECT id, name FROM tags"):
        cur = dst.execute("INSERT OR IGNORE INTO tags (name) VALUES (?)", (row["name"],))
        if cur.lastrowid:
            tag_id_map[row["id"]] = cur.lastrowid
        else:
            existing_tag = dst.execute(
                "SELECT id FROM tags WHERE name=?", (row["name"],)
            ).fetchone()
            tag_id_map[row["id"]] = existing_tag["id"]

    tune_tags = src.execute("SELECT tune_id, tag_id FROM tune_tags").fetchall()
    print(f"Migrating {len(tune_tags)} tune tags…")
    for row in tune_tags:
        new_tune = tune_id_map.get(row["tune_id"])
        new_tag = tag_id_map.get(row["tag_id"])
        if new_tune and new_tag:
            dst.execute(
                "INSERT OR IGNORE INTO tune_tags (tune_id, tag_id) VALUES (?,?)",
                (new_tune, new_tag),
            )

    # ── 4. Sets and set_tunes ────────────────────────────────────────────────
    sets = src.execute("SELECT id, name, notes, created_at FROM sets").fetchall()
    print(f"Migrating {len(sets)} sets…")
    set_id_map: dict[int, int] = {}
    for row in sets:
        cur = dst.execute(
            "INSERT INTO sets (name, notes, created_at) VALUES (?,?,?)",
            (row["name"], row["notes"], row["created_at"]),
        )
        set_id_map[row["id"]] = cur.lastrowid

    for row in src.execute("SELECT set_id, tune_id, position, key_override FROM set_tunes"):
        new_set = set_id_map.get(row["set_id"])
        new_tune = tune_id_map.get(row["tune_id"])
        if new_set and new_tune:
            dst.execute(
                "INSERT INTO set_tunes (set_id, tune_id, position, key_override) VALUES (?,?,?,?)",
                (new_set, new_tune, row["position"], row["key_override"]),
            )

    # ── 5. Note documents and attachments ────────────────────────────────────
    docs = src.execute(
        "SELECT id, title, content, created_at, updated_at FROM note_documents"
    ).fetchall()
    print(f"Migrating {len(docs)} note documents…")
    doc_id_map: dict[int, int] = {}
    for row in docs:
        cur = dst.execute(
            "INSERT INTO note_documents (title, content, created_at, updated_at) VALUES (?,?,?,?)",
            (row["title"], row["content"], row["created_at"], row["updated_at"]),
        )
        doc_id_map[row["id"]] = cur.lastrowid

    for row in src.execute(
        "SELECT document_id, type, filename, original_name, mime_type, size, url, title, created_at"
        " FROM note_attachments"
    ):
        new_doc = doc_id_map.get(row["document_id"])
        if new_doc:
            dst.execute(
                """INSERT INTO note_attachments
                   (document_id, type, filename, original_name, mime_type, size, url, title, created_at)
                   VALUES (?,?,?,?,?,?,?,?,?)""",
                (
                    new_doc, row["type"], row["filename"], row["original_name"],
                    row["mime_type"], row["size"], row["url"], row["title"], row["created_at"],
                ),
            )

    # ── 6. Achievements ──────────────────────────────────────────────────────
    achievements = src.execute(
        "SELECT type, tune_id, tune_title, note, created_at FROM achievements"
    ).fetchall()
    print(f"Migrating {len(achievements)} achievements…")
    for row in achievements:
        new_tune = tune_id_map.get(row["tune_id"]) if row["tune_id"] else None
        dst.execute(
            "INSERT INTO achievements (type, tune_id, tune_title, note, created_at) VALUES (?,?,?,?,?)",
            (row["type"], new_tune, row["tune_title"], row["note"], row["created_at"]),
        )

    # ── 7. App settings ──────────────────────────────────────────────────────
    for row in src.execute("SELECT key, value FROM app_settings"):
        dst.execute(
            "INSERT OR REPLACE INTO app_settings (key, value) VALUES (?,?)",
            (row["key"], row["value"]),
        )

    dst.execute("PRAGMA foreign_keys = ON")
    dst.commit()
    src.close()
    dst.close()

    print()
    print("Migration complete!")
    print(f"  Tunes:        {len(tunes)}")
    print(f"  Aliases:      {len(aliases)}")
    print(f"  Sets:         {len(sets)}")
    print(f"  Note docs:    {len(docs)}")
    print(f"  Achievements: {len(achievements)}")


if __name__ == "__main__":
    migrate()
