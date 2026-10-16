# Backer Paint (3D)

The game's green **Backer camouflage paint** as a rendered 3D tank, in the same top-down orthographic style as Rainbow Paint, Onyx Paint and 3D Shaders.
asger-finding's TankTrouble-in-3D model ([tanktrouble-in-3d](https://github.com/asger-finding/tanktrouble-in-3d), CC0) is rendered in Blender, so the silhouette,
tread positions, dome, weapon shapes and muzzle are the game's (silhouettes 97-99% of the original frames).

**The camouflage is a material, not a picture.** Organic patches of medium emerald, bright emerald and dark forest green come from a 3D noise sampled at every point's
position on the tank (a mesh attribute, `tpos`, holding each vertex's coordinates in the model before any recoil pose or placement). So:

- the patches bend over the dome and wrap around the barrel like paint on real geometry;
- every weapon's turret shows the **same** dome pattern (tested: `tests/skins.test.mjs`), and a recoiling barrel carries its own patches back with it;
- the three gatling barrels get shifted patches (three barrels, not three copies);
- the treads keep their mechanical detail (recessed shadows between links) and are a shade darker.

The paint is satin with a thin clear coat (soft highlights), lit from the upper left, with ambient occlusion in the creases and a restrained pale-green rim light.
The skin is painted (`tint: "none"`): players' colours are ignored.

**What is in `skin/`** (57 pictures at 4x): `base`, `tread`, `turret0`-`turret16`; `homingMissile`, `mine`, `mineGlow`, `mineShrapnel`; `fragment0`-`fragment9`;
`explosion0-2`, `smoke0-2`, `dust0-2`, `puff0-2`; `treadShade0`-`treadShade11`; and a bright-emerald laser (`skin.json`).

- **Shield, bullets and crates are the game's own.** No shield pictures are in the skin.
- **Tread animation:** `treadShade0-11` are soft, faint dark bands that scroll along the tread, replacing the game's hard dark blocks. Generated in `build.mjs`.
- The missile, mine, shrapnel and tank fragments carry the same camouflage; the cloud effects use the same greens.

| Path | What |
|---|---|
| `skin/` | the finished skin (id `backer-paint-3d`) |
| `backer-paint-3d.psd`, `-effects.psd`, `-scene.psd` | layered working files |
| `blender/render.py` | the renderer (the camouflage is `camo_colour`; `paint_coords` stores the pattern coordinates) |
| `fx-art.mjs`, `src/*.svg` | the effect sprites (clouds, mine glow) as SVG |
| `build.mjs` | Blender + SVG -> PSDs -> `psd-export` -> `skin/` (+ the tread-shade bands), validated like the extension's importer |
| `screenshots/` | all 17 frames assembled at 4x, and in the game's real renderer |

Rebuild: `node skins/backer-paint/build.mjs --source <path to tanktrouble-in-3d.blend>` (Blender 5.x). Look options: `--camo-seed` (which part of the pattern
lands where; 1 is the shipped one), `--camo-scale` (patch size), `--camo-bright`, `--camo-dark` (coverage), `--camo-ribbon` (e.g. 0.045: thin wavy dark ribbons instead of blobs), `--camo-warp`, `--rough`, `--coat`, `--rim`, `--gain`.
Without Blender, `--no-render` rebuilds the PSDs and `skin/` from the saved renders. Player download: see [../README.md](../README.md).
