// Strict PSD reader for 8-bit RGB(A) documents: header, image resources, layer records, groups, channel data
// (raw and PackBits/RLE, which is what Photoshop writes). Every length field is checked against the file.
// Written independently of psd-writer.js so that a round trip is a real test of the file's structure.
'use strict';

class Reader {
  constructor(buf) { this.b = buf; this.o = 0; }
  need(n, what) { if (this.o + n > this.b.length) throw new Error(`PSD truncated while reading ${what} at byte ${this.o}`); }
  u8(w) { this.need(1, w); return this.b[this.o++]; }
  u16(w) { this.need(2, w); const v = this.b.readUInt16BE(this.o); this.o += 2; return v; }
  i16(w) { this.need(2, w); const v = this.b.readInt16BE(this.o); this.o += 2; return v; }
  u32(w) { this.need(4, w); const v = this.b.readUInt32BE(this.o); this.o += 4; return v; }
  i32(w) { this.need(4, w); const v = this.b.readInt32BE(this.o); this.o += 4; return v; }
  str(n, w) { this.need(n, w); const v = this.b.toString('latin1', this.o, this.o + n); this.o += n; return v; }
  skip(n, w) { this.need(n, w); this.o += n; }
}

function unpackBits(src, expected) {
  const out = Buffer.alloc(expected);
  let i = 0, o = 0;
  while (o < expected && i < src.length) {
    const n = src.readInt8(i++);
    if (n >= 0) { const c = n + 1; if (i + c > src.length || o + c > expected) throw new Error('bad RLE literal run'); src.copy(out, o, i, i + c); i += c; o += c; }
    else if (n !== -128) { const c = 1 - n; if (i >= src.length || o + c > expected) throw new Error('bad RLE repeat run'); out.fill(src[i++], o, o + c); o += c; }
  }
  if (o !== expected) throw new Error(`RLE data decoded to ${o} bytes, expected ${expected}`);
  return out;
}

