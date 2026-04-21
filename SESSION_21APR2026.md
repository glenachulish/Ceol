# Ceòl – Session Summary
## 21 April 2026

---

## Project overview

**Ceòl Traidiseanta** is a personal trad music library app for managing Irish/folk tunes, sets, and collections. It runs locally on a Mac and is accessed via browser. A mobile-optimised view (`/mobile`) is the primary phone interface, also installed as a PWA on iPhone home screen.

- **Repo:** `github.com/glenachulish/Ceol` (private)
- **Active branch:** `claude/develop-ceol-v2-GVdsA`
- **Project root:** `/Users/callummaclellan/Ceol/v3`
- **Run command:** `cd /Users/callummaclellan/Ceol/v3 && git pull --rebase origin claude/develop-ceol-v2-GVdsA && ./run.sh`
- **Desktop URL:** `http://localhost:8001`
- **Mobile URL:** `http://localhost:8001/mobile`

---

## Tech stack

| Layer | Detail |
|-------|--------|
| Backend | FastAPI (Python), `backend/main.py` |
| Database | SQLite, `data/ceol.db`, auto-migrates on startup |
| Frontend | Vanilla JS (`frontend/static/app.js`), CSS (`style.css`), HTML (`index.html`) |
| Mobile | Separate `mobile.html` + `mobile.js` + `mobile.css` |
| ABC rendering | abcjs (local, `frontend/static/abcjs-basic-min.js`) |
| Uploads | PDFs, images, audio in `data/uploads/` |

**Critical conventions:**
- DB: always `with _db() as db:` — never `Depends(get_db)`
- New modals: use `modalOverlay` / `modalContent` shared pattern
- Safari file downloads: use `application/octet-stream` MIME type
- Dynamic button listeners: attach inside the render function, not at page load
- Version bumps: every JS/CSS change needs a `?v=N` bump in both `index.html` and `mobile.html`
- Backend changes require server restart — `pkill -f "uvicorn"` then `./run.sh`
- `list_tunes` in `main.py` has **inline type-filter logic** separate from `_apply_type_filter`. Any type-filter changes must be made in **both places**.

---

## Asset versions (end of 21 April 2026 session)

| File | Version |
|------|---------|
| app.js | 296 |
| style.css | 122 |
| mobile.js | 37 |
| mobile.css | 32 |

HTML file locations: `frontend/index.html` and `frontend/mobile.html` — **NOT** in `frontend/templates/`

---

## What was completed today

### Housekeeping
- **Gitignore** — added `data/uploads/`, `data/*.db-shm`, `data/*.db-wal`, `.DS_Store`; untracked 1189 files from git index (local files untouched)

### Patch 5 — Mobile fixes
- Removed redundant 🗑 delete button from library tune cards (it already lives in ⋯ More menu)
- Fixed `closeCollectionExportModal` — was calling a non-existent element ID; now uses shared `modalOverlay`
- Added `touch-action: manipulation` to sheet music SVGs for iOS bar selection
- Synced version numbers — `mobile.html` was 4–10 versions behind on key files

### Patch 6 — Mastery stars on mobile tune cards
- On mobile, the 5 interactive amber star buttons on each card are hidden
- Replaced with compact `★★★ Almost there` label in small italic below the type badge
- Unrated tunes show nothing — clean card
- Star rating from inside the tune modal still works as before

### Patch 7 — Collection detail inline set view
- Clicking a set name inside a collection detail view now opens the **full set modal inline**
- Previously it navigated away to the Sets tab — confusing and disorienting on mobile

### Patch 8 — PWA manifest for iOS home screen
- Created `frontend/static/manifest.json` with correct icons, theme colour, `start_url: /mobile`
- Added `<link rel="manifest">`, `apple-mobile-web-app-capable`, and status bar meta tags to `mobile.html`
- Ceòl can now be installed to iPhone home screen via Share → Add to Home Screen
- Opens full-screen with no Safari chrome

### Patches 9 series — Mobile touch reliability
- Added `touchend→click` forwarder on modal overlay (`_modalFastTap`) — all modal buttons respond instantly
- Added `_fastTap` touchend handler on tune list — tunes open immediately on finger lift
- Added `touch-action: manipulation` on `.tune-card` and fullscreen overlay buttons
- **Fullscreen More button** — partially fixed; toggle logic works in automated tests but unreliable in real use. Root cause: double-firing between touchend and click handlers in iOS PWA standalone mode. Deferred to dedicated debugging session.
- Removed service worker caching (replaced with unregister script) to prevent stale JS on phone

### Patch 10 — Set management improvements
- Set tune list: tune titles now styled as accent-coloured hyperlinks
- Set tune list: mastery label shown next to stars (e.g. `★★★ Almost there`)
- Set tune list: remove button changed from tiny 🗑 icon to visible `✕ Remove` text button
- Full set modal: `✕` remove button added to each track item
- Full set modal: `+ Add tune to set…` search panel added below track list (searches library, click to add, modal refreshes)

### Patch 11 — Chromatic Tuner
- New floating tuner panel accessible from:
  - **Mobile:** ♩ button in the header
  - **Desktop:** More menu → ♩ Tuner
