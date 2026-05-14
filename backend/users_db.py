""" # ceol-phase0-part1 5 May 2026
users.db — auth database for multi-user Ceol.

Phase 0 status: schema and read helpers only, no auth logic. Phase 1
will add login/logout endpoints and session management.

Phase 0 schema is just the `users` table with one seeded row for
user 1 (Callum). The `password_hash` column is nullable in this
phase because there is no auth yet — every request runs as user 1
via a hardcoded dependency in main.py.

Phase 1 will add the `sessions` table, populate password_hash via
bcrypt, and replace the hardcoded user_id=1 dependency with cookie
based auth.
"""
import sqlite3
from contextlib import contextmanager
from . import user_paths


SCHEMA_USERS = """
CREATE TABLE IF NOT EXISTS users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    username      TEXT    UNIQUE NOT NULL,
    display_name  TEXT,
    password_hash TEXT,                       -- nullable in Phase 0
    is_admin      INTEGER NOT NULL DEFAULT 0,
    created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_login    TIMESTAMP,
    disabled      INTEGER NOT NULL DEFAULT 0  -- added 14 May 2026 (hardening)
);
"""

# Login attempt audit log (added 14 May 2026, hardening). Records every
# attempt — success or failure — with IP and user agent. Never stores
# the attempted password.
SCHEMA_LOGIN_AUDIT = """
CREATE TABLE IF NOT EXISTS login_audit (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username_attempted TEXT NOT NULL,
    ip TEXT,
    success INTEGER NOT NULL,
    user_agent TEXT,
    timestamp INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_login_audit_timestamp
    ON login_audit (timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_login_audit_ip
    ON login_audit (ip);
"""

# Per the multi-user decisions doc: Callum is the initial sole user
# and username == display_name.
SEED_ADMIN = {
    "username": "callum",
    "display_name": "callum",
    "is_admin": 1,
}


def init_users_db():
    """Create users.db with the schema if missing, and seed the admin
    user if absent. Idempotent — safe to call on every server start.
    """
    conn = sqlite3.connect(user_paths.auth_db_path())
    try:
        conn.executescript(SCHEMA_USERS)
        conn.executescript(SCHEMA_LOGIN_AUDIT)
        # Idempotent migration: add `disabled` column to pre-existing
        # `users` tables that were created before 14 May 2026.
        existing_cols = {row[1] for row in conn.execute(
            "PRAGMA table_info(users)"
        ).fetchall()}
        if "disabled" not in existing_cols:
            conn.execute(
                "ALTER TABLE users ADD COLUMN disabled "
                "INTEGER NOT NULL DEFAULT 0"
            )
        cur = conn.execute(
            "SELECT id FROM users WHERE username = ?",
            (SEED_ADMIN["username"],),
        )
        if cur.fetchone() is None:
            conn.execute(
                "INSERT INTO users (username, display_name, is_admin) "
                "VALUES (?, ?, ?)",
                (
                    SEED_ADMIN["username"],
                    SEED_ADMIN["display_name"],
                    SEED_ADMIN["is_admin"],
                ),
            )
        conn.commit()
    finally:
        conn.close()


@contextmanager
def auth_db():
    """Connection to users.db with sqlite3.Row factory. Caller must
    commit() any writes themselves.
    """
    conn = sqlite3.connect(user_paths.auth_db_path())
    conn.row_factory = sqlite3.Row
    try:
        yield conn
    finally:
        conn.close()


def get_user_by_id(user_id: int) -> dict | None:
    """Look up a user by primary key."""
    with auth_db() as conn:
        row = conn.execute(
            "SELECT id, username, display_name, is_admin "
            "FROM users WHERE id = ?",
            (int(user_id),),
        ).fetchone()
        return dict(row) if row else None


def get_user_by_username(username: str) -> dict | None:
    """Look up a user by username. Includes password_hash (used by
    auth code in Phase 1).
    """
    with auth_db() as conn:
        row = conn.execute(
            "SELECT id, username, display_name, is_admin, password_hash "
            "FROM users WHERE username = ?",
            (username,),
        ).fetchone()
        return dict(row) if row else None



def log_login_attempt(username: str, ip: str | None,
                      success: bool, user_agent: str | None) -> None:
    """Append a row to login_audit. Swallows any exception so a logging
    failure can never break login itself.
    """
    import time as _t
    try:
        with auth_db() as conn:
            conn.execute(
                "INSERT INTO login_audit "
                "(username_attempted, ip, success, user_agent, timestamp) "
                "VALUES (?, ?, ?, ?, ?)",
                (
                    (username or "")[:200],
                    ip,
                    1 if success else 0,
                    (user_agent or "")[:500],
                    int(_t.time()),
                ),
            )
            conn.commit()
    except Exception as e:  # pragma: no cover — defensive only
        print(f"[Ceol] failed to log login attempt: {e}")
