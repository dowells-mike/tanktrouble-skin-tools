// Dependency-free PNG tools for the release build.
//   decode(bytes)            -> { width, height, data: Uint8Array RGBA }   (8-bit, non-interlaced: grey, grey+alpha, RGB, RGBA, palette)
//   optimise(rgba, w, h)     -> Buffer: the smallest lossless encoding found (palette, grey+alpha or RGBA; per-row or fixed filters;
//                               zlib level 9). Only IHDR, PLTE, tRNS, IDAT and IEND are written: no text, time, EXIF or colour
//                               profile metadata can survive.
//   chunkTypes(bytes)        -> ['IHDR', 'IDAT', ...] (used by the audit)
// The output is deterministic: the same pixels always give the same bytes.
import zlib from 'node:zlib';

const SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc32 = buf => { let c = 0xffffffff; for (const b of buf) c = CRC[(c ^ b) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };

export function chunkTypes(bytes) {
  const b = Buffer.from(bytes);
  if (!b.subarray(0, 8).equals(SIG)) throw new Error('not a PNG');
  const out = [];
  for (let o = 8; o + 8 <= b.length;) { const len = b.readUInt32BE(o); out.push(b.toString('latin1', o + 4, o + 8)); o += 12 + len; }
  return out;
}

export function decode(bytes) {
  const b = Buffer.from(bytes);
  if (!b.subarray(0, 8).equals(SIG)) throw new Error('not a PNG');
  let width, height, depth, type, interlace, palette = null, trns = null;
  const idat = [];
  for (let o = 8; o + 8 <= b.length;) {
    const len = b.readUInt32BE(o), kind = b.toString('latin1', o + 4, o + 8), data = b.subarray(o + 8, o + 8 + len);
    if (kind === 'IHDR') { width = data.readUInt32BE(0); height = data.readUInt32BE(4); depth = data[8]; type = data[9]; interlace = data[12]; }
    else if (kind === 'PLTE') palette = data;
    else if (kind === 'tRNS') trns = data;
    else if (kind === 'IDAT') idat.push(data);
    o += 12 + len;
  }
  if (depth !== 8 || interlace !== 0) throw new Error(`unsupported PNG (bit depth ${depth}, interlace ${interlace})`);
  const channels = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[type];
  if (!channels) throw new Error(`unsupported PNG colour type ${type}`);
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const pix = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y++) {
    const f = raw[y * (stride + 1)], src = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1)), row = y * stride;
    for (let x = 0; x < stride; x++) {
      const a = x >= channels ? pix[row + x - channels] : 0, up = y ? pix[row - stride + x] : 0, c = x >= channels && y ? pix[row - stride + x - channels] : 0;
      let v = src[x];
      if (f === 1) v += a; else if (f === 2) v += up; else if (f === 3) v += (a + up) >> 1;
      else if (f === 4) { const p = a + up - c, pa = Math.abs(p - a), pb = Math.abs(p - up), pc = Math.abs(p - c); v += pa <= pb && pa <= pc ? a : pb <= pc ? up : c; }
      pix[row + x] = v & 255;
    }
  }
  const data = new Uint8Array(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    let r, g, bl, al = 255;
    if (type === 6) { r = pix[i * 4]; g = pix[i * 4 + 1]; bl = pix[i * 4 + 2]; al = pix[i * 4 + 3]; }
    else if (type === 2) { r = pix[i * 3]; g = pix[i * 3 + 1]; bl = pix[i * 3 + 2]; if (trns && trns.length >= 6 && r === trns.readUInt16BE(0) && g === trns.readUInt16BE(2) && bl === trns.readUInt16BE(4)) al = 0; }
    else if (type === 4) { r = g = bl = pix[i * 2]; al = pix[i * 2 + 1]; }
    else if (type === 0) { r = g = bl = pix[i]; if (trns && trns.length >= 2 && r === trns.readUInt16BE(0)) al = 0; }
    else { const k = pix[i]; r = palette[k * 3]; g = palette[k * 3 + 1]; bl = palette[k * 3 + 2]; al = trns && k < trns.length ? trns[k] : 255; }
    data.set([r, g, bl, al], i * 4);
  }
  return { width, height, data };
}

