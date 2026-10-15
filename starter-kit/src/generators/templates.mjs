// Generates the starter kit's blank templates: transparent PNGs with the exact canvas sizes (plus a copy with guide lines on),
// a whole-tank reference picture, and the layered PSD. Geometry only: every number comes from extension/src/frames.js, the same
// table the importer checks files against, so the templates cannot drift from what Skin Tools accepts. The grey SILHOUETTE guides (the familiar
// white TankTrouble tank's shapes) are drawn from the kit's own example artwork, the Classic Tank; no game artwork is read.
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const require = createRequire(import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url));
const frames = require(path.join(here, '..', '..', '..', 'extension', 'src', 'frames.js'));
const { Raster, COLOURS } = require('./raster.js');
const { buildPsd } = require('./psd-writer.js');
const { DOC, frameRect, rightTreadRect } = require('../artist-tools/lib/layout.js')(frames);
const { SPECS, GEOMETRY } = frames;
const { resize } = require('../artist-tools/lib/atlas.js');
const { downsample } = require('../artist-tools/lib/resample.js');

/** A picture of the example skin (stored at 2x) at 1x, 2x or 4x. `art` = { frameName: { width, height, data } }. */
function artAt(art, name, scale) {
  const p = art[name];
  if (!p) throw new Error(`the example skin has no picture "${name}"`);
  if (scale === 2) return p;
  if (scale === 1) { const r = downsample(p.data, p.width, p.height, 2); return { width: r.width, height: r.height, data: r.data }; }
  return { width: p.width * 2, height: p.height * 2, data: resize(p.data, p.width, p.height, p.width * 2, p.height * 2, 'smooth') };
}
/** Draws the edge of a picture (its outermost solid pixels) onto a guide raster in the silhouette colour. */
function drawSilhouette(r, image) {
  if (image.width !== r.w || image.height !== r.h) throw new Error(`silhouette is ${image.width}x${image.height} but the guide is ${r.w}x${r.h}`);
  const solid = (x, y) => x >= 0 && y >= 0 && x < image.width && y < image.height && image.data[(y * image.width + x) * 4 + 3] >= 128;
  for (let y = 0; y < image.height; y++) for (let x = 0; x < image.width; x++) {
    if (solid(x, y) && !(solid(x - 1, y) && solid(x + 1, y) && solid(x, y - 1) && solid(x, y + 1))) {
      r.data.set(COLOURS.silhouette, (y * r.w + x) * 4);
      if (r.n >= 4) { if (x + 1 < r.w) r.data.set(COLOURS.silhouette, (y * r.w + x + 1) * 4); if (y + 1 < r.h) r.data.set(COLOURS.silhouette, ((y + 1) * r.w + x) * 4); }      // 2 px lines at 4x so they stay visible
    }
  }
}
const FRAME_OF_PART = { base: 'base', tread: 'tread', turret: 'turret0' };

export const SCALES = [1, 2, 4];
export const PARTS = ['base', 'tread', 'turret'];

const partInfo = {
  base: { ...SPECS.base, cx: GEOMETRY.centreInCanvas.base[0], cy: GEOMETRY.centreInCanvas.base[1] },
  tread: { ...SPECS.tread, cx: null, cy: null },
  turret: { ...SPECS.turret0, cx: GEOMETRY.centreInCanvas.turret[0], cy: GEOMETRY.centreInCanvas.turret[1] }
};

function commonGuides(r, w, h) {
  r.rect(0.5, 0.5, w - 0.5, h - 0.5, COLOURS.canvas);
  r.rect(1.5, 1.5, w - 1.5, h - 1.5, COLOURS.margin, true);
}

/** Draw only the part of a rectangle outline that lies inside the canvas (an edge outside is simply not drawn). */
function clipRect(r, x0, y0, x1, y1, w, h, colour, dashed) {
  const L = Math.max(x0, 0.5), R = Math.min(x1, w - 0.5), T = Math.max(y0, 0.5), B = Math.min(y1, h - 0.5);
  if (x0 >= 0.5) r.vline(x0, T, B, colour, dashed);
  if (x1 <= w - 0.5) r.vline(x1, T, B, colour, dashed);
  if (y0 >= 0.5) r.hline(y0, L, R, colour, dashed);
  if (y1 <= h - 0.5) r.hline(y1, L, R, colour, dashed);
}

