""" # ceol-phase0-part1 5 May 2026
Per-user path helpers for Ceol's multi-user data layout.

Single source of truth for where per-user files live. Other modules
should call these helpers and never build paths directly.
"""
from pathlib import Path
import os

# CEOL_DATA_DIR was the legacy iCloud/Dropbox sync hook. With multi-user
# the Pi is the canonical store and cloud sync is dropped, but the env
# var is still honoured if set so a custom data location keeps working.
DATA_ROOT = Path(os.environ.get("CEOL_DATA_DIR", "data"))


def users_root() -> Path:
    """data/users/ — parent of every user's directory."""
    p = DATA_ROOT / "users"
    p.mkdir(parents=True, exist_ok=True)
    return p


def user_dir(user_id: int) -> Path:
    """data/users/{user_id}/ — one user's data directory."""
    p = users_root() / str(int(user_id))
    p.mkdir(parents=True, exist_ok=True)
    return p


def user_db_path(user_id: int) -> Path:
    """SQLite database path for a given user's library."""
    return user_dir(user_id) / "ceol.db"


def user_uploads_dir(user_id: int) -> Path:
    """Uploads directory for a given user (audio, PDFs, images)."""
    p = user_dir(user_id) / "uploads"
    p.mkdir(parents=True, exist_ok=True)
    return p


def auth_db_path() -> Path:
    """data/users.db — shared auth database (users + sessions tables)."""
    DATA_ROOT.mkdir(parents=True, exist_ok=True)
    return DATA_ROOT / "users.db"
