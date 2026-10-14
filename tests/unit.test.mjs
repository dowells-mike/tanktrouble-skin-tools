// Unit tests of the extension's pure modules (no browser, no game code).   npm test
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { Canvas } from './helpers/canvas.mjs';

const require = createRequire(import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..', 'extension');
const { encodePng } = require('./helpers/png.cjs');
const { readPngInfo } = require('../extension/src/png-info.js');
const { downsample, multiplyColour, visibleFraction, alphaBounds } = require('../extension/src/resample.js');
const { analysePackage, parseSkinJson, slug } = require('../extension/src/skin-package.js');
const { SPECS } = require('../extension/src/frames.js');
const { sanitiseSettings, defaultSettings } = require('../extension/src/store.js');

const solid = (w, h, rgba = [10, 20, 30, 255]) => { const d = new Uint8Array(w * h * 4); for (let i = 0; i < d.length; i += 4) d.set(rgba, i); return d; };
const png = (w, h, rgba) => new Uint8Array(encodePng(w, h, solid(w, h, rgba)));
const file = (name, w, h, rgba) => ({ name, bytes: png(w, h, rgba) });
const goodSkin = scale => [file('base.png', 68 * scale, 84 * scale), file('tread.png', 12 * scale, 80 * scale), file('turret0.png', 68 * scale, 82 * scale), file('turret1.png', 68 * scale, 82 * scale), file('turret2.png', 68 * scale, 82 * scale)];
const json = (extra = {}) => JSON.stringify({ schema: 1, id: 'my-skin', name: 'My skin', tint: { base: 'none', tread: 'none', turret: 'none' }, ...extra });

test('frame sizes are the game\'s native sizes', () => {
  assert.deepEqual([SPECS.base.w, SPECS.base.h, SPECS.tread.w, SPECS.tread.h, SPECS.turret0.w, SPECS.turret0.h], [68, 84, 12, 80, 68, 82]);
  assert.equal(Object.keys(SPECS).length, 31);
});

test('png-info reads size and alpha, rejects non-PNGs', () => {
  const info = readPngInfo(png(68, 84));
  assert.equal(info.width, 68); assert.equal(info.height, 84); assert.equal(info.hasAlpha, true);
  const rgb = Uint8Array.from(png(5, 5)); rgb[25] = 2;                       // colour type 2: RGB, no alpha
  assert.equal(readPngInfo(rgb).hasAlpha, false);
  assert.throws(() => readPngInfo(new Uint8Array(100)), /not a PNG/);
  assert.throws(() => readPngInfo(new Uint8Array(3)), /too small/);
});

test('downsample: exact average, and a transparent neighbour never darkens or lightens the edge', () => {
  const four = new Uint8ClampedArray(4 * 4 * 4);
  // left half opaque red, right half transparent but carrying "black" colour data (as editors often leave)
  for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) four.set(x < 2 ? [255, 0, 0, 255] : [0, 0, 0, 0], (y * 4 + x) * 4);
  const out = downsample(four, 4, 4, 2);
  assert.deepEqual([out.width, out.height], [2, 2]);
  assert.deepEqual([...out.data.slice(0, 4)], [255, 0, 0, 255]);
  assert.deepEqual([...out.data.slice(4, 8)], [0, 0, 0, 0]);
  // a boundary pixel: half covered -> alpha 50%, colour still pure red (no black fringe)
  const edge = new Uint8ClampedArray(2 * 2 * 4);
  edge.set([255, 0, 0, 255], 0); edge.set([255, 0, 0, 255], 4); edge.set([0, 0, 0, 0], 8); edge.set([0, 0, 0, 0], 12);
  const half = downsample(edge, 2, 2, 2);
  assert.deepEqual([...half.data], [255, 0, 0, 128]);
  assert.throws(() => downsample(four, 4, 4, 3), /multiple/);
  assert.equal(downsample(four, 4, 4, 1).width, 4);
});

