// Builds the player downloads of the optional skin collection: one small ZIP per skin, holding only what a player needs
// (the importable skin folder at the game's native size, a short install note, credits and the licence). Sources, PSDs, Blender
// scripts, tests and build tooling stay in the repository and are never put in a player ZIP.
//   node skins/build-packs.mjs [--out <dir>]      default output: dist-skins/
//   dist-skins/<zipName>-<version>.zip            one per skin (what goes on a GitHub release)
//   dist-skins/REPORT.md                          every ZIP: size, file count, SHA-256, and the check results
// Deterministic: the same sources give byte-identical ZIPs. Needs no Blender, Photoshop or browser: the finished 4x art is in skins/<skin>/skin/.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { writeZip, readZip } from '../build/zip.mjs';
import { decode, optimise } from '../build/png.mjs';
import { auditSkinPackZip } from '../build/audit.mjs';

const require = createRequire(import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const argv = process.argv.slice(2);
const opt = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const dist = path.resolve(root, opt('--out', 'dist-skins'));
const fail = m => { console.error(`SKIN PACK BUILD FAILED: ${m}`); process.exit(1); };
const sha = b => crypto.createHash('sha256').update(b).digest('hex');
const { analysePackage } = require('../extension/src/skin-package.js');
const { ALL_SPECS } = require('../extension/src/frames.js');
const { downsample } = require('../extension/src/resample.js');
const config = JSON.parse(fs.readFileSync(path.join(here, 'packs.json'), 'utf8'));
const extensionVersion = JSON.parse(fs.readFileSync(path.join(root, 'extension', 'manifest.json'), 'utf8')).version;
const repoUrl = JSON.parse(fs.readFileSync(path.join(root, 'build', 'release.config.json'), 'utf8')).repoUrl;
const lf = s => Buffer.from(s.replace(/\r\n/g, '\n'));

const installNote = pack => `${pack.title}: a skin for TankTrouble Skin Tools
${'='.repeat(pack.title.length + 34)}

${pack.blurb}

You need the TankTrouble Skin Tools add-on (version ${extensionVersion} or newer): ${repoUrl}
You do NOT need Blender, Node.js or Photoshop. This download is only the finished skin.

1. Unzip this download. You get a folder called "${pack.dirId}" next to this note.
2. Open tanktrouble.com and click the small black "Skins" button (bottom right).
3. Choose "Manage skins", then "Add a folder", and pick the "${pack.dirId}" folder.
4. Close Manage skins and choose "${pack.title}" under "Skin".

The skin only changes how tanks look on your own screen. Remove it any time under Manage skins.
The shield, bullets and crates are the game's own.

${pack.credit}
TankTrouble and its tank belong to their owners; this skin is unofficial and not affiliated with them.
`;

fs.rmSync(dist, { recursive: true, force: true });
fs.mkdirSync(dist, { recursive: true });
const rows = [];
for (const pack of config.packs) {
  const src = path.join(here, pack.dir, 'skin');
  if (!fs.existsSync(src)) fail(`missing ${path.relative(root, src)}`);
  const names = fs.readdirSync(src).sort();
  const stray = names.filter(n => n !== 'skin.json' && !(n.endsWith('.png') && ALL_SPECS[n.replace(/\.png$/, '')]));
  if (stray.length) fail(`${pack.dir}/skin holds files that are not frames: ${stray.join(', ')}`);
  const pngs = names.filter(n => n.endsWith('.png')).map(name => ({ name, bytes: new Uint8Array(fs.readFileSync(path.join(src, name))) }));
  const meta = JSON.parse(fs.readFileSync(path.join(src, 'skin.json'), 'utf8'));
  const report = analysePackage({ json: JSON.stringify(meta), pngs });
  if (!report.ok) fail(`${pack.dir} would be refused by Skin Tools: ${report.errors.join('; ')}`);
  if (report.scale !== 4) fail(`${pack.dir}/skin should be the 4x art (it is ${report.scale}x)`);
  if (names.some(n => /^shield/i.test(n))) fail(`${pack.dir}/skin holds custom shield pictures: the game's own shield must be used`);
  if (meta.tint.base !== 'none' || meta.tint.tread !== 'none' || meta.tint.turret !== 'none') fail(`${pack.dir}: tint must be "none"`);
  pack.dirId = meta.id;
  const entries = [];
  for (const { name } of pngs) {
    const frame = name.replace(/\.png$/, '');
    const image = decode(fs.readFileSync(path.join(src, name)));
    const small = downsample(image.data, image.width, image.height, 4);
    const { w, h } = ALL_SPECS[frame];
    entries.push({ path: `${meta.id}/${name}`, data: optimise(Buffer.from(small.data), w, h) });
  }
  const outMeta = { ...meta, version: config.version };
  delete outMeta.pixelScale;
  entries.push({ path: `${meta.id}/skin.json`, data: lf(JSON.stringify(outMeta, null, 2) + '\n') });
  entries.push({ path: 'INSTALL.txt', data: lf(installNote(pack)) });
  entries.push({ path: 'CREDITS.txt', data: lf(`${pack.title}\n\n${pack.credit}\n\nThe "TankTrouble in 3D" model: https://github.com/asger-finding/tanktrouble-in-3d (dedicated to the public domain under CC0 1.0, https://creativecommons.org/publicdomain/zero/1.0/).\nThe skin and its sources: ${repoUrl} (MIT licence, see LICENSE.txt).\n`) });
  entries.push({ path: 'LICENSE.txt', data: lf(fs.readFileSync(path.join(here, 'LICENSE'), 'utf8')) });
  const zipFile = path.join(dist, `${pack.zipName}-${config.version}.zip`);
  const zip = writeZip(entries);
  fs.writeFileSync(zipFile, zip);

  // ---- check what was written, from the ZIP itself: the importer's own rules at 1x, pixels equal to the reduced art, nothing extra
  const back = readZip(fs.readFileSync(zipFile));
  const folder = back.filter(e => e.path.startsWith(`${meta.id}/`));
  const outside = back.filter(e => !e.path.startsWith(`${meta.id}/`)).map(e => e.path).sort();
  if (outside.join() !== 'CREDITS.txt,INSTALL.txt,LICENSE.txt') fail(`${pack.zipName}: unexpected top-level entries ${outside.join(', ')}`);
  const back1 = analysePackage({ json: folder.find(e => e.path.endsWith('/skin.json')).data.toString('utf8'), pngs: folder.filter(e => e.path.endsWith('.png')).map(e => ({ name: path.basename(e.path), bytes: new Uint8Array(e.data) })) });
  if (!back1.ok || back1.scale !== 1) fail(`${pack.zipName}: the packed skin is refused or not 1x: ${back1.errors.join('; ')}`);
  if (back1.frames.length !== report.frames.length) fail(`${pack.zipName}: frame count changed in packing`);
  for (const e of folder.filter(f => f.path.endsWith('.png'))) {
    const frame = path.basename(e.path, '.png');
    const orig = decode(fs.readFileSync(path.join(src, `${frame}.png`)));
    const want = downsample(orig.data, orig.width, orig.height, 4).data;
    const got = decode(e.data);
    if (Buffer.compare(Buffer.from(got.data), Buffer.from(want)) !== 0) fail(`${pack.zipName}: ${frame} differs from the reduced 4x art`);
  }
  const findings = auditSkinPackZip(zipFile);
  if (findings.length) fail(`${pack.zipName}: audit findings:\n  ${findings.join('\n  ')}`);
  rows.push({ title: pack.title, file: path.basename(zipFile), bytes: zip.length, files: back.length, frames: back1.frames.length, warnings: back1.warnings, sha: sha(zip) });
  console.log(`${path.basename(zipFile)}  ${(zip.length / 1024).toFixed(1)} KB  ${back.length} files (${back1.frames.length} pictures)  sha256 ${sha(zip).slice(0, 16)}...  audit clean${back1.warnings.length ? `  warnings: ${back1.warnings.join(' | ')}` : ''}`);
}
fs.writeFileSync(path.join(dist, 'REPORT.md'), `# Skin pack downloads (version ${config.version})\n\nBuilt by \`node skins/build-packs.mjs\`. Each ZIP holds the skin folder at the game's native size, INSTALL.txt, CREDITS.txt and LICENSE.txt, nothing else.\n\n| Skin | ZIP | Size | Files | Pictures | SHA-256 |\n|---|---|---|---|---|---|\n${rows.map(r => `| ${r.title} | \`${r.file}\` | ${(r.bytes / 1024).toFixed(1)} KB | ${r.files} | ${r.frames} | \`${r.sha}\` |`).join('\n')}\n`);
console.log('ok');
