// Screenshots for the starter-kit guide: the REAL Skin Tools panel (from the built release in dist/, run `npm run build` first) with the example
// skin installed, on a plain stand-in page. Only this project's own panel and the kit's own art appear.
//   node starter-kit/make-guide-shots.mjs [--font <TankTrouble.woff2>]
// --font: the game's page loads its "TankTrouble" font, which the panel uses; pass a local copy to show the panel as players see it
// (it is only rendered into the images and never copied into this project).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchWithExtension } from '../tools/chrome.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const fontArg = argv.includes('--font') ? argv[argv.indexOf('--font') + 1] : null;
const font = fontArg && fs.existsSync(fontArg) ? fs.readFileSync(fontArg).toString('base64') : null;
const dist = path.join(root, 'dist');
const top = fs.existsSync(dist) && fs.readdirSync(dist).map(n => path.join(dist, n)).find(p => fs.statSync(p).isDirectory());
if (!top) { console.error('run npm run build first'); process.exit(1); }
const out = path.join(root, 'starter-kit', 'guide-images');
const skin = path.join(root, 'starter-kit', 'example-skin');
fs.mkdirSync(out, { recursive: true });

const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'starter-kit-shots-'));
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

const shotPanel = async (name, pad = 10) => {
  const r = await page.evaluate(() => { const root = document.getElementById('tanktrouble-skin-tools-host').shadowRoot; let x0 = 1e9, y0 = 1e9, x1 = 0, y1 = 0; for (const el of root.querySelectorAll('.win, .list, .zoom')) { const q = el.getBoundingClientRect(); x0 = Math.min(x0, q.left); y0 = Math.min(y0, q.top); x1 = Math.max(x1, q.right); y1 = Math.max(y1, q.bottom); } return { x0, y0, x1, y1 }; });
  const clip = { x: Math.max(0, r.x0 - pad), y: Math.max(0, r.y0 - pad) };
  clip.width = Math.min(1100, r.x1 + pad) - clip.x; clip.height = Math.min(760, r.y1 + pad) - clip.y;
  await page.screenshot({ path: path.join(out, name), clip });
  console.log('  wrote', name);
};
await page.locator('button[aria-label="Open Skin Tools"]').click();
await page.locator('button:has-text("Manage skins")').click();
await shotPanel('panel-manage-empty.png');
await page.locator('input[type=file][webkitdirectory]').setInputFiles(skin);
await page.waitForSelector('.report:not(:has-text("Reading"))');
console.log('  import report:', (await page.locator('.report').innerText()).replace(/\s+/g, ' ').slice(0, 160));
await shotPanel('panel-manage-installed.png');
await page.locator('button[aria-label="Back to skin selection"]').click();
await page.locator('button.trig[aria-label^="Skin for your tank"]').click();
await page.locator('.list li[role=option]', { hasText: 'Classic Tank' }).first().click();
// the classic tank takes the player's colour: show it plain white, the way the game's own tank looks before it is coloured
await page.locator('button:has-text("Advanced")').click();
await page.locator('button.fold:has-text("Preview tools")').click();
for (const label of ['Body', 'Turret', 'Treads']) await page.locator(`input[aria-label="Sample ${label} colour"]`).fill('#ffffff');
await page.locator('button.fold:has-text("Preview tools")').click();
await page.locator('button:has-text("Advanced")').click();
await page.waitForTimeout(350);
await shotPanel('panel-chosen.png');
await page.locator('button[aria-label^="Enlarge the preview"]').click();
await page.waitForTimeout(250);
await shotPanel('panel-preview.png', 14);
// all 17 turret frames, drawn by the extension's own preview (assembled like the game's tank; red = hitbox, orange = barrel box, green = muzzle)
const sheet = await page.evaluate(() => {
  const skin = TankSkinTools.main.controller.decoded('classic-tank');
  const out = document.createElement('canvas'); out.width = 6 * 150; out.height = 3 * 190;
  const o = out.getContext('2d');
  o.fillStyle = '#cfd6dc'; o.fillRect(0, 0, out.width, out.height);
  for (let i = 0; i < 17; i++) {
    const c = document.createElement('canvas'); c.width = 150; c.height = 190;
    TankSkinTools.preview.draw(c, skin, { angle: 0, turretFrame: `turret${i}`, zoom: 1.7, guides: true, shade: i % 12, colours: { base: 0xffffff, tread: 0xffffff, turret: 0xffffff } });
    o.drawImage(c, (i % 6) * 150, Math.floor(i / 6) * 190);
  }
  return out.toDataURL('image/png');
});
fs.writeFileSync(path.join(out, 'turret-frames.png'), Buffer.from(sheet.split(',')[1], 'base64'));
console.log('  wrote turret-frames.png');
await context.close();
