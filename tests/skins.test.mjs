// Tests of the optional skin collection (skins/): the finished artwork, the pack builder and the player downloads. No browser, Blender or Photoshop needed.
//   node --test tests/skins.test.mjs        (the browser side is tests/skins.check.mjs)
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const skinsDir = path.join(root, 'skins');
const { analysePackage } = require(path.join(root, 'extension', 'src', 'skin-package.js'));
const { ALL_SPECS } = require(path.join(root, 'extension', 'src', 'frames.js'));
const { downsample } = require(path.join(root, 'extension', 'src', 'resample.js'));
const { decodePng } = require(path.join(skinsDir, 'tools', 'png.js'));
const { readZip } = await import(pathToFileURL(path.join(root, 'build', 'zip.mjs')).href);
const { decode: decodeAny } = await import(pathToFileURL(path.join(root, 'build', 'png.mjs')).href);   // reads the packed (palette or grey) PNGs too
const { findIdentifiers } = await import(pathToFileURL(path.join(root, 'starter-kit', 'privacy.mjs')).href);
const { auditSkinPackZip } = await import(pathToFileURL(path.join(root, 'build', 'audit.mjs')).href);
const config = JSON.parse(fs.readFileSync(path.join(skinsDir, 'packs.json'), 'utf8'));

const sourceOf = pack => path.join(skinsDir, pack.dir, 'skin');
const load = dir => {
  const names = fs.readdirSync(dir).sort();
  return { names, json: fs.readFileSync(path.join(dir, 'skin.json'), 'utf8'), pngs: names.filter(n => n.endsWith('.png')).map(name => ({ name, bytes: new Uint8Array(fs.readFileSync(path.join(dir, name))) })) };
};
const buildInto = out => {
  const run = spawnSync(process.execPath, [path.join(skinsDir, 'build-packs.mjs'), '--out', out], { encoding: 'utf8' });
  assert.equal(run.status, 0, run.stdout + run.stderr);
  return run.stdout;
};
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'skins-test-'));
const buildA = path.join(tmp, 'a'), buildB = path.join(tmp, 'b');
buildInto(buildA);
buildInto(buildB);
const zipsIn = dir => fs.readdirSync(dir).filter(n => n.endsWith('.zip')).sort();

test('the collection lists every skin it ships, and each has its sources', () => {
  assert.ok(config.packs.length >= 2);
  for (const pack of config.packs) {
    for (const rel of ['skin/skin.json', 'build.mjs', 'fx-art.mjs', 'blender/render.py', 'README.md']) assert.ok(fs.existsSync(path.join(skinsDir, pack.dir, rel)), `${pack.dir}/${rel}`);
    assert.ok(fs.readdirSync(path.join(skinsDir, pack.dir)).some(n => n.endsWith('.psd')), `${pack.dir} has a layered PSD`);
    assert.ok(fs.readdirSync(path.join(skinsDir, pack.dir, 'screenshots')).length >= 3, `${pack.dir} has screenshots`);
  }
});

