# Rainbow Paint (3D)

The game's **rainbow paint** as a true 3D tank. asger-finding's TankTrouble-in-3D model ([tanktrouble-in-3d](https://github.com/asger-finding/tanktrouble-in-3d), CC0)
is rendered in Blender from a straight top-down orthographic camera, like the 3D Shaders skin: the model's own material, a soft key light from the upper left,
ambient occlusion and a rim light. Instead of white, the paint is the game's rainbow.

**Loyal to the game.** The geometry is the model's (silhouettes 97-99% of the original frames). The rainbow is laid out as the game lays it out: **each picture has
its own rainbow, from red at its top edge to violet at its bottom edge** (red, orange, yellow, green, cyan, blue, violet, magenta). So the barrel runs red to
yellow, the dome cyan to blue to violet, and a recoiling barrel keeps the same colours at the same place of the picture. The skin is painted (`tint: "none"`),
so players' colours are ignored, like the real paint.

**What is in `skin/`** (45 pictures at 4x): `base`, `tread`, `turret0`-`turret16` (every weapon and its animation, recoil frames included); `homingMissile`, `mine`,
`mineGlow`, `mineShrapnel`; `fragment0`-`fragment9`; `explosion0-2`, `smoke0-2`, `dust0-2`, `puff0-2`; and the laser (`laser` in `skin.json`: magenta, with glow; a laser has one colour).

- **Shield, bullets and crates are the game's own.** No shield pictures are in the skin.
- The game's own tread-motion overlay still draws over `tread`.

| Path | What |
|---|---|
| `skin/` | the finished skin (id `rainbow-paint`) |
| `rainbow-paint.psd`, `-effects.psd`, `-scene.psd` | layered working files (tank, weapon-visuals and scene templates) |
| `blender/render.py` | the renderer (the 3D Shaders renderer with a rainbow material, plus the shrapnel and fragment shards) |
| `fx-art.mjs`, `src/*.svg` | the effect sprites (clouds, mine glow) as SVG |
| `build.mjs` | Blender + SVG -> PSDs -> `psd-export` -> `skin/`, validated like the extension's importer |
| `screenshots/` | results in the game's real renderer |

Rebuild: `node skins/rainbow-paint/build.mjs --source <path to tanktrouble-in-3d.blend>` (Blender 5.x; the `.blend` is not in this repository).
Renderer options: `--rim` (rim strength), `--gain`, `--key`, `--sky`, `--grey` (plain grey 3D Shaders output instead of the rainbow).
Without Blender, `--no-render` rebuilds the PSDs and `skin/` from the saved renders. Player download: see [../README.md](../README.md).
