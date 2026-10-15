# Making your own skin

A skin is a folder of PNG pictures plus an optional `skin.json`. Each picture replaces one of the game's sprites, named
exactly like the game names it. Anything you leave out stays the game's own, so you can start small.
The example skins in `skin-packs/` are complete examples to look at.

New to this? The optional **Skin Creator Starter Kit** (a separate download on the Releases page) has blank templates with guides, a layered
PSD, a complete importable example skin and an illustrated guide for Photoshop, GIMP, Krita and Procreate.

## 1. Sizes and orientation

Draw every part **facing up**. "px" means the game's own drawing units at normal size.

| File | Size (px) | What it is |
|---|---|---|
| `base.png` | 68 x 84 | the body; the tank's centre is pixel (34, 42) |
| `tread.png` | 12 x 80 | one tread; the game draws it twice, at the left and the right, **without mirroring** |
| `treadShade0.png` … `treadShade11.png` | 12 x 80 | optional moving-tread overlay: all 12 or none, drawn on top of `tread`, never tinted |
| `turret0.png` … `turret16.png` | 68 x 82 | the turret; the tank's centre is pixel (34, 57) of this canvas |

Required: `base`, `tread`, `turret0`. Strongly recommended: `turret1`, `turret2` (the default gun's recoil).

| Turret frame | Shown when |
|---|---|
| `turret0` | default gun, idle |
| `turret1`, `turret2` | default gun firing (recoil) |
| `turret3` | laser |
| `turret4` | double barrel, idle; `turret5`, `turret6` left barrel firing; `turret7`, `turret8` right barrel firing |
| `turret9` | shotgun, idle; `turret10`, `turret11` shotgun recoil |
| `turret12` | homing missile loaded; `turret13` after launch |
| `turret14` | mine layer |
| `turret15`, `turret16` | gatling gun (they alternate while it spins) |

- Shots leave the barrel 50 px ahead of the tank's centre: pixel (34, 7) of a turret canvas.
- The hitbox is 60 x 80, centred, plus the barrel. Keep the visible body close to it so you can still aim honestly.
- Leave at least 1 px of fully transparent border, and never crop: every file must be exactly its canvas size.
- You may paint at exactly **2x or 4x** these sizes (every file of a skin at the same scale). The add-on reduces it to the
  game's size when the skin is installed, with clean edges.

## 2. Colour: painted or the player's colour

The game multiplies tank pictures by each player's colour. Your `skin.json` chooses, per part, what happens:

| Policy | Result | Paint like this |
|---|---|---|
| `"none"` | your picture exactly as painted; the player's colour is ignored | any colours |
| `"player"` | your picture multiplied by that player's colour | neutral light greys: white shows the full player colour, greys darken it |

With `"none"` on the turret, weapons you didn't draw show the game's own turret in the player's colour.

## 3. skin.json

```json
{
  "schema": 1,
  "id": "ember-mk1",
  "name": "Ember Mk I",
  "author": "your name",
  "version": "1.0.0",
  "tint": { "base": "none", "tread": "none", "turret": "none" },
  "laser": { "colour": "#ff2f40", "glow": true }
}
```

- `schema` and `id` are required. `id`: lower-case letters, digits and hyphens, up to 40 characters. Installing a skin with
  an `id` you already have replaces it.
- `tint`: `"none"` or `"player"` per part (left out = `"none"`).
- `laser` (optional): the colour of your laser beam and its aiming line, with or without a soft glow.
- Without a `skin.json`, the folder's name becomes the id and everything is shown as painted.

## 4. Weapon and scene pictures (optional)

| Files | Size (px) | Notes |
|---|---|---|
| `bullet.png`, `doubleBarrel.png` | 20 x 20 | keep the solid core within about 10-12 px |
| `shotgun.png`, `gatlingGun.png` | 12 x 12 | |
| `homingMissile.png` | 32 x 44 | points up; tinted with the owner's turret colour unless the skin is painted |
| `mine.png` | 56 x 56 | tinted like the missile |
| `mineGlow.png` | 48 x 48 | the pulsing light on a mine: a soft glow with transparent edges |
| `mineShrapnel.png` | 20 x 20 | it spins: make it look right at every angle |
| `explosion0-2.png` / `smoke0-2.png` / `dust0-2.png` / `puff0-2.png` | 100 / 60 / 80 / 20 square | explosion clouds |
| `shield.png` | 180 x 180 | the shield bubble |
| `shieldBolt0-2.png` | 88x90, 80x90, 68x90 | the shield's buzzing bolts |
| `shieldSparkBolt0-2.png`, `shieldSpark.png` | 68 x 66, 18 x 18 | sparks |
| `fragment0-9.png` | 40 x 40 | pieces of an exploding tank (tinted with the tank's colour) |
| `crate0-0.png` … `crate0-6.png` | 64 x 64 | weapon crates: laser, double barrel, shotgun, missile, mine, gatling, shield |

Shots, missiles, mines and fragments follow the skin of whoever owns them. Clouds and crates belong to nobody, so they
follow the skin on **your** tank.

## 5. Exporting

- PNG, **sRGB, 8 bits per channel, with transparency (RGBA)**, no background layer, not interlaced.
- File names exactly as in the tables (lower-case `.png`), at most 4 MB each.
- Semi-transparent edge pixels should carry the art's own colour, not white or black, or a halo shows on dark floors.
- Install your folder with **Manage skins → Add a folder**. If anything is off, the panel lists each problem with the size
  it expected.
