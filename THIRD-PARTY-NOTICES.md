# Third-party notices and credits

## The extension

The extension contains no third-party code and no third-party assets. Everything in the `extension` folder was written or
made for this project and is covered by `LICENSE`.

It contains no TankTrouble program code and no TankTrouble artwork. It works with the game's page in your browser: it
reads the game's own sprites and colours there, and it uses the page's own "TankTrouble" font for its panel when the
page has loaded it. The font is not included.

TankTrouble is a trademark of its owners. This add-on is unofficial and is not affiliated with, endorsed by or
supported by them.

## Example skins (`skin-packs`)

| Skin | Made from | Licence of the source |
|---|---|---|
| Golden Tank | Original 3D models and renders made for this project (Blender), plus original effect artwork. | This project's licence. |
| Onyx Tank | The same original models with a different material, plus original effect artwork. | This project's licence. |
| 3D Shaders | Rendered from the "TankTrouble in 3D" Blender model by **asger-finding** (https://github.com/asger-finding/tanktrouble-in-3d), with new lighting and a rim-light shader made for this project. | The model is dedicated to the public domain under **CC0 1.0** (https://creativecommons.org/publicdomain/zero/1.0/). Credit is given as a courtesy. |

The example skins are sized to fit the game's tank frames so they line up in play. They do not contain or copy the game's
own sprite images.

## Development tools (not part of the add-on)

Used to build and test the release, and not included in it:

| Tool | Licence |
|---|---|
| esbuild (minifies the JavaScript and CSS) | MIT |
| playwright-core (drives a local Chrome for the release check and the guide screenshots) | Apache-2.0 |
| Blender (rendered the example skins) | GPL; its output is not covered by the GPL |
