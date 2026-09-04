# Make It a Story brand assets

This directory is the canonical source for the Make It a Story identity selected
in issue #514. The approved `Turning Point` mark is a smooth film ribbon shaped
like an `S`: its ends are sharply cut, the central cut is perpendicular to the
local ribbon direction, and the upper length is shifted **down 36/512 units along
the cut line**. Do not rebuild the shape from screenshots or derived exports.

## Master artwork and lockups

- `master/turning-point-mark.svg` is the editable display master.
- `master/turning-point-mark-compact.svg` is the optical 16–31 px master. Its
  cut is deliberately wider and pixel-fitted; it is not a different logo.
- `master/neutral-icon-safe-area.svg` is the transparent 1024-unit app-icon
  master. The visible mark stays inside the central 80% safe area.
- `exports/svg/make-it-a-story-lockup.svg`,
  `make-clip-a-story-lockup.svg`, and `make-travel-a-story-lockup.svg` are the
  large horizontal product-family lockups. The mark replaces the opening `S` in
  `Story`; `tory` continues on the same baseline. In the primary lockups,
  `It`, `Clip`, and `Travel` use brand olive while the surrounding phrase stays
  charcoal.
- `exports/svg/*-black.svg` and `*-light.svg` are one-color production variants.
  `make-it-a-story-mark-olive.svg` is the restrained brand-color alternative.

The lockup letters are outlined from `fonts/SpaceGrotesk-Bold.ttf`, distributed
under the SIL Open Font License in `fonts/OFL.txt`. Its geometric construction
matches the film-ribbon mark; the integrated `S` is optically reduced so it does
not outweigh the phrase. Outlines keep SVG exports self-contained and prevent
fallback-font layout changes. Regenerate them on macOS with:

```sh
swift -module-cache-path /tmp/storyteller-swift-module-cache scripts/generate-brand-lockups.swift
node scripts/generate-brand-raster.mjs
```

## Web and raster exports

- `exports/web/favicon.svg`
- `exports/web/favicon.ico` containing 16, 32, and 48 px PNG frames
- `exports/web/favicon-16x16.png` and `favicon-32x32.png`
- `exports/web/apple-touch-icon.png` at 180 × 180 px
- `exports/png/make-it-a-story-icon-{192,512,1024}.png`, transparent and made
  from the neutral safe-area master
- `exports/png/make-it-a-story-mark-1024.png`
- `exports/png/*-lockup-1600.png`
- `exports/print/make-it-a-story-brand-guide.pdf`, a four-page vector CMYK
  print guide with the approved mark, family lockups and reproduction rules

`scripts/vite-brand-assets.mjs` is the only build bridge. It emits the canonical
files into Site, Story Studio, and Clip Studio builds, and serves the same files
during Vite development. Do not create app-local copies.

## Color palette

CMYK values are process approximations; approve a physical proof for critical
print work.

| Role | HEX | RGB | CMYK approximation |
| --- | --- | --- | --- |
| Primary charcoal | `#22221D` | 34, 34, 29 | 0, 0, 15, 87 |
| Warm cream | `#F3F1EB` | 243, 241, 235 | 0, 1, 3, 5 |
| Olive alternative | `#697C37` | 105, 124, 55 | 15, 0, 56, 51 |
| Interface accent | `#D9FB76` | 217, 251, 118 | 14, 0, 53, 2 |
| Black | `#000000` | 0, 0, 0 | 0, 0, 0, 100 |
| White | `#FFFFFF` | 255, 255, 255 | 0, 0, 0, 0 |

The lime accent belongs to interface emphasis, not to either half of the mark.
The mark must remain readable without color.

## Size, spacing, and safe area

- Use the display master at **32 px and larger**. Use the compact master or
  generated favicon assets below 32 px. Never downscale the display master to
  16 px.
- Use a large lockup at **32 px minimum height**. At smaller header sizes, pair
  the standalone mark with live HTML text as the shared `BrandMark` component
  does.
- Define `x` as the 68/512-unit thickness of either straight ribbon terminal.
  Keep at least `x` clear on every side of the standalone mark and at least
  `0.75x` around a horizontal lockup.
- Neutral app-icon exports keep the visible mark inside an 80% central square.
  Do not enlarge it past that safe area for platform-specific masks.

Do not close the cut, change the 36-unit displacement, rotate either ribbon
length, add sprocket holes at small sizes, stretch the mark, add outlines or
shadows, or recolor the two halves independently.

## Similarity and production note

A preliminary public-web review on 2026-09-04 found an active Dutch marketing
business using the exact phrase “Make it a story” at `makeitastory.nl`. Its
published horizontal identity is word-led and visually distinct from this
film-ribbon `S`, but the name overlap is material. This is not trademark
clearance: production launch in overlapping markets should remain gated on a
jurisdiction- and class-specific professional search.

No analytics event is added for this static identity and favicon change. It has
no independently confirmed user outcome; existing page-view instrumentation
continues to measure the surfaces on which the identity appears.
