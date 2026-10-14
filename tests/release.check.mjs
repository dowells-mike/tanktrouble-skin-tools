// Checks the EXACT packaged release: it unpacks dist/<name>-<version>.zip, installs the extension folder into a brand-new Chrome
// profile the way "Load unpacked" does, and drives it on a stand-in tanktrouble.com page (served locally: no game code, no
// network; every request is recorded). Run `npm run build` first.   node tests/release.check.mjs
// What the game draws is checked separately against the game's real renderer; this check covers installation, the panel,
// importing the example packs, assignments, recolouring, colour modes, removal, persistence across reloads, network silence
// and memory.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readZip } from '../build/zip.mjs';
import { launchWithExtension } from '../tools/chrome.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');
const zipName = fs.existsSync(dist) && fs.readdirSync(dist).find(n => n.endsWith('.zip') && !n.endsWith('-extension.zip'));
if (!zipName) { console.error('no release ZIP: run npm run build first'); process.exit(1); }
let failures = 0;
const check = (name, ok, detail) => { if (!ok) failures++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok || detail === undefined ? '' : `\n        -> ${JSON.stringify(detail)}`}`); };

// 1. unpack the archive itself into a temporary folder
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'skin-tools-release-'));
for (const e of readZip(fs.readFileSync(path.join(dist, zipName)))) { const p = path.join(tmp, ...e.path.split('/')); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, e.data); }
const top = path.join(tmp, zipName.replace(/\.zip$/, ''));
const extensionDir = path.join(top, 'extension');
const packs = fs.readdirSync(path.join(top, 'skin-packs'));
console.log(`unpacked ${zipName}: extension + ${packs.length} skin packs`);

// 2. a brand-new profile with the extension installed
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'skin-tools-profile-'));
const { context, extensionId } = await launchWithExtension(extensionDir, profile, { viewport: { width: 1000, height: 760 } });
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
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
const open = async () => { await page.goto('https://tanktrouble.com/game'); await page.waitForFunction(() => window.TankSkinTools && TankSkinTools.main, null, { timeout: 10000 }); };
const state = () => page.evaluate(() => { const c = TankSkinTools.main.controller; return { settings: JSON.parse(JSON.stringify(c.settings())), skins: c.skins().map(k => ({ id: k.id, frames: k.frames.length, tint: k.tint.base })) }; });
await open();
check('the extension\'s scripts run on tanktrouble.com and the panel mounts as a small pill', (await page.locator('button[aria-label="Open Skin Tools"]').count()) === 1);
const other = await context.newPage();
await other.route('**/*', r => r.fulfill({ contentType: 'text/html', body: '<!doctype html><title>x</title>' }));
await other.goto('https://example.org/');
check('…and nowhere else', await other.evaluate(() => typeof window.TankSkinTools === 'undefined' && !document.getElementById('tanktrouble-skin-tools-host')));
await other.close();

// 3. import every example pack through the panel's folder picker
await page.locator('button[aria-label="Open Skin Tools"]').click();
await page.locator('button:has-text("Manage skins")').click();
for (const id of packs) {
  await page.locator('input[type=file][webkitdirectory]').setInputFiles(path.join(top, 'skin-packs', id));
  await page.waitForSelector('.report:not(:has-text("Reading"))');
  const text = await page.locator('.report').innerText();
  check(`example pack "${id}" installs`, /Installed/.test(text), text);
}
let st = await state();
check('all packs are listed with every frame', st.skins.length === packs.length && st.skins.every(k => k.frames === fs.readdirSync(path.join(top, 'skin-packs', k.id)).length - 1), st.skins);
check('3D Shaders keeps the player\'s colours (tint "player"); the others are painted', st.skins.find(k => k.id === '3d-shaders').tint === 'player' && st.skins.find(k => k.id === 'golden-tank').tint === 'none');
await page.locator('button[aria-label="Back to skin selection"]').click();

// 4. assignments, recolour, colour mode
const pick = async (label, name) => { await page.locator(`button.trig[aria-label^="${label}"]`).click(); await page.locator('.list li[role=option]', { hasText: name }).first().click(); };
const seg = name => page.locator('[role=radiogroup][aria-label="Who wears the skin"] button', { hasText: name });
await pick('Skin for your tank', 'Golden Tank');
await seg('Everyone').click(); await pick('Skin for everyone', 'Onyx Tank');
await seg('My tank').click(); await pick('Skin for your tank', '3D Shaders');
await page.locator('button:has-text("Advanced")').click();
await page.locator('.colours input[type=color]').first().fill('#ff3399');
await page.locator('[role=radiogroup][aria-label^="Colour mode"] button', { hasText: 'As painted' }).click();
await page.waitForTimeout(300);
st = await state();
check('My tank, Everyone, recolour and colour mode are stored', st.settings.defaults.own.skin === '3d-shaders' && st.settings.defaults.others.skin === 'onyx-tank' && st.settings.defaults.own.recolor.base === 0xff3399 && st.skins.find(k => k.id === '3d-shaders').tint === 'none', st.settings.defaults);
await page.locator('[role=radiogroup][aria-label^="Colour mode"] button', { hasText: 'Player’s colour' }).click();
await page.locator('button[role=switch]').click();
await page.waitForTimeout(300);

// 5. reload: everything is still there (IndexedDB and localStorage of the page's origin)
await open();
st = await state();
check('after a reload: skins, assignments, recolour, colour mode and the off switch are kept', st.skins.length === packs.length && st.settings.defaults.own.skin === '3d-shaders' && st.settings.defaults.own.recolor.base === 0xff3399 && st.settings.enabled === false && st.skins.find(k => k.id === '3d-shaders').tint === 'player', st);
check('the panel reopens where it was left (expanded)', (await page.locator('text=Who wears it').count()) === 1);
await page.locator('button[role=switch]').click();
check('the switch turns skins back on', (await state()).settings.enabled === true);

// 6. remove a pack (with its confirmation), then clear every assignment
await page.locator('button:has-text("Manage skins")').click();
await page.locator('button[aria-label="Remove Onyx Tank"]').click();
await page.locator('.confirm button:has-text("Remove")').click();
await page.waitForTimeout(300);
await open();
st = await state();
check('a removed skin stays removed after a reload, and nothing still points at it', !st.skins.some(k => k.id === 'onyx-tank') && !(st.settings.defaults.others && st.settings.defaults.others.skin === 'onyx-tank'), st);
if ((await page.locator('button[aria-label="Back to skin selection"]').count())) await page.locator('button[aria-label="Back to skin selection"]').click();
if (!(await page.locator('.adv').count())) await page.locator('button:has-text("Advanced")').click();
await page.locator('button:has-text("Clear assignments")').click();
await page.locator('.confirm button:has-text("Clear")').click();
await page.waitForTimeout(300);
st = await state();
check('clearing assignments keeps the installed skins', st.settings.defaults.own === null && st.skins.length === packs.length - 1);

// 7. no network, no errors, memory
const cdp = await context.newCDPSession(page);
await cdp.send('Performance.enable');
await cdp.send('HeapProfiler.collectGarbage');
const heap = (await cdp.send('Performance.getMetrics')).metrics.find(m => m.name === 'JSHeapUsedSize').value;
const unexpected = requests.filter(u => u !== 'https://tanktrouble.com/game');
check('the extension made no network requests (only the page itself was loaded)', unexpected.length === 0, unexpected.slice(0, 5));
check('no page errors', errors.length === 0, errors.slice(0, 3));
check(`page JS heap with ${packs.length - 1} skins installed stays small (${(heap / 1048576).toFixed(1)} MB < 20 MB)`, heap < 20 * 1048576, heap);
await context.close();
fs.rmSync(tmp, { recursive: true, force: true });
try { fs.rmSync(profile, { recursive: true, force: true }); } catch { /* Chrome may still hold a file for a moment */ }
console.log(failures ? `\n${failures} FAILED` : '\nALL PASSED');
process.exit(failures ? 1 : 0);
