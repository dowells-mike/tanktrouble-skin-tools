// The "Classic Tank" example skin, drawn as SVG: the plain white TankTrouble tank, redrawn for this kit.
// ORIGINAL ARTWORK: the pictures are drawn from scratch with primitives (circles, rectangles, gradients). Only the DIMENSIONS follow the tank as the
// game draws it (outline width, dome radius, barrel widths and tops, the recoil and weapon variants), measured from the plain white tank in
// Textured Tanks by Kamarov. No pixel of anyone's artwork is copied. make-example-skin.mjs turns each picture into a PNG.
//
// Every picture is drawn on its exact native canvas (body 68x84, tread 12x80, turrets 68x82; the tank centre is pixel (34,42) of the body and
// (34,57) of every turret; the muzzle is pixel (34,7) of a turret). The colours are neutral greys and white so the skin can take each player's
// colour (skin.json tint "player"); the outline is pure black, which stays black under any colour. All coordinates are native pixels.

const svg = (w, h, defs, body) => `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><defs>${defs}</defs>${body}</svg>`;
const BLACK = '#000';
const g = v => `rgb(${v},${v},${v})`;
const rect = (x0, y0, x1, y1, fill, extra = '') => `<rect x="${x0}" y="${y0}" width="${x1 - x0}" height="${y1 - y0}" fill="${fill}"${extra ? ` ${extra}` : ''}/>`;

// --------------------------------------------------------------------------------------------- gradients
/** Soft edge of a barrel or block: grey at the outline fading to white over a few pixels, the same on both sides. */
const NARROW = [146, 189, 221, 243, 253, 255];
const WIDE = [141, 171, 197, 218, 234, 246, 253, 255];
const ROUND = [150, 200, 235, 255];
function hGradient(id, x0, x1, edge = NARROW) {
  const w = x1 - x0;
  const half = edge.map((v, i) => [(i + 0.5) / w, v]);
  const stops = [...half, ...[...half].reverse().map(([o, v]) => [1 - o, v])];
  return `<linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="${x0}" y1="0" x2="${x1}" y2="0">${stops.map(([o, v]) => `<stop offset="${o.toFixed(4)}" stop-color="${g(v)}"/>`).join('')}</linearGradient>`;
}
const DOME_CX = 34, DOME_CY = 56, DOME_R = 24;
/** The dome: white in the middle, grey toward the outline. */
const domeGradient = `<radialGradient id="dome" gradientUnits="userSpaceOnUse" cx="${DOME_CX}" cy="${DOME_CY}" r="${DOME_R - 2}">${[[0.59, 255], [0.636, 253], [0.682, 244], [0.727, 233], [0.773, 220], [0.818, 205], [0.864, 189], [0.909, 172], [0.955, 154], [1, 135]].map(([o, v]) => `<stop offset="${o}" stop-color="${g(v)}"/>`).join('')}</radialGradient>`;
const radial = (id, cx, cy, r, inner = 0.5) => `<radialGradient id="${id}" gradientUnits="userSpaceOnUse" cx="${cx}" cy="${cy}" r="${r}"><stop offset="${inner}" stop-color="#fff"/><stop offset="0.8" stop-color="${g(222)}"/><stop offset="1" stop-color="${g(140)}"/></radialGradient>`;
/** Lets a barrel's own shading flow on into the dome (instead of the dome's rim crossing it): drawn after the dome, faded out over y 34-44. */
const FADE = '<linearGradient id="fadeG" gradientUnits="userSpaceOnUse" x1="0" y1="34" x2="0" y2="44"><stop offset="0" stop-color="#fff"/><stop offset="1" stop-color="#000"/></linearGradient><mask id="fadeM" maskUnits="userSpaceOnUse" x="0" y="0" width="68" height="82"><rect width="68" height="82" fill="url(#fadeG)"/></mask>';
/** A shadow that deepens toward the bottom of a block that sits on a flat-topped dome. */
const SHADOW = '<linearGradient id="shadow" gradientUnits="userSpaceOnUse" x1="0" y1="38" x2="0" y2="46"><stop offset="0" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".36"/></linearGradient>';

// --------------------------------------------------------------------------------------------- body and treads
/** base 68x84: a 2 px black frame, the see-through channels where the treads run (x 4-11 and 56-63), and the white panel between them, darker
 *  toward its top and bottom edge. */
