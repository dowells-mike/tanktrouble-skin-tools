// Silhouette check: a skin's solid pixels against the original game frames (local-only crops of the game's atlas in skins/reference/ or TT_REFERENCE_DIR, never committed)
// Both are brought to a common 12x grid; a pixel is solid when its alpha >= 200 (the soft baked shadows are below that in both).
//   node skins/tools/silhouette.mjs <skin folder> [--out overlay.png]   (frames compared: whichever the skin has)
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url));
const { decodePng, encodePng } = require('./png.js');
const argv = process.argv.slice(2);
const REF_DIR = path.resolve(process.env.TT_REFERENCE_DIR || path.join(here, '..', 'reference'));   // local-only crops of the game's own frames (name_3x.png): never committed or shipped
const dir = path.resolve(argv.find(a => !a.startsWith('--')) || '.');
const outIdx = argv.indexOf('--out');
const parts = ['base', 'tread', ...Array.from({ length: 17 }, (_, i) => 'turret' + i), 'homingMissile', 'mine', 'mineShrapnel'].filter(n => fs.existsSync(path.join(dir, n + '.png')) && fs.existsSync(path.join(REF_DIR, n + '_3x.png')));
const G = 12;                                   // common grid per 1x px

const solid = (img, scale) => {                 // -> {w,h,m} mask on the 12x grid (nearest neighbour)
  const f = G / scale, W = img.width * f, H = img.height * f, m = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) m[y * W + x] = img.data[(Math.floor(y / f) * img.width + Math.floor(x / f)) * 4 + 3] >= 200 ? 1 : 0;
  return { w: W, h: H, m };
};
const bbox = ({ w, h, m }) => { let x0 = w, x1 = -1, y0 = h, y1 = -1; for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (m[y * w + x]) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); } return [x0 / G, y0 / G, (x1 + 1) / G, (y1 + 1) / G]; };

let worst = 1;
const rows = [];
const sheet = [];
for (const n of parts) {
  const o = solid(decodePng(fs.readFileSync(path.join(REF_DIR, n + '_3x.png'))), 3);
  const g = solid(decodePng(fs.readFileSync(path.join(dir, n + '.png'))), 4);
  if (o.w !== g.w || o.h !== g.h) throw new Error(`${n}: grids differ`);
  let inter = 0, uni = 0, onlyO = 0, onlyG = 0;
  const ov = new Uint8Array(o.w * o.h * 4);
  for (let i = 0; i < o.m.length; i++) {
    const a = o.m[i], b = g.m[i];
    inter += a & b; uni += a | b; onlyO += a & ~b & 1; onlyG += b & ~a & 1;
    const c = a && b ? [225, 225, 225] : a ? [220, 40, 40] : b ? [40, 90, 220] : [255, 255, 255];
    ov.set([...c, 255], i * 4);
  }
  const iou = inter / uni;
  worst = Math.min(worst, iou);
  const bo = bbox(o), bg = bbox(g);
  rows.push({ part: n, iou: +iou.toFixed(4), original: bo.map(v => +v.toFixed(2)), golden: bg.map(v => +v.toFixed(2)), originalOnly: +(onlyO / G / G).toFixed(1), goldenOnly: +(onlyG / G / G).toFixed(1) });
  sheet.push({ n, w: o.w, h: o.h, ov });
}
console.table(rows.map(r => ({ part: r.part, 'IoU': r.iou, 'bbox original (x0,y0,x1,y1 px)': r.original.join(' '), 'bbox 3d': r.golden.join(' '), 'px only original': r.originalOnly, 'px only 3d': r.goldenOnly })));
console.log('worst IoU', worst.toFixed(4));
if (outIdx >= 0) {                              // overlay sheet: grey = both, red = only the original, blue = only the 3D Shaders frame
  const gap = 24, W = sheet.reduce((s, p) => s + p.w + gap, gap), H = Math.max(...sheet.map(p => p.h)) + 2 * gap;
  const px = new Uint8Array(W * H * 4).fill(255);
  let ox = gap;
  for (const p of sheet) { for (let y = 0; y < p.h; y++) for (let x = 0; x < p.w; x++) { const s = (y * p.w + x) * 4, d = ((y + gap) * W + ox + x) * 4; px.set(p.ov.subarray(s, s + 4), d); } ox += p.w + gap; }
  fs.writeFileSync(path.resolve(argv[outIdx + 1]), encodePng(W, H, px));
  console.log('wrote', argv[outIdx + 1]);
}
process.exit(worst >= 0.9 ? 0 : 1);
