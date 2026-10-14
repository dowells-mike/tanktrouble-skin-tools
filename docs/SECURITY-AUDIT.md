# Security and privacy audit: TankTrouble Skin Tools 1.0.0

Date: 2026-10-14. Scope: the two release archives as distributed (`TankTrouble-Skin-Tools-1.0.0.zip` and
`TankTrouble-Skin-Tools-1.0.0-extension.zip`), opened and read entry by entry, plus every file tracked by this repository
(what a public repository would show). Result: **no findings**.

## 1. How it was checked

**Automated, on every build** (`build/build.mjs` runs `build/audit.mjs`; a finding fails the build):

| Check | Applies to |
|---|---|
| Windows user folders, home folders, e-mail addresses | every text entry |
| GitHub / API tokens, private keys, JSON web tokens, credential assignments (`password=`, `api_key:` …) | every text entry |
| Session or cookie material, IP addresses | every text entry |
| References to private development material (the private development repository, game research, private test setups, AI and automation modules, other private extensions) | every text entry |
| Source maps and source-map comments | every text entry |
| Personal identifiers from a local, gitignored list (`build/private-patterns.txt`: name, username, e-mail) | every text entry |
| Links to any site other than tanktrouble.com, github.com, creativecommons.org and standard namespaces | every text entry |
| Network or code-evaluation APIs (`fetch`, `XMLHttpRequest`, `WebSocket`, `EventSource`, `sendBeacon`, `eval`, `new Function`, `importScripts`) | runtime JavaScript |
| Extension APIs that need permissions (`chrome.runtime`, `storage`, `tabs`, `cookies`, …) | runtime JavaScript |
| Synthetic input and game-input or networking calls (automation) | runtime JavaScript |
| PNG chunks other than IHDR, PLTE, tRNS, IDAT, IEND (text, time, EXIF, ICC metadata) | every PNG |
| `skin.json` keys outside the documented schema | example skins |
| Manifest: no `permissions`, `host_permissions`, `background`, `web_accessible_resources`, `externally_connectable`, `content_security_policy`, `update_url`, `key`; content scripts only on `https://tanktrouble.com/*`; Manifest V3 | `manifest.json` |
| ZIP entries: no dotfiles, PSD, Blender, SVG, logs, OS metadata files; no extra fields or comments | both archives |
| The archive equals the release folder byte for byte (read back after writing) | both archives |

**Release allowlist.** `build/release.config.json` names every file the release can contain and why. A missing source fails
the build, and so does any file in the output that no rule produced. Nothing reaches the release just because it sits in a
folder. `dist/INVENTORY.md` lists every entry with its size, SHA-256 and purpose.

**Manual review** of the archive contents: the manifest, every `skin.json`, the documents, and every match of `http`, `@`,
`console.`, `record`, `session`, `cookie` and `bot` in the minified runtime. All matches are benign: the manifest's
tanktrouble.com pattern, CSS `@media`, two error-only console warnings, the word "record" for an installed skin, and
CSS `border-bottom`.

## 2. Permissions

| Requested | Why |
|---|---|
| *(no permissions)* | The manifest has no `permissions` or `host_permissions` at all. |
| Content scripts on `https://tanktrouble.com/*` | The only place the add-on does anything. Two scripts: one at `document_start` to catch the game's sprites as they are created, one at `document_idle` for the panel. |
| `world: "MAIN"` | The skins are applied to the game's own sprite objects, which only exist in the page's main JavaScript world. The add-on's global `TankSkinTools` is therefore visible to the page. The page could call its controller (for example, change skin choices or turn skins off), which is harmless and confined to tanktrouble.com. |

No background service worker, no web-accessible resources, no external connections, no remote code, and the default
extension content security policy.

## 3. Data handling

- **Network:** none. The runtime contains no network APIs (checked on every build), and the packaged-release test records
  every request made while the add-on is installed and used: only the page itself was loaded.
- **Storage:** installed skins in IndexedDB (`tanktrouble-skin-tools-v1`) and choices in localStorage (`ttSkinTools.v1`),
  both in tanktrouble.com's own storage. The page can read this storage like any of its own. It holds skin pictures, skin
  names, choices, and the public game ids and names of players the user assigned a skin to. Documented in `PRIVACY.md`.
- **Untrusted input:** imported skins are validated before anything is stored: at most 80 files, at most 4 MB each,
  `skin.json` at most 64 KB and schema-checked, a PNG header check, exact sizes, and no interlacing. PNGs are decoded by the
  browser. Text from outside (skin names, player names, file names) is only ever inserted with `textContent`. The only
  `innerHTML` use is for constant icon markup.
- **Gameplay:** cosmetic only. The add-on reads sprite and colour data and replaces textures and tints on the user's
  screen. It never sends input, never calls the game's networking, and never changes the game model, hitboxes or physics.
  No AI, bot or automation code is in this repository or the release.

## 4. Independence from the development repository

This project builds and installs with only its own files and two pinned development tools (`esbuild`, `playwright-core`).
The runtime source's comments and messages were rewritten to drop references to private tools before export. The audit
re-checks the archives and the tracked files for such references on every build.

## 5. Third-party material

No third-party code ships. The example skins are original renders, plus one rendered from a CC0 model (see
`THIRD-PARTY-NOTICES.md`). No TankTrouble program code or artwork is included. The release's PNGs are this project's art,
and the guide's screenshots show only this project's panel, its skins and Chrome's extensions page.
See `PUBLICATION-CHECKLIST.md` for the decisions that remain with the owner.

## 6. Residual risks

| Risk | Assessment |
|---|---|
| Anyone can read the packaged code | Expected for any extension. Nothing private is in it (above). |
| The page can see and call `TankSkinTools` | Confined to tanktrouble.com; worst case is the page changing your skin choices. |
| Skin choices and player names live in the site's storage | Disclosed in `PRIVACY.md`, with how to delete them. |
| A future game update renames the sprite classes or frames | The add-on then stops skinning (it falls back to the game's look). It does not break the game. |
