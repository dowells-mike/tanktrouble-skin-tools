// The exact wording Skin Tools shows when a skin is refused, produced by the extension's OWN code (skin-package.js checks and the panel's plain-words
// rewrite, panel.js) for the usual mistakes, so the guide can quote it instead of paraphrasing it. Pure: nothing is rendered, no browser is needed.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import zlib from 'node:zlib';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { encodePng } = require('./src/artist-tools/lib/png.js');

// load the extension's modules into a bare context (the panel's text helper does not touch the page)
const ns = {};
const context = vm.createContext({ TankSkinTools: ns, console, Map, Set, WeakMap });
context.globalThis = context;
for (const name of ['frames', 'resample', 'png-info', 'skin-package', 'store', 'importer', 'preview', 'panel']) vm.runInContext(fs.readFileSync(path.join(root, 'extension', 'src', `${name}.js`), 'utf8'), context, { filename: `${name}.js` });
const { analysePackage } = ns.skinPackage;
const { plain } = ns.panel;

const crc = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return b => { let c = 0xffffffff; for (const x of b) c = t[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }; })();
const chunk = (type, data) => { const b = Buffer.alloc(12 + data.length); b.writeUInt32BE(data.length, 0); b.write(type, 4, 'ascii'); Buffer.from(data).copy(b, 8); b.writeUInt32BE(crc(b.subarray(4, 8 + data.length)), 8 + data.length); return b; };
const SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
/** Mistakes as bytes: a normal RGBA PNG, one with no alpha channel (RGB), and one flagged interlaced. */
export const rgba = (w, h) => new Uint8Array(encodePng(w, h, new Uint8ClampedArray(w * h * 4).fill(255)));
export function rgbNoAlpha(w, h) {
  const raw = Buffer.alloc((w * 3 + 1) * h, 255);
  for (let y = 0; y < h; y++) raw[y * (w * 3 + 1)] = 0;
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  return new Uint8Array(Buffer.concat([SIG, chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]));
}
export function interlaced(w, h) { const b = Buffer.from(rgba(w, h)); b[28] = 1; return new Uint8Array(b); }

const SPEC = { base: [68, 84], tread: [12, 80], turret0: [68, 82], turret1: [68, 82], turret2: [68, 82] };
const good = (scale = 1, skip = []) => Object.entries(SPEC).filter(([n]) => !skip.includes(n)).map(([n, [w, h]]) => ({ name: `${n}.png`, bytes: rgba(w * scale, h * scale) }));
const problems = pngs => analysePackage({ json: JSON.stringify({ schema: 1, id: 'x' }), pngs }).errors;
const pick = (errors, re) => { const line = errors.find(e => re.test(e)); if (!line) throw new Error(`the importer no longer reports a problem like ${re}: ${JSON.stringify(errors)}`); return line; };

/** key -> the line the panel shows. The mistakes are the ones the guide's troubleshooting table lists (and tests/starter-kit.check.mjs makes for real). */
export function panelMessages() {
  const shades = n => Array.from({ length: n }, (_, i) => ({ name: `treadShade${i}.png`, bytes: rgba(12, 80) }));
  return {
    size: plain(pick(problems([{ name: 'base.png', bytes: rgba(70, 84) }, ...good().slice(1)]), /base\.png: is 70x84/)),
    missing: plain(pick(problems(good(1, ['turret0'])), /turret0\.png is required/)),
    alpha: plain(pick(problems([{ name: 'turret0.png', bytes: rgbNoAlpha(68, 82) }, ...good().filter(f => f.name !== 'turret0.png')]), /turret0\.png: has no transparency/)),
    mixed: plain(pick(problems([...good().slice(0, 4), { name: 'turret2.png', bytes: rgba(136, 164) }]), /^Mixed resolutions/)),
    shades: plain(pick(problems([...good(), ...shades(9)]), /Tread shade frames must be all 12/)),
    name: plain(pick(problems([{ name: 'base.PNG', bytes: rgba(68, 84) }, ...good().slice(1)]), /file name must be exactly/)),
    interlaced: plain(pick(problems([{ name: 'turret0.png', bytes: interlaced(68, 82) }, ...good().filter(f => f.name !== 'turret0.png')]), /interlaced/)),
    empty: 'turret1.png is completely transparent.'      // raised by the importer after decoding (importer.js), so it cannot be produced from the checker alone
  };
}