function guidesFor(part, scale, silhouette = null) {
  const { w, h } = partInfo[part];
  const r = new Raster(w, h, scale);
  commonGuides(r, w, h);
  const hb = GEOMETRY.hitbox;
  if (part === 'base') {
    const { cx, cy } = partInfo.base;
    r.rect(cx - hb.w / 2, cy - hb.h / 2, cx + hb.w / 2, cy + hb.h / 2, COLOURS.hitbox);
    for (const sign of [-1, 1]) { const mid = cx + sign * GEOMETRY.treadX; r.rect(mid - 6, cy - 40, mid + 6, cy + 40, COLOURS.tread, true); }
    r.vline(cx, 0, h, [0, 90, 255, 110], true); r.hline(cy, 0, w, [0, 90, 255, 110], true);
    r.cross(cx, cy, 4, COLOURS.centre);
    r.arrowUp(cx, 5, COLOURS.forward);
  } else if (part === 'tread') {
    r.vline(6, 0, h, [0, 90, 255, 110], true); r.hline(40, 0, w, [0, 90, 255, 110], true);
    r.cross(6, 40, 3, COLOURS.centre);
    r.vline(2, 0, h, COLOURS.hitbox, true); r.vline(10, 0, h, COLOURS.hitbox, true);
    r.arrowUp(6, 3, COLOURS.forward, 3);
  } else {
    const { cx, cy } = partInfo.turret;
    clipRect(r, cx - hb.w / 2, cy - hb.h / 2, cx + hb.w / 2, cy + hb.h / 2, w, h, COLOURS.hitbox);
    const bb = GEOMETRY.barrelHitbox;
    r.rect(cx - bb.w / 2, cy + bb.centreY - bb.h / 2, cx + bb.w / 2, cy + bb.centreY + bb.h / 2, COLOURS.barrel);
    for (const sign of [-1, 1]) { const mid = cx + sign * GEOMETRY.treadX; clipRect(r, mid - 6, cy - 40, mid + 6, cy + 40, w, h, COLOURS.tread, true); }
    r.cross(w / 2, h / 2, 2, COLOURS.part);
    r.cross(cx, cy, 4, COLOURS.centre);
    const my = cy + GEOMETRY.muzzleY;
    r.cross(cx, my, 3, COLOURS.muzzle); r.circle(cx, my, 3, COLOURS.muzzle);
    r.arrowUp(60, 5, COLOURS.forward);
  }
  if (silhouette) drawSilhouette(r, silhouette);      // last, so the classic tank's outline is never hidden by a guide line
  return r;
}

/** One picture of the whole assembly in tank space: where every canvas sits relative to the tank centre. */
function assembled(scale) {
  const W = 140, H = 180, ox = W / 2, oy = H / 2 + 8;
  const r = new Raster(W, H, scale);
  r.rect(0.5, 0.5, W - 0.5, H - 0.5, [90, 90, 90, 255]);
  const place = (cw, ch, cx, cy, colour, dashed) => r.rect(ox + cx - cw / 2, oy + cy - ch / 2, ox + cx + cw / 2, oy + cy + ch / 2, colour, dashed);
  place(SPECS.base.w, SPECS.base.h, 0, 0, COLOURS.part);
  for (const sign of [-1, 1]) place(SPECS.tread.w, SPECS.tread.h, sign * GEOMETRY.treadX, 0, COLOURS.tread);
  place(SPECS.turret0.w, SPECS.turret0.h, 0, GEOMETRY.turretY, COLOURS.turretCanvas);
  r.rect(ox - 30, oy - 40, ox + 30, oy + 40, COLOURS.hitbox);
  r.rect(ox - 7, oy - 54, ox + 7, oy - 26, COLOURS.barrel);
  r.cross(ox, oy, 5, COLOURS.centre);
  r.cross(ox, oy + GEOMETRY.muzzleY, 3, COLOURS.muzzle); r.circle(ox, oy + GEOMETRY.muzzleY, 3, COLOURS.muzzle);
  r.arrowUp(ox, 6, COLOURS.forward, 6);
  return r;
}

