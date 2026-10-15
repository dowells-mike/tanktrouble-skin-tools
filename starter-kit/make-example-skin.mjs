// Draws the example skin (example-art.mjs, SVG) into starter-kit/example-skin/: 31 PNGs at 2x the game's size + skin.json.
// Uses the local Chrome only to turn the SVG into pixels; nothing is downloaded. The PNGs are committed, so this runs only when the art changes.
//   node starter-kit/make-example-skin.mjs [--preview <file.png>]
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { launchChrome } from '../tools/chrome.mjs';
import { decode } from '../build/png.mjs';
import { allFrames, SKIN } from './example-art.mjs';
import { syncLibs } from './sync-libs.mjs';

const require = createRequire(import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url));
const { ALL_SPECS } = require('../extension/src/frames.js');
const { encodePng } = require('./src/artist-tools/lib/png.js');   // plain 8-bit RGBA, never a palette: Photoshop would open a palette PNG in Indexed Colour mode
syncLibs();
const out = path.join(here, 'example-skin');
const SCALE = SKIN.pixelScale;
const previewArg = process.argv.indexOf('--preview');

fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });
const browser = await launchChrome();
const written = [];
for (const [name, svg] of Object.entries(allFrames())) {
  const { w, h } = ALL_SPECS[name];
  const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: SCALE });
  await page.setContent(`<!doctype html><html><body style="margin:0;background:transparent">${svg}</body></html>`);
  const shot = await page.screenshot({ omitBackground: true, clip: { x: 0, y: 0, width: w, height: h } });
  await page.close();
  const image = decode(shot);
  if (image.width !== w * SCALE || image.height !== h * SCALE) throw new Error(`${name}: drew ${image.width}x${image.height}, expected ${w * SCALE}x${h * SCALE}`);
  fs.writeFileSync(path.join(out, `${name}.png`), encodePng(image.width, image.height, image.data));
  written.push({ frame: name, width: image.width, height: image.height, rgba: image.data });
}
await browser.close();
fs.writeFileSync(path.join(out, 'skin.json'), JSON.stringify(SKIN, null, 2) + '\n');
console.log(`wrote ${written.length} pictures + skin.json to ${path.relative(process.cwd(), out)} (${(fs.readdirSync(out).reduce((n, f) => n + fs.statSync(path.join(out, f)).size, 0) / 1024).toFixed(0)} KB)`);
if (previewArg > 0) {
  const { contactSheet } = require('./src/artist-tools/lib/atlas.js');
  fs.writeFileSync(process.argv[previewArg + 1], contactSheet(written));
}
