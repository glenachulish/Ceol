# Session – Patch 2 (14 April 2026)

## Asset versions after this patch
| File       | Version |
|------------|---------|
| app.js     | 242     |
| style.css  | 102     |
| mobile.css | 18      |
| mobile.js  | 6       |

## Changes applied
- style.css v101 → v102 cache-bust in both HTML files
- Library: tuneList dblclick → click (single-click opens tune)
- Transitions: "Transition" button → "▶ Play"; removed "Full set music" second button
- Fullscreen exit: touchend handler added for iOS reliability
- Clear ABC: removed from Sheet Music options panel; added to ABC Text tab footer as btn-secondary btn-sm
- mobile.css appended:
  - Dynamic Island / notch: .m-header min-height + padding-top for safe-area-inset-top
  - .abc-fullscreen-header: padding-top for notch
  - #abc-fs-btn: moved to left side
  - #sheet-music-menu-btn: repositioned left (after fs btn moved)
  - #set-full-print-btn: hidden on mobile
  - #add-to-set-btn: hidden on mobile
  - .set-transition-music-btn / .set-trans-music-btn: hidden (CSS backup for missing HTML btn)
  - .tune-card: cursor: pointer (UX cue)
  - @media (orientation: landscape): compact header/nav, safe-area side padding for fullscreen

## Outstanding (new backlog items)
- [ ] Fullscreen: random red notes during playback
      → Root cause: hidden-to-visible note index map offset when repeat expansion
        changes note count between hidden and coloured renders
- [ ] Fullscreen: dots lighting up on wrong notes (same root cause)
- [ ] Fullscreen: two versions competing (hidden render + visible render both active?)
- [ ] Fullscreen: ensure looping / bar selection / note lighting matches non-fullscreen
- [ ] Close window stops music: verify all paths (especially fullscreen overlay)
- [ ] Sheet music overlays: should be dismissible to see sheet music underneath
- [ ] Landscape: "More ⋯" button for controls (current: hidden-behind-CSS only)
- [ ] Fullscreen: 2 bars min, 4 bars max per row
      → Set `wrap: { minSpacing: 1.5, preferredMeasuresPerLine: 3 }` in openAbcFullscreen
- [ ] Export: add PDF option to set export to match desktop (Ceòl JSON + ABC + PDF)
- [ ] Tuner: chromatic tuner via Web Audio API (getUserMedia → AnalyserNode → autocorrelation)
      → Best as a floating panel / dedicated tab
- [ ] Delete version: move into a More menu on mobile
- [ ] Build Set + New Set: ensure always adjacent in the Sets tab header
- [ ] Sets: transition play currently opens sheet music view — confirm autoPlay=true wired correctly
- [ ] Collection detail: click Set → inline view (was in previous backlog)
- [ ] Metronome tweak during playback (was in previous backlog)
- [ ] Mobile tune cards: mastery stars (was in previous backlog)

## Pull and run
```
cd /Users/callummaclellan/Ceol/v3 && git pull --rebase origin claude/develop-ceol-v2-GVdsA && ./run.sh
```
