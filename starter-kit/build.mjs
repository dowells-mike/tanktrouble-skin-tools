// Builds the Skin Creator Starter Kit: a SEPARATE optional download (it is not part of the main release ZIP and does not change it).
//   node starter-kit/build.mjs [--out <dir>]        default output: dist-starter-kit/
//   dist-starter-kit/<name>-<version>/              the folder
//   dist-starter-kit/<name>-<version>.zip           the same folder as one ZIP (what goes on a GitHub release)
//   dist-starter-kit/INVENTORY.md                   every file, its size and SHA-256
// Everything in the kit is produced by an explicit rule below; the build fails on anything else. Deterministic: same sources, same bytes.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { writeZip, readZip } from '../build/zip.mjs';
import { chunkTypes } from '../build/png.mjs';
import { auditFile } from '../build/audit.mjs';
import { syncLibs } from './sync-libs.mjs';
import { pngTemplates, psdTemplate } from './src/generators/templates.mjs';
import { renderGuide } from './guide.mjs';
import { findIdentifiers } from './privacy.mjs';

const require = createRequire(import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const argv = process.argv.slice(2);
const opt = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const kit = JSON.parse(fs.readFileSync(path.join(here, 'kit.json'), 'utf8'));
const extensionVersion = JSON.parse(fs.readFileSync(path.join(root, 'extension', 'manifest.json'), 'utf8')).version;
const dist = path.resolve(root, opt('--out', 'dist-starter-kit'));
const folderName = `${kit.name}-${kit.version}`;
const out = path.join(dist, folderName);
const sha = b => crypto.createHash('sha256').update(b).digest('hex');
const fail = message => { console.error(`STARTER KIT BUILD FAILED: ${message}`); process.exit(1); };

syncLibs();
const { analysePackage } = require('../extension/src/skin-package.js');
const { ALL_SPECS } = require('../extension/src/frames.js');

fs.rmSync(dist, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });
const produced = new Map();
const TEXT = /\.(js|mjs|json|html|md|txt)$/;
const put = (rel, data, why) => {
  if (produced.has(rel)) fail(`two rules write ${rel}`);
  if (TEXT.test(rel)) data = Buffer.from(Buffer.from(data).toString('utf8').replace(/\r\n/g, '\n'));      // the same bytes whatever the checkout's line endings
  const file = path.join(out, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, data);
  produced.set(rel, { why, data: Buffer.from(data) });
};
const need = file => { if (!fs.existsSync(file)) fail(`missing source ${path.relative(root, file)}`); return file; };

// ---------------------------------------------------------------- 1. the example skin: it must be accepted by the extension's own importer rules
const skinDir = need(path.join(here, 'example-skin'));
const pngs = fs.readdirSync(skinDir).filter(f => f.endsWith('.png')).map(name => ({ name, bytes: new Uint8Array(fs.readFileSync(path.join(skinDir, name))) }));
const skinText = fs.readFileSync(need(path.join(skinDir, 'skin.json')), 'utf8');
const report = analysePackage({ json: skinText, pngs });
if (!report.ok) fail(`the example skin would be refused by Skin Tools: ${report.errors.join('; ')}`);
if (report.warnings.length) fail(`the example skin must be complete and clean, but: ${report.warnings.join('; ')}`);
if (report.frames.length !== 31) fail(`the example skin should have 31 pictures (body, tread, 12 tread shades, 17 turrets); it has ${report.frames.length}`);
for (const { name, bytes } of pngs) put(`example-skin/${name}`, bytes, `The ${name.replace('.png', '')} picture of the example skin.`);
put('example-skin/skin.json', skinText, 'The example skin\'s description file (id, name, colour mode).');

