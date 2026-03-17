"""
Ceol – Trad Music Web App
FastAPI backend serving tune data as JSON and the frontend SPA.
"""

from __future__ import annotations

import math
import os
import re
import tempfile
import uuid
from datetime import date
from pathlib import Path
from typing import Optional

import httpx
from fastapi import FastAPI, File, HTTPException, Query, UploadFile
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

import time as _time
from html.parser import HTMLParser as _HTMLParser
from urllib.parse import urljoin

from backend.abc_parser import parse_abc_file, parse_abc_string
from backend.database import DB_PATH, get_connection, init_db

app = FastAPI(title="Ceol", version="0.1.0")
init_db()

FRONTEND_DIR = Path(__file__).parent.parent / "frontend"
STATIC_DIR = FRONTEND_DIR / "static"
UPLOADS_DIR = Path(__file__).parent.parent / "data" / "uploads"
UPLOADS_DIR.mkdir(parents=True, exist_ok=True)

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
    """Update editable fields on a tune (title, type, key, mode, abc)."""
    fields = {k: v for k, v in body.model_dump().items() if v is not None}
    if not fields:
        raise HTTPException(400, "No fields to update")
    set_clause = ", ".join(f"{k} = ?" for k in fields)
    values = list(fields.values()) + [tune_id]
    with _db() as conn:
        cur = conn.execute(
            f"UPDATE tunes SET {set_clause}, updated_at = datetime('now') WHERE id = ?",
            values,
        )
        if cur.rowcount == 0:
            raise HTTPException(404, "Tune not found")
    return {"ok": True}


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
            SELECT t.id, t.title, t.type, t.key, t.mode, st.position, st.key_override
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
# TheSession.org endpoints
# ---------------------------------------------------------------------------

_SESSION_BASE = "https://thesession.org"
_SESSION_HEADERS = {"Accept": "application/json", "User-Agent": "Ceol/0.1 trad-music-app"}


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
    """Fetch a tune's ABC from TheSession.org by ID without saving it."""
    async with httpx.AsyncClient(headers=_SESSION_HEADERS, timeout=10) as client:
        try:
            resp = await client.get(f"{_SESSION_BASE}/tunes/{tune_id}", params={"format": "json"})
            resp.raise_for_status()
        except httpx.RequestError as exc:
            raise HTTPException(502, f"Could not reach TheSession.org: {exc}")
        except httpx.HTTPStatusError as exc:
            raise HTTPException(502, f"TheSession.org returned {exc.response.status_code}")

    data = resp.json()
    settings = data.get("settings", [])
    if not settings:
        raise HTTPException(404, "No ABC settings found for this tune")

    best = max(settings, key=lambda s: s.get("votes", 0))
    abc = best.get("abc", "")
    key = best.get("key", "")
    tune_type = data.get("type", "")
    title = data.get("name", "")
    aliases = [
        a.get("name") if isinstance(a, dict) else a
        for a in data.get("aliases", [])
        if (a.get("name") if isinstance(a, dict) else a)
    ]

    from backend.abc_parser import normalise_key
    key_norm, mode_norm = normalise_key(key) if key else (key, "")

    return {
        "session_id": tune_id,
        "title": title,
        "type": tune_type.lower() if tune_type else "",
        "key": key_norm,
        "mode": mode_norm,
        "abc": abc,
        "aliases": aliases,
    }


