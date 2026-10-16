// Builds the layered Photoshop template: templates/tanktrouble-skin-template-<N>x.psd
//   node skins/tools/make-psd-template.mjs [--scale 4|2|1]
// One document, the whole tank in tank space. Guides (locked, red group) are separate from the artwork groups
// (green group) that tools/psd-export.mjs turns into PNGs. Geometry only: no game art.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url));
const { Raster, COLOURS } = require('./raster.js');
const { buildPsd } = require('./psd/psd-writer.js');
const { DOC, frameRect, rightTreadRect, EFFECT_DOC, effectRect, SCENE_DOC, sceneRect, SCENE_ORDER } = require('./psd/layout.js');
const { SPECS, GEOMETRY } = require('../../extension/src/frames.js');

/** The template document (layers tree, guides, size) at scale S (1, 2 or 4). Art layers are blank unless the caller fills them. */
export function templateDocument(S, { turrets = 3 } = {}) {
  const W = DOC.w * S, H = DOC.h * S;
  const { cx, cy } = DOC;

  /** Draw on a document-sized raster, then keep only the bounding box of what was drawn. */
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

  /** An empty (fully transparent) artwork layer covering exactly one frame's canvas. */
  function art(name, visible = true) {
    const rect = frameRect(name);
    return { type: 'layer', name, left: rect.x * S, top: rect.y * S, width: rect.w * S, height: rect.h * S, rgba: new Uint8Array(rect.w * rect.h * S * S * 4), visible };
  }

  const hb = GEOMETRY.hitbox, bb = GEOMETRY.barrelHitbox;
  const layers = [
    {
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
    },
    {
      type: 'group', name: 'ART - export these layers', color: 'green', children: [
        { type: 'group', name: turrets > 3 ? 'Turret (turret0 idle, turret1-' + (turrets - 1) + ' recoil and weapon frames)' : 'Turret (turret0 idle, turret1 and turret2 recoil)', color: 'green', children: Array.from({ length: turrets }, (_, i) => art('turret' + (turrets - 1 - i), turrets - 1 - i === 0)) },
        { type: 'group', name: 'Treads (paint at the left position; the game reuses it for the right)', color: 'green', children: [art('tread')] },
        { type: 'group', name: 'Body', color: 'green', children: [art('base')] }
      ]
    }
  ];
  for (const group of layers[0].children) for (const layer of group.children) layer.lock = true;


  return { width: W, height: H, layers, guides: { vertical: [cx * S], horizontal: [cy * S, (cy + GEOMETRY.muzzleY) * S] } };
}

/** The scene-visuals template (explosions, smoke, dust, puffs, shield, bolts, sparks, fragments, crates), shelf-packed. */
export function sceneDocument(S) {
  const W = SCENE_DOC.w * S, H = SCENE_DOC.h * S;
  const boxGuide = (name, draw) => {
    const r = new Raster(SCENE_DOC.w, SCENE_DOC.h, S);
    draw(r);
    return { type: 'layer', name, left: 0, top: 0, width: W, height: H, rgba: r.data, lock: true };
  };
  const art = name => { const q = sceneRect(name); return { type: 'layer', name, left: q.x * S, top: q.y * S, width: q.w * S, height: q.h * S, rgba: new Uint8Array(q.w * q.h * S * S * 4) }; };
  const pick = re => SCENE_ORDER.filter(n => re.test(n));
  const group = (name, names) => ({ type: 'group', name, color: 'green', children: [...names].reverse().map(art) });
  const layers = [
    { type: 'group', name: 'GUIDES - do not export', color: 'red', children: [
      boxGuide('canvas edges and centres (all frames; every frame is anchored at its centre, bolts at the bottom centre)', r => { for (const n of SCENE_ORDER) { const q = sceneRect(n); r.rect(q.x + .5, q.y + .5, q.x + q.w - .5, q.y + q.h - .5, COLOURS.canvas); r.cross(q.x + q.w / 2, q.y + q.h / 2, 2, COLOURS.centre); } })
    ] },
    { type: 'group', name: 'ART - export these layers', color: 'green', children: [
      group('Sparks and puffs (shield sparks, bullet-hit puffs)', pick(/^(shieldSpark|puff)/)),
      group('Tank-explosion fragments (fragment0-9; the game tints them with the destroyed tank\'s colours unless the skin is painted)', pick(/^fragment/)),
      group('Crates (standard maze theme: laser, double barrel, shotgun, missile, mine, gatling, shield)', pick(/^crate/)),
      group('Smoke and dust', pick(/^(smoke|dust)/)),
      group('Shield and shield bolts', pick(/^shield(Bolt)?\d*$/).filter(n => !/^shieldSpark/.test(n))),
      group('Explosion puffs', pick(/^explosion/))
    ] }
  ];
  return { width: W, height: H, layers, guides: { vertical: [], horizontal: [] } };
}

