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

# Sessions table — was previously created out-of-band on the Pi during
# the Phase 1 rollout and never added to this schema file. Adding it
# here is idempotent (CREATE IF NOT EXISTS) and fixes the latent bug
# where a fresh install would crash on first login.
SCHEMA_SESSIONS = """
CREATE TABLE IF NOT EXISTS sessions (
    token       TEXT PRIMARY KEY,
    user_id     INTEGER NOT NULL,
    expires_at  TIMESTAMP NOT NULL,
    user_agent  TEXT,
    created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at);
"""

# Invite-link signup (added 15 May 2026). One row per invite issued by
# an admin. Single-use, expiring, revocable. Token is opaque
# 256-bit base64.
SCHEMA_INVITES = """
CREATE TABLE IF NOT EXISTS invites (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    token       TEXT    UNIQUE NOT NULL,
    created_by  INTEGER NOT NULL,
    created_at  INTEGER NOT NULL,
    expires_at  INTEGER NOT NULL,
    note        TEXT,
    used_by     INTEGER,
    used_at     INTEGER,
    revoked     INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_invites_token ON invites(token);
"""

# Password reset tokens (added 15 May 2026). Admin-mediated flow:
# user requests reset, an admin sees it on the admin page and
# delivers the link out-of-band (iMessage / WhatsApp / etc).
SCHEMA_PASSWORD_RESETS = """
CREATE TABLE IF NOT EXISTS password_resets (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    token         TEXT    UNIQUE NOT NULL,
    user_id       INTEGER NOT NULL,
    requested_at  INTEGER NOT NULL,
    expires_at    INTEGER NOT NULL,
    used_at       INTEGER,
    revoked       INTEGER NOT NULL DEFAULT 0,
    requested_ip  TEXT
);
CREATE INDEX IF NOT EXISTS idx_password_resets_token
    ON password_resets(token);
"""

# Spent-link attempts (added 19 May 2026). Logged whenever someone
# tries to use an invite token that's already been used / expired /
# revoked. Surfaces on the admin page so we can tell the recipient
# what's going on.
SCHEMA_INVITE_ATTEMPTS = """
CREATE TABLE IF NOT EXISTS invite_attempts (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    invite_id    INTEGER NOT NULL,
    reason       TEXT NOT NULL,
    ip           TEXT,
    user_agent   TEXT,
    attempted_at INTEGER NOT NULL,
    FOREIGN KEY (invite_id) REFERENCES invites(id)
);
CREATE INDEX IF NOT EXISTS idx_invite_attempts_invite
    ON invite_attempts(invite_id);
"""

