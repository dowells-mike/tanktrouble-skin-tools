// An anti-aliased drawing surface for test images (stand-in shapes, not skin art).
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { encodePng } = require('./png.cjs');

export class Canvas {
  constructor(w, h, s) { this.w = w * s; this.h = h * s; this.s = s; this.data = new Uint8ClampedArray(this.w * this.h * 4); }
  /** Anti-aliased coverage of a shape given by `inside(x, y)` in 1x units (3x3 samples per pixel). */
  shape(inside, [r, g, b, a = 255]) {
    const s = this.s;
    for (let py = 0; py < this.h; py++) for (let px = 0; px < this.w; px++) {
      let hit = 0;
      for (let sy = 0; sy < 3; sy++) for (let sx = 0; sx < 3; sx++) if (inside((px + (sx + 0.5) / 3) / s, (py + (sy + 0.5) / 3) / s)) hit++;
      if (!hit) continue;
      const cover = (hit / 9) * (a / 255);
      const i = (py * this.w + px) * 4;
      const da = this.data[i + 3] / 255;
      const oa = cover + da * (1 - cover);
      for (let k = 0; k < 3; k++) this.data[i + k] = Math.round(([r, g, b][k] * cover + this.data[i + k] * da * (1 - cover)) / oa);
      this.data[i + 3] = Math.round(oa * 255);
    }
  }
  roundRect(cx, cy, w, h, rad, colour) {
    this.shape((x, y) => {
      const dx = Math.abs(x - cx) - (w / 2 - rad), dy = Math.abs(y - cy) - (h / 2 - rad);
      return Math.hypot(Math.max(dx, 0), Math.max(dy, 0)) + Math.min(Math.max(dx, dy), 0) <= rad;
    }, colour);
  }
  circle(cx, cy, r, colour) { this.shape((x, y) => Math.hypot(x - cx, y - cy) <= r, colour); }
  png() { return encodePng(this.w, this.h, this.data); }
}
