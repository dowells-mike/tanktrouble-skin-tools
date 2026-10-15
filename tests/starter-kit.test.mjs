// Tests of the Skin Creator Starter Kit: the example skin, the templates, the PSD round trip, the atlas converter and the guide.
// No browser needed.   node --test tests/starter-kit.test.mjs        (the browser side is tests/starter-kit.check.mjs)
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { execFileSync, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const kitSrc = path.join(root, 'starter-kit');
const { syncLibs } = await import(pathToFileURL(path.join(kitSrc, 'sync-libs.mjs')).href);
syncLibs();
const lib = name => require(path.join(kitSrc, 'src', 'artist-tools', 'lib', name));
const { decodePng, encodePng } = lib('png.js');
const { convertAtlases, contactSheet, resize, matchName } = lib('atlas.js');
const { readPsd } = lib('psd-reader.js');
const frames = lib('frames.js');
const { downsample } = lib('resample.js');
const { analysePackage } = lib('skin-package.js');
const layout = lib('layout.js')(frames);
const { packAtlas } = await import(pathToFileURL(path.join(kitSrc, 'pack-atlas.mjs')).href);
const templates = await import(pathToFileURL(path.join(kitSrc, 'src', 'generators', 'templates.mjs')).href);
const { exportPsd } = await import(pathToFileURL(path.join(kitSrc, 'src', 'artist-tools', 'psd-to-skin.mjs')).href);
const { readZip } = await import(pathToFileURL(path.join(root, 'build', 'zip.mjs')).href);
const { chunkTypes } = await import(pathToFileURL(path.join(root, 'build', 'png.mjs')).href);
const { SPECS, ALL_SPECS } = frames;

// ---------------------------------------------------------------- shared fixtures
const exampleDir = path.join(kitSrc, 'example-skin');
const example = {};             // name -> { width, height, data } at the example's own 2x
for (const f of fs.readdirSync(exampleDir).filter(n => n.endsWith('.png'))) example[f.replace('.png', '')] = decodePng(fs.readFileSync(path.join(exampleDir, f)));
const NAMES = Object.keys(example);
const asPictures = (map = example) => Object.entries(map).map(([name, p]) => ({ name, width: p.width, height: p.height, rgba: p.data }));
/** The example resampled by a factor (f=1 is the example's own 2x pictures, so f=0.5 gives 1x). */
const scaled = f => Object.fromEntries(Object.entries(example).map(([name, p]) => { const w = Math.round(p.width * f), h = Math.round(p.height * f); return [name, { width: w, height: h, data: f === 1 ? p.data : resize(p.data, p.width, p.height, w, h, 'smooth') }]; }));
const convert = (atlas, extra = {}) => convertAtlases([{ label: 'atlas.json', json: atlas.json, image: atlas.image }], { id: 'test-skin', ...extra });
/** Same picture ignoring the colour of fully transparent pixels. */
const samePixels = (a, b) => { if (a.length !== b.length) return false; for (let i = 0; i < a.length; i += 4) { if (a[i + 3] !== b[i + 3]) return false; if (a[i + 3] && (a[i] !== b[i] || a[i + 1] !== b[i + 1] || a[i + 2] !== b[i + 2])) return false; } return true; };
const outputMap = result => Object.fromEntries(result.files.map(f => [f.frame, decodePng(f.png)]));
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'starter-kit-test-'));

// ---------------------------------------------------------------- the example skin
test('example skin: accepted by the importer rules with no warnings, 31 pictures at 2x', () => {
  const pngs = fs.readdirSync(exampleDir).filter(n => n.endsWith('.png')).map(name => ({ name, bytes: new Uint8Array(fs.readFileSync(path.join(exampleDir, name))) }));
  const report = analysePackage({ json: fs.readFileSync(path.join(exampleDir, 'skin.json'), 'utf8'), pngs });
  assert.deepEqual(report.errors, []);
  assert.deepEqual(report.warnings, []);
  assert.equal(report.frames.length, 31);
  assert.equal(report.scale, 2);
  assert.equal(report.meta.id, 'classic-tank');
  assert.deepEqual(report.meta.tint, { base: 'player', tread: 'player', turret: 'player' }, 'the classic tank takes each player\'s colour');
  assert.deepEqual(NAMES.sort(), [...Object.keys(SPECS)].sort(), 'every body, tread, tread-shade and turret picture is present');
});

test('example skin: every picture is exactly its canvas, stays inside a clear border, and is not empty', () => {
  for (const [name, p] of Object.entries(example)) {
    assert.equal(p.width, SPECS[name].w * 2, `${name} width`);
    assert.equal(p.height, SPECS[name].h * 2, `${name} height`);
    let x0 = p.width, y0 = p.height, x1 = -1, y1 = -1;
    for (let y = 0; y < p.height; y++) for (let x = 0; x < p.width; x++) if (p.data[(y * p.width + x) * 4 + 3]) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
    assert.ok(x1 >= 0, `${name} is completely transparent`);
    if (!name.startsWith('treadShade')) assert.ok(x0 >= 2 && y0 >= 2 && x1 <= p.width - 3 && y1 <= p.height - 3, `${name} touches the edge of its canvas (${x0},${y0}..${x1},${y1})`);
  }
});

test('example skin: the barrel reaches the muzzle (pixel 34,7 of a turret) and the turret pivots on the tank centre', () => {
  const top = name => { const p = example[name]; for (let y = 0; y < p.height; y++) for (let x = 0; x < p.width; x++) if (p.data[(y * p.width + x) * 4 + 3] > 200) return y / 2; return null; };
  for (const name of ['turret0', 'turret2', 'turret4', 'turret9', 'turret15', 'turret16']) { const y = top(name); assert.ok(y >= 1 && y <= 12, `${name}: barrel tip at ${y}, muzzle is at 7`); }
  const t0 = example.turret0;   // the dome is centred on pixel (34,57)
  const row = Math.round(57 * 2), cols = []; for (let x = 0; x < t0.width; x++) if (t0.data[(row * t0.width + x) * 4 + 3] > 200) cols.push(x / 2);
  assert.ok(Math.abs((Math.min(...cols) + Math.max(...cols)) / 2 - 34) < 1.5, 'dome is centred on x=34');
});