test('downsampling a 4x anti-aliased shape keeps clean edges (no pixel darker/lighter than the shape colour)', () => {
  const c = new Canvas(68, 84, 4);
  c.roundRect(34, 42, 56, 76, 9, [200, 30, 30]);
  const out = downsample(c.data, c.w, c.h, 4);
  assert.deepEqual([out.width, out.height], [68, 84]);
  let edge = 0;
  for (let i = 0; i < out.data.length; i += 4) if (out.data[i + 3] > 0) { edge++; assert.ok(Math.abs(out.data[i] - 200) <= 1 && Math.abs(out.data[i + 1] - 30) <= 1 && Math.abs(out.data[i + 2] - 30) <= 1, `fringe colour ${[...out.data.slice(i, i + 4)]}`); }
  assert.ok(edge > 4000);
  const b = alphaBounds(out.data, out.width, out.height);
  assert.ok(b.x0 >= 5 && b.x1 <= 63 && b.y0 >= 3 && b.y1 <= 81, JSON.stringify(b));
});

test('multiplyColour behaves like the game tint and visibleFraction detects empty art', () => {
  const d = solid(1, 1, [200, 100, 50, 77]);
  multiplyColour(d, 0xff8000);
  assert.deepEqual([...d], [200, 50, 0, 77]);
  assert.equal(visibleFraction(new Uint8Array(16)), 0);
  assert.equal(visibleFraction(solid(2, 2)), 1);
});

test('package: a complete skin passes at 1x, 2x and 4x and reports the scale', () => {
  for (const scale of [1, 2, 4]) {
    const report = analysePackage({ json: json(), pngs: goodSkin(scale) });
    assert.equal(report.ok, true, report.errors.join('; '));
    assert.equal(report.scale, scale);
    assert.equal(report.meta.id, 'my-skin');
    assert.deepEqual(report.meta.tint, { base: 'none', tread: 'none', turret: 'none' });
    assert.deepEqual(report.warnings.length, 1);
    assert.match(report.warnings[0], /only 3 of 17 turret frames/);
  }
});

test('package: every rule reports the file name and the fix', () => {
  const bad = analysePackage({ json: json(), pngs: [file('base.png', 70, 84), file('tread.png', 12, 80), file('turret0.png', 68, 82)] });
  assert.equal(bad.ok, false);
  assert.match(bad.errors.join('\n'), /base\.png: is 70x84; base must be 68x84, 136x168, 272x336/);

  const missing = analysePackage({ json: json(), pngs: [file('base.png', 68, 84)] });
  for (const need of ['tread.png is required', 'turret0.png is required']) assert.ok(missing.errors.some(e => e.includes(need)), need);

  const mixed = analysePackage({ json: json(), pngs: [file('base.png', 136, 168), file('tread.png', 12, 80), file('turret0.png', 68, 82)] });
  assert.match(mixed.errors.join('\n'), /Mixed resolutions: 2x and 1x/);

  const rgbBytes = Uint8Array.from(png(68, 84)); rgbBytes[25] = 2;
  const opaque = analysePackage({ json: json(), pngs: [{ name: 'base.png', bytes: rgbBytes }, file('tread.png', 12, 80), file('turret0.png', 68, 82)] });
  assert.match(opaque.errors.join('\n'), /base\.png: has no transparency channel/);

  const shades = analysePackage({ json: json(), pngs: [...goodSkin(1), file('treadShade0.png', 12, 80), file('treadShade1.png', 12, 80)] });
  assert.match(shades.errors.join('\n'), /all 12 .* or none; 2 found/);

  const caps = analysePackage({ json: json(), pngs: [file('Base.PNG', 68, 84), ...goodSkin(1).slice(1)] });
  assert.ok(caps.warnings.some(w => w.startsWith('Base.PNG')) || caps.errors.some(e => e.startsWith('Base.PNG')));

  const notPng = analysePackage({ json: json(), pngs: [{ name: 'base.png', bytes: new Uint8Array(200) }, ...goodSkin(1).slice(1)] });
  assert.match(notPng.errors.join('\n'), /base\.png: not a PNG/);

  const huge = analysePackage({ json: json(), pngs: [{ name: 'base.png', bytes: new Uint8Array(0), size: 9 * 1024 * 1024 }, ...goodSkin(1).slice(1)] });
  assert.match(huge.errors.join('\n'), /base\.png: 9\.0 MB is over the 4 MB limit/);
});

