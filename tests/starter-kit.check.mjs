// Browser check of the Skin Creator Starter Kit against the REAL packaged extension: it unpacks the main release ZIP and the kit ZIP, installs the
// extension into a brand-new Chrome profile (as "Load unpacked" does) and, through the panel's own folder picker, imports
//   1. the kit's example skin,   2. the skin the kit's converter makes from the kit's example atlas,   3. four deliberately broken copies.
// It checks the decoded pictures against the files, draws every turret frame with the extension's own preview, and checks that the panel's error
// messages are the ones the guide quotes. No game code, no network (every request is recorded).
// Run `npm run build` and `npm run starter-kit` first.   node tests/starter-kit.check.mjs
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { readZip } from '../build/zip.mjs';
import { launchWithExtension } from '../tools/chrome.mjs';

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const find = (dir, ext) => fs.existsSync(dir) && fs.readdirSync(dir).find(n => n.endsWith(ext));
const releaseZip = find(path.join(root, 'dist'), '.zip'), kitZip = find(path.join(root, 'dist-starter-kit'), '.zip');
if (!releaseZip || !kitZip) { console.error('build both first: npm run build && npm run starter-kit'); process.exit(1); }
let failures = 0;
const check = (name, ok, detail) => { if (!ok) failures++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok || detail === undefined ? '' : `\n        -> ${JSON.stringify(detail)}`}`); };

const unpack = (zipPath, into) => { for (const e of readZip(fs.readFileSync(zipPath))) { const p = path.join(into, ...e.path.split('/')); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, e.data); } return path.join(into, fs.readdirSync(into)[0]); };
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'starter-kit-check-'));
const release = unpack(path.join(root, 'dist', releaseZip), path.join(tmp, 'release'));
const kit = unpack(path.join(root, 'dist-starter-kit', kitZip), path.join(tmp, 'kit'));
const exampleDir = path.join(kit, 'example-skin');
const { decodePng, encodePng } = require(path.join(kit, 'artist-tools', 'lib', 'png.js'));
const { downsample } = require(path.join(kit, 'artist-tools', 'lib', 'resample.js'));
const files = dir => fs.readdirSync(dir).map(f => path.join(dir, f));

// the converter, run exactly as a user would from the unpacked kit
const converted = path.join(tmp, 'converted');
const run = spawnSync(process.execPath, [path.join(kit, 'artist-tools', 'atlas-to-skin.mjs'), path.join(kit, 'artist-tools', 'example-atlas', 'classic-tank-atlas.json'), '--out', converted, '--id', 'converted-example', '--tint', 'player', '--name', 'Converted example', '--author', 'Bleed'], { encoding: 'utf8' });
check('the converter turns the kit\'s example atlas into a skin folder (exit 0)', run.status === 0, run.stdout + run.stderr);

// the PSD route: the kit's layered template with every picture "painted" (from the example), exported by the shipped psd-to-skin
const templates = await import(pathToFileURL(path.join(root, 'starter-kit', 'src', 'generators', 'templates.mjs')).href);
const frames = require(path.join(kit, 'artist-tools', 'lib', 'frames.js'));
const examplePictures = Object.fromEntries(fs.readdirSync(exampleDir).filter(n => n.endsWith('.png')).map(n => [n.replace('.png', ''), decodePng(fs.readFileSync(path.join(exampleDir, n)))]));
const doc = templates.psdDocument(4, { art: examplePictures });
const up2 = p => { const out = new Uint8ClampedArray(p.width * 2 * p.height * 2 * 4); for (let y = 0; y < p.height * 2; y++) for (let x = 0; x < p.width * 2; x++) out.set(p.data.subarray(((y >> 1) * p.width + (x >> 1)) * 4, ((y >> 1) * p.width + (x >> 1)) * 4 + 4), (y * p.width * 2 + x) * 4); return out; };
const paint = nodes => { for (const n of nodes) { if (n.type === 'group') paint(n.children); else if (frames.SPECS[n.name]) n.rgba = up2(examplePictures[n.name]); } };
paint(doc.layers);
const psdFile = path.join(tmp, 'painted.psd');
fs.writeFileSync(psdFile, templates.buildPsd({ ...doc, rle: true }));
const psdOut = path.join(tmp, 'psd-skin');
const psdRun = spawnSync(process.execPath, [path.join(kit, 'artist-tools', 'psd-to-skin.mjs'), psdFile, '--out', psdOut, '--scale', '2', '--id', 'psd-classic', '--name', 'PSD classic', '--tint', 'player', '--author', 'Bleed'], { encoding: 'utf8' });
check('the shipped psd-to-skin exports the painted PSD template (31 pictures, no warnings, tracing layers ignored)', psdRun.status === 0 && /31 PNG/.test(psdRun.stdout) && !/WARN/.test(psdRun.stdout), psdRun.stdout + psdRun.stderr);

// eight broken copies of the example: the mistakes the guide's troubleshooting table lists (same examples as the guide quotes)
const { rgbNoAlpha, interlaced } = await import(pathToFileURL(path.join(root, 'starter-kit', 'panel-messages.mjs')).href);
const broken = {};
const copyExample = name => { const d = path.join(tmp, `broken-${name}`); fs.cpSync(exampleDir, d, { recursive: true }); broken[name] = d; return d; };
{ const d = copyExample('size'); fs.writeFileSync(path.join(d, 'base.png'), encodePng(70, 84, new Uint8ClampedArray(70 * 84 * 4).fill(255))); }
{ const d = copyExample('missing'); fs.rmSync(path.join(d, 'turret0.png')); }
{ const d = copyExample('alpha'); fs.writeFileSync(path.join(d, 'turret0.png'), rgbNoAlpha(136, 164)); }
{ const d = copyExample('mixed'); const p = decodePng(fs.readFileSync(path.join(d, 'turret2.png'))); fs.writeFileSync(path.join(d, 'turret2.png'), encodePng(68, 82, downsample(p.data, p.width, p.height, 2).data)); }
{ const d = copyExample('shades'); for (const n of [5, 6, 7]) fs.rmSync(path.join(d, `treadShade${n}.png`)); }
{ const d = copyExample('name'); fs.renameSync(path.join(d, 'base.png'), path.join(d, 'base.tmp')); fs.renameSync(path.join(d, 'base.tmp'), path.join(d, 'base.PNG')); }
{ const d = copyExample('interlaced'); fs.writeFileSync(path.join(d, 'turret0.png'), interlaced(136, 164)); }
{ const d = copyExample('empty'); fs.writeFileSync(path.join(d, 'turret1.png'), encodePng(136, 164, new Uint8ClampedArray(136 * 164 * 4))); }

const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'starter-kit-profile-'));
const { context, extensionId } = await launchWithExtension(path.join(release, 'extension'), profile, { viewport: { width: 1000, height: 760 } });
check('the packaged extension installs into a new profile', /^[a-p]{32}$/.test(extensionId), extensionId);
const requests = [];
const STANDIN = '<!doctype html><html><head><meta charset="utf-8"><title>stand-in</title></head><body style="margin:0;background:#cfd6dc"><div id="game" style="height:500px"></div></body></html>';
await context.route('**/*', route => { const url = route.request().url(); requests.push(url); if (url === 'https://tanktrouble.com/game') return route.fulfill({ contentType: 'text/html', body: STANDIN }); return route.abort(); });
const page = await context.newPage();
const errors = [];
page.on('pageerror', e => errors.push(e.message));
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto('https://tanktrouble.com/game');
await page.waitForFunction(() => window.TankSkinTools && TankSkinTools.main, null, { timeout: 10000 });
await page.locator('button[aria-label="Open Skin Tools"]').click();
await page.locator('button:has-text("Manage skins")').click();
const importDir = async dir => {
  await page.locator('input[type=file][webkitdirectory]').setInputFiles(dir);
  await page.waitForSelector('.report:not(:has-text("Reading"))', { timeout: 20000 });
  return page.locator('.report').innerText();
};

// 1. the example skin
let text = await importDir(exampleDir);
check('the kit\'s example skin installs with no warnings', /Installed/.test(text) && !/Note:|Warning|ignored/i.test(text), text);

// 2. the converter's output
text = await importDir(psdOut);
check('the skin exported from the PSD installs too', /Installed/.test(text), text);
text = await importDir(converted);
check('the skin made by the converter installs too', /Installed/.test(text), text);
const listed = await page.evaluate(() => TankSkinTools.main.controller.skins().map(k => ({ id: k.id, frames: k.frames.length, scale: k.scale, tint: k.tint.base })));
check('all three are listed with all 31 pictures, 2x art, tinted with each player colour', listed.length === 3 && listed.every(k => k.frames === 31 && k.scale === 2 && k.tint === 'player'), listed);

// 3. what the importer decoded is what the files say: every picture at the game's native size, reduced exactly as documented
const expected = {};
for (const f of fs.readdirSync(exampleDir).filter(n => n.endsWith('.png'))) { const p = decodePng(fs.readFileSync(path.join(exampleDir, f))); expected[f.replace('.png', '')] = { ...downsample(p.data, p.width, p.height, 2) }; }
for (const id of ['classic-tank', 'converted-example', 'psd-classic']) {
  const result = await page.evaluate(id => {
    const skin = TankSkinTools.main.controller.decoded(id);
    const out = {};
    for (const [name, canvas] of skin.frames) out[name] = { w: canvas.width, h: canvas.height, px: Array.from(canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data) };
    return out;
  }, id);
  const names = Object.keys(result);
  let bad = null;
  for (const name of names) {
    const want = expected[name], got = result[name];
    if (!want || got.w !== want.width || got.h !== want.height) { bad = { name, size: [got.w, got.h], want: want && [want.width, want.height] }; break; }
    for (let i = 0; i < want.data.length; i += 4) {
      // a canvas keeps colour premultiplied, so compare premultiplied values (within rounding) and the alpha itself
      const a = want.data[i + 3], b = got.px[i + 3];
      if (Math.abs(a - b) > 1 || [0, 1, 2].some(c => Math.abs(want.data[i + c] * a / 255 - got.px[i + c] * b / 255) > 1.6)) { bad = { name, pixel: i / 4, want: [...want.data.slice(i, i + 4)], got: got.px.slice(i, i + 4) }; break; }
    }
    if (bad) break;
  }
  check(`${id}: all ${names.length} decoded pictures are the native size and match the files pixel for pixel`, names.length === 31 && !bad, bad);
}

// 4. every turret frame, and a tread shade, drawn by the extension's own preview (assembled like the game's tank); none is "missing"
const sheet = await page.evaluate(() => {
  const skin = TankSkinTools.main.controller.decoded('classic-tank');
  const cells = [];
  const out = document.createElement('canvas'); out.width = 6 * 150; out.height = 3 * 190; const o = out.getContext('2d');
  o.fillStyle = '#cfd6dc'; o.fillRect(0, 0, out.width, out.height);
  for (let i = 0; i < 17; i++) {
    const c = document.createElement('canvas'); c.width = 150; c.height = 190;
    const { missing } = TankSkinTools.preview.draw(c, skin, { angle: 0, turretFrame: `turret${i}`, zoom: 1.7, guides: true, shade: i % 12 });
    const data = c.getContext('2d').getImageData(0, 0, 150, 190).data;
    let sum = 0, tank = 0; for (let k = 0; k < data.length; k += 4) { sum = (sum * 31 + data[k] + data[k + 1] * 3 + data[k + 2] * 7) >>> 0; if (data[k] !== 0xcf || data[k + 1] !== 0xd6 || data[k + 2] !== 0xdc) tank++; }
    cells.push({ i, missing, hash: sum, tank });
    o.drawImage(c, (i % 6) * 150, Math.floor(i / 6) * 190);
  }
  return { cells, dataUrl: out.toDataURL('image/png') };
});
check('all 17 turret frames draw (none missing, none blank) and look different from one another', sheet.cells.every(c => !c.missing && c.tank > 3000) && new Set(sheet.cells.map(c => c.hash)).size === 17, sheet.cells);
const checkDir = path.join(root, 'dist-starter-kit', 'check');
fs.mkdirSync(checkDir, { recursive: true });
fs.writeFileSync(path.join(checkDir, 'turret-frames-in-preview.png'), Buffer.from(sheet.dataUrl.split(',')[1], 'base64'));

// 5. the mistakes the guide describes: the REAL panel shows exactly the line the guide quotes, and nothing is installed
const before = (await page.evaluate(() => TankSkinTools.main.controller.skins().length));
const decodeHtml = s => s.replace(/<style[\s\S]*?<\/style>/g, ' ').replace(/<[^>]+>/g, ' ').replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/\s+/g, ' ');
// the order of the two sizes in the "different sizes" line depends on which file the importer met first
const norm = s => s.replace(/\s+/g, ' ').replace(/\((\d)x and (\d)x\)/, (_, a, b) => `(${Math.min(a, b)}x and ${Math.max(a, b)}x)`).trim();
const guideText = norm(decodeHtml(fs.readFileSync(path.join(kit, 'START-HERE.html'), 'utf8')));
const HEADERS = ['This skin was not installed', 'Fix these and add the files again:', 'What size should the images be?'];
for (const [name, dir] of Object.entries(broken)) {
  text = await importDir(dir);
  const lines = text.split('\n').map(l => l.trim()).filter(l => l && !HEADERS.includes(l));
  check(`broken copy "${name}": refused, with a line the guide quotes word for word`, !/Installed/.test(text) && lines.length >= 1 && lines.length <= 2 && guideText.includes(norm(lines[0])), { lines });   // a renamed file is also reported missing: the first line is the cause
}
check('…and nothing was installed by the refused imports', (await page.evaluate(() => TankSkinTools.main.controller.skins().length)) === before);
check('no page errors, and the page made no request other than its own', errors.length === 0 && requests.every(u => u === 'https://tanktrouble.com/game'), { errors, requests });
await context.close();
console.log(failures ? `\n${failures} FAILED` : '\nall passed');
process.exit(failures ? 1 : 0);
