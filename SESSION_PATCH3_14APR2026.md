# Session – Patch 3 (14 April 2026)

## Changes applied
- **"Other" type filter** — backend now excludes `NULL` and `''` type from the
  Other bucket. Only tunes with a real type that doesn't match any named group
  appear under Other.
- **Fullscreen bars-per-row** — clamped to max 4 (was 5–6 on wider screens).
  `measuresPerLine = w > 800 ? 4 : w > 500 ? 3 : 2`
- **Fullscreen note-lighting** — `selectTypes: false` added to per-tune renders
  and the hidden synth render, preventing chord-symbol elements from inflating
  note counts. Note map rebuilt using tune-segmented approach: slices the
  hidden note array by the per-tune visible note count, so inline key/meter
  changes in the combined ABC don't shift alignment.
- **PDF export — Sets** — "⎙ Print / PDF" added to set export dropdown.
  Reuses print-window logic (same as existing Print button but accessible from
  the Export menu).
- **PDF export — Tunes** — "⎙ Print / PDF" button added to sheet-music-options
  panel (next to ✂ Strip chords). Prints the rendered SVG.
- **PDF export — Collections** — "⎙ Print / PDF" button added to collection
  export modal. Opens the TheCraic ABC export in a new window for printing
  (sheet music rendering at collection level would require rendering 100s of
  tunes and is deferred).
- **Landscape "More" button** — injected into fullscreen header on open.
  In landscape (CSS media query), bottom playback controls are hidden by
  default; tapping ⋯ More toggles them. Also hides metronome/tempo/bar-info
  rows in non-fullscreen modal in landscape, giving sheet music more height.

## Still outstanding
- Fullscreen note map: if `expandAbcRepeats` on the combined ABC produces a
  different note count per tune than on individual ABCs, the segmented map
  will still drift across tunes. Full fix requires either: (a) counting hidden
  render notes per tune using `tuneRanges`, or (b) rebuilding hidden render
  from individually-expanded ABCs concatenated with X:N headers (needs synth
  testing with multi-X ABC).
- Collection PDF: a proper sheet-music PDF for collections requires rendering
  each tune's ABC into SVG and collecting them — significant feature.
- Fullscreen: "two versions competing" (hidden + visible both active) — needs
  investigation into whether two synth instances are ever created.
- Export tune: currently a dropdown would be cleaner than separate buttons;
  can unify Export / Print into one dropdown to match sets.

## Pull and run
```
cd /Users/callummaclellan/Ceol/v3 && git pull --rebase origin claude/develop-ceol-v2-GVdsA && ./run.sh
```
