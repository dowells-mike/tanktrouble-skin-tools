/* Atlas -> Skin Tools skin. The pure part of atlas-to-skin.mjs (no file access), so it can be tested on its own.
 *
 * An "atlas" is one big PNG plus a JSON file that lists where each named picture sits inside it (TexturePacker's "JSON (Array)" and
 * "JSON (Hash)" formats, as used by Phaser 2/3 and PixiJS). Skin Tools wants one PNG per picture, every one at exactly the same scale.
 * Nothing here assumes a particular atlas: every picture is measured and every difference is either handled or reported.
 *
 *   convertAtlases(inputs, options) -> { ok, files, skinJson, scale, frames, warnings, errors, ignored }
 *     inputs  [{ label, json (object or text), image: { width, height, data } }]    image = straight RGBA, as decodePng returns
 *     options { scale: 'auto'|1|2|4, upscale: 'off' (default)|'smooth'|'sharp', id, name, author, version, tint: 'none'|'player', partial }
 */
'use strict';
const { encodePng } = require('./png.js');
const { ALL_SPECS, SCALES } = require('./frames.js');
const { downsample, visibleFraction } = require('./resample.js');
const { analysePackage, slug } = require('./skin-package.js');

const SIZE_TOLERANCE = 1.01;                // third-party atlases sometimes round an odd size by one pixel
const lower = new Map(Object.keys(ALL_SPECS).map(name => [name.toLowerCase(), name]));

const isInt = n => Number.isInteger(n) && n >= 0;
const rectOf = (value, what) => {
  if (!value || !isInt(value.x ?? 0) || !isInt(value.y ?? 0) || !isInt(value.w) || !isInt(value.h)) throw new Error(`${what} is not a rectangle of whole numbers`);
  return { x: value.x ?? 0, y: value.y ?? 0, w: value.w, h: value.h };
};
const sizeOf = (value, what) => {
  if (!value || !isInt(value.w) || !isInt(value.h) || !value.w || !value.h) throw new Error(`${what} is not a size of whole numbers`);
  return { w: value.w, h: value.h };
};

/** The list of picture entries in one atlas JSON, whichever of the usual layouts it uses. */
function listEntries(json, label) {
  let list = null;
  let frames = json && json.frames;
  if (!frames && json && Array.isArray(json.textures)) {
    if (json.textures.length !== 1) throw new Error(`${label}: this atlas has ${json.textures.length} pages; convert one page (one PNG + its entries) at a time`);
    frames = json.textures[0].frames;
  }
  if (Array.isArray(frames)) list = frames.map(entry => ({ name: entry.filename ?? entry.name, entry }));
  else if (frames && typeof frames === 'object') list = Object.entries(frames).map(([name, entry]) => ({ name, entry }));
  if (!list) throw new Error(`${label}: this does not look like a TexturePacker/Phaser/PixiJS JSON atlas (it has no "frames" list)`);
  return list;
}

/** Frame name as written in an atlas -> the name Skin Tools uses (folders and ".png" dropped; a different capital letter is fixed). */
function matchName(raw, warnings, label) {
  const base = String(raw).split(/[\\/]/).pop().replace(/\.png$/i, '');
  if (ALL_SPECS[base]) return base;
  const fixed = lower.get(base.toLowerCase());
  if (fixed) { warnings.push(`${label}: "${raw}" was read as "${fixed}" (capital letters differ).`); return fixed; }
  return null;
}

