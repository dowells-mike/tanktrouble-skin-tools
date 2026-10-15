# Skin Creator Starter Kit (source)

The source of the optional **TankTrouble Skin Creator Starter Kit** download. It is built into its own ZIP and published as a
separate GitHub release; the main extension ZIP does not contain it and is not changed by it.

| Path | What it is |
|---|---|
| `build.mjs` | builds `dist-starter-kit/` (folder, ZIP, inventory) from an explicit list of files; fails on anything else |
| `example-art.mjs`, `make-example-skin.mjs` | the "Classic Tank" artwork (the plain white TankTrouble tank, SVG drawn from scratch to the game's measured dimensions) and the script that draws it into `example-skin/` with a local Chrome |
| `example-skin/` | the committed result: 31 PNGs (2x) + `skin.json` |
| `make-example-atlas.mjs`, `pack-atlas.mjs`, `example-atlas/` | pack the example skin into a trimmed texture atlas (the converter's demo and test input) |
| `guide.mjs`, `src/guide.html`, `guide-images/`, `make-guide-shots.mjs` | the illustrated guide; its tables are generated from the extension's own code, its screenshots from the real panel |
| `panel-messages.mjs` | the exact wording the panel shows for the usual mistakes (so the guide can quote it) |
| `src/generators/` | blank/guide/shape-guide PNG templates and the layered PSD (geometry from `extension/src/frames.js`, silhouettes and tracing layer from the example skin) |
| `src/artist-tools/` | the two optional helpers shipped in the kit; `lib/` also gets copies of four `extension/src` files at build time (git-ignored) |
| `src/CREDITS.md` | credits and the acknowledgement of Textured Tanks by Kamarov |

Tests: `npm run test:starter-kit` (no browser) and `npm run check:starter-kit` (real extension in Chrome). The kit contains no game artwork
and no code from anyone else.
