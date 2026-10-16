# Onyx Paint (3D)

The game's **onyx paint** as a true 3D tank, made to follow the onyx box art: polished black stone with thin, wandering grey-gold veins and crisp glossy highlights.
asger-finding's TankTrouble-in-3D model ([tanktrouble-in-3d](https://github.com/asger-finding/tanktrouble-in-3d), CC0) is rendered in Blender from a straight top-down
orthographic camera, like the 3D Shaders and Rainbow Paint skins (silhouettes 97-99% of the original frames; the mine shrapnel about 90%).

**The stone** is procedural and 3D: a charcoal base with slow tonal clouds, and diagonal bands of vein (grey-olive core, pale-gold crest) bent by noise so they wander.
The veins follow the position on the tank, so barrels, domes and tread links read as one block of stone. The material is polished: a clear coat for the sharp highlight
on the dome and barrels, and a restrained cool rim light so the dark shape keeps its edge. The skin is painted (`tint: "none"`): players' colours are ignored.

**What is in `skin/`** (57 pictures at 4x): `base`, `tread`, `turret0`-`turret16`; `homingMissile`, `mine`, `mineGlow`, `mineShrapnel`; `fragment0`-`fragment9`;
`explosion0-2`, `smoke0-2`, `dust0-2`, `puff0-2`; `treadShade0`-`treadShade11`; and a pale-gold laser (`skin.json`).

- **Shield, bullets and crates are the game's own.** No shield pictures are in the skin.
- **Tread animation:** `treadShade0-11` are soft, faint dark bands that scroll along the tread, replacing the game's hard dark blocks (which look wrong on polished stone).
  They are generated in `build.mjs`, not painted.

| Path | What |
|---|---|
| `skin/` | the finished skin (id `onyx-paint-3d`) |
| `onyx-paint-3d.psd`, `-effects.psd`, `-scene.psd` | layered working files |
| `blender/render.py` | the renderer (the stone material is `onyx_colour`) |
| `fx-art.mjs`, `src/*.svg` | the effect sprites (clouds, mine glow) as SVG |
| `build.mjs` | Blender + SVG -> PSDs -> `psd-export` -> `skin/` (+ the tread-shade bands), validated like the extension's importer |
| `screenshots/` | results in the game's real renderer |

Rebuild: `node skins/onyx-paint/build.mjs --source <path to tanktrouble-in-3d.blend>` (Blender 5.x). Look options: `--veins`, `--warp`, `--wander`, `--rough`, `--rim`, `--key-angle`.
Without Blender, `--no-render` rebuilds the PSDs and `skin/` from the saved renders. Player download: see [../README.md](../README.md).