test('example skin: the 12 tread shades move UP by 14/12 px per frame (period 14, as the game\'s own frames do) and loop', () => {
  const profile = n => { const p = example[`treadShade${n}`]; const out = []; for (let y = 0; y < p.height; y++) { let a = 0; for (let x = 0; x < p.width; x++) a += p.data[(y * p.width + x) * 4 + 3]; out.push(a / p.width); } return out; };
  const period = 28;      // 14 px at 2x
  // how many 2x rows frame b sits ABOVE frame a, away from the darker end caps
  const shiftOf = (a, b) => { let best = 0, bestErr = Infinity; for (let s = 0; s < period; s++) { let e = 0; for (let y = 60; y < a.length - 60; y++) e += (b[y - s + period] - a[y]) ** 2; if (e < bestErr) { bestErr = e; best = s; } } return best; };
  const first = profile(0);
  for (let n = 1; n <= 12; n++) {
    const want = Math.round((2 * 14 * n) / 12) % period;
    const got = shiftOf(first, profile(n % 12));
    const off = Math.min((got - want + period) % period, (want - got + period) % period);
    assert.ok(off <= 1, `frame ${n % 12} should sit ${want} rows (2x) above frame 0 modulo the period; found ${got}`);
  }
});

// The classic tank's dimensions (the game's own proportions, measured on the plain white tank): inclusive first and last solid pixel of a row, at the
// game's native size. Facts about shape and size only: the pictures themselves are drawn from scratch.
const native = Object.fromEntries(Object.entries(example).map(([n, p]) => [n, downsample(p.data, p.width, p.height, 2)]));
const solidAt = (name, x, y) => native[name].data[(y * native[name].width + x) * 4 + 3] >= 128;
const rowSpan = (name, y) => { let l = -1, r = -1; for (let x = 0; x < native[name].width; x++) if (solidAt(name, x, y)) { if (l < 0) l = x; r = x; } return [l, r]; };
const topRow = name => { for (let y = 0; y < native[name].height; y++) if (rowSpan(name, y)[0] >= 0) return y; return -1; };
test('example skin: the classic tank keeps the game\'s proportions (outline, dome, barrel and weapon dimensions) in every weapon frame', () => {
  const near = (got, want, what) => assert.ok(got.length === want.length && got.every((v, i) => Math.abs(v - want[i]) <= 1), `${what}: ${got} vs ${want}`);
  // body: 2 px black frame 64 x 80, see-through channels for the treads at x 4-11 and 56-63, white panel x 12-55
  near(rowSpan('base', 40), [2, 65], 'base row 40');
  assert.ok(!solidAt('base', 8, 40) && !solidAt('base', 60, 40) && solidAt('base', 3, 40) && solidAt('base', 30, 40), 'base: channels clear, frame and panel solid');
  assert.ok(native.base.data[(40 * 68 + 3) * 4] < 20, 'the outline is black');
  near(rowSpan('tread', 40), [2, 9], 'tread row 40'); assert.equal(topRow('tread'), 2);
  // turret frames: [first row, row to look at, expected span]
  const table = {
    turret0: [2, 20, [24, 43]], turret1: [16, 25, [19, 48]], turret2: [6, 25, [21, 46]], turret3: [2, 16, [12, 55]],
    turret4: [10, 20, [16, 51]], turret5: [10, 20, [32, 51]], turret6: [10, 12, [32, 51]], turret7: [10, 20, [16, 35]], turret8: [10, 12, [16, 35]],
    turret9: [4, 20, [20, 47]], turret10: [14, 20, [20, 47]], turret11: [24, 30, [20, 47]],
    turret12: [2, 20, [26, 41]], turret13: [36, 40, [24, 43]], turret14: [26, 61, [3, 64]],
    turret15: [2, 12, [20, 47]], turret16: [2, 12, [20, 47]]
  };
  for (const [name, [top, row, span]] of Object.entries(table)) { assert.ok(Math.abs(topRow(name) - top) <= 1, `${name}: first row ${topRow(name)} vs ${top}`); near(rowSpan(name, row), span, `${name} row ${row}`); }
  // the dome is the same circle in every frame: 48 wide at its widest row (y 56), bottom at y 79 (flat-topped for the cut-dome weapons)
  for (let i = 0; i <= 16; i++) { const name = `turret${i}`; if (i === 14) continue; near(rowSpan(name, 56), [10, 57], `${name} dome row 56`); assert.ok(solidAt(name, 34, 78) && !solidAt(name, 34, 81), `${name} dome bottom`); }
  // recoil order: the default barrel gets shorter then is replaced by a stretched barrel, shotgun and double-barrel steps move in the stated order
  assert.ok(topRow('turret9') < topRow('turret10') && topRow('turret10') < topRow('turret11'), 'shotgun recoil goes 9 < 10 < 11');
  assert.ok(topRow('turret5') + 0 === 10 && rowSpan('turret5', 20)[0] === 32 && rowSpan('turret6', 20)[0] === 16, 'left barrel: frame 5 recoils further than frame 6');
  assert.ok(rowSpan('turret7', 20)[1] === 35 && rowSpan('turret8', 20)[1] === 51, 'right barrel: frame 7 recoils further than frame 8');
});
test('example skin: every colour is a neutral grey or white (so each player\'s colour multiplies cleanly) and the outline is pure black', () => {
  for (const [name, p] of Object.entries(example)) {
    let darkest = 255, lightest = 0;
    for (let i = 0; i < p.data.length; i += 4) {
      if (!p.data[i + 3]) continue;
      assert.ok(Math.abs(p.data[i] - p.data[i + 1]) <= 4 && Math.abs(p.data[i + 1] - p.data[i + 2]) <= 4, `${name}: a coloured pixel (${p.data.slice(i, i + 3)})`);
      if (p.data[i + 3] === 255) { darkest = Math.min(darkest, p.data[i]); lightest = Math.max(lightest, p.data[i]); }
    }
    if (name.startsWith('turret') || name === 'base') { assert.ok(darkest <= 8, `${name}: no black outline`); assert.ok(lightest >= 240, `${name}: nothing white`); }
  }
});

