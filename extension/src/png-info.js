/* Reads just enough of a PNG header to validate a file before decoding it. Pure; works in Node and the browser. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else (root.TankSkinTools = root.TankSkinTools || {}).pngInfo = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

  /** @returns {{width:number,height:number,bitDepth:number,colorType:number,interlace:number,hasAlpha:boolean}} */
  function readPngInfo(bytes) {
    if (!bytes || bytes.length < 33) throw new Error('not a PNG (file is too small)');
    for (let i = 0; i < 8; i++) if (bytes[i] !== SIGNATURE[i]) throw new Error('not a PNG (bad signature)');
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    if (view.getUint32(8) !== 13 || String.fromCharCode(bytes[12], bytes[13], bytes[14], bytes[15]) !== 'IHDR') throw new Error('not a PNG (missing header)');
    const info = {
      width: view.getUint32(16), height: view.getUint32(20), bitDepth: bytes[24], colorType: bytes[25], interlace: bytes[28], hasAlpha: false
    };
    if (!info.width || !info.height || info.width > 16384 || info.height > 16384) throw new Error('PNG has an impossible size');
    info.hasAlpha = info.colorType === 4 || info.colorType === 6;
    // Grey, RGB and palette images can still carry transparency in a tRNS chunk.
    let offset = 8;
    for (let guard = 0; guard < 64 && offset + 8 <= bytes.length; guard++) {
      const length = view.getUint32(offset);
      const type = String.fromCharCode(bytes[offset + 4], bytes[offset + 5], bytes[offset + 6], bytes[offset + 7]);
      if (type === 'tRNS') { info.hasAlpha = true; break; }
      if (type === 'IDAT' || type === 'IEND') break;
      offset += 12 + length;
    }
    return info;
  }

  return { readPngInfo };
});