export function base() {
  const defs = `<linearGradient id="panel" gradientUnits="userSpaceOnUse" x1="0" y1="4" x2="0" y2="80"><stop offset="0" stop-color="${g(128)}"/><stop offset="0.15" stop-color="${g(242)}"/><stop offset="0.85" stop-color="${g(242)}"/><stop offset="1" stop-color="${g(128)}"/></linearGradient>`;
  return svg(68, 84, defs, `<path fill="${BLACK}" fill-rule="evenodd" d="M2 2H66V82H2Z M4 4V80H64V4Z"/>${rect(12, 4, 56, 80, 'url(#panel)')}`);
}

/** tread 12x80: one plain light-grey strip (8 x 76). The game draws it twice, left and right, not mirrored. */
export function tread() {
  return svg(12, 80, '', rect(2, 2, 10, 78, g(204)));
}

/** One of the 12 moving-tread overlays: dark bands 7 px tall every 14 px, darker at both ends. The pattern moves UP by 14/12 px per frame as the
 *  number rises (what the game's own frames do), so frame 12 would equal frame 0 and the loop is seamless. */
export function treadShade(n) {
  let bands = '';
  const shift = (n * 14) / 12;
  for (let k = -2; k <= 7; k++) bands += rect(2, 19 - shift + 14 * k, 10, 26 - shift + 14 * k, '#000', 'fill-opacity=".122"');
  const defs = `<clipPath id="c">${rect(2, 2, 10, 78, '#000')}</clipPath>
    <linearGradient id="top" gradientUnits="userSpaceOnUse" x1="0" y1="2" x2="0" y2="12"><stop offset="0" stop-color="#1c1c1c" stop-opacity=".56"/><stop offset="1" stop-color="#000" stop-opacity=".12"/></linearGradient>
    <linearGradient id="bottom" gradientUnits="userSpaceOnUse" x1="0" y1="70" x2="0" y2="78"><stop offset="0" stop-color="#000" stop-opacity=".04"/><stop offset="1" stop-color="#111" stop-opacity=".44"/></linearGradient>`;
  return svg(12, 80, defs, `<g clip-path="url(#c)">${bands}${rect(2, 2, 10, 12, 'url(#top)')}${rect(2, 70, 10, 78, 'url(#bottom)')}</g>`);
}

// --------------------------------------------------------------------------------------------- turret building blocks (canvas 68x82)
/** The dome: a circle of radius 24 centred on the tank's centre (34,56), outline included. `cut` = flat top at y=44 (weapons that sit on a flat dome). */
function dome(cut = false) {
  return {
    defs: domeGradient + (cut ? '<clipPath id="cutOuter"><rect x="0" y="44" width="68" height="40"/></clipPath><clipPath id="cutInner"><rect x="0" y="46" width="68" height="40"/></clipPath>' : ''),
    outer: `<circle cx="${DOME_CX}" cy="${DOME_CY}" r="${DOME_R}" fill="${BLACK}"${cut ? ' clip-path="url(#cutOuter)"' : ''}/>`,
    inner: `<circle cx="${DOME_CX}" cy="${DOME_CY}" r="${DOME_R - 2}" fill="url(#dome)"${cut ? ' clip-path="url(#cutInner)"' : ''}/>`
  };
}
/** A rectangular barrel or block: outer extents (outline included); the inner fill is inset by the 2 px outline. `bottomOuter` is where its outline ends
 *  (the dome takes over); the inner fill runs on to `bottomInner`, so the barrel opens into the dome without a seam. */
function barrel(id, x0, x1, top, { bottomOuter = 36, bottomInner = 46, edge = NARROW } = {}) {
  return { defs: hGradient(id, x0 + 2, x1 - 2, edge) + FADE, outer: rect(x0, top, x1, bottomOuter, BLACK), inner: rect(x0 + 2, top + 2, x1 - 2, bottomInner, `url(#${id})`), blend: rect(x0 + 2, top + 2, x1 - 2, 46, `url(#${id})`, 'mask="url(#fadeM)"') };
}
/** Draws the parts in the right order: every outline first (so overlapping outlines merge into one silhouette), then every inner fill, then details. */
function compose({ defs = [], outers = [], inners = [], tail = '' }) {
  return svg(68, 82, defs.join(''), outers.join('') + inners.join('') + tail);
}
const plain = (b, d) => compose({ defs: [b.defs, d.defs], outers: [d.outer, b.outer], inners: [b.inner, d.inner], tail: b.blend });