// ---------------------------------------------------------------- templates
test('templates: blank PNGs are fully transparent and exactly the canvas size; guides are not empty', () => {
  const list = templates.pngTemplates();
  assert.equal(list.length, 21);
  for (const t of list) {
    const img = decodePng(t.data);
    const spec = ALL_SPECS[t.part === 'turret' ? 'turret0' : t.part === 'assembled' ? 'base' : t.part];
    if (t.part !== 'assembled') { assert.equal(img.width, spec.w * t.scale, t.path); assert.equal(img.height, spec.h * t.scale, t.path); }
    const alpha = [...Array(img.width * img.height).keys()].map(i => img.data[i * 4 + 3]);
    if (t.kind === 'blank') assert.ok(alpha.every(a => a === 0), `${t.path} must be fully transparent`);
    else assert.ok(alpha.some(a => a > 0), `${t.path} must show guide lines`);
    assert.deepEqual(chunkTypes(t.data), ['IHDR', 'IDAT', 'IEND']);
    assert.equal(t.data[25], 6, `${t.path} must be RGBA (colour type 6), never a palette: Photoshop would open it in Indexed Colour mode`);
  }
});

test('templates: with the classic tank every guide shows its outline and every picture gets a shape guide (4x)', () => {
  const list = templates.pngTemplates({ art: example });
  const shapes = list.filter(t => t.kind === 'shape');
  assert.equal(list.length, 21 + 19);
  assert.deepEqual(shapes.map(t => t.part).sort(), ['base', 'tread', ...Array.from({ length: 17 }, (_, i) => `turret${i}`)].sort());
  const slate = [70, 85, 105, 255];
  const countSlate = img => { let n = 0; for (let i = 0; i < img.data.length; i += 4) if (img.data[i] === slate[0] && img.data[i + 1] === slate[1] && img.data[i + 2] === slate[2] && img.data[i + 3] === 255) n++; return n; };
  for (const t of shapes) { const img = decodePng(t.data); assert.deepEqual([img.width, img.height], [SPECS[t.part].w * 4, SPECS[t.part].h * 4], t.path); assert.ok(countSlate(img) > 100, `${t.path} shows the outline`); }
  for (const t of list.filter(x => x.kind === 'guides' && x.part !== 'assembled')) assert.ok(countSlate(decodePng(t.data)) > 20, `${t.path} shows the outline`);
  for (const t of list.filter(x => x.kind === 'blank')) assert.ok(decodePng(t.data).data.every((v, i) => i % 4 !== 3 || v === 0), `${t.path} stays blank`);
  // the shape guide of turret5 differs from turret0's (the left barrel is pushed back): the guides really follow each frame
  assert.notDeepEqual([...decodePng(shapes.find(s => s.part === 'turret5').data).data], [...decodePng(shapes.find(s => s.part === 'turret0').data).data]);
});

test('templates: the PSD carries the classic tank as a locked 40% tracing group that the exporter ignores', () => {
  const psd = readPsd(Buffer.from(templates.psdTemplate(4, example)));
  const ref = psd.layers.filter(l => !l.isGroup && l.path.some(p => /^REFERENCE/.test(p)));
  assert.equal(ref.length, 17 + 2 + 1, 'one per turret frame, two treads, the body');
  const art = psd.layers.filter(l => !l.isGroup && !l.path.some(p => /^(GUIDES|REFERENCE)/.test(p)));
  assert.deepEqual(art.map(l => l.name).sort(), Object.keys(SPECS).sort(), 'the picture layers are unchanged');
  for (const l of ref) assert.ok(!(l.name in SPECS), `${l.name} must not look like a picture name`);
  const result = exportPsd(Buffer.from(templates.psdTemplate(4, example)), { scale: 2 });
  assert.equal(result.files.length, 0, 'nothing is exported from an unpainted template');
  assert.ok(!result.messages.some(m => /classic tank/.test(m.text)), 'tracing layers are skipped silently');
  // a tracing layer is faint: no pixel is more than 40% opaque
  const body = ref.find(l => /body of the classic tank/.test(l.name));
  let max = 0; for (let i = 3; i < body.rgba.length; i += 4) max = Math.max(max, body.rgba[i]);
  assert.ok(max > 0 && max <= 103, `tracing layer opacity ${max}/255`);
});

test('templates: the PSD has a locked guides group and exactly one empty, correctly placed layer per picture', () => {
  const psd = readPsd(Buffer.from(templates.psdTemplate(4)));
  assert.equal(psd.width, layout.DOC.w * 4); assert.equal(psd.height, layout.DOC.h * 4);
  const art = psd.layers.filter(l => !l.isGroup && !l.path.some(p => /^GUIDES/.test(p)));
  assert.deepEqual(art.map(l => l.name).sort(), Object.keys(SPECS).sort());
  for (const l of art) {
    const r = layout.frameRect(l.name);
    assert.deepEqual([l.left, l.top, l.width, l.height], [r.x * 4, r.y * 4, r.w * 4, r.h * 4], `${l.name} is placed where the importer expects it`);
  }
  assert.ok(psd.layers.some(l => l.isGroup && /^GUIDES/.test(l.name)), 'a GUIDES group exists');
});

