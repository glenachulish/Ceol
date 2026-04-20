# Ceòl — Mobile Design Specification v2

> Mobile-first. Desktop inherits all mobile decisions.
> Last updated: April 2026 from annotated sketches + session decisions.

---

## Global rules

### × Exit / Close button
- Present on **every page except the Library main page**.
- Always top-left of the page or modal.
- Behaviour: goes to the **previous page**, or to Library main if there is no logical previous page.
- Transitions subpage (within Set detail) → × returns to Set detail, NOT Sets main.
- **No duplicate close buttons** — if a page already has × at the top, do not also render a separate modal-level ×. One button only.

### Bottom navigation
Consistent across all pages:

| Page | Nav items |
|------|-----------|
| Library main | ♪ Library · ☰ Sets · 📁 Collections · + Import · ··· More (hamburger) |
| Tune detail | ♪ Library · ☰ Sets · 📁 Collections · + Import |
| Sets main | ♪ Library · ☰ Sets · 📁 Collections · + Import |
| Set detail | ♪ Library · ☰ Sets · 📁 Collections · + Import |
| Collections main | ♪ Library · ☰ Sets · 📁 Collections · + Import |
| Collection detail | ♪ Library · ☰ Sets · 📁 Collections · + Import |

- **+ Import** always opens the Import tunes dialogue.
- Tapping Library/Sets/Collections always goes to the **main page** for that section.
- The hamburger **More** in the Library nav contains database-level actions (backup, delete library, etc.). It does NOT appear in the nav on other pages.
- Remove the standalone More button from the Collections main page nav — it duplicates the hamburger.

### Page title style
Each main page uses its bottom-nav icon as a prefix to the title:
- ♪ **Library**
- ☰ **Sets**
- 📁 **Collections**

### More button (content area — playback pages)
- Any page or view that has **audio playback** must have a **⋯ More** button in the content area (above the nav).
- More reveals playback options: melody instrument, chord instrument, speed/warp, metronome.
- More must actually work — toggling it must visibly show/hide the options panel.
- The More button label changes to **✕ Less** when the panel is open.

### Full screen button
- Appears **top-right of the page** (not floating over sheet music).
- Present on: Tune detail (Sheet Music tab), Set detail (sheet music section).
- In fullscreen view:
  - Play controls appear **both above and below** the sheet music.
  - **⋯ More** button is always visible in fullscreen (not hidden in landscape).
  - × Exit closes fullscreen.

### Export
- Export is accessed via the **⋯ More** button on any page that has one.
- Standalone Export buttons are removed from page headers/titles.
- Print/PDF must work — currently does nothing (bug to fix).

### Select / bulk operations
- All three main pages (Library, Sets, Collections) have **Select** and **Clear** buttons.
- Select mode allows multi-selection of tunes, sets, or collections.
- Bulk delete is available from this mode.

---

## Library main page

- Page title: ♪ **Library**
- Search bar full-width; tapping it reveals filter row.
- Remove any standalone ⚙ gear button.
- Tune cards: name (bold), type badge, star rating. Single tap opens tune.
- **Select** button top-right enables bulk-select mode; **Clear** deselects all.
- Bulk delete available in select mode.
- Bottom nav: ♪ Library · ☰ Sets · 📁 Collections · + Import · ··· More

---

## Tune detail page

### Header
- × Exit top-left (returns to Library or previous page).
- Page title: `Tune · [tune name]`
- **MASTERY** ★★★★★  *Unrated* label below title.
- Membership below mastery — **on separate lines, clearly labelled**:
  - `☰ Sets:` [Set Name 1](hyperlink), [Set Name 2](hyperlink)  ← different colour/weight from label
  - `📁 Collections:` [Collection Name](hyperlink), …
  - "Sets:" and "Collections:" labels in a muted/accent colour; names in normal text but tappable.

### Sheet Music tab
- **⛶ Full screen** — top-right of the page (above the sheet music box, right-aligned row).
- ⚙ options icon — top-left of the sheet music box (for display options like zoom/measures).
- **⋯ More** (bottom-right content button) opens the options panel containing:
  - Melody instrument selector
  - Chord instrument selector
  - Tempo / BPM controls
  - Metronome
  - ─────
  - ✂ Strip chords
  - 📄 Export Ceòl JSON
  - 🎵 Export TheCraic ABC
  - ⎙ Print / PDF  ← must actually work
  - ─────
  - 🗑 Delete from Library

