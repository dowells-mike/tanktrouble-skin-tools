// Turns the artwork layers of a layered PSD (made from the template) into correctly sized transparent PNGs for Skin Tools.
//   node skins/tools/psd-export.mjs my-skin.psd [--out my-skin] [--scale 1|2|4] [--id my-skin --name "My Skin" [--tint none|player]]
// Every layer that is NOT inside a group whose name starts with "GUIDES" and whose name is a frame name
// (base, tread, treadShade0-11, turret0-16) is cropped to that frame's canvas at the position the template defines.
// With --id a skin.json is written too. Prints every problem; exits non-zero if nothing could be exported.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { readPsd } = require('./psd/psd-reader.js');
const { DOC, frameRect, EFFECT_DOC, effectRect, SCENE_DOC, sceneRect, SCENE_ORDER } = require('./psd/layout.js');
const { encodePng } = require('./png.js');
const { downsample, visibleFraction } = require('../../extension/src/resample.js');
const { SPECS, REQUIRED, RECOMMENDED, ALL_SPECS, EFFECT_NAMES, EFFECTS } = require('../../extension/src/frames.js');
const WEAPON_NAMES = EFFECT_NAMES.filter(n => ['projectile', 'missile', 'mine', 'shrapnel'].includes(EFFECTS[n].pool));

/** @returns {{files:{name:string,png:Buffer}[], skinJson:object|null, messages:{level:string,text:string}[], docScale:number, scale:number}} */
export function exportPsd(buffer, options = {}) {
  const messages = [];
  const say = (level, text) => messages.push({ level, text });
  const psd = readPsd(buffer);
  // two templates: the tank (140x180 units) and the weapon visuals (200x110 units); the document size says which one this is
  let kind = null, docScale = 0, doc = null;
  for (const [k, d] of [['tank', DOC], ['effects', EFFECT_DOC], ['scene', SCENE_DOC]]) {
    const scale = psd.width / d.w;
    if ([1, 2, 4].includes(scale) && psd.height === d.h * scale) { kind = k; docScale = scale; doc = d; }
  }
  if (!kind) {
    throw new Error(`the document is ${psd.width}x${psd.height}px; the tank template is ${DOC.w * 4}x${DOC.h * 4} and the weapon-visuals template is ${EFFECT_DOC.w * 4}x${EFFECT_DOC.h * 4} and the scene-visuals template is ${SCENE_DOC.w * 4}x${SCENE_DOC.h * 4} (or 1/2 or 1/4 of those). Do not resize or crop the canvas; if you resampled the whole image, keep the proportions exactly.`);
  }
  const rectOf = kind === 'effects' ? effectRect : kind === 'scene' ? sceneRect : frameRect;
  const validName = n => (kind === 'effects' ? WEAPON_NAMES.includes(n) : kind === 'scene' ? SCENE_ORDER.includes(n) : Boolean(SPECS[n]));
  const scale = options.scale || docScale;
  if (![1, 2, 4].includes(scale) || scale > docScale) throw new Error(`--scale ${scale} is not possible from a ${docScale}x document (choose 1, 2 or 4, not above ${docScale})`);

  const seen = new Map();
  const files = [];
  for (const layer of psd.layers) {
    if (layer.isGroup) continue;
    if (layer.path.some(p => /^GUIDES|^REFERENCE/i.test(p))) continue;
    const name = layer.name.trim();
    if (!validName(name)) { say('info', `skipped layer "${layer.name}" (not a ${kind === 'tank' ? 'tank' : kind + '-template'} frame name)`); continue; }
    if (seen.has(name)) throw new Error(`two layers are named "${name}"; each frame needs exactly one layer`);
    seen.set(name, layer);
    if (!layer.rgba) { say('info', `${name}: empty layer, not exported`); continue; }
    if (layer.opacity < 255) say('warn', `${name}: layer opacity is ${Math.round(layer.opacity / 2.55)}%; the export ignores layer opacity, so set it to 100% (or merge it) first`);
    if (layer.blend !== 'norm') say('warn', `${name}: blend mode "${layer.blend}" is ignored by the export; use Normal`);
    const rect = rectOf(name);
    const w = rect.w * docScale, h = rect.h * docScale, x0 = rect.x * docScale, y0 = rect.y * docScale;
    const canvas = new Uint8ClampedArray(w * h * 4);
    let outside = 0;
    for (let y = 0; y < layer.height; y++) for (let x = 0; x < layer.width; x++) {
      const s = (y * layer.width + x) * 4;
      if (!layer.rgba[s + 3]) continue;
      const dx = layer.left + x - x0, dy = layer.top + y - y0;
      if (dx < 0 || dy < 0 || dx >= w || dy >= h) { outside++; continue; }
      canvas.set(layer.rgba.subarray(s, s + 4), (dy * w + dx) * 4);
    }
    if (outside) say('warn', `${name}: ${outside} painted pixels lie outside the ${rect.w}x${rect.h} canvas and were cut off`);
    if (visibleFraction(canvas) === 0) { say('info', `${name}: nothing painted inside the canvas, not exported`); continue; }
    let data = canvas, ow = w, oh = h;
    if (scale < docScale) { const r = downsample(canvas, w, h, docScale / scale); data = r.data; ow = r.width; oh = r.height; }
    files.push({ name: `${name}.png`, png: encodePng(ow, oh, data), width: ow, height: oh });
  }
  const have = new Set(files.map(f => f.name.replace(/\.png$/, '')));
  if (kind === 'tank') for (const need of REQUIRED) if (!have.has(need)) say('warn', `${need}.png is required by Skin Tools but there is no painted "${need}" layer`);
  if (kind === 'tank') for (const want of RECOMMENDED) if (!have.has(want)) say('info', `${want}.png is recommended (recoil frame of the default gun)`);
  const shades = [...have].filter(n => n.startsWith('treadShade')).length;
  if (shades && shades < 12) say('warn', `treadShade frames must be all 12 or none (${shades} painted)`);

  let skinJson = null;
  if (options.id) {
    const tint = options.tint || 'none';
    skinJson = { schema: 1, id: options.id, name: options.name || options.id, author: options.author || '', version: options.version || '1.0.0', tint: { base: tint, tread: tint, turret: tint }, pixelScale: scale, ...(options.laser ? { laser: { colour: options.laser, glow: options.laserGlow !== false } } : {}) };
  }
  return { files, skinJson, messages, docScale, scale, kind };
}

