// Puts a skin's frames together the way the game stacks a tank (treads at x = +-26, body, turret 16 px ahead of the centre), on a light floor, and writes a PNG.
//   node skins/tools/assemble.mjs <folder with the 4x frames> <out.png> [turret ...]   (default turret0; several = side by side)
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { decodePng, encodePng } = require('../tools/png.js');
const [dir, out, ...turrets] = process.argv.slice(2);
if (!turrets.length) turrets.push('turret0');
const S = 4, CW = 150 * S, CH = 190 * S;
const img = n => decodePng(fs.readFileSync(path.join(dir, `${n}.png`)));
const sheet = new Uint8ClampedArray(CW * CH * turrets.length * 4);
for (let i = 0; i < sheet.length; i += 4) sheet.set([236, 238, 241, 255], i);
const put = (p, ox, oy, o) => { for (let y = 0; y < p.height; y++) for (let x = 0; x < p.width; x++) { const s = (y * p.width + x) * 4, a = p.data[s + 3] / 255; if (!a) continue; const dx = ox + x, dy = oy + y; if (dx < 0 || dy < 0 || dx >= CW || dy >= CH * turrets.length) continue; const d = (dy * CW + dx) * 4; for (let c = 0; c < 3; c++) o[d + c] = Math.round(p.data[s + c] * a + o[d + c] * (1 - a)); } };
const base = img('base'), tread = img('tread');
turrets.forEach((t, k) => {
  const cx = CW / 2, cy = k * CH + CH / 2 + 8 * S, turret = img(t);
  for (const sx of [-26, 26]) put(tread, cx + sx * S - tread.width / 2, cy - tread.height / 2, sheet);
  put(base, cx - base.width / 2, cy - base.height / 2, sheet);
  put(turret, cx - turret.width / 2, cy - 16 * S - turret.height / 2, sheet);
});
fs.writeFileSync(out, encodePng(CW, CH * turrets.length, sheet));
console.log('wrote', out);
