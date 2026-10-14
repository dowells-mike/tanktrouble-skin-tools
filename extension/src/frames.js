/* Frame geometry for the tank, in the game's own drawing units ("world px", scale 1.0).
 * Sizes measured on the live game (2026-10-12): no frame is trimmed or rotated.
 * Pure data: no game code and no game art. Shared by the engine, the importer and the preview. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else (root.TankSkinTools = root.TankSkinTools || {}).frames = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  /** name -> { w, h, role }. `role` is the tint role (null = the game never tints this frame). */
  const SPECS = {};
  SPECS.base = { w: 68, h: 84, role: 'base' };
  SPECS.tread = { w: 12, h: 80, role: 'tread' };
  for (let i = 0; i < 12; i++) SPECS[`treadShade${i}`] = { w: 12, h: 80, role: null };
  for (let i = 0; i < 17; i++) SPECS[`turret${i}`] = { w: 68, h: 82, role: 'turret' };

  /** Weapon-visual frames of the same atlas (sizes measured on the live game). `pool` = the match state's group whose sprites show it;
   *  `tinted` = the game multiplies it by the OWNER's turret colour (so a painted skin forces white). */
  const EFFECTS = {
    bullet: { w: 20, h: 20, pool: 'projectile', tinted: false },
    doubleBarrel: { w: 20, h: 20, pool: 'projectile', tinted: false },
    shotgun: { w: 12, h: 12, pool: 'projectile', tinted: false },
    gatlingGun: { w: 12, h: 12, pool: 'projectile', tinted: false },
    homingMissile: { w: 32, h: 44, pool: 'missile', tinted: true },
    mine: { w: 56, h: 56, pool: 'mine', tinted: true },
    mineGlow: { w: 48, h: 48, pool: 'mine', tinted: false },
    mineShrapnel: { w: 20, h: 20, pool: 'shrapnel', tinted: false }
  };
  // Scene visuals (sizes measured on the live game). Particles (smoke, dust, explosion puffs, spark bolts) have no owner; fragments belong to the
  // destroyed tank, shields to their tank; crates (standard theme, one frame per content) have no owner.
  for (let i = 0; i < 3; i++) {
    EFFECTS['explosion' + i] = { w: 100, h: 100, pool: 'particle', tinted: false };
    EFFECTS['smoke' + i] = { w: 60, h: 60, pool: 'particle', tinted: false };
    EFFECTS['dust' + i] = { w: 80, h: 80, pool: 'particle', tinted: false };
    EFFECTS['puff' + i] = { w: 20, h: 20, pool: 'particle', tinted: false };
    EFFECTS['shieldSparkBolt' + i] = { w: 68, h: 66, pool: 'particle', tinted: false };
  }
  EFFECTS.shieldBolt0 = { w: 88, h: 90, pool: 'shield', tinted: false };
  EFFECTS.shieldBolt1 = { w: 80, h: 90, pool: 'shield', tinted: false };
  EFFECTS.shieldBolt2 = { w: 68, h: 90, pool: 'shield', tinted: false };
  EFFECTS.shield = { w: 180, h: 180, pool: 'shield', tinted: false };
  EFFECTS.shieldSpark = { w: 18, h: 18, pool: 'particle', tinted: false };
  for (let i = 0; i < 10; i++) EFFECTS['fragment' + i] = { w: 40, h: 40, pool: 'fragment', tinted: true };
  for (let i = 0; i < 7; i++) EFFECTS['crate0-' + i] = { w: 64, h: 64, pool: 'crate', tinted: false };
  const EFFECT_NAMES = Object.keys(EFFECTS);
  /** Frames handled by walking the scene (the game builds those sprites inside its own groups and emitters). */
  const SCENE_NAMES = EFFECT_NAMES.filter(n => ['particle', 'fragment', 'shield', 'crate'].includes(EFFECTS[n].pool));

  const ALL_SPECS = { ...SPECS, ...Object.fromEntries(EFFECT_NAMES.map(n => [n, { w: EFFECTS[n].w, h: EFFECTS[n].h, role: EFFECTS[n].tinted ? 'turret' : null, effect: true }])) };

  const NAMES = Object.keys(SPECS);
  /** A skin must ship these; everything else falls back to the game's own frame. */
  const REQUIRED = ['base', 'tread', 'turret0'];
  const RECOMMENDED = ['turret1', 'turret2'];
  const SCALES = [1, 2, 4];

  /** Geometry used by the preview and by skin templates. Tank space: origin = tank centre, +y down, up = forward. */
  const GEOMETRY = Object.freeze({
    hitbox: { w: 60, h: 80 },
    barrelHitbox: { w: 14, h: 28, centreY: -40 },
    muzzleY: -50,
    treadX: 26,
    turretY: -16,
    /** Pixel (in the canvas of each part) that coincides with the tank centre. */
    centreInCanvas: { base: [34, 42], turret: [34, 57] }
  });

  return { SPECS, EFFECTS, EFFECT_NAMES, SCENE_NAMES, ALL_SPECS, NAMES, REQUIRED, RECOMMENDED, SCALES, GEOMETRY };
});
