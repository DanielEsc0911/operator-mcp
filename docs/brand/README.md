# OPerator brand

**OPerator is a switchboard operator.** It patches your agent through to
OpenProject. The voice ("patching you through"), the motion (cables, lamps) and
the mascot all come from that one idea.

*Your agent, patched through to OpenProject.*
*It reads your work, updates your tasks, and follows your team's rules.*

## Op, the mascot

A pixel operator: round face, two dot eyes, a small smile, teal blush, and an
amber headset whose boom ends in a teal mic lamp. Drawn once as a 16×16
role-letter grid in [`seed/op.grid`](seed/op.grid):

| Letter | Role | Colour |
|---|---|---|
| `b` | base: face outline and features | ink on light, paper on dark |
| `a` | accent: the headset | signal |
| `t` | secondary: blush and mic lamp | patch |
| space | empty | the background shows through |

The face is outline, not fill, so the same grid reads as a face on both light
and dark grounds. The favicon draws the dark variant on a rounded ink tile so it
holds up in any browser tab.

## Palette

Contrast is WCAG 2 relative luminance, measured against the ground in the same
column. Body text needs 4.5:1; large text and UI glyphs need 3:1.

| Token | Light (on `#FBF6EC`) | Dark (on `#16131F`) | Use |
|---|---|---|---|
| `ink` / `paper` | `#16131F` — 17.00 | `#FBF6EC` — 17.00 | text, base cells |
| `signal` text | `#A15C00` — 4.82 | `#FFB020` — 10.01 | links, accent text |
| `signal` fill | `#FFB020` — 1.70 (decorative only) | `#FFB020` — 10.01 | lamps, headset, primary button fill (with ink label) |
| `patch` | `#0C7D73` — 4.65 | `#2EC4B6` — 8.45 | cables, success |
| `alarm` | `#C8372D` — 4.83 | `#FF6B5E` — 6.55 | errors only |
| `muted` | `#6E6A7C` — 4.85 | `#9A96A8` — 6.37 | secondary text |

Signal fill on paper is below 3:1, so it never carries meaning on its own on a
light ground: the headset sits against the ink outline, and a signal button
carries an ink label (ink on `#FFB020` is 10.01).

### Terminal (xterm-256)

Terminals may be light or dark, so each slot is measured on white and black.

| Token | Slot | On white | On black | Note |
|---|---|---|---|---|
| `signal` | **172** `#d78700` | 2.86 | 7.36 | Bold labels, lamps and the mark only — never body text. 136 (3.34 / 6.29) passed on white but reads olive; 172 is the nearest slot that reads as the brand amber, and bold weight carries it on white. 214 fails on white (1.84) |
| `patch` | **30** `#008787` | 4.36 | 4.82 | 37 fails on white (2.71) |
| `alarm` | **167** `#d75f5f` | 3.69 | 5.69 | the ✗ glyph; the error sentence stays in the default colour |
| `muted` | **243** `#767676` | 4.54 | 4.62 | |
| `base` | default foreground | — | — | always the terminal's own colour |

## Type

- **Display:** Bricolage Grotesque (SIL OFL 1.1). The wordmark is Bold, optical
  size 96, outlined to paths once in [`seed/wordmark.svg`](seed/wordmark.svg).
- **Body:** Instrument Sans (OFL). **Mono / terminal UI:** Departure Mono (OFL)
  for small labels; JetBrains Mono for long code.
- SVG banners set their tagline in Instrument Sans with a system-font fallback,
  because GitHub renders README SVGs without web fonts.

## Voice

Warm, plain, a little playful in progress messages — "Patching you through…",
"Line's open." Errors are never cute: they say what broke and the next command
to run.

## Not affiliated

No OpenProject logo or colours, anywhere. The README and the site footer carry:

> OPerator is an independent project, not affiliated with OpenProject GmbH.

Agent clients are named in plain text chips, never with their logos.

## Regenerating

**Never edit anything in `assets/` by hand.** Edit a seed and re-run.

```bash
npm run brand                 # seed → every SVG, terminal/op.cells, src/brandCells.ts, the install.sh mark (deterministic)
scripts/brand-raster.sh       # SVG → card.png, hero PNGs, favicon PNGs and .ico (Inkscape + ImageMagick)
```

`npm run brand` regenerates byte-identically; CI and tests never need Inkscape.

The hero and card set their taglines in Instrument Sans, so Inkscape must find it or
the PNGs bake in a fallback face. Without installing it system-wide:

```bash
dir=$(mktemp -d)
curl -fsSL -o "$dir/InstrumentSans.ttf" "https://github.com/google/fonts/raw/main/ofl/instrumentsans/InstrumentSans%5Bwdth%2Cwght%5D.ttf"
printf '<fontconfig><include>/etc/fonts/fonts.conf</include><dir>%s</dir></fontconfig>' "$dir" >"$dir/fonts.conf"
FONTCONFIG_FILE="$dir/fonts.conf" scripts/brand-raster.sh
```

| Asset | Path |
|---|---|
| Themable mark (`currentColor`, `--op-signal`, `--op-patch`) | `assets/mark/op.svg` |
| Baked marks | `assets/mark/op-light.svg`, `op-dark.svg` |
| Lockup | `assets/lockup/horizontal-light.svg`, `horizontal-dark.svg` |
| README hero | `assets/hero/readme-hero-light.svg`, `readme-hero-dark.svg` |
| Social card 1200×630 | `assets/social/card.svg`, `card.png` |
| Favicon | `assets/favicon/favicon.svg`, `{16,32,48,180,512}.png`, `favicon.ico` |
| Terminal cells | `assets/terminal/op.cells` |
| Cells for the wizard (generated TypeScript) | `src/brandCells.ts` |
| Cells for the curl installer (the `<<'CELLS'` heredoc) | `install/install.sh` |

## Terminal cells

`op.cells` is 16 lines of 16 role letters. A printer reads two lines at a time
and prints one row of half-blocks: `▀` with the top role as foreground and the
bottom role as background, `▄` when only the bottom is inked, `█` when both
match. Eight rows result. `base` cells use the default foreground, so the face
follows the terminal theme.