test('package: warnings for a partial skin, no skin.json fallback, unknown files', () => {
  const partial = analysePackage({ json: json(), pngs: [file('base.png', 68, 84), file('tread.png', 12, 80), file('turret0.png', 68, 82), file('readme.png', 4, 4)] });
  assert.equal(partial.ok, true);
  assert.ok(partial.warnings.some(w => w.includes('turret1.png is missing')));
  assert.ok(partial.warnings.some(w => w.startsWith('readme.png')));
  assert.ok(partial.warnings.some(w => w.includes('only 1 of 17 turret frames')));

  const noJson = analysePackage({ json: null, pngs: goodSkin(1), fallbackId: slug('My Cool Folder!'), fallbackName: 'My Cool Folder!' });
  assert.equal(noJson.ok, true);
  assert.equal(noJson.meta.id, 'my-cool-folder');
  assert.deepEqual(noJson.meta.tint, { base: 'none', tread: 'none', turret: 'none' });
  assert.match(noJson.warnings.join('\n'), /No skin\.json/);

  const noId = analysePackage({ json: null, pngs: goodSkin(1) });
  assert.equal(noId.ok, false);
});

test('skin.json: schema, id, tint policies and pixelScale are validated', () => {
  assert.equal(parseSkinJson('{nope').errors.length, 1);
  assert.match(parseSkinJson('{"schema":2,"id":"a"}').errors[0], /schema/);
  assert.match(parseSkinJson('{"schema":1,"id":"Bad Id"}').errors.join(), /"id" must be/);
  assert.match(parseSkinJson('{"schema":1,"id":"a","tint":{"base":"#ff0000"}}').errors.join(), /must be "none" or "player"/);
  assert.match(parseSkinJson('{"schema":1,"id":"a","tint":{"hull":"none"}}').errors.join(), /unknown tint part "hull"/);
  assert.match(parseSkinJson('{"schema":1,"id":"a","pixelScale":3}').errors.join(), /pixelScale/);
  const ok = parseSkinJson('{"schema":1,"id":"a-1","name":"A","tint":{"turret":"player"},"pixelScale":2}');
  assert.deepEqual(ok.errors, []);
  assert.deepEqual(ok.meta.tint, { base: 'none', tread: 'none', turret: 'player' });
  const scaleMismatch = analysePackage({ json: json({ pixelScale: 4 }), pngs: goodSkin(2) });
  assert.match(scaleMismatch.errors.join(), /pixelScale 4 but the files are 2x/);
});

test('settings are sanitised: bad values from storage never reach the engine', () => {
  const dirty = { enabled: 'yes', defaults: { own: { skin: 5, recolor: { base: -1, turret: 0xff0000, hull: 3 } }, others: 'x' }, players: { '12': { skin: 'a', recolor: { tread: 1.5 } }, '../x y': { skin: 'a' } }, panel: { x: 'a', y: 20, collapsed: 0 } };
  const clean = sanitiseSettings(dirty);
  assert.equal(clean.enabled, true);
  assert.deepEqual(clean.defaults.own, { skin: null, recolor: { turret: 0xff0000 } });
  assert.equal(clean.defaults.others, null);
  assert.deepEqual(Object.keys(clean.players), ['12']);
  assert.equal(clean.players['12'].recolor, null);
  assert.deepEqual(clean.panel, { x: null, y: 20, collapsed: true });
  assert.deepEqual(sanitiseSettings(null), defaultSettings());
});