- Web Audio API: `getUserMedia` → `AnalyserNode` → autocorrelation pitch detection
- Displays: note name (large), octave, cents deviation (+/–), frequency in Hz
- Visual needle meter showing flat/sharp position
- Goes **green** when within ±5 cents of true pitch
- Tap Start → allow microphone → play a note
- No backend changes

### Patch 12 + 12b — Transpose persistence
- New `transpose INTEGER DEFAULT 0` column added to `tunes` table in DB
- `TuneUpdate` Pydantic model updated to accept `transpose` field
- JS: `_transposeSteps` initialised from `tune.transpose` when modal opens
- JS: ↑ ↓ reset buttons now save transpose to DB on every click via `apiFetch PATCH`
- Each tune remembers its own transpose independently
- DB column added directly to `data/ceol.db` via sqlite3 command (migration function insertion failed but column is live)
- **Note:** The `_migrate()` function in `main.py` was NOT updated — if the DB is ever recreated from scratch, transpose column will be missing. Should be fixed in a future session.

---

## Outstanding — known bugs

| Bug | Status |
|-----|--------|
| Fullscreen More button — second tap doesn't restore controls | ⚠️ Deferred — logic correct in tests, broken in iOS PWA standalone mode |
| ABC playback — progress bar starts but no sound (intermittent) | Not investigated |
| Loop selection — occasionally jumps to tune start | Not investigated |

---

## Outstanding — backlog (prioritised)

### Mobile UX
- [ ] Bar loop touch events — test `touch-action: manipulation` fix for reliable bar selection on mobile
- [ ] Metronome BPM — adjust during playback without stopping
- [ ] Mastery stars — sets view on mobile

### Sets & Collections
- [ ] Set tune list — already improved this session; monitor for further issues

### Playback
- [ ] Speed/loop controls for MP3/video — needs refinement, colour coding to clarify state
- [ ] Metronome during all playback types (MP3, video, ABC)
- [ ] Remove attached audio/video from a tune
- [ ] Video embedded in page (not just external link)

### New features
- [ ] **Transposing** — basic persist done; next: expose transpose value in tune header, option to copy-transpose ABC permanently
- [ ] **Chromatic tuner** — done ✅; future: A4 reference pitch adjustment (default 440Hz)
- [ ] **Practice prioritisation** — weakest-link model using set ratings (deferred)

### Infrastructure — NEXT PRIORITY
- [ ] **Raspberry Pi + Tailscale self-hosting** — Pi already available; see setup plan below
- [ ] Standalone macOS app — Tauri + PyInstaller
- [ ] App Store version (iOS)
- [ ] Mac App Store version (macOS)
- [ ] Multi-user / hosted version (long term, deferred)

---

## Raspberry Pi setup plan (next session)

### What you need (dig out)
- Raspberry Pi board (3B+, 4, or 5)
- MicroSD card (16GB minimum, 32GB+ preferred — library + uploads need space)
- Power supply (USB-C for Pi 4/5, micro-USB for Pi 3)
- Ethernet cable recommended for initial setup (Wi-Fi can be configured headlessly)
- **Download before session:** Raspberry Pi Imager from `raspberrypi.com/software`

### What we'll do
1. **Flash Pi OS Lite** (headless, 64-bit) using Raspberry Pi Imager — enable SSH + set Wi-Fi credentials during flash
2. **Find Pi's IP** on the network (`ping raspberrypi.local` or check router)
3. **SSH in** from Mac: `ssh pi@raspberrypi.local`
4. **Install Python 3.11+, git, pip** on the Pi
5. **Clone the Ceòl repo** onto the Pi
6. **Copy `data/ceol.db`** from Mac to Pi (one-time transfer of existing library)
7. **Create systemd service** so Ceòl auto-starts on boot
8. **Install Tailscale** — creates a private VPN; Pi gets a stable hostname like `ceol-pi`
9. **Test from phone** on a different network: `http://ceol-pi:8001/mobile`

### Ongoing workflow after setup
- Mac server no longer needed for phone access
- Pi runs 24/7 on home network
- Electricity cost ~£3–5/year
- To update Ceòl: `ssh pi@ceol-pi` → `cd ~/Ceol/v3 && git pull && sudo systemctl restart ceol`
- Data backup: periodic `scp pi@ceol-pi:~/Ceol/v3/data/ceol.db ~/backups/`

---

## Key bugs/gotchas from this and previous sessions

| Bug | Root cause | Status |
|-----|-----------|--------|
| "Other" filter showing all tunes | `list_tunes` has separate inline type logic; empty-string parent types pass all NOT LIKE conditions | ✅ Fixed |
| Fullscreen note-lighting wrong | Hidden synth render vs visible render use different ABC; note counts differ | ⚠️ Improved |
| Type filter excluding versioned tunes | Parent tunes have empty type/key; real data on children | ✅ Fixed |
| Service worker caching stale JS | Old SW cached files; new loads served cached versions | ✅ Fixed (SW removed) |
| Transpose column not in _migrate() | Insertion point regex failed; column added directly to DB | ⚠️ Partial — _migrate() not updated |
| Fullscreen More button double-fires | touchend + click both fire _ceolMoreToggle in iOS PWA | ⚠️ Deferred |