test('PSD route: painted template layers come out of psd-to-skin as exactly the same pictures', () => {
  const S = 4;
  const doc = templates.psdDocument(S, { art: example });   // with the tracing group present, as shipped
  const up = p => { const out = new Uint8ClampedArray(p.width * 2 * p.height * 2 * 4); for (let y = 0; y < p.height * 2; y++) for (let x = 0; x < p.width * 2; x++) out.set(p.data.subarray(((y >> 1) * p.width + (x >> 1)) * 4, ((y >> 1) * p.width + (x >> 1)) * 4 + 4), (y * p.width * 2 + x) * 4); return out; };
  const fill = nodes => { for (const n of nodes) { if (n.type === 'group') fill(n.children); else if (example[n.name]) n.rgba = up(example[n.name]); } };
  fill(doc.layers);
  const result = exportPsd(Buffer.from(templates.buildPsd({ ...doc, rle: true })), { scale: 2, id: 'psd-skin', name: 'PSD skin', tint: 'player' });
  assert.equal(result.messages.filter(m => m.level === 'warn').length, 0, JSON.stringify(result.messages));
  assert.equal(result.files.length, 31);
  for (const f of result.files) assert.ok(samePixels(decodePng(f.png).data, example[f.name.replace('.png', '')].data), `${f.name} differs after the PSD round trip`);
  const report = analysePackage({ json: JSON.stringify(result.skinJson), pngs: result.files.map(f => ({ name: f.name, bytes: new Uint8Array(f.png) })) });
  assert.deepEqual(report.errors, []);
});

// ---------------------------------------------------------------- PNG reading
const crc = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return b => { let c = 0xffffffff; for (const x of b) c = t[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }; })();
const chunk = (type, data) => { const b = Buffer.alloc(12 + data.length); b.writeUInt32BE(data.length, 0); b.write(type, 4, 'ascii'); Buffer.from(data).copy(b, 8); b.writeUInt32BE(crc(b.subarray(4, 8 + data.length)), 8 + data.length); return b; };
/** A hand-made PNG of any colour type / depth: `rows` are arrays of already-packed bytes per scanline (filter 0). */
const rawPng = (w, h, depth, type, rows, extra = []) => {
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = depth; ihdr[9] = type;
  const raw = Buffer.concat(rows.map(r => Buffer.from([0, ...r])));
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), ...extra, chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
};
test('png: decodes palette+tRNS, grey+alpha, 16-bit RGB(A), 1-bit grey and colour-key PNGs to straight RGBA', () => {
  const pal = decodePng(rawPng(2, 1, 8, 3, [[0, 1]], [chunk('PLTE', [255, 0, 0, 0, 0, 255]), chunk('tRNS', [128])]));
  assert.deepEqual([...pal.data], [255, 0, 0, 128, 0, 0, 255, 255]);
  const pal4 = decodePng(rawPng(3, 1, 4, 3, [[0x01, 0x20]], [chunk('PLTE', [10, 20, 30, 40, 50, 60, 70, 80, 90]), chunk('tRNS', [0, 255])]));
  assert.deepEqual([...pal4.data], [10, 20, 30, 0, 40, 50, 60, 255, 70, 80, 90, 255]);
  const ga = decodePng(rawPng(2, 1, 8, 4, [[100, 50, 200, 255]]));
  assert.deepEqual([...ga.data], [100, 100, 100, 50, 200, 200, 200, 255]);
  const rgb16 = decodePng(rawPng(1, 1, 16, 2, [[0xff, 0xff, 0x80, 0x00, 0x00, 0xff]]));
  assert.deepEqual([...rgb16.data], [255, 128, 0, 255]);
  const rgba16 = decodePng(rawPng(1, 1, 16, 6, [[0x12, 0x34, 0x56, 0x78, 0x9a, 0xbc, 0x00, 0x80]]));
  assert.deepEqual([...rgba16.data], [0x12, 0x56, 0x9a, 0x00]);
  const bits = decodePng(rawPng(8, 1, 1, 0, [[0b10100101]]));
  assert.deepEqual([...bits.data].filter((_, i) => i % 4 === 0), [255, 0, 255, 0, 0, 255, 0, 255]);
  const keyed = decodePng(rawPng(2, 1, 8, 2, [[255, 0, 255, 10, 20, 30]], [chunk('tRNS', [0, 255, 0, 0, 0, 255])]));
  assert.deepEqual([...keyed.data], [255, 0, 255, 0, 10, 20, 30, 255]);
});
test('png: refuses interlaced and damaged files with a plain message; our own writer round-trips', () => {
  const inter = rawPng(1, 1, 8, 6, [[1, 2, 3, 4]]); inter[28] = 1;
  assert.throws(() => decodePng(inter), /interlaced/);
  assert.throws(() => decodePng(Buffer.from('not a png at all')), /not a PNG/);
  assert.throws(() => decodePng(encodePng(2, 2, new Uint8ClampedArray(16)).subarray(0, 40)), /cut short|damaged/);
  const data = new Uint8ClampedArray(4 * 3 * 4).map((_, i) => (i * 37) % 256);
  assert.deepEqual([...decodePng(encodePng(4, 3, data)).data], [...data]);
});

