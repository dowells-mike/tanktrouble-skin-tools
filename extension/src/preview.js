/* Optional preview: draws a skin's parts on a plain 2D canvas, assembled exactly as the game assembles a tank
 * (treads at x = +-26, base at the centre, turret at y = -16), rotated about the tank centre. It does not use the game. */
(function (root) {
  'use strict';
  const ns = root.TankSkinTools = root.TankSkinTools || {};
  const { GEOMETRY } = ns.frames;
  const { multiplyColour } = ns.resample;

  const tintCache = new WeakMap();
  /** A copy of `source` multiplied by `rgb` (what the game's tint does), cached per colour. */
  function tinted(source, rgb) {
    let byColour = tintCache.get(source);
    if (!byColour) tintCache.set(source, byColour = new Map());
    if (byColour.has(rgb)) return byColour.get(rgb);
    const canvas = document.createElement('canvas');
    canvas.width = source.width; canvas.height = source.height;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    context.drawImage(source, 0, 0);
    const image = context.getImageData(0, 0, canvas.width, canvas.height);
    multiplyColour(image.data, rgb);
    context.putImageData(image, 0, 0);
    byColour.set(rgb, canvas);
    return canvas;
  }

  /**
   * @param {HTMLCanvasElement} canvas
   * @param {{frames: Map<string, HTMLCanvasElement>, tint: object}} skin  decoded skin
   * @param {{angle?:number, turretFrame?:string, zoom?:number, colours?:{base:number,tread:number,turret:number}, guides?:boolean, background?:string, shade?:number}} options
   * @returns {{missing: string|null}} the turret frame that was requested but is not in the skin, if any
   */
  function draw(canvas, skin, options = {}) {
    const { angle = 0, turretFrame = 'turret0', zoom = 2, colours = { base: 0x4a9a4a, tread: 0x3a3a3a, turret: 0xcc4444 }, guides = false, background = '#cfd6dc', shade = null } = options;
    const context = canvas.getContext('2d');
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = background;
    context.fillRect(0, 0, canvas.width, canvas.height);
    if (!skin) return { missing: null };
    const part = (name, role) => {
      const frame = skin.frames.get(name);
      if (!frame) return null;
      return skin.tint[role] === 'player' ? tinted(frame, colours[role]) : frame;
    };
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = 'high';
    context.translate(canvas.width / 2, canvas.height / 2);
    context.scale(zoom, zoom);
    context.rotate(angle);
    const drawCentred = (image, x, y) => { if (image) context.drawImage(image, x - image.width / 2, y - image.height / 2); };
    const tread = part('tread', 'tread');
    drawCentred(tread, -GEOMETRY.treadX, 0);
    drawCentred(tread, GEOMETRY.treadX, 0);
    if (shade != null) { const overlay = skin.frames.get(`treadShade${shade}`); drawCentred(overlay, -GEOMETRY.treadX, 0); drawCentred(overlay, GEOMETRY.treadX, 0); }
    drawCentred(part('base', 'base'), 0, 0);
    let missing = null;
    let turret = part(turretFrame, 'turret');
    if (!turret) { missing = turretFrame; turret = part('turret0', 'turret'); }
    drawCentred(turret, 0, GEOMETRY.turretY);
    if (guides) {
      context.lineWidth = 1 / zoom;
      context.strokeStyle = 'rgba(220,30,30,.9)';
      context.strokeRect(-GEOMETRY.hitbox.w / 2, -GEOMETRY.hitbox.h / 2, GEOMETRY.hitbox.w, GEOMETRY.hitbox.h);
      context.strokeStyle = 'rgba(255,140,0,.9)';
      context.strokeRect(-GEOMETRY.barrelHitbox.w / 2, GEOMETRY.barrelHitbox.centreY - GEOMETRY.barrelHitbox.h / 2, GEOMETRY.barrelHitbox.w, GEOMETRY.barrelHitbox.h);
      context.fillStyle = '#16a34a';
      context.beginPath(); context.arc(0, GEOMETRY.muzzleY, 2 / zoom * 1.5, 0, Math.PI * 2); context.fill();
      context.strokeStyle = 'rgba(0,120,200,.9)';
      context.beginPath(); context.moveTo(-6, 0); context.lineTo(6, 0); context.moveTo(0, -6); context.lineTo(0, 6); context.stroke();
    }
    return { missing };
  }

  ns.preview = { draw };
})(typeof globalThis !== 'undefined' ? globalThis : this);