/** Cut one picture out of the atlas and put it on its full, untrimmed canvas. */
function extractFrame(image, entry, name, label, warnings) {
  const where = `${label}: ${name}`;
  const rect = rectOf(entry.frame, `${where}: "frame"`);
  if (entry.rotated) throw new Error(`${where} is stored rotated in the atlas. Rotated pictures are not supported: export the atlas again with rotation switched off.`);
  if (rect.x + rect.w > image.width || rect.y + rect.h > image.height) throw new Error(`${where}: sits outside the atlas picture (${rect.x},${rect.y} ${rect.w}x${rect.h} in a ${image.width}x${image.height} image). Is the PNG the one this JSON belongs to?`);
  const note = [];
  let canvas = { w: rect.w, h: rect.h }, offset = { x: 0, y: 0 };
  if (entry.trimmed) {
    canvas = sizeOf(entry.sourceSize, `${where}: "sourceSize"`);
    const placed = rectOf(entry.spriteSourceSize, `${where}: "spriteSourceSize"`);
    if (placed.w !== rect.w || placed.h !== rect.h) warnings.push(`${where}: the trimmed area is ${rect.w}x${rect.h} but "spriteSourceSize" says ${placed.w}x${placed.h}; the pixels were used as they are.`);
    offset = { x: placed.x, y: placed.y };
    if (offset.x + rect.w > canvas.w || offset.y + rect.h > canvas.h) throw new Error(`${where}: the trimmed picture (${rect.w}x${rect.h} at ${offset.x},${offset.y}) does not fit its own ${canvas.w}x${canvas.h} canvas`);
    note.push(`trimmed: put back at ${offset.x},${offset.y} on a ${canvas.w}x${canvas.h} canvas`);
  } else if (entry.sourceSize && (entry.sourceSize.w !== rect.w || entry.sourceSize.h !== rect.h)) {
    warnings.push(`${where}: "sourceSize" says ${entry.sourceSize.w}x${entry.sourceSize.h} but the picture is ${rect.w}x${rect.h} and is not marked trimmed. The ${rect.w}x${rect.h} pixels were used and "sourceSize" ignored.`);
  }
  const data = new Uint8ClampedArray(canvas.w * canvas.h * 4);
  for (let y = 0; y < rect.h; y++) {
    const from = ((rect.y + y) * image.width + rect.x) * 4;
    data.set(image.data.subarray(from, from + rect.w * 4), ((offset.y + y) * canvas.w + offset.x) * 4);
  }
  return { w: canvas.w, h: canvas.h, data, rect, note };
}

/** Resize straight RGBA to dw x dh in premultiplied space (no dark or light halo at the edges).
 *  Shrinking = exact area average (any ratio); enlarging = 'smooth' (bilinear) or 'sharp' (nearest neighbour). */
function resize(src, sw, sh, dw, dh, mode) {
  if (sw === dw && sh === dh) return new Uint8ClampedArray(src);
  const weights = (from, to) => {
    const table = [];
    for (let i = 0; i < to; i++) {
      const taps = [];
      if (to < from) {
        const a = i * from / to, b = (i + 1) * from / to;
        for (let s = Math.floor(a); s < Math.min(from, Math.ceil(b)); s++) taps.push([s, (Math.min(b, s + 1) - Math.max(a, s)) / (b - a)]);
      } else if (to > from && mode === 'smooth') {
        const p = (i + 0.5) * from / to - 0.5, s0 = Math.floor(p), t = p - s0;
        taps.push([Math.max(0, Math.min(from - 1, s0)), 1 - t], [Math.max(0, Math.min(from - 1, s0 + 1)), t]);
      } else taps.push([Math.min(from - 1, Math.floor((i + 0.5) * from / to)), 1]);
      table.push(taps);
    }
    return table;
  };
  // premultiply: [r*a, g*a, b*a, a] in 0..255 units
  const pre = new Float32Array(sw * sh * 4);
  for (let i = 0; i < sw * sh; i++) { const a = src[i * 4 + 3]; pre[i * 4] = src[i * 4] * a / 255; pre[i * 4 + 1] = src[i * 4 + 1] * a / 255; pre[i * 4 + 2] = src[i * 4 + 2] * a / 255; pre[i * 4 + 3] = a; }
  const wx = weights(sw, dw), wy = weights(sh, dh);
  const mid = new Float32Array(dw * sh * 4);
  for (let y = 0; y < sh; y++) for (let x = 0; x < dw; x++) for (const [s, w] of wx[x]) for (let c = 0; c < 4; c++) mid[(y * dw + x) * 4 + c] += pre[(y * sw + s) * 4 + c] * w;
  const out = new Uint8ClampedArray(dw * dh * 4);
  const acc = new Float32Array(4);
  for (let y = 0; y < dh; y++) for (let x = 0; x < dw; x++) {
    acc.fill(0);
    for (const [s, w] of wy[y]) for (let c = 0; c < 4; c++) acc[c] += mid[(s * dw + x) * 4 + c] * w;
    const a = acc[3];
    if (a > 0.0001) {
      const o = (y * dw + x) * 4;
      out[o] = Math.round(acc[0] * 255 / a); out[o + 1] = Math.round(acc[1] * 255 / a); out[o + 2] = Math.round(acc[2] * 255 / a); out[o + 3] = Math.round(a);
    }
  }
  return out;
}

