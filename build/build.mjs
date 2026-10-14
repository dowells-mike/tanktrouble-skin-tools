// Builds the release from build/release.config.json (an allowlist):
//   dist/<name>-<version>/               the player download: extension/, skin-packs/, guide, notices
//   dist/<name>-<version>.zip            the same folder as one ZIP (what players download)
//   dist/<name>-<version>-extension.zip  the extension folder alone (what a browser store takes)
//   dist/INVENTORY.md, dist/inventory.json, dist/sizes.json
// Deterministic: the same sources give byte-identical files and archives (see build/reproducible.mjs).
//   node build/build.mjs [--out <dir>] [--no-audit]
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { decode, optimise, quantise, chunkTypes } from './png.mjs';
import { writeZip, readZip } from './zip.mjs';
import { auditRelease } from './audit.mjs';

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const opt = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const esbuild = require('esbuild');
const cfg = JSON.parse(fs.readFileSync(path.join(root, 'build', 'release.config.json'), 'utf8'));
const srcManifest = JSON.parse(fs.readFileSync(path.join(root, 'extension', 'manifest.json'), 'utf8'));
const version = srcManifest.version;
const dist = path.resolve(root, opt('--out', 'dist'));
const folderName = `${cfg.name}-${version}`;
const out = path.join(dist, folderName);
const sha = b => crypto.createHash('sha256').update(b).digest('hex');
const fail = message => { console.error(`BUILD FAILED: ${message}`); process.exit(1); };
const need = file => { if (!fs.existsSync(file)) fail(`missing source ${path.relative(root, file)}`); return file; };

fs.rmSync(dist, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });
const produced = new Map();          // release path -> { why, bytes }
const put = (rel, data, why) => {
  if (produced.has(rel)) fail(`two rules write ${rel}`);
  const file = path.join(out, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, data);
  produced.set(rel, { why, data: Buffer.from(data) });
};

// ---------------------------------------------------------------- 1. runtime JavaScript (concatenated per content-script group, minified)
const groups = srcManifest.content_scripts;
if (groups.length !== cfg.extension.runtime.length) fail('the manifest and release.config.json list different content-script groups');
const runtimeManifestGroups = [];
for (const [i, entry] of cfg.extension.runtime.entries()) {
  const group = groups[i];
  if (group.run_at !== entry.run_at || JSON.stringify(group.js) !== JSON.stringify(entry.sources)) fail(`content-script group ${i} in extension/manifest.json does not match release.config.json (order matters)`);
  let code = '';
  for (const rel of entry.sources) {
    let text = fs.readFileSync(need(path.join(root, 'extension', rel)), 'utf8');
    // the panel's stylesheet lives in a template literal: minify it as CSS (esbuild's JS minifier keeps strings as they are)
    let cssBlocks = 0;
    text = await replaceAsync(text, /const CSS = `([^`$\\]*)`;/g, async (_, css) => {
      cssBlocks++;
      const min = (await esbuild.transform(css, { loader: 'css', minify: true, target: 'chrome120' })).code.trim();
      if (min.includes('`') || min.includes('${') || min.includes('\\')) fail('minified CSS contains a backtick, ${ or a backslash');
      return `const CSS = \`${min}\`;`;
    });
    if (rel.endsWith('/panel.js') && cssBlocks !== 1) fail('could not find the panel stylesheet to minify');
    code += `${text.trimEnd()}\n;\n`;
  }
  const min = await esbuild.transform(code, { loader: 'js', minify: true, target: 'chrome120', legalComments: 'none', charset: 'utf8' });
  if (min.warnings.length) fail(`esbuild warnings: ${min.warnings.map(w => w.text).join('; ')}`);
  const banner = `/* TankTrouble Skin Tools ${version}. Licence: LICENSE.txt. */\n`;
  put(`extension/${entry.out}`, banner + min.code, entry.why);
  runtimeManifestGroups.push({ ...group, js: [entry.out] });
}
async function replaceAsync(text, re, fn) { const parts = []; let last = 0; for (const m of text.matchAll(re)) { parts.push(text.slice(last, m.index), await fn(...m)); last = m.index + m[0].length; } parts.push(text.slice(last)); return parts.join(''); }

