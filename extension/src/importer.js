/* Turns chosen files into an installed skin: validate (skin-package.js), decode, downsample 2x/4x art to the native
 * frame sizes, and hand back both the record to store and the decoded frames for the engine. Browser only. */
(function (root) {
  'use strict';
  const ns = root.TankSkinTools = root.TankSkinTools || {};
  const { ALL_SPECS: SPECS } = ns.frames;
  const { downsample, visibleFraction } = ns.resample;
  const { analysePackage, slug } = ns.skinPackage;

  const baseName = file => String(file.name).split(/[\\/]/).pop();

  /** @param {File[]|FileList} files */
  async function readFiles(files) {
    const list = Array.from(files);
    let json = null;
    const pngs = [];
    const blobs = new Map();
    let folder = '';
    for (const file of list) {
      const name = baseName(file);
      if (!folder && file.webkitRelativePath && file.webkitRelativePath.includes('/')) folder = file.webkitRelativePath.split('/')[0];
      if (name.toLowerCase() === 'skin.json') { if (file.size > 64 * 1024) throw new Error('skin.json is too large'); json = await file.text(); continue; }
      if (!/\.png$/i.test(name)) continue;
      if (file.size > ns.skinPackage.MAX_FILE_BYTES + 1) { pngs.push({ name, bytes: new Uint8Array(0), size: file.size }); continue; }
      pngs.push({ name, bytes: new Uint8Array(await file.arrayBuffer()) });
      blobs.set(name, new Blob([file], { type: 'image/png' }));
    }
    return { json, pngs, blobs, folder };
  }

  /** Decode one stored PNG to a canvas at the native frame size. */
  async function decodeFrame(blob, frameName, scale) {
    const spec = SPECS[frameName];
    const bitmap = await createImageBitmap(blob, { premultiplyAlpha: 'none' });
    try {
      if (bitmap.width !== spec.w * scale || bitmap.height !== spec.h * scale) throw new Error(`${frameName}.png is ${bitmap.width}x${bitmap.height}, expected ${spec.w * scale}x${spec.h * scale}`);
      const source = document.createElement('canvas');
      source.width = bitmap.width; source.height = bitmap.height;
      const sourceContext = source.getContext('2d', { willReadFrequently: true });
      sourceContext.drawImage(bitmap, 0, 0);
      const out = document.createElement('canvas');
      out.width = spec.w; out.height = spec.h;
      const outContext = out.getContext('2d');
      if (scale === 1) { outContext.drawImage(source, 0, 0); return out; }
      const image = sourceContext.getImageData(0, 0, source.width, source.height);
      const reduced = downsample(image.data, image.width, image.height, scale);
      outContext.putImageData(new ImageData(reduced.data, reduced.width, reduced.height), 0, 0);
      return out;
    } finally {
      if (bitmap.close) bitmap.close();
    }
  }

  /** Stored record -> what the engine wants. */
  async function decodeRecord(record) {
    const frames = new Map();
    for (const [name, blob] of Object.entries(record.files)) {
      if (!SPECS[name]) continue;
      frames.set(name, await decodeFrame(blob, name, record.scale || 1));
    }
    return { id: record.id, rev: record.installedAt || 0, tint: record.tint, laser: record.laser || null, frames };
  }

  /**
   * @returns {Promise<{report: object, record?: object, decoded?: object}>}
   * Nothing is stored here; the caller stores `record` when `report.ok`.
   */
  async function importFiles(files) {
    let read;
    try { read = await readFiles(files); } catch (error) { return { report: { ok: false, errors: [error.message], warnings: [], meta: null, frames: [] } }; }
    const fallbackId = slug(read.folder) || null;
    const report = analysePackage({ json: read.json, pngs: read.pngs, fallbackId, fallbackName: read.folder || null });
    if (!report.ok) return { report };
    const record = {
      id: report.meta.id, name: report.meta.name, author: report.meta.author, version: report.meta.version,
      tint: report.meta.tint, laser: report.meta.laser, scale: report.scale, installedAt: Date.now(),
      files: Object.fromEntries(report.frames.map(name => [name, read.blobs.get(`${name}.png`)]))
    };
    try {
      const decoded = await decodeRecord(record);
      for (const [name, canvas] of decoded.frames) {
        const data = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
        if (visibleFraction(data) === 0) report.errors.push(`${name}.png is completely transparent.`);
      }
      if (report.errors.length) { report.ok = false; report.meta = null; return { report }; }
      return { report, record, decoded };
    } catch (error) {
      report.ok = false; report.meta = null; report.errors.push(`Could not decode the images: ${error.message}`);
      return { report };
    }
  }

  ns.importer = { importFiles, decodeRecord, readFiles };
})(typeof globalThis !== 'undefined' ? globalThis : this);