/** @param {{label:string, json:object|string, image:{width:number,height:number,data:Uint8ClampedArray}}[]} inputs */
function convertAtlases(inputs, options = {}) {
  const warnings = [], errors = [], ignored = [], frames = new Map();
  const upscale = options.upscale || 'off';      // enlarging is ALWAYS opt-in (--upscale smooth|sharp): it adds no detail
  const fail = message => { errors.push(message); };

  // 1. read every atlas
  for (const input of inputs) {
    const label = input.label;
    try {
      const json = typeof input.json === 'string' ? JSON.parse(input.json) : input.json;
      for (const { name: raw, entry } of listEntries(json, label)) {
        if (raw == null) { warnings.push(`${label}: an entry without a name was skipped.`); continue; }
        const name = matchName(raw, warnings, label);
        if (!name) { ignored.push(String(raw)); continue; }
        if (frames.has(name)) { fail(`${label}: "${name}" appears more than once (also in ${frames.get(name).label}). Each picture must have exactly one entry.`); continue; }
        try {
          const cut = extractFrame(input.image, entry, name, label, warnings);
          frames.set(name, { name, label, raw: String(raw), ...cut });
        } catch (error) { fail(error.message); }
      }
    } catch (error) { fail(error instanceof SyntaxError ? `${label}: the JSON file is not valid JSON (${error.message})` : error.message); }
  }
  if (!frames.size && !errors.length) fail('No tank pictures were found in the atlas (names such as base, tread, treadShade0, turret0 ... turret16). Check that the picture names match the starter kit\'s guide.');

  // 2. measure: every picture must be a clean multiple (or fraction) of its native size
  const ratios = new Map();
  for (const frame of frames.values()) {
    const spec = ALL_SPECS[frame.name];
    const rw = frame.w / spec.w, rh = frame.h / spec.h;
    if (Math.abs(frame.h - spec.h * rw) > SIZE_TOLERANCE || Math.abs(frame.w - spec.w * rh) > SIZE_TOLERANCE) {
      fail(`${frame.label}: ${frame.name} is ${frame.w}x${frame.h}, which is not the shape of the ${spec.w}x${spec.h} the game uses (the same shape at 0.5x, 1x, 2x, 3x, 4x ... is fine).`);
      frame.ratio = null;
      continue;
    }
    frame.ratio = Math.round(((rw + rh) / 2) * 1000) / 1000;
    ratios.set(frame.ratio, (ratios.get(frame.ratio) || 0) + 1);
  }

  // 3. one output scale for the whole skin (Skin Tools needs every picture at the same one)
  let scale;
  if (options.scale && options.scale !== 'auto') {
    scale = Number(options.scale);
    if (!SCALES.includes(scale)) fail(`--scale must be auto, 1, 2 or 4 (not ${options.scale}).`);
  } else if (ratios.size) {
    const common = [...ratios].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0][0];      // the most common size; a tie goes to the larger
    scale = Math.max(1, ...SCALES.filter(s => s <= common + 0.001));
  }

  // 4. bring every picture to that scale
  const files = [];
  const report = [];
  const enlarged = [], tooSmall = [];
  if (scale && !errors.length) {
    for (const frame of [...frames.values()].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))) {
      const spec = ALL_SPECS[frame.name];
      const dw = spec.w * scale, dh = spec.h * scale;
      const steps = [...frame.note];
      let data = frame.data;
      if (frame.w === dw && frame.h === dh) steps.push(`already ${dw}x${dh}`);
      else if (frame.ratio > scale + 0.001 || (frame.w > dw && frame.h > dh)) {
        const factor = frame.w / dw;
        if (Number.isInteger(factor) && frame.h === dh * factor) data = downsample(frame.data, frame.w, frame.h, factor).data;       // exactly what Skin Tools itself does with 2x/4x art
        else data = resize(frame.data, frame.w, frame.h, dw, dh, 'smooth');
        steps.push(`reduced ${frame.w}x${frame.h} -> ${dw}x${dh}`);
      } else if (upscale === 'off') {
        tooSmall.push(`${frame.name} (${frame.w}x${frame.h})`);
        continue;
      } else {
        data = resize(frame.data, frame.w, frame.h, dw, dh, upscale);
        steps.push(`ENLARGED ${frame.w}x${frame.h} -> ${dw}x${dh} (${upscale}); enlarging adds no detail`);
        enlarged.push(frame.name);
      }
      const visible = visibleFraction(data);
      if (visible === 0) { warnings.push(`${frame.name}: completely transparent in the atlas; not written.`); continue; }
      if (visible === 1) warnings.push(`${frame.name}: has no transparent pixel at all, so it would draw as a solid rectangle. If the atlas has a coloured background, remove it first.`);
      files.push({ name: `${frame.name}.png`, frame: frame.name, png: encodePng(dw, dh, data), width: dw, height: dh, rgba: data });
      report.push({ name: frame.name, label: frame.label, atlasName: frame.raw, rect: frame.rect, canvas: `${frame.w}x${frame.h}`, ratio: frame.ratio, steps });
    }
  }

  if (tooSmall.length) fail(`${tooSmall.length} picture(s) are smaller than the ${scale}x output size: ${tooSmall.slice(0, 6).join(', ')}${tooSmall.length > 6 ? ', ...' : ''}. Pass --upscale smooth (or sharp) to enlarge them.`);
  if (enlarged.length) warnings.push(`${enlarged.length} picture(s) were smaller than the output size and were enlarged (${upscale}): ${enlarged.length > 6 ? `${enlarged.slice(0, 6).join(', ')}, ...` : enlarged.join(', ')}. Enlarging adds no detail, so they look soft or blocky; redraw them at the larger size for the best result.`);

  // 5. the three treadShade rules of the importer, and the skin.json
  const shadeFiles = files.filter(f => /^treadShade\d+$/.test(f.frame));
  if (shadeFiles.length && shadeFiles.length < 12) {
    warnings.push(`Only ${shadeFiles.length} of the 12 treadShade pictures were found; Skin Tools needs all 12 or none, so none were written (the game's own tread animation is used).`);
    for (const f of shadeFiles) files.splice(files.indexOf(f), 1);
  }
  const tint = options.tint || 'none';
  const id = options.id || slug(options.defaultId || '') || null;
  const skinJson = id ? { schema: 1, id, name: options.name || id, author: options.author || '', version: options.version || '1.0.0', tint: { base: tint, tread: tint, turret: tint }, ...(scale ? { pixelScale: scale } : {}) } : null;
  if (!id) fail('Give the skin an id with --id (lower-case letters, digits and hyphens, for example my-skin).');

  // 6. ask the extension's own checker whether this is an importable skin
  let analysis = null;
  if (!errors.length) {
    analysis = analysePackage({ json: JSON.stringify(skinJson), pngs: files.map(f => ({ name: f.name, bytes: f.png })) });
    for (const e of analysis.errors) errors.push(`Skin Tools would refuse this skin: ${e}`);
    for (const w of analysis.warnings) warnings.push(w);
    if (errors.length && options.partial) { for (const e of errors.splice(0)) warnings.push(`(allowed by --partial) ${e}`); }
  }
  return { ok: !errors.length, files, skinJson, scale: scale || null, frames: report, warnings, errors, ignored, analysis };
}

