// Packs the example skin's pictures into a TexturePacker-style atlas (trimmed, like a real artist's export) for the kit's converter demo:
//   starter-kit/example-atlas/classic-tank-atlas.png + .json.   node starter-kit/make-example-atlas.mjs
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { packAtlas } from './pack-atlas.mjs';

const require = createRequire(import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url));
const { decodePng } = require('./src/artist-tools/lib/png.js');
const skin = path.join(here, 'example-skin');
const out = path.join(here, 'example-atlas');
const pictures = fs.readdirSync(skin).filter(f => f.endsWith('.png')).map(f => { const p = decodePng(fs.readFileSync(path.join(skin, f))); return { name: f.replace(/\.png$/, ''), width: p.width, height: p.height, rgba: p.data }; });
const atlas = packAtlas(pictures, { trim: true, format: 'array', width: 640, image: 'classic-tank-atlas.png' });
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(path.join(out, 'classic-tank-atlas.png'), atlas.png);
fs.writeFileSync(path.join(out, 'classic-tank-atlas.json'), JSON.stringify(atlas.json, null, 1) + '\n');
console.log(`wrote ${pictures.length} pictures into a ${atlas.image.width}x${atlas.image.height} atlas (${(atlas.png.length / 1024).toFixed(0)} KB), ${atlas.json.frames.filter(f => f.trimmed).length} trimmed`);