const invoked = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invoked) {
  const args = process.argv.slice(2);
  const opt = key => { const i = args.indexOf(key); return i >= 0 ? args[i + 1] : undefined; };
  const input = args.find(a => !a.startsWith('--') && a !== opt('--out') && a !== opt('--scale') && a !== opt('--id') && a !== opt('--name') && a !== opt('--tint') && a !== opt('--author') && a !== opt('--laser'));
  if (!input) { console.error('usage: node psd-export.mjs file.psd [--out dir] [--scale 1|2|4] [--id skin-id --name "Name" [--tint none|player] [--laser "#ff2f40"]]   (run it again with the weapon-visuals PSD and the same --out)'); process.exit(2); }
  try {
    const out = path.resolve(opt('--out') || path.join(path.dirname(input), path.basename(input, path.extname(input)) + '-png'));
    const result = exportPsd(fs.readFileSync(input), { scale: opt('--scale') ? Number(opt('--scale')) : undefined, id: opt('--id'), name: opt('--name'), tint: opt('--tint'), author: opt('--author'), laser: opt('--laser') });
    for (const m of result.messages) console.log(`${m.level === 'warn' ? 'WARN ' : 'note '} ${m.text}`);
    if (!result.files.length) { console.error('Nothing painted: no PNGs written.'); process.exit(1); }
    fs.mkdirSync(out, { recursive: true });
    for (const f of result.files) { fs.writeFileSync(path.join(out, f.name), f.png); console.log(`wrote ${f.name}  ${f.width}x${f.height}`); }
    if (result.skinJson) { fs.writeFileSync(path.join(out, 'skin.json'), JSON.stringify(result.skinJson, null, 2) + '\n'); console.log('wrote skin.json'); }
    console.log(`\n${result.files.length} PNG(s) in ${out} (document ${result.docScale}x, exported at ${result.scale}x). Choose the whole folder in the Skin Tools panel.`);
  } catch (error) { console.error(`ERROR: ${error.message}`); process.exit(1); }
}