/** The weapon-visuals template: one blank layer per frame, laid out on a plain 200x110 sheet, with outline/centre/hit-radius guides. */
export function effectsDocument(S) {
  const W = EFFECT_DOC.w * S, H = EFFECT_DOC.h * S;
  const guide = (name, draw) => {
    const r = new Raster(EFFECT_DOC.w, EFFECT_DOC.h, S);
    draw(r);
    let x0 = W, y0 = H, x1 = -1, y1 = -1;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (r.data[(y * W + x) * 4 + 3]) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    const w = x1 - x0 + 1, h = y1 - y0 + 1;
    const rgba = new Uint8Array(w * h * 4);
    for (let y = 0; y < h; y++) rgba.set(r.data.subarray(((y0 + y) * W + x0) * 4, ((y0 + y) * W + x0 + w) * 4), y * w * 4);
    return { type: 'layer', name, left: x0, top: y0, width: w, height: h, rgba, lock: true };
  };
  const names = ['bullet', 'doubleBarrel', 'shotgun', 'gatlingGun', 'mineShrapnel', 'homingMissile', 'mine', 'mineGlow'];
  const art = name => { const r = effectRect(name); return { type: 'layer', name, left: r.x * S, top: r.y * S, width: r.w * S, height: r.h * S, rgba: new Uint8Array(r.w * r.h * S * S * 4) }; };
  const outline = n => guide('canvas edge: ' + n, r => { const q = effectRect(n); r.rect(q.x + .5, q.y + .5, q.x + q.w - .5, q.y + q.h - .5, COLOURS.canvas); });
  const centre = n => guide('centre: ' + n, r => { const q = effectRect(n); r.cross(q.x + q.w / 2, q.y + q.h / 2, 3, COLOURS.centre); });
  const hit = n => guide('bullet hit radius 5 px: ' + n, r => { const q = effectRect(n); r.circle(q.x + q.w / 2, q.y + q.h / 2, 5, COLOURS.hitbox); });
  const layers = [
    { type: 'group', name: 'GUIDES - do not export', color: 'red', children: [
      { type: 'group', name: 'Hit radius (projectiles: keep the solid core near it)', color: 'red', children: ['bullet', 'doubleBarrel', 'shotgun', 'gatlingGun'].map(hit) },
      { type: 'group', name: 'Centres (every frame is anchored at its centre)', color: 'blue', children: names.map(centre) },
      { type: 'group', name: 'Canvas edges', color: 'blue', children: names.map(outline) }
    ].map(g => ({ ...g, children: g.children.map(c => ({ ...c, lock: true })) })) },
    { type: 'group', name: 'ART - export these layers', color: 'green', children: [
      { type: 'group', name: 'Shrapnel (mine fragments, spin)', color: 'green', children: [art('mineShrapnel')] },
      { type: 'group', name: 'Mine glow (pulses on top of the mine)', color: 'green', children: [art('mineGlow')] },
      { type: 'group', name: 'Mine (dropped; the game tints it with the owner turret colour unless the skin is painted)', color: 'green', children: [art('mine')] },
      { type: 'group', name: 'Homing missile (points up; rotated by the game)', color: 'green', children: [art('homingMissile')] },
      { type: 'group', name: 'Projectiles (bullet, double barrel, shotgun, gatling)', color: 'green', children: ['gatlingGun', 'shotgun', 'doubleBarrel', 'bullet'].map(art) }
    ] }
  ];
  return { width: W, height: H, layers, guides: { vertical: [], horizontal: [] } };
}

const invoked = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invoked) {
  const arg = process.argv.indexOf('--scale');
  const S = arg > 0 ? Number(process.argv[arg + 1]) : 4;
  if (![1, 2, 4].includes(S)) { console.error('--scale must be 1, 2 or 4'); process.exit(2); }
  const kindArg = process.argv.includes('--kind') ? process.argv[process.argv.indexOf('--kind') + 1] : 'tank';
  const effects = kindArg === 'effects', scene = kindArg === 'scene';
  const doc = effects ? effectsDocument(S) : scene ? sceneDocument(S) : templateDocument(S);
  const psd = buildPsd({ ...doc, rle: true, rleComposite: scene });
  const out = path.join(here, '..', 'templates', `tanktrouble-${effects ? 'effects' : scene ? 'scene' : 'skin'}-template-${S}x.psd`);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, psd);
  console.log(`wrote ${path.relative(process.cwd(), out)}  ${doc.width}x${doc.height}px  ${(psd.length / 1024).toFixed(0)} KB  (${Object.keys(SPECS).length} frame specs)`);
}
