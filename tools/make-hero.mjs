// Renders screenshots/hero.png (the README banner) from this project's own icon and screenshots.
//   node tools/make-hero.mjs [--font <TankTrouble.woff2>]   (the font is rendered into the picture only, never copied)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchChrome } from './chrome.mjs';
import { decode, optimise, quantise } from '../build/png.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const fontPath = argv.includes('--font') ? argv[argv.indexOf('--font') + 1] : null;
const font = fontPath && fs.existsSync(fontPath) ? fs.readFileSync(fontPath).toString('base64') : null;
const uri = f => 'data:image/png;base64,' + fs.readFileSync(path.join(root, f)).toString('base64');
const html = `<!doctype html><meta charset="utf-8"><style>
${font ? `@font-face{font-family:TankTrouble;src:url(data:font/woff2;base64,${font}) format('woff2')}` : ''}
html,body{margin:0}body{width:1280px;height:420px;overflow:hidden;position:relative;background:repeating-linear-gradient(45deg,#f1f3f5 0 22px,#e6eaee 22px 44px);font-family:TankTrouble,'Arial Black',Arial,sans-serif}
.title{position:absolute;left:44px;top:56px;width:500px;padding:26px 30px 28px;border-radius:10px;background:#000;color:#fff;box-shadow:0 14px 26px rgba(0,0,0,.3)}
.row{display:flex;align-items:center;gap:18px}.row img{width:84px;height:84px}
h1{margin:0;font:400 46px/1.02 TankTrouble,'Arial Black',Arial,sans-serif;letter-spacing:.5px}
p{margin:18px 0 0;font:400 21px/1.3 TankTrouble,'Arial Black',Arial,sans-serif;color:#ffe680}
small{display:block;margin-top:10px;font:700 15px Arial,sans-serif;color:#cfd6dc}
.shot{position:absolute;right:44px;top:36px;width:600px;border-radius:8px;box-shadow:0 16px 30px rgba(0,0,0,.35)}
.panel{position:absolute;right:30px;bottom:26px;width:228px;border-radius:8px;box-shadow:0 14px 26px rgba(0,0,0,.4)}
.badge{position:absolute;left:48px;bottom:34px;display:flex;gap:10px}
.badge span{padding:6px 14px;border-radius:5px;color:#fff;font:400 16px/1.4 TankTrouble,'Arial Black',Arial,sans-serif;background:linear-gradient(#427fff,#0014ab);box-shadow:0 3px 4px rgba(0,0,0,.45)}
</style>
<div class="title"><div class="row"><img src="${uri('extension/icons/icon128.png')}" alt=""><h1>TankTrouble<br>Skin Tools</h1></div><p>New looks for your tank. Only on your screen.</p><small>Unofficial fan-made add-on for Chrome</small></div>
<div class="badge"><span>Free</span><span>No network</span><span>Visuals only</span></div>
<img class="shot" src="${uri('screenshots/in-game.png')}" alt=""><img class="panel" src="${uri('screenshots/skin-on.png')}" alt="">`;
const browser = await launchChrome();
const page = await browser.newPage({ viewport: { width: 1280, height: 420 } });
await page.setContent(html);
await page.evaluate(() => document.fonts.ready);
const shot = await page.screenshot();
await browser.close();
const png = decode(shot);
const q = quantise(png.data, png.width, png.height);
const out = q.psnr >= 40 ? optimise(q.rgba, png.width, png.height) : optimise(png.data, png.width, png.height);
fs.writeFileSync(path.join(root, 'screenshots', 'hero.png'), out);
console.log(`hero.png ${(out.length / 1024).toFixed(0)} KB (PSNR ${q.psnr.toFixed(1)})`);
