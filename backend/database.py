"""
SQLite database setup for Ceol (trad music web app).
Creates all tables from the project schema.
"""

import sqlite3
from pathlib import Path

DB_PATH = Path(__file__).parent.parent / "data" / "ceol.db"

SCHEMA = """
-- Core tune data (imported from The Craic)
CREATE TABLE IF NOT EXISTS tunes (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    craic_id    TEXT,
    session_id  INTEGER,
    title       TEXT NOT NULL,
    type        TEXT,
    key         TEXT,
    mode        TEXT,
    abc         TEXT NOT NULL,
    notes       TEXT,
    source_url  TEXT,
    imported_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
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
    key_override TEXT
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
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT NOT NULL,
    description TEXT,
    created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
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
"""


def get_connection(db_path: Path = DB_PATH) -> sqlite3.Connection:
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    conn.execute("PRAGMA journal_mode = WAL")
    return conn


def _migrate(conn: sqlite3.Connection) -> None:
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

    # sets table migrations
    existing_set_cols = {row[1] for row in conn.execute("PRAGMA table_info(sets)").fetchall()}
    if "is_favourite" not in existing_set_cols:
        conn.execute("ALTER TABLE sets ADD COLUMN is_favourite INTEGER NOT NULL DEFAULT 0")

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


def init_db(db_path: Path = DB_PATH) -> None:
    db_path.parent.mkdir(parents=True, exist_ok=True)
    with get_connection(db_path) as conn:
        conn.executescript(SCHEMA)
        _migrate(conn)
    print(f"Database initialised at {db_path}")


if __name__ == "__main__":
    init_db()
