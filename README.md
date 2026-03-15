# Ceol – Personal Trad Music Web App

A local web app for browsing, filtering, and playing with your trad tune library,
built on The Craic ABC database.

## Project layout

```
Ceol/
├── backend/
│   ├── abc_parser.py     # Parse .abc files → Tune objects (key/mode normalised)
│   ├── database.py       # SQLite schema + connection helper
│   ├── import_tunes.py   # CLI importer: abc → SQLite
│   └── main.py           # FastAPI app (JSON API + static files)
├── frontend/
│   ├── index.html
│   └── static/
│       ├── style.css
│       └── app.js
├── data/                 # ceol.db lives here (git-ignored)
├── requirements.txt
└── run.sh
```

## Setup

```bash
# 1. Create virtual environment and install dependencies
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

## Import your ABC file

Place your `.abc` file anywhere and run:

```bash
python backend/import_tunes.py /path/to/craic.abc
```

Options:
- `--reset`  clears existing tunes before re-importing (safe to re-run)
- `--db`     path to a custom database file (default: `data/ceol.db`)

After import the script prints a summary, e.g.:

```
Parsed 2154 tunes
Inserted 2154 tunes.

--- Import summary ---
  Total tunes in DB : 2154

  By type:
    reel                 1102
    jig                   612
    hornpipe              148
    slip jig               89
    polka                  62
    ...

  Top 10 keys:
    D major               498
    G major               312
    ...
```

## Run the server

```bash
./run.sh
# or:
uvicorn backend.main:app --host 0.0.0.0 --port 8000 --reload
```

Open `http://localhost:8000` on your desktop or `http://<your-LAN-ip>:8000` on
your phone (both must be on the same Wi-Fi network).

## API endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/tunes` | Paginated tune list (filter by `q`, `type`, `key`, `mode`) |
| GET | `/api/tunes/{id}` | Single tune with ABC notation and aliases |
| GET | `/api/filters` | Distinct types / keys / modes for the filter dropdowns |
| GET | `/api/stats` | Totals by type and mode |