@app.post("/api/thesession/import")
async def thesession_import(body: dict):
    """Fetch a tune from TheSession.org by ID and save the top-voted setting."""
    tune_id = body.get("tune_id")
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
    settings = data.get("settings", [])
    if not settings:
        raise HTTPException(404, "No ABC settings found for this tune")

    # Pick the setting with the most votes; fall back to first
    best = max(settings, key=lambda s: s.get("votes", 0))
    abc = best.get("abc", "")
    key = best.get("key", "")
    tune_type = data.get("type", "")
    title = data.get("name", "")
    aliases = [
        a.get("name") if isinstance(a, dict) else a
        for a in data.get("aliases", [])
        if (a.get("name") if isinstance(a, dict) else a)
    ]

    # Normalise key/mode from TheSession format (e.g. "Dmaj", "Ador")
    from backend.abc_parser import normalise_key
    key_norm, mode_norm = normalise_key(key) if key else (key, "")

    with _db() as conn:
        # Avoid re-importing the same session_id
        existing = conn.execute(
            "SELECT id FROM tunes WHERE session_id = ?", (str(tune_id),)
        ).fetchone()
        if existing:
            return {"status": "exists", "tune_id": existing["id"], "title": title}

        import_date = date.today().isoformat()
        cur = conn.execute(
            "INSERT INTO tunes (session_id, title, type, key, mode, abc, notes) VALUES (?, ?, ?, ?, ?, ?, ?)",
            (str(tune_id), title, tune_type.lower() if tune_type else "", key_norm, mode_norm, abc,
             f"Imported from TheSession.org: {import_date}"),
        )
        new_id = cur.lastrowid
        for alias in aliases:
            conn.execute(
                "INSERT OR IGNORE INTO tune_aliases (tune_id, alias) VALUES (?, ?)",
                (new_id, alias),
            )

    return {"status": "imported", "tune_id": new_id, "title": title}


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
            "SELECT id, title, type, key, mode, version_label, notes "
            "FROM tunes WHERE parent_id = ? ORDER BY version_label COLLATE NOCASE",
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
        for tune_id, label in zip(body.tune_ids, body.labels):
            conn.execute(
                "UPDATE tunes SET parent_id = ?, version_label = ? WHERE id = ?",
                (parent_id, label.strip(), tune_id),
            )
    return {"id": parent_id, "title": title}


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
_FF_ARCHIVE_ROOT = f"{_FF_BASE}/resources/flutefling-repertoire-archive/"
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


async def _ff_get(url: str, client: httpx.AsyncClient) -> str | None:
    try:
        r = await client.get(url, headers=_FF_HEADERS, timeout=15, follow_redirects=True)
        r.raise_for_status()
        return r.text
    except Exception:
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
            raise HTTPException(502, "Could not reach flutefling.scot — check network access")

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
        # Step 1: build the set catalogue (reuses catalogue logic)
        index_html = await _ff_get(_FF_ARCHIVE_ROOT, client)
        if not index_html:
            raise HTTPException(502, "Could not reach flutefling.scot — check network access")

        idx_parser = _LinkParser()
        idx_parser.feed(index_html)

        subpage_urls: list[str] = [
            lk["href"] for lk in idx_parser.results
            if lk["href"].startswith(_FF_ARCHIVE_ROOT)
            and lk["href"].rstrip("/") != _FF_ARCHIVE_ROOT.rstrip("/")
        ]
        subpage_urls.append(f"{_FF_BASE}/tag/ne-session-tunes/")
        subpage_urls.append(f"{_FF_BASE}/resources/flutefling-session-tunes/")
        seen_sp: set[str] = set()
        subpage_urls = [u for u in subpage_urls if not (u in seen_sp or seen_sp.add(u))]  # type: ignore[func-returns-value]

        all_sets: list[dict] = _extract_abc_sets(index_html, _FF_ARCHIVE_ROOT)
        for page_url in subpage_urls:
            html = await _ff_get(page_url, client)
            if not html:
                continue
            page_sets = _extract_abc_sets(html, page_url)
            if not page_sets:
                tag_parser = _LinkParser()
                tag_parser.feed(html)
                post_urls = [
                    lk["href"] for lk in tag_parser.results
                    if re.match(r"https://flutefling\.scot/\d{4}/\d{2}/", lk["href"])
                ]
                for post_url in post_urls[:20]:
                    post_html = await _ff_get(post_url, client)
                    if post_html:
                        page_sets.extend(_extract_abc_sets(post_html, post_url))
            all_sets.extend(page_sets)

        seen_abc: set[str] = set()
        unique_sets = [s for s in all_sets if not (s["abc_url"] in seen_abc or seen_abc.add(s["abc_url"]))]  # type: ignore[func-returns-value]

        # Step 2: fetch all ABC files in parallel and parse into individual tunes
        async def _fetch_set_tunes(s: dict) -> list[dict]:
            html = await _ff_get(s["abc_url"], client)
            if not html:
                return []
            return [
                {
                    "title": t.title,
                    "type": t.type,
                    "key": t.key,
                    "mode": t.mode,
                    "abc": t.abc,
                    "set_label": s["label"],
                    "abc_url": s["abc_url"],
                    "source_page": s.get("source_page", ""),
                }
                for t in parse_abc_string(html)
            ]

        import asyncio as _asyncio
        results = await _asyncio.gather(*[_fetch_set_tunes(s) for s in unique_sets])

    all_tunes: list[dict] = []
    for chunk in results:
        all_tunes.extend(chunk)

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
# Serve the frontend SPA
# ---------------------------------------------------------------------------

app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")


@app.get("/")
def serve_index():
    return FileResponse(
        str(FRONTEND_DIR / "index.html"),
        headers={"Cache-Control": "no-store, must-revalidate"},
    )
