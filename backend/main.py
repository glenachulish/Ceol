"""
Ceol – Trad Music Web App
FastAPI backend serving tune data as JSON and the frontend SPA.
"""

from __future__ import annotations

import io
import json
import math
import os
import re
import shutil
import tempfile
import uuid
import zipfile
from collections import defaultdict
from datetime import date
from pathlib import Path
from typing import Optional

import httpx
from fastapi import FastAPI, File, HTTPException, Query, UploadFile
from fastapi.responses import FileResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

import time as _time
from html.parser import HTMLParser as _HTMLParser
from urllib.parse import urljoin

from backend.abc_parser import (
    build_thecraic_block,
    classify_type,
    parse_abc_file,
    parse_abc_string,
    parse_thecraic_export,
)
from backend.database import DB_PATH, get_connection, init_db

app = FastAPI(title="Ceol", version="0.1.0")
init_db()

# Auto-classify any tunes that have no type yet
def _auto_classify_untyped() -> int:
    """Set type for tunes that have no type, using ABC + title heuristics."""
    count = 0
    with get_connection() as conn:
        rows = conn.execute(
            "SELECT id, title, abc FROM tunes WHERE type IS NULL OR type = ''"
        ).fetchall()
        for tune_id, title, abc in rows:
            t = classify_type(abc, title)
            if t:
                conn.execute(
                    "UPDATE tunes SET type = ?, updated_at = datetime('now') WHERE id = ?",
                    (t, tune_id),
                )
                count += 1
    return count

_auto_classify_untyped()

FRONTEND_DIR = Path(__file__).parent.parent / "frontend"
STATIC_DIR = FRONTEND_DIR / "static"
UPLOADS_DIR = Path(__file__).parent.parent / "data" / "uploads"
UPLOADS_DIR.mkdir(parents=True, exist_ok=True)

APP_DIR = Path(__file__).parent.parent.resolve()


def _rotate_db_backup() -> None:
    """Keep the two most recent database backups, rotating on each startup."""
    bak1 = DB_PATH.parent / "ceol.db.bak1"
    bak2 = DB_PATH.parent / "ceol.db.bak2"
    if bak1.exists():
        shutil.copy2(bak1, bak2)
    if DB_PATH.exists():
        shutil.copy2(DB_PATH, bak1)


def _write_info_file() -> None:
    info_path = DB_PATH.parent / "app_info.txt"
    info_path.write_text(
        f"Ceol – Trad Music App\n"
        f"=====================\n"
        f"App directory : {APP_DIR}\n"
        f"Database      : {DB_PATH.resolve()}\n"
        f"Backup 1 (recent) : {DB_PATH.parent / 'ceol.db.bak1'}\n"
        f"Backup 2 (older)  : {DB_PATH.parent / 'ceol.db.bak2'}\n"
        f"Uploads       : {UPLOADS_DIR.resolve()}\n"
        f"Web interface : http://localhost:8001\n",
        encoding="utf-8",
    )


def _do_auto_group(conn) -> int:
    """Group standalone tunes that share the same title. Returns count of new groups created."""
    rows = conn.execute(
        "SELECT id, title, type, key, abc FROM tunes WHERE parent_id IS NULL ORDER BY id"
    ).fetchall()
    groups: dict = defaultdict(list)
    for row in rows:
        groups[row["title"].strip().lower()].append(dict(row))
    grouped = 0
    for tunes in groups.values():
        if len(tunes) < 2:
            continue
        title = tunes[0]["title"]
        cur = conn.execute(
            "INSERT INTO tunes (title, type, key, mode, abc, notes) VALUES (?, '', '', '', '', '')",
            (title,),
        )
        parent_id = cur.lastrowid
        default_id = next((t["id"] for t in tunes if t["abc"].strip()), tunes[0]["id"])
        for i, tune in enumerate(tunes):
            key_part = f" · {tune['key']}" if tune["key"] else ""
            label = f"Setting {i + 1}{key_part}"
            conn.execute(
                "UPDATE tunes SET parent_id = ?, version_label = ?, is_default = ? WHERE id = ?",
                (parent_id, label, 1 if tune["id"] == default_id else 0, tune["id"]),
            )
        grouped += 1
    return grouped


_rotate_db_backup()
_write_info_file()
with get_connection() as _startup_conn:
    _do_auto_group(_startup_conn)

# ---------------------------------------------------------------------------
# Helper
# ---------------------------------------------------------------------------

def _db():
    return get_connection(DB_PATH)


# ---------------------------------------------------------------------------
# Tune endpoints
# ---------------------------------------------------------------------------

@app.get("/api/tunes")
def list_tunes(
    q: Optional[str] = Query(None, description="Search title / alias"),
    type: Optional[str] = Query(None, description="Filter by tune type"),
    key: Optional[str] = Query(None, description="Filter by key"),
    mode: Optional[str] = Query(None, description="Filter by mode"),
    hitlist: Optional[int] = Query(None, description="1 = hitlist only"),
    min_rating: Optional[int] = Query(None, ge=1, le=5, description="Minimum star rating"),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
):
    conditions: list[str] = ["t.parent_id IS NULL"]
    params: list = []

    if q:
        conditions.append(
            "(t.title LIKE ? OR EXISTS "
            "(SELECT 1 FROM tune_aliases a WHERE a.tune_id = t.id AND a.alias LIKE ?))"
        )
        like = f"%{q}%"
        params += [like, like]

    if type:
        conditions.append("t.type = ?")
        params.append(type.lower())

    if key:
        conditions.append("t.key LIKE ?")
        params.append(f"%{key}%")

    if mode:
        conditions.append("t.mode = ?")
        params.append(mode.lower())

    if hitlist:
        conditions.append("t.on_hitlist = 1")

    if min_rating is not None:
        conditions.append("t.rating >= ?")
        params.append(min_rating)

    where = ("WHERE " + " AND ".join(conditions)) if conditions else ""
    offset = (page - 1) * page_size

    with _db() as conn:
        total = conn.execute(
            f"SELECT COUNT(*) FROM tunes t {where}", params
        ).fetchone()[0]

        rows = conn.execute(
            f"""
            SELECT t.id, t.craic_id, t.session_id, t.title, t.type,
                   t.key, t.mode, t.notes, t.imported_at, t.created_at,
                   t.rating, t.on_hitlist,
                   (SELECT COUNT(*) FROM tunes v WHERE v.parent_id = t.id) AS version_count
            FROM tunes t
            {where}
            ORDER BY t.title COLLATE NOCASE
            LIMIT ? OFFSET ?
            """,
            params + [page_size, offset],
        ).fetchall()

    return {
        "total": total,
        "page": page,
        "page_size": page_size,
        "pages": math.ceil(total / page_size) if total else 0,
        "tunes": [dict(r) for r in rows],
    }


@app.get("/api/tunes/{tune_id}")
def get_tune(tune_id: int):
    with _db() as conn:
        row = conn.execute(
            "SELECT * FROM tunes WHERE id = ?", (tune_id,)
        ).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Tune not found")

        aliases = conn.execute(
            "SELECT alias FROM tune_aliases WHERE tune_id = ?", (tune_id,)
        ).fetchall()

        tags = conn.execute(
            """
            SELECT tg.name FROM tags tg
            JOIN tune_tags tt ON tt.tag_id = tg.id
            WHERE tt.tune_id = ?
            """,
            (tune_id,),
        ).fetchall()
        version_count = conn.execute(
            "SELECT COUNT(*) FROM tunes WHERE parent_id = ?", (tune_id,)
        ).fetchone()[0]

    result = dict(row)
    result["aliases"] = [a["alias"] for a in aliases]
    result["tags"] = [t["name"] for t in tags]
    result["version_count"] = version_count
    return result


class NotesUpdate(BaseModel):
    notes: str = ""


@app.delete("/api/tunes/{tune_id}")
def delete_tune(tune_id: int):
    with _db() as conn:
        if not conn.execute("SELECT 1 FROM tunes WHERE id = ?", (tune_id,)).fetchone():
            raise HTTPException(status_code=404, detail="Tune not found")
        # Unlink any versions that had this tune as their parent
        conn.execute(
            "UPDATE tunes SET parent_id = NULL, version_label = '' WHERE parent_id = ?",
            (tune_id,),
        )
        conn.execute("DELETE FROM tune_aliases WHERE tune_id = ?", (tune_id,))
        conn.execute("DELETE FROM tune_tags WHERE tune_id = ?", (tune_id,))
        conn.execute("DELETE FROM set_tunes WHERE tune_id = ?", (tune_id,))
        conn.execute("DELETE FROM tunes WHERE id = ?", (tune_id,))
    return {"ok": True}


class BulkDeleteBody(BaseModel):
    ids: list[int]


@app.post("/api/tunes/bulk-delete")
def bulk_delete_tunes(body: BulkDeleteBody):
    """Delete multiple tunes in a single transaction."""
    if not body.ids:
        raise HTTPException(400, "No IDs provided")
    with _db() as conn:
        for tid in body.ids:
            conn.execute(
                "UPDATE tunes SET parent_id = NULL, version_label = '' WHERE parent_id = ?",
                (tid,),
            )
            conn.execute("DELETE FROM tune_aliases WHERE tune_id = ?", (tid,))
            conn.execute("DELETE FROM tune_tags WHERE tune_id = ?", (tid,))
            conn.execute("DELETE FROM set_tunes WHERE tune_id = ?", (tid,))
            conn.execute("DELETE FROM tunes WHERE id = ?", (tid,))
    return {"deleted": len(body.ids)}


class TuneUpdate(BaseModel):
    title: Optional[str] = None
    type: Optional[str] = None
    key: Optional[str] = None
    mode: Optional[str] = None
    abc: Optional[str] = None
    version_label: Optional[str] = None
    rating: Optional[int] = None
    on_hitlist: Optional[int] = None


