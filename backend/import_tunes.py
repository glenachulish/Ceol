"""
Import tunes from an ABC file into the Ceol SQLite database.

Usage:
    python import_tunes.py <path/to/tunes.abc> [--db <path/to/ceol.db>] [--reset]

Options:
    --reset   Drop and recreate the tunes / tune_aliases tables before importing
              (safe to re-run; won't touch sets, tags, or theory_notes).
"""

import argparse
import sys
from pathlib import Path

# Allow running from any directory
sys.path.insert(0, str(Path(__file__).parent))

from abc_parser import parse_abc_file
from database import DB_PATH, get_connection, init_db


def import_tunes(abc_path: str, db_path: Path = DB_PATH, reset: bool = False) -> int:
    """
    Parse *abc_path* and insert all tunes into the database.
    Returns the number of tunes inserted.
    """
    print(f"Parsing {abc_path} …")
    tunes = parse_abc_file(abc_path)
    print(f"  Found {len(tunes)} tune blocks in the ABC file.")

    init_db(db_path)

    with get_connection(db_path) as conn:
        if reset:
            print("  Resetting tunes and tune_aliases tables …")
            conn.execute("DELETE FROM tune_aliases")
            conn.execute("DELETE FROM tunes")

        inserted = 0
        skipped = 0

        for tune in tunes:
            if not tune.title:
                skipped += 1
                continue

            cur = conn.execute(
                """
                INSERT INTO tunes (craic_id, title, type, key, mode, abc)
                VALUES (?, ?, ?, ?, ?, ?)
                """,
                (tune.craic_id, tune.title, tune.type, tune.key, tune.mode, tune.abc),
            )
            tune_id = cur.lastrowid

            for alias in tune.aliases:
                conn.execute(
                    "INSERT INTO tune_aliases (tune_id, alias) VALUES (?, ?)",
                    (tune_id, alias),
                )

            inserted += 1

        conn.commit()

    if skipped:
        print(f"  Skipped {skipped} blocks with no title.")

    return inserted


def print_summary(db_path: Path = DB_PATH) -> None:
    with get_connection(db_path) as conn:
        total = conn.execute("SELECT COUNT(*) FROM tunes").fetchone()[0]
        print(f"\n--- Import summary ---")
        print(f"  Total tunes in DB : {total}")

        print(f"\n  By type:")
        rows = conn.execute(
            "SELECT COALESCE(type,'unknown') AS t, COUNT(*) AS n "
            "FROM tunes GROUP BY t ORDER BY n DESC"
        ).fetchall()
        for r in rows:
            print(f"    {r['t']:<20} {r['n']}")

        print(f"\n  Top 10 keys:")
        rows = conn.execute(
            "SELECT COALESCE(key,'unknown') AS k, COUNT(*) AS n "
            "FROM tunes GROUP BY k ORDER BY n DESC LIMIT 10"
        ).fetchall()
        for r in rows:
            print(f"    {r['k']:<25} {r['n']}")


def main() -> None:
    parser = argparse.ArgumentParser(description="Import ABC tunes into Ceol DB")
    parser.add_argument("abc_file", help="Path to the .abc file")
    parser.add_argument("--db", default=str(DB_PATH), help="Path to SQLite database")
    parser.add_argument(
        "--reset",
        action="store_true",
        help="Clear existing tunes before importing",
    )
    args = parser.parse_args()

    db_path = Path(args.db)
    inserted = import_tunes(args.abc_file, db_path, reset=args.reset)
    print(f"\n  Inserted {inserted} tunes.")
    print_summary(db_path)


if __name__ == "__main__":
    main()
