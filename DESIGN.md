# Ceòl — Mobile Design Specification

> Mobile-first. Desktop inherits all mobile decisions.  
> Last updated: April 2026 from annotated screen sketches + clarifications.

---

## Global rules

### Bottom navigation
Each page has its own bottom nav. The Library "More" (hamburger/database menu) does
NOT appear on other pages.

| Page | Nav items |
|------|-----------|
| Library | Library · Sets · Collections · Import · **More** (hamburger — database/backup/settings) |
| Tune detail | Library · Sets · Collections · Import |
| Sets main | Library · Sets · Collections · Import · More* |
| Set detail | Library · Sets · Collections · Import · **Export** |
| Collections main | Library · Sets · Collections · Import · More* |
| Collection detail | Library · Sets · Collections · Import · More* |

*More on these pages = page-specific overflow (e.g. build/import actions), TBD per page.
For now these pages do not show the Library hamburger More.

### More button (content area)
A **⋯ More** button sits at the bottom-right of the *content area* (above the nav bar)
on pages that have per-item actions. It is distinct from the nav-bar More.

- **Tune detail More**: Strip chords · Export Ceòl JSON · Export TheCraic ABC · Print/PDF · ─ · Delete
- **Set detail**: No More button — Export takes that nav slot instead.
- **Collection detail**: Export + Delete via … menu on the collection header.

### Back / close button
Standard × button, top-left of detail/overlay views.
- Set detail × → back to wherever the user came from (Library or Sets list)
- Collection detail ← All Collections → Collections main page

### Sheet music area buttons
- **⚙** top-left: opens sheet music display options (instrument, tempo, measures per line)
- **⛶ Full screen** top-right: opens fullscreen overlay

---

## Library page

- Remove the standalone ⚙ gear button that was beside the search bar.
- Tapping the search bar reveals the filter row below it.
- Tune cards: name (bold), type badge, star rating.
- Single tap opens the tune.
- Bottom nav: Library · Sets · Collections · Import · **More** (hamburger)

---

## Tune detail page

### Title / header area
- Page title bar: `Tune · [tune name]`
- Below title: **MASTERY** ★★★★★  *Unrated* (or rating label)
- Below mastery: `Collections: [name, name]` if any

### Sheet Music tab
- ⚙ top-left of sheet music area (display options panel)
- ⛶ Full screen top-right of sheet music area
- Playback controls below sheet music
- Metronome button

### Footer
- + Create new set | 🎵 Build a Set from here
- + Add to collection…
- **⋯ More** (bottom-right of page, above nav): Strip chords · Exports · Print/PDF · Delete

### Bottom nav
Library · Sets · Collections · Import  *(no More)*

---

## Sets main page

- Search sets… full-width box
- + New Set button top-right; Build a Set below
- Set cards: **name** (tappable) · N tunes · ★★★ · › chevron
- … menu per card: Rename · Add to Collection · Delete

### Bottom nav
Library · Sets · Collections · Import · More *(page-level overflow)*

---

## Set detail page

- **×** close button top-left (returns to previous screen)
- Set name as page title
- Full screen ⛶ button top-right of sheet music section
- Export → bottom-right nav slot (replaces More)
- No ⋯ More content button on this page

### Bottom nav
Library · Sets · Collections · Import · **Export**

---

## Collections main page

- Search collections… full-width
- + New Collection button
- Remove "Build from Discography" button
- Recently Imported widget shown here only (not in collection detail)
- Collection name = hyperlink/tappable (no separate View button)
- … menu per card: Rename · Export · Delete

### Bottom nav
Library · Sets · Collections · Import · More *(page-level overflow)*

---

## Collection detail page

- ← All Collections back button
- Collection name as page title
- Search within collection…
- Type filter chips: All | [types present in collection]
- Tune list: name | type badge | key
- Recently Imported widget **hidden** here
- Export + Delete via ⋯ More (bottom-right content button)

### Bottom nav
Library · Sets · Collections · Import · More

---

## Implementation priority

1. ✅ DESIGN.md in repo
2. Patch 8 — Set detail: × back, Export in nav, Full screen top-right
3. Patch 9 — Tune detail: title format, mastery stars, gear/fullscreen positions, More menu
4. Patch 10 — Collections: remove View button (name=link), hide Recently Imported in detail, remove Build from Discography
5. Patch 11 — Library: remove gear beside search, tap-to-filter
6. Patch 12 — Sets: card redesign, search box