@app.patch("/api/tunes/{tune_id}")
def update_tune(tune_id: int, body: TuneUpdate):
    """Update editable fields on a tune and auto-log rating/hitlist changes."""
    fields = {k: v for k, v in body.model_dump().items() if v is not None}
    if not fields:
        raise HTTPException(400, "No fields to update")
    set_clause = ", ".join(f"{k} = ?" for k in fields)
    values = list(fields.values()) + [tune_id]
    with _db() as conn:
        # Read old values before update (for achievement logging)
        old = conn.execute(
            "SELECT title, rating, on_hitlist FROM tunes WHERE id = ?", (tune_id,)
        ).fetchone()
        if not old:
            raise HTTPException(404, "Tune not found")

        cur = conn.execute(
            f"UPDATE tunes SET {set_clause}, updated_at = datetime('now') WHERE id = ?",
            values,
        )
        if cur.rowcount == 0:
            raise HTTPException(404, "Tune not found")

        # Auto-log achievements
        rating_labels = ["Not yet rated","Just starting","Getting there",
                         "Almost there","Know it well","Nailed it!"]
        if "rating" in fields:
            new_r, old_r = fields["rating"], old["rating"] or 0
            if new_r > old_r and new_r > 0:
                conn.execute(
                    "INSERT INTO achievements (type, tune_id, tune_title, note) VALUES (?,?,?,?)",
                    ("rating_up", tune_id, old["title"],
                     f"Rating improved to {rating_labels[new_r]} ({new_r}★) — {old['title']}"),
                )
        if "on_hitlist" in fields:
            if fields["on_hitlist"] == 1 and not old["on_hitlist"]:
                conn.execute(
                    "INSERT INTO achievements (type, tune_id, tune_title, note) VALUES (?,?,?,?)",
                    ("hitlist_add", tune_id, old["title"],
                     f"Added to Hitlist: {old['title']}"),
                )
            elif fields["on_hitlist"] == 0 and old["on_hitlist"]:
                conn.execute(
                    "INSERT INTO achievements (type, tune_id, tune_title, note) VALUES (?,?,?,?)",
                    ("hitlist_remove", tune_id, old["title"],
                     f"Removed from Hitlist: {old['title']}"),
                )
    return {"ok": True}


@app.post("/api/tunes/{tune_id}/upload-audio", status_code=201)
async def upload_tune_audio(tune_id: int, file: UploadFile = File(...)):
    """Upload an audio file; returns the URL for the caller to add to notes."""
    UPLOADS_DIR.mkdir(parents=True, exist_ok=True)
    with _db() as conn:
        if not conn.execute("SELECT 1 FROM tunes WHERE id = ?", (tune_id,)).fetchone():
            raise HTTPException(404, "Tune not found")
    content = await file.read()
    ext = Path(file.filename).suffix if file.filename else ".mp3"
    stored_name = f"{uuid.uuid4().hex}{ext}"
    (UPLOADS_DIR / stored_name).write_bytes(content)
    return {"url": f"/api/uploads/{stored_name}"}


@app.patch("/api/tunes/{tune_id}/notes")
def update_tune_notes(tune_id: int, body: NotesUpdate):
    with _db() as conn:
        cur = conn.execute(
            "UPDATE tunes SET notes = ?, updated_at = datetime('now') WHERE id = ?",
            (body.notes, tune_id),
        )
        if cur.rowcount == 0:
            raise HTTPException(status_code=404, detail="Tune not found")
    return {"ok": True}


@app.get("/api/filters")
def get_filter_options():
    with _db() as conn:
        types = [
            r[0] for r in conn.execute(
                "SELECT DISTINCT type FROM tunes WHERE type IS NOT NULL ORDER BY type"
            ).fetchall()
        ]
        keys = [
            r[0] for r in conn.execute(
                "SELECT DISTINCT key FROM tunes WHERE key IS NOT NULL ORDER BY key"
            ).fetchall()
        ]
        modes = [
            r[0] for r in conn.execute(
                "SELECT DISTINCT mode FROM tunes WHERE mode IS NOT NULL ORDER BY mode"
            ).fetchall()
        ]
    return {"types": types, "keys": keys, "modes": modes}


@app.post("/api/classify-types")
def api_classify_types(force: bool = False):
    """
    Infer and set the type field for tunes using ABC R:/M: headers and title
    keywords.  By default only processes tunes with no type set; pass
    ?force=true to re-classify every tune (useful for fixing wrong labels).
    """
    count = 0
    details: list[dict] = []
    with get_connection() as conn:
        if force:
            rows = conn.execute("SELECT id, title, abc, type FROM tunes").fetchall()
        else:
            rows = conn.execute(
                "SELECT id, title, abc, type FROM tunes WHERE type IS NULL OR type = ''"
            ).fetchall()
        for tune_id, title, abc, old_type in rows:
            t = classify_type(abc, title)
            if t and t != old_type:
                conn.execute(
                    "UPDATE tunes SET type = ?, updated_at = datetime('now') WHERE id = ?",
                    (t, tune_id),
                )
                details.append({"id": tune_id, "title": title, "type": t, "was": old_type})
                count += 1
    return {"classified": count, "total": len(rows), "details": details}


@app.get("/api/info")
def get_info():
    bak1 = DB_PATH.parent / "ceol.db.bak1"
    bak2 = DB_PATH.parent / "ceol.db.bak2"
    return {
        "app_dir": str(APP_DIR),
        "database": str(DB_PATH.resolve()),
        "backup1": str(bak1.resolve()) if bak1.exists() else None,
        "backup2": str(bak2.resolve()) if bak2.exists() else None,
        "uploads": str(UPLOADS_DIR.resolve()),
        "info_file": str((DB_PATH.parent / "app_info.txt").resolve()),
    }


@app.get("/api/stats")
def get_stats():
    with _db() as conn:
        total = conn.execute(
            "SELECT COUNT(*) FROM tunes WHERE parent_id IS NULL"
        ).fetchone()[0]
        by_type = conn.execute(
            "SELECT COALESCE(type,'unknown') AS type, COUNT(*) AS count "
            "FROM tunes WHERE parent_id IS NULL GROUP BY type ORDER BY count DESC"
        ).fetchall()
        by_mode = conn.execute(
            "SELECT COALESCE(mode,'unknown') AS mode, COUNT(*) AS count "
            "FROM tunes WHERE parent_id IS NULL GROUP BY mode ORDER BY count DESC"
        ).fetchall()
    return {
        "total_tunes": total,
        "by_type": [dict(r) for r in by_type],
        "by_mode": [dict(r) for r in by_mode],
    }


# ---------------------------------------------------------------------------
# Global Notes endpoint
# ---------------------------------------------------------------------------

class GlobalNotesUpdate(BaseModel):
    notes: str = ""


@app.get("/api/notes")
def get_global_notes():
    with _db() as conn:
        row = conn.execute(
            "SELECT value FROM app_settings WHERE key = 'global_notes'"
        ).fetchone()
    return {"notes": row["value"] if row else ""}


@app.patch("/api/notes")
def update_global_notes(body: GlobalNotesUpdate):
    with _db() as conn:
        conn.execute(
            "INSERT INTO app_settings (key, value) VALUES ('global_notes', ?) "
            "ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            (body.notes,),
        )
    return {"ok": True}


# ---------------------------------------------------------------------------
# Sets endpoints
# ---------------------------------------------------------------------------

class SetCreate(BaseModel):
    name: str
    notes: str = ""


class SetTuneAdd(BaseModel):
    tune_id: int


class SetReorder(BaseModel):
    order: list[int]  # tune_ids in new order


@app.get("/api/sets")
def list_sets():
    with _db() as conn:
        rows = conn.execute(
            "SELECT id, name, notes, created_at FROM sets ORDER BY name COLLATE NOCASE"
        ).fetchall()
        result = []
        for r in rows:
            s = dict(r)
            s["tune_count"] = conn.execute(
                "SELECT COUNT(*) FROM set_tunes WHERE set_id = ?", (s["id"],)
            ).fetchone()[0]
            result.append(s)
    return result


@app.post("/api/sets", status_code=201)
def create_set(body: SetCreate):
    name = body.name.strip()
    if not name:
        raise HTTPException(400, "Set name is required")
    with _db() as conn:
        cur = conn.execute(
            "INSERT INTO sets (name, notes) VALUES (?, ?)", (name, body.notes)
        )
        set_id = cur.lastrowid
    return {"id": set_id, "name": name, "notes": body.notes, "tune_count": 0}


@app.get("/api/sets/{set_id}")
def get_set(set_id: int):
    with _db() as conn:
        s = conn.execute("SELECT * FROM sets WHERE id = ?", (set_id,)).fetchone()
        if not s:
            raise HTTPException(404, "Set not found")
        tunes = conn.execute(
            """
            SELECT t.id, t.title, t.type, t.key, t.mode, t.abc, st.position, st.key_override
            FROM set_tunes st
            JOIN tunes t ON t.id = st.tune_id
            WHERE st.set_id = ?
            ORDER BY st.position
            """,
            (set_id,),
        ).fetchall()
    result = dict(s)
    result["tunes"] = [dict(t) for t in tunes]
    return result


@app.delete("/api/sets/{set_id}")
def delete_set(set_id: int):
    with _db() as conn:
        if not conn.execute("SELECT 1 FROM sets WHERE id = ?", (set_id,)).fetchone():
            raise HTTPException(404, "Set not found")
        conn.execute("DELETE FROM set_tunes WHERE set_id = ?", (set_id,))
        conn.execute("DELETE FROM sets WHERE id = ?", (set_id,))
    return {"ok": True}


@app.post("/api/sets/{set_id}/tunes")
def add_tune_to_set(set_id: int, body: SetTuneAdd):
    with _db() as conn:
        if not conn.execute("SELECT 1 FROM sets WHERE id = ?", (set_id,)).fetchone():
            raise HTTPException(404, "Set not found")
        if not conn.execute("SELECT 1 FROM tunes WHERE id = ?", (body.tune_id,)).fetchone():
            raise HTTPException(404, "Tune not found")
        if conn.execute(
            "SELECT 1 FROM set_tunes WHERE set_id = ? AND tune_id = ?",
            (set_id, body.tune_id),
        ).fetchone():
            return {"ok": True, "added": False}
        pos = conn.execute(
            "SELECT COALESCE(MAX(position), 0) + 1 FROM set_tunes WHERE set_id = ?",
            (set_id,),
        ).fetchone()[0]
        conn.execute(
            "INSERT INTO set_tunes (set_id, tune_id, position) VALUES (?, ?, ?)",
            (set_id, body.tune_id, pos),
        )
    return {"ok": True, "added": True}


@app.delete("/api/sets/{set_id}/tunes/{tune_id}")
def remove_tune_from_set(set_id: int, tune_id: int):
    with _db() as conn:
        cur = conn.execute(
            "DELETE FROM set_tunes WHERE set_id = ? AND tune_id = ?",
            (set_id, tune_id),
        )
        if cur.rowcount == 0:
            raise HTTPException(status_code=404, detail="Tune not in set")
    return {"ok": True}


