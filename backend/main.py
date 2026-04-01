"""
Ceol – Trad Music Web App
FastAPI backend serving tune data as JSON and the frontend SPA.
"""

from __future__ import annotations

import difflib
import io
import json
import math
import os
import re
import shutil
import socket
import subprocess
import tempfile
import uuid
import zipfile
from collections import defaultdict
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import List, Optional

import httpx
import PyPDF2
from fastapi import FastAPI, File, HTTPException, Query, UploadFile
from fastapi.responses import FileResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

import time as _time
from html.parser import HTMLParser as _HTMLParser
from urllib.parse import urljoin

from backend.abc_parser import (
    build_thecraic_block,
    classify_key,
    classify_type,
    parse_abc_file,
    parse_abc_string,
    parse_thecraic_export,
)
from backend.database import DB_PATH, get_connection, init_db

app = FastAPI(title="Ceol", version="0.1.0")
init_db()

# Auto-classify any tunes that have no type or key yet
def _auto_classify_untyped() -> None:
    """Fill in missing type and/or key for tunes using ABC headers + title heuristics."""
    with get_connection() as conn:
        rows = conn.execute(
            """SELECT id, title, abc, type, key FROM tunes
               WHERE (type IS NULL OR type = '') OR (key IS NULL OR key = '')"""
        ).fetchall()
        for tune_id, title, abc, cur_type, cur_key in rows:
            updates: dict = {}
            if not cur_type:
                t = classify_type(abc, title)
                if t:
                    updates["type"] = t
            if not cur_key:
                k, m = classify_key(abc)
                if k:
                    updates["key"] = k
                    updates["mode"] = m or ""
            if updates:
                cols = ", ".join(f"{c} = ?" for c in updates)
                conn.execute(
                    f"UPDATE tunes SET {cols}, updated_at = datetime('now') WHERE id = ?",
                    (*updates.values(), tune_id),
                )

_auto_classify_untyped()


def _abc_header(abc: str, field: str) -> str:
    """Extract value of an ABC header field, e.g. 'C' → composer, 'Z' → transcription."""
    if not abc:
        return ""
    m = re.search(rf"^{re.escape(field)}:(.+)$", abc, re.MULTILINE)
    return m.group(1).strip() if m else ""


def _normalise_composer(name: str) -> str:
    """
    Clean up a raw ABC C: / Z: value for storage and filtering.
    Strips page/tune-number annotations like (p.45), (pg. 23), (tune 4),
    (no. 12), removes leading "arr." / "arr " prefixes from transcription
    fields, and collapses whitespace.  Returns the cleaned name, or empty
    string if only noise remained.
    """
    if not name:
        return ""
    # Strip parenthetical page / tune / number references
    cleaned = re.sub(
        r"\s*\(\s*(?:p\.?|pg\.?|page|tune|no\.?|#)\s*\d+[^)]*\)",
        "", name, flags=re.IGNORECASE,
    )
    # Strip trailing numbers / page refs that appear without parens
    cleaned = re.sub(r"\s+(?:p\.?|pg\.?)\s*\d+\s*$", "", cleaned, flags=re.IGNORECASE)
    # Strip trailing commas/semicolons left by the above
    cleaned = re.sub(r"[,;]\s*$", "", cleaned)
    # Collapse whitespace
    cleaned = " ".join(cleaned.split())
    return cleaned


def _populate_composer_fields() -> None:
    """Parse C: and Z: from existing ABC and store in composer / transcribed_by.
    Also re-normalises any previously stored values (strips page refs, etc.)."""
    with get_connection() as conn:
        # Re-run on ALL tunes so previously stored page-number variants get cleaned
        rows = conn.execute("SELECT id, abc FROM tunes").fetchall()
        for row in rows:
            c = _normalise_composer(_abc_header(row["abc"], "C"))
            z = _normalise_composer(_abc_header(row["abc"], "Z"))
            if c or z:
                conn.execute(
                    "UPDATE tunes SET composer = ?, transcribed_by = ? WHERE id = ?",
                    (c, z, row["id"]),
                )


_populate_composer_fields()

_base_dir = os.environ.get("CEOL_BASE_DIR")
_data_dir = os.environ.get("CEOL_DATA_DIR")
FRONTEND_DIR = Path(_base_dir) / "frontend" if _base_dir else Path(__file__).parent.parent / "frontend"
STATIC_DIR = FRONTEND_DIR / "static"
UPLOADS_DIR = Path(_data_dir) / "uploads" if _data_dir else Path(__file__).parent.parent / "data" / "uploads"
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


def _normalize_title_for_grouping(title: str) -> str:
    """Return a canonical lowercase key used to detect duplicate titles.

    Handles the common trad-music convention of moving the leading article
    to the end with a comma, e.g.:
        "The Road to Banff"  →  "road to banff"
        "Road to Banff, The" →  "road to banff"

    Also strips leading track numbers so that "01 - My Tune" and "My Tune"
    match, which is common in MP3 collections.
    """
    t = title.strip().lower()
    # Strip leading track numbers like "01 ", "01 - ", "1. ", "01_"
    t = re.sub(r"^\d+[\s\-_\.]+", "", t).strip()
    for suffix, prefix in ((", the", "the "), (", a", "a "), (", an", "an ")):
        if t.endswith(suffix):
            t = prefix + t[: -len(suffix)].strip()
            break
    # Strip the leading article so both forms share a common key
    for article in ("the ", "a ", "an "):
        if t.startswith(article):
            t = t[len(article):]
            break
    return t


def _do_auto_group(conn) -> int:
    """Group standalone tunes that share the same title. Returns count of new groups created."""
    rows = conn.execute(
        "SELECT id, title, type, key, abc FROM tunes WHERE parent_id IS NULL ORDER BY id"
    ).fetchall()
    groups: dict = defaultdict(list)
    for row in rows:
        groups[_normalize_title_for_grouping(row["title"])].append(dict(row))
    grouped = 0
    for tunes in groups.values():
        if len(tunes) < 2:
            continue
        # Prefer the "The X" form as the parent title; fall back to first by id
        def _canonical(t):
            raw = t["title"].strip()
            lower = raw.lower()
            for suffix, article in ((", the", "The "), (", a", "A "), (", an", "An ")):
                if lower.endswith(suffix):
                    return article + raw[: -len(suffix)].strip()
            return raw
        title = _canonical(tunes[0])
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


def _dedup_versions(conn) -> int:
    """Remove empty and ABC-identical versions within every versioned group.

    A version is considered empty if it has no ABC, no notes, no key, no type,
    and no source_url.  When two versions share identical ABC (after stripping
    whitespace) the one with the higher rating is kept; ties go to the lower id.
    After removal, if only one version remains the group is automatically
    ungrouped.  Returns the number of versions removed.
    """
    import re

    def _norm_abc(abc: str) -> str:
        return re.sub(r"\s+", "", abc or "").lower()

    parents = conn.execute(
        "SELECT id FROM tunes WHERE abc = '' AND "
        "(SELECT COUNT(*) FROM tunes c WHERE c.parent_id = tunes.id) > 0"
    ).fetchall()

    removed = 0
    for (parent_id,) in parents:
        versions = conn.execute(
            "SELECT id, abc, notes, source_url, key, type, rating FROM tunes "
            "WHERE parent_id = ? ORDER BY id",
            (parent_id,),
        ).fetchall()

        to_delete: list[int] = []
        seen_abc: dict[str, int] = {}  # norm_abc → kept id

        for v in versions:
            norm = _norm_abc(v["abc"])
            is_empty = (
                not norm
                and not (v["notes"] or "").strip()
                and not (v["key"] or "").strip()
                and not (v["type"] or "").strip()
                and not (v["source_url"] or "").strip()
            )
            if is_empty:
                to_delete.append(v["id"])
                continue
            if norm:
                if norm in seen_abc:
                    existing_id = seen_abc[norm]
                    existing = next(x for x in versions if x["id"] == existing_id)
                    if (v["rating"] or 0) > (existing["rating"] or 0):
                        to_delete.append(existing_id)
                        seen_abc[norm] = v["id"]
                    else:
                        to_delete.append(v["id"])
                else:
                    seen_abc[norm] = v["id"]

        for vid in to_delete:
            # Unlink any child tunes that reference this one as their parent
            conn.execute(
                "UPDATE tunes SET parent_id = NULL, version_label = '', is_default = 0 "
                "WHERE parent_id = ?", (vid,)
            )
            conn.execute("DELETE FROM tune_aliases WHERE tune_id = ?", (vid,))
            conn.execute("DELETE FROM tune_tags WHERE tune_id = ?", (vid,))
            conn.execute("DELETE FROM set_tunes WHERE tune_id = ?", (vid,))
            conn.execute("DELETE FROM collection_tunes WHERE tune_id = ?", (vid,))
            conn.execute("DELETE FROM tunes WHERE id = ?", (vid,))
            removed += 1

        remaining = conn.execute(
            "SELECT id FROM tunes WHERE parent_id = ?", (parent_id,)
        ).fetchall()
        if len(remaining) == 1:
            conn.execute(
                "UPDATE tunes SET parent_id = NULL, version_label = '', is_default = 0 WHERE id = ?",
                (remaining[0]["id"],),
            )
            conn.execute("DELETE FROM tunes WHERE id = ?", (parent_id,))
        elif len(remaining) == 0:
            conn.execute("DELETE FROM tunes WHERE id = ?", (parent_id,))

    return removed