/** @returns {{ path: string, data: Buffer, width: number, height: number, kind: string }[]}  paths relative to the templates folder */
export function pngTemplates({ art } = {}) {
  const out = [];
  for (const scale of SCALES) {
    for (const part of PARTS) {
      const { w, h } = partInfo[part];
      const silhouette = art ? artAt(art, FRAME_OF_PART[part], scale) : null;
      for (const [kind, raster] of [['blank', new Raster(w, h, scale)], ['guides', guidesFor(part, scale, silhouette)]]) {
        out.push({ path: `${kind === 'blank' ? 'blank' : 'guides'}/${part}_${scale}x.png`, data: raster.png(), width: raster.w, height: raster.h, kind, part, scale });
      }
    }
    const ref = assembled(scale);
    out.push({ path: `guides/whole-tank_${scale}x.png`, data: ref.png(), width: ref.w, height: ref.h, kind: 'reference', part: 'assembled', scale });
  }
  // one shape guide per picture (4x): the guide lines plus the outline of THAT picture of the classic tank (every turret frame), to trace or compare against
  if (art) {
    for (const name of ['base', 'tread', ...Array.from({ length: 17 }, (_, i) => `turret${i}`)]) {
      const part = name.startsWith('turret') ? 'turret' : name;
      const { w, h } = partInfo[part];
      const raster = guidesFor(part, 4, artAt(art, name, 4));
      out.push({ path: `shape-guides/${name}_4x.png`, data: raster.png(), width: raster.w, height: raster.h, kind: 'shape', part: name, scale: 4, w, h });
    }
  }
  return out;
}

