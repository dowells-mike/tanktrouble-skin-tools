# Publication checklist: TankTrouble Skin Tools 1.0.0

Nothing has been published. This repository exists only locally and has no remote. No GitHub release has been made and no
store listing has been created. Tick each item before going public.

## Done and verified

- [x] Standalone project with its own clean history; builds and installs without the development repository.
- [x] Release built from an explicit allowlist; `dist/INVENTORY.md` lists every file, its size, SHA-256 and purpose.
- [x] Reproducible: two builds give byte-identical files and ZIPs.
- [x] Security and privacy audit of both ZIPs, entry by entry, and of every tracked file: no findings (`docs/SECURITY-AUDIT.md`).
- [x] No permissions; content scripts only on `https://tanktrouble.com/*`; no network, analytics, tracking or remote code.
- [x] No AI, bot, lobby or other automation code; no TankTrouble program code or artwork.
- [x] PNG metadata stripped from every image; no source maps; no local paths or personal identifiers.
- [x] The packaged ZIP installs into a fresh Chrome profile and works: import, assign, recolour, colour modes, persistence,
      removal, reset (`tests/release.check.mjs`).
- [x] Release behaviour and rendering match the development version pixel for pixel in the game's real renderer.
- [x] Commits in this repository use the GitHub no-reply e-mail of the configured account.

## Decisions for you before publishing

1. **Licence.** `LICENSE` is MIT with the holder "TankTrouble Skin Tools contributors". Change the holder (or the licence)
   if you want your own name or a different licence. The same file is copied into the release.
2. **Example skins.** Ships: Golden Tank, Onyx Tank (original renders made for this project) and 3D Shaders (rendered
   from asger-finding's CC0 "TankTrouble in 3D" model). Their shapes follow the game's tank frames so they line up in play.
   The CC0 model is itself a fan recreation of the game's tank design: CC0 covers the model author's rights, not the game
   owner's. If you want zero risk there, remove `3d-shaders` from `skinPacks.packs` in `build/release.config.json` (the
   build then drops it everywhere) and from the guide text. The **Spider-Man** skin from the development project is
   **excluded**: it depicts a third-party character.
3. **Name and trademark.** "TankTrouble" is the game's trademark. The manifest, guide and notices say "unofficial" and "not
   affiliated". Browser stores may still object to a trademark in the name. A safer store name would be
   "Skin Tools for TankTrouble (unofficial)".
4. **Live check.** Every rendering test ran against the game's code captured on 2026-10-05; the live site has had a release
   since (2026-10-09). Before announcing, load the release with Load unpacked, play one local game on tanktrouble.com, and
   confirm the skins appear.
5. **Guide screenshots** show the panel in the game's own font (rendered into the images; the font file is not included),
   and Chrome's extensions page.
6. **Version.** `1.0.0` in `extension/manifest.json`, `package.json` and the guide.

## To publish (when you decide)

- [ ] Create the GitHub repository (private first if you like), add it as `origin`, push `main`.
- [ ] `npm ci && npm run build && npm run audit && node tests/release.check.mjs`.
- [ ] Attach `dist/TankTrouble-Skin-Tools-1.0.0.zip` to a GitHub release. Put its SHA-256 from `dist/sizes.json` in the
      release notes.
- [ ] Optional browser store: upload `dist/TankTrouble-Skin-Tools-1.0.0-extension.zip`. In the privacy section declare that
      no user data is collected, with single purpose "cosmetic tank skins on tanktrouble.com". Store screenshots must be
      1280x800 or 640x400.
- [ ] Make the repository public only after reviewing `dist/INVENTORY.md` and this checklist once more.
