# Building a release

```
npm ci
npm test                      # unit tests of the pure modules
npm run build                 # dist/TankTrouble-Skin-Tools-<version>/ and dist/TankTrouble-Skin-Tools-<version>.zip
npm run audit                 # the ZIP entry by entry, and every tracked file
node tests/release.check.mjs  # unpacks the ZIP, installs it into a fresh Chrome profile and drives it
npm run reproducible          # two builds, every file compared by SHA-256
```

Needs Node.js 20+ (the last two also need a local Chrome; set `CHROME_PATH` if it is not in a standard place).
Dependencies are dev-only and pinned: `esbuild` (minifier) and `playwright-core` (drives your local Chrome).

## What a release contains

`build/release.config.json` is the allowlist: every file that may be in the release, and why. The build fails if a listed source
is missing or if anything appears in the output that no rule produced. `dist/INVENTORY.md` lists every file with its size and SHA-256.

```
TankTrouble-Skin-Tools-1.0.0/
  START-HERE.html     the illustrated install guide (screenshots embedded)
  extension/          the add-on: manifest.json, runtime/ (2 minified scripts), icons/, LICENSE.txt
  skin-packs/         three example skins (golden-tank, onyx-tank, 3d-shaders)
  about/              PRIVACY.txt, THIRD-PARTY-NOTICES.txt, LICENSE.txt
```

| Part | Files | Size |
|---|---:|---:|
| Whole release (uncompressed / ZIP) | 142 | 862.8 KB / 785.1 KB |
| `extension/runtime` (2 scripts, minified) | 2 | 78.6 KB |
| `extension/icons` | 4 | 16.5 KB |
| `skin-packs` (3 skins at the game's native size) | 130 | 577.0 KB |
| `START-HERE.html` | 1 | 184.0 KB |

## How the build keeps it small and safe

- **JavaScript and CSS:** `extension/src/*.js` are concatenated per content-script group and minified (the panel's CSS as CSS).
- **PNGs:** re-encoded losslessly (smallest of RGBA, grey+alpha or palette, several row filters, zlib 9), all metadata dropped, and
  decoded again to confirm identical pixels. Only the guide's screenshots may use a 256-colour palette, and only when the result is
  visually lossless (PSNR of at least 40 dB).
- **Skin packs at 1x:** the add-on reduces 2x/4x skin art to the game's native frame size when a skin is installed, so shipping the
  native size shows exactly the same pixels in the game.
- **ZIP:** written deterministically (sorted entries, fixed timestamp, fixed attributes, no extra fields), read back and compared
  with the release folder. Line endings are pinned to LF by `.gitattributes`.
- **Audit:** `build/audit.mjs` runs on the finished ZIP as part of the build. It reports the problems listed in
  [SECURITY-AUDIT.md](SECURITY-AUDIT.md) and fails the build on any. Your own words to keep out of a release (user name, e-mail)
  go in `build/private-patterns.txt`, one regular expression per line. That file is gitignored.

## Changing things

- Skins: add or replace a folder in `skin-packs/` (PNGs at the game's native size plus `skin.json`) and list it in
  `release.config.json` under `skinPacks.packs`.
- The install guide is `guide/guide.html`; its pictures are `screenshots/*.png` and are regenerated from the built release with
  `node tools/make-guide-images.mjs` and `node tools/make-hero.mjs` (optional `--font <file>` renders the game's own font into the
  pictures; the font itself is never stored here).
- Icon: edit `assets-src/icon.svg`, then `node tools/make-icons.mjs`.
- Release number: `extension/manifest.json`, `package.json`, and the file names in `README.md`.
- The repository address used in the guide is `repoUrl` in `build/release.config.json`.

## Publishing a release on GitHub

1. `npm ci && npm test && npm run build && npm run audit && node tests/release.check.mjs && npm run reproducible`.
2. Create a GitHub release for the version, and attach `dist/TankTrouble-Skin-Tools-<version>.zip` as its only asset.
3. Put the ZIP's SHA-256 (in `dist/sizes.json`) in the release notes.
