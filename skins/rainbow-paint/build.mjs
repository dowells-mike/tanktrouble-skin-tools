// Builds the Rainbow Paint skin through the supported Skin Tools pipeline:
//   Blender (blender/render.py: asger-finding's TankTrouble-in-3D tank painted with the game's rainbow, top-down orthographic, 4x) -> render/*.png      tank parts, missile, mine, shrapnel, fragments
//   fx-art.mjs (SVG, headless Chrome at 4x)                                                       explosion, smoke, dust, puff, mine glow
//   -> layered PSDs (tank, weapon-visuals and scene templates, art layers filled) -> psd-export (PNGs + skin.json) -> skin/ folder ready for the extension.
//   node skins/rainbow-paint/build.mjs [--source <tanktrouble-in-3d.blend>] [--samples 192] [--no-render] [--blender <path to blender.exe>] [--parts base,tread,...]
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { templateDocument, effectsDocument, sceneDocument } from '../tools/make-psd-template.mjs';
import { exportPsd } from '../tools/psd-export.mjs';
import { launchChrome as launch } from '../../tools/chrome.mjs';
import { FX_SVG_EFFECTS, FX_SVG_SCENE, FX_BLENDER_EFFECTS, FX_BLENDER_SCENE } from './fx-art.mjs';

const require = createRequire(import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url));
const { decodePng } = require('../tools/png.js');
const { buildPsd } = require('../tools/psd/psd-writer.js');
const { readPsd } = require('../tools/psd/psd-reader.js');
const { analysePackage } = require('../../extension/src/skin-package.js');
const { ALL_SPECS: SPECS } = require('../../extension/src/frames.js');

const argv = process.argv.slice(2);
const opt = (key, fallback) => { const i = argv.indexOf(key); return i >= 0 ? argv[i + 1] : fallback; };
const S = 4;
const SKIN = { id: 'rainbow-paint', name: 'Rainbow Paint (3D)', author: 'Skin Tools example (tank model: asger-finding, CC0)', version: opt('--version', '1.0.0') };
const LASER = { colour: '#ff3fb4', glow: true };            // one colour only: the magenta end of the rainbow
const TANK_PARTS = ['base', 'tread', ...Array.from({ length: 17 }, (_, i) => 'turret' + i)];
const ALL_BLENDER = [...TANK_PARTS, ...FX_BLENDER_EFFECTS, ...FX_BLENDER_SCENE];
const PARTS = opt('--parts', ALL_BLENDER.join(',')).split(',');
const renderDir = path.join(here, 'render');

// ---- 1. Blender renders the solid parts ----
if (!argv.includes('--no-render')) {
  const source = [opt('--source', ''), process.env.TT3D_BLEND, path.join(here, 'source', 'tanktrouble-in-3d.blend'), path.join(os.homedir(), 'Downloads', 'tanktrouble-in-3d.blend')].find(p => p && fs.existsSync(p));
  if (!source) { console.error('tanktrouble-in-3d.blend not found: download it from https://github.com/asger-finding/tanktrouble-in-3d and pass --source <path>'); process.exit(1); }
  const candidates = [opt('--blender', ''), process.env.BLENDER, 'C:/Program Files/Blender Foundation/Blender 5.2/blender.exe',
    ...(fs.existsSync('C:/Program Files/Blender Foundation') ? fs.readdirSync('C:/Program Files/Blender Foundation').map(d => `C:/Program Files/Blender Foundation/${d}/blender.exe`) : [])];
  const blender = candidates.find(p => p && fs.existsSync(p));
  if (!blender) { console.error('Blender not found: pass --blender <path> or set BLENDER'); process.exit(1); }
  const run = spawnSync(blender, ['-b', '--python', path.join(here, 'blender', 'render.py'), '--', '--source', source, '--out', renderDir, '--samples', opt('--samples', '192'), '--only', PARTS.join(',')], { encoding: 'utf8' });
  if (run.status !== 0 || /Traceback/.test(run.stdout + run.stderr)) { console.error(run.stdout, run.stderr); process.exit(1); }
  console.log(`rendered ${PARTS.length} parts with ${path.basename(path.dirname(blender))}`);
}