function chunk(type, data) {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0); out.write(type, 4, 'latin1'); data.copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}
const paeth = (a, b, c) => { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); return pa <= pb && pa <= pc ? a : pb <= pc ? b : c; };

/** Filter rows. mode: 0-4 = that filter on every row, 'adaptive' = per row the smallest sum of absolute values. */
function filterRows(pix, width, height, bpp, mode) {
  const stride = width * bpp, out = Buffer.alloc((stride + 1) * height), tmp = Buffer.alloc(stride);
  for (let y = 0; y < height; y++) {
    const row = pix.subarray(y * stride, (y + 1) * stride), prev = y ? pix.subarray((y - 1) * stride, y * stride) : null;
    let best = -1, bestSum = Infinity;
    for (const f of mode === 'adaptive' ? [0, 1, 2, 3, 4] : [mode]) {
      let sum = 0;
      for (let x = 0; x < stride; x++) {
        const a = x >= bpp ? row[x - bpp] : 0, b = prev ? prev[x] : 0, c = prev && x >= bpp ? prev[x - bpp] : 0;
        const v = (row[x] - (f === 0 ? 0 : f === 1 ? a : f === 2 ? b : f === 3 ? (a + b) >> 1 : paeth(a, b, c))) & 255;
        tmp[x] = v; sum += v < 128 ? v : 256 - v;
      }
      if (sum < bestSum) { bestSum = sum; best = f; out[y * (stride + 1)] = f; tmp.copy(out, y * (stride + 1) + 1); }
    }
  }
  return out;
}

