ARTIST TOOLS (optional)
=======================

Two small helpers for people who make skins. You do NOT need them to make a skin: the blank PNG templates are enough.
They need Node.js 20 or newer (https://nodejs.org). They work offline, install nothing and write only to the folder you name.
Open a terminal in THIS folder and run:

  node psd-to-skin.mjs my-skin.psd --out my-skin --id my-skin --name "My Skin" --author "You"
      Cuts the layers of the layered template (../templates/psd) into correctly sized PNGs and writes skin.json.

  node atlas-to-skin.mjs example-atlas/classic-tank-atlas.json --out converted --id converted-example --preview
      Turns a texture atlas (one PNG sheet + a JSON list of where each picture sits) into a Skin Tools skin folder.
      Run it with --help to see every option.

What atlas-to-skin handles (nothing is assumed about the atlas; every picture is measured):
  * TexturePacker "JSON array" and "JSON hash" lists, as used by Phaser and PixiJS; picture names with a folder or ".png" are read too.
  * Trimmed pictures are put back on their full canvas at the right offset.
  * Any size: pictures at 0.5x, 1x, 2x, 3x, 4x ... of the game's size. They are brought to ONE scale (--scale auto|1|2|4), reduced with
    an exact area average. Enlarging a smaller sheet (for example a half-size one) happens ONLY when you ask for it with --upscale smooth|sharp; without it the sheet is refused. Enlarging adds no detail and is always reported.
  * A picture whose "sourceSize" disagrees with its real pixels (some sheets do this) is read from its real pixels, with a warning.
  * Transparency of every common PNG kind (RGBA, palette, grey, 16 bit, colour-key); fully transparent or fully opaque pictures are reported.
  * The tread shade frames must be all 12 or none; the result is checked with the same rules Skin Tools applies on import.
Refused with a clear message: rotated pictures, sheets whose pictures are not the tank's shape, interlaced PNGs, missing required pictures
(base, tread, turret0; use --partial to write what exists anyway).

Only convert pictures you made or have permission to use. See ../about/CREDITS.txt.