_rotate_db_backup()
_write_info_file()
with get_connection() as _startup_conn:
    _do_auto_group(_startup_conn)
    _dedup_versions(_startup_conn)

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
    favourite: Optional[int] = Query(None, description="1 = favourites only"),
    min_rating: Optional[int] = Query(None, ge=1, le=5, description="Minimum star rating"),
    collection_id: Optional[int] = Query(None, description="Filter by collection ID"),
    composer: Optional[str] = Query(None, description="Filter by composer"),
    transcribed_by: Optional[str] = Query(None, description="Filter by ABC transcriber"),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=10000),
):
    conditions: list[str] = ["t.parent_id IS NULL"]
    params: list = []

    if q:
        # Normalise query: strip punctuation and lowercase for a forgiving search
        import re as _re
        q_norm = _re.sub(r"[^\w\s]", "", q, flags=_re.UNICODE).lower()
        like = f"%{q_norm}%"
        conditions.append(
            "(search_norm(t.title) LIKE ? OR EXISTS "
            "(SELECT 1 FROM tune_aliases a WHERE a.tune_id = t.id AND search_norm(a.alias) LIKE ?))"
        )
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

    if favourite:
        conditions.append("t.is_favourite = 1")


    if min_rating is not None:
        conditions.append("t.rating >= ?")
        params.append(min_rating)

    if collection_id is not None:
        conditions.append(
            "EXISTS (SELECT 1 FROM collection_tunes ct WHERE ct.tune_id = t.id AND ct.collection_id = ?)"
        )
        params.append(collection_id)

    if composer:
        conditions.append("t.composer LIKE ?")
        params.append(f"%{composer}%")

    if transcribed_by:
        conditions.append("t.transcribed_by LIKE ?")
        params.append(f"%{transcribed_by}%")

    where = ("WHERE " + " AND ".join(conditions)) if conditions else ""
    offset = (page - 1) * page_size

    with _db() as conn:
        total = conn.execute(
            f"SELECT COUNT(*) FROM tunes t {where}", params
        ).fetchone()[0]

        rows = conn.execute(
            f"""
            SELECT t.id, t.craic_id, t.session_id, t.title,
                   COALESCE(NULLIF(t.type,''),
                     (SELECT v.type FROM tunes v
                      WHERE v.parent_id = t.id AND v.type != ''
                      ORDER BY v.id LIMIT 1)) AS type,
                   COALESCE(NULLIF(t.key,''),
                     (SELECT v.key FROM tunes v
                      WHERE v.parent_id = t.id AND v.key != ''
                      ORDER BY v.id LIMIT 1)) AS key,
                   t.mode, t.notes, t.imported_at, t.created_at,
                   t.rating, t.on_hitlist, t.is_favourite,
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


@app.get("/api/tunes/recent")
def get_recent_tunes(days: int = Query(7, ge=1, le=365)):
    """Return tunes imported within the last `days` days, newest first."""
    cutoff = (datetime.utcnow() - timedelta(days=days)).strftime("%Y-%m-%d %H:%M:%S")
    with _db() as conn:
        rows = conn.execute(
            "SELECT id, title, type, key, mode, imported_at, parent_id"
            " FROM tunes WHERE imported_at >= ? ORDER BY imported_at DESC",
            (cutoff,),
        ).fetchall()
    return [dict(r) for r in rows]


# ---------------------------------------------------------------------------
# Version suggestions — must be declared before /api/tunes/{tune_id}
# ---------------------------------------------------------------------------

_TITLE_STOP_WORDS = frozenset({
    "the", "a", "an",                                   # articles
    "jig", "reel", "hornpipe", "polka", "waltz", "slip",
    "strathspey", "march", "slide", "mazurka", "barndance",  # tune types
})


def _title_meaningful_words(title: str) -> frozenset:
    """Return the set of meaningful words in a title (no articles, no tune types)."""
    words = re.sub(r"[^\w\s]", "", title.lower()).split()
    meaningful = frozenset(w for w in words if w not in _TITLE_STOP_WORDS)
    # Fall back to all words if stripping leaves nothing (e.g. title is just "Jig")
    return meaningful if meaningful else frozenset(words)


def _title_similarity(a: str, b: str) -> float:
    """Jaccard similarity on meaningful title words.

    This avoids false positives from shared articles or tune-type suffixes
    (e.g. 'The Kesh Jig' vs 'The Morning Jig' → 0.0, not 0.6).
    """
    wa = _title_meaningful_words(a)
    wb = _title_meaningful_words(b)
    if not wa and not wb:
        return 1.0
    if not wa or not wb:
        return 0.0
    return len(wa & wb) / len(wa | wb)


@app.get("/api/tunes/version-suggestions")
def get_version_suggestions():
    """Return pairs of standalone tunes whose names are >50% similar (not dismissed)."""
    with _db() as conn:
        tunes = conn.execute(
            "SELECT id, title FROM tunes "
            "WHERE parent_id IS NULL "
            "AND (SELECT COUNT(*) FROM tunes c WHERE c.parent_id = tunes.id) = 0 "
            "ORDER BY id"
        ).fetchall()
        dismissed = {
            (r["tune_id_a"], r["tune_id_b"])
            for r in conn.execute("SELECT tune_id_a, tune_id_b FROM dismissed_groupings").fetchall()
        }

    tunes = [dict(t) for t in tunes]
    suggestions = []
    for i, a in enumerate(tunes):
        for b in tunes[i + 1:]:
            pair = (min(a["id"], b["id"]), max(a["id"], b["id"]))
            if pair in dismissed:
                continue
            sim = _title_similarity(a["title"], b["title"])
            if sim > 0.5:
                suggestions.append({
                    "tune_a": {"id": a["id"], "title": a["title"]},
                    "tune_b": {"id": b["id"], "title": b["title"]},
                    "similarity": round(sim, 2),
                })
                if len(suggestions) >= 20:
                    break
        if len(suggestions) >= 20:
            break

    suggestions.sort(key=lambda x: x["similarity"], reverse=True)
    return suggestions


class DismissGroupingBody(BaseModel):
    tune_id_a: int
    tune_id_b: int


@app.post("/api/tunes/version-suggestions/dismiss")
def dismiss_version_suggestion(body: DismissGroupingBody):
    """Permanently dismiss a version suggestion so it is never shown again."""
    a, b = min(body.tune_id_a, body.tune_id_b), max(body.tune_id_a, body.tune_id_b)
    with _db() as conn:
        conn.execute("INSERT OR IGNORE INTO dismissed_groupings VALUES (?, ?)", (a, b))
    return {"ok": True}


# ---------------------------------------------------------------------------

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


class HighlightsUpdate(BaseModel):
    highlights: list = []


@app.put("/api/tunes/{tune_id}/highlights")
def update_highlights(tune_id: int, body: HighlightsUpdate):
    with _db() as conn:
        conn.execute(
            "UPDATE tunes SET highlights=? WHERE id=?",
            (json.dumps(body.highlights), tune_id),
        )
    return {"ok": True}


class NotesUpdate(BaseModel):
    notes: str = ""


def _delete_tune_in_conn(conn, tune_id: int) -> None:
    """Delete a single tune and clean up; auto-ungroups parent if ≤1 version remains."""
    tune = conn.execute("SELECT parent_id FROM tunes WHERE id = ?", (tune_id,)).fetchone()
    if not tune:
        raise HTTPException(status_code=404, detail="Tune not found")
    parent_id = tune["parent_id"]
    # Promote any child versions to standalone (if this tune is itself a parent)
    conn.execute(
        "UPDATE tunes SET parent_id = NULL, version_label = '', is_default = 0 WHERE parent_id = ?",
        (tune_id,),
    )
    conn.execute("DELETE FROM tune_aliases WHERE tune_id = ?", (tune_id,))
    conn.execute("DELETE FROM tune_tags WHERE tune_id = ?", (tune_id,))
    conn.execute("DELETE FROM set_tunes WHERE tune_id = ?", (tune_id,))
    conn.execute("DELETE FROM tunes WHERE id = ?", (tune_id,))
    # If we deleted a version, check whether the parent should be auto-ungrouped
    if parent_id:
        remaining = conn.execute(
            "SELECT id FROM tunes WHERE parent_id = ?", (parent_id,)
        ).fetchall()
        if len(remaining) == 1:
            # Sole version left — promote it to standalone and delete the empty parent
            conn.execute(
                "UPDATE tunes SET parent_id = NULL, version_label = '', is_default = 0 WHERE id = ?",
                (remaining[0]["id"],),
            )
            conn.execute("DELETE FROM tunes WHERE id = ?", (parent_id,))
        elif len(remaining) == 0:
            conn.execute("DELETE FROM tunes WHERE id = ?", (parent_id,))


@app.delete("/api/tunes/{tune_id}")
def delete_tune(tune_id: int):
    with _db() as conn:
        _delete_tune_in_conn(conn, tune_id)
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
            try:
                _delete_tune_in_conn(conn, tid)
            except HTTPException:
                pass  # skip already-deleted tunes
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
    is_favourite: Optional[int] = None
    composer: Optional[str] = None
    transcribed_by: Optional[str] = None


@app.patch("/api/tunes/{tune_id}")
def update_tune(tune_id: int, body: TuneUpdate):
    """Update editable fields on a tune and auto-log rating/hitlist changes."""
    fields = {k: v for k, v in body.model_dump().items() if v is not None}
    if not fields:
        raise HTTPException(400, "No fields to update")
    # Auto-extract composer/transcribed_by from updated ABC if not explicitly set
    if "abc" in fields and "composer" not in fields and "transcribed_by" not in fields:
        c = _normalise_composer(_abc_header(fields["abc"], "C"))
        z = _normalise_composer(_abc_header(fields["abc"], "Z"))
        if c:
            fields["composer"] = c
        if z:
            fields["transcribed_by"] = z
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
        rating_labels = ["Unrated","Just starting","Getting there",
                         "Almost there","Know it well","Nailed it!"]
        if "rating" in fields:
            new_r, old_r = fields["rating"], old["rating"] or 0
            if new_r > old_r and new_r > 0:
                conn.execute(
                    "INSERT INTO achievements (type, tune_id, tune_title, note) VALUES (?,?,?,?)",
                    ("rating_up", tune_id, old["title"],
                     f"Mastery improved to {rating_labels[new_r]} ({new_r}★) — {old['title']}"),
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


@app.post("/api/tunes/{tune_id}/upload-video", status_code=201)
async def upload_tune_video(tune_id: int, file: UploadFile = File(...)):
    """Upload a video file; returns the URL for the caller to add to notes."""
    UPLOADS_DIR.mkdir(parents=True, exist_ok=True)
    with _db() as conn:
        if not conn.execute("SELECT 1 FROM tunes WHERE id = ?", (tune_id,)).fetchone():
            raise HTTPException(404, "Tune not found")
    content = await file.read()
    ext = Path(file.filename).suffix if file.filename else ".mp4"
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
                "SELECT DISTINCT type FROM tunes WHERE type IS NOT NULL AND type != '' ORDER BY type"
            ).fetchall()
        ]
        keys = [
            r[0] for r in conn.execute(
                "SELECT DISTINCT key FROM tunes WHERE key IS NOT NULL AND key != '' ORDER BY key"
            ).fetchall()
        ]
        modes = [
            r[0] for r in conn.execute(
                "SELECT DISTINCT mode FROM tunes WHERE mode IS NOT NULL AND mode != '' ORDER BY mode"
            ).fetchall()
        ]
        composers = [
            r[0] for r in conn.execute(
                "SELECT DISTINCT composer FROM tunes WHERE composer IS NOT NULL AND composer != '' ORDER BY composer COLLATE NOCASE"
            ).fetchall()
        ]
        transcribers = [
            r[0] for r in conn.execute(
                "SELECT DISTINCT transcribed_by FROM tunes WHERE transcribed_by IS NOT NULL AND transcribed_by != '' ORDER BY transcribed_by COLLATE NOCASE"
            ).fetchall()
        ]
    return {"types": types, "keys": keys, "modes": modes, "composers": composers, "transcribers": transcribers}


# ---------------------------------------------------------------------------
# Circle of Fifths set builder
# ---------------------------------------------------------------------------

# Key signature sharps count for common trad music keys.
# Same count → same key signature (modes on the same key).
# ±1 → fifth apart on the circle.
_COF_KEY_SIGS: dict[str, int] = {
    # Major
    "C major": 0,  "G major": 1,  "D major": 2,  "A major": 3,
    "E major": 4,  "B major": 5,  "F# major": 6,
    "F major": -1, "Bb major": -2, "Eb major": -3, "Ab major": -4,
    # Minor / aeolian
    "A minor": 0,  "A aeolian": 0,
    "E minor": 1,  "E aeolian": 1,
    "B minor": 2,  "B aeolian": 2,
    "F# minor": 3, "F# aeolian": 3,
    "C# minor": 4, "G# minor": 5,
    "D minor": -1, "G minor": -2, "C minor": -3,
    # Dorian
    "D dorian": 0, "A dorian": 1, "E dorian": 2, "B dorian": 3,
    "F# dorian": 4, "G dorian": -1, "C dorian": -2,
    # Mixolydian
    "G mixolydian": 0, "D mixolydian": 1, "A mixolydian": 2,
    "E mixolydian": 3, "C mixolydian": -1, "F mixolydian": -2,
}

_COF_TEMPLATES = [
    {
        "id": 1,
        "name": "G–D–E Triangle",
        "description": "Neighbours on the circle + relative minor. Most common Irish set shape.",
        "slots": ["G major", "D major", "E dorian"],
    },
    {
        "id": 2,
        "name": "A–B Pair",
        "description": "A major into B dorian — same key signature, common in Scottish music.",
        "slots": ["A major", "B dorian"],
    },
    {
        "id": 3,
        "name": "D–A Fifth",
        "description": "Up a fifth from D to A. The set brightens as it goes.",
        "slots": ["D major", "A major"],
    },
    {
        "id": 4,
        "name": "Modal Journey",
        "description": "A dorian → G major → D major. Introduces the C♯ as the set progresses.",
        "slots": ["A dorian", "G major", "D major"],
    },
]


@app.get("/api/circle-of-fifths/templates")
def cof_templates(
    type: Optional[str] = Query(None),
    min_rating: Optional[int] = Query(None, ge=1, le=5),
    collection_id: Optional[int] = Query(None),
):
    """Return the 4 set templates with tune counts per slot (optionally filtered by type/rating/collection)."""
    with _db() as conn:
        result = []
        for tmpl in _COF_TEMPLATES:
            slot_counts = []
            for key in tmpl["slots"]:
                params: list = [key]
                extra = ""
                if type:
                    extra += " AND type = ?"
                    params.append(type.lower())
                if min_rating is not None:
                    extra += " AND rating >= ?"
                    params.append(min_rating)
                if collection_id is not None:
                    extra += " AND EXISTS (SELECT 1 FROM collection_tunes ct WHERE ct.tune_id = id AND ct.collection_id = ?)"
                    params.append(collection_id)
                count = conn.execute(
                    f"SELECT COUNT(*) FROM tunes WHERE key = ? AND parent_id IS NULL{extra}",
                    params,
                ).fetchone()[0]
                slot_counts.append(count)
            result.append({**tmpl, "slot_counts": slot_counts})
    return result


@app.get("/api/circle-of-fifths/compatible")
def cof_compatible(
    key: str = Query(..., description="Current key, e.g. 'D major'"),
    type: Optional[str] = Query(None, description="Filter by tune type"),
    min_rating: Optional[int] = Query(None, ge=1, le=5),
    collection_id: Optional[int] = Query(None),
):
    """Given a key, return compatible next keys grouped by CoF relationship, with matching tunes."""
    current_sig = _COF_KEY_SIGS.get(key)

    groups_def = [
        {"relationship": "Same key signature", "delta": 0},
        {"relationship": "Up a fifth (brighter)", "delta": 1},
        {"relationship": "Down a fifth (mellower)", "delta": -1},
        {"relationship": "Two steps up", "delta": 2},
        {"relationship": "Two steps down", "delta": -2},
    ]

    # Build reusable extra condition + params suffix for rating/collection filters
    extra_cond = ""
    extra_params: list = []
    if min_rating is not None:
        extra_cond += " AND rating >= ?"
        extra_params.append(min_rating)
    if collection_id is not None:
        extra_cond += " AND EXISTS (SELECT 1 FROM collection_tunes ct WHERE ct.tune_id = id AND ct.collection_id = ?)"
        extra_params.append(collection_id)

    with _db() as conn:
        type_cond = " AND type = ?" if type else ""
        type_param: list = [type.lower()] if type else []

        db_keys = [
            r[0]
            for r in conn.execute(
                f"SELECT DISTINCT key FROM tunes WHERE key IS NOT NULL AND key != ''"
                f" AND parent_id IS NULL{type_cond}{extra_cond}",
                type_param + extra_params,
            ).fetchall()
        ]

        result_groups = []

        if current_sig is not None:
            for gdef in groups_def:
                target_sig = current_sig + gdef["delta"]
                matching_keys = [
                    k for k in db_keys
                    if _COF_KEY_SIGS.get(k) == target_sig
                    and (gdef["delta"] != 0 or k != key)
                ]
                if not matching_keys:
                    continue
                placeholders = ",".join("?" * len(matching_keys))
                cond = f"key IN ({placeholders})"
                params: list = list(matching_keys)
                if type:
                    cond += " AND type = ?"
                    params.append(type.lower())
                cond += extra_cond
                params.extend(extra_params)
                tunes = conn.execute(
                    f"""SELECT id, title, type, key, mode, rating, on_hitlist, is_favourite, abc
                        FROM tunes WHERE {cond} AND parent_id IS NULL
                        ORDER BY key, title COLLATE NOCASE""",
                    params,
                ).fetchall()
                if tunes:
                    group_tunes = [dict(t) for t in tunes]
                    group_keys = list(matching_keys)

                    # Expand: for every dorian key in this group, also include
                    # the same-root natural minor (e.g. B dorian → B minor)
                    extra_minor_keys = [
                        f"{k[: -len(' dorian')]} minor"
                        for k in group_keys
                        if k.endswith(" dorian")
                        and f"{k[: -len(' dorian')]} minor" in db_keys
                        and f"{k[: -len(' dorian')]} minor" not in group_keys
                    ]
                    if extra_minor_keys:
                        ph2 = ",".join("?" * len(extra_minor_keys))
                        cond2 = f"key IN ({ph2})"
                        params2: list = list(extra_minor_keys)
                        if type:
                            cond2 += " AND type = ?"
                            params2.append(type.lower())
                        cond2 += extra_cond
                        params2.extend(extra_params)
                        extra_rows = conn.execute(
                            f"""SELECT id, title, type, key, mode, rating,
                                       on_hitlist, is_favourite, abc
                                FROM tunes WHERE {cond2} AND parent_id IS NULL
                                ORDER BY key, title COLLATE NOCASE""",
                            params2,
                        ).fetchall()
                        group_keys.extend(extra_minor_keys)
                        group_tunes.extend([dict(r) for r in extra_rows])
                        group_tunes.sort(key=lambda t: (t["key"] or "", t["title"] or ""))

                    result_groups.append({
                        "relationship": gdef["relationship"],
                        "keys": group_keys,
                        "tunes": group_tunes,
                    })
        else:
            # Key not in map — return all other tunes as a fallback group
            cond = "key != ?" if key else "1=1"
            params = [key] if key else []
            if type:
                cond += " AND type = ?"
                params.append(type.lower())
            cond += extra_cond
            params.extend(extra_params)
            tunes = conn.execute(
                f"""SELECT id, title, type, key, mode, rating, on_hitlist, is_favourite, abc
                    FROM tunes WHERE {cond} AND parent_id IS NULL
                    ORDER BY key, title COLLATE NOCASE""",
                params,
            ).fetchall()
            if tunes:
                result_groups.append({
                    "relationship": "Other tunes",
                    "keys": list({t["key"] for t in tunes if t["key"]}),
                    "tunes": [dict(t) for t in tunes],
                })

    return {
        "current_key": key,
        "current_key_known": current_sig is not None,
        "groups": result_groups,
    }


@app.post("/api/classify-types")
def api_classify_types(force: bool = False):
    """
    Infer and set the type and key fields for tunes using ABC headers and
    title keywords.  By default only fills in missing values; pass
    ?force=true to re-classify every tune (useful for fixing wrong labels).
    """
    type_count = 0
    key_count = 0
    details: list[dict] = []
    with get_connection() as conn:
        if force:
            rows = conn.execute(
                "SELECT id, title, abc, type, key FROM tunes"
            ).fetchall()
        else:
            rows = conn.execute(
                """SELECT id, title, abc, type, key FROM tunes
                   WHERE (type IS NULL OR type = '') OR (key IS NULL OR key = '')"""
            ).fetchall()
        for tune_id, title, abc, old_type, old_key in rows:
            updates: dict = {}
            entry: dict = {"id": tune_id, "title": title}
            if force or not old_type:
                t = classify_type(abc, title)
                if t and t != old_type:
                    updates["type"] = t
                    entry["type"] = t
                    entry["was_type"] = old_type
                    type_count += 1
            if force or not old_key:
                k, m = classify_key(abc)
                if k and k != old_key:
                    updates["key"] = k
                    updates["mode"] = m or ""
                    entry["key"] = k
                    entry["was_key"] = old_key
                    key_count += 1
            if updates:
                cols = ", ".join(f"{c} = ?" for c in updates)
                conn.execute(
                    f"UPDATE tunes SET {cols}, updated_at = datetime('now') WHERE id = ?",
                    (*updates.values(), tune_id),
                )
                details.append(entry)
    return {
        "types_set": type_count,
        "keys_set": key_count,
        "total": len(rows),
        "details": details,
    }


@app.get("/api/links")
def list_user_links():
    with _db() as conn:
        rows = conn.execute(
            "SELECT id, label, url, emoji FROM user_links ORDER BY id"
        ).fetchall()
    return [dict(r) for r in rows]


class UserLinkBody(BaseModel):
    label: str
    url: str
    emoji: str = "🔗"


@app.post("/api/links", status_code=201)
def create_user_link(body: UserLinkBody):
    with _db() as conn:
        cur = conn.execute(
            "INSERT INTO user_links (label, url, emoji) VALUES (?, ?, ?)",
            (body.label.strip(), body.url.strip(), body.emoji.strip() or "🔗"),
        )
        row = conn.execute(
            "SELECT id, label, url, emoji FROM user_links WHERE id = ?",
            (cur.lastrowid,),
        ).fetchone()
    return dict(row)


@app.delete("/api/links/{link_id}")
def delete_user_link(link_id: int):
    with _db() as conn:
        conn.execute("DELETE FROM user_links WHERE id = ?", (link_id,))
    return {"ok": True}


@app.get("/api/info")
def get_info():
    bak1 = DB_PATH.parent / "ceol.db.bak1"
    bak2 = DB_PATH.parent / "ceol.db.bak2"
    # Detect the local network IP so user can access from phone
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        local_ip = s.getsockname()[0]
        s.close()
    except Exception:
        local_ip = None
    port = int(os.environ.get("PORT", 8001))
    mobile_url = f"http://{local_ip}:{port}/mobile" if local_ip else None
    desktop_url = f"http://{local_ip}:{port}" if local_ip else None
    return {
        "app_dir": str(APP_DIR),
        "database": str(DB_PATH.resolve()),
        "backup1": str(bak1.resolve()) if bak1.exists() else None,
        "backup2": str(bak2.resolve()) if bak2.exists() else None,
        "uploads": str(UPLOADS_DIR.resolve()),
        "info_file": str((DB_PATH.parent / "app_info.txt").resolve()),
        "local_ip": local_ip,
        "mobile_url": mobile_url,
        "desktop_url": desktop_url,
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
            "SELECT id, name, notes, is_favourite, rating, created_at FROM sets ORDER BY name COLLATE NOCASE"
        ).fetchall()
        result = []
        for r in rows:
            s = dict(r)
            s["tune_count"] = conn.execute(
                "SELECT COUNT(*) FROM set_tunes WHERE set_id = ?", (s["id"],)
            ).fetchone()[0]
            result.append(s)
    return result


class SetUpdate(BaseModel):
    name: Optional[str] = None
    notes: Optional[str] = None
    is_favourite: Optional[int] = None
    rating: Optional[int] = None


@app.patch("/api/sets/{set_id}")
def update_set(set_id: int, body: SetUpdate):
    fields = {k: v for k, v in body.model_dump().items() if v is not None}
    if not fields:
        raise HTTPException(400, "No fields to update")
    set_clause = ", ".join(f"{k} = ?" for k in fields)
    values = list(fields.values()) + [set_id]
    with _db() as conn:
        cur = conn.execute(
            f"UPDATE sets SET {set_clause} WHERE id = ?", values
        )
        if cur.rowcount == 0:
            raise HTTPException(404, "Set not found")
    return {"ok": True}


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
        conn.execute("DELETE FROM collection_sets WHERE set_id = ?", (set_id,))
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
            c["set_count"] = conn.execute(
                "SELECT COUNT(*) FROM collection_sets WHERE collection_id = ?", (c["id"],)
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
        sets = conn.execute(
            """
            SELECT s.id, s.name, s.rating, s.is_favourite, cs.added_at,
                   (SELECT COUNT(*) FROM set_tunes WHERE set_id = s.id) AS tune_count
            FROM collection_sets cs
            JOIN sets s ON s.id = cs.set_id
            WHERE cs.collection_id = ?
            ORDER BY s.name COLLATE NOCASE
            """,
            (col_id,),
        ).fetchall()
    result = dict(c)
    result["tunes"] = [dict(t) for t in tunes]
    result["sets"] = [dict(s) for s in sets]
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


class CollectionSetAdd(BaseModel):
    set_id: int


@app.post("/api/collections/{col_id}/sets", status_code=201)
def add_set_to_collection(col_id: int, body: CollectionSetAdd):
    with _db() as conn:
        if not conn.execute("SELECT 1 FROM collections WHERE id = ?", (col_id,)).fetchone():
            raise HTTPException(404, "Collection not found")
        if not conn.execute("SELECT 1 FROM sets WHERE id = ?", (body.set_id,)).fetchone():
            raise HTTPException(404, "Set not found")
        if conn.execute(
            "SELECT 1 FROM collection_sets WHERE collection_id = ? AND set_id = ?",
            (col_id, body.set_id),
        ).fetchone():
            return {"ok": True, "added": False}
        conn.execute(
            "INSERT INTO collection_sets (collection_id, set_id) VALUES (?, ?)",
            (col_id, body.set_id),
        )
    return {"ok": True, "added": True}


@app.delete("/api/collections/{col_id}/sets/{set_id}")
def remove_set_from_collection(col_id: int, set_id: int):
    with _db() as conn:
        cur = conn.execute(
            "DELETE FROM collection_sets WHERE collection_id = ? AND set_id = ?",
            (col_id, set_id),
        )
        if cur.rowcount == 0:
            raise HTTPException(404, "Set not in collection")
    return {"ok": True}


@app.post("/api/tunes/{tune_id}/strip-chords")
def strip_tune_chords(tune_id: int):
    """Remove guitar chord symbols (quoted strings) from a single tune's ABC."""
    header_re = re.compile(r'^[A-Za-z%]\s*:')
    chord_re  = re.compile(r'"[^"]*"')

    def _strip(abc: str) -> str:
        lines = []
        for line in abc.splitlines():
            if header_re.match(line.strip()):
                lines.append(line)
            else:
                lines.append(chord_re.sub("", line))
        return "\n".join(lines)

    with _db() as conn:
        row = conn.execute("SELECT abc FROM tunes WHERE id = ?", (tune_id,)).fetchone()
        if not row:
            raise HTTPException(404, "Tune not found")
        old_abc = row["abc"] or ""
        new_abc = _strip(old_abc)
        removed = len(re.findall(r'"[^"]*"', old_abc)) - len(re.findall(r'"[^"]*"', new_abc))
        conn.execute("UPDATE tunes SET abc = ? WHERE id = ?", (new_abc, tune_id))
    return {"ok": True, "abc": new_abc, "removed": removed}


@app.post("/api/collections/{col_id}/strip-chords")
def strip_collection_chords(col_id: int):
    """Remove guitar chord symbols (quoted strings) from all ABC in this collection's tunes."""
    header_re = re.compile(r'^[A-Za-z%]\s*:')
    chord_re  = re.compile(r'"[^"]*"')

    def _strip(abc: str) -> str:
        lines = []
        for line in abc.splitlines():
            if header_re.match(line.strip()):
                lines.append(line)
            else:
                lines.append(chord_re.sub("", line))
        return "\n".join(lines)

    with _db() as conn:
        if not conn.execute("SELECT 1 FROM collections WHERE id = ?", (col_id,)).fetchone():
            raise HTTPException(404, "Collection not found")
        tunes = conn.execute(
            """SELECT t.id, t.abc FROM tunes t
               JOIN collection_tunes ct ON ct.tune_id = t.id
               WHERE ct.collection_id = ? AND t.abc IS NOT NULL AND t.abc != ''""",
            (col_id,),
        ).fetchall()
        stripped = 0
        for t in tunes:
            new_abc = _strip(t["abc"])
            if new_abc != t["abc"]:
                conn.execute("UPDATE tunes SET abc = ? WHERE id = ?", (new_abc, t["id"]))
                stripped += 1
    return {"ok": True, "stripped": stripped}


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


@app.get("/api/tunes/{tune_id}/sets")
def get_tune_sets(tune_id: int):
    with _db() as conn:
        rows = conn.execute(
            """
            SELECT s.id, s.name FROM sets s
            JOIN set_tunes st ON st.set_id = s.id
            WHERE st.tune_id = ?
            ORDER BY s.name COLLATE NOCASE
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


@app.post("/api/import/folder")
async def import_folder(
    files: List[UploadFile] = File(...),
    collection_name: Optional[str] = Query(None),
):
    """Smart folder import: handles ABC, MP3, PDF, image, and .msca files.

    ABC files are imported as tunes first.  Non-ABC files are matched to
    tunes by filename (case-insensitive), checking both newly-imported and
    existing tunes.  Unmatched media files create a new tune entry with
    the media attached.  .msca files are parsed and each tune inside is
    imported; multi-tune .msca files become a collection named after the file.
    """
    ABC_EXTS  = {".abc", ".txt"}
    AUDIO_EXTS = {".mp3", ".m4a", ".ogg", ".wav"}
    PDF_EXTS  = {".pdf"}
    IMAGE_EXTS = {".jpg", ".jpeg", ".png"}
    MSCA_EXTS = {".msca"}
    ALL_KNOWN = ABC_EXTS | AUDIO_EXTS | PDF_EXTS | IMAGE_EXTS | MSCA_EXTS

    # Categorise uploads
    abc_files: list[tuple[str, bytes]] = []
    media_files: list[tuple[str, str, bytes]] = []
    msca_files: list[tuple[str, bytes]] = []

    for upload in files:
        fname = upload.filename or ""
        ext = Path(fname).suffix.lower()
        if ext not in ALL_KNOWN:
            continue
        content = await upload.read()
        if ext in ABC_EXTS:
            abc_files.append((fname, content))
        elif ext in AUDIO_EXTS:
            media_files.append((fname, "audio", content))
        elif ext in PDF_EXTS:
            media_files.append((fname, "pdf", content))
        elif ext in IMAGE_EXTS:
            media_files.append((fname, "image", content))
        elif ext in MSCA_EXTS:
            msca_files.append((fname, content))

    import_date = date.today().isoformat()
    UPLOADS_DIR.mkdir(parents=True, exist_ok=True)

    # ── Phase 1: import ABC files ─────────────────────────────────
    abc_imported = 0
    abc_skipped = 0
    # title_lower → tune_id for matching media later
    imported_title_map: dict[str, int] = {}

    for fname, content in abc_files:
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

        with _db() as conn:
            for tune in tunes:
                if not tune.title:
                    abc_skipped += 1
                    continue
                cur = conn.execute(
                    "INSERT INTO tunes (craic_id, title, type, key, mode, abc, notes, imported_at)"
                    " VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))",
                    (tune.craic_id, tune.title, tune.type, tune.key, tune.mode, tune.abc,
                     f"Imported from file: {import_date}"),
                )
                tune_id = cur.lastrowid
                imported_title_map[tune.title.strip().lower()] = tune_id
                for alias in tune.aliases:
                    conn.execute(
                        "INSERT OR IGNORE INTO tune_aliases (tune_id, alias) VALUES (?, ?)",
                        (tune_id, alias),
                    )
                abc_imported += 1

    # ── Phase 2: match & attach media files ───────────────────────
    audio_attached = 0
    pdf_attached = 0
    image_attached = 0
    new_from_media = 0

    def _find_tune_by_title(title_lower: str) -> Optional[int]:
        """Check newly-imported tunes first, then search the whole library.

        Strips leading track numbers (e.g. "01 - ") before matching so that
        MP3 files named "01 - My Tune.mp3" still match a tune titled "My Tune".
        """
        # Strip leading track numbers: "01 - ", "01 ", "1. ", etc.
        stripped = re.sub(r"^\d+[\s\-_\.]+", "", title_lower).strip()
        for candidate in ([title_lower] if title_lower == stripped else [title_lower, stripped]):
            if candidate in imported_title_map:
                return imported_title_map[candidate]
            with _db() as conn:
                row = conn.execute(
                    "SELECT id FROM tunes WHERE LOWER(TRIM(title)) = ? LIMIT 1",
                    (candidate,),
                ).fetchone()
                if row:
                    return row["id"]
        return None

    def _store_file(content: bytes, ext: str) -> str:
        stored_name = f"{uuid.uuid4().hex}{ext}"
        (UPLOADS_DIR / stored_name).write_bytes(content)
        return f"/api/uploads/{stored_name}"

    def _append_note(tune_id: int, note_line: str):
        with _db() as conn:
            existing = conn.execute(
                "SELECT notes FROM tunes WHERE id = ?", (tune_id,)
            ).fetchone()
            notes = (existing["notes"] or "") if existing else ""
            sep = "\n" if notes.strip() else ""
            conn.execute(
                "UPDATE tunes SET notes = ? WHERE id = ?",
                (notes + sep + note_line, tune_id),
            )

    for fname, category, content in media_files:
        stem = Path(fname).stem.strip()
        ext = Path(fname).suffix.lower()
        title_lower = stem.lower()
        tune_id = _find_tune_by_title(title_lower)

        # If no match, create a bare tune entry
        if tune_id is None:
            with _db() as conn:
                cur = conn.execute(
                    "INSERT INTO tunes (title, type, key, mode, abc, notes, imported_at) VALUES (?, '', '', '', '', ?, datetime('now'))",
                    (stem, f"Imported from folder: {import_date}"),
                )
                tune_id = cur.lastrowid
                imported_title_map[title_lower] = tune_id
                new_from_media += 1

        url = _store_file(content, ext)

        if category == "audio":
            _append_note(tune_id, f"audio: {url}")
            audio_attached += 1
        elif category == "pdf":
            _append_note(tune_id, f"sheet music (PDF): {url}")
            pdf_attached += 1
        elif category == "image":
            _append_note(tune_id, f"sheet music (image): {url}")
            image_attached += 1

    # ── Phase 3: import .msca files ───────────────────────────────
    msca_imported = 0
    msca_skipped = 0
    for msca_fname, msca_content in msca_files:
        try:
            msca_tunes, msca_col_name = _parse_msca_content(msca_content, msca_fname)
        except HTTPException:
            continue
        with _db() as conn:
            r = _import_msca_tune_list(
                conn, msca_tunes, msca_col_name,
                as_collection=(len(msca_tunes) > 1),
            )
        msca_imported += r["imported"]
        msca_skipped  += r["skipped"]
        # Register new tune ids so media matching below can find them
        for td in msca_tunes:
            title = (td.get("title") or td.get("name") or "").strip()
            if title:
                with _db() as conn:
                    row = conn.execute(
                        "SELECT id FROM tunes WHERE LOWER(TRIM(title)) = ? LIMIT 1",
                        (title.lower(),),
                    ).fetchone()
                    if row:
                        imported_title_map[title.lower()] = row["id"]

    # Optionally create a collection for all imported tunes
    col_id = None
    all_tune_ids = list(imported_title_map.values())
    if collection_name and all_tune_ids:
        with _db() as conn:
            cur = conn.execute(
                "INSERT INTO collections (name) VALUES (?)", (collection_name.strip(),)
            )
            col_id = cur.lastrowid
            conn.executemany(
                "INSERT OR IGNORE INTO collection_tunes (collection_id, tune_id) VALUES (?, ?)",
                [(col_id, tid) for tid in all_tune_ids],
            )

    return {
        "abc_imported": abc_imported,
        "abc_skipped": abc_skipped,
        "audio_attached": audio_attached,
        "pdf_attached": pdf_attached,
        "image_attached": image_attached,
        "new_from_media": new_from_media,
        "msca_imported": msca_imported,
        "msca_skipped": msca_skipped,
        "collection_id": col_id,
    }


class YouTubeImportBody(BaseModel):
    url: str
    title: Optional[str] = None
    parent_id: Optional[int] = None
    version_label: Optional[str] = None


@app.post("/api/import/youtube", status_code=201)
async def import_youtube(body: YouTubeImportBody):
    """Create a tune entry with a YouTube URL in notes.

    Optionally resolves the video title via the oEmbed API if no title given.
    Optionally groups as a version under an existing parent tune.
    """
    url = body.url.strip()
    # Extract video id for validation
    yt_re = re.search(r"(?:youtube\.com/watch\?.*v=|youtu\.be/)([A-Za-z0-9_-]{11})", url)
    if not yt_re:
        raise HTTPException(400, "Not a recognisable YouTube URL")

    title = (body.title or "").strip()
    if not title:
        # Try oEmbed
        try:
            async with httpx.AsyncClient(timeout=8) as client:
                r = await client.get(
                    "https://www.youtube.com/oembed",
                    params={"url": url, "format": "json"},
                )
                if r.status_code == 200:
                    title = r.json().get("title", "").strip()
        except Exception:
            pass
    if not title:
        title = f"YouTube – {yt_re.group(1)}"

    notes = url

    with _db() as conn:
        cur = conn.execute(
            """INSERT INTO tunes (title, abc, notes, parent_id, version_label, imported_at)
               VALUES (?, '', ?, ?, ?, datetime('now'))""",
            (title, notes, body.parent_id, body.version_label or ""),
        )
        tune_id = cur.lastrowid

    return {"tune_id": tune_id, "title": title}


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
# JSON export (tune / set / collection) — shareable .ceol.json files
# ---------------------------------------------------------------------------

def _safe_filename(name: str, suffix: str) -> str:
    return re.sub(r"[^\w\s\-]", "", name).strip()[:60].replace(" ", "_") + suffix


def _tune_export_dict(conn, tune_id: int) -> dict:
    """Return a serialisable dict for a single tune."""
    row = conn.execute("SELECT * FROM tunes WHERE id = ?", (tune_id,)).fetchone()
    if not row:
        return {}
    t = dict(row)
    t["aliases"] = [r["alias"] for r in conn.execute(
        "SELECT alias FROM tune_aliases WHERE tune_id = ?", (tune_id,)).fetchall()]
    t["tags"] = [r["name"] for r in conn.execute(
        "SELECT tg.name FROM tags tg JOIN tune_tags tt ON tt.tag_id=tg.id WHERE tt.tune_id=?",
        (tune_id,)).fetchall()]
    return {
        "title": t.get("title", ""),
        "type": t.get("type", ""),
        "key": t.get("key", ""),
        "mode": t.get("mode", ""),
        "abc": t.get("abc", ""),
        "notes": t.get("notes", ""),
        "composer": t.get("composer", ""),
        "transcribed_by": t.get("transcribed_by", ""),
        "aliases": t["aliases"],
        "tags": t["tags"],
        "rating": t.get("rating", 0),
        "on_hitlist": t.get("on_hitlist", 0),
        "is_favourite": t.get("is_favourite", 0),
        "session_id": t.get("session_id"),
        "source_url": t.get("source_url", ""),
    }


def _json_response(payload: dict, filename: str) -> StreamingResponse:
    buf = io.BytesIO(json.dumps(payload, ensure_ascii=False, indent=2).encode("utf-8"))
    return StreamingResponse(
        buf,
        media_type="application/json",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@app.get("/api/export/tune/{tune_id}")
def export_tune(tune_id: int):
    with _db() as conn:
        row = conn.execute("SELECT title FROM tunes WHERE id = ?", (tune_id,)).fetchone()
        if not row:
            raise HTTPException(404, "Tune not found")
        td = _tune_export_dict(conn, tune_id)
    payload = {
        "ceol": 1, "type": "tune",
        "exported_at": datetime.utcnow().isoformat() + "Z",
        "tunes": [td],
    }
    return _json_response(payload, _safe_filename(td["title"], ".ceol.json"))


@app.get("/api/export/set/{set_id}")
def export_set(set_id: int):
    with _db() as conn:
        s = conn.execute("SELECT * FROM sets WHERE id = ?", (set_id,)).fetchone()
        if not s:
            raise HTTPException(404, "Set not found")
        s = dict(s)
        tune_rows = conn.execute(
            "SELECT t.id, st.position, st.key_override FROM set_tunes st"
            " JOIN tunes t ON t.id = st.tune_id WHERE st.set_id = ? ORDER BY st.position",
            (set_id,),
        ).fetchall()
        tunes_data = []
        for tr in tune_rows:
            td = _tune_export_dict(conn, tr["id"])
            td["_position"] = tr["position"]
            if tr["key_override"]:
                td["_key_override"] = tr["key_override"]
            tunes_data.append(td)
    payload = {
        "ceol": 1, "type": "set",
        "exported_at": datetime.utcnow().isoformat() + "Z",
        "name": s["name"],
        "notes": s.get("notes", ""),
        "tunes": tunes_data,
    }
    return _json_response(payload, _safe_filename(s["name"], ".ceol.json"))


@app.get("/api/export/collection/{col_id}")
def export_collection(col_id: int):
    with _db() as conn:
        c = conn.execute("SELECT * FROM collections WHERE id = ?", (col_id,)).fetchone()
        if not c:
            raise HTTPException(404, "Collection not found")
        c = dict(c)
        tune_rows = conn.execute(
            "SELECT t.id FROM collection_tunes ct JOIN tunes t ON t.id = ct.tune_id"
            " WHERE ct.collection_id = ? ORDER BY t.title COLLATE NOCASE",
            (col_id,),
        ).fetchall()
        tunes_data = [_tune_export_dict(conn, r["id"]) for r in tune_rows]
        set_rows = conn.execute(
            "SELECT s.id FROM collection_sets cs JOIN sets s ON s.id = cs.set_id"
            " WHERE cs.collection_id = ? ORDER BY s.name COLLATE NOCASE",
            (col_id,),
        ).fetchall()
        sets_data = []
        for sr in set_rows:
            s = conn.execute("SELECT * FROM sets WHERE id = ?", (sr["id"],)).fetchone()
            s = dict(s)
            str_ = conn.execute(
                "SELECT t.id, st.position FROM set_tunes st JOIN tunes t ON t.id=st.tune_id"
                " WHERE st.set_id = ? ORDER BY st.position", (sr["id"],)).fetchall()
            sets_data.append({
                "name": s["name"],
                "notes": s.get("notes", ""),
                "tunes": [{"title": dict(conn.execute("SELECT title FROM tunes WHERE id=?", (r["id"],)).fetchone())["title"],
                            "position": r["position"]} for r in str_],
            })
    payload = {
        "ceol": 1, "type": "collection",
        "exported_at": datetime.utcnow().isoformat() + "Z",
        "name": c["name"],
        "description": c.get("description", ""),
        "tunes": tunes_data,
        "sets": sets_data,
    }
    return _json_response(payload, _safe_filename(c["name"], ".ceol.json"))


@app.post("/api/import/ceol", status_code=201)
async def import_ceol_json(file: UploadFile = File(...)):
    """
    Import a .ceol.json file exported from any Ceol library.
    Merges tunes, recreates the collection/set structure, skips duplicates.
    """
    content = await file.read()
    try:
        data = json.loads(content)
    except Exception:
        raise HTTPException(400, "Could not parse file — is it a valid .ceol.json?")
    if data.get("ceol") != 1:
        raise HTTPException(400, "Not a valid Ceol export file")

    ftype = data.get("type", "tunes")
    tune_list = data.get("tunes", [])
    imported = skipped = 0
    title_to_id: dict[str, int] = {}

    with _db() as conn:
        # ── 1. Import / match tunes ──────────────────────────────────────────
        for td in tune_list:
            title = (td.get("title") or "").strip()
            if not title:
                continue

            existing_id = None
            sid = td.get("session_id")
            if sid:
                row = conn.execute(
                    "SELECT id FROM tunes WHERE session_id = ?", (sid,)
                ).fetchone()
                if row:
                    existing_id = row["id"]
            if not existing_id:
                row = conn.execute(
                    "SELECT id FROM tunes WHERE LOWER(TRIM(title)) = ? LIMIT 1",
                    (title.lower(),),
                ).fetchone()
                if row:
                    existing_id = row["id"]

            if existing_id:
                title_to_id[title.lower()] = existing_id
                skipped += 1
            else:
                cur = conn.execute(
                    "INSERT INTO tunes (title, type, key, mode, abc, notes, composer,"
                    " transcribed_by, rating, on_hitlist, is_favourite, session_id, source_url)"
                    " VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)",
                    (
                        title, td.get("type", ""), td.get("key", ""),
                        td.get("mode", ""), td.get("abc", ""), td.get("notes", ""),
                        td.get("composer", ""), td.get("transcribed_by", ""),
                        td.get("rating", 0), td.get("on_hitlist", 0),
                        td.get("is_favourite", 0), td.get("session_id"),
                        td.get("source_url", ""),
                    ),
                )
                new_id = cur.lastrowid
                title_to_id[title.lower()] = new_id
                for alias in td.get("aliases", []):
                    conn.execute(
                        "INSERT OR IGNORE INTO tune_aliases (tune_id, alias) VALUES (?,?)",
                        (new_id, alias),
                    )
                imported += 1

        # ── 2. Recreate collection ───────────────────────────────────────────
        col_id = None
        if ftype == "collection":
            col_name = (data.get("name") or "Imported Collection").strip()
            col_desc = data.get("description", "") or ""
            row = conn.execute(
                "SELECT id FROM collections WHERE LOWER(TRIM(name)) = ?",
                (col_name.lower(),),
            ).fetchone()
            if row:
                col_id = row["id"]
            else:
                cur = conn.execute(
                    "INSERT INTO collections (name, description) VALUES (?,?)",
                    (col_name, col_desc),
                )
                col_id = cur.lastrowid

            for td in tune_list:
                tid = title_to_id.get((td.get("title") or "").strip().lower())
                if tid:
                    conn.execute(
                        "INSERT OR IGNORE INTO collection_tunes (collection_id, tune_id)"
                        " VALUES (?,?)",
                        (col_id, tid),
                    )

        # ── 3. Recreate sets ─────────────────────────────────────────────────
        sets_created = 0
        for sd in data.get("sets", []):
            set_name = (sd.get("name") or "").strip()
            if not set_name:
                continue
            row = conn.execute(
                "SELECT id FROM sets WHERE LOWER(TRIM(name)) = ?",
                (set_name.lower(),),
            ).fetchone()
            if row:
                set_id = row["id"]
            else:
                cur = conn.execute(
                    "INSERT INTO sets (name, notes) VALUES (?,?)",
                    (set_name, sd.get("notes", "") or ""),
                )
                set_id = cur.lastrowid
                sets_created += 1
            for st in sd.get("tunes", []):
                t_title = (st.get("title") or "").strip()
                tid = title_to_id.get(t_title.lower())
                if tid:
                    conn.execute(
                        "INSERT OR IGNORE INTO set_tunes (set_id, tune_id, position)"
                        " VALUES (?,?,?)",
                        (set_id, tid, st.get("position", 0)),
                    )
            if col_id:
                conn.execute(
                    "INSERT OR IGNORE INTO collection_sets (collection_id, set_id) VALUES (?,?)",
                    (col_id, set_id),
                )

    result = {"ok": True, "type": ftype, "imported": imported, "skipped": skipped}
    if ftype == "collection":
        result["collection_name"] = data.get("name", "")
        result["sets_created"] = sets_created
    return result


# ---------------------------------------------------------------------------
# Music Scanner (.msca) import
# ---------------------------------------------------------------------------

# ---------------------------------------------------------------------------
# Music Scanner (.msca) import
# ---------------------------------------------------------------------------

def _img_to_bytes(img, fmt: str = "JPEG") -> bytes:
    """Serialise a PIL Image to bytes."""
    from PIL import Image
    import io as _io
    buf = _io.BytesIO()
    img.save(buf, format=fmt, quality=85)
    return buf.getvalue()


def _ink_profile(img) -> "np.ndarray":
    """Return per-row ink fraction (fraction of pixels darker than 200)."""
    import numpy as np
    arr = np.array(img.convert("L"), dtype=np.float32)
    return (arr < 200).mean(axis=1)   # shape (H,)


def _find_title_positions(img) -> list[tuple[int, str]]:
    """
    OCR the full page and return (y_top, title_text) for each title-like line found.
    A title is a short (1-8 words), mostly-alphabetic line that appears
    above a run of ink (the music staff that follows).
    Returns empty list if tesseract is not available.
    """
    try:
        import pytesseract
        import numpy as np
    except ImportError:
        return []

    # Help pytesseract find the tesseract binary when installed via Homebrew
    import shutil
    if not shutil.which("tesseract"):
        for candidate in [
            "/opt/homebrew/bin/tesseract",   # Apple Silicon Mac
            "/usr/local/bin/tesseract",      # Intel Mac
            "/usr/bin/tesseract",            # Linux
        ]:
            if Path(candidate).exists():
                pytesseract.pytesseract.tesseract_cmd = candidate
                break

    gray = img.convert("L")
    data = pytesseract.image_to_data(gray, output_type=pytesseract.Output.DICT,
                                     config="--psm 1 --oem 3")
    n = len(data["text"])

    # Group words into lines
    lines: dict = {}
    for i in range(n):
        text = (data["text"][i] or "").strip()
        if not text or data["conf"][i] < 15:
            continue
        key = (data["block_num"][i], data["par_num"][i], data["line_num"][i])
        e = lines.setdefault(key, {"words": [], "top": 9999, "bot": 0, "heights": []})
        e["words"].append(text)
        top_i = data["top"][i]
        h_i   = data["height"][i]
        e["top"] = min(e["top"], top_i)
        e["bot"] = max(e["bot"], top_i + h_i)
        e["heights"].append(h_i)

    ink = _ink_profile(gray)   # per-row darkness fraction
    h_img = img.height

    titles = []
    for entry in sorted(lines.values(), key=lambda e: e["top"]):
        text = " ".join(entry["words"]).strip()
        words = text.split()
        if not words or len(words) > 9:
            continue
        # Must be mostly alphabetic (not a chord symbol or bar marking)
        alpha_frac = sum(c.isalpha() for c in text) / max(len(text), 1)
        if alpha_frac < 0.45:
            continue
        # Must not be tiny annotation (height below 10px)
        if entry["heights"] and max(entry["heights"]) < 10:
            continue
        # Require ink below the title (music should follow)
        below_start = min(entry["bot"] + 5, h_img - 1)
        below_end   = min(entry["bot"] + 80, h_img)
        if below_end > below_start:
            ink_below = ink[below_start:below_end].mean()
            if ink_below < 0.003:      # no music below — skip (e.g. page number)
                continue
        titles.append((entry["top"], text))

    # De-duplicate: if two titles are within 20px vertically, keep taller/longer
    deduped = []
    for y, t in sorted(titles):
        if deduped and y - deduped[-1][0] < 20:
            if len(t) > len(deduped[-1][1]):
                deduped[-1] = (y, t)
        else:
            deduped.append((y, t))
    return deduped


def _split_page_into_sections(img_bytes: bytes, page_name: str,
                               ) -> list[tuple[str | None, bytes, str]]:
    """
    Split a page image into tune sections using OCR-detected title positions.
    Returns list of (title_or_None, section_bytes, section_name).
    title_or_None is None when the section is a continuation (no new title found).
    Falls back to (None, img_bytes, page_name) if OCR is unavailable.
    """
    from PIL import Image
    import io as _io

    try:
        import numpy as np
    except ImportError:
        return [(None, img_bytes, page_name)]

    img = Image.open(_io.BytesIO(img_bytes))
    w, h = img.size

    title_positions = _find_title_positions(img)

    if not title_positions:
        # No titles found — whole page is a continuation
        return [(None, img_bytes, page_name)]

    # Build section boundaries using the white-space just above each title
    ink = _ink_profile(img)

    def find_gap_above(y_title: int) -> int:
        """Find the last mostly-white row above y_title (search up to 80px back)."""
        search_start = max(0, y_title - 5)
        search_end   = max(0, y_title - 100)
        for y in range(search_start, search_end, -1):
            if ink[y] < 0.004:
                return y
        return max(0, y_title - 4)

    boundaries = []   # (y_start, y_end, title)
    splits = [(find_gap_above(y), y, t) for y, t in title_positions]

    for idx, (gap_y, title_y, title) in enumerate(splits):
        y_end = splits[idx + 1][0] if idx + 1 < len(splits) else h
        boundaries.append((gap_y, y_end, title))

    sections: list[tuple[str | None, bytes, str]] = []

    # If the first title is not near the very top, there's a continuation section
    first_gap = splits[0][0]
    if first_gap > h * 0.06:   # more than 6% down — content before first title
        cont_img = img.crop((0, 0, w, first_gap))
        sections.append((None, _img_to_bytes(cont_img), f"{page_name}_cont"))

    for idx, (y0, y1, title) in enumerate(boundaries):
        if y1 - y0 < 20:
            continue
        section_img = img.crop((0, y0, w, y1))
        sections.append((title, _img_to_bytes(section_img), f"{page_name}_s{idx}"))

    return sections if sections else [(None, img_bytes, page_name)]


def _merge_page_sections_into_tunes(
    all_sections: list[tuple[str | None, bytes, str]],
    collection_name: str,
) -> list[dict]:
    """
    Given a flat list of (title_or_None, img_bytes, section_name) from all pages,
    group sections into tunes.  A section with a title starts a new tune.
    A section with title=None is appended to the current tune as an extra image.
    """
    tunes: list[dict] = []
    for title, img_bytes, sname in all_sections:
        if title:
            tunes.append({
                "title": title,
                "_image_attachments": [(sname + ".jpeg", img_bytes)],
            })
        else:
            if tunes:
                tunes[-1]["_image_attachments"].append((sname + ".jpeg", img_bytes))
            else:
                # Content before the first titled tune (e.g. front matter) — skip
                pass
    # Deduplicate titles that are clearly OCR noise (single chars, all symbols)
    cleaned = []
    for t in tunes:
        title = t["title"]
        if len(title) <= 1 or all(c in "0123456789=|./+- #@" for c in title.replace(" ", "")):
            # Looks like OCR noise — treat as continuation
            if cleaned:
                cleaned[-1]["_image_attachments"].extend(t["_image_attachments"])
        else:
            cleaned.append(t)
    return cleaned


def _parse_msca_content(content: bytes, filename: str = "") -> tuple[list[dict], str]:
    """
    Try to parse a .msca file using multiple strategies.
    Returns (tune_list, collection_name).
    Raises HTTPException(400) if none succeed.
    """
    import plistlib
    import xml.etree.ElementTree as ET

    collection_name = Path(filename).stem if filename else "Music Scanner Import"

    # ── Strategy 0: SQLite / Core Data ──────────────────────────────────────
    # Many Mac/iOS apps store data as SQLite (Core Data). SQLite magic = b"SQLite format 3\x00"
    if content[:6] == b"SQLite":
        try:
            import sqlite3 as _sqlite3
            tmp = Path(tempfile.mktemp(suffix=".msca.db"))
            tmp.write_bytes(content)
            try:
                sc = _sqlite3.connect(str(tmp))
                sc.row_factory = _sqlite3.Row
                # List all tables to find the right one
                tables = [r[0] for r in sc.execute(
                    "SELECT name FROM sqlite_master WHERE type='table'"
                ).fetchall()]
                tunes = []
                # Common Core Data table naming: ZTUNE, ZSONG, ZPIECE, ZTRACK, etc.
                for table in tables:
                    cols = [r[1].upper() for r in sc.execute(f"PRAGMA table_info({table})").fetchall()]
                    title_col = next((c for c in cols if "TITLE" in c or "NAME" in c), None)
                    if not title_col:
                        continue
                    abc_col   = next((c for c in cols if c in ("ZABC","ZNOTATION","ZSCORE","ABC")), None)
                    key_col   = next((c for c in cols if "KEY" in c), None)
                    type_col  = next((c for c in cols if c in ("ZTYPE","ZRHYTHM","ZGENRE","TYPE","GENRE")), None)
                    comp_col  = next((c for c in cols if "COMPOSER" in c or "AUTHOR" in c), None)
                    note_col  = next((c for c in cols if "NOTE" in c or "DESC" in c or "COMMENT" in c), None)
                    sel = ", ".join(c for c in [title_col, abc_col, key_col, type_col, comp_col, note_col] if c)
                    rows = sc.execute(f"SELECT {sel} FROM {table}").fetchall()
                    for row in rows:
                        d = dict(row)
                        td = {k.lstrip("Z").lower(): v for k, v in d.items() if v}
                        if td.get("title") or td.get("name"):
                            tunes.append(td)
                sc.close()
            finally:
                tmp.unlink(missing_ok=True)
            if tunes:
                return tunes, collection_name
        except Exception:
            pass

    # ── Strategy 1: JSON ────────────────────────────────────────────────────
    try:
        data = json.loads(content)
        if isinstance(data, list):
            return data, collection_name
        if isinstance(data, dict):
            for key in ("tunes", "items", "songs", "tracks"):
                if key in data and isinstance(data[key], list):
                    return data[key], data.get("name", collection_name)
            if "title" in data or "abc" in data or "name" in data:
                return [data], collection_name
    except Exception:
        pass

    # ── Strategy 2: Apple plist (binary or XML) ─────────────────────────────
    try:
        data = plistlib.loads(content)
        if isinstance(data, list):
            return data, collection_name
        if isinstance(data, dict):
            for key in ("tunes", "items", "songs", "tracks", "Tunes", "Items"):
                if key in data and isinstance(data[key], list):
                    return data[key], data.get("name", data.get("Name", collection_name))
            if any(k in data for k in ("title", "Title", "abc", "ABC", "name", "Name")):
                return [data], collection_name
    except Exception:
        pass

    # ── Strategy 3a: Music Scanner ZIP (session.csv + background_*.jpeg) ──────
    # The Music Scanner app stores each tune as a ZIP containing:
    #   session.csv  — title (displayName), bpm, instrument
    #   session.dat  — key signature, clef, bar structure (custom text format)
    #   background_NNN.jpeg — scanned sheet music page(s)
    #   overlay_NNN.png     — recognition overlay
    if zipfile.is_zipfile(io.BytesIO(content)):
        try:
            with zipfile.ZipFile(io.BytesIO(content)) as zf:
                names_lower = {n.lower(): n for n in zf.namelist()}

                if "session.csv" in names_lower:
                    import csv as _csv
                    csv_bytes = zf.read(names_lower["session.csv"])
                    csv_text  = csv_bytes.decode("utf-8", errors="replace")
                    reader = list(_csv.DictReader(csv_text.splitlines()))
                    if reader:
                        _KS_MAP = {
                            0: "C", 1: "G", 2: "D", 3: "A", 4: "E",
                            5: "B", 6: "F#", 7: "C#",
                            -1: "F", -2: "Bb", -3: "Eb", -4: "Ab",
                            -5: "Db", -6: "Gb", -7: "Cb",
                        }

                        # Parse all key/time signatures from session.dat (one per tune block)
                        keys_list: list[str] = []
                        time_sigs_list: list[str] = []
                        if "session.dat" in names_lower:
                            dat = zf.read(names_lower["session.dat"]).decode("utf-8", errors="replace")
                            for m in re.finditer(r"keySignature:\s*KS\*\s*(-?\d+)", dat):
                                keys_list.append(_KS_MAP.get(int(m.group(1)), ""))
                            for m in re.finditer(r"timeSignature:\s*TS\*\s*(\d+)/(\d+)", dat):
                                time_sigs_list.append(f"{m.group(1)}/{m.group(2)}")

                        # All background images sorted by their index number
                        all_images = sorted(
                            n for n in zf.namelist()
                            if re.match(r"background_\d+\.(jpeg|jpg|png)", n.lower())
                        )

                        if len(reader) == 1 and len(all_images) <= 1:
                            # Genuine single tune (one page or no image)
                            row = reader[0]
                            _cn_uuid = bool(re.fullmatch(
                                r"[0-9a-f\-]{8,}", collection_name, re.IGNORECASE))
                            title = (row.get("displayName", "").strip()
                                     or (collection_name if not _cn_uuid else "")
                                     or "Untitled Tune")
                            bpm   = row.get("bpm", "").strip()
                            key   = keys_list[0] if keys_list else ""
                            time_sig = time_sigs_list[0] if time_sigs_list else ""
                            image_bytes = [(n, zf.read(n)) for n in all_images]
                            return [{
                                "title": title, "key": key, "type": "",
                                "bpm": bpm, "time_signature": time_sig,
                                "_image_attachments": image_bytes,
                            }], collection_name

                        if len(reader) == 1 and len(all_images) > 1:
                            row = reader[0]
                            csv_title = row.get("displayName", "").strip()
                            key      = keys_list[0] if keys_list else ""
                            time_sig = time_sigs_list[0] if time_sigs_list else ""
                            bpm      = row.get("bpm", "").strip()

                            _is_uuid = lambda s: bool(re.fullmatch(
                                r"[0-9a-f\-]{8,}", s, re.IGNORECASE))

                            # ≤3 images + real title → single tune spanning multiple pages
                            if csv_title and not _is_uuid(csv_title) and len(all_images) <= 3:
                                image_bytes_all = [(n, zf.read(n)) for n in all_images]
                                return [{
                                    "title": csv_title, "key": key, "type": "",
                                    "bpm": bpm, "time_signature": time_sig,
                                    "_image_attachments": image_bytes_all,
                                }], collection_name

                            # 4+ images → scanned book; try OCR to split into tunes.
                            # book_title is used for fallback page names.
                            book_title = (csv_title if csv_title and not _is_uuid(csv_title)
                                          else (collection_name if not _is_uuid(collection_name)
                                                else ""))

                            all_sections: list[tuple] = []
                            for img_name in all_images:
                                img_bytes_page = zf.read(img_name)
                                try:
                                    sections = _split_page_into_sections(
                                        img_bytes_page, img_name)
                                    all_sections.extend(sections)
                                except Exception:
                                    all_sections.append((None, img_bytes_page, img_name))

                            tunes_raw = _merge_page_sections_into_tunes(
                                all_sections, collection_name)

                            # Fallback: OCR unavailable or found nothing — one tune per page
                            if not tunes_raw:
                                prefix = f"{book_title} - " if book_title else ""
                                tunes_raw = [
                                    {
                                        "title": f"{prefix}Page {i + 1}",
                                        "_image_attachments": [(img_name, zf.read(img_name))],
                                    }
                                    for i, img_name in enumerate(all_images)
                                ]

                            tune_list_out = []
                            for i, td in enumerate(tunes_raw):
                                tune_list_out.append({
                                    "title": td["title"],
                                    "key": keys_list[i] if i < len(keys_list) else key,
                                    "type": "",
                                    "bpm": bpm,
                                    "time_signature": (time_sigs_list[i]
                                                       if i < len(time_sigs_list)
                                                       else time_sig),
                                    "_image_attachments": td["_image_attachments"],
                                })
                            return tune_list_out, collection_name

                        # Multi-tune book — one tune per CSV row, one image per row
                        tune_list_out = []
                        for i, row in enumerate(reader):
                            title = row.get("displayName", "").strip()
                            if not title:
                                title = f"{collection_name} (tune {i + 1})"
                            bpm      = row.get("bpm", "").strip()
                            key      = keys_list[i] if i < len(keys_list) else (keys_list[0] if keys_list else "")
                            time_sig = time_sigs_list[i] if i < len(time_sigs_list) else (time_sigs_list[0] if time_sigs_list else "")
                            # Match images: prefer background_{i:03d}.* then background_{i}.*
                            img_candidates = [n for n in all_images
                                              if re.match(rf"background_0*{i}\.(jpeg|jpg|png)", n.lower())]
                            image_bytes = [(n, zf.read(n)) for n in img_candidates]
                            tune_list_out.append({
                                "title": title, "key": key, "type": "",
                                "bpm": bpm, "time_signature": time_sig,
                                "_image_attachments": image_bytes,
                            })
                        return tune_list_out, collection_name
        except Exception:
            pass

    # ── Strategy 3b: generic ZIP (look for JSON/ABC/XML inside) ─────────────
    if zipfile.is_zipfile(io.BytesIO(content)):
        try:
            with zipfile.ZipFile(io.BytesIO(content)) as zf:
                names = zf.namelist()
                for name in names:
                    if name.lower().endswith((".json",)):
                        inner = zf.read(name)
                        try:
                            tunes, _ = _parse_msca_content(inner, name)
                            return tunes, collection_name
                        except Exception:
                            pass
                for name in names:
                    if name.lower().endswith((".xml", ".musicxml")):
                        tunes = _parse_msca_xml(zf.read(name))
                        if tunes:
                            return tunes, collection_name
                abc_tunes = []
                for name in names:
                    if name.lower().endswith((".abc", ".txt")):
                        text = zf.read(name).decode("utf-8", errors="replace")
                        for t in parse_abc_string(text):
                            if t.title:
                                abc_tunes.append({"title": t.title, "abc": t.abc,
                                                  "key": t.key, "type": t.type})
                if abc_tunes:
                    return abc_tunes, collection_name
        except Exception:
            pass

    # ── Strategy 4: XML / MusicXML ──────────────────────────────────────────
    try:
        tunes = _parse_msca_xml(content)
        if tunes:
            return tunes, collection_name
    except Exception:
        pass

    # ── Strategy 5: ABC text ─────────────────────────────────────────────────
    try:
        text = content.decode("utf-8", errors="strict")
        if "X:" in text and "T:" in text:
            abc_tunes = []
            for t in parse_abc_string(text):
                if t.title:
                    abc_tunes.append({"title": t.title, "abc": t.abc,
                                      "key": t.key, "type": t.type})
            if abc_tunes:
                return abc_tunes, collection_name
    except Exception:
        pass

    # Nothing worked — give a diagnostic hint
    preview = content[:120]
    try:
        hint = preview.decode("utf-8", errors="replace")
    except Exception:
        hint = preview.hex()
    raise HTTPException(
        400,
        f"Could not parse .msca file. File starts with: {hint!r}  "
        "Please report this so the format can be added."
    )


def _parse_msca_xml(content: bytes) -> list[dict]:
    """Try to extract tunes from XML or MusicXML content."""
    import xml.etree.ElementTree as ET
    root = ET.fromstring(content)
    tag = root.tag.lower().split("}")[-1]  # strip namespace

    tunes = []
    # MusicXML score-partwise / score-timewise
    if tag in ("score-partwise", "score-timewise", "score"):
        ns = {"m": "http://www.musicxml.org/dtds/partwise.dtd"}
        title_el = root.find(".//{*}movement-title") or root.find(".//{*}work-title")
        title = title_el.text.strip() if title_el is not None and title_el.text else ""
        composer_el = root.find(".//{*}creator[@type='composer']") or root.find(".//{*}creator")
        composer = composer_el.text.strip() if composer_el is not None and composer_el.text else ""
        if title:
            tunes.append({"title": title, "composer": composer, "abc": ""})
    # Generic XML: look for tune/song/item elements
    elif tag in ("library", "tunes", "songs", "items", "collection", "document"):
        for child in root:
            t = {}
            for field, xml_tag in (
                ("title", "title"), ("title", "name"), ("title", "Title"),
                ("abc", "abc"), ("key", "key"), ("type", "type"), ("type", "genre"),
                ("composer", "composer"),
            ):
                el = child.find(xml_tag)
                if el is not None and el.text:
                    t.setdefault(field, el.text.strip())
            # Also try attributes
            for attr in ("title", "name", "Title"):
                if attr in child.attrib and "title" not in t:
                    t["title"] = child.attrib[attr].strip()
            if t.get("title"):
                tunes.append(t)

    return tunes


def _msca_field(td: dict, *keys: str, default: str = "") -> str:
    """Try multiple possible key names, return first non-empty value."""
    for k in keys:
        for variant in (k, k.lower(), k.upper(), k[0].upper() + k[1:]):
            v = td.get(variant)
            if v and str(v).strip():
                return str(v).strip()
    return default


def _import_msca_tune_list(
    conn,
    tune_list: list[dict],
    collection_name: str,
    as_collection: bool = True,
) -> dict:
    """Insert tunes from a parsed list; optionally group into a collection."""
    import_date = date.today().isoformat()
    imported = skipped = 0
    tune_ids = []

    for td in tune_list:
        if not isinstance(td, dict):
            continue
        title = _msca_field(td, "title", "name", "tune_name", "tuneName",
                            "Title", "Name")
        if not title:
            skipped += 1
            continue

        existing = conn.execute(
            "SELECT id FROM tunes WHERE LOWER(TRIM(title)) = ? LIMIT 1",
            (title.lower(),),
        ).fetchone()
        if existing:
            tune_ids.append(existing["id"])
            skipped += 1
            continue

        abc = _msca_field(td, "abc", "abc_notation", "abcNotation", "score",
                          "ABC", "Score")
        key = _msca_field(td, "key", "key_signature", "keySignature", "Key")
        tune_type = _msca_field(td, "type", "genre", "rhythm", "form",
                                "Type", "Genre", "Rhythm")
        composer = _msca_field(td, "composer", "author", "by",
                               "Composer", "Author")
        source_url = _msca_field(td, "source_url", "sourceUrl", "url",
                                 "source", "Source", "URL")
        bpm = _msca_field(td, "bpm", "tempo", "BPM", "Tempo")
        time_sig = _msca_field(td, "time_signature", "timeSignature",
                               "meter", "Meter")

        notes_parts = [f"Imported from Music Scanner: {import_date}"]
        if bpm:
            notes_parts.append(f"Tempo: {bpm} BPM")
        if time_sig:
            notes_parts.append(f"Time: {time_sig}")
        extra_notes = _msca_field(td, "notes", "description", "comments",
                                  "Notes", "Description")
        if extra_notes:
            notes_parts.append(extra_notes)

        # Save scanned page images and link them in notes
        image_attachments = td.get("_image_attachments", [])
        UPLOADS_DIR.mkdir(parents=True, exist_ok=True)
        for img_name, img_bytes in image_attachments:
            ext = Path(img_name).suffix or ".jpeg"
            stored = f"{uuid.uuid4().hex}{ext}"
            (UPLOADS_DIR / stored).write_bytes(img_bytes)
            notes_parts.append(f"sheet music (image): /api/uploads/{stored}")

        notes = "\n".join(notes_parts)

        cur = conn.execute(
            "INSERT INTO tunes (title, type, key, mode, abc, notes, composer,"
            " source_url, imported_at)"
            " VALUES (?,?,?,?,?,?,?,?,datetime('now'))",
            (title, tune_type, key, "", abc, notes, composer, source_url),
        )
        tune_ids.append(cur.lastrowid)
        imported += 1

    col_id = None
    if as_collection and tune_ids and collection_name:
        cur = conn.execute(
            "INSERT INTO collections (name, description) VALUES (?, ?)",
            (collection_name,
             f"Imported from Music Scanner on {import_date}"),
        )
        col_id = cur.lastrowid
        conn.executemany(
            "INSERT OR IGNORE INTO collection_tunes (collection_id, tune_id)"
            " VALUES (?,?)",
            [(col_id, tid) for tid in tune_ids],
        )

    return {"imported": imported, "skipped": skipped,
            "collection_id": col_id, "collection_name": collection_name if col_id else None}


@app.post("/api/import/msca", status_code=201)
async def import_msca(
    file: UploadFile = File(...),
    as_collection: bool = Query(True),
):
    """
    Import a .msca file from the Music Scanner app.
    Tries JSON, Apple plist, ZIP, XML, and ABC formats in order.
    If the file contains multiple tunes (e.g. a scanned book), they are
    grouped into a collection named after the file.
    """
    content = await file.read()
    fname = file.filename or "import.msca"
    tune_list, collection_name = _parse_msca_content(content, fname)
    with _db() as conn:
        result = _import_msca_tune_list(
            conn, tune_list, collection_name,
            as_collection=(as_collection and len(tune_list) > 1),
        )
    result["ok"] = True
    return result


@app.post("/api/import/msca/diagnose")
async def diagnose_msca(file: UploadFile = File(...)):
    """Return diagnostic info about an .msca file to help identify its format."""
    import sqlite3 as _sqlite3
    content = await file.read()
    size = len(content)
    start_hex = content[:64].hex()
    try:
        start_text = content[:256].decode("utf-8", errors="replace")
    except Exception:
        start_text = "(binary)"
    is_sqlite = content[:6] == b"SQLite"
    is_zip    = content[:2] == b"PK"
    is_xml    = content.lstrip()[:5] in (b"<?xml", b"<tune", b"<scor", b"<libr")
    is_json   = content.lstrip()[:1] in (b"{", b"[")
    try:
        import plistlib
        plistlib.loads(content)
        is_plist = True
    except Exception:
        is_plist = False

    sqlite_tables = []
    sqlite_sample = {}
    if is_sqlite:
        try:
            tmp = Path(tempfile.mktemp(suffix=".diag.db"))
            tmp.write_bytes(content)
            try:
                sc = _sqlite3.connect(str(tmp))
                tables = [r[0] for r in sc.execute(
                    "SELECT name FROM sqlite_master WHERE type='table'"
                ).fetchall()]
                sqlite_tables = tables
                for t in tables[:4]:
                    try:
                        cols = [r[1] for r in sc.execute(f"PRAGMA table_info({t})").fetchall()]
                        rows = sc.execute(f"SELECT * FROM {t} LIMIT 2").fetchall()
                        sqlite_sample[t] = {"cols": cols, "rows": [list(r) for r in rows]}
                    except Exception:
                        pass
                sc.close()
            finally:
                tmp.unlink(missing_ok=True)
        except Exception as e:
            sqlite_sample["error"] = str(e)

    # List ZIP contents so we can see all files inside
    zip_contents = []
    zip_text_samples = {}
    if is_zip:
        try:
            with zipfile.ZipFile(io.BytesIO(content)) as zf:
                zip_contents = [
                    {"name": info.filename, "size": info.file_size}
                    for info in zf.infolist()
                ]
                # Read first 400 bytes of any non-image files
                for info in zf.infolist():
                    if not info.filename.lower().endswith((".jpg", ".jpeg", ".png", ".gif")):
                        try:
                            inner = zf.read(info.filename)[:400]
                            try:
                                zip_text_samples[info.filename] = inner.decode("utf-8", errors="replace")
                            except Exception:
                                zip_text_samples[info.filename] = inner.hex()
                        except Exception:
                            pass
        except Exception as e:
            zip_contents = [{"error": str(e)}]

    return {
        "filename": file.filename,
        "size_bytes": size,
        "start_hex": start_hex,
        "detected": {
            "is_sqlite": is_sqlite,
            "is_zip": is_zip,
            "is_xml": bool(is_xml),
            "is_json": bool(is_json),
            "is_plist": is_plist,
        },
        "sqlite_tables": sqlite_tables,
        "sqlite_sample": sqlite_sample,
        "zip_contents": zip_contents,
        "zip_text_samples": zip_text_samples,
    }


@app.post("/api/import/msca/diagnose-ocr")
async def diagnose_msca_ocr(file: UploadFile = File(...)):
    """
    Run OCR on the first few pages of a book .msca and return detected titles
    and section boundaries — useful for tuning the import.
    """
    content = await file.read()
    if not zipfile.is_zipfile(io.BytesIO(content)):
        raise HTTPException(400, "Not a ZIP-format .msca file")

    results = []
    with zipfile.ZipFile(io.BytesIO(content)) as zf:
        images = sorted(
            n for n in zf.namelist()
            if re.match(r"background_\d+\.(jpeg|jpg|png)", n.lower())
        )
        for img_name in images[:6]:   # inspect first 6 pages
            img_bytes = zf.read(img_name)
            page_info: dict = {"page": img_name, "titles": [], "sections": [], "error": None}
            try:
                from PIL import Image as _PILImage
                import io as _io
                img = _PILImage.open(_io.BytesIO(img_bytes))
                page_info["size"] = f"{img.width}x{img.height}"
                titles = _find_title_positions(img)
                page_info["titles"] = [{"y": y, "text": t} for y, t in titles]
                sections = _split_page_into_sections(img_bytes, img_name)
                page_info["sections"] = [
                    {"title": title, "name": sname}
                    for title, _, sname in sections
                ]
            except Exception as e:
                page_info["error"] = str(e)
            results.append(page_info)

    return {"pages_inspected": len(results), "pages": results}


# ---------------------------------------------------------------------------
# Discography scanner — build a collection from TheSession recordings
# ---------------------------------------------------------------------------

class DiscographyScanRequest(BaseModel):
    artist: str
    collection_name: Optional[str] = None


@app.post("/api/discography/scan")
async def scan_discography(body: DiscographyScanRequest):
    """
    Search TheSession.org recordings for an artist, collect all tune names/IDs,
    match against the local library, and create (or replace) a Collection.
    """
    import urllib.parse as _urlparse
    artist = body.artist.strip()
    if not artist:
        raise HTTPException(400, "artist is required")
    col_name = (body.collection_name or f"{artist} Repertoire").strip()

    all_tune_sessions: dict[int, str] = {}  # session_tune_id → name
    page = 1
    async with httpx.AsyncClient(timeout=20, headers=_SESSION_HEADERS) as client:
        while True:
            url = (f"{_SESSION_BASE}/recordings/search"
                   f"?q={_urlparse.quote(artist)}&format=json&perpage=50&page={page}")
            try:
                resp = await client.get(url)
                resp.raise_for_status()
                data = resp.json()
            except Exception:
                break
            recordings = data.get("recordings", [])
            if not recordings:
                break
            for rec in recordings:
                for member in rec.get("members", []):
                    tune = member.get("tune", {})
                    tid = tune.get("id")
                    tname = tune.get("name", "")
                    if tid and tname:
                        all_tune_sessions[int(tid)] = tname
            pages = data.get("pages", 1)
            if page >= pages:
                break
            page += 1

    matched_local_ids: list[int] = []
    with _db() as conn:
        for sid, name in all_tune_sessions.items():
            # Match by TheSession ID first
            row = conn.execute(
                "SELECT id FROM tunes WHERE session_id = ? AND parent_id IS NULL",
                (str(sid),),
            ).fetchone()
            if row:
                if row["id"] not in matched_local_ids:
                    matched_local_ids.append(row["id"])
                continue
            # Fallback: title match (exact, case-insensitive)
            rows = conn.execute(
                "SELECT id FROM tunes WHERE LOWER(title) = LOWER(?)"
                " AND parent_id IS NULL",
                (name,),
            ).fetchall()
            for r in rows:
                if r["id"] not in matched_local_ids:
                    matched_local_ids.append(r["id"])

        # Create or replace collection
        existing = conn.execute(
            "SELECT id FROM collections WHERE name = ?", (col_name,)
        ).fetchone()
        if existing:
            col_id = existing["id"]
            conn.execute("DELETE FROM collection_tunes WHERE collection_id = ?", (col_id,))
            conn.execute(
                "UPDATE collections SET description = ? WHERE id = ?",
                (f"Auto-built from TheSession recordings — {artist}", col_id),
            )
        else:
            cur = conn.execute(
                "INSERT INTO collections (name, description) VALUES (?, ?)",
                (col_name, f"Auto-built from TheSession recordings — {artist}"),
            )
            col_id = cur.lastrowid

        for tid in matched_local_ids:
            conn.execute(
                "INSERT OR IGNORE INTO collection_tunes (collection_id, tune_id) VALUES (?, ?)",
                (col_id, tid),
            )

    return {
        "collection_id": col_id,
        "collection_name": col_name,
        "session_tunes_found": len(all_tune_sessions),
        "matched_in_library": len(matched_local_ids),
    }


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
    existing_parent_id: Optional[int] = None


@app.post("/api/tunes/group", status_code=201)
def group_tunes(body: GroupTunesBody):
    """Create a parent container and link existing tunes as versions under it.
    If existing_parent_id is supplied, add tunes to that existing group instead."""
    title = body.title.strip()
    if not title:
        raise HTTPException(400, "Title required")
    if not body.tune_ids:
        raise HTTPException(400, "At least one tune required")
    if len(body.tune_ids) != len(body.labels):
        raise HTTPException(400, "Must supply a label for each tune")
    with _db() as conn:
        if body.existing_parent_id:
            parent_row = conn.execute(
                "SELECT id FROM tunes WHERE id = ? AND parent_id IS NULL",
                (body.existing_parent_id,),
            ).fetchone()
            if not parent_row:
                raise HTTPException(400, "Existing parent group not found")
            parent_id = body.existing_parent_id
            # Update the group title if changed
            conn.execute("UPDATE tunes SET title = ? WHERE id = ?", (title, parent_id))
            # Find the next label index (so new versions don't get is_default=1 unless group is empty)
            existing_count = conn.execute(
                "SELECT COUNT(*) FROM tunes WHERE parent_id = ?", (parent_id,)
            ).fetchone()[0]
            for i, (tune_id, label) in enumerate(zip(body.tune_ids, body.labels)):
                # Detach from old parent if already a version elsewhere
                conn.execute(
                    "UPDATE tunes SET parent_id = NULL, version_label = '', is_default = 0 WHERE id = ? AND parent_id != ?",
                    (tune_id, parent_id),
                )
                conn.execute(
                    "UPDATE tunes SET parent_id = ?, version_label = ?, is_default = ? WHERE id = ?",
                    (parent_id, label.strip(), 1 if existing_count == 0 and i == 0 else 0, tune_id),
                )
        else:
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


@app.post("/api/tunes/dedup-versions")
def dedup_versions_endpoint():
    """Remove empty and ABC-identical versions from all groups."""
    with _db() as conn:
        removed = _dedup_versions(conn)
    return {"removed": removed}


@app.post("/api/tunes/rationalise")
def rationalise_tunes():
    """Find all tunes with identical ABC across the whole library and merge them.

    For each group of tunes sharing identical ABC (after whitespace normalisation):
      - Keep the tune with the highest rating (tie → lowest id).
      - Merge onto the winner: max rating, on_hitlist if any, and all set /
        collection / tag / alias memberships from the losers.
      - Delete the losers.
    Returns {"removed": N, "groups": M}.
    """
    import re

    def _norm(abc: str) -> str:
        return re.sub(r"\s+", "", abc or "").lower()

    with _db() as conn:
        rows = conn.execute(
            "SELECT id, abc, rating, on_hitlist FROM tunes "
            "WHERE abc IS NOT NULL AND abc != ''"
        ).fetchall()

        # Group by normalised ABC
        groups: dict[str, list] = {}
        for r in rows:
            key = _norm(r["abc"])
            if key:
                groups.setdefault(key, []).append(r)

        removed = 0
        groups_merged = 0

        for tunes in groups.values():
            if len(tunes) < 2:
                continue

            groups_merged += 1
            # Winner = highest rating; tie → lowest id
            tunes.sort(key=lambda t: (-(t["rating"] or 0), t["id"]))
            winner_id = tunes[0]["id"]
            losers = tunes[1:]

            # Merge scalar fields onto winner
            max_rating = max(t["rating"] or 0 for t in tunes)
            any_hitlist = int(any(t["on_hitlist"] for t in tunes))
            conn.execute(
                "UPDATE tunes SET rating = ?, on_hitlist = ? WHERE id = ?",
                (max_rating, any_hitlist, winner_id),
            )

            for loser in losers:
                loser_id = loser["id"]

                # Transfer set memberships (set_tunes has no UNIQUE on set_id+tune_id)
                loser_sets = conn.execute(
                    "SELECT set_id, position, key_override FROM set_tunes WHERE tune_id = ?",
                    (loser_id,),
                ).fetchall()
                winner_sets = {
                    r["set_id"] for r in conn.execute(
                        "SELECT set_id FROM set_tunes WHERE tune_id = ?", (winner_id,)
                    ).fetchall()
                }
                for st in loser_sets:
                    if st["set_id"] not in winner_sets:
                        conn.execute(
                            "INSERT INTO set_tunes (set_id, tune_id, position, key_override)"
                            " VALUES (?,?,?,?)",
                            (st["set_id"], winner_id, st["position"], st["key_override"]),
                        )
                conn.execute("DELETE FROM set_tunes WHERE tune_id = ?", (loser_id,))

                # Transfer collection memberships (PRIMARY KEY (collection_id, tune_id))
                conn.execute(
                    "INSERT OR IGNORE INTO collection_tunes (collection_id, tune_id)"
                    " SELECT collection_id, ? FROM collection_tunes WHERE tune_id = ?",
                    (winner_id, loser_id),
                )
                conn.execute("DELETE FROM collection_tunes WHERE tune_id = ?", (loser_id,))

                # Transfer tags (PRIMARY KEY (tune_id, tag_id))
                conn.execute(
                    "INSERT OR IGNORE INTO tune_tags (tune_id, tag_id)"
                    " SELECT ?, tag_id FROM tune_tags WHERE tune_id = ?",
                    (winner_id, loser_id),
                )
                conn.execute("DELETE FROM tune_tags WHERE tune_id = ?", (loser_id,))

                # Transfer aliases (no UNIQUE constraint — check manually)
                existing_aliases = {
                    r["alias"] for r in conn.execute(
                        "SELECT alias FROM tune_aliases WHERE tune_id = ?", (winner_id,)
                    ).fetchall()
                }
                for r in conn.execute(
                    "SELECT alias FROM tune_aliases WHERE tune_id = ?", (loser_id,)
                ).fetchall():
                    if r["alias"] not in existing_aliases:
                        conn.execute(
                            "INSERT INTO tune_aliases (tune_id, alias) VALUES (?,?)",
                            (winner_id, r["alias"]),
                        )
                        existing_aliases.add(r["alias"])
                conn.execute("DELETE FROM tune_aliases WHERE tune_id = ?", (loser_id,))

                # Unlink any child tunes that point to this loser as their parent
                conn.execute(
                    "UPDATE tunes SET parent_id = NULL, version_label = '', is_default = 0"
                    " WHERE parent_id = ?",
                    (loser_id,),
                )
                conn.execute("DELETE FROM tunes WHERE id = ?", (loser_id,))
                removed += 1

        # Clean up any version groups left with 0 or 1 members
        _dedup_versions(conn)

    return {"removed": removed, "groups": groups_merged}


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
    "collections", "collection_tunes", "collection_sets",
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


# ---------------------------------------------------------------------------
# Library merge — import without replacing existing data
# ---------------------------------------------------------------------------

@app.post("/api/library/merge")
async def merge_library(file: UploadFile = File(...)):
    """
    Merge a backup ZIP into the current library.

    Rules:
    - Tunes with same title + same ABC: merge metadata (max rating, OR hitlist), no version
    - Tunes with same title + different ABC: group as versions, max rating, OR hitlist
    - New tunes: inserted as-is
    - Sets: if identical name+tunes-in-order → skip; otherwise import as new set
    - Collections: same name → merge tune/set members (ignore duplicates); new name → create
    - Tags, aliases: add new ones, skip existing
    - Achievements, note_documents, note_attachments: import as new entries
    - Uploads: copy files that don't already exist on disk
    """
    content = await file.read()
    buf = io.BytesIO(content)
    if not zipfile.is_zipfile(buf):
        raise HTTPException(400, "File is not a valid ZIP archive")
    buf.seek(0)

    with zipfile.ZipFile(buf, "r") as z:
        if "library.json" not in z.namelist():
            raise HTTPException(400, "ZIP does not contain library.json")
        incoming = json.loads(z.read("library.json"))
        # Copy new uploads
        for name in z.namelist():
            if name.startswith("uploads/") and not name.endswith("/"):
                fname = name.split("/", 1)[1]
                dest = UPLOADS_DIR / fname
                if not dest.exists():
                    UPLOADS_DIR.mkdir(parents=True, exist_ok=True)
                    dest.write_bytes(z.read(name))

    try:
        with get_connection() as conn:
            result = _do_merge(conn, incoming)
    except Exception as exc:
        raise HTTPException(500, f"Merge error: {exc}") from exc

    return result


def _do_merge(conn, inc: dict) -> dict:  # noqa: C901
    stats = {"tunes_added": 0, "tunes_merged": 0, "tunes_versioned": 0,
             "sets_added": 0, "sets_skipped": 0,
             "collections_added": 0, "collections_merged": 0}

    # ── 1. Tags ────────────────────────────────────────────────────────────────
    # Map incoming tag_id → local tag_id (by tag name)
    tag_id_map: dict[int, int] = {}
    local_tags = {row["name"]: row["id"]
                  for row in conn.execute("SELECT id, name FROM tags").fetchall()}
    for t in inc.get("tags", []):
        name = t.get("name", "")
        if not name:
            continue
        if name in local_tags:
            tag_id_map[t["id"]] = local_tags[name]
        else:
            new_id = conn.execute("INSERT INTO tags (name) VALUES (?)", (name,)).lastrowid
            tag_id_map[t["id"]] = new_id
            local_tags[name] = new_id

    # ── 2. Tunes ───────────────────────────────────────────────────────────────
    # Map incoming tune_id → local tune_id
    tune_id_map: dict[int, int] = {}

    # Build title → list of existing tunes (there may already be multiple versions)
    existing_by_title: dict[str, list[dict]] = {}
    for row in conn.execute("SELECT * FROM tunes").fetchall():
        key = (row["title"] or "").strip().lower()
        existing_by_title.setdefault(key, []).append(dict(row))

    def _abc_norm(abc: str | None) -> str:
        """Strip comments/whitespace for comparison."""
        if not abc:
            return ""
        lines = [l.strip() for l in abc.splitlines()
                 if l.strip() and not l.strip().startswith("%")]
        return "\n".join(lines)

    def _ensure_parent(conn, tune_id: int, title: str) -> int:
        """Return existing parent_id for tune, or create one and re-parent all siblings."""
        row = conn.execute("SELECT parent_id FROM tunes WHERE id=?", (tune_id,)).fetchone()
        if row and row["parent_id"]:
            return row["parent_id"]
        # Create a new parent stub
        parent_id = conn.execute(
            "INSERT INTO tunes (title, abc, type, key, mode, rating, on_hitlist, "
            "imported_at, created_at, updated_at) "
            "VALUES (?,'',(SELECT type FROM tunes WHERE id=?),(SELECT key FROM tunes WHERE id=?),"
            "(SELECT mode FROM tunes WHERE id=?),0,0,datetime('now'),datetime('now'),datetime('now'))",
            (title, tune_id, tune_id, tune_id),
        ).lastrowid
        # Re-parent all existing tunes with same title that share no parent yet
        siblings = conn.execute(
            "SELECT id FROM tunes WHERE LOWER(TRIM(title))=? AND parent_id IS NULL AND id!=?",
            (title.strip().lower(), parent_id),
        ).fetchall()
        for i, sib in enumerate(siblings):
            conn.execute(
                "UPDATE tunes SET parent_id=?, version_label=? WHERE id=?",
                (parent_id, f"Version {i+1}", sib["id"]),
            )
        return parent_id

    for t in inc.get("tunes", []):
        old_id = t.get("id")
        title = (t.get("title") or "").strip()
        title_key = title.lower()
        incoming_abc = _abc_norm(t.get("abc"))

        match = None
        for ex in existing_by_title.get(title_key, []):
            if _abc_norm(ex.get("abc")) == incoming_abc:
                match = ex
                break

        if match:
            # Same title + same ABC → merge metadata only
            new_rating = max(match.get("rating") or 0, t.get("rating") or 0)
            new_hitlist = 1 if ((match.get("on_hitlist") or 0) or (t.get("on_hitlist") or 0)) else 0
            conn.execute(
                "UPDATE tunes SET rating=?, on_hitlist=? WHERE id=?",
                (new_rating, new_hitlist, match["id"]),
            )
            tune_id_map[old_id] = match["id"]
            stats["tunes_merged"] += 1

        elif existing_by_title.get(title_key):
            # Same title, different ABC → insert and group as versions
            new_id = conn.execute(
                "INSERT INTO tunes (title, type, key, mode, abc, notes, source_url, "
                "composer, transcribed_by, rating, on_hitlist, setting_id, "
                "imported_at, created_at, updated_at) "
                "VALUES (?,?,?,?,?,?,?,?,?,?,?,?,datetime('now'),datetime('now'),datetime('now'))",
                (title, t.get("type"), t.get("key"), t.get("mode"),
                 t.get("abc") or "", t.get("notes"), t.get("source_url"),
                 t.get("composer") or "", t.get("transcribed_by") or "",
                 t.get("rating") or 0, t.get("on_hitlist") or 0,
                 t.get("setting_id")),
            ).lastrowid
            tune_id_map[old_id] = new_id
            # Ensure a parent exists and group under it
            existing_rep = existing_by_title[title_key][0]
            parent_id = _ensure_parent(conn, existing_rep["id"], title)
            # Count existing versions to pick next label
            version_count = conn.execute(
                "SELECT COUNT(*) FROM tunes WHERE parent_id=?", (parent_id,)
            ).fetchone()[0]
            conn.execute(
                "UPDATE tunes SET parent_id=?, version_label=? WHERE id=?",
                (parent_id, f"Version {version_count + 1}", new_id),
            )
            # Also merge rating/hitlist onto the parent (keep max)
            conn.execute(
                "UPDATE tunes SET rating=MAX(rating,?), on_hitlist=MAX(on_hitlist,?) WHERE id=?",
                (t.get("rating") or 0, t.get("on_hitlist") or 0, parent_id),
            )
            existing_by_title[title_key].append({"id": new_id, **t})
            stats["tunes_versioned"] += 1
            stats["tunes_added"] += 1

        else:
            # Completely new tune
            new_id = conn.execute(
                "INSERT INTO tunes (title, type, key, mode, abc, notes, source_url, "
                "composer, transcribed_by, rating, on_hitlist, setting_id, "
                "imported_at, created_at, updated_at) "
                "VALUES (?,?,?,?,?,?,?,?,?,?,?,?,datetime('now'),datetime('now'),datetime('now'))",
                (title, t.get("type"), t.get("key"), t.get("mode"),
                 t.get("abc") or "", t.get("notes"), t.get("source_url"),
                 t.get("composer") or "", t.get("transcribed_by") or "",
                 t.get("rating") or 0, t.get("on_hitlist") or 0,
                 t.get("setting_id")),
            ).lastrowid
            tune_id_map[old_id] = new_id
            existing_by_title[title_key] = [{"id": new_id, **t}]
            stats["tunes_added"] += 1

    # ── 3. Tune aliases ────────────────────────────────────────────────────────
    existing_aliases = {
        (row["tune_id"], row["alias"])
        for row in conn.execute("SELECT tune_id, alias FROM tune_aliases").fetchall()
    }
    for a in inc.get("tune_aliases", []):
        local_tid = tune_id_map.get(a.get("tune_id"))
        alias = a.get("alias", "")
        if local_tid and alias and (local_tid, alias) not in existing_aliases:
            conn.execute("INSERT INTO tune_aliases (tune_id, alias) VALUES (?,?)",
                         (local_tid, alias))
            existing_aliases.add((local_tid, alias))

    # ── 4. Tune tags ───────────────────────────────────────────────────────────
    existing_tune_tags = {
        (row["tune_id"], row["tag_id"])
        for row in conn.execute("SELECT tune_id, tag_id FROM tune_tags").fetchall()
    }
    for tt in inc.get("tune_tags", []):
        local_tid = tune_id_map.get(tt.get("tune_id"))
        local_tag = tag_id_map.get(tt.get("tag_id"))
        if local_tid and local_tag and (local_tid, local_tag) not in existing_tune_tags:
            conn.execute("INSERT INTO tune_tags (tune_id, tag_id) VALUES (?,?)",
                         (local_tid, local_tag))
            existing_tune_tags.add((local_tid, local_tag))

    # ── 5. Sets ────────────────────────────────────────────────────────────────
    set_id_map: dict[int, int] = {}

    # Build incoming set→tunes mapping (sorted by position)
    inc_set_tunes: dict[int, list[int]] = {}
    for st in inc.get("set_tunes", []):
        inc_set_tunes.setdefault(st["set_id"], []).append(st)
    for sid in inc_set_tunes:
        inc_set_tunes[sid].sort(key=lambda x: x.get("position", 0))

    # Build existing sets: name → {id, tune_ids_in_order}
    existing_sets: dict[str, dict] = {}
    for row in conn.execute("SELECT id, name FROM sets").fetchall():
        tids = [r["tune_id"] for r in conn.execute(
            "SELECT tune_id FROM set_tunes WHERE set_id=? ORDER BY position",
            (row["id"],)).fetchall()]
        existing_sets[row["name"].lower()] = {"id": row["id"], "tune_ids": tids}

    for s in inc.get("sets", []):
        old_sid = s["id"]
        name = s.get("name", "")
        translated_tids = [
            tune_id_map[st["tune_id"]]
            for st in inc_set_tunes.get(old_sid, [])
            if st["tune_id"] in tune_id_map
        ]

        name_key = name.lower()
        if name_key in existing_sets:
            ex = existing_sets[name_key]
            if ex["tune_ids"] == translated_tids:
                set_id_map[old_sid] = ex["id"]
                stats["sets_skipped"] += 1
                continue

        # Insert new set
        new_sid = conn.execute(
            "INSERT INTO sets (name, notes, created_at) VALUES (?,?,datetime('now'))",
            (name, s.get("notes")),
        ).lastrowid
        set_id_map[old_sid] = new_sid
        for pos, tid in enumerate(translated_tids):
            conn.execute(
                "INSERT INTO set_tunes (set_id, tune_id, position) VALUES (?,?,?)",
                (new_sid, tid, pos),
            )
        existing_sets[name_key] = {"id": new_sid, "tune_ids": translated_tids}
        stats["sets_added"] += 1

    # ── 6. Collections ─────────────────────────────────────────────────────────
    existing_cols: dict[str, int] = {
        row["name"].lower(): row["id"]
        for row in conn.execute("SELECT id, name FROM collections").fetchall()
    }
    existing_col_tunes: dict[int, set] = {}
    for row in conn.execute("SELECT collection_id, tune_id FROM collection_tunes").fetchall():
        existing_col_tunes.setdefault(row["collection_id"], set()).add(row["tune_id"])
    existing_col_sets: dict[int, set] = {}
    for row in conn.execute("SELECT collection_id, set_id FROM collection_sets").fetchall():
        existing_col_sets.setdefault(row["collection_id"], set()).add(row["set_id"])

    for c in inc.get("collections", []):
        old_cid = c["id"]
        name = c.get("name", "")
        name_key = name.lower()

        if name_key in existing_cols:
            local_cid = existing_cols[name_key]
            stats["collections_merged"] += 1
        else:
            local_cid = conn.execute(
                "INSERT INTO collections (name, description, created_at) "
                "VALUES (?,?,datetime('now'))",
                (name, c.get("description")),
            ).lastrowid
            existing_cols[name_key] = local_cid
            existing_col_tunes[local_cid] = set()
            existing_col_sets[local_cid] = set()
            stats["collections_added"] += 1

        col_tunes_here = existing_col_tunes.setdefault(local_cid, set())
        col_sets_here  = existing_col_sets.setdefault(local_cid, set())

        for ct in inc.get("collection_tunes", []):
            if ct.get("collection_id") != old_cid:
                continue
            local_tid = tune_id_map.get(ct["tune_id"])
            if local_tid and local_tid not in col_tunes_here:
                conn.execute(
                    "INSERT INTO collection_tunes (collection_id, tune_id) VALUES (?,?)",
                    (local_cid, local_tid),
                )
                col_tunes_here.add(local_tid)

        for cs in inc.get("collection_sets", []):
            if cs.get("collection_id") != old_cid:
                continue
            local_sid = set_id_map.get(cs["set_id"])
            if local_sid and local_sid not in col_sets_here:
                conn.execute(
                    "INSERT INTO collection_sets (collection_id, set_id) VALUES (?,?)",
                    (local_cid, local_sid),
                )
                col_sets_here.add(local_sid)

    # ── 7. Achievements ────────────────────────────────────────────────────────
    for a in inc.get("achievements", []):
        local_tid = tune_id_map.get(a.get("tune_id")) if a.get("tune_id") else None
        conn.execute(
            "INSERT INTO achievements (type, tune_id, tune_name, note, created_at) "
            "VALUES (?,?,?,?,?)",
            (a.get("type", "manual"), local_tid,
             a.get("tune_name"), a.get("note"),
             a.get("created_at") or datetime.now().isoformat()),
        )

    # ── 8. Note documents + attachments ───────────────────────────────────────
    doc_id_map: dict[int, int] = {}
    for d in inc.get("note_documents", []):
        new_did = conn.execute(
            "INSERT INTO note_documents (title, content, created_at, updated_at) "
            "VALUES (?,?,?,?)",
            (d.get("title", "Untitled"), d.get("content", ""),
             d.get("created_at") or datetime.now().isoformat(),
             d.get("updated_at") or datetime.now().isoformat()),
        ).lastrowid
        doc_id_map[d["id"]] = new_did

    for a in inc.get("note_attachments", []):
        local_did = doc_id_map.get(a.get("document_id"))
        if not local_did:
            continue
        conn.execute(
            "INSERT INTO note_attachments (document_id, type, filename, original_name, "
            "url, title, created_at) VALUES (?,?,?,?,?,?,?)",
            (local_did, a.get("type"), a.get("filename"), a.get("original_name"),
             a.get("url"), a.get("title"),
             a.get("created_at") or datetime.now().isoformat()),
        )

    return {"status": "ok", "stats": stats}


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
# PDF book scan: extract outline (bookmarks) and/or embedded ABC tunes
# ---------------------------------------------------------------------------

def _clean_collection_name(filename: str) -> str:
    """Derive a human-readable collection name from a PDF filename."""
    stem = Path(filename).stem
    stem = re.sub(r"[_\-]+", " ", stem)
    stem = re.sub(r"^\d+[\s.\-_]+", "", stem)
    return stem.strip().title()


def _flatten_pdf_outline(outline, reader, result: list):
    """Recursively flatten a PyPDF2 outline into [{title, start_page}]."""
    for item in outline:
        if isinstance(item, list):
            _flatten_pdf_outline(item, reader, result)
        else:
            try:
                page_num = reader.get_page_number(item.page) + 1  # 1-indexed
                result.append({"title": item.title.strip(), "start_page": page_num})
            except Exception:
                pass


def _extract_abc_tunes_from_text(text: str) -> list[dict]:
    """Split raw text into ABC tune blocks by X: marker, return tune dicts."""
    tunes = []
    # Split on lines that start a new tune (X: at start of line)
    blocks = re.split(r'(?m)(?=^X:\s*\d)', text)
    for block in blocks:
        block = block.strip()
        if not re.match(r'^X:\s*\d', block):
            continue
        title_m = re.search(r'^T:\s*(.+)$', block, re.MULTILINE)
        key_m   = re.search(r'^K:\s*(.+)$', block, re.MULTILINE)
        type_m  = re.search(r'^R:\s*(.+)$', block, re.MULTILINE)
        if not title_m:
            continue
        tunes.append({
            "title": title_m.group(1).strip(),
            "key":   key_m.group(1).strip()  if key_m  else "",
            "type":  type_m.group(1).strip() if type_m else "",
            "abc":   block,
        })
    return tunes


@app.post("/api/import/book/scan")
async def scan_book_pdf(file: UploadFile = File(...)):
    """
    Scan a PDF book and return:
    - page_count
    - collection_name (derived from filename)
    - toc: list of {title, start_page, end_page} from PDF bookmarks (if present)
    - abc_tunes: list of {title, key, type, abc} extracted from text layer (if present)
    """
    content = await file.read()
    try:
        reader = PyPDF2.PdfReader(io.BytesIO(content))
        page_count = len(reader.pages)
    except Exception as e:
        raise HTTPException(400, f"Could not read PDF: {e}")

    collection_name = _clean_collection_name(file.filename or "Book")

    # 1. Extract PDF outline/bookmarks
    toc: list[dict] = []
    try:
        if reader.outline:
            _flatten_pdf_outline(reader.outline, reader, toc)
    except Exception:
        pass

    # Calculate end pages: each tune ends one page before the next starts
    for i in range(len(toc) - 1):
        toc[i]["end_page"] = toc[i + 1]["start_page"] - 1
    if toc:
        toc[-1]["end_page"] = page_count

    # 2. Extract embedded ABC text
    abc_tunes: list[dict] = []
    try:
        all_text = ""
        for page in reader.pages:
            all_text += (page.extract_text() or "") + "\n\n"
        if all_text.strip():
            abc_tunes = _extract_abc_tunes_from_text(all_text)
    except Exception:
        pass

    return {
        "page_count": page_count,
        "collection_name": collection_name,
        "toc": toc,
        "abc_tunes": abc_tunes,
    }


# ---------------------------------------------------------------------------
# ABC bulk import: import a list of pre-parsed ABC tunes into a collection
# ---------------------------------------------------------------------------

class AbcTuneItem(BaseModel):
    title: str
    abc: str
    type: str = ""
    key: str = ""


class AbcBulkImportBody(BaseModel):
    collection_name: str
    tunes: list[AbcTuneItem]


@app.post("/api/import/abc-tunes", status_code=201)
def import_abc_tunes(body: AbcBulkImportBody):
    """
    Import a list of ABC tunes (e.g. extracted from a PDF) into the library
    and group them into a named collection.
    """
    if not body.collection_name.strip():
        raise HTTPException(400, "collection_name is required")
    if not body.tunes:
        raise HTTPException(400, "tunes list is empty")

    import_date = date.today().isoformat()
    results = []

    with _db() as conn:
        # Get or create collection
        existing_col = conn.execute(
            "SELECT id FROM collections WHERE lower(name) = lower(?)",
            (body.collection_name.strip(),),
        ).fetchone()
        if existing_col:
            col_id = existing_col["id"]
        else:
            cur = conn.execute(
                "INSERT INTO collections (name, description) VALUES (?, ?)",
                (body.collection_name.strip(), f"Imported from PDF: {import_date}"),
            )
            col_id = cur.lastrowid

        for tune in body.tunes:
            title = tune.title.strip()
            if not title:
                continue

            # Check for existing tune with same title
            existing = conn.execute(
                "SELECT id FROM tunes WHERE lower(title) = lower(?)", (title,)
            ).fetchone()

            if existing:
                tune_id = existing["id"]
                # Append ABC if tune currently has none
                row = conn.execute(
                    "SELECT abc FROM tunes WHERE id = ?", (tune_id,)
                ).fetchone()
                if row and not (row["abc"] or "").strip() and tune.abc.strip():
                    conn.execute(
                        "UPDATE tunes SET abc = ?, updated_at = datetime('now') WHERE id = ?",
                        (tune.abc, tune_id),
                    )
                action = "exists"
            else:
                cur = conn.execute(
                    """INSERT INTO tunes (title, type, key, abc, notes, imported_at)
                       VALUES (?, ?, ?, ?, ?, datetime('now'))""",
                    (
                        title,
                        tune.type,
                        tune.key,
                        tune.abc,
                        f"Imported from {body.collection_name}: {import_date}",
                    ),
                )
                tune_id = cur.lastrowid
                action = "created"

            conn.execute(
                "INSERT OR IGNORE INTO collection_tunes (collection_id, tune_id) VALUES (?, ?)",
                (col_id, tune_id),
            )
            results.append({"title": title, "action": action, "tune_id": tune_id})

    created = sum(1 for r in results if r["action"] == "created")
    exists  = sum(1 for r in results if r["action"] == "exists")
    return {
        "collection_id": col_id,
        "collection_name": body.collection_name.strip(),
        "created": created,
        "exists": exists,
        "results": results,
    }


# ---------------------------------------------------------------------------
# PDF book import (split book PDF by TOC into per-tune slices)
# ---------------------------------------------------------------------------

@app.post("/api/import/book")
async def import_book_pdf(
    file: UploadFile = File(...),
    collection_name: str = Query(...),
    toc: str = Query(...),   # JSON: [{title, start_page, end_page}]
):
    """
    Split a multi-tune PDF book into per-tune slices.
    Creates tune entries, stores sliced PDFs in uploads/, groups into a collection.
    """
    toc_entries = json.loads(toc)  # [{title, start_page, end_page}]
    if not toc_entries:
        raise HTTPException(400, "TOC is empty")

    content = await file.read()
    try:
        reader = PyPDF2.PdfReader(io.BytesIO(content))
        total_pages = len(reader.pages)
    except Exception as e:
        raise HTTPException(400, f"Could not read PDF: {e}")

    import_date = date.today().isoformat()
    results = []

    with _db() as conn:
        # Create or find collection
        existing_col = conn.execute(
            "SELECT id FROM collections WHERE lower(name) = lower(?)", (collection_name,)
        ).fetchone()
        if existing_col:
            col_id = existing_col["id"]
        else:
            cur = conn.execute(
                "INSERT INTO collections (name, description) VALUES (?, ?)",
                (collection_name, f"Imported from PDF: {file.filename}"),
            )
            col_id = cur.lastrowid

        for entry in toc_entries:
            title = entry.get("title", "").strip()
            # Pages are 1-indexed from the user; PyPDF2 is 0-indexed
            start = max(1, int(entry.get("start_page", 1)))
            end   = min(total_pages, int(entry.get("end_page", start)))

            if not title:
                continue

            # Slice pages
            writer = PyPDF2.PdfWriter()
            for p in range(start - 1, end):
                writer.add_page(reader.pages[p])

            buf = io.BytesIO()
            writer.write(buf)
            stored_name = f"{uuid.uuid4().hex}.pdf"
            (UPLOADS_DIR / stored_name).write_bytes(buf.getvalue())
            pdf_url = f"/api/uploads/{stored_name}"
            pdf_note = f"sheet music (PDF): {pdf_url}"

            # Check for existing tune with same title
            existing_tune = conn.execute(
                "SELECT id FROM tunes WHERE lower(title) = lower(?)", (title,)
            ).fetchone()

            if existing_tune:
                tune_id = existing_tune["id"]
                row = conn.execute("SELECT notes FROM tunes WHERE id = ?", (tune_id,)).fetchone()
                existing_notes = (row["notes"] or "").strip() if row else ""
                new_notes = f"{existing_notes}\n{pdf_note}".strip() if existing_notes else pdf_note
                conn.execute(
                    "UPDATE tunes SET notes = ?, updated_at = datetime('now') WHERE id = ?",
                    (new_notes, tune_id),
                )
                action = "attached"
            else:
                cur = conn.execute(
                    "INSERT INTO tunes (title, abc, notes, imported_at) VALUES (?, '', ?, datetime('now'))",
                    (title, f"Imported from {collection_name}: {import_date}\n{pdf_note}"),
                )
                tune_id = cur.lastrowid
                action = "created"

            # Add to collection (ignore if already member)
            conn.execute(
                "INSERT OR IGNORE INTO collection_tunes (collection_id, tune_id) VALUES (?, ?)",
                (col_id, tune_id),
            )
            results.append({"title": title, "action": action, "tune_id": tune_id, "pages": f"{start}–{end}"})

    return {"collection_id": col_id, "collection_name": collection_name, "results": results}


# ---------------------------------------------------------------------------
# Image (photo/scan) import — enhance and store sheet music photos
# ---------------------------------------------------------------------------

def _deskew_image(img: "Image.Image") -> "Image.Image":
    """
    Detect and correct document skew using projection-profile variance.
    Coarse pass (1° steps, ±10°) then fine pass (0.25° steps, ±1° around best).
    Works on a thumbnail for speed; applies the angle to the full-res image.
    """
    try:
        import numpy as np
        from PIL import Image as _Image

        thumb = img.copy()
        thumb.thumbnail((600, 600))
        arr = np.array(thumb)

        best_angle = 0.0
        best_score = -1.0

        # Coarse search
        for angle in range(-10, 11):
            rotated = np.array(thumb.rotate(angle, fillcolor=255))
            score = float((rotated < 128).sum(axis=1).var())
            if score > best_score:
                best_score = score
                best_angle = float(angle)

        # Fine search around winner
        for angle in np.arange(best_angle - 1.0, best_angle + 1.05, 0.25):
            rotated = np.array(thumb.rotate(float(angle), fillcolor=255))
            score = float((rotated < 128).sum(axis=1).var())
            if score > best_score:
                best_score = score
                best_angle = float(angle)

        if abs(best_angle) > 0.3:
            img = img.rotate(best_angle, fillcolor=255, expand=True,
                             resample=_Image.BICUBIC)
    except Exception:
        pass  # numpy not available or image is unusual — skip deskew

    return img


def _enhance_scan(content: bytes) -> bytes:
    """
    Enhance a phone photo or flatbed scan of sheet music:
      1. Flatten alpha → white background
      2. Convert to greyscale
      3. Downsample to max 2400px (phone photos are huge)
      4. Auto-contrast (stretches histogram — fixes dark/uneven lighting)
      5. Deskew (correct tilt up to ±10°)
      6. Sharpen twice (crisp notes and barlines)
    Returns JPEG bytes.
    """
    from PIL import Image, ImageOps, ImageFilter
    import io as _io

    img = Image.open(_io.BytesIO(content))

    # Flatten transparency to white background
    if img.mode in ("RGBA", "LA", "PA"):
        bg = Image.new("RGB", img.size, (255, 255, 255))
        if img.mode == "RGBA":
            bg.paste(img, mask=img.split()[3])
        else:
            bg.paste(img.convert("RGB"))
        img = bg
    elif img.mode not in ("RGB", "L"):
        img = img.convert("RGB")

    # Greyscale
    img = img.convert("L")

    # Cap resolution — phone photos can be 12MP+
    max_px = 2400
    w, h = img.size
    if max(w, h) > max_px:
        scale = max_px / max(w, h)
        img = img.resize((int(w * scale), int(h * scale)), Image.LANCZOS)

    # Auto-contrast (cuts 1% from each histogram tail, then stretches)
    img = ImageOps.autocontrast(img, cutoff=1)

    # Deskew
    img = _deskew_image(img)

    # Sharpen twice for crisp notation
    img = img.filter(ImageFilter.SHARPEN)
    img = img.filter(ImageFilter.SHARPEN)

    buf = _io.BytesIO()
    img.save(buf, format="JPEG", quality=90, optimize=True)
    return buf.getvalue()


@app.post("/api/import/images", status_code=201)
async def import_images(
    files: list[UploadFile] = File(...),
    titles: str = Query(...),           # JSON array of titles (one per file)
    collection_name: str = Query(...),
):
    """
    Accept JPEG/PNG photos of sheet music, enhance each one, store it in
    uploads/, create a tune entry, and group all tunes into a Collection.
    """
    titles_list: list[str] = json.loads(titles)
    import_date = date.today().isoformat()
    results = []

    with _db() as conn:
        # Get or create collection
        existing_col = conn.execute(
            "SELECT id FROM collections WHERE lower(name) = lower(?)",
            (collection_name.strip(),),
        ).fetchone()
        if existing_col:
            col_id = existing_col["id"]
        else:
            cur = conn.execute(
                "INSERT INTO collections (name, description) VALUES (?, ?)",
                (collection_name.strip(), f"Imported from photos: {import_date}"),
            )
            col_id = cur.lastrowid

        for i, f in enumerate(files):
            raw_title = (titles_list[i] if i < len(titles_list) else "").strip()
            title = raw_title or _title_from_filename(f.filename or f"Image {i + 1}")

            content = await f.read()

            # Enhance image
            try:
                processed = _enhance_scan(content)
                ext = ".jpg"
            except Exception:
                processed = content
                ext = Path(f.filename).suffix.lower() if f.filename else ".jpg"

            stored_name = f"{uuid.uuid4().hex}{ext}"
            (UPLOADS_DIR / stored_name).write_bytes(processed)
            image_url  = f"/api/uploads/{stored_name}"
            image_note = f"sheet music (image): {image_url}"

            # Check for existing tune with same title
            existing = conn.execute(
                "SELECT id, notes FROM tunes WHERE lower(title) = lower(?)", (title,)
            ).fetchone()

            if existing:
                tune_id = existing["id"]
                old_notes = (existing["notes"] or "").strip()
                conn.execute(
                    "UPDATE tunes SET notes = ?, updated_at = datetime('now') WHERE id = ?",
                    (f"{old_notes}\n{image_note}".strip(), tune_id),
                )
                action = "attached"
            else:
                cur = conn.execute(
                    "INSERT INTO tunes (title, abc, notes, imported_at) VALUES (?, '', ?, datetime('now'))",
                    (title, f"Imported from {collection_name}: {import_date}\n{image_note}"),
                )
                tune_id = cur.lastrowid
                action = "created"

            conn.execute(
                "INSERT OR IGNORE INTO collection_tunes (collection_id, tune_id) VALUES (?, ?)",
                (col_id, tune_id),
            )
            results.append({"title": title, "action": action, "tune_id": tune_id})

    created  = sum(1 for r in results if r["action"] == "created")
    attached = sum(1 for r in results if r["action"] == "attached")
    return {
        "collection_name": collection_name.strip(),
        "collection_id": col_id,
        "created": created,
        "attached": attached,
        "results": results,
    }


# ---------------------------------------------------------------------------
# ABC transcription from image via Claude vision
# ---------------------------------------------------------------------------

@app.post("/api/tunes/{tune_id}/transcribe-image")
async def transcribe_image(tune_id: int):
    """
    Send the tune's stored sheet-music image to Claude (vision) and return
    an ABC transcription.  Requires ANTHROPIC_API_KEY in the environment.
    """
    import base64
    import json
    import ssl
    import certifi
    import urllib.request
    import urllib.error

    api_key = os.environ.get("ANTHROPIC_API_KEY", "").strip()
    if not api_key:
        raise HTTPException(
            status_code=500,
            detail="ANTHROPIC_API_KEY is not set. Add it to your environment and restart the server.",
        )

    with _db() as conn:
        tune = conn.execute(
            "SELECT id, title, notes FROM tunes WHERE id = ?", (tune_id,)
        ).fetchone()
    if not tune:
        raise HTTPException(404, "Tune not found")

    notes = tune["notes"] or ""
    source = _source_file_for_tune(notes)
    ext_url = None if source else _external_sheet_url(notes)

    if not source and not ext_url:
        raise HTTPException(400, "No sheet-music PDF or image attached to this tune")

    def _pdf_bytes_to_image(raw: bytes) -> bytes:
        try:
            import fitz  # PyMuPDF
        except ImportError:
            raise HTTPException(500, "PyMuPDF not installed. Run: pip install pymupdf")
        doc = fitz.open(stream=raw, filetype="pdf")
        pix = doc[0].get_pixmap(dpi=200)
        result = pix.tobytes("jpeg")
        doc.close()
        return result

    if source:
        raw = source.read_bytes()
        suffix = source.suffix.lower()
    else:
        # Download external URL (FlutefFling etc.)
        try:
            resp = httpx.get(ext_url, timeout=30, follow_redirects=True)
            resp.raise_for_status()
            raw = resp.content
        except Exception as exc:
            raise HTTPException(502, f"Could not download sheet music: {exc}")
        ct = resp.headers.get("content-type", "")
        suffix = ".pdf" if "pdf" in ct or ext_url.lower().endswith(".pdf") else ".jpg"

    # PDFs must be rendered to an image before sending to Claude Vision
    if suffix == ".pdf":
        image_bytes = _pdf_bytes_to_image(raw)
        media_type = "image/jpeg"
    else:
        image_bytes = raw
        media_type = "image/png" if suffix == ".png" else "image/jpeg"

    image_b64 = base64.standard_b64encode(image_bytes).decode()

    prompt = f"""Transcribe this sheet music image to ABC notation.

Output ONLY the ABC notation — no explanations, no markdown code fences.

Use this structure:
X:1
T:{tune["title"]}
M:[time signature from the image]
L:1/8
K:[key signature from the image]
[all bars of music]

Rules:
- Preserve all repeats (|: :|), double barlines (||), and first/second endings ([1 [2).
- If there are multiple parts (A part, B part, etc.), include them all in sequence.
- Use standard ABC pitch notation: uppercase C D E F G A B for the octave below middle C,
  lowercase c d e f g a b for the middle-C octave, add ' for each octave above.
- Use sharps/flats as accidentals (^C _E etc.) only where not already in the key signature."""

    payload = json.dumps({
        "model": "claude-opus-4-6",
        "max_tokens": 2048,
        "messages": [
            {
                "role": "user",
                "content": [
                    {
                        "type": "image",
                        "source": {
                            "type": "base64",
                            "media_type": media_type,
                            "data": image_b64,
                        },
                    },
                    {"type": "text", "text": prompt},
                ],
            }
        ],
    }).encode()

    req = urllib.request.Request(
        "https://api.anthropic.com/v1/messages",
        data=payload,
        headers={
            "x-api-key": api_key,
            "anthropic-version": "2023-06-01",
            "content-type": "application/json",
        },
        method="POST",
    )
    ssl_ctx = ssl.create_default_context(cafile=certifi.where())
    try:
        with urllib.request.urlopen(req, timeout=60, context=ssl_ctx) as resp:
            result = json.loads(resp.read())
    except urllib.error.HTTPError as e:
        body = e.read().decode()
        raise HTTPException(status_code=502, detail=f"Anthropic API error: {body}")
    except urllib.error.URLError as e:
        raise HTTPException(status_code=502, detail=f"Could not reach Anthropic API: {e.reason}")

    abc = result["content"][0]["text"].strip()
    # Strip markdown fences in case the model adds them despite the instruction
    abc = re.sub(r"^```[a-z]*\n?", "", abc, flags=re.IGNORECASE)
    abc = re.sub(r"\n?```$", "", abc).strip()

    return {"abc": abc}


# ---------------------------------------------------------------------------
# Audiveris (local OMR) + capabilities
# ---------------------------------------------------------------------------

def _find_audiveris() -> Optional[str]:
    """Return path to Audiveris.jar, or None if not found."""
    # 1. Explicit env var pointing at the JAR
    jar = os.environ.get("AUDIVERIS_JAR", "").strip()
    if jar and Path(jar).exists():
        return jar

    # 2. AUDIVERIS_HOME env var — look for lib/Audiveris.jar inside it
    home_env = os.environ.get("AUDIVERIS_HOME", "").strip()
    if home_env:
        candidate = Path(home_env) / "lib" / "Audiveris.jar"
        if candidate.exists():
            return str(candidate)

    # 3. Common macOS install locations
    user_home = Path.home()
    candidates = [
        user_home / "bin"          / "Audiveris" / "lib" / "Audiveris.jar",
        user_home / "Applications" / "Audiveris" / "lib" / "Audiveris.jar",
        user_home / "Audiveris"    /               "lib" / "Audiveris.jar",
        Path("/Applications/Audiveris/lib/Audiveris.jar"),
        Path("/opt/Audiveris/lib/Audiveris.jar"),
    ]
    for c in candidates:
        if c.exists():
            return str(c)

    return None


def _find_java(audiveris_jar: Optional[str] = None) -> Optional[str]:
    """Return path to java executable, checking bundled JRE, PATH, and common macOS locations."""
    # 1. JRE bundled inside the Audiveris .app (jpackage layout)
    if audiveris_jar:
        app_root = Path(audiveris_jar).parent
        while app_root.name and app_root.name != "/":
            bundled = app_root / "runtime" / "Contents" / "Home" / "bin" / "java"
            if bundled.exists():
                return str(bundled)
            bundled = app_root / "runtime" / "bin" / "java"
            if bundled.exists():
                return str(bundled)
            if app_root.suffix == ".app":
                break
            app_root = app_root.parent

    # 2. PATH
    j = shutil.which("java")
    if j:
        return j

    # 3. macOS JDK installer location
    jvm_root = Path("/Library/Java/JavaVirtualMachines")
    if jvm_root.exists():
        for jdk in sorted(jvm_root.iterdir(), reverse=True):
            candidate = jdk / "Contents" / "Home" / "bin" / "java"
            if candidate.exists():
                return str(candidate)

    # 4. Homebrew (Apple Silicon and Intel)
    for candidate in [
        Path("/opt/homebrew/bin/java"),
        Path("/opt/homebrew/opt/openjdk/bin/java"),
        Path("/usr/local/bin/java"),
        Path("/usr/local/opt/openjdk/bin/java"),
        Path("/usr/bin/java"),
    ]:
        if candidate.exists():
            return str(candidate)

    return None


def _audiveris_info() -> dict:
    """Return Audiveris availability status, including the base command to invoke it."""
    jar = _find_audiveris()
    if not jar:
        return {"available": False, "jar": None, "cmd": None, "reason": "Audiveris.jar not found"}

    # Prefer the native launcher inside a .app bundle (jpackage layout).
    # Running via "java -jar" on a jpackaged JAR fails because the JAR depends
    # on the bundled JRE being discovered by the launcher, not by java itself.
    jar_path = Path(jar)
    probe = jar_path.parent
    while probe != probe.parent:
        if probe.suffix == ".app":
            launcher = probe / "Contents" / "MacOS" / "Audiveris"
            if launcher.exists():
                return {"available": True, "jar": jar, "cmd": [str(launcher)], "reason": None}
            break
        probe = probe.parent

    # Fall back to java -jar for non-bundled installs
    java = _find_java(jar)
    if not java:
        return {"available": False, "jar": jar, "cmd": None,
                "reason": "java not found (install JDK or Homebrew openjdk)"}
    try:
        r = subprocess.run([java, "-version"], capture_output=True, timeout=10)
        if r.returncode != 0:
            return {"available": False, "jar": jar, "cmd": None, "reason": "java not working"}
    except subprocess.TimeoutExpired:
        return {"available": False, "jar": jar, "cmd": None, "reason": "java not responding"}
    return {"available": True, "jar": jar, "cmd": [java, "-Xmx768m", "-jar", jar], "reason": None}


def _has_music21() -> bool:
    try:
        import music21  # noqa: F401
        return True
    except ImportError:
        return False


@app.get("/api/capabilities")
def capabilities():
    """Return which optional features are available on this server."""
    aud = _audiveris_info()
    return {
        "has_anthropic_key": bool(os.environ.get("ANTHROPIC_API_KEY", "").strip()),
        "has_audiveris":     aud["available"],
        "audiveris_jar":     aud.get("jar"),
        "audiveris_reason":  aud.get("reason"),
        "has_music21":       _has_music21(),
    }


def _music21_to_abc(xml_path: str, title: str) -> str:
    """Convert a MusicXML/.mxl file to an ABC string using music21."""
    from music21 import converter as m21

    score = m21.parse(xml_path)
    score.metadata.title = title

    # Write to a temp ABC file and read it back
    tmp = Path(tempfile.mktemp(suffix=".abc"))
    try:
        out = score.write("abc", fp=str(tmp))
        text = Path(out).read_text(encoding="utf-8", errors="replace")
    finally:
        if tmp.exists():
            tmp.unlink(missing_ok=True)

    # Strip any blank lines that music21 adds between tunes (we only want one)
    text = re.sub(r"\n{3,}", "\n\n", text).strip()
    # Ensure title header matches what the user stored
    text = re.sub(r"(?m)^T:.*$", f"T:{title}", text, count=1)
    # Strip markdown fences if present
    text = re.sub(r"^```[a-z]*\n?", "", text, flags=re.IGNORECASE)
    text = re.sub(r"\n?```$", "", text).strip()
    return text


def _source_file_for_tune(notes: str) -> Optional[Path]:
    """Find the best local source file (PDF preferred, then image) for a tune."""
    for pattern in (r"sheet music \(PDF\):\s*(\S+)", r"sheet music \(image\):\s*(\S+)"):
        m = re.search(pattern, notes or "", re.IGNORECASE)
        if m:
            fname = m.group(1).rstrip("/").split("/")[-1]
            f = UPLOADS_DIR / fname
            if f.exists():
                return f
    return None


def _external_sheet_url(notes: str) -> Optional[str]:
    """Return an external (http/https) sheet-music URL from notes, or None."""
    for pattern in (r"sheet music \(PDF\):\s*(https?://\S+)", r"sheet music \(image\):\s*(https?://\S+)"):
        m = re.search(pattern, notes or "", re.IGNORECASE)
        if m:
            return m.group(1)
    return None


@app.post("/api/tunes/{tune_id}/transcribe-audiveris")
async def transcribe_audiveris(tune_id: int):
    """
    Run Audiveris (local Java OMR) on the tune's attached PDF/image and
    convert the resulting MusicXML to ABC via music21.
    Requires Audiveris to be installed (set AUDIVERIS_JAR env var or install
    to ~/bin/Audiveris/) and music21 (pip install music21).
    """
    aud = _audiveris_info()
    if not aud["available"]:
        raise HTTPException(500, f"Audiveris not available: {aud['reason']}. "
                                  "Install Audiveris and set AUDIVERIS_JAR=/path/to/Audiveris.jar")

    if not _has_music21():
        raise HTTPException(500, "music21 not installed. Run: pip install music21")

    with _db() as conn:
        tune = conn.execute(
            "SELECT id, title, notes FROM tunes WHERE id = ?", (tune_id,)
        ).fetchone()
    if not tune:
        raise HTTPException(404, "Tune not found")

    notes = tune["notes"] or ""
    source = _source_file_for_tune(notes)
    ext_url = None if source else _external_sheet_url(notes)

    if not source and not ext_url:
        raise HTTPException(400, "No sheet-music PDF or image attached to this tune")

    with tempfile.TemporaryDirectory() as tmpdir:
        out_dir = Path(tmpdir) / "out"
        out_dir.mkdir()

        # If source is an external URL, download it into the temp dir
        if not source:
            try:
                resp = httpx.get(ext_url, timeout=30, follow_redirects=True)
                resp.raise_for_status()
            except Exception as exc:
                raise HTTPException(502, f"Could not download sheet music: {exc}")
            ct = resp.headers.get("content-type", "")
            ext = ".pdf" if "pdf" in ct or ext_url.lower().endswith(".pdf") else ".jpg"
            dl_path = Path(tmpdir) / f"source{ext}"
            dl_path.write_bytes(resp.content)
            source = dl_path

        cmd = aud["cmd"] + [
            "-batch", "-export",
            "-output", str(out_dir),
            "--", str(source),
        ]
        try:
            result = subprocess.run(
                cmd, capture_output=True, text=True, timeout=180
            )
        except subprocess.TimeoutExpired:
            raise HTTPException(504, "Audiveris timed out (>3 min) — try a simpler image")
        except FileNotFoundError:
            raise HTTPException(500, "java not found in PATH")

        # Find MusicXML output (prefer .mxl compressed, fall back to .xml)
        mxl_files = sorted(out_dir.glob("**/*.mxl")) + sorted(out_dir.glob("**/*.xml"))
        if not mxl_files:
            stderr_snippet = result.stderr[-600:] if result.stderr else "(no stderr)"
            raise HTTPException(
                500,
                f"Audiveris produced no MusicXML output. "
                f"It may not recognise this image quality. stderr: {stderr_snippet}"
            )

        try:
            abc = _music21_to_abc(str(mxl_files[0]), tune["title"])
        except Exception as e:
            raise HTTPException(500, f"MusicXML→ABC conversion failed: {e}")

    return {"abc": abc, "source": source.name}


# ---------------------------------------------------------------------------
# PDF bulk import
# ---------------------------------------------------------------------------

def _title_from_filename(filename: str) -> str:
    """Convert a PDF filename to a tune title."""
    stem = Path(filename).stem
    # Replace underscores and hyphens with spaces
    stem = re.sub(r"[_\-]+", " ", stem)
    # Strip leading digits + punctuation (e.g. "01. Title" → "Title")
    stem = re.sub(r"^\d+[\s.\-_]+", "", stem)
    return stem.strip().title()


def _match_tune_title(title: str, conn) -> Optional[int]:
    """Return tune id of best case-insensitive title match, or None."""
    # Exact match first
    row = conn.execute(
        "SELECT id FROM tunes WHERE lower(title) = lower(?)", (title,)
    ).fetchone()
    if row:
        return row["id"]
    # Strip leading "The " / "An " / "A " and retry
    stripped = re.sub(r"^(the|an?)\s+", "", title, flags=re.IGNORECASE).strip()
    if stripped.lower() != title.lower():
        row = conn.execute(
            "SELECT id FROM tunes WHERE lower(title) = lower(?) OR lower(title) = lower(?)",
            (stripped, f"The {stripped}"),
        ).fetchone()
        if row:
            return row["id"]
    return None


@app.post("/api/import/pdfs/preview")
async def preview_pdf_imports(files: list[UploadFile] = File(...)):
    """
    Receive PDF files, derive titles from filenames, fuzzy-match against the
    library, and return a preview list for the user to confirm.
    """
    with _db() as conn:
        results = []
        for f in files:
            title = _title_from_filename(f.filename or "Unknown")
            existing_id = _match_tune_title(title, conn)
            if existing_id:
                existing_title = conn.execute(
                    "SELECT title FROM tunes WHERE id = ?", (existing_id,)
                ).fetchone()["title"]
            else:
                existing_title = None
            results.append({
                "filename": f.filename,
                "title": title,
                "action": "attach" if existing_id else "create",
                "existing_id": existing_id,
                "existing_title": existing_title,
            })
    return {"files": results}


@app.post("/api/import/pdfs/confirm")
async def confirm_pdf_imports(
    files: list[UploadFile] = File(...),
    titles: str = Query(...),       # JSON array of titles (one per file)
    actions: str = Query(...),      # JSON array of "attach"|"create" (one per file)
    existing_ids: str = Query(...), # JSON array of int|null (one per file)
    collection_name: Optional[str] = Query(None),  # optional: auto-create collection
):
    """
    Save uploaded PDFs and create/update tune entries based on user-confirmed plan.
    """
    titles_list = json.loads(titles)
    actions_list = json.loads(actions)
    existing_ids_list = json.loads(existing_ids)

    import_date = date.today().isoformat()
    results = []
    new_tune_ids: list[int] = []

    with _db() as conn:
        for i, f in enumerate(files):
            title = titles_list[i]
            action = actions_list[i]
            existing_id = existing_ids_list[i]

            content = await f.read()
            ext = Path(f.filename).suffix if f.filename else ".pdf"
            stored_name = f"{uuid.uuid4().hex}{ext}"
            (UPLOADS_DIR / stored_name).write_bytes(content)
            pdf_url = f"/api/uploads/{stored_name}"
            pdf_note = f"sheet music (PDF): {pdf_url}"

            if action == "attach" and existing_id:
                # Append PDF link to existing tune's notes
                row = conn.execute(
                    "SELECT notes FROM tunes WHERE id = ?", (existing_id,)
                ).fetchone()
                existing_notes = (row["notes"] or "").strip() if row else ""
                new_notes = f"{existing_notes}\n{pdf_note}".strip() if existing_notes else pdf_note
                conn.execute(
                    "UPDATE tunes SET notes = ?, updated_at = datetime('now') WHERE id = ?",
                    (new_notes, existing_id),
                )
                results.append({"action": "attached", "tune_id": existing_id, "title": title})
            else:
                # Create new tune
                cur = conn.execute(
                    """INSERT INTO tunes (title, abc, notes, imported_at)
                       VALUES (?, '', ?, datetime('now'))""",
                    (title, f"Imported from PDF: {import_date}\n{pdf_note}"),
                )
                tid = cur.lastrowid
                new_tune_ids.append(tid)
                results.append({"action": "created", "tune_id": tid, "title": title})

        # Optionally create a collection containing all newly-created tunes
        col_id = None
        if collection_name and new_tune_ids:
            col_name = collection_name.strip()
            cur = conn.execute(
                "INSERT INTO collections (name) VALUES (?)", (col_name,)
            )
            col_id = cur.lastrowid
            conn.executemany(
                "INSERT OR IGNORE INTO collection_tunes (collection_id, tune_id) VALUES (?, ?)",
                [(col_id, tid) for tid in new_tune_ids],
            )

    return {"results": results, "collection_id": col_id}


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