// ---- 2. gather pixels: Blender renders, and the SVG effect sprites at 4x ----
const pixels = {};
const check4x = (name, image) => {
  const { w, h } = SPECS[name];
  if (image.width !== w * S || image.height !== h * S) throw new Error(`${name}: ${image.width}x${image.height}, expected ${w * S}x${h * S}`);
  pixels[name] = image;
};
for (const name of PARTS) check4x(name, decodePng(fs.readFileSync(path.join(renderDir, `${name}.png`))));
const svgParts = { ...FX_SVG_EFFECTS, ...FX_SVG_SCENE };
const srcDir = path.join(here, 'src');
fs.rmSync(srcDir, { recursive: true, force: true });       // so no sprite that is no longer made can linger
fs.mkdirSync(srcDir, { recursive: true });
const browser = await launch();
for (const [name, svg] of Object.entries(svgParts)) {
  fs.writeFileSync(path.join(srcDir, `${name}.svg`), svg + '\n');
  const { w, h } = SPECS[name];
  const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: S });
  await page.setContent(`<!doctype html><html><body style="margin:0;background:transparent">${svg}</body></html>`);
  const png = await page.screenshot({ omitBackground: true, clip: { x: 0, y: 0, width: w, height: h } });
  await page.close();
  check4x(name, decodePng(png));
}
await browser.close();

// ---- 3. layered PSDs: the templates with the artwork layers painted ----
const fillWith = (doc, names) => { const fill = nodes => { for (const n of nodes) { if (n.type === 'group') fill(n.children); else if (names.has(n.name) && pixels[n.name]) n.rgba = pixels[n.name].data; } }; fill(doc.layers); };
const turretCount = PARTS.filter(n => /^turret\d+$/.test(n)).length;
const doc = templateDocument(S, { turrets: turretCount });
fillWith(doc, new Set(TANK_PARTS));
const psdFile = path.join(here, `${SKIN.id}.psd`);
fs.writeFileSync(psdFile, buildPsd({ ...doc, rle: true }));

const fxNames = new Set([...Object.keys(FX_SVG_EFFECTS), ...FX_BLENDER_EFFECTS]);
const sceneNames = new Set([...Object.keys(FX_SVG_SCENE), ...FX_BLENDER_SCENE]);
const effectsDoc = effectsDocument(S);
fillWith(effectsDoc, fxNames);
const effectsPsd = path.join(here, `${SKIN.id}-effects.psd`);
fs.writeFileSync(effectsPsd, buildPsd({ ...effectsDoc, rle: true }));
const sceneDoc = sceneDocument(S);
fillWith(sceneDoc, sceneNames);
const scenePsd = path.join(here, `${SKIN.id}-scene.psd`);
fs.writeFileSync(scenePsd, buildPsd({ ...sceneDoc, rle: true, rleComposite: true }));

// ---- 4. export through the supported tool, from the PSD files themselves ----
const exported = exportPsd(fs.readFileSync(psdFile), { id: SKIN.id, name: SKIN.name, author: SKIN.author, version: SKIN.version, tint: 'none', laser: LASER.colour, laserGlow: LASER.glow });
for (const file of [scenePsd, effectsPsd]) { const part = exportPsd(fs.readFileSync(file)); exported.files.push(...part.files); exported.messages.push(...part.messages); }
const skinDir = path.join(here, 'skin');
fs.rmSync(skinDir, { recursive: true, force: true });
fs.mkdirSync(skinDir, { recursive: true });
for (const file of exported.files) fs.writeFileSync(path.join(skinDir, file.name), file.png);
fs.writeFileSync(path.join(skinDir, 'skin.json'), JSON.stringify(exported.skinJson, null, 2) + '\n');
for (const m of exported.messages) console.log(`${m.level}: ${m.text}`);

// ---- 5. validate exactly as the extension's importer will ----
const report = analysePackage({ json: fs.readFileSync(path.join(skinDir, 'skin.json'), 'utf8'), pngs: fs.readdirSync(skinDir).filter(n => n.endsWith('.png')).map(name => ({ name, bytes: new Uint8Array(fs.readFileSync(path.join(skinDir, name))) })) });
if (!report.ok) { console.error(report.errors); process.exit(1); }
const check = readPsd(fs.readFileSync(psdFile));
console.log(`PSD ${check.width}x${check.height}, ${check.layers.length} layers; skin/: ${report.frames.length} frames at ${report.scale}x, tint ${JSON.stringify(report.meta.tint)}`);
for (const w of report.warnings) console.log('warning:', w);
console.log('ok');
