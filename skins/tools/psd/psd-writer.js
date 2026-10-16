// Minimal PSD (Photoshop) writer: 8-bit RGBA, raw channels, layer groups, colour labels, layer locks, guides.
// Follows Adobe's "Photoshop File Format Specification". No dependencies.
'use strict';

const u8 = n => Buffer.from([n & 255]);
const u16 = n => { const b = Buffer.alloc(2); b.writeUInt16BE(n & 0xffff); return b; };
const i16 = n => { const b = Buffer.alloc(2); b.writeInt16BE(n); return b; };
const u32 = n => { const b = Buffer.alloc(4); b.writeUInt32BE(n >>> 0); return b; };
const i32 = n => { const b = Buffer.alloc(4); b.writeInt32BE(n); return b; };
const pad = (buf, multiple) => (buf.length % multiple ? Buffer.concat([buf, Buffer.alloc(multiple - (buf.length % multiple))]) : buf);

function pascal(name, multiple) {
  const ascii = Buffer.from(String(name).replace(/[^\x20-\x7e]/g, '?').slice(0, 255), 'latin1');
  return pad(Buffer.concat([u8(ascii.length), ascii]), multiple);
}
/** Tagged block; the stored length includes the padding to a multiple of 4, as Photoshop writes it. */
function block(key, data) { const d = pad(data, 4); return Buffer.concat([Buffer.from('8BIM'), Buffer.from(key, 'latin1'), u32(d.length), d]); }
function unicodeName(name) {
  const text = String(name);
  const b = Buffer.alloc(text.length * 2);
  for (let i = 0; i < text.length; i++) b.writeUInt16BE(text.charCodeAt(i), i * 2);
  return Buffer.concat([u32(text.length), b]);
}

const COLOUR_LABEL = { none: 0, red: 1, orange: 2, yellow: 3, green: 4, blue: 5, violet: 6, gray: 7 };

/** Flatten a top-to-bottom tree into file order (bottom to top), with group begin/end markers. */
function records(nodes) {
  const out = [];
  for (const node of [...nodes].reverse()) {
    if (node.type === 'group') {
      out.push({ kind: 'divider' });
      out.push(...records(node.children));
      out.push({ kind: 'group', node });
    } else out.push({ kind: 'layer', node });
  }
  return out;
}

/** PackBits-encode one row. */
function packRow(row) {
  const out = [];
  let i = 0;
  while (i < row.length) {
    let run = 1;
    while (i + run < row.length && run < 128 && row[i + run] === row[i]) run++;
    if (run >= 3) { out.push(257 - run, row[i]); i += run; continue; }
    let end = i;
    while (end < row.length && end - i < 128 && !(end + 2 < row.length && row[end] === row[end + 1] && row[end] === row[end + 2])) end++;
    if (end === i) end = i + 1;
    out.push(end - i - 1, ...row.subarray(i, end));
    i = end;
  }
  return Buffer.from(out);
}
function encodePlane(plane, w, h, rle) {
  if (!rle || !plane.length) return Buffer.concat([u16(0), plane]);
  const rows = [];
  for (let y = 0; y < h; y++) rows.push(packRow(plane.subarray(y * w, (y + 1) * w)));
  return Buffer.concat([u16(1), ...rows.map(r => u16(r.length)), ...rows]);
}

function layerRecord(rec, rle) {
  const isLayer = rec.kind === 'layer';
  const node = rec.node || {};
  const top = isLayer ? node.top : 0, left = isLayer ? node.left : 0;
  const w = isLayer ? node.width : 0, h = isLayer ? node.height : 0;
  const ids = [-1, 0, 1, 2];
  const planes = ids.map(id => {
    if (!isLayer) return Buffer.alloc(0);
    const plane = Buffer.alloc(w * h);
    const offset = id === -1 ? 3 : id;
    for (let i = 0; i < w * h; i++) plane[i] = node.rgba[i * 4 + offset];
    return plane;
  });
  const encoded = planes.map(p => encodePlane(p, w, h, rle));
  const head = Buffer.concat([i32(top), i32(left), i32(top + h), i32(left + w), u16(4), ...ids.map((id, i) => Buffer.concat([i16(id), u32(encoded[i].length)]))]);
  let flags = 0;
  if (isLayer && node.visible === false) flags |= 2;
  const name = rec.kind === 'divider' ? '</Layer group>' : node.name;
  const blocks = [block('luni', unicodeName(name))];
  if (rec.kind === 'divider') blocks.push(block('lsct', u32(3)));
  if (rec.kind === 'group') blocks.push(block('lsct', u32(node.open === false ? 2 : 1)));
  if (rec.kind !== 'divider' && node.color && node.color !== 'none') blocks.push(block('lclr', Buffer.concat([u16(COLOUR_LABEL[node.color]), Buffer.alloc(6)])));
  if (isLayer && node.lock) blocks.push(block('lspf', u32(0x80000000)));
  const extra = Buffer.concat([u32(0), u32(0), pascal(name, 4), ...blocks]);
  const record = Buffer.concat([head, Buffer.from('8BIM'), Buffer.from(rec.kind === 'group' ? 'pass' : 'norm'), u8(255), u8(0), u8(flags), u8(0), u32(extra.length), extra]);
  const data = Buffer.concat(encoded);
  return { record, data };
}

