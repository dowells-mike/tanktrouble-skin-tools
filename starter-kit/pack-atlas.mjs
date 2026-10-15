// Packs pictures into a texture atlas (PNG + TexturePacker-style JSON). Used to make the example atlas the kit ships and the atlases the
// converter is tested against (trimmed or not, JSON array or hash, any scale). Development only: this file is not part of the kit.
//   import { packAtlas } from './pack-atlas.mjs'
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const require = createRequire(import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url));
const { encodePng } = require(path.join(here, 'src', 'artist-tools', 'lib', 'png.js'));
const { alphaBounds } = require(path.join(here, '..', 'extension', 'src', 'resample.js'));

/**
 * @param {{name:string, width:number, height:number, rgba:Uint8ClampedArray}[]} pictures
 * @param {{ trim?: boolean, format?: 'array'|'hash', padding?: number, width?: number, image?: string, meta?: boolean, order?: string[] }} options
 * @returns {{ png: Buffer, json: object, image: {width:number,height:number,data:Uint8ClampedArray} }}
 */
export function packAtlas(pictures, { trim = false, format = 'array', padding = 2, width = 512, image = 'atlas.png', meta = true } = {}) {
  const parts = pictures.map(p => {
    let rect = { x: 0, y: 0, w: p.width, h: p.height };
    if (trim) {
      const b = alphaBounds(p.rgba, p.width, p.height);
      if (b) rect = { x: b.x0, y: b.y0, w: b.x1 - b.x0 + 1, h: b.y1 - b.y0 + 1 };
    }
    return { ...p, rect };
  });
  // shelf packing, tallest first
  const order = [...parts].sort((a, b) => b.rect.h - a.rect.h || a.name.localeCompare(b.name, undefined, { numeric: true }));
  let x = padding, y = padding, row = 0, maxX = 0;
  for (const part of order) {
    if (x + part.rect.w + padding > width) { x = padding; y += row + padding; row = 0; }
    part.at = { x, y };
    x += part.rect.w + padding; row = Math.max(row, part.rect.h); maxX = Math.max(maxX, x);
  }
  const atlasWidth = Math.max(maxX, 1), atlasHeight = y + row + padding;
  const data = new Uint8ClampedArray(atlasWidth * atlasHeight * 4);
  const entries = parts.map(part => {
    for (let r = 0; r < part.rect.h; r++) {
      const from = ((part.rect.y + r) * part.width + part.rect.x) * 4;
      data.set(part.rgba.subarray(from, from + part.rect.w * 4), ((part.at.y + r) * atlasWidth + part.at.x) * 4);
    }
    return {
      filename: part.name,
      frame: { x: part.at.x, y: part.at.y, w: part.rect.w, h: part.rect.h },
      rotated: false,
      trimmed: trim && (part.rect.w !== part.width || part.rect.h !== part.height),
      spriteSourceSize: { x: part.rect.x, y: part.rect.y, w: part.rect.w, h: part.rect.h },
      sourceSize: { w: part.width, h: part.height }
    };
  });
  const json = { frames: format === 'hash' ? Object.fromEntries(entries.map(({ filename, ...rest }) => [filename, rest])) : entries };
  if (meta) json.meta = { app: 'pack-atlas (TankTrouble Skin Creator Starter Kit)', image, format: 'RGBA8888', size: { w: atlasWidth, h: atlasHeight }, scale: '1' };
  return { png: encodePng(atlasWidth, atlasHeight, data), json, image: { width: atlasWidth, height: atlasHeight, data } };
}