@app.put("/api/sets/{set_id}/tunes/reorder")
def reorder_set_tunes(set_id: int, body: SetReorder):
    with _db() as conn:
        for pos, tune_id in enumerate(body.order):
            conn.execute(
                "UPDATE set_tunes SET position=? WHERE set_id=? AND tune_id=?",
                (pos, set_id, tune_id),
            )
    return {"ok": True}


# ---------------------------------------------------------------------------
# Collections endpoints
# ---------------------------------------------------------------------------

class CollectionCreate(BaseModel):
    name: str
    description: str = ""


class CollectionTuneAdd(BaseModel):
    tune_id: int


@app.get("/api/collections")
def list_collections():
    with _db() as conn:
        rows = conn.execute(
            "SELECT id, name, description, created_at FROM collections ORDER BY name COLLATE NOCASE"
        ).fetchall()
        result = []
        for r in rows:
            c = dict(r)
            c["tune_count"] = conn.execute(
                "SELECT COUNT(*) FROM collection_tunes WHERE collection_id = ?", (c["id"],)
            ).fetchone()[0]
            result.append(c)
    return result


@app.post("/api/collections", status_code=201)
def create_collection(body: CollectionCreate):
    name = body.name.strip()
    if not name:
        raise HTTPException(400, "Collection name is required")
    with _db() as conn:
        cur = conn.execute(
            "INSERT INTO collections (name, description) VALUES (?, ?)",
            (name, body.description),
        )
        col_id = cur.lastrowid
    return {"id": col_id, "name": name, "description": body.description, "tune_count": 0}


@app.get("/api/collections/{col_id}")
def get_collection(col_id: int):
    with _db() as conn:
        c = conn.execute("SELECT * FROM collections WHERE id = ?", (col_id,)).fetchone()
        if not c:
            raise HTTPException(404, "Collection not found")
        tunes = conn.execute(
            """
            SELECT t.id, t.title, t.type, t.key, t.mode, ct.added_at
            FROM collection_tunes ct
            JOIN tunes t ON t.id = ct.tune_id
            WHERE ct.collection_id = ?
            ORDER BY t.title COLLATE NOCASE
            """,
            (col_id,),
        ).fetchall()
    result = dict(c)
    result["tunes"] = [dict(t) for t in tunes]
    return result


@app.patch("/api/collections/{col_id}")
def update_collection(col_id: int, body: CollectionCreate):
    name = body.name.strip()
    if not name:
        raise HTTPException(400, "Collection name is required")
    with _db() as conn:
        if not conn.execute("SELECT 1 FROM collections WHERE id = ?", (col_id,)).fetchone():
            raise HTTPException(404, "Collection not found")
        conn.execute(
            "UPDATE collections SET name = ?, description = ? WHERE id = ?",
            (name, body.description, col_id),
        )
    return {"ok": True}


@app.delete("/api/collections/{col_id}")
def delete_collection(col_id: int):
    with _db() as conn:
        if not conn.execute("SELECT 1 FROM collections WHERE id = ?", (col_id,)).fetchone():
            raise HTTPException(404, "Collection not found")
        conn.execute("DELETE FROM collection_tunes WHERE collection_id = ?", (col_id,))
        conn.execute("DELETE FROM collections WHERE id = ?", (col_id,))
    return {"ok": True}


@app.post("/api/collections/{col_id}/tunes")
def add_tune_to_collection(col_id: int, body: CollectionTuneAdd):
    with _db() as conn:
        if not conn.execute("SELECT 1 FROM collections WHERE id = ?", (col_id,)).fetchone():
            raise HTTPException(404, "Collection not found")
        if not conn.execute("SELECT 1 FROM tunes WHERE id = ?", (body.tune_id,)).fetchone():
            raise HTTPException(404, "Tune not found")
        if conn.execute(
            "SELECT 1 FROM collection_tunes WHERE collection_id = ? AND tune_id = ?",
            (col_id, body.tune_id),
        ).fetchone():
            return {"ok": True, "added": False}
        conn.execute(
            "INSERT INTO collection_tunes (collection_id, tune_id) VALUES (?, ?)",
            (col_id, body.tune_id),
        )
    return {"ok": True, "added": True}


@app.delete("/api/collections/{col_id}/tunes/{tune_id}")
def remove_tune_from_collection(col_id: int, tune_id: int):
    with _db() as conn:
        cur = conn.execute(
            "DELETE FROM collection_tunes WHERE collection_id = ? AND tune_id = ?",
            (col_id, tune_id),
        )
        if cur.rowcount == 0:
            raise HTTPException(404, "Tune not in collection")
    return {"ok": True}


@app.get("/api/tunes/{tune_id}/collections")
def get_tune_collections(tune_id: int):
    with _db() as conn:
        rows = conn.execute(
            """
            SELECT c.id, c.name FROM collections c
            JOIN collection_tunes ct ON ct.collection_id = c.id
            WHERE ct.tune_id = ?
            ORDER BY c.name COLLATE NOCASE
            """,
            (tune_id,),
        ).fetchall()
    return [dict(r) for r in rows]


# ---------------------------------------------------------------------------
# Import endpoint
# ---------------------------------------------------------------------------

@app.post("/api/import")
async def import_abc(file: UploadFile = File(...)):
    content = await file.read()
    try:
        text = content.decode("utf-8")
    except UnicodeDecodeError:
        text = content.decode("latin-1")

    with tempfile.NamedTemporaryFile(
        suffix=".abc", mode="w", encoding="utf-8", delete=False
    ) as f:
        f.write(text)
        tmp_path = f.name

    try:
        tunes = parse_abc_file(tmp_path)
    finally:
        os.unlink(tmp_path)

    imported = 0
    skipped = 0
    import_date = date.today().isoformat()
    with _db() as conn:
        for tune in tunes:
            if not tune.title:
                skipped += 1
                continue
            cur = conn.execute(
                "INSERT INTO tunes (craic_id, title, type, key, mode, abc, notes) VALUES (?, ?, ?, ?, ?, ?, ?)",
                (tune.craic_id, tune.title, tune.type, tune.key, tune.mode, tune.abc,
                 f"Imported from file: {import_date}"),
            )
            tune_id = cur.lastrowid
            for alias in tune.aliases:
                conn.execute(
                    "INSERT OR IGNORE INTO tune_aliases (tune_id, alias) VALUES (?, ?)",
                    (tune_id, alias),
                )
            imported += 1

    return {"imported": imported, "skipped": skipped}


class ImportTextBody(BaseModel):
    abc: str


@app.post("/api/import-text")
def import_abc_text(body: ImportTextBody):
    """Import ABC tunes from a pasted text string."""
    tunes = parse_abc_string(body.abc.strip())
    imported = 0
    skipped = 0
    import_date = date.today().isoformat()
    with _db() as conn:
        for tune in tunes:
            if not tune.title:
                skipped += 1
                continue
            cur = conn.execute(
                "INSERT INTO tunes (craic_id, title, type, key, mode, abc, notes) VALUES (?, ?, ?, ?, ?, ?, ?)",
                (tune.craic_id, tune.title, tune.type, tune.key, tune.mode, tune.abc,
                 f"Imported from paste: {import_date}"),
            )
            tune_id = cur.lastrowid
            for alias in tune.aliases:
                conn.execute(
                    "INSERT OR IGNORE INTO tune_aliases (tune_id, alias) VALUES (?, ?)",
                    (tune_id, alias),
                )
            imported += 1
    return {"imported": imported, "skipped": skipped}


# ---------------------------------------------------------------------------
# TheCraic iOS app — import & export
# ---------------------------------------------------------------------------

@app.post("/api/import/thecraic")
async def import_thecraic(file: UploadFile = File(...)):
    """
    Import a TheCraic iOS export (.abc file).

    Deduplication: tunes with a web source_url already in the DB are updated
    (on_hitlist synced) rather than re-inserted.  Tunes with device-local
    source paths are always inserted as new.
    """
    content = await file.read()
    try:
        text = content.decode("utf-8")
    except UnicodeDecodeError:
        text = content.decode("latin-1")

    tunes = parse_thecraic_export(text)
    imported = skipped = updated = 0
    # Map collection name -> (collection_id, set of tune_ids already added)
    collection_cache: dict[str, int] = {}

    with _db() as conn:
        for tune in tunes:
            if not tune.title:
                skipped += 1
                continue

            # Try to match an existing tune by source_url (web URLs only)
            existing_id = None
            if tune.source_url:
                row = conn.execute(
                    "SELECT id FROM tunes WHERE source_url = ?", (tune.source_url,)
                ).fetchone()
                if row:
                    existing_id = row["id"]

            if existing_id:
                # Update hitlist status only — don't overwrite user's notes/rating
                conn.execute(
                    "UPDATE tunes SET on_hitlist=?, updated_at=CURRENT_TIMESTAMP WHERE id=?",
                    (tune.on_hitlist, existing_id),
                )
                tune_db_id = existing_id
                updated += 1
            else:
                cur = conn.execute(
                    """INSERT INTO tunes
                       (craic_id, title, type, key, mode, abc, source_url, on_hitlist)
                       VALUES (?,?,?,?,?,?,?,?)""",
                    (tune.craic_id, tune.title, tune.type, tune.key, tune.mode,
                     tune.abc, tune.source_url, tune.on_hitlist),
                )
                tune_db_id = cur.lastrowid
                for alias in tune.aliases:
                    conn.execute(
                        "INSERT OR IGNORE INTO tune_aliases (tune_id, alias) VALUES (?,?)",
                        (tune_db_id, alias),
                    )
                imported += 1

            # Add to collection if the tune was inside a collection block
            if tune.collection:
                col_name = tune.collection
                if col_name not in collection_cache:
                    # Find existing collection or create it
                    row = conn.execute(
                        "SELECT id FROM collections WHERE name = ?", (col_name,)
                    ).fetchone()
                    if row:
                        collection_cache[col_name] = row["id"]
                    else:
                        cur2 = conn.execute(
                            "INSERT INTO collections (name) VALUES (?)", (col_name,)
                        )
                        collection_cache[col_name] = cur2.lastrowid
                col_id = collection_cache[col_name]
                conn.execute(
                    "INSERT OR IGNORE INTO collection_tunes (collection_id, tune_id) VALUES (?,?)",
                    (col_id, tune_db_id),
                )

    collections_created = len(collection_cache)
    return {"imported": imported, "updated": updated, "skipped": skipped,
            "collections_created": collections_created}