// ---------------------------------------------------------------- the converter
test('converter: untrimmed, trimmed, array and hash atlases of the example all give back the same pictures', () => {
  for (const options of [{ trim: false, format: 'array' }, { trim: true, format: 'array' }, { trim: true, format: 'hash' }, { trim: false, format: 'hash', meta: false }]) {
    const result = convert(packAtlas(asPictures(), options));
    assert.deepEqual(result.errors, [], JSON.stringify(options));
    assert.equal(result.scale, 2); assert.equal(result.files.length, 31);
    const out = outputMap(result);
    for (const name of NAMES) assert.ok(samePixels(out[name].data, example[name].data), `${name} differs (${JSON.stringify(options)})`);
    assert.equal(result.skinJson.pixelScale, 2);
  }
});
test('converter: trimming offsets are honoured (a trimmed picture lands exactly where it was)', () => {
  const atlas = packAtlas(asPictures(), { trim: true });
  const entry = atlas.json.frames.find(f => f.filename === 'turret0');
  assert.ok(entry.trimmed && (entry.spriteSourceSize.x > 0 || entry.spriteSourceSize.y > 0), 'the fixture really is trimmed with an offset');
  assert.ok(entry.frame.w < entry.sourceSize.w);
  const out = outputMap(convert(atlas));
  assert.ok(samePixels(out.turret0.data, example.turret0.data));
});
test('converter: sizes: 1x (exact reduction), 4x, 3x and half-size sheets each come out at ONE valid scale', () => {
  // 1x sheet (the game's own size): auto -> 1x, identical to Skin Tools' own 2x -> 1x reduction
  let result = convert(packAtlas(asPictures(scaled(0.5)), { trim: true }));
  assert.deepEqual(result.errors, []); assert.equal(result.scale, 1);
  assert.equal(result.files.find(f => f.frame === 'base').width, 68);
  // 4x sheet: auto -> 4x; --scale 2 reduces exactly
  const four = packAtlas(asPictures(scaled(2)), { trim: true });
  result = convert(four); assert.deepEqual(result.errors, []); assert.equal(result.scale, 4);
  result = convert(four, { scale: 2 }); assert.deepEqual(result.errors, []); assert.equal(result.scale, 2);
  const direct = outputMap(result);
  for (const name of ['base', 'turret5', 'treadShade3']) assert.equal(direct[name].width, SPECS[name].w * 2);
  // a 3x sheet (not a size Skin Tools accepts): auto -> 2x, reduced; the dimensions are exact
  const three = packAtlas(asPictures(scaled(1.5)), { format: 'hash' });
  assert.equal(three.json.frames.base.sourceSize.w, 204);
  result = convert(three); assert.deepEqual(result.errors, []); assert.equal(result.scale, 2);
  for (const f of result.files) assert.deepEqual([f.width, f.height], [SPECS[f.frame].w * 2, SPECS[f.frame].h * 2], f.frame);
  // a half-size sheet (34x42 body): REFUSED by default; enlarged to 1x only when --upscale is given, with ONE warning that says so
  const half = packAtlas(asPictures(scaled(0.25)), {});
  assert.equal(half.json.frames[0].sourceSize.w === 34 || half.json.frames.some(f => f.sourceSize.w === 34), true);
  result = convert(half); assert.equal(result.ok, false, 'no --upscale: refused'); assert.match(result.errors.join(' '), /smaller than.*--upscale smooth \(or sharp\)/); assert.equal(result.files.length, 0);
  result = convert(half, { upscale: 'smooth' }); assert.deepEqual(result.errors, []); assert.equal(result.scale, 1);
  assert.equal(result.warnings.filter(w => /enlarged/.test(w)).length, 1);
  assert.equal(result.files.find(f => f.frame === 'base').width, 68);
  result = convert(half, { upscale: 'off' }); assert.equal(result.ok, false, 'off is the same as the default');
  const sharp = convert(half, { upscale: 'sharp' }); assert.equal(sharp.ok, true);
});
test('converter: one picture at a different size than the rest is brought to the common scale, with a warning', () => {
  const map = { ...example, turret5: scaled(0.5).turret5 };
  const atlas = packAtlas(asPictures(map), { trim: true });
  assert.equal(convert(atlas).ok, false, 'a smaller picture is refused unless --upscale is given');
  const result = convert(atlas, { upscale: 'smooth' });
  assert.deepEqual(result.errors, []); assert.equal(result.scale, 2);
  assert.equal(result.files.find(f => f.frame === 'turret5').width, 136);
  assert.ok(result.warnings.some(w => /turret5/.test(w) && /enlarged/.test(w)));
});
test('converter: a wrong "sourceSize" on an untrimmed picture (seen in real sheets) is ignored with a warning, pixels untouched', () => {
  const atlas = packAtlas(asPictures(), { trim: false });
  for (const name of ['turret5', 'turret14']) { const e = atlas.json.frames.find(f => f.filename === name); e.sourceSize = { w: e.sourceSize.w * 26 / 34 | 0, h: e.sourceSize.h }; }
  const result = convert(atlas);
  assert.deepEqual(result.errors, []);
  assert.equal(result.warnings.filter(w => /sourceSize/.test(w)).length, 2);
  assert.ok(samePixels(outputMap(result).turret5.data, example.turret5.data));
});
test('converter: refuses rotated pictures, wrong-shaped pictures, damaged data and a missing required picture, each with a clear message', () => {
  let atlas = packAtlas(asPictures(), {});
  atlas.json.frames.find(f => f.filename === 'turret3').rotated = true;
  let result = convert(atlas); assert.equal(result.ok, false); assert.match(result.errors.join(' '), /turret3 is stored rotated/);
  atlas = packAtlas(asPictures({ ...example, turret1: { width: 140, height: 164, data: new Uint8ClampedArray(140 * 164 * 4).fill(255) } }), {});
  result = convert(atlas); assert.equal(result.ok, false); assert.match(result.errors.join(' '), /turret1 is 140x164/);
  atlas = packAtlas(asPictures(), {}); atlas.json.frames.find(f => f.filename === 'base').frame.x = 9999;
  result = convert(atlas); assert.equal(result.ok, false); assert.match(result.errors.join(' '), /base: sits outside the atlas/);
  const { base, ...noBase } = example;
  atlas = packAtlas(asPictures(noBase), {});
  result = convert(atlas); assert.equal(result.ok, false); assert.match(result.errors.join(' '), /base\.png is required/);
  assert.equal(convert(atlas, { partial: true }).ok, true, '--partial writes what exists');
  result = convertAtlases([{ label: 'x.json', json: '{not json', image: atlas.image }], { id: 'a' }); assert.match(result.errors.join(' '), /not valid JSON/);
  result = convertAtlases([{ label: 'x.json', json: { nothing: 1 }, image: atlas.image }], { id: 'a' }); assert.match(result.errors.join(' '), /no "frames" list/);
  result = convert(packAtlas(asPictures(), {}), { id: 'Bad Id!' }); assert.equal(result.ok, false); assert.match(result.errors.join(' '), /"id" must be/);
});
test('converter: names with folders, ".png" or other capitals are understood; unknown pictures are ignored and listed', () => {
  assert.equal(matchName('tank/turret0.png', [], 'x'), 'turret0');
  assert.equal(matchName('TREADSHADE3', [], 'x'), 'treadShade3');
  const atlas = packAtlas([...asPictures(), { name: 'smiley', width: 4, height: 4, rgba: new Uint8ClampedArray(64).fill(255) }], {});
  const result = convert(atlas);
  assert.deepEqual(result.errors, []); assert.deepEqual(result.ignored, ['smiley']);
});
test('converter: partial tread shades are dropped (Skin Tools needs all 12 or none); an opaque or empty picture is reported', () => {
  const map = Object.fromEntries(Object.entries(example).filter(([n]) => !/^treadShade(5|6|7)$/.test(n)));
  let result = convert(packAtlas(asPictures(map), {}));
  assert.deepEqual(result.errors, []); assert.equal(result.files.filter(f => /treadShade/.test(f.frame)).length, 0);
  assert.ok(result.warnings.some(w => /9 of the 12 treadShade/.test(w)));
  const solid = new Uint8ClampedArray(example.base.data.length).fill(255);
  result = convert(packAtlas(asPictures({ ...example, base: { ...example.base, data: solid } }), {}));
  assert.ok(result.warnings.some(w => /base: has no transparent pixel/.test(w)));
  result = convert(packAtlas(asPictures({ ...example, turret16: { ...example.turret16, data: new Uint8ClampedArray(example.turret16.data.length) } }), {}));
  assert.ok(result.warnings.some(w => /turret16: completely transparent/.test(w)));
});
test('converter: weapon-visual frames in the same sheet are carried over; resize keeps edges clean (no halo)', () => {
  const effect = { name: 'bullet', width: 40, height: 40, rgba: (() => { const d = new Uint8ClampedArray(40 * 40 * 4); for (let y = 10; y < 30; y++) for (let x = 10; x < 30; x++) d.set([200, 30, 30, 255], (y * 40 + x) * 4); return d; })() };
  const result = convert(packAtlas([...asPictures(), effect], {}));
  assert.deepEqual(result.errors, []); assert.ok(result.files.some(f => f.frame === 'bullet'));
  const edge = resize(effect.rgba, 40, 40, 17, 17, 'smooth');   // a red square on transparent: no pixel may be darker or lighter than red
  for (let i = 0; i < edge.length; i += 4) if (edge[i + 3]) assert.ok(Math.abs(edge[i] - 200) <= 1 && Math.abs(edge[i + 1] - 30) <= 1, `halo at pixel ${i / 4}`);
  assert.ok(contactSheet(result.files).length > 1000);
});
test('converter: the command line works on the kit\'s example atlas, is repeatable, and refuses a folder that already has files', () => {
  const kit = path.join(tmp, 'kit-for-cli');
  execFileSync(process.execPath, [path.join(kitSrc, 'build.mjs'), '--out', kit], { stdio: 'pipe' });
  const top = path.join(kit, fs.readdirSync(kit).find(n => fs.statSync(path.join(kit, n)).isDirectory()));
  const tool = path.join(top, 'artist-tools', 'atlas-to-skin.mjs');
  const out = path.join(tmp, 'cli-out');
  const run = (...args) => spawnSync(process.execPath, [tool, ...args], { encoding: 'utf8', cwd: path.join(top, 'artist-tools') });
  let r = run('example-atlas/classic-tank-atlas.json', '--out', out, '--id', 'converted-example', '--name', 'Converted', '--author', 'Bleed', '--preview');
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /Wrote 31 pictures and skin\.json/);
  for (const name of NAMES) assert.ok(samePixels(decodePng(fs.readFileSync(path.join(out, `${name}.png`))).data, example[name].data), name);
  assert.equal(JSON.parse(fs.readFileSync(path.join(out, 'skin.json'), 'utf8')).id, 'converted-example');
  assert.ok(fs.existsSync(`${out}-preview.png`) && fs.existsSync(path.join(out, 'CONVERSION-REPORT.txt')));
  r = run('example-atlas/classic-tank-atlas.json', '--out', out, '--id', 'converted-example');
  assert.equal(r.status, 2); assert.match(r.stderr, /already has files/);
  r = run('example-atlas/classic-tank-atlas.json', '--out', path.join(tmp, 'cli-out2'));
  assert.equal(r.status, 1); assert.match(r.stdout, /Give the skin an id/);
  r = run('--help'); assert.equal(r.status, 0); assert.match(r.stdout, /usage: node atlas-to-skin\.mjs/);
  r = run('missing.json', '--out', path.join(tmp, 'x'), '--id', 'a'); assert.equal(r.status, 2);
  // the importer's own checker accepts the output as a skin
  const files = fs.readdirSync(out).filter(n => n.endsWith('.png')).map(name => ({ name, bytes: new Uint8Array(fs.readFileSync(path.join(out, name))) }));
  assert.deepEqual(analysePackage({ json: fs.readFileSync(path.join(out, 'skin.json'), 'utf8'), pngs: files }).errors, []);
});

