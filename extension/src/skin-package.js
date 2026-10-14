/* Validates a set of chosen files as one skin, before anything is decoded or stored. Pure.
 * Input: skin.json text (optional) and the PNG files' bytes. Output: a report listing every problem by file name. */
(function (root, factory) {
  const frames = typeof module === 'object' && module.exports ? require('./frames.js') : root.TankSkinTools.frames;
  const pngInfo = typeof module === 'object' && module.exports ? require('./png-info.js') : root.TankSkinTools.pngInfo;
  const api = factory(frames, pngInfo);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else (root.TankSkinTools = root.TankSkinTools || {}).skinPackage = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (frames, pngInfo) {
  'use strict';
  const { SPECS, ALL_SPECS, REQUIRED, RECOMMENDED, SCALES } = frames;
  const MAX_FILE_BYTES = 4 * 1024 * 1024;
  const MAX_FILES = 80;
  const ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,39}$/;
  const TINT_POLICIES = ['none', 'player'];
  const TINT_ROLES = ['base', 'tread', 'turret'];

  const slug = text => String(text || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);

  /** Parse and validate skin.json. Never throws; returns { meta, errors }. */
  function parseSkinJson(text) {
    const errors = [];
    const meta = { id: null, name: null, author: '', version: '', tint: { base: 'none', tread: 'none', turret: 'none' }, pixelScale: null, laser: null };
    if (text == null) return { meta, errors, present: false };
    let data;
    try { data = JSON.parse(text); } catch (error) { return { meta, errors: [`skin.json is not valid JSON (${error.message})`], present: true }; }
    if (!data || typeof data !== 'object' || Array.isArray(data)) return { meta, errors: ['skin.json must be an object'], present: true };
    if (data.schema !== 1) errors.push('skin.json: "schema" must be 1');
    if (typeof data.id !== 'string' || !ID_PATTERN.test(data.id)) errors.push('skin.json: "id" must be 1-40 characters: lower-case letters, digits and hyphens, not starting with a hyphen');
    else meta.id = data.id;
    if (data.name != null) { if (typeof data.name !== 'string' || !data.name.trim() || data.name.length > 60) errors.push('skin.json: "name" must be text of at most 60 characters'); else meta.name = data.name.trim(); }
    for (const key of ['author', 'version']) {
      if (data[key] == null) continue;
      if (typeof data[key] !== 'string' || data[key].length > 60) errors.push(`skin.json: "${key}" must be text of at most 60 characters`); else meta[key] = data[key];
    }
    if (data.tint != null) {
      if (typeof data.tint !== 'object' || Array.isArray(data.tint)) errors.push('skin.json: "tint" must be an object like {"base":"none","tread":"none","turret":"none"}');
      else for (const role of Object.keys(data.tint)) {
        if (!TINT_ROLES.includes(role)) errors.push(`skin.json: unknown tint part "${role}" (use base, tread, turret)`);
        else if (!TINT_POLICIES.includes(data.tint[role])) errors.push(`skin.json: tint "${role}" must be "none" or "player"`);
        else meta.tint[role] = data.tint[role];
      }
    }
    if (data.pixelScale != null) { if (!SCALES.includes(data.pixelScale)) errors.push('skin.json: "pixelScale" must be 1, 2 or 4'); else meta.pixelScale = data.pixelScale; }
    if (data.laser != null) {
      const l = data.laser;
      if (typeof l !== 'object' || Array.isArray(l)) errors.push('skin.json: "laser" must be an object like {"colour":"#ff2f40","glow":true}');
      else {
        const colour = typeof l.colour === 'string' && /^#[0-9a-fA-F]{6}$/.test(l.colour) ? parseInt(l.colour.slice(1), 16) : null;
        if (colour == null) errors.push('skin.json: laser "colour" must be a hex colour like "#ff2f40"');
        if (l.glow != null && typeof l.glow !== 'boolean') errors.push('skin.json: laser "glow" must be true or false');
        if (colour != null) meta.laser = { colour: l.colour.toLowerCase(), value: colour, glow: l.glow !== false };
      }
    }
    return { meta, errors, present: true };
  }

  /**
   * @param {{json: string|null, pngs: Array<{name: string, bytes: Uint8Array}>, fallbackId?: string, fallbackName?: string, ignored?: string[]}} input
   * @returns {{ok:boolean, errors:string[], warnings:string[], meta:object|null, frames:string[], scale:number|null}}
   */
  function analysePackage(input) {
    const errors = [], warnings = [];
    const parsed = parseSkinJson(input.json == null ? null : input.json);
    errors.push(...parsed.errors);
    const meta = parsed.meta;
    if (!meta.id) {
      if (!parsed.present && input.fallbackId) { meta.id = input.fallbackId; warnings.push(`No skin.json: using "${meta.id}" as the id and tint "none" (artwork shown exactly as painted).`); }
      else if (!parsed.present) errors.push('No skin.json and no folder name to use as an id. Add a skin.json (see the skin-making guide) or choose the whole folder.');
    }
    if (!meta.name) meta.name = input.fallbackName || meta.id;

    const pngs = input.pngs || [];
    if (pngs.length > MAX_FILES) errors.push(`Too many files (${pngs.length}); a skin has at most ${Object.keys(SPECS).length} PNGs.`);
    const seen = new Set();
    const scales = new Map();
    const accepted = [];
    for (const file of pngs) {
      const match = /^(.+)\.png$/i.exec(file.name);
      const frame = match && match[1];
      if (!frame || !ALL_SPECS[frame]) { warnings.push(`${file.name}: not a frame name this version uses; ignored.`); continue; }
      if (file.name !== `${frame}.png`) { errors.push(`${file.name}: the file name must be exactly "${frame}.png" (lower-case extension).`); continue; }
      if (seen.has(frame)) { errors.push(`${file.name}: chosen more than once.`); continue; }
      seen.add(frame);
      const size = file.size != null ? file.size : file.bytes.length;
      if (size > MAX_FILE_BYTES) { errors.push(`${file.name}: ${(size / 1048576).toFixed(1)} MB is over the ${MAX_FILE_BYTES / 1048576} MB limit.`); continue; }
      let info;
      try { info = pngInfo.readPngInfo(file.bytes); } catch (error) { errors.push(`${file.name}: ${error.message}.`); continue; }
      if (info.interlace) { errors.push(`${file.name}: interlaced PNGs are not supported; export without interlacing.`); continue; }
      const spec = ALL_SPECS[frame];
      const scale = SCALES.find(n => info.width === spec.w * n && info.height === spec.h * n);
      if (!scale) {
        errors.push(`${file.name}: is ${info.width}x${info.height}; ${frame} must be ${SCALES.map(n => `${spec.w * n}x${spec.h * n}`).join(', ')} (1x, 2x or 4x of ${spec.w}x${spec.h}).`);
        continue;
      }
      if (!info.hasAlpha) { errors.push(`${file.name}: has no transparency channel. Export PNG-24 with transparency (RGBA); an opaque PNG would draw a solid rectangle.`); continue; }
      scales.set(frame, scale);
      accepted.push(frame);
    }

    const present = new Set(accepted);
    for (const need of REQUIRED) if (!seen.has(need)) errors.push(`${need}.png is required.`);
    for (const want of RECOMMENDED) if (!seen.has(want)) warnings.push(`${want}.png is missing: the default gun's recoil frames will show the game's own turret.`);
    const shades = Array.from({ length: 12 }, (_, i) => `treadShade${i}`);
    const shadeCount = shades.filter(name => seen.has(name)).length;
    if (shadeCount && shadeCount < 12) errors.push(`Tread shade frames must be all 12 (treadShade0.png ... treadShade11.png) or none; ${shadeCount} found.`);
    const distinct = [...new Set(scales.values())];
    if (distinct.length > 1) errors.push(`Mixed resolutions: ${distinct.map(n => `${n}x`).join(' and ')}. Export every file of a skin at the same scale.`);
    const scale = distinct.length === 1 ? distinct[0] : null;
    if (meta.pixelScale && scale && meta.pixelScale !== scale) errors.push(`skin.json says pixelScale ${meta.pixelScale} but the files are ${scale}x.`);
    const turretFrames = Object.keys(SPECS).filter(n => n.startsWith('turret') && present.has(n)).length;
    if (meta.tint.turret === 'none' && turretFrames > 0 && turretFrames < 17) {
      warnings.push(`Note: only ${turretFrames} of 17 turret frames are supplied. Other weapons show the game's own turret, coloured with the player's colour.`);
    }
    return {
      ok: errors.length === 0, errors, warnings,
      meta: errors.length ? null : { ...meta, scale },
      frames: accepted.sort(), scale
    };
  }

  return { analysePackage, parseSkinJson, slug, ID_PATTERN, MAX_FILE_BYTES };
});
