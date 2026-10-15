// Renders the kit's guide (src/guide.html) into ONE self-contained file: the example skin's pictures, the panel screenshots and the generated
// diagrams are embedded, and every size and turret table is generated from extension/src/frames.js (the table the importer checks against), so
// the guide cannot disagree with what Skin Tools accepts.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url));
const frames = require('../extension/src/frames.js');
const { decodePng, encodePng } = require('./src/artist-tools/lib/png.js');
const { frameRect, rightTreadRect, DOC } = require('./src/artist-tools/lib/layout.js')(frames);
const { SPECS } = frames;
const { panelMessages } = await import('./panel-messages.mjs');

const dataUri = bytes => `data:image/png;base64,${Buffer.from(bytes).toString('base64')}`;

/** Source-over blend of straight-alpha RGBA `src` onto `dst` at (ox, oy). */
export function blend(dst, dw, src, sw, sh, ox, oy) {
  for (let y = 0; y < sh; y++) for (let x = 0; x < sw; x++) {
    const s = (y * sw + x) * 4, d = ((oy + y) * dw + ox + x) * 4, sa = src[s + 3] / 255;
    if (!sa) continue;
    const da = dst[d + 3] / 255, oa = sa + da * (1 - sa);
    for (let c = 0; c < 3; c++) dst[d + c] = Math.round((src[s + c] * sa + dst[d + c] * da * (1 - sa)) / oa);
    dst[d + 3] = Math.round(oa * 255);
  }
}

/** The part of an RGBA picture inside a rectangle. */
function crop(image, x, y, w, h) {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let r = 0; r < h; r++) data.set(image.data.subarray(((y + r) * image.width + x) * 4, ((y + r) * image.width + x + w) * 4), r * w * 4);
  return { width: w, height: h, data };
}

/** The finished tank, assembled the way the game stacks the pictures (body, both treads, a tread shade, the idle turret), on the template's document. */
export function assemble(skinDir, scale, shade = 3) {
  const w = DOC.w * scale, h = DOC.h * scale;
  const canvas = new Uint8ClampedArray(w * h * 4);
  const put = (name, rect) => { const p = decodePng(fs.readFileSync(path.join(skinDir, `${name}.png`))); blend(canvas, w, p.data, p.width, p.height, rect.x * scale, rect.y * scale); };
  put('base', frameRect('base'));
  for (const rect of [frameRect('tread'), rightTreadRect()]) { put('tread', rect); put(`treadShade${shade}`, rect); }
  put('turret0', frameRect('turret0'));
  return { width: w, height: h, data: canvas };
}

const TURRETS = [
  ['The default gun, idle', 'turret0'],
  ['The default gun firing: <b>recoil</b> (barrel pulled back, flash), played first', 'turret1'],
  ['The default gun firing: recoil, second step, then back to <code>turret0</code>', 'turret2'],
  ['<b>Laser</b>, idle (the game draws the beam itself)', 'turret3'],
  ['<b>Double barrel</b>, idle', 'turret4'],
  ['Double barrel, <b>left</b> barrel firing (first step)', 'turret5'],
  ['Double barrel, left barrel firing (second step)', 'turret6'],
  ['Double barrel, <b>right</b> barrel firing (first step)', 'turret7'],
  ['Double barrel, right barrel firing (second step)', 'turret8'],
  ['<b>Shotgun</b>, idle', 'turret9'],
  ['Shotgun recoil', 'turret10'],
  ['Shotgun pump (recoil plays 9, 10, 11, 10, 9)', 'turret11'],
  ['<b>Homing missile</b> loaded', 'turret12'],
  ['Homing missile after launch (the missile is in flight)', 'turret13'],
  ['<b>Mine layer</b>', 'turret14'],
  ['<b>Gatling gun</b>: idle, and one half of the spin', 'turret15'],
  ['Gatling gun: the other half (15 and 16 alternate, faster as it charges)', 'turret16']
];