// ---------------------------------------------------------------- the built kit and its guide
const built = path.join(tmp, 'kit-built');
execFileSync(process.execPath, [path.join(kitSrc, 'build.mjs'), '--out', built], { stdio: 'pipe' });
const builtTop = path.join(built, fs.readdirSync(built).find(n => fs.statSync(path.join(built, n)).isDirectory()));
const kitZip = path.join(built, fs.readdirSync(built).find(n => n.endsWith('.zip')));
test('kit: the ZIP holds exactly the kit\'s folders, nothing private, nothing unrelated, and is small', () => {
  const entries = readZip(fs.readFileSync(kitZip));
  const rel = entries.map(e => e.path.split('/').slice(1).join('/'));
  const top = new Set(rel.map(p => p.split('/')[0]));
  assert.deepEqual([...top].sort(), ['START-HERE.html', 'about', 'artist-tools', 'example-skin', 'templates']);
  for (const p of rel) assert.ok(!/(^|\/)\.|node_modules|package\.json|\.map$|\.blend|\.log$/i.test(p), `unexpected file ${p}`);
  assert.ok(fs.statSync(kitZip).size < 1.2 * 1024 * 1024, `kit ZIP is ${fs.statSync(kitZip).size} bytes`);
  assert.ok(rel.includes('templates/psd/tanktrouble-skin-template-4x.psd'));
  assert.equal(rel.filter(p => p.startsWith('example-skin/')).length, 32);
  assert.equal(rel.filter(p => p.startsWith('templates/blank/')).length, 9);
  for (const e of entries) if (e.path.endsWith('.png')) assert.deepEqual(chunkTypes(e.data).filter(t => !['IHDR', 'PLTE', 'tRNS', 'IDAT', 'IEND'].includes(t)), [], `${e.path} has metadata`);
});
test('kit: building twice gives byte-identical archives (reproducible)', () => {
  const again = path.join(tmp, 'kit-again');
  execFileSync(process.execPath, [path.join(kitSrc, 'build.mjs'), '--out', again], { stdio: 'pipe' });
  const a = fs.readFileSync(kitZip), b = fs.readFileSync(path.join(again, fs.readdirSync(again).find(n => n.endsWith('.zip'))));
  assert.ok(a.equals(b));
});
test('kit: the shipped tools run from the unpacked kit with Node alone (no node_modules, no repository around them)', () => {
  const isolated = path.join(os.tmpdir(), `kit-isolated-${process.pid}`);
  fs.rmSync(isolated, { recursive: true, force: true });
  fs.cpSync(builtTop, isolated, { recursive: true });
  const r = spawnSync(process.execPath, [path.join(isolated, 'artist-tools', 'atlas-to-skin.mjs'), path.join(isolated, 'artist-tools', 'example-atlas', 'classic-tank-atlas.json'), '--out', path.join(isolated, 'out'), '--id', 'isolated'], { encoding: 'utf8', cwd: isolated });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const p = spawnSync(process.execPath, [path.join(isolated, 'artist-tools', 'psd-to-skin.mjs'), path.join(isolated, 'templates', 'psd', 'tanktrouble-skin-template-4x.psd'), '--out', path.join(isolated, 'psd-out')], { encoding: 'utf8', cwd: isolated });
  assert.equal(p.status, 1, 'a blank template has nothing painted, so nothing is exported');
  assert.match(p.stderr + p.stdout, /Nothing painted|not exported/);
  fs.rmSync(isolated, { recursive: true, force: true });
});
test('guide: sizes, names and the skin.json come from the importer\'s own tables; the problems it quotes still exist in the importer', () => {
  const html = fs.readFileSync(path.join(builtTop, 'START-HERE.html'), 'utf8');
  for (const [name, [sizeName]] of [['base', ['base']], ['tread', ['tread']], ['treadShade0', ['treadShade0']], ['turret0', ['turret0']]]) {
    const s = SPECS[sizeName];
    for (const k of [1, 2, 4]) assert.ok(html.includes(`${s.w * k} × ${s.h * k}`), `${name}: ${k}x size ${s.w * k} × ${s.h * k} is in the guide`);
  }
  for (const name of [...frames.REQUIRED, ...frames.RECOMMENDED]) assert.ok(html.includes(`<code>${name}</code>`), `${name} is named in the guide`);
  assert.ok(html.includes(fs.readFileSync(path.join(exampleDir, 'skin.json'), 'utf8').trim().replace(/&/g, '&amp;').replace(/</g, '&lt;')), 'the guide shows the real skin.json');
  assert.equal((html.match(/class="frame"/g) || []).length, 17, 'all 17 turret frames are explained');
  assert.ok(!/\{\{|\}\}/.test(html), 'no unresolved placeholder');
  assert.ok(!/<script/i.test(html), 'the guide has no script');
  const sources = ['skin-package.js', 'importer.js'].map(n => fs.readFileSync(path.join(root, 'extension', 'src', n), 'utf8')).join('\n');
  for (const fragment of ['must be ', 'has no transparency channel', 'Mixed resolutions', 'Tread shade frames must be all 12', 'the file name must be exactly', 'interlaced PNGs are not supported', 'is completely transparent']) {
    assert.ok(sources.includes(fragment), `the importer no longer says "${fragment}", which the guide quotes`);
  }
});
test('guide: the problems it describes really are what the importer reports for those mistakes', () => {
  const png = (w, h, alpha = true) => new Uint8Array(encodePng(w, h, new Uint8ClampedArray(w * h * 4).fill(255)));
  const good = scale => ['base', 'tread', 'turret0', 'turret1', 'turret2'].map(n => ({ name: `${n}.png`, bytes: png(SPECS[n].w * scale, SPECS[n].h * scale) }));
  const text = pngs => analysePackage({ json: JSON.stringify({ schema: 1, id: 'x' }), pngs }).errors.join('\n');
  assert.match(text([{ name: 'base.png', bytes: png(70, 84) }, ...good(1).slice(1)]), /base\.png: is 70x84; base must be 68x84, 136x168, 272x336/);
  assert.match(text([...good(1).slice(0, 4), { name: 'turret2.png', bytes: png(136, 164) }]), /Mixed resolutions/);
  assert.match(text([...good(1), ...Array.from({ length: 5 }, (_, i) => ({ name: `treadShade${i}.png`, bytes: png(12, 80) }))]), /Tread shade frames must be all 12.*5 found/);
  assert.match(text([{ name: 'Base.PNG', bytes: png(68, 84) }, ...good(1).slice(1)]).concat(text([{ name: 'base.PNG', bytes: png(68, 84) }])), /file name must be exactly|not a frame name/);
});