test('the extension contains no network or code-evaluation APIs', () => {
  const banned = /\b(fetch|XMLHttpRequest|WebSocket|sendBeacon|importScripts|EventSource|eval)\s*\(|new\s+Function\b|\bchrome\.(runtime|storage|webRequest|tabs)\b/;
  const dir = path.join(root, 'src');
  for (const name of fs.readdirSync(dir)) {
    const text = fs.readFileSync(path.join(dir, name), 'utf8').split('\n').filter(line => !/^\s*(\/\/|\*|\/\*)/.test(line)).join('\n');
    assert.ok(!banned.test(text), `${name} uses a forbidden API`);
  }
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
  assert.equal(manifest.permissions, undefined);
  assert.equal(manifest.host_permissions, undefined);
  assert.equal(manifest.background, undefined);
  assert.equal(manifest.web_accessible_resources, undefined);
});

test('manifest: every script exists, in dependency order, and the document_start group loads cleanly in a bare context', async () => {
  const vm = await import('node:vm');
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
  assert.equal(manifest.manifest_version, 3);
  const scripts = manifest.content_scripts;
  assert.equal(scripts.length, 2);
  for (const group of scripts) {
    assert.equal(group.world, 'MAIN');
    assert.deepEqual(group.matches, ['https://tanktrouble.com/*']);
    for (const file of group.js) assert.ok(fs.existsSync(path.join(root, file)), file);
  }
  const start = scripts.find(g => g.run_at === 'document_start').js;
  const idle = scripts.find(g => g.run_at === 'document_idle').js;
  const before = (list, a, b) => assert.ok(list.indexOf(`src/${a}`) >= 0 && list.indexOf(`src/${a}`) < list.indexOf(`src/${b}`), `${a} before ${b}`);
  before(start, 'frames.js', 'resample.js'); before(start, 'resample.js', 'core.js'); before(start, 'core.js', 'hook.js');
  before(idle, 'png-info.js', 'skin-package.js'); before(idle, 'skin-package.js', 'importer.js'); before(idle, 'store.js', 'main.js'); before(idle, 'preview.js', 'panel.js'); before(idle, 'panel.js', 'main.js');
  // load the start group into a sandbox that has only what a page has at document_start
  const sandbox = { setInterval() { return 0; }, console, queueMicrotask, WeakRef, WeakSet, Proxy, Reflect, Object };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  for (const file of start) vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), sandbox, { filename: file });
  assert.ok(sandbox.TankSkinTools.core && sandbox.TankSkinTools.hook && sandbox.TankSkinTools.frames);
  assert.equal(sandbox.TankSkinTools.core.isEnabled(), true);
  // a later-defined Phaser global is chained, and a Game constructed through it is remembered
  let constructed = 0;
  sandbox.Phaser = { Game: function Game() { constructed++; this.state = { add() {} }; } };
  const game = new sandbox.Phaser.Game();
  assert.equal(constructed, 1);
  assert.equal(sandbox.TankSkinTools.hook.getGames().length, 1);
  assert.equal(sandbox.TankSkinTools.hook.getGames()[0], game);
});

test('weapon-visual frames and the laser style are accepted and validated', () => {
  const effects = scale => [file('bullet.png', 20 * scale, 20 * scale), file('shotgun.png', 12 * scale, 12 * scale), file('homingMissile.png', 32 * scale, 44 * scale), file('mine.png', 56 * scale, 56 * scale), file('mineGlow.png', 48 * scale, 48 * scale)];
  const ok = analysePackage({ json: json({ laser: { colour: '#FF2F40', glow: true } }), pngs: [...goodSkin(2), ...effects(2)] });
  assert.equal(ok.ok, true, ok.errors.join('; '));
  assert.ok(ok.frames.includes('mineGlow') && ok.frames.includes('homingMissile'));
  assert.deepEqual(ok.meta.laser, { colour: '#ff2f40', value: 0xff2f40, glow: true });
  const wrong = analysePackage({ json: json(), pngs: [...goodSkin(1), file('mine.png', 56, 54)] });
  assert.match(wrong.errors.join('\n'), /mine\.png: is 56x54; mine must be 56x56, 112x112, 224x224/);
  const mixed = analysePackage({ json: json(), pngs: [...goodSkin(2), file('bullet.png', 20, 20)] });
  assert.match(mixed.errors.join('\n'), /Mixed resolutions/);
  assert.match(parseSkinJson('{"schema":1,"id":"a","laser":{"colour":"red"}}').errors.join(), /laser "colour" must be a hex colour/);
  assert.match(parseSkinJson('{"schema":1,"id":"a","laser":{"colour":"#ff0000","glow":"yes"}}').errors.join(), /laser "glow"/);
  assert.equal(parseSkinJson('{"schema":1,"id":"a","laser":{"colour":"#00ff00"}}').meta.laser.glow, true);
  const none = analysePackage({ json: json(), pngs: goodSkin(1) });
  assert.equal(none.meta.laser, null);
});