@app.get("/api/export/thecraic")
def export_thecraic(filename: str = Query(None)):
    """
    Export the full library as a TheCraic-compatible .abc file.

    Each tune is wrapped with %%thecraic: metadata so TheCraic can read
    the favourite (hitlist) flag.  Collections are exported as
    %%thecraic:collectionstart="Name " / %%thecraic:collectionend="Name " blocks.
    Each tune appears once: inside its first collection block if it belongs to
    any collection, otherwise in the uncollected section at the end.
    """
    today = date.today().isoformat()
    export_time = f"{today} 00:00:00 +0000"
    safe_filename = filename or f"ceol-export-{today}.abc"

    with _db() as conn:
        # All top-level tunes
        all_tunes = conn.execute(
            "SELECT id, abc, source_url, on_hitlist "
            "FROM tunes WHERE parent_id IS NULL OR parent_id = 0"
        ).fetchall()

        # Collections with their tunes (ordered by collection name, then tune title)
        collections = conn.execute(
            "SELECT id, name FROM collections ORDER BY name COLLATE NOCASE"
        ).fetchall()

        col_tunes: dict[int, list[dict]] = {}
        for col in collections:
            rows = conn.execute(
                """SELECT t.id, t.abc, t.source_url, t.on_hitlist
                   FROM collection_tunes ct
                   JOIN tunes t ON t.id = ct.tune_id
                   WHERE ct.collection_id = ?
                   ORDER BY t.title COLLATE NOCASE""",
                (col["id"],),
            ).fetchall()
            col_tunes[col["id"]] = [dict(r) for r in rows]

    # Determine which tune IDs are in at least one collection
    tune_ids_in_collections: set[int] = set()
    for tunes_list in col_tunes.values():
        for t in tunes_list:
            tune_ids_in_collections.add(t["id"])

    total_tunes = len(all_tunes)
    num_collections = len(collections)

    lines: list[str] = [
        "%abc-2.1",
        "I:abc-creator Ceol",
        f"%%thecraic:exported {total_tunes} tunes {num_collections} collections {export_time}",
        "",
    ]

    # Output collection blocks first
    for col in collections:
        col_name = col["name"]
        tunes_in_col = col_tunes[col["id"]]
        if not tunes_in_col:
            continue
        lines.append(f'%%thecraic:collectionstart="{col_name} "')
        lines.append("")
        for t in tunes_in_col:
            block = build_thecraic_block(
                abc=t["abc"],
                source_url=t["source_url"],
                on_hitlist=t["on_hitlist"] or 0,
            )
            lines.append(block)
            lines.append("")
        lines.append(f'%%thecraic:collectionend="{col_name} "')
        lines.append("")

    # Output tunes not in any collection
    for t in all_tunes:
        if t["id"] in tune_ids_in_collections:
            continue
        block = build_thecraic_block(
            abc=t["abc"],
            source_url=t["source_url"],
            on_hitlist=t["on_hitlist"] or 0,
        )
        lines.append(block)
        lines.append("")

    output = "\n".join(lines)
    buf = io.BytesIO(output.encode("utf-8"))

    return StreamingResponse(
        buf,
        media_type="text/plain; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{safe_filename}"'},
    )


# ---------------------------------------------------------------------------
# TheSession.org endpoints
# ---------------------------------------------------------------------------

_SESSION_BASE = "https://thesession.org"
_SESSION_HEADERS = {"Accept": "application/json", "User-Agent": "Ceol/0.1 trad-music-app"}


# Meter and default note-length for each TheSession tune type
_TYPE_METER: dict[str, tuple[str, str]] = {
    "reel":       ("4/4",  "1/8"),
    "jig":        ("6/8",  "1/8"),
    "slip jig":   ("9/8",  "1/8"),
    "hornpipe":   ("4/4",  "1/8"),
    "polka":      ("2/4",  "1/8"),
    "waltz":      ("3/4",  "1/4"),
    "strathspey": ("4/4",  "1/8"),
    "mazurka":    ("3/4",  "1/8"),
    "barndance":  ("4/4",  "1/8"),
    "march":      ("4/4",  "1/8"),
    "slide":      ("12/8", "1/8"),
}


def _build_session_abc(idx: int, title: str, tune_type: str,
                       raw_key: str, notes: str, meter: str = "") -> str:
    """Reconstruct a full ABC string from TheSession API fields."""
    ttype = (tune_type or "").lower()
    default_meter, note_len = _TYPE_METER.get(ttype, ("4/4", "1/8"))
    if not meter:
        meter = default_meter
    lines = [f"X: {idx}", f"T: {title}"]
    if ttype:
        lines.append(f"R: {ttype}")
    lines += [f"M: {meter}", f"L: {note_len}", f"K: {raw_key}"]
    return "\n".join(lines) + "\n" + notes.strip()


def _add_session_repeats(abc: str) -> str:
    """Add |: :| repeat barlines to TheSession ABC if missing.

    TheSession stores ABC without explicit repeat marks and their player
    adds AABB repeats by convention. We replicate that here so ABCJS
    plays the tune correctly.
    """
    k_match = re.search(r'^K:[^\n]*\n', abc, re.MULTILINE)
    if not k_match:
        return abc
    header = abc[:k_match.end()]
    body = abc[k_match.end():]

    # Already has repeat marks — leave untouched
    if '|:' in body or ':|' in body:
        return abc

    # Split on double barline (section separator) and wrap each part
    parts = [p.strip() for p in body.split('||') if p.strip()]
    if len(parts) <= 1:
        return abc

    new_body = '|:' + ':||:'.join(parts) + ':|'
    return header + new_body


@app.get("/api/thesession/search")
async def thesession_search(q: str = Query(..., min_length=1), page: int = Query(1, ge=1)):
    """Proxy a search to TheSession.org and return normalised results."""
    async with httpx.AsyncClient(headers=_SESSION_HEADERS, timeout=10) as client:
        try:
            resp = await client.get(
                f"{_SESSION_BASE}/tunes/search",
                params={"q": q, "format": "json", "perpage": 20, "page": page},
            )
            resp.raise_for_status()
        except httpx.RequestError as exc:
            raise HTTPException(502, f"Could not reach TheSession.org: {exc}")
        except httpx.HTTPStatusError as exc:
            raise HTTPException(502, f"TheSession.org returned {exc.response.status_code}")

    data = resp.json()
    tunes = [
        {"id": t["id"], "name": t["name"], "type": t.get("type", ""), "tunebooks": t.get("tunebooks", 0)}
        for t in data.get("tunes", [])
    ]
    return {"tunes": tunes, "page": data.get("page", 1), "pages": data.get("pages", 1), "total": data.get("total", 0)}


@app.get("/api/thesession/fetch/{tune_id}")
async def thesession_fetch(tune_id: int):
    """Fetch all settings for a tune from TheSession.org by ID without saving it."""
    async with httpx.AsyncClient(headers=_SESSION_HEADERS, timeout=10) as client:
        try:
            resp = await client.get(f"{_SESSION_BASE}/tunes/{tune_id}", params={"format": "json"})
            resp.raise_for_status()
        except httpx.RequestError as exc:
            raise HTTPException(502, f"Could not reach TheSession.org: {exc}")
        except httpx.HTTPStatusError as exc:
            raise HTTPException(502, f"TheSession.org returned {exc.response.status_code}")

    data = resp.json()
    raw_settings = data.get("settings", [])
    if not raw_settings:
        raise HTTPException(404, "No ABC settings found for this tune")

    from backend.abc_parser import normalise_key
    tune_type = data.get("type", "")
    title = data.get("name", "")
    aliases = [
        a.get("name") if isinstance(a, dict) else a
        for a in data.get("aliases", [])
        if (a.get("name") if isinstance(a, dict) else a)
    ]

    settings = []
    for i, s in enumerate(raw_settings):
        key = s.get("key", "")
        key_norm, mode_norm = normalise_key(key) if key else (key, "")
        meter = s.get("meter") or data.get("meter", "")
        full_abc = _build_session_abc(i + 1, title, tune_type, key,
                                      s.get("abc", ""), meter)
        member_info = s.get("member") or {}
        settings.append({
            "id": s.get("id"),
            "index": i + 1,
            "abc": _add_session_repeats(full_abc),
            "key": key_norm,
            "mode": mode_norm,
            "votes": s.get("votes", 0),
            "member": member_info.get("name") if isinstance(member_info, dict) else None,
            "date": s.get("date"),
        })

    # Default to first setting (X:1) — matches what TheSession.org displays
    default = settings[0]

    return {
        "session_id": tune_id,
        "title": title,
        "type": tune_type.lower() if tune_type else "",
        "key": default["key"],
        "mode": default["mode"],
        "abc": default["abc"],
        "aliases": aliases,
        "settings": settings,
    }