// ---------------------------------------------------------------- 2. templates (generated from the importer's own frame table)
const { decodePng } = require('./src/artist-tools/lib/png.js');
const art = Object.fromEntries(pngs.map(p => [p.name.replace('.png', ''), decodePng(p.bytes)]));      // the example skin's pictures (2x): the silhouette guides and the PSD tracing layers come from them
let wholeTank2x = null;
for (const t of pngTemplates({ art })) {
  const spec = ALL_SPECS[t.part === 'assembled' ? 'base' : t.part === 'turret' ? 'turret0' : t.part];
  if (t.part !== 'assembled' && (t.width !== spec.w * t.scale || t.height !== spec.h * t.scale)) fail(`template ${t.path} is ${t.width}x${t.height}, not ${spec.w * t.scale}x${spec.h * t.scale}`);
  if (t.path === 'guides/whole-tank_2x.png') wholeTank2x = t.data;
  put(`templates/${t.path}`, t.data, t.kind === 'blank' ? `An empty transparent canvas of exactly the ${t.part} size at ${t.scale}x.` : t.kind === 'guides' ? `The ${t.part} canvas at ${t.scale}x with guide lines and the classic tank's outline, on a transparent background.` : t.kind === 'shape' ? `Guide lines plus the outline of the classic tank's ${t.part} picture (4x), to trace or compare against.` : `A picture of the whole tank in place, with guides, at ${t.scale}x.`);
}
put('templates/psd/tanktrouble-skin-template-4x.psd', psdTemplate(4, art), 'The layered Photoshop template at 4x: locked guides, one empty layer per picture, and the classic white tank as a faint tracing layer (not exported).');

// ---------------------------------------------------------------- 3. the optional artist tools (+ the shared libraries they use, copied from the extension)
const toolsSrc = path.join(here, 'src', 'artist-tools');
const walk = (dir, base = '') => fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(path.join(dir, e.name), `${base}${e.name}/`) : [`${base}${e.name}`]);
const why = {
  'README.txt': 'What the two helper programs do and what they handle.', 'atlas-to-skin.mjs': 'Optional: turns a texture atlas (PNG + JSON) into a Skin Tools skin.',
  'psd-to-skin.mjs': 'Optional: turns the layered PSD template into PNGs and a skin.json.',
  'lib/atlas.js': 'The converter\'s logic.', 'lib/png.js': 'Reads and writes PNG files (no dependencies).', 'lib/layout.js': 'Where each picture sits in the PSD template.',
  'lib/psd-reader.js': 'Reads PSD files (no dependencies).', 'lib/frames.js': 'The picture names and sizes Skin Tools uses (a copy of the extension\'s table).',
  'lib/resample.js': 'Exact resizing of pictures (the extension\'s own code).', 'lib/png-info.js': 'Reads a PNG\'s size and transparency (the extension\'s own code).',
  'lib/skin-package.js': 'Checks a folder as a skin with the extension\'s own rules.'
};
for (const rel of walk(toolsSrc)) put(`artist-tools/${rel}`, fs.readFileSync(path.join(toolsSrc, rel)), why[rel] || fail(`no description for artist-tools/${rel}`));
const atlasDir = need(path.join(here, 'example-atlas'));
for (const f of ['classic-tank-atlas.png', 'classic-tank-atlas.json']) put(`artist-tools/example-atlas/${f}`, fs.readFileSync(need(path.join(atlasDir, f))), 'A small example atlas (the example skin packed into one sheet) to try the converter on.');

// ---------------------------------------------------------------- 4. the guide, licence, credits
const guide = renderGuide({ skinDir, imagesDir: path.join(here, 'guide-images'), wholeTankGuide: wholeTank2x, kit: `${kit.name}-${kit.version}`, version: kit.version, extensionVersion, repoUrl: JSON.parse(fs.readFileSync(path.join(root, 'build', 'release.config.json'), 'utf8')).repoUrl, year: 2026 });
put('START-HERE.html', guide, 'The illustrated guide (one file, pictures embedded).');
put('about/LICENSE.txt', fs.readFileSync(need(path.join(here, 'LICENSE'))), 'The licence travels with the kit.');
put('about/CREDITS.txt', fs.readFileSync(need(path.join(here, 'src', 'CREDITS.md'))), 'Credits, notices and the acknowledgement of Textured Tanks by Kamarov.');

