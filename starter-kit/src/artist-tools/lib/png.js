/* PNG reading and writing with no dependencies.
 *   decodePng(bytes) -> { width, height, data }   data = straight (non-premultiplied) RGBA, 8 bits per channel
 *   encodePng(width, height, rgba) -> Buffer      8-bit RGBA, deterministic (the same pixels always give the same bytes)
 * Reads every kind of PNG artists meet: grey, grey+alpha, RGB, RGBA and palette images, 1/2/4/8/16 bits per channel, with a
 * palette's or a single colour's transparency (tRNS). Interlaced PNGs are refused with a clear message. */
'use strict';
const zlib = require('node:zlib');

const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; table[n] = c >>> 0; }
  return table;
})();
const crc32 = buffer => { let c = 0xffffffff; for (const byte of buffer) c = CRC_TABLE[(c ^ byte) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };

function chunk(type, data) {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, 'ascii');
  data.copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}

const CHANNELS = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 };
const DEPTHS = { 0: [1, 2, 4, 8, 16], 2: [8, 16], 3: [1, 2, 4, 8], 4: [8, 16], 6: [8, 16] };

/** @param {Uint8Array} bytes */
function decodePng(bytes) {
  const b = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (b.length < 8 || !b.subarray(0, 8).equals(SIGNATURE)) throw new Error('not a PNG file');
  let header = null, palette = null, trns = null;
  const idat = [];
  let sawEnd = false;
  for (let o = 8; o + 8 <= b.length;) {
    const length = b.readUInt32BE(o), type = b.toString('latin1', o + 4, o + 8);
    if (o + 12 + length > b.length) throw new Error('the PNG is cut short (damaged file)');
    const data = b.subarray(o + 8, o + 8 + length);
    if (type === 'IHDR') header = { width: data.readUInt32BE(0), height: data.readUInt32BE(4), depth: data[8], type: data[9], interlace: data[12] };
    else if (type === 'PLTE') palette = data;
    else if (type === 'tRNS') trns = data;
    else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') { sawEnd = true; break; }
    o += 12 + length;
  }
  if (!header) throw new Error('the PNG has no header (damaged file)');
  if (!sawEnd || !idat.length) throw new Error('the PNG has no picture data (damaged file)');
  const { width, height, depth, type, interlace } = header;
  if (!CHANNELS[type] || !DEPTHS[type].includes(depth)) throw new Error(`unsupported PNG (colour type ${type}, ${depth} bits)`);
  if (interlace) throw new Error('this PNG is interlaced; save it again without interlacing');
  if (!width || !height || width * height > 64e6) throw new Error(`unreasonable PNG size ${width}x${height}`);
  if (type === 3 && !palette) throw new Error('a palette PNG without a palette (damaged file)');

  const channels = CHANNELS[type];
  const bitsPerPixel = channels * depth;
  const stride = Math.ceil(width * bitsPerPixel / 8);
  const bpp = Math.max(1, bitsPerPixel >> 3);                      // filter distance in bytes
  const raw = zlib.inflateSync(Buffer.concat(idat));
  if (raw.length < (stride + 1) * height) throw new Error('the PNG picture data is too short (damaged file)');
  const rows = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)], src = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1)), row = y * stride;
    for (let x = 0; x < stride; x++) {
      const left = x >= bpp ? rows[row + x - bpp] : 0, up = y ? rows[row - stride + x] : 0, upLeft = x >= bpp && y ? rows[row - stride + x - bpp] : 0;
      let v = src[x];
      if (filter === 1) v += left;
      else if (filter === 2) v += up;
      else if (filter === 3) v += (left + up) >> 1;
      else if (filter === 4) { const p = left + up - upLeft, pa = Math.abs(p - left), pb = Math.abs(p - up), pc = Math.abs(p - upLeft); v += pa <= pb && pa <= pc ? left : pb <= pc ? up : upLeft; }
      else if (filter !== 0) throw new Error(`unknown PNG row filter ${filter} (damaged file)`);
      rows[row + x] = v & 255;
    }
  }

  const out = new Uint8ClampedArray(width * height * 4);
  const maxValue = (1 << Math.min(depth, 8)) - 1;
  /** One sample of channel c of pixel x in row y, as 0..255 (16-bit samples keep their high byte, 1/2/4-bit ones are scaled). */
  const sample = (y, x, c) => {
    const row = y * stride;
    if (depth === 8) return rows[row + x * channels + c];
    if (depth === 16) return rows[row + (x * channels + c) * 2];
    const bit = (x * channels + c) * depth;
    return (rows[row + (bit >> 3)] >> (8 - depth - (bit & 7))) & maxValue;
  };
  /** The sample at full precision, for comparing with a tRNS colour key. */
  const exact = (y, x, c) => (depth === 16 ? (rows[y * stride + (x * channels + c) * 2] << 8) | rows[y * stride + (x * channels + c) * 2 + 1] : sample(y, x, c));
  const key = trns && (type === 0 ? [trns.readUInt16BE(0)] : type === 2 ? [trns.readUInt16BE(0), trns.readUInt16BE(2), trns.readUInt16BE(4)] : null);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const o = (y * width + x) * 4;
      if (type === 6) { out[o] = sample(y, x, 0); out[o + 1] = sample(y, x, 1); out[o + 2] = sample(y, x, 2); out[o + 3] = sample(y, x, 3); }
      else if (type === 2) {
        out[o] = sample(y, x, 0); out[o + 1] = sample(y, x, 1); out[o + 2] = sample(y, x, 2); out[o + 3] = 255;
        if (key && exact(y, x, 0) === key[0] && exact(y, x, 1) === key[1] && exact(y, x, 2) === key[2]) out[o + 3] = 0;
      } else if (type === 0) {
        const g = depth >= 8 ? sample(y, x, 0) : Math.round(sample(y, x, 0) * 255 / maxValue);
        out[o] = out[o + 1] = out[o + 2] = g; out[o + 3] = 255;
        if (key && exact(y, x, 0) === key[0]) out[o + 3] = 0;
      } else if (type === 4) { const g = sample(y, x, 0); out[o] = out[o + 1] = out[o + 2] = g; out[o + 3] = sample(y, x, 1); }
      else {                                                           // palette
        const index = sample(y, x, 0);
        if (index * 3 + 2 >= palette.length) throw new Error('a pixel uses a colour missing from the palette (damaged file)');
        out[o] = palette[index * 3]; out[o + 1] = palette[index * 3 + 1]; out[o + 2] = palette[index * 3 + 2];
        out[o + 3] = trns && index < trns.length ? trns[index] : 255;
      }
    }
  }
  return { width, height, data: out };
}