/** The layered template: guides (locked) above art layers, one empty layer per frame, exactly the canvas of that frame. */
export function psdDocument(S, { turrets = 17, shades = 12, art: classic = null } = {}) {
  const W = DOC.w * S, H = DOC.h * S;
  const { cx, cy } = DOC;
  function guide(name, draw) {
    const r = new Raster(DOC.w, DOC.h, S);
    draw(r);
    let x0 = W, y0 = H, x1 = -1, y1 = -1;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (r.data[(y * W + x) * 4 + 3]) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    if (x1 < 0) throw new Error(`guide "${name}" is empty`);
    const w = x1 - x0 + 1, h = y1 - y0 + 1;
    const rgba = new Uint8Array(w * h * 4);
    for (let y = 0; y < h; y++) rgba.set(r.data.subarray(((y0 + y) * W + x0) * 4, ((y0 + y) * W + x0 + w) * 4), y * w * 4);
    return { type: 'layer', name, left: x0, top: y0, width: w, height: h, rgba, lock: true };
  }
  const rectOf = (r, rect, colour, dashed) => r.rect(rect.x, rect.y, rect.x + rect.w, rect.y + rect.h, colour, dashed);
  const art = (name, visible = true) => {
    const rect = frameRect(name);
    return { type: 'layer', name, left: rect.x * S, top: rect.y * S, width: rect.w * S, height: rect.h * S, rgba: new Uint8Array(rect.w * rect.h * S * S * 4), visible };
  };
  const hb = GEOMETRY.hitbox, bb = GEOMETRY.barrelHitbox;
  const guides = {
    type: 'group', name: 'GUIDES - do not export', color: 'red', children: [
      { type: 'group', name: 'Muzzle position', color: 'green', children: [
        guide('muzzle: shots start 50 px ahead of the centre', r => { const y = cy + GEOMETRY.muzzleY; r.cross(cx, y, 4, COLOURS.muzzle); r.circle(cx, y, 3, COLOURS.muzzle); })
      ] },
      { type: 'group', name: 'Hitbox guides', color: 'red', children: [
        guide('barrel hitbox 14x28 at y-40', r => r.rect(cx - bb.w / 2, cy + bb.centreY - bb.h / 2, cx + bb.w / 2, cy + bb.centreY + bb.h / 2, COLOURS.barrel)),
        guide('tank hitbox 60x80', r => r.rect(cx - hb.w / 2, cy - hb.h / 2, cx + hb.w / 2, cy + hb.h / 2, COLOURS.hitbox))
      ] },
      { type: 'group', name: 'Right tread position', color: 'green', children: [
        guide('right tread 12x80 at x+26 (same image as the left, not mirrored)', r => rectOf(r, rightTreadRect(), COLOURS.tread, true))
      ] },
      { type: 'group', name: 'Left tread position', color: 'green', children: [
        guide('left tread 12x80 at x-26 (paint the tread here)', r => rectOf(r, frameRect('tread'), COLOURS.tread, true))
      ] },
      { type: 'group', name: 'Alignment reference', color: 'blue', children: [
        guide('forward is up', r => r.arrowUp(cx, 6, COLOURS.forward, 6)),
        guide('canvas edge: turret 68x82 (centre is 16 px above the tank centre)', r => rectOf(r, frameRect('turret0'), COLOURS.turretCanvas)),
        guide('canvas edge: body 68x84', r => rectOf(r, frameRect('base'), COLOURS.canvas)),
        guide('tank centre and rotation pivot', r => { r.vline(cx, 0, DOC.h, [0, 90, 255, 110], true); r.hline(cy, 0, DOC.w, [0, 90, 255, 110], true); r.cross(cx, cy, 5, COLOURS.centre); })
      ] }
    ]
  };
  for (const group of guides.children) for (const layer of group.children) layer.lock = true;
  const turretLayers = Array.from({ length: turrets }, (_, i) => art('turret' + (turrets - 1 - i), turrets - 1 - i === 0));
  const shadeLayers = Array.from({ length: shades }, (_, i) => art('treadShade' + (shades - 1 - i), false));
  /** The classic tank as a faint, locked tracing layer (40%): never exported (the exporter skips REFERENCE groups). */
  const reference = (label, name, rect, visible) => {
    const p = artAt(classic, name, S);
    const rgba = new Uint8Array(p.data.length);
    for (let i = 0; i < p.data.length; i += 4) { rgba[i] = p.data[i]; rgba[i + 1] = p.data[i + 1]; rgba[i + 2] = p.data[i + 2]; rgba[i + 3] = Math.round(p.data[i + 3] * 0.4); }
    return { type: 'layer', name: label, left: rect.x * S, top: rect.y * S, width: p.width, height: p.height, rgba, lock: true, visible };
  };
  const children = [
    { type: 'group', name: 'Turret (turret0 idle, turret1-2 recoil, turret3-16 the other weapons)', color: 'green', children: turretLayers }
  ];
  if (shades) children.push({ type: 'group', name: 'Tread shade overlays (optional: all 12 or none; the pattern moves UP as the number rises)', color: 'green', children: shadeLayers });
  children.push(
    { type: 'group', name: 'Treads (paint at the left position; the game reuses it for the right)', color: 'green', children: [art('tread')] },
    { type: 'group', name: 'Body', color: 'green', children: [art('base')] }
  );
  const layers = [guides, { type: 'group', name: 'ART - export these layers', color: 'green', children }];
  if (classic) {
    const turretRefs = Array.from({ length: 17 }, (_, i) => reference(`turret${i} of the classic tank (switch on to trace)`, `turret${i}`, frameRect('turret0'), i === 0)).reverse();
    layers.push({ type: 'group', name: 'REFERENCE - the classic white tank, 40% (not exported)', color: 'blue', children: [
      { type: 'group', name: 'Classic tank turrets (only turret0 is visible)', color: 'blue', children: turretRefs },
      { type: 'group', name: 'Classic tank treads', color: 'blue', children: [reference('right tread of the classic tank', 'tread', rightTreadRect(), true), reference('left tread of the classic tank', 'tread', frameRect('tread'), true)] },
      { type: 'group', name: 'Classic tank body', color: 'blue', children: [reference('body of the classic tank', 'base', frameRect('base'), true)] }
    ] });
  }
  return { width: W, height: H, layers, guides: { vertical: [cx * S], horizontal: [cy * S, (cy + GEOMETRY.muzzleY) * S] } };
}

export function psdTemplate(S, art = null) {
  return buildPsd({ ...psdDocument(S, { art }), rle: true });
}

export { buildPsd };