# Admin-wide key/value settings (added 19 May 2026). Currently used
# only for the global default invitation message.
SCHEMA_ADMIN_SETTINGS = """
CREATE TABLE IF NOT EXISTS admin_settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL DEFAULT ''
);
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
        conn.executescript(SCHEMA_SESSIONS)
        conn.executescript(SCHEMA_INVITES)
        conn.executescript(SCHEMA_PASSWORD_RESETS)
        conn.executescript(SCHEMA_INVITE_ATTEMPTS)
        conn.executescript(SCHEMA_ADMIN_SETTINGS)
        # Idempotent ALTER on invites for the email column added 19 May 2026.
        invite_cols = {row[1] for row in conn.execute(
            "PRAGMA table_info(invites)"
        ).fetchall()}
        if "email" not in invite_cols:
            conn.execute("ALTER TABLE invites ADD COLUMN email TEXT")
        # Idempotent migrations on `users` for columns added after the
        # initial Phase 0 schema:
        existing_cols = {row[1] for row in conn.execute(
            "PRAGMA table_info(users)"
        ).fetchall()}
        if "disabled" not in existing_cols:
            conn.execute(
                "ALTER TABLE users ADD COLUMN disabled "
                "INTEGER NOT NULL DEFAULT 0"
            )
        if "email" not in existing_cols:
            conn.execute("ALTER TABLE users ADD COLUMN email TEXT")
        # Index uses lower(email) so the column must exist first; this
        # is also idempotent.
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_users_email "
            "ON users(lower(email))"
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


# ── Invite & password-reset helpers (added 15 May 2026) ──────────────

import secrets as _secrets_inv
import time as _time_inv

INVITE_TOKEN_BYTES = 32           # 256 bits ≈ 43 url-safe chars
RESET_TOKEN_BYTES  = 32
DEFAULT_INVITE_EXPIRY_DAYS  = 7
DEFAULT_RESET_EXPIRY_HOURS  = 24
MAX_PENDING_INVITES_PER_ADMIN = 50


def _now() -> int:
    return int(_time_inv.time())


def create_invite(created_by: int, note: str | None,
                  expires_in_days: int = DEFAULT_INVITE_EXPIRY_DAYS,
                  email: str | None = None,
                  ) -> dict:
    """Create a new invite. Returns the inserted row as a dict
    (including the raw token; that's how it gets delivered).
    Raises RuntimeError if the per-admin pending cap is exceeded.
    """
    token = _secrets_inv.token_urlsafe(INVITE_TOKEN_BYTES)
    now = _now()
    expires_at = now + max(1, int(expires_in_days)) * 86400
    with auth_db() as conn:
        # Pending-invites cap. "Pending" = unused + not revoked +
        # not expired.
        pending = conn.execute(
            "SELECT COUNT(*) FROM invites "
            "WHERE created_by = ? AND used_by IS NULL "
            "  AND revoked = 0 AND expires_at > ?",
            (int(created_by), now),
        ).fetchone()[0]
        if pending >= MAX_PENDING_INVITES_PER_ADMIN:
            raise RuntimeError(
                f"You already have {pending} pending invites — please "
                "revoke old ones before creating more."
            )
        conn.execute(
            "INSERT INTO invites "
            "(token, created_by, created_at, expires_at, note, email) "
            "VALUES (?, ?, ?, ?, ?, ?)",
            (token, int(created_by), now, expires_at,
             (note or "").strip()[:200] or None,
             (email or "").strip().lower()[:200] or None),
        )
        conn.commit()
        row = conn.execute(
            "SELECT * FROM invites WHERE token = ?", (token,)
        ).fetchone()
    return dict(row)


def list_invites_with_status() -> list[dict]:
    """All invites, newest first, with derived `status`, joined
    `used_by_username`, and a count of post-spent attempts."""
    now = _now()
    with auth_db() as conn:
        rows = conn.execute(
            "SELECT i.*, u.username AS used_by_username, "
            "  (SELECT COUNT(*) FROM invite_attempts a "
            "   WHERE a.invite_id = i.id) AS attempts_count "
            "FROM invites i "
            "LEFT JOIN users u ON u.id = i.used_by "
            "ORDER BY i.id DESC"
        ).fetchall()
    out = []
    for r in rows:
        d = dict(r)
        if d["revoked"]:
            d["status"] = "revoked"
        elif d["used_by"] is not None:
            d["status"] = "used"
        elif d["expires_at"] <= now:
            d["status"] = "expired"
        else:
            d["status"] = "pending"
        out.append(d)
    return out


def revoke_invite(invite_id: int) -> bool:
    """Mark an invite revoked. Returns True if a pending invite was
    revoked, False otherwise (already used, already revoked, or
    doesn't exist).
    """
    with auth_db() as conn:
        cur = conn.execute(
            "UPDATE invites SET revoked = 1 "
            "WHERE id = ? AND revoked = 0 AND used_by IS NULL",
            (int(invite_id),),
        )
        conn.commit()
        return cur.rowcount > 0


def validate_invite_token(token: str) -> tuple[bool, str]:
    """Return (valid, reason). reason is one of:
        "ok" | "invalid" | "used" | "revoked" | "expired"
    """
    if not token or len(token) > 200:
        return False, "invalid"
    with auth_db() as conn:
        row = conn.execute(
            "SELECT used_by, revoked, expires_at FROM invites "
            "WHERE token = ?",
            (token,),
        ).fetchone()
    if not row:
        return False, "invalid"
    if row["revoked"]:
        return False, "revoked"
    if row["used_by"] is not None:
        return False, "used"
    if row["expires_at"] <= _now():
        return False, "expired"
    return True, "ok"


def consume_invite_atomically(token: str) -> int | None:
    """Mark an invite as used. Atomic: only succeeds if the invite is
    currently pending. Returns the invite id on success, None on
    failure. Caller is responsible for separately validating
    expiry/revoke before showing the form, but this call enforces
    those at the moment of consumption too.
    """
    now = _now()
    with auth_db() as conn:
        # NOTE: used_by is updated separately once the user row exists.
        # Here we just lock the invite atomically so two concurrent
        # accepts can't both win.
        cur = conn.execute(
            "UPDATE invites SET used_at = ? "
            "WHERE token = ? AND used_by IS NULL AND revoked = 0 "
            "  AND expires_at > ? AND used_at IS NULL",
            (now, token, now),
        )
        if cur.rowcount == 0:
            conn.rollback()
            return None
        row = conn.execute(
            "SELECT id FROM invites WHERE token = ?", (token,)
        ).fetchone()
        conn.commit()
    return int(row["id"]) if row else None


def attach_user_to_invite(invite_id: int, user_id: int) -> None:
    with auth_db() as conn:
        conn.execute(
            "UPDATE invites SET used_by = ? WHERE id = ?",
            (int(user_id), int(invite_id)),
        )
        conn.commit()


def create_user(username: str, display_name: str, email: str | None,
                password_hash: str, is_admin: int = 0) -> int:
    """Insert a new user row. Returns the new user id."""
    with auth_db() as conn:
        cur = conn.execute(
            "INSERT INTO users "
            "(username, display_name, email, password_hash, is_admin) "
            "VALUES (?, ?, ?, ?, ?)",
            (username, display_name, email, password_hash, int(is_admin)),
        )
        conn.commit()
        return int(cur.lastrowid)


def find_user_for_reset(identifier: str) -> dict | None:
    """Look up a user by username OR email (case-insensitive). Used
    by the forgot-password endpoint; never reveals presence/absence
    of the user to the caller."""
    if not identifier:
        return None
    ident = identifier.strip().lower()
    with auth_db() as conn:
        row = conn.execute(
            "SELECT id, username, email, disabled FROM users "
            "WHERE lower(username) = ? OR lower(email) = ?",
            (ident, ident),
        ).fetchone()
    return dict(row) if row else None


def create_password_reset(user_id: int, ip: str | None,
                          expires_in_hours: int = DEFAULT_RESET_EXPIRY_HOURS
                          ) -> dict:
    """Create a reset row. Revokes any older pending resets for the
    same user so the admin page only ever shows the latest. Returns
    the row as a dict.
    """
    token = _secrets_inv.token_urlsafe(RESET_TOKEN_BYTES)
    now = _now()
    expires_at = now + max(1, int(expires_in_hours)) * 3600
    with auth_db() as conn:
        # Supersede older pending resets for this user.
        conn.execute(
            "UPDATE password_resets SET revoked = 1 "
            "WHERE user_id = ? AND used_at IS NULL AND revoked = 0",
            (int(user_id),),
        )
        conn.execute(
            "INSERT INTO password_resets "
            "(token, user_id, requested_at, expires_at, requested_ip) "
            "VALUES (?, ?, ?, ?, ?)",
            (token, int(user_id), now, expires_at, ip),
        )
        conn.commit()
        row = conn.execute(
            "SELECT * FROM password_resets WHERE token = ?", (token,)
        ).fetchone()
    return dict(row)


def list_pending_password_resets() -> list[dict]:
    """Pending = not used, not revoked, not expired. Joined with
    username for the admin display."""
    now = _now()
    with auth_db() as conn:
        rows = conn.execute(
            "SELECT pr.*, u.username FROM password_resets pr "
            "JOIN users u ON u.id = pr.user_id "
            "WHERE pr.used_at IS NULL AND pr.revoked = 0 "
            "  AND pr.expires_at > ? "
            "ORDER BY pr.id DESC",
            (now,),
        ).fetchall()
    return [dict(r) for r in rows]


def revoke_password_reset(reset_id: int) -> bool:
    with auth_db() as conn:
        cur = conn.execute(
            "UPDATE password_resets SET revoked = 1 "
            "WHERE id = ? AND used_at IS NULL AND revoked = 0",
            (int(reset_id),),
        )
        conn.commit()
        return cur.rowcount > 0


def validate_reset_token(token: str) -> tuple[bool, str, int | None]:
    """Returns (valid, reason, user_id). reason is one of:
        "ok" | "invalid" | "used" | "revoked" | "expired"
    """
    if not token or len(token) > 200:
        return False, "invalid", None
    with auth_db() as conn:
        row = conn.execute(
            "SELECT user_id, used_at, revoked, expires_at "
            "FROM password_resets WHERE token = ?",
            (token,),
        ).fetchone()
    if not row:
        return False, "invalid", None
    if row["revoked"]:
        return False, "revoked", None
    if row["used_at"] is not None:
        return False, "used", None
    if row["expires_at"] <= _now():
        return False, "expired", None
    return True, "ok", int(row["user_id"])


def consume_reset_atomically(token: str) -> int | None:
    """Mark a reset used. Atomic. Returns user_id on success."""
    now = _now()
    with auth_db() as conn:
        cur = conn.execute(
            "UPDATE password_resets SET used_at = ? "
            "WHERE token = ? AND used_at IS NULL AND revoked = 0 "
            "  AND expires_at > ?",
            (now, token, now),
        )
        if cur.rowcount == 0:
            conn.rollback()
            return None
        row = conn.execute(
            "SELECT user_id FROM password_resets WHERE token = ?",
            (token,),
        ).fetchone()
        conn.commit()
    return int(row["user_id"]) if row else None


def update_password_hash(user_id: int, new_hash: str) -> None:
    with auth_db() as conn:
        conn.execute(
            "UPDATE users SET password_hash = ? WHERE id = ?",
            (new_hash, int(user_id)),
        )
        conn.commit()


# ── Invite-attempts logging (added 19 May 2026) ──────────────────────

def find_invite_by_token(token: str) -> dict | None:
    """Look up an invite row by its raw token, regardless of state.
    Used by the verify endpoint to log post-spent attempts."""
    if not token or len(token) > 200:
        return None
    with auth_db() as conn:
        row = conn.execute(
            "SELECT id, note, email, used_by, used_at, revoked, expires_at "
            "FROM invites WHERE token = ?",
            (token,),
        ).fetchone()
    return dict(row) if row else None


def log_invite_attempt(invite_id: int, reason: str,
                       ip: str | None, user_agent: str | None) -> None:
    """Record an attempt to use a spent / expired / revoked invite.
    Swallows exceptions defensively."""
    try:
        with auth_db() as conn:
            conn.execute(
                "INSERT INTO invite_attempts "
                "(invite_id, reason, ip, user_agent, attempted_at) "
                "VALUES (?, ?, ?, ?, ?)",
                (int(invite_id), reason,
                 ip, (user_agent or "")[:500], _now()),
            )
            conn.commit()
    except Exception as e:  # pragma: no cover — defensive
        print(f"[Ceol] failed to log invite attempt: {e}")


# ── Admin settings (added 19 May 2026) ───────────────────────────────

DEFAULT_INVITE_MESSAGE = (
    "Hi {name} \u2014\n\n"
    "I've made you an account on my tune app, Ceòl. Tap the link "
    "below to set your username and password (one-time link, "
    "expires in 7 days). The welcome page that opens has more "
    "info, and there's detailed guidance behind the \u2630 menu "
    "(top left of the app once you're in).\n\n"
    "The library's yours to use as you please. I've put some "
    "collections of tunes in to get you started, but whatever you "
    "do has no effect on anyone else's library.\n\n"
    "Shout if you have trouble.\n\n"
    "\u2014 Callum\n\n"
    "{link}"
)


def get_admin_setting(key: str, default: str = "") -> str:
    with auth_db() as conn:
        row = conn.execute(
            "SELECT value FROM admin_settings WHERE key = ?", (key,)
        ).fetchone()
    return row["value"] if row else default


def set_admin_setting(key: str, value: str) -> None:
    with auth_db() as conn:
        conn.execute(
            "INSERT INTO admin_settings (key, value) VALUES (?, ?) "
            "ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            (str(key), str(value)),
        )
        conn.commit()