/** @returns {{width,height,depth,channels,mode,resources:number[],guides:{vertical:number[],horizontal:number[]},layers:object[]}} */
function readPsd(buffer) {
  const r = new Reader(buffer);
  if (r.str(4, 'signature') !== '8BPS') throw new Error('not a PSD (bad signature)');
  const version = r.u16('version');
  if (version !== 1) throw new Error(`PSD version ${version} is not supported (PSB?)`);
  r.skip(6, 'reserved');
  const channels = r.u16('channels'), height = r.u32('height'), width = r.u32('width'), depth = r.u16('depth'), mode = r.u16('mode');
  if (depth !== 8) throw new Error(`only 8-bit documents are supported (this one is ${depth}-bit): Image > Mode > 8 Bits/Channel`);
  if (mode !== 3) throw new Error(`only RGB documents are supported (colour mode ${mode}): Image > Mode > RGB Color`);
  r.skip(r.u32('colour mode data length'), 'colour mode data');

  const resLen = r.u32('image resources length');
  const resEnd = r.o + resLen;
  if (resEnd > buffer.length) throw new Error('image resources run past the end of the file');
  const resources = [];
  const guides = { vertical: [], horizontal: [] };
  while (r.o < resEnd) {
    if (r.str(4, 'resource signature') !== '8BIM') throw new Error('bad image resource signature');
    const id = r.u16('resource id'); resources.push(id);
    const nameLen = r.u8('resource name'); r.skip(nameLen, 'resource name'); if ((nameLen + 1) % 2) r.skip(1, 'resource name pad');
    const len = r.u32('resource length'); const start = r.o;
    if (id === 1032) {
      r.skip(12, 'guide header'); const count = r.u32('guide count');
      for (let i = 0; i < count; i++) { const loc = r.u32('guide') / 32; (r.u8('guide direction') === 0 ? guides.vertical : guides.horizontal).push(loc); }
    }
    r.o = start + len + (len % 2);
  }
  if (r.o !== resEnd) throw new Error('image resource lengths do not add up');

  const maskLen = r.u32('layer and mask length');
  const maskEnd = r.o + maskLen;
  if (maskEnd > buffer.length) throw new Error('layer and mask section runs past the end of the file');
  const layers = [];
  if (maskLen > 0) {
    const infoLen = r.u32('layer info length');
    const infoEnd = r.o + infoLen;
    if (infoEnd > maskEnd) throw new Error('layer info is longer than its section');
    if (infoLen > 0) {
      const count = Math.abs(r.i16('layer count'));
      const recs = [];
      for (let n = 0; n < count; n++) {
        const top = r.i32('top'), left = r.i32('left'), bottom = r.i32('bottom'), right = r.i32('right');
        if (bottom < top || right < left) throw new Error(`layer ${n}: negative size`);
        const cc = r.u16('channel count');
        const chans = [];
        for (let c = 0; c < cc; c++) chans.push({ id: r.i16('channel id'), length: r.u32('channel length') });
        if (r.str(4, 'blend signature') !== '8BIM') throw new Error(`layer ${n}: bad blend signature`);
        const blend = r.str(4, 'blend key'); const opacity = r.u8('opacity'); r.u8('clipping'); const flags = r.u8('flags'); r.u8('filler');
        const extraLen = r.u32('extra length'); const extraEnd = r.o + extraLen;
        if (extraEnd > infoEnd) throw new Error(`layer ${n}: extra data runs past layer info`);
        r.skip(r.u32('mask length'), 'mask'); r.skip(r.u32('blending ranges length'), 'blending ranges');
        const pl = r.u8('layer name'); let name = r.str(pl, 'layer name'); r.skip((4 - ((pl + 1) % 4)) % 4, 'name pad');
        const rec = { index: n, name, top, left, bottom, right, width: right - left, height: bottom - top, channels: chans, blend, opacity, visible: !(flags & 2), section: null, label: null, locked: false };
        while (r.o + 12 <= extraEnd) {
          if (r.str(4, 'block signature') !== '8BIM') throw new Error(`layer ${n}: bad tagged block signature`);
          const key = r.str(4, 'block key'); const len = r.u32('block length'); const start = r.o;
          if (r.o + len > extraEnd) throw new Error(`layer ${n}: block ${key} runs past the extra data`);
          if (key === 'luni') { const chars = r.u32('unicode length'); let t = ''; for (let i = 0; i < chars; i++) t += String.fromCharCode(r.u16('unicode')); rec.name = t; }
          else if (key === 'lsct') rec.section = r.u32('section type');
          else if (key === 'lclr') rec.label = r.u16('label');
          else if (key === 'lspf') rec.locked = r.u32('protection') !== 0;
          r.o = start + len;
        }
        if (r.o !== extraEnd) throw new Error(`layer ${n}: extra data length mismatch (${r.o} vs ${extraEnd})`);
        recs.push(rec);
      }
      // channel image data, in record order
      for (const rec of recs) {
        const planes = {};
        for (const ch of rec.channels) {
          const end = r.o + ch.length;
          if (end > infoEnd) throw new Error(`layer "${rec.name}": channel data runs past layer info`);
          const compression = r.u16('compression');
          const n = rec.width * rec.height;
          if (ch.length === 2 && n === 0) { r.o = end; continue; }
          if (compression === 0) { r.need(n, 'raw channel'); planes[ch.id] = Buffer.from(buffer.subarray(r.o, r.o + n)); r.o += n; }
          else if (compression === 1) {
            const counts = []; for (let y = 0; y < rec.height; y++) counts.push(r.u16('row length'));
            const rows = [];
            for (const c of counts) { r.need(c, 'RLE row'); rows.push(unpackBits(buffer.subarray(r.o, r.o + c), rec.width)); r.o += c; }
            planes[ch.id] = Buffer.concat(rows);
          } else throw new Error(`layer "${rec.name}": compression ${compression} (ZIP) is not supported; save with default layer compression`);
          if (r.o !== end) throw new Error(`layer "${rec.name}": channel ${ch.id} length mismatch`);
        }
        rec.rgba = null;
        if (rec.width * rec.height > 0) {
          if (!planes[0] || !planes[1] || !planes[2]) throw new Error(`layer "${rec.name}" has no RGB channels`);
          const px = new Uint8Array(rec.width * rec.height * 4);
          for (let i = 0; i < rec.width * rec.height; i++) { px[i * 4] = planes[0][i]; px[i * 4 + 1] = planes[1][i]; px[i * 4 + 2] = planes[2][i]; px[i * 4 + 3] = planes[-1] ? planes[-1][i] : 255; }
          rec.rgba = px;
        }
      }
      layers.push(...recs);
    }
  }
  // Photoshop appends global layer-mask info and extra tagged blocks after the layer info; they are skipped, not parsed.
  r.o = maskEnd;
  const compression = r.u16('composite compression');
  if (compression === 0) r.need(channels * width * height, 'composite image');
  else if (compression !== 1) throw new Error(`composite image compression ${compression} is not supported`);
  // group paths: file order is bottom to top; section 3 opens (when read backwards) a group, 1/2 closes it with its name
  const stack = [];
  const out = [];
  for (let i = layers.length - 1; i >= 0; i--) {
    const l = layers[i];
    if (l.section === 1 || l.section === 2) { l.path = [...stack]; stack.push(l.name); l.isGroup = true; out.push(l); }
    else if (l.section === 3) { stack.pop(); }
    else { l.path = [...stack]; l.isGroup = false; out.push(l); }
  }
  if (stack.length) throw new Error('unbalanced layer groups');
  return { width, height, depth, channels, mode, resources, guides, layers: out };
}

module.exports = { readPsd, unpackBits };
