// A labelled contact sheet of pictures, drawn by a local Chrome: for README galleries and review pictures.
//   node skins/tools/sheet.mjs <out.png> [--cols N] [--width W] [--bg #cfd6dc] [--crop x,y,w,h] "caption=path/to/picture.png" ...
// Each picture is scaled to the column width (smooth), so a 4x frame and a 1x game screenshot can sit side by side. Nothing is downloaded.
import fs from 'node:fs';
import path from 'node:path';
import { launchChrome } from '../../tools/chrome.mjs';

const argv = process.argv.slice(2);
const opt = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv.splice(i, 2)[1] : d; };
const crop = (opt('--crop', '') || '').split(',').map(Number);
const cols = Number(opt('--cols', '3')), width = Number(opt('--width', '420')), bg = opt('--bg', '#cfd6dc');
const [out, ...items] = argv;
if (!out || !items.length) { console.error('usage: sheet.mjs <out.png> [--cols N] [--width W] [--bg colour] "caption=picture.png" ...'); process.exit(1); }
const cells = items.map(item => {
  const at = item.indexOf('=');
  const caption = item.slice(0, at), file = item.slice(at + 1);
  const url = `data:image/png;base64,${fs.readFileSync(file).toString('base64')}`;
  const [cx, cy, cw, ch] = crop.length === 4 ? crop : [0, 0, 0, 0];
  const picture = crop.length === 4 ? `<div style="width:${width}px;height:${Math.round(width * ch / cw)}px;overflow:hidden;position:relative"><img src="${url}" style="position:absolute;left:0;top:0;transform-origin:0 0;transform:scale(${width / cw}) translate(${-cx}px,${-cy}px)"></div>` : `<img src="${url}" style="width:${width}px">`;
  return `<figure>${picture}<figcaption>${caption.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</figcaption></figure>`;
}).join('');
const browser = await launchChrome();
const page = await browser.newPage({ viewport: { width: cols * (width + 24) + 24, height: 600 }, deviceScaleFactor: 1 });
await page.setContent(`<!doctype html><body style="margin:0;padding:12px;background:${bg};font:600 14px Arial,sans-serif;color:#2b3640"><style>body>div{display:grid;grid-template-columns:repeat(${cols},${width}px);gap:12px}figure{margin:0}figcaption{padding:4px 0 8px}</style><div>${cells}</div></body>`);
await page.screenshot({ path: path.resolve(out), fullPage: true });
await browser.close();
console.log('wrote', out);