// --------------------------------------------------------------------------------------------- turret0-2: the default gun (idle, then the recoil "squash and stretch")
export const turret0 = () => plain(barrel('b', 24, 44, 2), dome());
/** turret1: the barrel has squashed into a flat-topped ball. */
export const turret1 = () => {
  const d = dome();
  const clip = '<clipPath id="ballO"><rect x="0" y="16" width="68" height="40"/></clipPath><clipPath id="ballI"><rect x="0" y="18" width="68" height="40"/></clipPath>';
  return compose({
    defs: [d.defs, clip, FADE, radial('ball', 34, 30, 14, 0.4)],
    outers: [d.outer, `<circle cx="34" cy="28.5" r="15" fill="${BLACK}" clip-path="url(#ballO)"/>`],
    inners: [`<circle cx="34" cy="28.5" r="13" fill="url(#ball)" clip-path="url(#ballI)"/>`, d.inner],
    tail: `<circle cx="34" cy="28.5" r="13" fill="url(#ball)" clip-path="url(#ballI)" mask="url(#fadeM)"/>`
  });
};
/** turret2: the barrel stretches back out, wider in the middle than at the muzzle. */
export const turret2 = () => {
  const d = dome();
  const clip = '<clipPath id="strO"><rect x="0" y="6" width="68" height="40"/></clipPath><clipPath id="strI"><rect x="0" y="8" width="68" height="40"/></clipPath>';
  return compose({
    defs: [d.defs, clip, FADE, hGradient('str', 23, 45)],
    outers: [d.outer, `<g clip-path="url(#strO)"><ellipse cx="34" cy="18" rx="13" ry="18" fill="${BLACK}"/></g>`, rect(21, 18, 47, 36, BLACK)],
    inners: [`<g clip-path="url(#strI)"><ellipse cx="34" cy="18" rx="11" ry="16" fill="url(#str)"/></g>`, rect(23, 18, 45, 46, 'url(#str)'), d.inner],
    tail: `<g clip-path="url(#strI)" mask="url(#fadeM)"><ellipse cx="34" cy="18" rx="11" ry="16" fill="url(#str)"/>${rect(23, 18, 45, 46, 'url(#str)')}</g>`
  });
};

// turret3: the laser: a bowl-shaped lens on the dome with an antenna (the game draws the beam itself)
export const turret3 = () => {
  const d = dome();
  const bowlOuter = `<path fill="${BLACK}" d="M12 14H56V20A22 15 0 0 1 12 20Z"/>`;
  const bowlInner = `<path fill="url(#bowl)" d="M14 16H54V20A20 13 0 0 1 14 20Z"/>`;
  return compose({
    defs: [d.defs, radial('bowl', 34, 18, 22, 0.45)],
    outers: [d.outer, rect(32, 2, 36, 16, BLACK)],
    inners: [d.inner],
    tail: bowlOuter + bowlInner
  });
};

// turret4-8: the double barrel (two barrels side by side), idle and then each barrel recoiling in two steps
function twin(topLeft, topRight) {
  const d = dome(true);
  const left = barrel('l', 16, 36, topLeft, { bottomOuter: 46 }), right = barrel('r', 32, 52, topRight, { bottomOuter: 46 });
  // the inner fills of the two barrels meet at x=34; each has its own soft edge, which makes the groove between them
  const leftInner = rect(18, topLeft + 2, 34, 46, 'url(#l)'), rightInner = rect(34, topRight + 2, 50, 46, 'url(#r)');
  return compose({ defs: [d.defs, left.defs, right.defs, SHADOW], outers: [d.outer, left.outer, right.outer], inners: [d.inner, leftInner, rightInner], tail: rect(18, 38, 50, 46, 'url(#shadow)') });
}
export const turret4 = () => twin(10, 10);
export const turret5 = () => twin(30, 10);    // left barrel fires: pushed back, right one unchanged
export const turret6 = () => twin(16, 10);    // left barrel returning
export const turret7 = () => twin(10, 30);    // right barrel fires
export const turret8 = () => twin(10, 16);    // right barrel returning

// turret9-11: the shotgun: a wide barrel that recoils in two steps
const shotgun = top => plain(barrel('s', 20, 48, top, { bottomOuter: 38, edge: WIDE }), dome());
export const turret9 = () => shotgun(4);
export const turret10 = () => shotgun(14);
export const turret11 = () => shotgun(24);

