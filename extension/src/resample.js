/* Pixel helpers. Pure functions over RGBA byte arrays (straight, non-premultiplied alpha, like canvas ImageData). */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else (root.TankSkinTools = root.TankSkinTools || {}).resample = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  /** Exact area-average downsample by an integer factor, done in PREMULTIPLIED space so a transparent pixel never
   *  drags its (meaningless) colour into the edge: no dark or light halo. Returns straight-alpha RGBA. */
  function downsample(src, width, height, factor) {
    if (!Number.isInteger(factor) || factor < 1) throw new Error('factor must be a whole number');
    if (width % factor || height % factor) throw new Error('size is not a multiple of the factor');
    const ow = width / factor, oh = height / factor;
    const out = new Uint8ClampedArray(ow * oh * 4);
    const area = factor * factor;
    for (let y = 0; y < oh; y++) {
      for (let x = 0; x < ow; x++) {
        let a = 0, r = 0, g = 0, b = 0;
        for (let dy = 0; dy < factor; dy++) {
          let i = (((y * factor + dy) * width) + x * factor) * 4;
          for (let dx = 0; dx < factor; dx++, i += 4) {
            const alpha = src[i + 3];
            a += alpha; r += src[i] * alpha; g += src[i + 1] * alpha; b += src[i + 2] * alpha;
          }
        }
        const o = (y * ow + x) * 4;
        if (a > 0) { out[o] = Math.round(r / a); out[o + 1] = Math.round(g / a); out[o + 2] = Math.round(b / a); out[o + 3] = Math.round(a / area); }
      }
    }
    return { data: out, width: ow, height: oh };
  }

  /** Multiply the colour channels by a 0xRRGGBB colour (what the game's tint does). Alpha is untouched. In place. */
  function multiplyColour(data, rgb) {
    const r = (rgb >> 16) & 255, g = (rgb >> 8) & 255, b = rgb & 255;
    for (let i = 0; i < data.length; i += 4) {
      data[i] = Math.round(data[i] * r / 255);
      data[i + 1] = Math.round(data[i + 1] * g / 255);
      data[i + 2] = Math.round(data[i + 2] * b / 255);
    }
    return data;
  }

  /** Fraction of pixels with any visibility. */
  function visibleFraction(data) {
    let visible = 0;
    for (let i = 3; i < data.length; i += 4) if (data[i] > 0) visible++;
    return visible / (data.length / 4);
  }

  /** Bounding box of the pixels with alpha above the threshold, or null for an empty image. */
  function alphaBounds(data, width, height, threshold = 0) {
    let x0 = width, y0 = height, x1 = -1, y1 = -1;
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * 4 + 3] > threshold) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    }
    return x1 < 0 ? null : { x0, y0, x1, y1 };
  }

  return { downsample, multiplyColour, visibleFraction, alphaBounds };
});
