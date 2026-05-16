"""
SQLite database setup for Ceol (trad music web app).
Creates all tables from the project schema.
"""

import os
import re
import sqlite3
import unicodedata
from pathlib import Path


def _search_norm(s: str | None) -> str:
    """Normalise a string for search: lowercase, strip accents and punctuation."""
    if not s:
        return ""
    # Strip combining accent characters (NFD decomposition)
    nfd = unicodedata.normalize("NFD", s)
    no_accents = "".join(c for c in nfd if unicodedata.category(c) != "Mn")
    return re.sub(r"[^\w\s]", "", no_accents, flags=re.UNICODE).lower()

# === Phase 0 Part 2: per-user DB routing ===
# DB_PATH now resolves to the current user's per-user database via
# user_paths. Phase 0 hardcodes user 1 here at module load time; Phase 1
# will need to re-think this (likely making DB_PATH a function of the
# request-scoped ContextVar). For now, all 100+ `with _db()` call-sites
# in main.py keep working unchanged because main.py overrides _db() to
# read from the ContextVar at request time — this constant is only used
# by `init_db()` and `get_connection()` defaults.
_data_dir = os.environ.get("CEOL_DATA_DIR")  # kept for backwards compatibility
from backend import user_paths as _user_paths_for_db_path
DB_PATH = _user_paths_for_db_path.user_db_path(1)

SCHEMA = """
-- Core tune data (imported from The Craic)
CREATE TABLE IF NOT EXISTS tunes (
    id                       INTEGER PRIMARY KEY AUTOINCREMENT,
    craic_id                 TEXT,
    session_id               INTEGER,
    title                    TEXT NOT NULL,
    type                     TEXT,
    key                      TEXT,
    mode                     TEXT,
    abc                      TEXT NOT NULL,
    notes                    TEXT,
    source_url               TEXT,
    imported_at              TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_at               TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at               TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    seeded_from_collection_id INTEGER  -- 16 May 2026: source collection id in admin's library
);

-- Alternate titles / aliases for a tune
CREATE TABLE IF NOT EXISTS tune_aliases (
    id      INTEGER PRIMARY KEY AUTOINCREMENT,
    tune_id INTEGER REFERENCES tunes(id),
    alias   TEXT NOT NULL
);

-- Sets: named groupings of tunes in order
CREATE TABLE IF NOT EXISTS sets (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    name       TEXT NOT NULL,
    notes      TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Tunes within a set (ordered)
CREATE TABLE IF NOT EXISTS set_tunes (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    set_id       INTEGER REFERENCES sets(id),
    tune_id      INTEGER REFERENCES tunes(id),
    position     INTEGER NOT NULL,
    key_override TEXT,
    repeats      INTEGER NOT NULL DEFAULT 2  -- added 15 May 2026
);

-- Tags for flexible organisation
CREATE TABLE IF NOT EXISTS tags (
    id   INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL
);

CREATE TABLE IF NOT EXISTS tune_tags (
    tune_id INTEGER REFERENCES tunes(id),
    tag_id  INTEGER REFERENCES tags(id),
    PRIMARY KEY (tune_id, tag_id)
);

-- Collections: thematic groupings of tunes (many-to-many)
CREATE TABLE IF NOT EXISTS collections (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    name         TEXT NOT NULL,
    description  TEXT,
    created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    is_starter   INTEGER NOT NULL DEFAULT 0,  -- 16 May 2026
    is_favourite INTEGER NOT NULL DEFAULT 0,  -- 16 May 2026 polish
    on_hitlist   INTEGER NOT NULL DEFAULT 0   -- 16 May 2026 polish
);

CREATE TABLE IF NOT EXISTS collection_tunes (
    collection_id INTEGER REFERENCES collections(id) ON DELETE CASCADE,
    tune_id       INTEGER REFERENCES tunes(id) ON DELETE CASCADE,
    added_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (collection_id, tune_id)
);

-- Musical theory / reference notes
CREATE TABLE IF NOT EXISTS theory_notes (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    title      TEXT NOT NULL,
    content    TEXT NOT NULL,
    category   TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- TheSession.org cache
CREATE TABLE IF NOT EXISTS session_cache (
    session_id  INTEGER PRIMARY KEY,
    tune_data   JSON,
    recordings  JSON,
    fetched_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Achievements log (auto + manual entries)
CREATE TABLE IF NOT EXISTS achievements (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    type       TEXT NOT NULL DEFAULT 'manual',
    tune_id    INTEGER REFERENCES tunes(id) ON DELETE SET NULL,
    tune_title TEXT,
    note       TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- App-wide key/value settings (e.g. global notes)
CREATE TABLE IF NOT EXISTS app_settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL DEFAULT ''
);

-- Notes documents (general-purpose notes, not per-tune)
CREATE TABLE IF NOT EXISTS note_documents (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    title      TEXT NOT NULL DEFAULT 'Untitled',
    content    TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Attachments for note documents: uploaded files or saved web links
CREATE TABLE IF NOT EXISTS note_attachments (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    document_id   INTEGER NOT NULL REFERENCES note_documents(id) ON DELETE CASCADE,
    type          TEXT NOT NULL,       -- 'file' or 'link'
    filename      TEXT,                -- stored filename on disk (files only)
    original_name TEXT,                -- original upload name (files only)
    mime_type     TEXT,
    size          INTEGER,
    url           TEXT,                -- URL (links) or download path (files)
    title         TEXT,                -- display title for links
    created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS dismissed_groupings (
    tune_id_a     INTEGER NOT NULL,
    tune_id_b     INTEGER NOT NULL,
    PRIMARY KEY (tune_id_a, tune_id_b)
);

CREATE TABLE IF NOT EXISTS user_links (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    label      TEXT NOT NULL,
    url        TEXT NOT NULL,
    emoji      TEXT NOT NULL DEFAULT '🔗',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
"""