const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
/** [message key, what to do] in the order the guide lists them. The messages themselves come from the extension's own code (panel-messages.mjs). */
const FIXES = [
  ['size', 'The canvas was resized or cropped. Start again from the template, or set the canvas back to the exact size without resampling.'],
  ['missing', 'Add it: every skin needs <code>base</code>, <code>tread</code> and <code>turret0</code>.'],
  ['alpha', 'Export PNG-24 <b>with transparency</b> (RGBA) and no background layer.'],
  ['mixed', 'Export every picture at the same scale (all 1×, all 2× or all 4×).'],
  ['shades', 'Add the missing <code>treadShade</code> pictures, or remove the ones you have.'],
  ['name', 'Rename it exactly, for example <code>turret3.png</code>: the picture name, lower-case <code>.png</code>, no spaces.'],
  ['interlaced', 'Switch interlacing off in the export options.'],
  ['empty', 'Nothing was painted in that file, or the wrong layer was exported. Hide only the guides layer and export again.']
];

/** @returns {string} the finished guide */
export function renderGuide({ skinDir, imagesDir, wholeTankGuide, kit, version, extensionVersion, repoUrl, year }) {
  const art = name => dataUri(fs.readFileSync(path.join(skinDir, `${name}.png`)));
  const assembled = assemble(skinDir, 2);
  const withGuides = { ...assembled, data: new Uint8ClampedArray(assembled.data) };
  const guides = decodePng(wholeTankGuide);
  blend(withGuides.data, withGuides.width, guides.data, guides.width, guides.height, 0, 0);
  const fmt = (name, s) => `${SPECS[name].w * s} × ${SPECS[name].h * s}`;
  const sizeRow = (label, name) => `<tr><td class="n"><code>${label}</code></td><td>${fmt(name, 1)}</td><td>${fmt(name, 2)}</td><td>${fmt(name, 4)}</td></tr>`;
  const messages = panelMessages();
  const tables = {
    problems: [...FIXES.map(([key, fix]) => `<tr><td>“${esc(messages[key])}”</td><td>${fix}</td></tr>`),
      '<tr><td>Something looks shifted in the game</td><td>Check the picture against <code>templates/guides</code>: the tank centre is (34, 42) in the body and (34, 57) in a turret, and the muzzle is (34, 7).</td></tr>'].join('\n'),
    sizes: [sizeRow('base', 'base'), sizeRow('tread', 'tread'), sizeRow('treadShade0 … treadShade11', 'treadShade0'), sizeRow('turret0 … turret16', 'turret0')].join('\n'),
    turrets: TURRETS.map(([text, name]) => `<div class="frame"><img src="${art(name)}" alt="${name}"><div><code>${name}</code><br>${text}</div></div>`).join('\n')
  };
  const view = image => { const c = crop(image, 14 * 2, 30 * 2, 112 * 2, 136 * 2); return dataUri(encodePng(c.width, c.height, c.data)); };   // the tank and a margin, not the whole template page
  const generated = { assembled: view(assembled), 'assembled-guides': view(withGuides) };
  const skinJson = fs.readFileSync(path.join(skinDir, 'skin.json'), 'utf8').trim().replace(/&/g, '&amp;').replace(/</g, '&lt;');
  let html = fs.readFileSync(path.join(here, 'src', 'guide.html'), 'utf8');
  html = html.replace(/\{\{img:([\w.-]+)\}\}/g, (_, name) => dataUri(fs.readFileSync(path.join(imagesDir, name))))
    .replace(/\{\{art:(\w+)\}\}/g, (_, name) => art(name))
    .replace(/\{\{gen:([\w-]+)\}\}/g, (_, name) => { if (!generated[name]) throw new Error(`guide: unknown generated picture ${name}`); return generated[name]; })
    .replace(/\{\{table:(\w+)\}\}/g, (_, name) => { if (!tables[name]) throw new Error(`guide: unknown table ${name}`); return tables[name]; })
    .replace('{{skinjson}}', () => skinJson)
    .replaceAll('{{repo}}', repoUrl).replaceAll('{{version}}', version).replaceAll('{{kit}}', kit).replaceAll('{{extension}}', extensionVersion).replaceAll('{{year}}', String(year));
  const left = html.match(/\{\{[^}]*\}\}/);
  if (left) throw new Error(`guide: unresolved placeholder ${left[0]}`);
  return html;
}