@app.post("/api/thesession/import")
async def thesession_import(body: dict):
    """Fetch one or more settings from TheSession.org and save them to the library."""
    tune_id = body.get("tune_id")
    setting_ids = body.get("setting_ids")  # optional list of setting IDs to import
    if not tune_id:
        raise HTTPException(400, "tune_id required")

    async with httpx.AsyncClient(headers=_SESSION_HEADERS, timeout=10) as client:
        try:
            resp = await client.get(f"{_SESSION_BASE}/tunes/{tune_id}", params={"format": "json"})
            resp.raise_for_status()
        except httpx.RequestError as exc:
            raise HTTPException(502, f"Could not reach TheSession.org: {exc}")
        except httpx.HTTPStatusError as exc:
            raise HTTPException(502, f"TheSession.org returned {exc.response.status_code}")

    data = resp.json()
    raw_settings = data.get("settings", [])
    if not raw_settings:
        raise HTTPException(404, "No ABC settings found for this tune")

    from backend.abc_parser import normalise_key
    tune_type = data.get("type", "")
    title = data.get("name", "")
    aliases = [
        a.get("name") if isinstance(a, dict) else a
        for a in data.get("aliases", [])
        if (a.get("name") if isinstance(a, dict) else a)
    ]

    # Determine which settings to import
    if setting_ids:
        to_import = [(i, s) for i, s in enumerate(raw_settings) if s.get("id") in setting_ids]
        if not to_import:
            raise HTTPException(400, "No matching settings found")
    else:
        # Default: first setting (X:1), matching what TheSession.org displays
        to_import = [(0, raw_settings[0])]

    import_date = date.today().isoformat()
    results = []

    with _db() as conn:
        for idx, s in to_import:
            sid = s.get("id")
            key = s.get("key", "")
            key_norm, mode_norm = normalise_key(key) if key else (key, "")
            setting_index = idx + 1
            meter = s.get("meter") or data.get("meter", "")
            full_abc = _build_session_abc(setting_index, title, tune_type,
                                          key, s.get("abc", ""), meter)
            abc = _add_session_repeats(full_abc)

            # Deduplication: same tune + same setting
            existing = conn.execute(
                "SELECT id FROM tunes WHERE session_id = ? AND setting_id = ?",
                (str(tune_id), str(sid))
            ).fetchone()
            if existing:
                results.append({"status": "exists", "tune_id": existing["id"], "title": title})
                continue

            version_label = f"Setting {setting_index} · {key_norm}" if len(to_import) > 1 else ""
            member_info = s.get("member") or {}
            session_member = member_info.get("name") if isinstance(member_info, dict) else None
            session_date = s.get("date")
            cur = conn.execute(
                """INSERT INTO tunes
                   (session_id, setting_id, title, type, key, mode, abc, notes, version_label,
                    session_member, session_date)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (str(tune_id), str(sid), title, tune_type.lower() if tune_type else "",
                 key_norm, mode_norm, abc,
                 f"Imported from TheSession.org: {import_date}", version_label,
                 session_member, session_date),
            )
            new_id = cur.lastrowid
            for alias in aliases:
                conn.execute(
                    "INSERT OR IGNORE INTO tune_aliases (tune_id, alias) VALUES (?, ?)",
                    (new_id, alias),
                )
            results.append({"status": "saved", "tune_id": new_id, "title": title})

    # Single result: return old-style response for backwards compatibility
    if len(results) == 1:
        r = results[0]
        return {"status": r["status"], "tune_id": r["tune_id"], "title": r["title"]}

    saved = [r for r in results if r["status"] == "saved"]
    exists = [r for r in results if r["status"] == "exists"]
    return {
        "status": "multi",
        "count": len(results),
        "saved": len(saved),
        "exists": len(exists),
        "title": title,
        "results": results,
    }


@app.post("/api/thesession/backfill-member-data")
async def thesession_backfill_member_data():
    """Backfill session_member and session_date for existing TheSession tunes."""
    with _db() as conn:
        rows = conn.execute(
            "SELECT id, session_id, setting_id FROM tunes "
            "WHERE session_id IS NOT NULL AND setting_id IS NOT NULL "
            "AND (session_member IS NULL OR session_date IS NULL)"
        ).fetchall()

    if not rows:
        return {"updated": 0, "message": "Nothing to backfill"}

    # Group by session_id to minimise API calls
    from collections import defaultdict
    by_session: dict = defaultdict(list)
    for row in rows:
        by_session[row["session_id"]].append(row)

    updated = 0
    async with httpx.AsyncClient(headers=_SESSION_HEADERS, timeout=10) as client:
        for session_id, tune_rows in by_session.items():
            try:
                resp = await client.get(
                    f"{_SESSION_BASE}/tunes/{session_id}", params={"format": "json"}
                )
                resp.raise_for_status()
            except Exception:
                continue
            data = resp.json()
            settings_by_id = {str(s["id"]): s for s in data.get("settings", [])}
            with _db() as conn:
                for row in tune_rows:
                    s = settings_by_id.get(str(row["setting_id"]))
                    if not s:
                        continue
                    member_info = s.get("member") or {}
                    member = member_info.get("name") if isinstance(member_info, dict) else None
                    date = s.get("date")
                    if member or date:
                        conn.execute(
                            "UPDATE tunes SET session_member = ?, session_date = ? WHERE id = ?",
                            (member, date, row["id"]),
                        )
                        updated += 1

    return {"updated": updated}

# ---------------------------------------------------------------------------
# Tune versions
# ---------------------------------------------------------------------------

@app.get("/api/tunes/{tune_id}/versions")
def get_tune_versions(tune_id: int):
    """Return the parent title and all child versions for a grouped tune."""
    with _db() as conn:
        parent = conn.execute(
            "SELECT id, title FROM tunes WHERE id = ?", (tune_id,)
        ).fetchone()
        if not parent:
            raise HTTPException(404, "Tune not found")
        versions = conn.execute(
            "SELECT id, title, type, key, mode, version_label, notes, session_member, session_date, is_default "
            "FROM tunes WHERE parent_id = ? ORDER BY is_default DESC, version_label COLLATE NOCASE",
            (tune_id,),
        ).fetchall()
    return {"parent": dict(parent), "versions": [dict(v) for v in versions]}


class GroupTunesBody(BaseModel):
    title: str
    tune_ids: list[int]
    labels: list[str]


@app.post("/api/tunes/group", status_code=201)
def group_tunes(body: GroupTunesBody):
    """Create a parent container and link existing tunes as versions under it."""
    title = body.title.strip()
    if not title:
        raise HTTPException(400, "Title required")
    if not body.tune_ids:
        raise HTTPException(400, "At least one tune required")
    if len(body.tune_ids) != len(body.labels):
        raise HTTPException(400, "Must supply a label for each tune")
    with _db() as conn:
        cur = conn.execute(
            "INSERT INTO tunes (title, type, key, mode, abc, notes) VALUES (?, '', '', '', '', '')",
            (title,),
        )
        parent_id = cur.lastrowid
        for i, (tune_id, label) in enumerate(zip(body.tune_ids, body.labels)):
            conn.execute(
                "UPDATE tunes SET parent_id = ?, version_label = ?, is_default = ? WHERE id = ?",
                (parent_id, label.strip(), 1 if i == 0 else 0, tune_id),
            )
    return {"id": parent_id, "title": title}


@app.patch("/api/tunes/{tune_id}/set-default")
def set_default_version(tune_id: int):
    """Mark this version as the default (clears any previous default for the same parent)."""
    with _db() as conn:
        tune = conn.execute(
            "SELECT parent_id FROM tunes WHERE id = ?", (tune_id,)
        ).fetchone()
        if not tune or not tune["parent_id"]:
            raise HTTPException(400, "Tune is not a version under a parent")
        parent_id = tune["parent_id"]
        conn.execute("UPDATE tunes SET is_default = 0 WHERE parent_id = ?", (parent_id,))
        conn.execute("UPDATE tunes SET is_default = 1 WHERE id = ?", (tune_id,))
    return {"ok": True}


@app.post("/api/tunes/auto-group")
def auto_group_tunes():
    """Find standalone tunes sharing the same title and group them as versions."""
    with _db() as conn:
        grouped = _do_auto_group(conn)
    return {"grouped": grouped}


# ---------------------------------------------------------------------------
# Manual tune creation
# ---------------------------------------------------------------------------

class TuneCreate(BaseModel):
    title: str
    type: str = ""
    key: str = ""
    mode: str = ""
    notes: str = ""
    abc: str = ""
    parent_id: Optional[int] = None
    version_label: str = ""


@app.post("/api/tunes", status_code=201)
def create_tune(body: TuneCreate):
    """Create a tune manually."""
    title = body.title.strip()
    if not title:
        raise HTTPException(400, "Title required")
    with _db() as conn:
        cur = conn.execute(
            "INSERT INTO tunes (title, type, key, mode, abc, notes, parent_id, version_label) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            (title, body.type.strip(), body.key.strip(), body.mode.strip(),
             body.abc.strip(), body.notes.strip(), body.parent_id, body.version_label.strip()),
        )
        tune_id = cur.lastrowid
    return {"id": tune_id, "title": title}


# ---------------------------------------------------------------------------
# ---------------------------------------------------------------------------
# Achievements
# ---------------------------------------------------------------------------

@app.get("/api/achievements")
def list_achievements():
    with _db() as conn:
        rows = conn.execute(
            "SELECT * FROM achievements ORDER BY created_at DESC LIMIT 200"
        ).fetchall()
    return [dict(r) for r in rows]


class AchievementCreate(BaseModel):
    note: str


@app.post("/api/achievements", status_code=201)
def create_achievement(body: AchievementCreate):
    note = body.note.strip()
    if not note:
        raise HTTPException(400, "Note required")
    with _db() as conn:
        cur = conn.execute(
            "INSERT INTO achievements (type, note) VALUES ('manual', ?)", (note,)
        )
    return {"id": cur.lastrowid}


@app.delete("/api/achievements/{ach_id}")
def delete_achievement(ach_id: int):
    with _db() as conn:
        conn.execute("DELETE FROM achievements WHERE id = ?", (ach_id,))
    return {"ok": True}


# ---------------------------------------------------------------------------
# Note documents endpoints
# ---------------------------------------------------------------------------

class NoteDocCreate(BaseModel):
    title: str = "Untitled"

class NoteDocUpdate(BaseModel):
    title: Optional[str] = None
    content: Optional[str] = None

class LinkAttachmentBody(BaseModel):
    url: str
    title: str = ""


@app.get("/api/note-documents")
def list_note_documents():
    with _db() as conn:
        rows = conn.execute(
            "SELECT id, title, updated_at FROM note_documents ORDER BY updated_at DESC"
        ).fetchall()
    return [dict(r) for r in rows]


@app.post("/api/note-documents", status_code=201)
def create_note_document(body: NoteDocCreate):
    title = body.title.strip() or "Untitled"
    with _db() as conn:
        cur = conn.execute(
            "INSERT INTO note_documents (title) VALUES (?)", (title,)
        )
        doc_id = cur.lastrowid
    return {"id": doc_id, "title": title, "content": "", "attachments": []}


@app.get("/api/note-documents/{doc_id}")
def get_note_document(doc_id: int):
    with _db() as conn:
        doc = conn.execute(
            "SELECT * FROM note_documents WHERE id = ?", (doc_id,)
        ).fetchone()
        if not doc:
            raise HTTPException(404, "Document not found")
        attachments = conn.execute(
            "SELECT * FROM note_attachments WHERE document_id = ? ORDER BY created_at",
            (doc_id,),
        ).fetchall()
    result = dict(doc)
    result["attachments"] = [dict(a) for a in attachments]
    return result


@app.patch("/api/note-documents/{doc_id}")
def update_note_document(doc_id: int, body: NoteDocUpdate):
    with _db() as conn:
        doc = conn.execute("SELECT id FROM note_documents WHERE id = ?", (doc_id,)).fetchone()
        if not doc:
            raise HTTPException(404, "Document not found")
        if body.title is not None:
            conn.execute(
                "UPDATE note_documents SET title = ?, updated_at = datetime('now') WHERE id = ?",
                (body.title, doc_id),
            )
        if body.content is not None:
            conn.execute(
                "UPDATE note_documents SET content = ?, updated_at = datetime('now') WHERE id = ?",
                (body.content, doc_id),
            )
    return {"ok": True}


@app.delete("/api/note-documents/{doc_id}")
def delete_note_document(doc_id: int):
    with _db() as conn:
        # Delete uploaded files first
        files = conn.execute(
            "SELECT filename FROM note_attachments WHERE document_id = ? AND type = 'file'",
            (doc_id,),
        ).fetchall()
        for f in files:
            fpath = UPLOADS_DIR / f["filename"]
            if fpath.exists():
                fpath.unlink()
        conn.execute("DELETE FROM note_documents WHERE id = ?", (doc_id,))
    return {"ok": True}


@app.post("/api/note-documents/{doc_id}/attachments/file", status_code=201)
async def add_file_attachment(doc_id: int, file: UploadFile = File(...)):
    with _db() as conn:
        if not conn.execute("SELECT 1 FROM note_documents WHERE id = ?", (doc_id,)).fetchone():
            raise HTTPException(404, "Document not found")

    content = await file.read()
    ext = Path(file.filename).suffix if file.filename else ""
    stored_name = f"{uuid.uuid4().hex}{ext}"
    dest = UPLOADS_DIR / stored_name
    dest.write_bytes(content)

    with _db() as conn:
        cur = conn.execute(
            """INSERT INTO note_attachments
               (document_id, type, filename, original_name, mime_type, size, url)
               VALUES (?, 'file', ?, ?, ?, ?, ?)""",
            (doc_id, stored_name, file.filename, file.content_type, len(content),
             f"/api/uploads/{stored_name}"),
        )
        att_id = cur.lastrowid

    return {
        "id": att_id, "type": "file", "filename": stored_name,
        "original_name": file.filename, "mime_type": file.content_type,
        "size": len(content), "url": f"/api/uploads/{stored_name}",
    }


@app.post("/api/note-documents/{doc_id}/attachments/link", status_code=201)
def add_link_attachment(doc_id: int, body: LinkAttachmentBody):
    if not body.url.strip():
        raise HTTPException(400, "URL is required")
    with _db() as conn:
        if not conn.execute("SELECT 1 FROM note_documents WHERE id = ?", (doc_id,)).fetchone():
            raise HTTPException(404, "Document not found")
        cur = conn.execute(
            "INSERT INTO note_attachments (document_id, type, url, title) VALUES (?, 'link', ?, ?)",
            (doc_id, body.url.strip(), body.title.strip() or body.url.strip()),
        )
        att_id = cur.lastrowid
    return {"id": att_id, "type": "link", "url": body.url.strip(),
            "title": body.title.strip() or body.url.strip()}


@app.delete("/api/note-attachments/{att_id}")
def delete_attachment(att_id: int):
    with _db() as conn:
        row = conn.execute(
            "SELECT type, filename FROM note_attachments WHERE id = ?", (att_id,)
        ).fetchone()
        if not row:
            raise HTTPException(404, "Attachment not found")
        if row["type"] == "file" and row["filename"]:
            fpath = UPLOADS_DIR / row["filename"]
            if fpath.exists():
                fpath.unlink()
        conn.execute("DELETE FROM note_attachments WHERE id = ?", (att_id,))
    return {"ok": True}


@app.get("/api/uploads/{filename}")
def serve_upload(filename: str):
    # Sanitise: no path traversal
    safe = Path(filename).name
    fpath = UPLOADS_DIR / safe
    if not fpath.exists():
        raise HTTPException(404, "File not found")
    return FileResponse(str(fpath))


# ---------------------------------------------------------------------------
# FlutefFling.scot catalogue scraper
# ---------------------------------------------------------------------------

_FF_BASE = "https://flutefling.scot"
_FF_ARCHIVE_ROOT = f"{_FF_BASE}/resources/flutefling-session-tunes/"
_FF_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (X11; Linux x86_64; rv:121.0) Gecko/20100101 Firefox/121.0"
    ),
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-GB,en;q=0.5",
    "Referer": "https://flutefling.scot/",
}
_FF_CACHE: tuple[float, list] | None = None
_FF_CACHE_TTL = 3600  # 1 hour


class _PdfMp3Parser(_HTMLParser):
    """Extract PDF/MP3 tune pairs from the FlutefFling session tunes page."""

    def __init__(self):
        super().__init__()
        self.results: list[dict] = []
        self._in_li = False
        self._li_links: list[tuple[str, str]] = []
        self._li_raw_text: list[str] = []
        self._cur_href: str | None = None
        self._link_buf: list[str] = []

    def handle_starttag(self, tag, attrs):
        attrs_d = dict(attrs)
        if tag == "li":
            self._in_li = True
            self._li_links = []
            self._li_raw_text = []
        if tag == "a" and self._in_li:
            self._cur_href = attrs_d.get("href", "")
            self._link_buf = []

    def handle_endtag(self, tag):
        if tag == "a" and self._cur_href is not None and self._in_li:
            text = "".join(self._link_buf).strip()
            self._li_links.append((self._cur_href, text))
            self._li_raw_text.append(text)
            self._cur_href = None
        if tag == "li" and self._in_li:
            self._in_li = False
            self._process_li()

    def handle_data(self, data):
        if self._in_li:
            if self._cur_href is not None:
                self._link_buf.append(data)
            else:
                self._li_raw_text.append(data)

    def _process_li(self):
        pdf = next(
            ((h, t) for h, t in self._li_links
             if "flutefling.scot" in h and h.lower().endswith(".pdf")),
            None,
        )
        mp3 = next(
            ((h, t) for h, t in self._li_links
             if "flutefling.scot" in h and h.lower().endswith(".mp3")),
            None,
        )
        if not pdf and not mp3:
            return
        title = (pdf[1] if pdf else mp3[1]).strip()
        if not title:
            return
        full_text = "".join(self._li_raw_text)
        type_match = re.search(r'\(([^)]+)\)', full_text)
        tune_type = type_match.group(1).lower() if type_match else ""
        self.results.append({
            "title": title,
            "type": tune_type,
            "pdf_url": pdf[0] if pdf else None,
            "mp3_url": mp3[0] if mp3 else None,
        })


class _LinkParser(_HTMLParser):
    """Extract links with their surrounding heading context."""

    def __init__(self):
        super().__init__()
        self.results: list[dict] = []
        self._heading = ""
        self._in_heading = False
        self._heading_buf: list[str] = []
        self._link_href: str | None = None
        self._link_buf: list[str] = []

    def handle_starttag(self, tag, attrs):
        attrs_d = dict(attrs)
        if tag in ("h1", "h2", "h3", "h4"):
            self._in_heading = True
            self._heading_buf = []
        if tag == "a":
            self._link_href = attrs_d.get("href", "")
            self._link_buf = []

    def handle_endtag(self, tag):
        if tag in ("h1", "h2", "h3", "h4") and self._in_heading:
            self._in_heading = False
            self._heading = " ".join(self._heading_buf).strip()
        if tag == "a" and self._link_href is not None:
            text = " ".join(self._link_buf).strip()
            self.results.append({
                "href": self._link_href,
                "text": text,
                "heading": self._heading,
            })
            self._link_href = None

    def handle_data(self, data):
        if self._in_heading:
            self._heading_buf.append(data)
        if self._link_href is not None:
            self._link_buf.append(data)


_ff_last_error: str = ""

async def _ff_get(url: str, client: httpx.AsyncClient) -> str | None:
    global _ff_last_error
    try:
        r = await client.get(url, headers=_FF_HEADERS, timeout=20, follow_redirects=True)
        r.raise_for_status()
        _ff_last_error = ""
        return r.text
    except Exception as exc:
        _ff_last_error = f"{type(exc).__name__}: {exc}"
        return None


def _extract_abc_sets(html: str, page_url: str) -> list[dict]:
    """Return all ABC tune-set entries found in a page's HTML."""
    parser = _LinkParser()
    parser.feed(html)

    # Resolve all hrefs to absolute URLs upfront so relative paths work
    links = [
        {**link, "href": urljoin(page_url, link["href"])}
        for link in parser.results
    ]

    sets: list[dict] = []
    for link in links:
        href = link["href"]
        if not (href.lower().endswith(".txt") and "flutefling.scot" in href):
            continue

        # Best label: heading > link text > filename
        label = (link["heading"] or link["text"] or
                 href.rsplit("/", 1)[-1].replace(".txt", "").replace("_", " "))

        # Look for a matching PDF link (nearby, same name stem)
        stem = re.sub(r"\.txt$", "", href, flags=re.I)
        pdf_url = next(
            (lk["href"] for lk in links
             if lk["href"].lower().startswith(stem.lower()) and
             lk["href"].lower().endswith(".pdf")),
            None,
        )

        sets.append({
            "label": label.strip(),
            "abc_url": href,
            "pdf_url": pdf_url,
            "source_page": page_url,
        })

    return sets


@app.get("/api/flutefling/catalogue")
async def flutefling_catalogue(refresh: bool = False):
    """Scrape flutefling.scot archive pages and return available ABC tune sets."""
    global _FF_CACHE

    now = _time.time()
    if not refresh and _FF_CACHE and now - _FF_CACHE[0] < _FF_CACHE_TTL:
        return {"sets": _FF_CACHE[1], "cached": True}

    async with httpx.AsyncClient(follow_redirects=True) as client:
        # 1. Fetch the archive index to discover year-pages
        index_html = await _ff_get(_FF_ARCHIVE_ROOT, client)
        if not index_html:
            raise HTTPException(502, f"Could not reach flutefling.scot — {_ff_last_error or 'check network access'}")

        idx_parser = _LinkParser()
        idx_parser.feed(index_html)

        # Collect sub-pages inside the archive (year pages + misc)
        subpage_urls: list[str] = [
            lk["href"] for lk in idx_parser.results
            if lk["href"].startswith(_FF_ARCHIVE_ROOT)
            and lk["href"].rstrip("/") != _FF_ARCHIVE_ROOT.rstrip("/")
        ]
        # Also check the NE session tunes tag page for individual posts
        subpage_urls.append(f"{_FF_BASE}/tag/ne-session-tunes/")

        # De-duplicate while preserving order
        seen: set[str] = set()
        subpage_urls = [u for u in subpage_urls if not (u in seen or seen.add(u))]  # type: ignore[func-returns-value]

        all_sets: list[dict] = []

        # 2. Check ABC links on the archive index itself
        all_sets.extend(_extract_abc_sets(index_html, _FF_ARCHIVE_ROOT))

        # 3. Fetch each sub-page and extract ABC links
        for page_url in subpage_urls:
            html = await _ff_get(page_url, client)
            if not html:
                continue
            page_sets = _extract_abc_sets(html, page_url)

            # For tag pages, also follow linked post URLs
            if not page_sets:
                tag_parser = _LinkParser()
                tag_parser.feed(html)
                post_urls = [
                    lk["href"] for lk in tag_parser.results
                    if re.match(r"https://flutefling\.scot/\d{4}/\d{2}/", lk["href"])
                ]
                for post_url in post_urls[:20]:  # cap at 20 posts
                    post_html = await _ff_get(post_url, client)
                    if post_html:
                        page_sets.extend(_extract_abc_sets(post_html, post_url))

            all_sets.extend(page_sets)

    # Remove exact duplicates on abc_url
    seen_abc: set[str] = set()
    unique_sets = [s for s in all_sets if not (s["abc_url"] in seen_abc or seen_abc.add(s["abc_url"]))]  # type: ignore[func-returns-value]

    _FF_CACHE = (now, unique_sets)
    return {"sets": unique_sets, "cached": False}


@app.get("/api/flutefling/fetch-abc")
async def flutefling_fetch_abc(url: str = Query(...)):
    """Fetch an ABC/text file from a safe HTTPS URL and return parsed individual tunes.

    Accepts three URL shapes from FlutefFling:
      - Direct .txt URL  → fetch and parse immediately
      - .pdf URL         → swap extension to .txt and fetch
      - Tune page URL    → scrape the page for the .txt download link, then fetch it
    """
    if not re.match(r"https://", url):
        raise HTTPException(400, "URL must use HTTPS")
    if re.search(r"(localhost|127\.|192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)", url):
        raise HTTPException(400, "Private/local URLs are not allowed")

    async with httpx.AsyncClient(follow_redirects=True) as client:
        _conn_error: list[str] = []

        async def _fetch_text(fetch_url: str) -> str | None:
            """Return response text on HTTP 2xx, None on any HTTP error, raise only on network failure."""
            try:
                r = await client.get(fetch_url, headers=_FF_HEADERS, timeout=15)
                return r.text if r.is_success else None
            except Exception as exc:
                _conn_error.append(str(exc))
                return None

        text: str | None = None

        if url.lower().endswith(".txt"):
            # Direct ABC text file
            text = await _fetch_text(url)
            if text is None:
                if _conn_error:
                    raise HTTPException(502, f"Could not reach flutefling.scot: {_conn_error[0]}")
                raise HTTPException(404, "The .txt file was not found at that URL.")

        elif url.lower().endswith(".pdf"):
            # Try swapping .pdf → .txt at the same path
            txt_url = re.sub(r"\.pdf$", ".txt", url, flags=re.I)
            text = await _fetch_text(txt_url)

            if text is None:
                # .txt not at the same path — try to derive the WordPress post URL
                # Upload path: .../wp-content/uploads/YYYY/MM/Slug.pdf
                # Post URL:    .../YYYY/MM/slug/
                m = re.search(r"/wp(?:-content|/wp-content)/uploads/(\d{4})/(\d{2})/(.+?)\.pdf$",
                              url, re.I)
                if m:
                    year, month, stem = m.group(1), m.group(2), m.group(3)
                    slug = re.sub(r"[\s_]+", "-", stem).lower()
                    post_url = f"{_FF_BASE}/{year}/{month}/{slug}/"
                    post_html = await _fetch_text(post_url)
                    if post_html:
                        sets = _extract_abc_sets(post_html, post_url)
                        if sets:
                            text = await _fetch_text(sets[0]["abc_url"])

            if text is None:
                if _conn_error:
                    raise HTTPException(502, f"Could not reach flutefling.scot: {_conn_error[0]}")
                raise HTTPException(
                    404,
                    "Could not find an ABC (.txt) file for that PDF. "
                    "Try pasting the tune's page URL (e.g. flutefling.scot/2026/03/tune-name/) instead."
                )

        else:
            # Tune page URL — fetch HTML and scrape for the .txt link
            page_html = await _fetch_text(url)
            if page_html is None:
                raise HTTPException(404, "Page not found at that URL.")

            if "html" not in page_html[:50].lower() and not page_html.lstrip().startswith("<!"):
                # Treat as raw ABC text
                text = page_html
            else:
                sets = _extract_abc_sets(page_html, url)
                if not sets:
                    raise HTTPException(
                        404,
                        "No ABC sheet-music link found on that page. "
                        "Try pasting the direct .txt or .pdf file URL instead."
                    )
                text = await _fetch_text(sets[0]["abc_url"])
                if text is None:
                    raise HTTPException(502, "Found sheet-music link but could not fetch it.")

    tunes = parse_abc_string(text or "")
    if not tunes:
        raise HTTPException(404, "No ABC tunes found in the file.")
    return {
        "tunes": [
            {"title": t.title, "type": t.type, "key": t.key, "mode": t.mode, "abc": t.abc}
            for t in tunes
        ]
    }


_FF_TUNES_CACHE: tuple[float, list] | None = None


@app.get("/api/flutefling/all-tunes")
async def flutefling_all_tunes(refresh: bool = False):
    """
    Scrape the FlutefFling archive and return every individual tune as a flat list.
    Results are cached for 1 hour.
    """
    global _FF_TUNES_CACHE

    now = _time.time()
    if not refresh and _FF_TUNES_CACHE and now - _FF_TUNES_CACHE[0] < _FF_CACHE_TTL:
        return {"tunes": _FF_TUNES_CACHE[1], "cached": True}

    async with httpx.AsyncClient(follow_redirects=True) as client:
        page_html = await _ff_get(_FF_ARCHIVE_ROOT, client)
        if not page_html:
            raise HTTPException(502, f"Could not reach flutefling.scot — {_ff_last_error or 'check network access'}")

        parser = _PdfMp3Parser()
        parser.feed(page_html)
        all_tunes = parser.results

    if all_tunes:
        _FF_TUNES_CACHE = (now, all_tunes)
    return {"tunes": all_tunes, "cached": False}


@app.get("/api/flutefling/search")
async def flutefling_search(q: str = Query(..., min_length=1)):
    """
    Search the cached FlutefFling all-tunes list by title.
    Loads and caches the catalogue on first call; subsequent calls are instant.
    Returns up to 20 matches ordered by relevance (exact prefix > contains).
    """
    import asyncio as _asyncio

    # Reuse the all-tunes cache or trigger a load
    global _FF_TUNES_CACHE
    now = _time.time()

    if not _FF_TUNES_CACHE or now - _FF_TUNES_CACHE[0] >= _FF_CACHE_TTL:
        # Trigger a background load of the full catalogue so the cache is warm;
        # for the current request we do a synchronous (awaited) load instead.
        try:
            resp = await flutefling_all_tunes(refresh=False)
            tunes = resp.get("tunes", []) if isinstance(resp, dict) else []
        except Exception:
            tunes = []
    else:
        tunes = _FF_TUNES_CACHE[1]

    q_lower = q.strip().lower()

    def _score(t: dict) -> int:
        title = (t.get("title") or "").lower()
        if title == q_lower:
            return 0
        if title.startswith(q_lower):
            return 1
        if q_lower in title:
            return 2
        return 99

    matches = [t for t in tunes if q_lower in (t.get("title") or "").lower()]
    matches.sort(key=_score)
    return {"results": matches[:20]}


# ---------------------------------------------------------------------------
# Proxy download (FlutefFling PDF / MP3)
# ---------------------------------------------------------------------------

_ALLOWED_PROXY_HOSTS = {"flutefling.scot", "www.flutefling.scot"}


@app.get("/api/proxy-download")
async def proxy_download(url: str = Query(...)):
    """Proxy-fetch a FlutefFling PDF or MP3 and stream it back as a download.

    Only URLs on flutefling.scot are permitted.  The filename is derived from
    the last path segment of the URL.
    """
    from urllib.parse import urlparse

    parsed = urlparse(url)
    if parsed.scheme != "https" or parsed.netloc not in _ALLOWED_PROXY_HOSTS:
        raise HTTPException(400, "Only https://flutefling.scot/ URLs are supported.")

    filename = parsed.path.rstrip("/").rsplit("/", 1)[-1] or "download"

    # Detect content type from extension
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    content_type_map = {
        "pdf": "application/pdf",
        "mp3": "audio/mpeg",
        "m4a": "audio/mp4",
        "ogg": "audio/ogg",
    }
    content_type = content_type_map.get(ext, "application/octet-stream")

    try:
        client = httpx.AsyncClient(follow_redirects=True, timeout=30)
        req = client.build_request("GET", url, headers=_FF_HEADERS)
        resp = await client.send(req, stream=True)
        if resp.status_code >= 400:
            await resp.aclose()
            await client.aclose()
            raise HTTPException(resp.status_code, f"Remote returned {resp.status_code}")
    except httpx.RequestError as exc:
        raise HTTPException(502, f"Could not reach flutefling.scot: {exc}") from exc

    async def _stream():
        try:
            async for chunk in resp.aiter_bytes(chunk_size=65536):
                yield chunk
        finally:
            await resp.aclose()
            await client.aclose()

    return StreamingResponse(
        _stream(),
        media_type=content_type,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


# ---------------------------------------------------------------------------
# Dropbox endpoints
# ---------------------------------------------------------------------------

_DROPBOX_API     = "https://api.dropboxapi.com/2"
_DROPBOX_CONTENT = "https://content.dropboxapi.com/2"


def _dropbox_get_token() -> str | None:
    with _db() as conn:
        row = conn.execute(
            "SELECT value FROM app_settings WHERE key = 'dropbox_token'"
        ).fetchone()
    return row["value"] if row else None


class DropboxTokenBody(BaseModel):
    token: str


@app.get("/api/dropbox/settings")
def dropbox_settings():
    return {"token_set": bool(_dropbox_get_token())}


@app.post("/api/dropbox/settings")
def dropbox_save_settings(body: DropboxTokenBody):
    token = body.token.strip()
    if not token:
        raise HTTPException(400, "Token is required")
    with _db() as conn:
        conn.execute(
            "INSERT INTO app_settings (key, value) VALUES ('dropbox_token', ?) "
            "ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            (token,),
        )
    return {"ok": True}


@app.delete("/api/dropbox/settings")
def dropbox_clear_settings():
    with _db() as conn:
        conn.execute("DELETE FROM app_settings WHERE key = 'dropbox_token'")
    return {"ok": True}


class DropboxListBody(BaseModel):
    path: str = "/Tradwinds"


@app.post("/api/dropbox/list")
async def dropbox_list(body: DropboxListBody):
    """List files in a Dropbox folder."""
    token = _dropbox_get_token()
    if not token:
        raise HTTPException(401, "Dropbox token not configured")

    path = body.path.strip()
    if not path.startswith("/"):
        path = "/" + path
    db_path = "" if path == "/" else path

    async with httpx.AsyncClient(timeout=15) as client:
        try:
            resp = await client.post(
                f"{_DROPBOX_API}/files/list_folder",
                headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
                json={"path": db_path, "recursive": False},
            )
        except httpx.RequestError as exc:
            raise HTTPException(502, f"Could not reach Dropbox: {exc}")

    if resp.status_code == 401:
        raise HTTPException(401, "Invalid Dropbox token — please update it in settings.")
    if resp.status_code == 409:
        err = resp.json().get("error_summary", "path not found")
        raise HTTPException(404, f"Folder not found: {err}")
    if not resp.is_success:
        raise HTTPException(502, f"Dropbox returned {resp.status_code}")

    data = resp.json()
    files = []
    for entry in data.get("entries", []):
        tag = entry.get(".tag", "")
        name = entry["name"]
        if tag == "folder":
            files.append({"name": name, "path": entry["path_lower"], "type": "folder", "size": 0})
        elif tag == "file":
            ext = name.rsplit(".", 1)[-1].lower() if "." in name else ""
            if ext in ("abc", "txt", "pdf", "mp3", "m4a", "ogg"):
                files.append({
                    "name": name,
                    "path": entry["path_lower"],
                    "type": ext,
                    "size": entry.get("size", 0),
                })

    files.sort(key=lambda f: (0 if f["type"] == "folder" else 1, f["name"].lower()))
    return {"files": files, "has_more": data.get("has_more", False)}


class DropboxImportABC(BaseModel):
    path: str


@app.post("/api/dropbox/import-abc")
async def dropbox_import_abc(body: DropboxImportABC):
    """Download an ABC/TXT file from Dropbox and import tunes into the library."""
    token = _dropbox_get_token()
    if not token:
        raise HTTPException(401, "Dropbox token not configured")

    async with httpx.AsyncClient(timeout=30) as client:
        try:
            resp = await client.post(
                f"{_DROPBOX_CONTENT}/files/download",
                headers={
                    "Authorization": f"Bearer {token}",
                    "Dropbox-API-Arg": json.dumps({"path": body.path}),
                },
            )
        except httpx.RequestError as exc:
            raise HTTPException(502, f"Could not reach Dropbox: {exc}")

    if resp.status_code == 401:
        raise HTTPException(401, "Invalid Dropbox token")
    if not resp.is_success:
        raise HTTPException(502, f"Dropbox returned {resp.status_code}")

    try:
        text = resp.content.decode("utf-8")
    except UnicodeDecodeError:
        text = resp.content.decode("latin-1")

    tunes = parse_abc_string(text.strip())
    imported = 0
    skipped = 0
    filename = body.path.rsplit("/", 1)[-1]
    import_date = date.today().isoformat()

    with _db() as conn:
        for tune in tunes:
            if not tune.title:
                skipped += 1
                continue
            cur = conn.execute(
                "INSERT INTO tunes (craic_id, title, type, key, mode, abc, notes) VALUES (?, ?, ?, ?, ?, ?, ?)",
                (tune.craic_id, tune.title, tune.type, tune.key, tune.mode, tune.abc,
                 f"Imported from Dropbox: {filename} ({import_date})"),
            )
            tune_id = cur.lastrowid
            for alias in tune.aliases:
                conn.execute(
                    "INSERT OR IGNORE INTO tune_aliases (tune_id, alias) VALUES (?, ?)",
                    (tune_id, alias),
                )
            imported += 1

    return {"imported": imported, "skipped": skipped}


@app.get("/api/dropbox/file")
async def dropbox_proxy_file(path: str = Query(...)):
    """Proxy-stream a file from Dropbox using the stored access token."""
    token = _dropbox_get_token()
    if not token:
        raise HTTPException(401, "Dropbox token not configured")

    ext = path.rsplit(".", 1)[-1].lower() if "." in path else ""
    content_type_map = {
        "pdf": "application/pdf",
        "mp3": "audio/mpeg",
        "m4a": "audio/mp4",
        "ogg": "audio/ogg",
        "abc": "text/plain",
        "txt": "text/plain",
    }
    content_type = content_type_map.get(ext, "application/octet-stream")
    filename = path.rsplit("/", 1)[-1]

    try:
        client = httpx.AsyncClient(timeout=30)
        req = client.build_request(
            "POST",
            f"{_DROPBOX_CONTENT}/files/download",
            headers={
                "Authorization": f"Bearer {token}",
                "Dropbox-API-Arg": json.dumps({"path": path}),
            },
        )
        resp = await client.send(req, stream=True)
        if resp.status_code == 401:
            await resp.aclose()
            await client.aclose()
            raise HTTPException(401, "Invalid Dropbox token")
        if resp.status_code >= 400:
            await resp.aclose()
            await client.aclose()
            raise HTTPException(resp.status_code, f"Dropbox returned {resp.status_code}")
    except httpx.RequestError as exc:
        raise HTTPException(502, f"Could not reach Dropbox: {exc}") from exc

    async def _stream():
        try:
            async for chunk in resp.aiter_bytes(chunk_size=65536):
                yield chunk
        finally:
            await resp.aclose()
            await client.aclose()

    return StreamingResponse(
        _stream(),
        media_type=content_type,
        headers={"Content-Disposition": f'inline; filename="{filename}"'},
    )


# ---------------------------------------------------------------------------
# Library management — export / import / delete
# ---------------------------------------------------------------------------

_LIBRARY_TABLES = [
    "tunes", "tune_aliases", "tags", "tune_tags", "sets", "set_tunes",
    "collections", "collection_tunes",
    "achievements", "note_documents", "note_attachments", "app_settings",
    "theory_notes",
]


@app.get("/api/library/export")
def export_library(filename: str = Query(None)):
    """Export the entire library as a dated ZIP file."""
    today = date.today().isoformat()
    safe_filename = filename or f"ceol-backup-{today}.zip"

    conn = _db()
    data: dict = {}
    for table in _LIBRARY_TABLES:
        try:
            rows = conn.execute(f"SELECT * FROM {table}").fetchall()
            data[table] = [dict(r) for r in rows]
        except Exception:
            data[table] = []
    conn.close()

    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr("library.json", json.dumps(data, indent=2, default=str))
        if UPLOADS_DIR.exists():
            for f in UPLOADS_DIR.iterdir():
                if f.is_file():
                    z.write(f, f"uploads/{f.name}")
    buf.seek(0)

    return StreamingResponse(
        buf,
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="{safe_filename}"'},
    )


@app.post("/api/library/import")
async def import_library(file: UploadFile = File(...)):
    """Replace the entire library with the contents of a backup ZIP."""
    content = await file.read()
    buf = io.BytesIO(content)

    if not zipfile.is_zipfile(buf):
        raise HTTPException(400, "File is not a valid ZIP archive")
    buf.seek(0)

    with zipfile.ZipFile(buf, "r") as z:
        if "library.json" not in z.namelist():
            raise HTTPException(400, "ZIP does not contain library.json")
        data = json.loads(z.read("library.json"))

        conn = _db()
        try:
            # Clear in reverse dependency order
            for table in reversed(_LIBRARY_TABLES):
                try:
                    conn.execute(f"DELETE FROM {table}")
                except Exception:
                    pass

            # Insert in forward dependency order, preserving original IDs
            errors: list[str] = []
            counts: dict[str, int] = {}
            for table in _LIBRARY_TABLES:
                ok = 0
                for row in data.get(table, []):
                    cols = list(row.keys())
                    placeholders = ", ".join("?" for _ in cols)
                    col_names = ", ".join(cols)
                    values = [row[c] for c in cols]
                    try:
                        conn.execute(
                            f"INSERT INTO {table} ({col_names}) VALUES ({placeholders})",
                            values,
                        )
                        ok += 1
                    except Exception as e:
                        if len(errors) < 5:
                            errors.append(f"{table}[id={row.get('id')}]: {e}")
                counts[table] = ok

            conn.commit()
        finally:
            conn.close()

        # Restore uploaded files
        for name in z.namelist():
            if name.startswith("uploads/") and not name.endswith("/"):
                fname = name[len("uploads/"):]
                if fname:
                    dest = UPLOADS_DIR / fname
                    dest.write_bytes(z.read(name))

    return {"status": "ok", "counts": counts, "errors": errors}


@app.delete("/api/library")
def delete_library():
    """Permanently delete all library contents and uploaded files."""
    conn = _db()
    try:
        for table in reversed(_LIBRARY_TABLES):
            try:
                conn.execute(f"DELETE FROM {table}")
            except Exception:
                pass
        conn.commit()
    finally:
        conn.close()

    # Wipe uploaded files
    if UPLOADS_DIR.exists():
        shutil.rmtree(UPLOADS_DIR)
    UPLOADS_DIR.mkdir(parents=True, exist_ok=True)

    return {"status": "ok"}


# ---------------------------------------------------------------------------
# Serve the frontend SPA
# ---------------------------------------------------------------------------

app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")


@app.get("/")
def serve_index():
    return FileResponse(
        str(FRONTEND_DIR / "index.html"),
        headers={"Cache-Control": "no-store, must-revalidate"},
    )


@app.get("/mobile")
def serve_mobile():
    return FileResponse(
        str(FRONTEND_DIR / "mobile.html"),
        headers={"Cache-Control": "no-store, must-revalidate"},
    )


@app.get("/sw.js")
def serve_sw():
    return FileResponse(
        str(STATIC_DIR / "sw.js"),
        media_type="application/javascript",
        headers={"Cache-Control": "no-store, must-revalidate"},
    )