test('every skin is accepted by the importer\'s own rules: 4x art, painted (tint none), all 17 turret frames, a laser colour', () => {
  for (const pack of config.packs) {
    const { json, pngs } = load(sourceOf(pack));
    const report = analysePackage({ json, pngs });
    assert.equal(report.ok, true, `${pack.dir}: ${report.errors.join('; ')}`);
    assert.equal(report.scale, 4);
    assert.deepEqual(report.meta.tint, { base: 'none', tread: 'none', turret: 'none' });
    for (let i = 0; i < 17; i++) assert.ok(pngs.some(p => p.name === `turret${i}.png`), `${pack.dir}: turret${i}`);
    for (const n of ['base', 'tread', 'homingMissile', 'mine', 'mineShrapnel']) assert.ok(pngs.some(p => p.name === `${n}.png`), `${pack.dir}: ${n}`);
    assert.match(report.meta.laser.colour, /^#[0-9a-f]{6}$/i);
  }
});

test('no custom shield: neither the skins nor their sources ship or build shield pictures (the game\'s own shield stays)', () => {
  for (const pack of config.packs) {
    const names = fs.readdirSync(sourceOf(pack));
    assert.deepEqual(names.filter(n => /shield/i.test(n)), [], `${pack.dir}/skin`);
    assert.deepEqual(fs.readdirSync(path.join(skinsDir, pack.dir, 'src')).filter(n => /shield/i.test(n)), [], `${pack.dir}/src`);
    for (const f of ['fx-art.mjs', 'build.mjs']) assert.doesNotMatch(fs.readFileSync(path.join(skinsDir, pack.dir, f), 'utf8'), /shieldSvg|shieldBolt\d|shieldSpark|FX_SVG_SCENE\.shield/, `${pack.dir}/${f}`);
  }
  for (const dir of fs.readdirSync(buildA).filter(n => n.endsWith('.zip'))) assert.deepEqual(readZip(fs.readFileSync(path.join(buildA, dir))).filter(e => /shield/i.test(e.path)), []);
});

test('the Onyx tread-shade frames are the soft, faint bands: 12 of them, never a hard dark block', () => {
  const dir = path.join(skinsDir, 'onyx-paint', 'skin');
  let first = null;
  for (let k = 0; k < 12; k++) {
    const p = decodePng(fs.readFileSync(path.join(dir, `treadShade${k}.png`)));
    assert.equal([p.width, p.height].join('x'), '48x320');
    let max = 0, nonzero = 0, colour = 0;
    for (let i = 0; i < p.data.length; i += 4) { max = Math.max(max, p.data[i + 3]); if (p.data[i + 3]) nonzero++; colour = Math.max(colour, p.data[i], p.data[i + 1], p.data[i + 2]); }
    assert.ok(max > 40 && max <= 90, `frame ${k}: strongest band ${max}/255`);
    assert.equal(colour, 0, 'a shade only darkens: black');
    assert.ok(nonzero > p.width * 40, 'bands are present');
    if (k === 0) first = p.data;
    else assert.notDeepEqual(Buffer.from(p.data), Buffer.from(first), `frame ${k} moves`);
  }
});

test('the player ZIPs hold only the skin folder (native size) and three notes: no sources, PSDs, scripts or tests', () => {
  assert.deepEqual(zipsIn(buildA), config.packs.map(p => `${p.zipName}-${config.version}.zip`).sort());
  for (const pack of config.packs) {
    const entries = readZip(fs.readFileSync(path.join(buildA, `${pack.zipName}-${config.version}.zip`)));
    const id = JSON.parse(fs.readFileSync(path.join(sourceOf(pack), 'skin.json'), 'utf8')).id;
    const top = entries.filter(e => !e.path.includes('/')).map(e => e.path).sort();
    assert.deepEqual(top, ['CREDITS.txt', 'INSTALL.txt', 'LICENSE.txt']);
    for (const e of entries.filter(e => e.path.includes('/'))) assert.match(e.path, new RegExp(`^${id}/(skin\\.json|[A-Za-z0-9]+\\.png)$`));
    assert.ok(!entries.some(e => /\.(psd|py|mjs|js|svg|blend)$/i.test(e.path)));
    const folder = entries.filter(e => e.path.startsWith(`${id}/`));
    const report = analysePackage({ json: folder.find(e => e.path.endsWith('skin.json')).data.toString('utf8'), pngs: folder.filter(e => e.path.endsWith('.png')).map(e => ({ name: path.basename(e.path), bytes: new Uint8Array(e.data) })) });
    assert.equal(report.ok, true, report.errors.join('; '));
    assert.equal(report.scale, 1, 'native size');
    assert.deepEqual(report.warnings, []);
    assert.equal(report.frames.length, fs.readdirSync(sourceOf(pack)).filter(n => n.endsWith('.png')).length);
    const install = entries.find(e => e.path === 'INSTALL.txt').data.toString('utf8');
    assert.ok(install.includes(`"${id}"`) && /Add a folder/.test(install) && /Blender, Node\.js or Photoshop/.test(install));
  }
});

test('each packed picture is exactly the 4x art reduced by the extension\'s own resampler', () => {
  for (const pack of config.packs) {
    const entries = readZip(fs.readFileSync(path.join(buildA, `${pack.zipName}-${config.version}.zip`)));
    for (const e of entries.filter(e => e.path.endsWith('.png'))) {
      const frame = path.basename(e.path, '.png');
      const big = decodePng(fs.readFileSync(path.join(sourceOf(pack), `${frame}.png`)));
      const want = downsample(big.data, big.width, big.height, 4);
      const got = decodeAny(e.data);
      assert.equal(got.width, ALL_SPECS[frame].w);
      assert.equal(got.height, ALL_SPECS[frame].h);
      assert.ok(Buffer.from(got.data).equals(Buffer.from(want.data)), `${pack.dir}/${frame}`);
    }
  }
});

test('the build is reproducible (two builds, byte-identical ZIPs) and the ZIPs stay small', () => {
  for (const name of zipsIn(buildA)) {
    const a = fs.readFileSync(path.join(buildA, name)), b = fs.readFileSync(path.join(buildB, name));
    assert.ok(a.equals(b), name);
    assert.ok(a.length < 400 * 1024, `${name} is ${(a.length / 1024).toFixed(0)} KB`);
  }
});

test('privacy and audit: the ZIPs and every tracked skin source carry only the TankTrouble username', () => {
  for (const name of zipsIn(buildA)) assert.deepEqual(auditSkinPackZip(path.join(buildA, name)), [], name);
  const walk = dir => fs.readdirSync(dir, { withFileTypes: true }).flatMap(d => d.isDirectory() ? (['render', 'node_modules', 'reference'].includes(d.name) ? [] : walk(path.join(dir, d.name))) : [path.join(dir, d.name)]);
  for (const file of walk(skinsDir)) assert.deepEqual(findIdentifiers(file, fs.readFileSync(file), { text: !/\.(png|psd)$/i.test(file) }), [], path.relative(root, file));
});

test('the collection README and the main README name every skin and point to real screenshots', () => {
  const gallery = fs.readFileSync(path.join(skinsDir, 'README.md'), 'utf8');
  for (const pack of config.packs) {
    assert.ok(gallery.includes(pack.title), `${pack.title} in skins/README.md`);
    assert.ok(gallery.includes(`${pack.zipName}-${config.version}.zip`), `${pack.zipName} download named in skins/README.md`);
  }
  for (const m of gallery.matchAll(/!\[[^\]]*\]\(([^)]+)\)/g)) assert.ok(fs.existsSync(path.join(skinsDir, m[1])), `image ${m[1]}`);
  const main = fs.readFileSync(path.join(root, 'README.md'), 'utf8');
  for (const pack of config.packs) assert.ok(main.includes(pack.title), `${pack.title} in README.md`);
});