// turret12: the homing missile in its launcher; turret13: the launcher after it has gone
export const turret12 = () => {
  const d = dome(true);
  const half = [[34, 2], [36, 3.5], [37.5, 7], [38.5, 10], [40, 13], [41, 16], [42, 18], [42, 28], [44, 29.5], [46, 32], [48, 35], [48, 41], [44, 43]];
  const points = [...half, ...[...half].reverse().map(([x, y]) => [68 - x, y])].map(p => p.join(' ')).join(' L');
  const path = `M${points}Z`;
  return compose({
    defs: [d.defs, hGradient('m', 20, 48, WIDE), hGradient('st', 26, 42), `<clipPath id="mc"><path d="${path}"/></clipPath>`, SHADOW],
    outers: [d.outer, rect(24, 40, 44, 46, BLACK)],
    inners: [d.inner, rect(26, 42, 42, 46, 'url(#st)'), `<g clip-path="url(#mc)"><path d="${path}" fill="url(#m)" stroke="${BLACK}" stroke-width="4"/></g>`],
    tail: `<g stroke="${BLACK}" stroke-width="1.4" fill="none" stroke-linecap="round"><path d="M26 29.5L22 34.5M42 29.5L46 34.5"/></g>`
  });
};
export const turret13 = () => {
  const d = dome(true);
  return compose({
    defs: [d.defs, hGradient('st', 26, 42), SHADOW],
    outers: [d.outer, rect(24, 36, 44, 46, BLACK, 'rx="1"')],
    inners: [d.inner, rect(26, 38, 42, 46, 'url(#st)')],
    tail: rect(26, 38, 42, 46, 'url(#shadow)')
  });
};

// turret14: the mine layer: three arms around the hub (one forward, two at the back), as the game draws it
export const turret14 = () => {
  const d = dome();
  const arm = a => `transform="rotate(${a} ${DOME_CX} ${DOME_CY})"`;
  const angles = [0, 120, 240];
  return compose({
    defs: [d.defs, hGradient('arm', 25, 43), radial('hub', 34, 56, 8, 0.2)],
    outers: [d.outer, ...angles.map(a => `<g ${arm(a)}>${rect(23, 26, 45, 56, BLACK)}</g>`)],
    inners: [...angles.map(a => `<g ${arm(a)}>${rect(25, 28, 43, 58, 'url(#arm)')}</g>`), d.inner],
    tail: `<circle cx="${DOME_CX}" cy="${DOME_CY}" r="8" fill="url(#hub)" stroke="${g(110)}" stroke-width="1.2"/>`
  });
};

// turret15-16: the gatling gun: a cap, a ring, a bundle of barrels and a collar; the two frames show the bundle turned a little so they flicker like a spin
function gatling(width, cylinders) {
  const half = width / 2, x0 = 34 - half, x1 = 34 + half;
  const d = dome();
  const defs = [d.defs, hGradient('cap', x0 + 2, x1 - 2), hGradient('ring', 22, 46), hGradient('col', 22, 46), ...cylinders.map(([a, b], i) => hGradient(`c${i}`, a, b, ROUND))];
  return compose({
    defs,
    outers: [d.outer, rect(x0, 2, x1, 8, BLACK), rect(20, 8, 48, 18, BLACK), rect(x0, 18, x1, 32, BLACK), rect(20, 32, 48, 37, BLACK)],
    inners: [rect(x0 + 2, 4, x1 - 2, 8, 'url(#cap)'), rect(22, 10, 46, 16, 'url(#ring)'), ...cylinders.map(([a, b], i) => rect(a, 18, b, 32, `url(#c${i})`)), rect(22, 34, 46, 46, 'url(#col)'), d.inner]
  });
}
export const turret15 = () => gatling(26, [[23, 30], [30, 38], [38, 45]]);
export const turret16 = () => gatling(24, [[24, 28], [28, 36], [36, 44]]);

/** name -> SVG text, for every picture of a complete tank skin. */
export function allFrames() {
  const frames = { base: base(), tread: tread() };
  for (let i = 0; i < 12; i++) frames[`treadShade${i}`] = treadShade(i);
  const turrets = [turret0, turret1, turret2, turret3, turret4, turret5, turret6, turret7, turret8, turret9, turret10, turret11, turret12, turret13, turret14, turret15, turret16];
  turrets.forEach((make, i) => { frames[`turret${i}`] = make(); });
  return frames;
}

export const SKIN = { schema: 1, id: 'classic-tank', name: 'Classic Tank', author: 'Bleed', version: '1.0.0', tint: { base: 'player', tread: 'player', turret: 'player' }, pixelScale: 2 };
