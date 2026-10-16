// Tiny RGBA raster used to draw template guides (geometry only). Coordinates are in 1x units; `scale` multiplies them.
'use strict';
const { encodePng } = require('./png.js');

const COLOURS = {
  canvas: [0, 170, 255, 255],      // cyan: the canvas edge (art must fill exactly this size)
  margin: [200, 0, 200, 255],      // magenta, dashed: keep 1 px transparent inside
  hitbox: [230, 30, 30, 255],      // red: the tank's collision box (not drawn by the game)
  barrel: [255, 140, 0, 255],      // orange: the barrel's collision box
  centre: [0, 90, 255, 255],       // blue: the tank's centre (rotation pivot)
  muzzle: [22, 163, 74, 255],      // green: where shots start
  tread: [20, 120, 20, 255],       // dark green, dashed: where the treads sit
  part: [130, 130, 130, 255],      // grey: other canvases, for context
  turretCanvas: [140, 80, 200, 255],
  forward: [90, 90, 90, 150]       // translucent arrow: "up is forward"
};

class Raster {
  constructor(widthPx, heightPx, scale) {
    this.w = widthPx * scale; this.h = heightPx * scale; this.n = scale;
    this.data = new Uint8Array(this.w * this.h * 4);
    this.t = scale >= 2 ? Math.max(1, Math.round(scale / 2)) : 1;
  }
  px(x, y, c) {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const i = (y * this.w + x) * 4;
    this.data[i] = c[0]; this.data[i + 1] = c[1]; this.data[i + 2] = c[2]; this.data[i + 3] = c[3];
  }
  fill(x0, y0, x1, y1, c) { for (let y = Math.max(0, Math.round(y0)); y < Math.min(this.h, Math.round(y1)); y++) for (let x = Math.max(0, Math.round(x0)); x < Math.min(this.w, Math.round(x1)); x++) this.px(x, y, c); }
  /** Line along an axis in 1x units, centred on the coordinate, optional dash. */
  hline(y, x0, x1, c, dashed = false) {
    const n = this.n, t = this.t;
    for (let x = Math.round(x0 * n); x < Math.round(x1 * n); x++) {
      if (dashed && Math.floor(x / (4 * n)) % 2 === 1) continue;
      for (let k = 0; k < t; k++) this.px(x, Math.round(y * n - t / 2) + k, c);
    }
  }
  vline(x, y0, y1, c, dashed = false) {
    const n = this.n, t = this.t;
    for (let y = Math.round(y0 * n); y < Math.round(y1 * n); y++) {
      if (dashed && Math.floor(y / (4 * n)) % 2 === 1) continue;
      for (let k = 0; k < t; k++) this.px(Math.round(x * n - t / 2) + k, y, c);
    }
  }
  rect(x0, y0, x1, y1, c, dashed = false) { this.hline(y0, x0, x1, c, dashed); this.hline(y1, x0, x1, c, dashed); this.vline(x0, y0, y1, c, dashed); this.vline(x1, y0, y1, c, dashed); }
  cross(x, y, r, c) { this.hline(y, x - r, x + r + 1 / this.n, c); this.vline(x, y - r, y + r + 1 / this.n, c); }
  circle(cx, cy, r, c) { const steps = Math.max(24, Math.round(r * this.n * 8)); for (let i = 0; i < steps; i++) { const a = (i / steps) * Math.PI * 2; this.px(Math.round((cx + Math.cos(a) * r) * this.n), Math.round((cy + Math.sin(a) * r) * this.n), c); } }
  arrowUp(cx, top, c, size = 5) { for (let row = 0; row < size; row++) { const half = row; this.fill((cx - half) * this.n, (top + row) * this.n, (cx + half + 1) * this.n, (top + row + 1) * this.n, c); } this.fill((cx - 1) * this.n, (top + size) * this.n, (cx + 2) * this.n, (top + size + 4) * this.n, c); }
  png() { return encodePng(this.w, this.h, this.data); }
}


module.exports = { Raster, COLOURS };