// ---------------------------------------------------------------- 2. manifest (the source manifest with the runtime files swapped in)
const FORBIDDEN_KEYS = ['permissions', 'optional_permissions', 'host_permissions', 'optional_host_permissions', 'background', 'web_accessible_resources', 'externally_connectable', 'content_security_policy', 'update_url', 'key', 'oauth2', 'sandbox', 'chrome_url_overrides'];
for (const key of FORBIDDEN_KEYS) if (key in srcManifest) fail(`manifest key "${key}" is not allowed in this release`);
const manifest = { ...srcManifest, content_scripts: runtimeManifestGroups };
for (const g of manifest.content_scripts) if (JSON.stringify(g.matches) !== '["https://tanktrouble.com/*"]') fail('content scripts may only run on https://tanktrouble.com/*');
const iconPaths = {};
for (const [size, entry] of Object.entries(cfg.extension.icons)) {
  if (srcManifest.icons[size] !== entry.src) fail(`icon ${size} differs between manifest and config`);
  const png = decode(fs.readFileSync(need(path.join(root, 'extension', entry.src))));
  if (png.width !== Number(size) || png.height !== Number(size)) fail(`${entry.src} is ${png.width}x${png.height}, expected ${size}`);
  put(`extension/${entry.src}`, optimise(png.data, png.width, png.height), entry.why);
  iconPaths[size] = entry.src;
}
put('extension/manifest.json', JSON.stringify(manifest, null, 2) + '\n', 'Tells the browser what the extension is and where its two scripts run (tanktrouble.com only). No permissions.');
for (const f of cfg.extension.files) put(`extension/${f.out}`, fs.readFileSync(need(path.join(root, f.src))), f.why);

// ---------------------------------------------------------------- 3. example skin packs (validated with the extension's own rules, PNGs optimised losslessly)
const { analysePackage } = require(path.join(root, 'extension', 'src', 'skin-package.js'));
const { ALL_SPECS } = require(path.join(root, 'extension', 'src', 'frames.js'));
for (const id of cfg.skinPacks.packs) {
  const dir = path.join(root, 'skin-packs', id);
  if (!fs.existsSync(dir)) fail(`missing skin pack ${id}`);
  const names = fs.readdirSync(dir).sort();
  const pngs = [];
  for (const name of names) {
    if (name === 'skin.json') continue;
    const frame = name.replace(/\.png$/, '');
    if (!name.endsWith('.png') || !ALL_SPECS[frame]) fail(`skin-packs/${id}/${name} is not a frame the extension uses (only frames and skin.json are allowed)`);
    const png = decode(fs.readFileSync(path.join(dir, name)));
    if (png.width !== ALL_SPECS[frame].w || png.height !== ALL_SPECS[frame].h) fail(`skin-packs/${id}/${name} is ${png.width}x${png.height}, the game's native size is ${ALL_SPECS[frame].w}x${ALL_SPECS[frame].h}`);
    const bytes = optimise(png.data, png.width, png.height);
    pngs.push({ name, bytes: new Uint8Array(bytes) });
    put(`skin-packs/${id}/${name}`, bytes, `Frame "${frame}" of the ${id} example skin (${png.width}x${png.height}, the game's native size).`);
  }
  const json = JSON.parse(fs.readFileSync(need(path.join(dir, 'skin.json')), 'utf8'));
  const report = analysePackage({ json: JSON.stringify(json), pngs });
  if (!report.ok) fail(`skin pack ${id} would be refused by the extension: ${report.errors.join('; ')}`);
  if (report.scale !== 1) fail(`skin pack ${id} should be at 1x`);
  put(`skin-packs/${id}/skin.json`, JSON.stringify(json, null, 2) + '\n', `Name, id and colour mode of the ${id} example skin.`);
}