// ---------------------------------------------------------------- 5. checks
const onDisk = [];
const scan = d => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) scan(p); else onDisk.push(path.relative(out, p).split(path.sep).join('/')); } };
scan(out);
const stray = onDisk.filter(p => !produced.has(p));
if (stray.length) fail(`files not produced by a rule: ${stray.join(', ')}`);
const findings = [];
for (const [rel, { data }] of produced) {
  findings.push(...findIdentifiers(`${rel} (file name)`, rel, { text: true }), ...findIdentifiers(rel, data, { text: TEXT.test(rel) }));   // privacy: no real-world identifier anywhere, in any file or name
  if (rel.endsWith('.png')) { const extra = chunkTypes(data).filter(t => !['IHDR', 'PLTE', 'tRNS', 'IDAT', 'IEND'].includes(t)); if (extra.length) findings.push(`${rel}: PNG metadata chunks ${extra.join(', ')}`); }
  else if (rel.endsWith('.psd')) { if (data.toString('latin1', 0, 4) !== '8BPS') findings.push(`${rel}: not a PSD file`); }
  else {
    for (const f of auditFile(rel, data)) findings.push(f);
    if (/\.json$/.test(rel) && !rel.endsWith('skin.json')) { try { JSON.parse(data.toString('utf8')); } catch { findings.push(`${rel}: invalid JSON`); } }
    if (/\.(html|md|txt)$/.test(rel) && /\bnpm\b|node_modules|package\.json/.test(data.toString('utf8').replace(/<script[\s\S]*?<\/script>/g, ''))) findings.push(`${rel}: mentions npm or node_modules (the kit has no dependencies)`);
  }
}
if (findings.length) { for (const f of findings) console.error(`AUDIT: ${f}`); fail(`${findings.length} audit finding(s)`); }

// ---------------------------------------------------------------- 6. archive, read back, inventory
const entries = [...produced].map(([rel, { data }]) => ({ path: `${folderName}/${rel}`, data }));
const zip = writeZip(entries);
{ const leaks = findIdentifiers('the ZIP (entry names and headers)', zip); if (leaks.length) fail(leaks.join('; ')); }
const zipFile = path.join(dist, `${folderName}.zip`);
fs.writeFileSync(zipFile, zip);
const back = readZip(zip);
if (back.length !== produced.size || back.some(e => !produced.has(e.path.slice(folderName.length + 1)) || !produced.get(e.path.slice(folderName.length + 1)).data.equals(e.data))) fail('the ZIP does not match the kit folder');
const compressed = Object.fromEntries(back.map(e => [e.path.slice(folderName.length + 1), e.compressed]));
const inventory = [...produced].sort(([a], [b]) => (a < b ? -1 : 1)).map(([rel, { data, why: w }]) => ({ path: rel, bytes: data.length, zipped: compressed[rel], sha256: sha(data), why: w }));
const total = inventory.reduce((s, f) => s + f.bytes, 0);
const kb = n => `${(n / 1024).toFixed(1)} KB`;
fs.writeFileSync(path.join(dist, 'inventory.json'), JSON.stringify({ name: folderName, files: inventory.length, uncompressedBytes: total, zipBytes: zip.length, zipSha256: sha(zip), inventory }, null, 2) + '\n');
fs.writeFileSync(path.join(dist, 'INVENTORY.md'), [`# Starter kit inventory: ${folderName}`, '', `- Files: ${inventory.length}; uncompressed ${kb(total)}; ZIP ${kb(zip.length)} (SHA-256 \`${sha(zip)}\`)`, '',
  '| File | Bytes | In ZIP | SHA-256 (first 16) | Why it is there |', '|---|---:|---:|---|---|', ...inventory.map(f => `| \`${f.path}\` | ${f.bytes} | ${f.zipped} | \`${f.sha256.slice(0, 16)}\` | ${f.why} |`), ''].join('\n'));
console.log(`${folderName}: ${inventory.length} files, ${kb(total)} uncompressed, ZIP ${kb(zip.length)}`);
console.log(`  ZIP sha256 ${sha(zip)}`);