// ---------------------------------------------------------------- privacy: the kit carries only the TankTrouble username
const privacy = await import(pathToFileURL(path.join(kitSrc, 'privacy.mjs')).href);
test('privacy: the scan finds a forbidden word in any case, in text and binary data, in ASCII and UTF-16, and ignores clean data', () => {
  const word = 'forbiddenword';   // a harmless stand-in: the real identifiers are stored only as salted hashes
  const rule = { len: word.length, sha256: privacy.hashWord(word), scope: 'all', label: 'a test word' };
  const scan = (data, text = false) => privacy.findIdentifiers('t', data, { text, extra: [rule] });
  assert.equal(scan(Buffer.from(`a ${word} b`), true).length, 1);
  assert.equal(scan(Buffer.from(word.toUpperCase()), true).length, 1);
  assert.equal(scan(Buffer.from(`https://example.org/${word}-x`), true).length, 1);
  assert.equal(scan(Buffer.from(word, 'utf16le')).length, 1, 'UTF-16 little-endian (PSD names)');
  assert.equal(scan(Buffer.from(word, 'utf16le').swap16()).length, 1, 'UTF-16 big-endian');
  assert.equal(scan(Buffer.concat([Buffer.from([0, 255, 3]), Buffer.from(word), Buffer.from([7])])).length, 1, 'inside binary data');
  assert.equal(scan(Buffer.from('Bleed made this tank. Nothing else to see.'), true).length, 0);
  assert.equal(scan(Buffer.from(`data:image/png;base64,${Buffer.from(word).toString('base64')}`), true).length, 0, 'embedded pictures are skipped in text');
  assert.deepEqual(privacy.FORBIDDEN.map(r => r.len), [7, 5], 'the shipped rules are still there (changing them is a deliberate act)');
  assert.ok(privacy.FORBIDDEN.every(r => /^[0-9a-f]{64}$/.test(r.sha256)));
});
test('privacy: nothing in the kit\'s sources, tests, generated folder, ZIP, PSD or pictures matches a forbidden identifier', () => {
  const findings = [];
  const walk = (dir, base = '') => fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => (e.isDirectory() ? walk(path.join(dir, e.name), `${base}${e.name}/`) : [`${base}${e.name}`]));
  for (const rel of walk(kitSrc)) findings.push(...privacy.findIdentifiers(`starter-kit/${rel}`, fs.readFileSync(path.join(kitSrc, rel)), { text: !/[.](png|psd)$/.test(rel) }));
  for (const rel of walk(builtTop)) findings.push(...privacy.findIdentifiers(`kit/${rel}`, fs.readFileSync(path.join(builtTop, rel)), { text: !/[.](png|psd)$/.test(rel) }), ...privacy.findIdentifiers(`kit/${rel} (name)`, rel, { text: true }));
  findings.push(...privacy.findIdentifiers('the ZIP', fs.readFileSync(kitZip)));
  for (const e of readZip(fs.readFileSync(kitZip))) findings.push(...privacy.findIdentifiers(`zip:${e.path}`, e.data, { text: !/[.](png|psd)$/.test(e.path) }), ...privacy.findIdentifiers(`zip:${e.path} (name)`, e.path, { text: true }));
  assert.deepEqual(findings, []);
});
test('attribution: the kit says Bleed everywhere it names an owner, keeps Kamarov\'s credit, and its licence is the kit\'s own', () => {
  const read = rel => fs.readFileSync(path.join(builtTop, rel), 'utf8');
  assert.match(read('about/LICENSE.txt'), /^MIT License\n\nCopyright \(c\) 2026 Bleed\n\n/);
  assert.equal(JSON.parse(read('example-skin/skin.json')).author, 'Bleed');
  const guide = read('START-HERE.html');
  assert.ok(guide.includes('an unofficial fan-made kit by Bleed for TankTrouble Skin Tools'), 'header');
  assert.ok(guide.includes('Bleed, MIT licence'), 'footer');
  assert.ok(guide.includes('/releases/latest"'), 'the guide links to the main download (the latest release of the repository)');
  const credits = read('about/CREDITS.txt');
  assert.match(credits, /Copyright \(c\) 2026 Bleed and released under the MIT licence/);
  assert.match(credits, /Textured Tanks[*][*] by Kamarov/);
  assert.ok(credits.includes('https://github.com/kamarov-therussiantank/Textured-Tanks') && credits.includes('Copyright (c) 2026 Kamarov'));
  assert.ok(guide.includes('Kamarov') && guide.includes('Textured Tanks'));
  assert.notEqual(read('about/LICENSE.txt'), fs.readFileSync(path.join(root, 'LICENSE'), 'utf8'), 'the kit has its own licence file, the main one is untouched');
});
