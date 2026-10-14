# Privacy

TankTrouble Skin Tools is a browser add-on that changes how tanks look on your own screen. It is built to keep
everything on your computer.

## What it does not do

- It sends nothing anywhere. It contains no code that uses the network, and it asks the browser for no permissions.
- No accounts, no analytics, no tracking, no advertising, no remote code. It never downloads anything.
- It does not read your TankTrouble account, password, messages or cookies, and it does not change the game: what the
  server receives from you is exactly what it would receive without the add-on.

## What it stores, and where

The add-on runs only on `https://tanktrouble.com`. It keeps two things in your browser, in the storage that belongs to
that site:

| What | Where | Why |
|---|---|---|
| The skins you install (their pictures, name and settings) | the site's IndexedDB, database `tanktrouble-skin-tools-v1` | so your skins are there next time |
| Your choices: which skin each tank wears, colours you picked, the names and game ids of players you gave a skin, whether skins are on, and where the panel sits | the site's localStorage, key `ttSkinTools.v1` | so your choices are kept |

Because this is the site's own storage, the TankTrouble page could technically read it, just like anything else stored
for that site. It contains nothing about you beyond the choices listed above.

## Removing your data

- Delete a skin: open the panel, **Manage skins**, the bin next to the skin.
- Forget every choice: **Advanced**, **Clear assignments**.
- Remove everything: delete the browsing data of `tanktrouble.com` in your browser's settings (site data / cookies and site
  data). Removing the add-on itself does not delete what it stored for the site.

## Other players

Skins only change what your browser draws. Other players do not see them, and nothing about your choices is shared.
