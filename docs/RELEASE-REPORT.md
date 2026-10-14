# Release report: TankTrouble Skin Tools 1.0.0

Date: 2026-10-14. All numbers come from `npm run build` (see `dist/INVENTORY.md` for every file).

## Size

| | Files | Uncompressed | In the ZIP |
|---|---:|---:|---:|
| **Player download** `TankTrouble-Skin-Tools-1.0.0.zip` | 142 | 860.8 KB | **784.3 KB** |
| **Extension only** `TankTrouble-Skin-Tools-1.0.0-extension.zip` (what a browser store takes) | 7 | 96.8 KB | **45.6 KB** |

| Part | Files | Uncompressed | In the ZIP |
|---|---:|---:|---:|
| `extension/runtime/skin-tools-start.js` | 1 | 18.3 KB | 7.0 KB |
| `extension/runtime/skin-tools-panel.js` | 1 | 60.2 KB | 20.3 KB |
| `extension/icons` (16, 32, 48, 128 px) | 4 | 16.5 KB | 16.5 KB |
| `extension/manifest.json`, `LICENSE.txt` | 2 | 1.9 KB | 0.9 KB |
| `skin-packs/golden-tank` | 54 | 271.3 KB | 271.2 KB |
| `skin-packs/onyx-tank` | 54 | 266.6 KB | 266.5 KB |
| `skin-packs/3d-shaders` | 22 | 39.1 KB | 39.0 KB |
| `Install-Guide.html` (11 screenshots embedded) | 1 | 182.3 KB | 132.6 KB |
| `PRIVACY.txt`, `THIRD-PARTY-NOTICES.txt`, `LICENSE.txt` | 3 | 4.7 KB | 2.4 KB |

### What was cut, and how

| Item | Development | Release | How |
|---|---:|---:|---|
| Runtime JavaScript | 11 files, 133.1 KB | 2 files, 78.5 KB | concatenated per content-script group, minified with esbuild (comments, whitespace, local names); the panel's CSS minified as CSS |
| Example skins | 4x art, 8,178 KB | 1x, 577.0 KB (-93%) | see below |
| Everything else in the development folder (tests, research, PSDs, Blender files, renders, screenshots, templates, mockups) | about 62 MB | 0 | not on the allowlist |

**Skins at 1x, with no visible change.** The add-on reduces 2x/4x art to the game's native frame size when a skin is
installed, and only those native frames are ever drawn. The 1x packs are produced by running that same code, then
verified. All 127 frames decode to **identical pixels**, and a rendered game scene is **pixel-identical** (below).
The PNGs are then re-encoded losslessly: the smallest of RGBA, grey+alpha or palette, with several row filters and
zlib level 9. All metadata is dropped, and each file is checked pixel for pixel after encoding.

**Guide screenshots** (documentation only, never skin art or icons) use a 256-colour palette when it is visually lossless,
meaning a PSNR of at least 40 dB, otherwise lossless. Results: 46.4 to 60.2 dB, 281 KB down to 140 KB.

## Reproducibility

`npm run reproducible` builds twice into separate folders and compares every file: **147 files, all identical**. The ZIPs
use a fixed timestamp, sorted entries, fixed attributes and no extra fields. Line endings are pinned to LF
(`.gitattributes`), so other platforms give the same bytes.

| Archive | SHA-256 |
|---|---|
| `TankTrouble-Skin-Tools-1.0.0.zip` | `d3a73201548c0c2606aebb527f407692c894a0c9836a01ec8ae226fedc41ff20` |
| `TankTrouble-Skin-Tools-1.0.0-extension.zip` | `7f07aeda30c384fdca0ac355817ed7148aef16fa0ac0b1226c75c096eea44a70` |

## Verification

| Test | What it covers | Result |
|---|---|---|
| `npm test` (this project) | importer rules, image maths, settings sanitising, manifest order, no network APIs | 13 pass |
| `tests/release.check.mjs` (this project) | unpacks the **ZIP**, installs the extension into a **new Chrome profile** like "Load unpacked", imports all three packs through the panel, assigns, recolours, switches colour mode, reloads (everything persists), removes a skin (stays removed), clears assignments, records every network request, measures memory | all pass; **no network requests**; page JS heap 2.5 MB with skins installed |
| Game-renderer suite, run against the **release build** (development project) | the game's real tank, missile, mine, shrapnel, laser, particle, shield, fragment and crate classes in real Phaser WebGL: skins, per-player assignment, recolour, rounds, joining mid-round, every weapon frame, hitbox untouched, instant reset, coexistence with other extensions in every load order | all pass |
| Panel suite, run against the **release build** (development project) | the panel through its real UI: clicks, keyboard only, drag-and-drop import, folder import, refusals, confirmations, saved settings and an older saved layout, accessibility, 320 px window, frame cost | all pass |
| Release equivalence (development project) | the development build with the original 4x skins vs the release build with 1x skins, same scene | 127/127 frames identical; scene pixel-identical |
| Security audit | both ZIPs entry by entry, and the repository | no findings |

## Runtime performance

Measured in the game's real renderer (headless Chrome, SwiftShader WebGL) with six tanks on screen and the game's own loop
running. The numbers are frame interval and page JavaScript heap after garbage collection.

| | Mean frame interval | 95th percentile | Max | Page JS heap |
|---|---:|---:|---:|---:|
| No skins | 4.16 ms | 4.2 ms | 4.3 ms | 5.77 MB |
| Development build, 3 skins | 4.16 ms | 4.2 ms | 4.4 ms | 6.30 MB |
| **Release build, 3 skins** | **4.16 ms** | **4.2 ms** | **4.4 ms** | **6.23 MB** |

The skins add about 0.5 MB of heap and no measurable frame cost. An open panel that nobody touches changes nothing in the
page (0 DOM mutations in 4 s). It polls once a second for new players while it is open, and does nothing while folded.