/** @param {Uint8Array|Uint8ClampedArray} rgba width*height*4 straight-alpha bytes */
function encodePng(width, height, rgba) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0); header.writeUInt32BE(height, 4);
  header[8] = 8; header[9] = 6;
  const stride = width * 4;
  const src = Buffer.from(rgba.buffer, rgba.byteOffset, width * height * 4);
  const raw = Buffer.alloc((stride + 1) * height);
  const candidate = Buffer.alloc(stride);
  for (let y = 0; y < height; y++) {
    // per row, keep the filter whose output has the smallest sum of absolute values (the usual heuristic)
    let bestScore = Infinity;
    for (let f = 0; f <= 4; f++) {
      let score = 0;
      for (let x = 0; x < stride; x++) {
        const cur = src[y * stride + x], left = x >= 4 ? src[y * stride + x - 4] : 0, up = y ? src[(y - 1) * stride + x] : 0, upLeft = x >= 4 && y ? src[(y - 1) * stride + x - 4] : 0;
        let p = 0;
        if (f === 1) p = left; else if (f === 2) p = up; else if (f === 3) p = (left + up) >> 1;
        else if (f === 4) { const q = left + up - upLeft, pa = Math.abs(q - left), pb = Math.abs(q - up), pc = Math.abs(q - upLeft); p = pa <= pb && pa <= pc ? left : pb <= pc ? up : upLeft; }
        const v = (cur - p) & 255;
        candidate[x] = v;
        score += v < 128 ? v : 256 - v;
        if (score >= bestScore) break;
      }
      if (score < bestScore) { bestScore = score; raw[y * (stride + 1)] = f; candidate.copy(raw, y * (stride + 1) + 1); }
    }
  }
  return Buffer.concat([SIGNATURE, chunk('IHDR', header), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

module.exports = { decodePng, encodePng };
