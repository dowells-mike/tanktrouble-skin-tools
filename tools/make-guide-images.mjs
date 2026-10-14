// Takes the guide's screenshots from the built release (dist/) installed in a fresh Chrome profile, on a plain stand-in page:
// only this project's own panel and skin art appear (no game artwork). Run `npm run build` first.
//   node tools/make-guide-images.mjs [--font <TankTrouble.woff2>]
// --font: the game's own page loads its "TankTrouble" font, which the panel uses. To show the panel as players see it, pass a
// local copy of that font for the screenshots; it is only rendered into the images and never copied into this project.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchWithExtension } from './chrome.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const fontArg = argv.includes('--font') ? argv[argv.indexOf('--font') + 1] : null;
const font = fontArg && fs.existsSync(fontArg) ? fs.readFileSync(fontArg).toString('base64') : null;
const dist = path.join(root, 'dist');
const top = fs.readdirSync(dist).map(n => path.join(dist, n)).find(p => fs.statSync(p).isDirectory());
if (!top) { console.error('run npm run build first'); process.exit(1); }
const out = path.join(root, 'screenshots');
fs.mkdirSync(out, { recursive: true });

const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'skin-tools-guide-'));
fs.mkdirSync(path.join(profile, 'Default'), { recursive: true });
fs.writeFileSync(path.join(profile, 'Default', 'Preferences'), JSON.stringify({ extensions: { ui: { developer_mode: true } } }));
const { context } = await launchWithExtension(path.join(top, 'extension'), profile, { viewport: { width: 1100, height: 760 } });
const PAGE = `<!doctype html><html><head><meta charset="utf-8"><title>TankTrouble</title><style>${font ? `@font-face{font-family:TankTrouble;src:url(data:font/woff2;base64,${font}) format('woff2')}` : ''}
html,body{margin:0;height:100%;background:#fff}body{background:repeating-linear-gradient(45deg,#f4f6f8 0 18px,#eef1f4 18px 36px)}</style></head><body><script>/* a stand-in game object so the panel shows its normal state (no game code) */ window.Phaser = { Game: function () { this.state = { add() {} }; } }; new window.Phaser.Game();</script></body></html>`;
await context.route('https://tanktrouble.com/**', r => r.fulfill({ contentType: 'text/html', body: PAGE }));
const page = await context.newPage();
await page.goto('https://tanktrouble.com/game');
await page.waitForFunction(() => window.TankSkinTools && TankSkinTools.main);
await page.evaluate(() => document.fonts.ready);
// players remembered from earlier matches, so the player picker has names to show (made-up names)
await page.evaluate(() => TankSkinTools.main.controller.update(x => { x.players.p101 = { skin: null, recolor: null, name: 'Ritchie' }; x.players.p102 = { skin: null, recolor: null, name: 'Marigold' }; x.players.p103 = { skin: null, recolor: null, name: 'TankMaster9000' }; x.players.p104 = { skin: null, recolor: null, name: 'Rival' }; }));

const shotPanel = async (name, pad = 10) => {
  const r = await page.evaluate(() => { const root = document.getElementById('tanktrouble-skin-tools-host').shadowRoot; let x0 = 1e9, y0 = 1e9, x1 = 0, y1 = 0; for (const el of root.querySelectorAll('.win, .list, .zoom')) { const q = el.getBoundingClientRect(); x0 = Math.min(x0, q.left); y0 = Math.min(y0, q.top); x1 = Math.max(x1, q.right); y1 = Math.max(y1, q.bottom); } return { x0, y0, x1, y1 }; });
  const clip = { x: Math.max(0, r.x0 - pad), y: Math.max(0, r.y0 - pad) };
  clip.width = Math.min(1100, r.x1 + pad) - clip.x; clip.height = Math.min(760, r.y1 + pad) - clip.y;
  await page.screenshot({ path: path.join(out, name), clip });
  console.log('  wrote', name);
};
const pick = async (label, option) => { await page.locator(`button.trig[aria-label^="${label}"]`).click(); await page.locator('.list li[role=option]', { hasText: option }).first().click(); };
const seg = name => page.locator('[role=radiogroup][aria-label="Who wears the skin"] button', { hasText: name });

await shotPanel('pill.png');
await page.locator('button[aria-label="Open Skin Tools"]').click();
await page.locator('button:has-text("Manage skins")').click();
for (const id of ['golden-tank', 'onyx-tank', '3d-shaders']) { await page.locator('input[type=file][webkitdirectory]').setInputFiles(path.join(top, 'skin-packs', id)); await page.waitForSelector('.report:not(:has-text("Reading"))'); }
await shotPanel('manage-skins.png');
await page.locator('button[aria-label="Back to skin selection"]').click();
await page.locator('button.trig[aria-label^="Skin for your tank"]').click();
await shotPanel('choose-skin.png');
await page.locator('.list li[role=option]', { hasText: 'Golden Tank' }).first().click();
await page.waitForTimeout(200);
await shotPanel('skin-on.png');
await seg('A player').click();
await page.locator('button.trig[aria-label^="Player"]').click();
await page.locator('.list input[type=search]').fill('ri');
await shotPanel('player-search.png');
await page.locator('.list li[role=option]', { hasText: 'Ritchie' }).click();
await pick('Skin for Ritchie', '3D Shaders');
await page.waitForTimeout(200);
await shotPanel('player-chosen.png');
await seg('My tank').click();
await page.locator('button[aria-label^="Enlarge the preview"]').click();
await page.waitForTimeout(200);
await shotPanel('preview.png');
await page.keyboard.press('Escape');
await page.locator('button:has-text("Advanced")').click();
await shotPanel('advanced.png');
await page.locator('button:has-text("Advanced")').click();
await page.locator('button[role=switch]').click();
await shotPanel('skins-off.png');
await page.locator('button[role=switch]').click();

// Chrome's extensions page with developer mode on and the extension loaded (the card shows no folder path)
const ext = await context.newPage();
await ext.setViewportSize({ width: 1100, height: 420 });
await ext.goto('chrome://extensions');
await ext.waitForTimeout(800);
if ((await ext.locator('#devMode').getAttribute('aria-pressed')) !== 'true') await ext.locator('#devMode').click();     // Developer mode, as the guide asks
await ext.waitForTimeout(800);
await ext.screenshot({ path: path.join(out, 'extensions-toolbar.png'), clip: { x: 0, y: 0, width: 1100, height: 108 } });
await ext.screenshot({ path: path.join(out, 'extension-card.png'), clip: { x: 470, y: 214, width: 420, height: 112 } });
console.log('  wrote extensions-toolbar.png, extension-card.png');
await context.close();
try { fs.rmSync(profile, { recursive: true, force: true }); } catch { /* Chrome may hold a file briefly */ }