function encodeWith(type, pix, width, height, bpp, extra, mode) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4); ihdr[8] = 8; ihdr[9] = type; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const idat = zlib.deflateSync(filterRows(pix, width, height, bpp, mode), { level: 9, memLevel: 9 });
  return Buffer.concat([SIG, chunk('IHDR', ihdr), ...extra, chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
}

/** Smallest lossless PNG for these RGBA pixels. Fully transparent pixels keep their colour (the game's linear filtering can read them). */
export function optimise(rgba, width, height) {
  const n = width * height;
  const candidates = [];
  const modes = ['adaptive', 0, 1, 2, 4];
  // RGBA
  const rgbaBuf = Buffer.from(rgba.buffer, rgba.byteOffset, n * 4);
  for (const m of modes) candidates.push(encodeWith(6, rgbaBuf, width, height, 4, [], m));
  // grey + alpha when every pixel is grey
  let grey = true;
  for (let i = 0; i < n && grey; i++) grey = rgba[i * 4] === rgba[i * 4 + 1] && rgba[i * 4] === rgba[i * 4 + 2];
  if (grey) {
    const ga = Buffer.alloc(n * 2);
    for (let i = 0; i < n; i++) { ga[i * 2] = rgba[i * 4]; ga[i * 2 + 1] = rgba[i * 4 + 3]; }
    for (const m of modes) candidates.push(encodeWith(4, ga, width, height, 2, [], m));
  }
  // palette (+ tRNS) when at most 256 distinct RGBA values; entries sorted so the encoding is deterministic
  const seen = new Map();
  for (let i = 0; i < n && seen.size <= 256; i++) { const k = rgba[i * 4] << 24 | rgba[i * 4 + 1] << 16 | rgba[i * 4 + 2] << 8 | rgba[i * 4 + 3]; if (!seen.has(k >>> 0)) seen.set(k >>> 0, 0); }
  if (seen.size <= 256) {
    const keys = [...seen.keys()].sort((a, b) => (a & 255) - (b & 255) || a - b);       // translucent entries first keeps tRNS short
    keys.forEach((k, i) => seen.set(k, i));
    const plte = Buffer.alloc(keys.length * 3), alphas = keys.map(k => k & 255);
    keys.forEach((k, i) => { plte[i * 3] = k >>> 24; plte[i * 3 + 1] = (k >>> 16) & 255; plte[i * 3 + 2] = (k >>> 8) & 255; });
    let lastTranslucent = -1; alphas.forEach((a, i) => { if (a !== 255) lastTranslucent = i; });
    const extra = [chunk('PLTE', plte), ...(lastTranslucent >= 0 ? [chunk('tRNS', Buffer.from(alphas.slice(0, lastTranslucent + 1)))] : [])];
    const idx = Buffer.alloc(n);
    for (let i = 0; i < n; i++) idx[i] = seen.get((rgba[i * 4] << 24 | rgba[i * 4 + 1] << 16 | rgba[i * 4 + 2] << 8 | rgba[i * 4 + 3]) >>> 0);
    for (const m of [0, 'adaptive']) candidates.push(encodeWith(3, idx, width, height, 1, extra, m));
  }
  candidates.sort((a, b) => a.length - b.length);
  const best = candidates[0];
  // never trust an encoder blindly: decode it again and require identical pixels
  const back = decode(best).data;
  for (let i = 0; i < n * 4; i++) if (back[i] !== rgba[i]) throw new Error('PNG optimiser round trip mismatch');
  return best;
}

/** For documentation screenshots only (never skin art or icons): reduce to at most 256 colours with median cut, no dithering.
 *  Returns { rgba, psnr } so the caller can refuse a result that would visibly differ. */
export function quantise(rgba, width, height, colours = 256) {
  const n = width * height;
  const counts = new Map();
  for (let i = 0; i < n; i++) { const k = (rgba[i * 4] << 24 | rgba[i * 4 + 1] << 16 | rgba[i * 4 + 2] << 8 | rgba[i * 4 + 3]) >>> 0; counts.set(k, (counts.get(k) || 0) + 1); }
  let boxes = [[...counts].map(([k, c]) => [k >>> 24, (k >>> 16) & 255, (k >>> 8) & 255, k & 255, c])];
  const range = box => { let best = 0, ch = 0; for (let c = 0; c < 4; c++) { let lo = 255, hi = 0; for (const p of box) { if (p[c] < lo) lo = p[c]; if (p[c] > hi) hi = p[c]; } if (hi - lo > best) { best = hi - lo; ch = c; } } return { best, ch }; };
  // split the box with the largest squared error, at the count-weighted mean of its widest channel
  const stats = box => { const tot = box.reduce((s, p) => s + p[4], 0); const mean = [0, 1, 2, 3].map(c => box.reduce((s, p) => s + p[c] * p[4], 0) / tot); let sse = 0; const spread = [0, 0, 0, 0]; for (const p of box) for (let c = 0; c < 4; c++) { const d = (p[c] - mean[c]) ** 2 * p[4]; sse += d; spread[c] += d; } return { sse, mean, ch: spread.indexOf(Math.max(...spread)) }; };
  let info = boxes.map(stats);
  while (boxes.length < colours) {
    let pick = -1, worst = 0;
    info.forEach((s, i) => { if (boxes[i].length > 1 && s.sse > worst) { worst = s.sse; pick = i; } });
    if (pick < 0) break;
    const box = boxes[pick], { ch, mean } = info[pick];
    const lo = box.filter(p => p[ch] <= mean[ch]), hi = box.filter(p => p[ch] > mean[ch]);
    if (!lo.length || !hi.length) { info[pick] = { ...info[pick], sse: 0 }; continue; }
    boxes.splice(pick, 1, lo, hi);
    info.splice(pick, 1, stats(lo), stats(hi));
  }
  const palette = boxes.map(b => { const t = b.reduce((s, p) => s + p[4], 0); return [0, 1, 2, 3].map(c => Math.round(b.reduce((s, p) => s + p[c] * p[4], 0) / t)); });
  const lookup = new Map();
  boxes.forEach((b, i) => { for (const p of b) lookup.set((p[0] << 24 | p[1] << 16 | p[2] << 8 | p[3]) >>> 0, i); });
  const out = new Uint8Array(n * 4);
  let se = 0;
  for (let i = 0; i < n; i++) { const k = (rgba[i * 4] << 24 | rgba[i * 4 + 1] << 16 | rgba[i * 4 + 2] << 8 | rgba[i * 4 + 3]) >>> 0; const p = palette[lookup.get(k)]; out.set(p, i * 4); for (let c = 0; c < 4; c++) se += (p[c] - rgba[i * 4 + c]) ** 2; }
  const mse = se / (n * 4);
  return { rgba: out, psnr: mse === 0 ? Infinity : 10 * Math.log10(255 * 255 / mse) };
}
