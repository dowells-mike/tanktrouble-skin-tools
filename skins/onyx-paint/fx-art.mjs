// Onyx Paint: the soft effect sprites (explosion, smoke, dust and puff clouds, mine glow) as SVG in the game's own 1x pixels.
// The same polished black stone as the tank: charcoal clouds with grey-gold highlights, soft volumes lit from the UPPER LEFT, no outlines.
// The solid pieces (missile, mine, shrapnel, tank-explosion fragments) are rendered in Blender (blender/render.py).
const f = n => Number(n.toFixed(2));
const svg = (w, h, body, defs) => `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" shape-rendering="geometricPrecision"><defs>${defs}</defs>${body}</svg>`;
const blur = (id, s) => `<filter id="${id}" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="${s}"/></filter>`;
const FILTERS = [['b04', 0.4], ['b07', 0.7], ['b1', 1], ['b14', 1.4], ['b2', 2], ['b3', 3]].map(([i, s]) => blur(i, s)).join('');
const rng = seed => { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };

// the same stops as the tank's paint (red, orange, yellow, green, cyan, blue, violet, magenta), top to bottom
// onyx: pale gold-grey at the top of each cloud fading to charcoal at the bottom
const STOPS = [[0, '#c9c3a0'], [0.3, '#78735c'], [0.62, '#34343a'], [1, '#101013']];
const SILVER = [[0, '#f3efd6'], [0.5, '#a9a58c'], [1, '#55554f']];
const rainbow = (id, x1, y1, x2, y2, stops = STOPS) => `<linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}">${stops.map(([o, c]) => `<stop offset="${o}" stop-color="${c}"/>`).join('')}</linearGradient>`;
/** A white highlight, brightest at the upper left of whatever it covers. */
const HILITE = '<radialGradient id="hl" cx=".36" cy=".34" r=".7"><stop offset="0" stop-color="#fff" stop-opacity=".95"/><stop offset=".45" stop-color="#fff" stop-opacity=".35"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>';

/** A billowing cloud: overlapping soft lobes filled with the rainbow, each lit from the upper left; `wash` lightens it toward white (smoke and dust are paler). */
function cloud(size, seed, { lobes, spread, rMin, rMax, blurId = 'b1', alpha = 0.92, wash = 0, dark = 0 }) {
  const rand = rng(seed);
  const c = size / 2;
  const items = [];
  for (let i = 0; i < lobes; i++) {
    const a = rand() * Math.PI * 2, d = (i === 0 ? 0 : 0.35 + rand() * 0.65) * spread, r = rMin + rand() * (rMax - rMin);
    items.push({ x: c + Math.cos(a) * d, y: c + Math.sin(a) * d, r });
  }
  const defs = `${FILTERS}${HILITE}${rainbow('rb', 0, c - spread - rMax, 0, c + spread + rMax)}<radialGradient id="edge" cx=".5" cy=".5" r=".5"><stop offset=".55" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#fff" stop-opacity="1"/></radialGradient><mask id="m" maskUnits="userSpaceOnUse" x="0" y="0" width="${size}" height="${size}"><rect width="${size}" height="${size}" fill="#000"/><g filter="url(#${blurId})" fill="#fff">${items.map(l => `<circle cx="${f(l.x)}" cy="${f(l.y)}" r="${f(l.r)}"/>`).join('')}</g></mask>`;
  const body = `<g mask="url(#m)" opacity="${alpha}"><rect width="${size}" height="${size}" fill="url(#rb)"/>${wash ? `<rect width="${size}" height="${size}" fill="#fff" opacity="${wash}"/>` : ''}${dark ? `<rect width="${size}" height="${size}" fill="#000" opacity="${dark}"/>` : ''}</g>
<g filter="url(#${blurId})">${items.map(l => `<circle cx="${f(l.x - l.r * 0.12)}" cy="${f(l.y - l.r * 0.14)}" r="${f(l.r * 0.78)}" fill="url(#hl)"/>`).join('')}</g>`;
  return svg(size, size, body, defs);
}

const explosion = n => cloud(100, 11 + n * 7, { lobes: 13, spread: 24, rMin: 17, rMax: 28, blurId: 'b3', alpha: 0.95 });
const smoke = n => cloud(60, 31 + n * 5, { lobes: 9, spread: 14, rMin: 9, rMax: 15, blurId: 'b2', alpha: 0.78, dark: 0.1 });
const dust = n => cloud(80, 51 + n * 9, { lobes: 10, spread: 20, rMin: 12, rMax: 20, blurId: 'b3', alpha: 0.6, wash: 0.08 });
const puff = n => cloud(20, 71 + n * 3, { lobes: 5, spread: 3.6, rMin: 3.2, rMax: 5, blurId: 'b04', alpha: 0.95 });

/** The mine's pulsing glow: a hot white core, then yellow, cyan and violet rings fading to nothing. */
function mineGlowSvg() {
  const defs = '<radialGradient id="g" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#fff"/><stop offset=".2" stop-color="#f6e9a8" stop-opacity=".98"/><stop offset=".45" stop-color="#b6ab6a" stop-opacity=".7"/><stop offset=".75" stop-color="#5d593f" stop-opacity=".38"/><stop offset="1" stop-color="#2a2a22" stop-opacity="0"/></radialGradient>';
  return svg(48, 48, '<circle cx="24" cy="24" r="24" fill="url(#g)"/>', defs);
}

export const FX_SVG_EFFECTS = { mineGlow: mineGlowSvg() };
export const FX_SVG_SCENE = {};   // no shield pictures: the game's own TankTrouble shield is left in place
for (let i = 0; i < 3; i++) { FX_SVG_SCENE['explosion' + i] = explosion(i); FX_SVG_SCENE['smoke' + i] = smoke(i); FX_SVG_SCENE['dust' + i] = dust(i); FX_SVG_SCENE['puff' + i] = puff(i); }
/** Blender-rendered solid sprites that belong to the weapon template / the scene template. */
export const FX_BLENDER_EFFECTS = ['homingMissile', 'mine', 'mineShrapnel'];
export const FX_BLENDER_SCENE = Array.from({ length: 10 }, (_, i) => 'fragment' + i);
