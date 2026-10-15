// Where each exportable frame sits inside the layered template document (1x units; the document is DOC * scale pixels).
// Tank space -> document: the tank centre is at (DOC.cx, DOC.cy). Geometry comes from src/frames.js (confirmed on the live atlas).
'use strict';
// Takes the frame table (frames.js) as an argument, so the same file works in the repository and inside the kit: require('./layout.js')(frames)
module.exports = function layoutFor({ SPECS, GEOMETRY, EFFECTS }) {

const DOC = Object.freeze({ w: 140, h: 180, cx: 70, cy: 98 });

/** Rectangle (1x doc units) of a frame's canvas as the game places it. Treads: the LEFT tread position. */
function frameRect(name) {
  const spec = SPECS[name];
  if (!spec) throw new Error(`unknown frame ${name}`);
  if (name === 'base') return { x: DOC.cx - spec.w / 2, y: DOC.cy - spec.h / 2, w: spec.w, h: spec.h };
  if (name === 'tread' || name.startsWith('treadShade')) return { x: DOC.cx - GEOMETRY.treadX - spec.w / 2, y: DOC.cy - spec.h / 2, w: spec.w, h: spec.h };
  return { x: DOC.cx - spec.w / 2, y: DOC.cy + GEOMETRY.turretY - spec.h / 2, w: spec.w, h: spec.h };   // turretN
}
const rightTreadRect = () => ({ ...frameRect('tread'), x: DOC.cx + GEOMETRY.treadX - SPECS.tread.w / 2 });

/** The weapon-visuals document: one canvas per frame on a plain layout (1x units). */
const EFFECT_DOC = Object.freeze({ w: 200, h: 110 });
const EFFECT_POS = { bullet: [10, 10], doubleBarrel: [40, 10], shotgun: [70, 10], gatlingGun: [90, 10], mineShrapnel: [110, 10], homingMissile: [10, 46], mine: [60, 40], mineGlow: [130, 44] };
function effectRect(name) {
  const e = EFFECTS[name];
  if (!e) throw new Error('unknown effect frame ' + name);
  return { x: EFFECT_POS[name][0], y: EFFECT_POS[name][1], w: e.w, h: e.h };
}

/** The scene-visuals document (explosions, smoke, dust, puffs, shield, bolts, sparks, fragments, crates): a shelf-packed sheet, 10 px gaps. */
const SCENE_ORDER = ['explosion0', 'explosion1', 'explosion2', 'shield', 'shieldBolt0', 'shieldBolt1', 'shieldBolt2', 'dust0', 'dust1', 'dust2', 'smoke0', 'smoke1', 'smoke2',
  ...Array.from({ length: 7 }, (_, i) => 'crate0-' + i), ...Array.from({ length: 10 }, (_, i) => 'fragment' + i), 'shieldSpark', 'shieldSparkBolt0', 'shieldSparkBolt1', 'shieldSparkBolt2', 'puff0', 'puff1', 'puff2'];
const SCENE_POS = {};
let sceneH = 0;
{
  const W = 620, GAP = 10;
  let x = GAP, y = GAP, row = 0;
  for (const n of SCENE_ORDER) {
    const e = EFFECTS[n];
    if (x + e.w + GAP > W) { x = GAP; y += row + GAP; row = 0; }
    SCENE_POS[n] = [x, y];
    x += e.w + GAP; row = Math.max(row, e.h);
  }
  sceneH = y + row + GAP;
}
const SCENE_DOC = Object.freeze({ w: 620, h: sceneH });
function sceneRect(name) {
  const e = EFFECTS[name];
  if (!e || !SCENE_POS[name]) throw new Error('unknown scene frame ' + name);
  return { x: SCENE_POS[name][0], y: SCENE_POS[name][1], w: e.w, h: e.h };
}

return { DOC, frameRect, rightTreadRect, EFFECT_DOC, effectRect, SCENE_DOC, sceneRect, SCENE_ORDER };
};