def get_connection(db_path: Path = DB_PATH) -> sqlite3.Connection:
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    conn.execute("PRAGMA journal_mode = WAL")
    conn.create_function("search_norm", 1, _search_norm)
    return conn


def _migrate(conn: sqlite3.Connection) -> None:
    # Idempotent migration: add `repeats` to set_tunes if missing
    # (added 15 May 2026).
    try:
        cols = {row[1] for row in conn.execute(
            "PRAGMA table_info(set_tunes)"
        ).fetchall()}
        if "repeats" not in cols:
            conn.execute(
                "ALTER TABLE set_tunes ADD COLUMN repeats "
                "INTEGER NOT NULL DEFAULT 2"
            )
    except Exception as e:
        print(f"[Ceol] set_tunes.repeats migration warning: {e}")

    # Idempotent: starter-collection columns (added 16 May 2026).
    try:
        cols = {row[1] for row in conn.execute(
            "PRAGMA table_info(collections)"
        ).fetchall()}
        if "is_starter" not in cols:
            conn.execute(
                "ALTER TABLE collections ADD COLUMN is_starter "
                "INTEGER NOT NULL DEFAULT 0"
            )
    except Exception as e:
        print(f"[Ceol] collections.is_starter migration warning: {e}")

    try:
        cols = {row[1] for row in conn.execute(
            "PRAGMA table_info(tunes)"
        ).fetchall()}
        if "seeded_from_collection_id" not in cols:
            conn.execute(
                "ALTER TABLE tunes ADD COLUMN "
                "seeded_from_collection_id INTEGER"
            )
    except Exception as e:
        print(f"[Ceol] tunes.seeded_from_collection_id migration warning: {e}")

    # Polish patch (16 May 2026): collections get hitlist + favourite.
    try:
        cols = {row[1] for row in conn.execute(
            "PRAGMA table_info(collections)"
        ).fetchall()}
        if "is_favourite" not in cols:
            conn.execute(
                "ALTER TABLE collections ADD COLUMN is_favourite "
                "INTEGER NOT NULL DEFAULT 0"
            )
        if "on_hitlist" not in cols:
            conn.execute(
                "ALTER TABLE collections ADD COLUMN on_hitlist "
                "INTEGER NOT NULL DEFAULT 0"
            )
    except Exception as e:
        print(f"[Ceol] collections.is_favourite/on_hitlist migration warning: {e}")
    """Apply incremental migrations for existing databases."""
    existing_cols = {row[1] for row in conn.execute("PRAGMA table_info(tunes)").fetchall()}
    if "imported_at" not in existing_cols:
        conn.execute("ALTER TABLE tunes ADD COLUMN imported_at TIMESTAMP")
        conn.execute("UPDATE tunes SET imported_at = created_at WHERE imported_at IS NULL")
    if "parent_id" not in existing_cols:
        conn.execute("ALTER TABLE tunes ADD COLUMN parent_id INTEGER REFERENCES tunes(id)")
    if "version_label" not in existing_cols:
        conn.execute("ALTER TABLE tunes ADD COLUMN version_label TEXT NOT NULL DEFAULT ''")
    if "rating" not in existing_cols:
        conn.execute("ALTER TABLE tunes ADD COLUMN rating INTEGER NOT NULL DEFAULT 0")
    if "on_hitlist" not in existing_cols:
        conn.execute("ALTER TABLE tunes ADD COLUMN on_hitlist INTEGER NOT NULL DEFAULT 0")
    if "setting_id" not in existing_cols:
        conn.execute("ALTER TABLE tunes ADD COLUMN setting_id TEXT")
    if "session_member" not in existing_cols:
        conn.execute("ALTER TABLE tunes ADD COLUMN session_member TEXT")
    if "session_date" not in existing_cols:
        conn.execute("ALTER TABLE tunes ADD COLUMN session_date TEXT")
    if "source_url" not in existing_cols:
        conn.execute("ALTER TABLE tunes ADD COLUMN source_url TEXT")
    if "is_default" not in existing_cols:
        conn.execute("ALTER TABLE tunes ADD COLUMN is_default INTEGER NOT NULL DEFAULT 0")
    if "is_favourite" not in existing_cols:
        conn.execute("ALTER TABLE tunes ADD COLUMN is_favourite INTEGER NOT NULL DEFAULT 0")
    if "composer" not in existing_cols:
        conn.execute("ALTER TABLE tunes ADD COLUMN composer TEXT NOT NULL DEFAULT ''")
    if "transcribed_by" not in existing_cols:
        conn.execute("ALTER TABLE tunes ADD COLUMN transcribed_by TEXT NOT NULL DEFAULT ''")
    if "highlights" not in existing_cols:
        conn.execute("ALTER TABLE tunes ADD COLUMN highlights TEXT NOT NULL DEFAULT '[]'")
    if "transpose" not in existing_cols:
        conn.execute("ALTER TABLE tunes ADD COLUMN transpose INTEGER NOT NULL DEFAULT 0")

    # sets table migrations
    existing_set_cols = {row[1] for row in conn.execute("PRAGMA table_info(sets)").fetchall()}
    if "is_favourite" not in existing_set_cols:
        conn.execute("ALTER TABLE sets ADD COLUMN is_favourite INTEGER NOT NULL DEFAULT 0")
    if "rating" not in existing_set_cols:
        conn.execute("ALTER TABLE sets ADD COLUMN rating INTEGER NOT NULL DEFAULT 0")
    if "on_hitlist" not in existing_set_cols:
        conn.execute("ALTER TABLE sets ADD COLUMN on_hitlist INTEGER NOT NULL DEFAULT 0")

    # Phase 1 of playlist work (16 May 2026 late evening):
    # client-rendered MP3 per set for lock-screen-friendly offline playback.
    if "rendered_audio_path" not in existing_set_cols:
        conn.execute("ALTER TABLE sets ADD COLUMN rendered_audio_path TEXT")
    if "rendered_audio_at" not in existing_set_cols:
        conn.execute("ALTER TABLE sets ADD COLUMN rendered_audio_at INTEGER")
    if "rendered_audio_hash" not in existing_set_cols:
        conn.execute("ALTER TABLE sets ADD COLUMN rendered_audio_hash TEXT")

    # Collections tables (added v3)
    existing_tables = {row[0] for row in conn.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall()}
    if "collections" not in existing_tables:
        conn.execute("""
            CREATE TABLE collections (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                name        TEXT NOT NULL,
                description TEXT,
                created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
    if "collection_tunes" not in existing_tables:
        conn.execute("""
            CREATE TABLE collection_tunes (
                collection_id INTEGER REFERENCES collections(id) ON DELETE CASCADE,
                tune_id       INTEGER REFERENCES tunes(id) ON DELETE CASCADE,
                added_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (collection_id, tune_id)
            )
        """)
    if "collection_sets" not in existing_tables:
        conn.execute("""
            CREATE TABLE collection_sets (
                collection_id INTEGER REFERENCES collections(id) ON DELETE CASCADE,
                set_id        INTEGER REFERENCES sets(id) ON DELETE CASCADE,
                added_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (collection_id, set_id)
            )
        """)
    if "dismissed_groupings" not in existing_tables:
        conn.execute("""
            CREATE TABLE dismissed_groupings (
                tune_id_a INTEGER NOT NULL,
                tune_id_b INTEGER NOT NULL,
                PRIMARY KEY (tune_id_a, tune_id_b)
            )
        """)
    if "user_links" not in existing_tables:
        conn.execute("""
            CREATE TABLE user_links (
                id         INTEGER PRIMARY KEY AUTOINCREMENT,
                label      TEXT NOT NULL,
                url        TEXT NOT NULL,
                emoji      TEXT NOT NULL DEFAULT '🔗',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)


def init_db(db_path: Path = DB_PATH) -> None:
    db_path.parent.mkdir(parents=True, exist_ok=True)
    with get_connection(db_path) as conn:
        conn.executescript(SCHEMA)
        _migrate(conn)
    print(f"Database initialised at {db_path}")


if __name__ == "__main__":
    init_db()