### Footer
- + Create new set | 🎵 Build a Set from here
- + Add to collection…

### Bottom nav
♪ Library · ☰ Sets · 📁 Collections · + Import

---

## Sets main page

### Header / controls row
- Page title: ☰ **Sets**
- On the same row or directly below: [+ New Set] [🎵 Build a Set] [Search sets…]
  - "+ New Set" and "Build a Set" side by side, matching the layout on the Set detail footer.
- Search sets box beside these buttons so "Sets" is clearly the page title.

### Set cards
- Name (bold, tappable → opens set detail) · N tunes · ★★★ · › chevron.
- **Select** button enables bulk-select; **Clear** deselects. Bulk delete available.
- … menu per card: Rename · Add to Collection · Delete.

### Bottom nav
♪ Library · ☰ Sets · 📁 Collections · + Import

---

## Set detail page

### Header
- × Exit top-left (returns to Sets main or Library — whichever is more logical).
- Set name as page title.
- **No duplicate close button** — one × only.
- **⛶ Full screen** top-right of the page (above sheet music section).

### Tune management (top of page)
- Numbered tune list with drag handles for reorder.
- Ability to **add tunes** and **remove tunes** from the set directly on this page.
- Controls should be at or near the top of the page, not buried.

### Transitions subpage
- × on the Transitions subpage returns to Set detail, NOT to Sets main.

### Sheet music & playback
- Play controls visible.
- **⋯ More** (content button) toggles playback options panel (speed, chords, instrument, metronome).
- More must work — currently clicking has no effect (bug to fix).

### Export
- Accessed via ⋯ More (no standalone Export button in header).
- Print / PDF must work.

### Bottom nav
♪ Library · ☰ Sets · 📁 Collections · + Import

---

## Collections main page

### Header / controls
- Page title: 📁 **Collections**
- Search collections… full-width (moved up, replacing discography button position).
- **Remove** "Build from Discography" button.
- **Remove** the + (New Collection) button from top of page — creation accessible elsewhere.
- **Remove** standalone More/hamburger from the nav on this page.
- **Remove** View button from collection cards — collection name is the hyperlink.

### Recently Imported
- No longer has special status — listed as a regular collection alongside others.
- Tapping it opens it like any other collection.
- Inside, filter options are: Today · This week · This month (remove "last N days" option).

### Collection cards
- Name (bold, underlined, tappable → opens collection detail) · N tunes · N sets.
- … menu: Rename · Export · Delete.
- **Select** button enables bulk-select; **Clear** deselects. Bulk delete available.

### Bottom nav
♪ Library · ☰ Sets · 📁 Collections · + Import

---

## Collection detail page

### Header
- ← All Collections back button (returns to Collections main).
- Collection name as page title.
- Search within collection… full-width.
- Type filter chips: All | [types in collection].

### Tune list
- Name | type badge | key.
- Tap tune → opens Tune detail.

### Recently Imported widget
- **Not shown** in collection detail — only on Collections main.

### More / Export
- ⋯ More (content button): Export · Delete collection.

### Bottom nav
♪ Library · ☰ Sets · 📁 Collections · + Import

---

## Known bugs (to fix in upcoming patches)

| Bug | Page | Priority |
|-----|------|----------|
| More button clicks but nothing happens | Set detail | High |
| Print / PDF does nothing | Tune detail, Set detail | High |
| Full screen button not top-right of page | Set detail | High |
| Fullscreen: More not visible, controls layout wrong | Fullscreen overlay | High |
| Tune detail: Collections membership not shown | Tune detail | Medium |
| Sets/Collections membership not hyperlinked | Tune detail | Medium |
| Transition × returns to Sets main (should return to Set detail) | Set detail | Medium |
| Recently Imported has special status | Collections main | Low |

---

## Implementation backlog (priority order)

1. Fix Set detail More button wiring
2. Fix Print/PDF
3. Tune detail: Sets + Collections membership (separate lines, hyperlinked, styled)
4. Full screen button position on Set detail
5. Fullscreen overlay: More button + controls layout
6. Collections main redesign (remove discography, move search, remove View button, remove +)
7. Sets main redesign (title row with New Set / Build / Search)
8. Recently Imported as regular collection
9. Select/bulk delete on all three main pages
10. Tune management controls on Set detail (add/remove/reorder at top)
11. + Import → import dialogue
12. Page title icons