const guideImages = [];
// ---------------------------------------------------------------- 4. documents (the guide gets its images embedded, so it is one file)
for (const doc of cfg.documents) {
  const src = need(path.join(root, doc.src));
  if (doc.kind === 'guide') {
    let html = fs.readFileSync(src, 'utf8');
    html = html.replace(/\{\{img:([\w.-]+)\}\}/g, (_, name) => {
      // documentation screenshots only: a 256-colour palette when it is visually lossless (PSNR >= 40 dB), else lossless
      const png = decode(fs.readFileSync(need(path.join(root, 'guide', 'images', name))));
      const lossless = optimise(png.data, png.width, png.height);
      const q = quantise(png.data, png.width, png.height);
      const small = q.psnr >= 40 ? optimise(q.rgba, png.width, png.height) : lossless;
      guideImages.push({ name, psnr: q.psnr >= 40 ? +q.psnr.toFixed(1) : null, bytes: Math.min(small.length, lossless.length) });
      return `data:image/png;base64,${(small.length < lossless.length ? small : lossless).toString('base64')}`;
    });
    if (/\{\{|https?:\/\/(?!tanktrouble\.com|github\.com)/.test(html.replace(/xmlns="http:\/\/www\.w3\.org\/2000\/svg"/g, ''))) fail(`${doc.src} has an unresolved placeholder or a link to an unexpected site`);
    put(doc.out, html, doc.why);
  } else put(doc.out, fs.readFileSync(src), doc.why);
}

// ---------------------------------------------------------------- 5. checks on what was produced
// a) the allowlist: every file on disk was produced by a rule above, and nothing else exists
const onDisk = [];
const walk = d => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else onDisk.push(path.relative(out, p).split(path.sep).join('/')); } };
walk(out);
const stray = onDisk.filter(p => !produced.has(p));
if (stray.length) fail(`files not produced by the allowlist: ${stray.join(', ')}`);
// b) runtime code: no network, no code evaluation, no extension APIs
const banned = /\b(fetch|XMLHttpRequest|WebSocket|sendBeacon|importScripts|EventSource|eval)\s*\(|new\s+Function\b|\bchrome\.(runtime|storage|webRequest|tabs|cookies|history|identity|scripting)\b|\bnavigator\.sendBeacon\b|https?:\/\/(?!tanktrouble\.com)/;
for (const entry of cfg.extension.runtime) { const text = produced.get(`extension/${entry.out}`).data.toString('utf8'); const m = banned.exec(text); if (m) fail(`${entry.out} contains a forbidden API or address: ${m[0]}`); }
// c) PNGs carry only image data chunks
for (const [rel, { data }] of produced) if (rel.endsWith('.png')) { const extra = chunkTypes(data).filter(t => !['IHDR', 'PLTE', 'tRNS', 'IDAT', 'IEND'].includes(t)); if (extra.length) fail(`${rel} carries metadata chunks: ${extra.join(', ')}`); }

// ---------------------------------------------------------------- 6. archives
const entries = [...produced].map(([rel, { data }]) => ({ path: `${folderName}/${rel}`, data }));
const zip = writeZip(entries);
const zipFile = path.join(dist, `${folderName}.zip`);
fs.writeFileSync(zipFile, zip);
const extZip = writeZip([...produced].filter(([rel]) => rel.startsWith('extension/')).map(([rel, { data }]) => ({ path: rel.slice('extension/'.length), data })));
const extZipFile = path.join(dist, `${folderName}-extension.zip`);
fs.writeFileSync(extZipFile, extZip);
// read the archive back: it must hold exactly the produced files, byte for byte
const back = readZip(zip);
if (back.length !== produced.size || back.some(e => !produced.has(e.path.slice(folderName.length + 1)) || !produced.get(e.path.slice(folderName.length + 1)).data.equals(e.data))) fail('the ZIP does not match the release folder');

// ---------------------------------------------------------------- 7. inventory and sizes
const compressed = Object.fromEntries(back.map(e => [e.path.slice(folderName.length + 1), e.compressed]));
const inventory = [...produced].sort(([a], [b]) => (a < b ? -1 : 1)).map(([rel, { data, why }]) => ({ path: rel, bytes: data.length, zipped: compressed[rel], sha256: sha(data), why }));
const total = inventory.reduce((s, f) => s + f.bytes, 0);
const sizeOf = prefix => inventory.filter(f => f.path.startsWith(prefix)).reduce((s, f) => s + f.bytes, 0);
const sizes = {
  version, files: inventory.length, uncompressedBytes: total,
  zipBytes: zip.length, zipSha256: sha(zip), extensionZipBytes: extZip.length, extensionZipSha256: sha(extZip),
  guideImages,
  parts: { extension: sizeOf('extension/'), runtimeJs: sizeOf('extension/runtime/'), icons: sizeOf('extension/icons/'), skinPacks: sizeOf('skin-packs/'), documents: total - sizeOf('extension/') - sizeOf('skin-packs/') }
};
fs.writeFileSync(path.join(dist, 'inventory.json'), JSON.stringify({ ...sizes, inventory }, null, 2) + '\n');
fs.writeFileSync(path.join(dist, 'sizes.json'), JSON.stringify(sizes, null, 2) + '\n');
const kb = n => `${(n / 1024).toFixed(1)} KB`;
const md = [`# Release inventory: ${folderName}`, '', `Every file in \`${folderName}.zip\`, its size, its SHA-256 and why it is there. Generated by \`build/build.mjs\`.`, '',
  `- Files: ${inventory.length}; uncompressed ${kb(total)}; ZIP ${kb(zip.length)} (SHA-256 \`${sha(zip)}\`)`,
  `- Extension only: ${kb(sizes.parts.extension)} uncompressed; \`${folderName}-extension.zip\` ${kb(extZip.length)} (SHA-256 \`${sha(extZip)}\`)`, '',
  '| File | Bytes | In ZIP | SHA-256 (first 16) | Why it is needed |', '|---|---:|---:|---|---|',
  ...inventory.map(f => `| \`${f.path}\` | ${f.bytes} | ${f.zipped} | \`${f.sha256.slice(0, 16)}\` | ${f.why} |`), ''].join('\n');
fs.writeFileSync(path.join(dist, 'INVENTORY.md'), md);

// ---------------------------------------------------------------- 8. audit the archive itself
if (!argv.includes('--no-audit')) {
  const findings = auditRelease({ zipFile, extZipFile, root });
  if (findings.length) { for (const f of findings) console.error(`AUDIT: ${f}`); fail(`${findings.length} audit finding(s)`); }
}
console.log(`${folderName}: ${inventory.length} files, ${kb(total)} uncompressed, ZIP ${kb(zip.length)}; extension ${kb(sizes.parts.extension)} (ZIP ${kb(extZip.length)})`);
console.log(`  runtime JS ${kb(sizes.parts.runtimeJs)}, icons ${kb(sizes.parts.icons)}, skin packs ${kb(sizes.parts.skinPacks)}, documents ${kb(sizes.parts.documents)}`);
console.log(`  ZIP sha256 ${sha(zip)}`);
