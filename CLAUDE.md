# Ceol – Trad Music Web App

## How to run
```bash
cd /Users/callummaclellan/Ceol/v3
git pull --rebase origin claude/develop-ceol-v2-GVdsA
./run.sh
```
Then open `http://localhost:8001` in the browser. Hard-refresh with **Cmd+Shift+R** after pulling new code.

## Architecture
- **Backend**: FastAPI (Python) in `backend/main.py` — REST API + serves frontend
- **Database**: SQLite at `data/ceol.db` — auto-migrates on startup
- **Frontend**: Vanilla JS (`frontend/static/app.js`), CSS (`style.css`), HTML (`index.html`)
- **ABC rendering**: abcjs library (local, `frontend/static/abcjs-basic-min.js`)

## Feature status

### Done ✅
- Library with search, type/key/mode filters
- ABC sheet music display with abcjs (flute MIDI instrument)
- Audio playback with bar-range selection for practice loops
- Import from TheSession.org (search, preview, import)
- Import from FlutefFling.scot (paste PDF + MP3 URLs → stored in notes)
- FlutefFling PDF embedded in Sheet Music tab (when no ABC)
- FlutefFling catalogue browser — search & one-click import from full catalogue
- Download PDF / MP3 buttons in tune modal for FlutefFling tunes (proxy endpoint)
- Hitlist tune titles styled as accent-coloured hyperlinks
- Tune versioning: group tunes as versions under a parent entry
- Merge/group dialog: select 2+ tunes → "Group as versions"
- Versions panel: click parent → list of versions → click version → full modal
- ← Back button when navigating from versions panel into a version
- Notes with auto-linked URLs (MP3, YouTube, PDF, generic links)
- MP3/YouTube media overlay player in notes
- Star rating (0–5 stars) on cards and in tune modal
- Hitlist (📌) — flag tunes to learn; filter bar toggle + per-card button
- Sets: create named sets of tunes, reorder, play as a sequence
- Notes documents: rich freeform notes with attachments
- Achievements — auto-log rating improvements & hitlist changes; manual entries; timeline view

### To do 📋
- [ ] **Upload voice recordings** — Record in-browser or upload audio file,
      attach to a tune (linked in notes section). Uses existing note_attachments
      infrastructure.
- [ ] **Upload MP3 to attach to tunes or sets** — File upload UI per tune/set;
      stored in data/uploads/. Linked in notes.
- [ ] **Trim uploaded audio** — Browser-based trim UI (WaveSurfer.js) or
      server-side via ffmpeg. Complex — do after basic upload works.
- [ ] **Harmonies** — Clarify with user: ABC harmony line in the tune editor,
      or links to external harmony recordings/sheet music?
- [ ] **iOS / web hosting** — Deploy backend to Railway/Render; frontend served
      from same host. Add PWA manifest so it can be pinned to iOS home screen.
- [ ] **Raspberry Pi self-hosting** — Host the app on a Raspberry Pi (new model,
      currently unused). Plan: install Python + dependencies, create a systemd
      service so the app auto-starts on boot and restarts on crash, set up
      Tailscale for secure remote access from any device (Mac, iPhone, etc.),
      and add a PWA manifest for iOS home screen pinning. No port forwarding or
      paid hosting needed.
- [ ] **Multi-user template** — Clean open-source version others can fork and
      populate with their own tunes. Two approaches to discuss:
      (1) Self-hosted: publish a clean GitHub repo; users clone and run it
      themselves (free but technical). (2) Shared hosted app: add user
      accounts/login so multiple people share one server instance; host on
      Railway/Render for ~£5–10/month total — owner pays, invites others.
      Option 2 is more accessible for non-technical musicians. Requires adding
      authentication (login/signup) and per-user data isolation to the current
      single-user architecture.

## Database schema notes
Key tables: `tunes`, `tune_aliases`, `tune_tags`, `sets`, `set_tunes`,
`theory_notes`, `session_cache`, `app_settings`, `note_documents`,
`note_attachments`

`tunes` extra columns (added via migration):
- `imported_at` — timestamp
- `parent_id` — self-ref for versioning
- `version_label` — subtitle for versioned tunes
- `rating` — 0–5 star rating
- `on_hitlist` — 0/1 boolean

## Development branch
All changes go to: `claude/trad-music-web-app-fwneF`