/** Straight-alpha "over" composite of the visible layers onto a transparent canvas of the document size. */
function flatten(nodes, width, height) {
  const buf = new Uint8Array(width * height * 4);
  const paint = list => {
    for (const node of [...list].reverse()) {
      if (node.type === 'group') { paint(node.children); continue; }
      if (node.visible === false) continue;
      for (let y = 0; y < node.height; y++) for (let x = 0; x < node.width; x++) {
        const dx = node.left + x, dy = node.top + y;
        if (dx < 0 || dy < 0 || dx >= width || dy >= height) continue;
        const s = (y * node.width + x) * 4, d = (dy * width + dx) * 4;
        const sa = node.rgba[s + 3] / 255; if (!sa) continue;
        const da = buf[d + 3] / 255, oa = sa + da * (1 - sa);
        for (let k = 0; k < 3; k++) buf[d + k] = Math.round((node.rgba[s + k] * sa + buf[d + k] * da * (1 - sa)) / oa);
        buf[d + 3] = Math.round(oa * 255);
      }
    }
  };
  paint(nodes);
  return buf;
}

/**
 * @param {{width:number,height:number,layers:object[],guides?:{horizontal?:number[],vertical?:number[]},dpi?:number,rle?:boolean}} doc
 * layers: top-to-bottom tree of { type:'group', name, open?, color?, children } and
 *         { type:'layer', name, left, top, width, height, rgba:Uint8Array, visible?, lock?, color? }.
 */
function buildPsd(doc) {
  const { width, height } = doc;
  const header = Buffer.concat([Buffer.from('8BPS'), u16(1), Buffer.alloc(6), u16(4), u32(height), u32(width), u16(8), u16(3)]);
  const dpi = doc.dpi || 72;
  const resource = (id, data) => Buffer.concat([Buffer.from('8BIM'), u16(id), Buffer.from([0, 0]), u32(data.length), pad(data, 2)]);
  const resolution = resource(1005, Buffer.concat([u32(dpi << 16), u16(1), u16(1), u32(dpi << 16), u16(1), u16(1)]));
  const g = doc.guides || {};
  const list = [...(g.vertical || []).map(p => [p, 0]), ...(g.horizontal || []).map(p => [p, 1])];
  const guides = list.length ? resource(1032, Buffer.concat([u32(1), u32(576), u32(576), u32(list.length), ...list.map(([p, d]) => Buffer.concat([u32(Math.round(p * 32)), u8(d)]))])) : Buffer.alloc(0);
  const resources = Buffer.concat([resolution, guides]);

  const recs = records(doc.layers).map(r => layerRecord(r, doc.rle === true));
  const layerInfo = pad(Buffer.concat([i16(-recs.length), ...recs.map(r => r.record), ...recs.map(r => r.data)]), 2);
  const layerMask = Buffer.concat([u32(layerInfo.length), layerInfo, u32(0)]);

  const flat = flatten(doc.layers, width, height);
  const planes = [0, 1, 2, 3].map(c => { const p = Buffer.alloc(width * height); for (let i = 0; i < width * height; i++) p[i] = flat[i * 4 + c]; return p; });
  let image;
  if (doc.rleComposite) {   // PackBits composite (row byte counts for every channel first, then the rows), for very large documents
    const rows = [];
    for (const p of planes) for (let y = 0; y < height; y++) rows.push(packRow(p.subarray(y * width, (y + 1) * width)));
    image = Buffer.concat([u16(1), ...rows.map(r => u16(r.length)), ...rows]);
  } else image = Buffer.concat([u16(0), ...planes]);
  return Buffer.concat([header, u32(0), u32(resources.length), resources, u32(layerMask.length), layerMask, image]);
}

module.exports = { buildPsd };
