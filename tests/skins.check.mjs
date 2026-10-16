// Browser check of the optional skin collection against the REAL packaged extension: it unpacks the main release ZIP and each skin pack ZIP,
// installs the extension into a brand-new Chrome profile (as "Load unpacked" does) and imports every pack through the panel's own folder picker.
// It checks the decoded pictures against the files, draws every turret frame (and a tread shade) with the extension's own preview, and records
// every network request. No game code, no network.
// Run `npm run build` and `npm run skins` first.   node tests/skins.check.mjs
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { readZip } from '../build/zip.mjs';
import { decode } from '../build/png.mjs';
import { launchWithExtension } from '../tools/chrome.mjs';

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const find = (dir, ext) => (fs.existsSync(dir) ? fs.readdirSync(dir).filter(n => n.endsWith(ext)).sort() : []);
const releaseZip = find(path.join(root, 'dist'), '.zip')[0], packZips = find(path.join(root, 'dist-skins'), '.zip');
if (!releaseZip || !packZips.length) { console.error('build both first: npm run build && npm run skins'); process.exit(1); }
let failures = 0;
const check = (name, ok, detail) => { if (!ok) failures++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok || detail === undefined ? '' : `\n        -> ${JSON.stringify(detail)}`}`); };
const unpack = (zipPath, into) => { for (const e of readZip(fs.readFileSync(zipPath))) { const p = path.join(into, ...e.path.split('/')); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, e.data); } return into; };
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'skins-check-'));
const releaseRoot = unpack(path.join(root, 'dist', releaseZip), path.join(tmp, 'release'));
const release = path.join(releaseRoot, fs.readdirSync(releaseRoot)[0]);
const folders = packZips.map(z => {
  const dir = unpack(path.join(root, 'dist-skins', z), path.join(tmp, z.replace(/\.zip$/, '')));
  const id = fs.readdirSync(dir).find(n => fs.statSync(path.join(dir, n)).isDirectory());
  return { zip: z, dir: path.join(dir, id), id };
});

const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'skins-profile-'));
const { context, extensionId } = await launchWithExtension(path.join(release, 'extension'), profile, { viewport: { width: 1000, height: 760 } });
check('the packaged extension installs into a new profile', /^[a-p]{32}$/.test(extensionId), extensionId);
const requests = [];
const STANDIN = '<!doctype html><html><head><meta charset="utf-8"><title>stand-in</title></head><body style="margin:0;background:#cfd6dc"><div id="game" style="height:500px"></div></body></html>';
await context.route('**/*', route => {
  const url = route.request().url();
  requests.push(url);
  if (url === 'https://tanktrouble.com/game') return route.fulfill({ contentType: 'text/html', body: STANDIN });
  return route.abort();
});
const page = await context.newPage();
const errors = [];
page.on('pageerror', e => errors.push(e.message));
page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(m.text()); });
await page.goto('https://tanktrouble.com/game');
await page.waitForFunction(() => window.TankSkinTools && TankSkinTools.main, null, { timeout: 10000 });
await page.locator('button[aria-label="Open Skin Tools"]').click();
await page.locator('button:has-text("Manage skins")').click();
const importDir = async dir => {
  await page.locator('input[type=file][webkitdirectory]').setInputFiles(dir);
  await page.waitForSelector('.report:not(:has-text("Reading"))', { timeout: 30000 });
  return page.locator('.report').innerText();
};
const outDir = path.join(root, 'dist-skins', 'check');
fs.mkdirSync(outDir, { recursive: true });

for (const { zip, dir, id } of folders) {
  const files = fs.readdirSync(dir).filter(n => n.endsWith('.png'));
  const text = await importDir(dir);
  check(`${zip}: the unzipped skin folder installs with no warnings`, /Installed/.test(text) && !/Note:|Warning|ignored/i.test(text), text);
  const info = await page.evaluate(skinId => { const s = TankSkinTools.main.controller.skins().find(k => k.id === skinId); return s && { frames: s.frames.length, scale: s.scale, tint: s.tint }; }, id);
  check(`${zip}: listed with all ${files.length} pictures at the game's native size, painted (tint none)`, info && info.frames === files.length && info.scale === 1 && ['base', 'tread', 'turret'].every(k => info.tint[k] === 'none'), info);
  const result = await page.evaluate(skinId => {
    const skin = TankSkinTools.main.controller.decoded(skinId);
    const out = {};
    for (const [name, canvas] of skin.frames) out[name] = { w: canvas.width, h: canvas.height, px: Array.from(canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data) };
    return out;
  }, id);
  let bad = null;
  for (const f of files) {
    const name = f.replace('.png', ''), want = decode(fs.readFileSync(path.join(dir, f))), got = result[name];
    if (!got || got.w !== want.width || got.h !== want.height) { bad = { name, size: got && [got.w, got.h] }; break; }
    for (let i = 0; i < want.data.length; i += 4) {
      // a canvas keeps colour premultiplied: compare premultiplied values within rounding
      const a = want.data[i + 3], b = got.px[i + 3];
      if (Math.abs(a - b) > 1 || [0, 1, 2].some(c => Math.abs(want.data[i + c] * a / 255 - got.px[i + c] * b / 255) > 1.6)) { bad = { name, pixel: i / 4 }; break; }
    }
    if (bad) break;
  }
  check(`${zip}: every decoded picture matches its file pixel for pixel`, !bad, bad);
  const sheet = await page.evaluate(skinId => {
    const skin = TankSkinTools.main.controller.decoded(skinId);
    const cells = [];
    const out = document.createElement('canvas'); out.width = 6 * 150; out.height = 3 * 190; const o = out.getContext('2d');
    o.fillStyle = '#cfd6dc'; o.fillRect(0, 0, out.width, out.height);
    for (let i = 0; i < 17; i++) {
      const c = document.createElement('canvas'); c.width = 150; c.height = 190;
      const { missing } = TankSkinTools.preview.draw(c, skin, { angle: 0, turretFrame: `turret${i}`, zoom: 1.7, guides: false, shade: skin.frames.has('treadShade0') ? i % 12 : null });
      const data = c.getContext('2d').getImageData(0, 0, 150, 190).data;
      let sum = 0, tank = 0;
      for (let k = 0; k < data.length; k += 4) { sum = (sum * 31 + data[k] + data[k + 1] * 3 + data[k + 2] * 7) >>> 0; if (data[k] !== 0xcf || data[k + 1] !== 0xd6 || data[k + 2] !== 0xdc) tank++; }
      cells.push({ i, missing, hash: sum, tank });
      o.drawImage(c, (i % 6) * 150, Math.floor(i / 6) * 190);
    }
    return { cells, dataUrl: out.toDataURL('image/png') };
  }, id);
  check(`${zip}: all 17 turret frames draw (none missing, none blank) and differ from one another`, sheet.cells.every(c => !c.missing && c.tank > 3000) && new Set(sheet.cells.map(c => c.hash)).size === 17, sheet.cells);
  fs.writeFileSync(path.join(outDir, `${id}-turret-frames-in-preview.png`), Buffer.from(sheet.dataUrl.split(',')[1], 'base64'));
  if (files.includes('treadShade0.png')) {
    const shades = await page.evaluate(skinId => { const s = TankSkinTools.main.controller.decoded(skinId); return Array.from({ length: 12 }, (_, k) => s.frames.has(`treadShade${k}`)); }, id);
    check(`${zip}: all 12 tread-shade frames are installed (the tread animation)`, shades.every(Boolean), shades);
  }
}
check('no page errors, and the page made no request other than its own', errors.length === 0 && requests.every(u => u === 'https://tanktrouble.com/game'), { errors, requests });
await context.close();
console.log(failures ? `\n${failures} FAILED` : '\nall passed');
process.exit(failures ? 1 : 0);