/** A contact sheet PNG of the converted pictures on a grey checkerboard, so a human can look before importing. */
function contactSheet(files, maxWidth = 1000) {
  const cell = file => ({ w: file.width + 12, h: file.height + 12 });
  const order = [...files].sort((a, b) => a.frame.localeCompare(b.frame, undefined, { numeric: true }));
  let x = 0, y = 0, row = 0, width = 0;
  const placed = [];
  for (const file of order) {
    const c = cell(file);
    if (x + c.w > maxWidth && x > 0) { x = 0; y += row; row = 0; }
    placed.push({ file, x, y });
    x += c.w; row = Math.max(row, c.h); width = Math.max(width, x);
  }
  const height = y + row;
  const data = new Uint8ClampedArray(width * height * 4);
  for (let py = 0; py < height; py++) for (let px = 0; px < width; px++) { const v = ((px >> 3) + (py >> 3)) & 1 ? 176 : 150; data.set([v, v, v, 255], (py * width + px) * 4); }
  for (const { file, x: ox, y: oy } of placed) {
    for (let py = 0; py < file.height; py++) for (let px = 0; px < file.width; px++) {
      const s = (py * file.width + px) * 4, d = ((oy + 6 + py) * width + ox + 6 + px) * 4, a = file.rgba[s + 3] / 255;
      for (let c = 0; c < 3; c++) data[d + c] = Math.round(file.rgba[s + c] * a + data[d + c] * (1 - a));
    }
  }
  return encodePng(width, height, data);
}

module.exports = { convertAtlases, contactSheet, resize, listEntries, matchName };
