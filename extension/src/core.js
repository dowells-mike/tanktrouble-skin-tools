/* Skin Tools engine. Runs in the page's main world, next to the game's Phaser objects.
 *
 *  - It only changes how a tank SPRITE looks (its `tint` and its texture). It never reads or writes the game model,
 *    the physics, the input or the network, and the extension contains no network code at all.
 *  - Recolour: an accessor on `tint` records what the game writes (asynchronously, after its player lookup) and
 *    renders `override ?? what the game wrote`. Clearing the override restores the game's colour instantly.
 *  - Textures: `sprite.loadTexture(skinKey, frameName, false)` onto a private atlas whose frames keep the ORIGINAL frame
 *    order, because the game's turret animations hold frame indices, not names. Frames a skin does not supply are
 *    copied (in memory only) from the game's own atlas, so a partial skin never shows a hole.
 *  - The game recycles 8 tank sprites for all players and rounds, so a skin is applied on every `spawn` and removed
 *    again when the next occupant has none.
 *  - Anything unexpected switches skins off ("fail open to the original look").
 * Needs frames.js and resample.js. The game's UITankSprite class is reached through a live instance (hook.js). */
(function (root) {
  'use strict';
  const ns = root.TankSkinTools = root.TankSkinTools || {};
  if (ns.core) return;
  const { SPECS, NAMES, EFFECTS, SCENE_NAMES } = ns.frames;
  const SCENE = new Set(SCENE_NAMES);
  const { multiplyColour } = ns.resample;

  const ORIGINAL = 'game';
  const WHITE = 0xffffff;
  const PAD = 4;
  const SHEET_WIDTH = 1024;
  const MAX_FAILURES = 3;
  const PART_NAMES = ['base', 'leftTread', 'leftTreadShade', 'rightTread', 'rightTreadShade', 'turret'];
  const PART_ROLE = { base: 'base', leftTread: 'tread', rightTread: 'tread', turret: 'turret', leftTreadShade: null, rightTreadShade: null };
  const SHEET_PREFIX = 'ttskin:';

  const S = {
    enabled: true,
    suspended: false,
    error: null,
    failures: 0,
    skins: new Map(),
    defaults: { own: null, others: null },
    players: new Map(),
    names: new Map(),
    attached: new WeakSet(),
    live: [],              // [{ state: WeakRef, game: WeakRef }]
    patched: new WeakSet(), // sprite prototypes already wrapped
    liveSet: new WeakSet()
  };
  /** Match-state pools whose sprites show weapon visuals, and the kind of sprite each holds. */
  const POOL_PROPS = { projectile: 'projectileGroup', missile: 'missileGroup', mine: 'mineGroup', shrapnel: 'shrapnelGroup', laser: 'laserGroup', aimer: 'aimerGroup' };

  const num = value => { const n = Number(value); return Number.isFinite(n) ? n : WHITE; };
  const hex6 = n => (n & 0xffffff).toString(16).padStart(6, '0');
  const partOf = (sprite, name) => (name === 'base' ? sprite : sprite[name]);

  function fail(where, error) {
    S.failures++;
    S.error = `${where}: ${error && error.message ? error.message : error}`;
    try { console.warn('[skin-tools]', S.error); } catch { /* ignore */ }
    if (S.failures >= MAX_FAILURES && !S.suspended) {
      S.suspended = true;
      S.error += ' (skins switched off; the original look was restored)';
      try { restoreAll(); } catch { /* nothing more can be done */ }
    }
  }
  const guard = (where, fn) => { try { return fn(); } catch (error) { fail(where, error); return undefined; } };

  /* ---------------------------------------------------------------- tint */
  function hookTint(object, role, sprite) {
    if (object.__ttTint) return object.__ttTint;
    const meta = object.__ttTint = { game: object.tint, override: null, effective: object.tint, role, bakedWith: null };
    Object.defineProperty(object, 'tint', {
      configurable: true,
      enumerable: true,
      get: () => meta.effective,
      set: value => {
        meta.game = value;
        meta.effective = meta.override == null ? value : meta.override;
        // Fallback turret frames are baked with the player's colour (see sheetFor): rebuild when the game's colour arrives or changes.
        if (role === 'turret' && meta.bakedWith != null && num(value) !== meta.bakedWith) queueMicrotask(() => guard('retint', () => applyTank(sprite)));
      }
    });
    return meta;
  }
  function setOverride(meta, value) {
    meta.override = value;
    meta.effective = value == null ? meta.game : value;
  }

  /* ---------------------------------------------------------------- sheets */
  function originalFrameCanvas(game, frame) {
    if (frame.rotated) throw new Error(`frame ${frame.name} is rotated in the game's atlas`);
    const image = game.cache.getImage(ORIGINAL);
    const canvas = document.createElement('canvas');
    canvas.width = frame.trimmed ? frame.sourceSizeW : frame.width;
    canvas.height = frame.trimmed ? frame.sourceSizeH : frame.height;
    canvas.getContext('2d').drawImage(image, frame.x, frame.y, frame.width, frame.height, frame.trimmed ? frame.spriteSourceSizeX : 0, frame.trimmed ? frame.spriteSourceSizeY : 0, frame.width, frame.height);
    return canvas;
  }
  function bakeCanvas(canvas, colour) {
    const context = canvas.getContext('2d');
    const image = context.getImageData(0, 0, canvas.width, canvas.height);
    multiplyColour(image.data, colour);
    context.putImageData(image, 0, 0);
    return canvas;
  }

  /** The private atlas for one skin (and one baked turret colour). Frame names AND frame order match the game's atlas. */
  function sheetFor(game, skin, bakeTurret) {
    const key = `${SHEET_PREFIX}${skin.id}:${skin.rev || 0}:${bakeTurret == null ? '-' : hex6(bakeTurret)}`;
    if (game.cache.checkImageKey(key)) return key;
    const original = game.cache.getFrameData(ORIGINAL);
    const wanted = new Set(NAMES);
    const images = new Map();
    for (let i = 0; i < original.total; i++) {
      const frame = original.getFrame(i);
      if (!wanted.has(frame.name)) continue;
      const own = skin.frames.get(frame.name);
      if (own) { images.set(frame.name, own); continue; }
      const canvas = originalFrameCanvas(game, frame);
      images.set(frame.name, SPECS[frame.name].role === 'turret' && bakeTurret != null ? bakeCanvas(canvas, bakeTurret) : canvas);
    }
    if (images.size !== NAMES.length) throw new Error(`the game's atlas lacks ${NAMES.length - images.size} tank frames`);
    for (let i = 0; i < original.total; i++) {   // weapon and scene visuals: what the skin paints, else a copy of the game's own frame (never a hole)
      const frame = original.getFrame(i);
      if (EFFECTS[frame.name]) images.set(frame.name, skin.frames.get(frame.name) || originalFrameCanvas(game, frame));
    }
    const placed = new Map();
    let x = PAD, y = PAD, row = 0;
    for (const [name, image] of images) {
      if (x + image.width + PAD > SHEET_WIDTH) { x = PAD; y += row + PAD; row = 0; }
      placed.set(name, { x, y, w: image.width, h: image.height });
      x += image.width + PAD;
      row = Math.max(row, image.height);
    }
    const sheet = document.createElement('canvas');
    sheet.width = SHEET_WIDTH;
    sheet.height = y + row + PAD;
    const context = sheet.getContext('2d');
    for (const [name, image] of images) { const p = placed.get(name); context.drawImage(image, p.x, p.y); }
    const frames = {};
    for (let i = 0; i < original.total; i++) {
      const name = original.getFrame(i).name;
      const p = placed.get(name) || { x: 0, y: 0, w: 1, h: 1 }; // frames not drawn from this sheet are never displayed from it
      frames[name] = { frame: { x: p.x, y: p.y, w: p.w, h: p.h }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: p.w, h: p.h }, sourceSize: { w: p.w, h: p.h } };
    }
    game.cache.addTextureAtlas(key, '', sheet, { frames }, Phaser.Loader.TEXTURE_ATLAS_JSON_HASH);
    return key;
  }

  /** Remove skin sheets no live sprite part is using any more (after a reinstall, a recolour or a reset). */
  function collectSheets(game, inUse) {
    const images = game.cache && game.cache._cache && game.cache._cache.image;
    if (!images) return;
    for (const key of Object.keys(images)) {
      if (!key.startsWith(SHEET_PREFIX) || inUse.has(key)) continue;
      try { const entry = images[key]; if (entry && entry.base) entry.base.destroy(); game.cache.removeImage(key, true); } catch { /* ignore */ }
    }
  }

  /* ---------------------------------------------------------------- who wears what */
  function ownIds() {
    const ids = new Set();
    for (const game of (ns.hook ? ns.hook.getGames() : [])) {
      const current = game.state && game.state.getCurrentState && game.state.getCurrentState();
      for (const list of [current && current.localPlayerIds, current && current.gameController && current.gameController.localPlayerIds]) {
        if (Array.isArray(list)) for (const id of list) ids.add(String(id));
      }
    }
    return ids;
  }

  /** The skin and recolour for a player: their own assignment, then the default for "my tanks" / "everyone else". */
  function resolve(id, own) {
    if (!S.enabled || S.suspended) return null;
    const explicit = S.players.get(String(id)) || null;
    const base = (own ? S.defaults.own : S.defaults.others) || null;
    const skin = explicit && explicit.skin != null ? (explicit.skin === '' ? null : explicit.skin) : (base && base.skin) || null;
    const recolor = (explicit && explicit.recolor) || (base && base.recolor) || null;
    return { skin: skin && S.skins.has(skin) ? skin : null, recolor };
  }

  function applyTank(sprite, own) {
    if (!sprite || !sprite.turret || !sprite.leftTread || !sprite.game || !sprite.game.cache) return;
    if (own === undefined) own = sprite.playerId != null && ownIds().has(String(sprite.playerId));
    const resolved = sprite.playerId == null ? null : resolve(sprite.playerId, own);
    const skin = resolved && resolved.skin ? S.skins.get(resolved.skin) : null;
    const recolor = (resolved && resolved.recolor) || {};
    const turretMeta = hookTint(sprite.turret, 'turret', sprite);
    // Tint "none": the skin's own frames show exactly as painted, so the game's fallback turret frames must carry the player's colour themselves.
    const bake = skin && skin.tint.turret === 'none' && recolor.turret == null ? num(turretMeta.game) : null;
    let key = ORIGINAL;
    if (skin) {
      try { key = sheetFor(sprite.game, skin, bake); } catch (error) { fail(`building skin "${skin.id}"`, error); key = ORIGINAL; }
    }
    const skinned = key !== ORIGINAL;
    for (const name of PART_NAMES) {
      const object = partOf(sprite, name);
      const role = PART_ROLE[name];
      const meta = hookTint(object, role, sprite);
      if (object.key !== key) object.loadTexture(key, object.frameName, false); // false: keep a running animation going
      let override = null;
      if (role) {
        if (recolor[role] != null) override = recolor[role];
        else if (skinned && skin.tint[role] === 'none') override = WHITE;
      }
      setOverride(meta, override);
    }
    turretMeta.bakedWith = skinned ? bake : null;
    sprite.__ttSkin = skinned ? skin.id : null;
  }

  /* ---------------------------------------------------------------- weapon visuals (projectiles, mines, missiles, shrapnel, lasers) */
  function ownerOf(sprite, kind) {
    try {
      if (kind === 'mine' || kind === 'missile' || kind === 'laser' || kind === 'aimer') return sprite.playerId;
      const gc = sprite.gameController;
      const projectile = gc && gc.getProjectile && gc.getProjectile(sprite.projectileId);
      return projectile && projectile.getPlayerId ? projectile.getPlayerId() : null;
    } catch { return null; }
  }
  /** Show the frame from the skin sheet when the skin paints it, otherwise the game's own frame. Tinted frames (mine, missile) are multiplied
   *  by the game by the OWNER's turret colour: a painted skin forces white so the art shows exactly as painted. */
  function swapEffect(object, skin, key, frame, recolor) {
    if (!object) return;
    const painted = Boolean(skin && frame && skin.frames.has(frame) && EFFECTS[frame]);
    const target = painted ? key : ORIGINAL;
    if (object.key !== target) object.loadTexture(target, frame, false);
    if (frame && EFFECTS[frame] && EFFECTS[frame].tinted) {
      const meta = hookTint(object, 'effect', null);
      setOverride(meta, recolor.turret != null ? recolor.turret : painted && skin.tint.turret === 'none' ? WHITE : null);
    }
  }
  function applyEffect(sprite, kind, ownSet) {
    if (!sprite || !sprite.game || !sprite.game.cache) return;
    const owner = ownerOf(sprite, kind);
    const own = owner != null && (ownSet || ownIds()).has(String(owner));
    const resolved = owner == null ? null : resolve(owner, own);
    const skin = resolved && resolved.skin ? S.skins.get(resolved.skin) : null;
    const recolor = (resolved && resolved.recolor) || {};
    if (kind === 'laser') { sprite.__ttLaser = skin && skin.laser ? skin.laser : null; return; }
    if (kind === 'aimer') { const meta = hookColour(sprite); meta.override = skin && skin.laser ? skin.laser.value : null; meta.effective = meta.override == null ? meta.game : meta.override; return; }
    let key = ORIGINAL;
    if (skin) { try { key = sheetFor(sprite.game, skin, null); } catch (error) { fail(`building skin "${skin.id}"`, error); } }
    if (kind === 'mine') { swapEffect(sprite, skin, key, 'mine', recolor); swapEffect(sprite.glow, skin, key, 'mineGlow', recolor); }
    else swapEffect(sprite, skin, key, sprite.frameName, recolor);
  }
  /** The laser is a line the game draws every frame, not a texture: a skin may set its colour and a soft glow (wider, faint) around the
   *  game's own 4 px line. The hit line is the model's and is unchanged. */
  function drawLaser(g, style) {
    const points = g.laserPositions;
    if (!g.exists || !points || points.length < 2 || (g.game.physics.arcade && g.game.physics.arcade.isPaused)) return;
    g.clear();
    const path = () => { g.moveTo(points[0].x, points[0].y); for (let i = 1; i < points.length; i++) g.lineTo(points[i].x, points[i].y); };
    if (style.glow) { g.lineStyle(10, style.value, 0.16); path(); g.lineStyle(6.5, style.value, 0.3); path(); }
    g.lineStyle(4, style.value, 1); path();
    g.lineStyle(1.6, 0xffffff, 0.85); path();
  }
  /** The laser sight (aimer) is a dashed line coloured by the owner's turret colour: a skin's laser colour replaces it. */
  function hookColour(sprite) {
    if (sprite.__ttColour) return sprite.__ttColour;
    const meta = sprite.__ttColour = { game: sprite.colour, override: null, effective: sprite.colour };
    Object.defineProperty(sprite, 'colour', { configurable: true, enumerable: true, get: () => meta.effective, set: value => { meta.game = value; meta.effective = meta.override == null ? value : meta.override; } });
    return meta;
  }

  /* ---- scene visuals: explosions, smoke, dust, puffs, shield and bolts, sparks, fragments, crates ----
   * The game builds these inside its own groups and emitters (a particle keeps one frame for life), so the scene is walked: each sprite whose
   * frame the skin paints is moved to the skin sheet. Particles and crates have no owner and follow the viewer's "my tank" skin; fragments
   * and shields follow the skin of the tank they belong to. Classes whose frames change on spawn (fragments, crates, shields) are wrapped. */
  function sceneContext(ownSet) {
    const a = S.enabled && !S.suspended && S.defaults.own && S.defaults.own.skin && S.skins.get(S.defaults.own.skin);
    const keys = new Map();
    return { ownSet: ownSet || ownIds(), ambient: a || null, used: new Set(), count: 0, keyFor(skin, game) { const k = skin.id + '@' + (game.id || 0); if (!keys.has(k)) { let key = ORIGINAL; try { key = sheetFor(game, skin, null); } catch (error) { fail('building skin "' + skin.id + '"', error); } keys.set(k, key); } return keys.get(k); } };
  }
  function sweepNode(node, pool, owner, ctx) {
    const ownerless = pool === 'particle' || pool === 'crate';
    let skin = null, recolor = {};
    if (ownerless) skin = ctx.ambient;
    else if (owner != null) { const r = resolve(owner, ctx.ownSet.has(String(owner))); skin = r && r.skin ? S.skins.get(r.skin) : null; recolor = (r && r.recolor) || {}; }
    swapEffect(node, skin, skin ? ctx.keyFor(skin, node.game) : ORIGINAL, node.frameName, recolor);
    if (node.key) ctx.used.add(node.key);
  }
  function patchSceneClass(node, ctx) {
    const proto = Object.getPrototypeOf(node);
    if (!proto || S.patched.has(proto) || typeof proto.spawn !== 'function') return;
    const frame = node.frameName;
    const kind = node.layer1Shield ? 'shield' : /^fragment\d$/.test(frame || '') ? 'fragment' : /^crate\d-\d$/.test(frame || '') ? 'crate' : null;
    if (!kind) return;
    S.patched.add(proto);
    const spawn = proto.spawn;
    proto.spawn = function () {
      const result = spawn.apply(this, arguments);
      guard('spawn ' + kind, () => { const c = sceneContext(); walkScene(this, this.playerId != null ? this.playerId : null, 0, c); });
      return result;
    };
  }
  function walkScene(node, owner, depth, ctx) {
    if (!node || depth > 9 || ctx.count++ > 8000) return;
    if (node.playerId != null && typeof node.playerId !== 'object') owner = node.playerId;
    const frame = node.frameName;
    if (frame && (SCENE.has(frame) || /^crate\d-\d$/.test(frame)) && node.key && (node.key === ORIGINAL || String(node.key).startsWith(SHEET_PREFIX))) sweepNode(node, EFFECTS[frame] ? EFFECTS[frame].pool : 'crate', owner, ctx);
    if (depth > 0) patchSceneClass(node, ctx);
    const kids = node.children;
    if (Array.isArray(kids)) for (const kid of kids.slice()) walkScene(kid, owner, depth + 1, ctx);
  }
  function sweepScene(ownSet, keys) {
    const painted = [...S.skins.values()].some(skin => SCENE_NAMES.some(n => skin.frames.has(n)));
    if (!painted && !S.sceneSwapped) return;
    if (painted) S.sceneSwapped = true;
    for (const { game } of liveStates()) {
      const ctx = sceneContext(ownSet);
      guard('scene', () => walkScene(game.world, null, 0, ctx));
      if (!keys.has(game)) keys.set(game, new Set());
      for (const k of ctx.used) keys.get(game).add(k);
    }
  }

  function* effectSprites() {
    for (const { state } of liveStates()) for (const [kind, prop] of Object.entries(POOL_PROPS)) {
      const group = state[prop];
      if (group && Array.isArray(group.children)) for (const sprite of group.children.slice()) yield [sprite, kind];
    }
  }

  /* ---------------------------------------------------------------- live states */
  function liveStates() {
    const out = [];
    S.live = S.live.filter(entry => {
      const state = entry.state.deref(), game = entry.game.deref();
      if (!state || !game || game.isDestroyed) return false;
      out.push({ state, game });
      return true;
    });
    return out;
  }
  function eachSprite(fn) {
    const own = ownIds();
    for (const { state } of liveStates()) {
      const group = state.tankGroup;
      if (!group || !Array.isArray(group.children)) continue;
      for (const sprite of group.children.slice()) fn(sprite, state, sprite.playerId != null && own.has(String(sprite.playerId)));
    }
  }
  function refresh() {
    const keys = new Map();
    eachSprite((sprite, state, own) => {
      guard('apply', () => applyTank(sprite, own));
      if (sprite.exists && sprite.playerId != null) {
        const tag = state.tankNameGroup && Array.isArray(state.tankNameGroup.children) && state.tankNameGroup.children.find(t => t.exists && String(t.playerId) === String(sprite.playerId));
        if (tag && tag.tankName && tag.tankName.text) S.names.set(String(sprite.playerId), tag.tankName.text);
      }
      for (const name of PART_NAMES) { const object = partOf(sprite, name); if (object && object.key) { if (!keys.has(sprite.game)) keys.set(sprite.game, new Set()); keys.get(sprite.game).add(object.key); } }
    });
    const ownSet = ownIds();
    for (const [sprite, kind] of effectSprites()) {
      guard('apply effect', () => applyEffect(sprite, kind, ownSet));
      for (const object of [sprite, sprite.glow]) if (object && object.key && sprite.game) { if (!keys.has(sprite.game)) keys.set(sprite.game, new Set()); keys.get(sprite.game).add(object.key); }
    }
    sweepScene(ownSet, keys);
    for (const { game } of liveStates()) guard('collect', () => collectSheets(game, keys.get(game) || new Set()));
  }
  function restoreAll() {
    const wasEnabled = S.enabled;
    S.enabled = false;
    try { eachSprite(sprite => applyTank(sprite, false)); for (const [sprite, kind] of effectSprites()) applyEffect(sprite, kind); sweepScene(null, new Map()); } finally { S.enabled = wasEnabled; }
  }

  /** Called by hook.js once the match state has built its sprite pool, before the first spawn. */
  function attachState(state, game) {
    if (!state || S.attached.has(state)) return false;
    const pool = state.tankGroup;
    const sample = pool && Array.isArray(pool.children) && pool.children[0];
    if (!sample || !sample.turret || !sample.leftTread || !sample.leftTreadShade || !sample.rightTread || !sample.rightTreadShade) return false;
    const proto = Object.getPrototypeOf(sample);
    if (typeof proto.spawn !== 'function') return false;
    S.attached.add(state);
    S.live.push({ state: new WeakRef(state), game: new WeakRef(game) });
    if (!S.patched.has(proto)) {
      S.patched.add(proto);
      const spawn = proto.spawn;
      proto.spawn = function () {
        const result = spawn.apply(this, arguments);
        guard('spawn', () => applyTank(this));
        return result;
      };
      proto.spawn.__ttInner = spawn;     // marks the wrapper (lets a check confirm it is applied exactly once, also after minification)
    }
    guard('attach', refresh);
    return true;
  }
  /** Called by hook.js when a weapon-visual pool (projectiles, missiles, mines, shrapnel, lasers) gets its first sprite. */
  function attachGroup(kind, state, game) {
    const group = state && state[POOL_PROPS[kind]];
    const sample = group && Array.isArray(group.children) && group.children[0];
    if (!sample) return false;
    const proto = Object.getPrototypeOf(sample);
    if (typeof proto.spawn !== 'function') return false;
    if (!S.liveSet.has(state)) { S.liveSet.add(state); if (!S.live.some(e => e.state.deref() === state)) S.live.push({ state: new WeakRef(state), game: new WeakRef(game) }); }
    if (!S.patched.has(proto)) {
      S.patched.add(proto);
      const spawn = proto.spawn;
      proto.spawn = function () {
        const result = spawn.apply(this, arguments);
        guard('spawn ' + kind, () => applyEffect(this, kind));
        return result;
      };
      if (kind === 'laser' && typeof proto.update === 'function') {
        const update = proto.update;
        proto.update = function () {
          const result = update.apply(this, arguments);
          if (this.__ttLaser) guard('laser', () => drawLaser(this, this.__ttLaser));
          return result;
        };
      }
    }
    return true;
  }

  /* ---------------------------------------------------------------- public API */
  function validRecolor(value) {
    if (!value || typeof value !== 'object') return null;
    const out = {};
    let any = false;
    for (const role of ['base', 'tread', 'turret']) if (Number.isInteger(value[role]) && value[role] >= 0 && value[role] <= 0xffffff) { out[role] = value[role]; any = true; }
    return any ? out : null;
  }
  function validAssignment(value) {
    if (!value || typeof value !== 'object') return null;
    const out = { skin: typeof value.skin === 'string' ? value.skin : null, recolor: validRecolor(value.recolor) };
    if (typeof value.name === 'string') out.name = value.name.slice(0, 60);
    return out;
  }

  const api = {
    /** Replace the whole configuration. Skins: [{ id, rev, tint:{base,tread,turret}, frames: Map<name, canvas> }]. */
    configure(config) {
      if (config.skins) {
        S.skins = new Map();
        for (const skin of config.skins) S.skins.set(skin.id, { id: skin.id, rev: skin.rev || 0, tint: { base: 'none', tread: 'none', turret: 'none', ...skin.tint }, laser: skin.laser || null, frames: skin.frames });
      }
      if (config.defaults) S.defaults = { own: validAssignment(config.defaults.own), others: validAssignment(config.defaults.others) };
      if (config.players) {
        S.players = new Map();
        for (const [id, value] of Object.entries(config.players)) { const a = validAssignment(value); if (a) S.players.set(String(id), a); }
      }
      if (typeof config.enabled === 'boolean') S.enabled = config.enabled;
      if (config.resume) { S.suspended = false; S.failures = 0; S.error = null; }
      guard('configure', refresh);
    },
    /** Instant reset to the original look (keeps skins and assignments; switch back on to restore them). */
    setEnabled(value) { S.enabled = Boolean(value); if (S.enabled) { S.suspended = false; S.failures = 0; S.error = null; } guard('toggle', refresh); },
    reset() { api.setEnabled(false); },
    refresh() { guard('refresh', refresh); },
    attachState,
    attachGroup,
    isEnabled: () => S.enabled && !S.suspended,
    getInfo() {
      const states = liveStates();
      const own = ownIds();
      const tanks = [];
      eachSprite(sprite => {
        if (!sprite.exists || sprite.playerId == null) return;
        const id = String(sprite.playerId);
        tanks.push({
          id, name: S.names.get(id) || null, own: own.has(id), skin: sprite.__ttSkin || null,
          colours: { base: num(sprite.__ttTint ? sprite.__ttTint.game : sprite.tint), turret: num(sprite.turret.__ttTint ? sprite.turret.__ttTint.game : sprite.turret.tint), tread: num(sprite.leftTread.__ttTint ? sprite.leftTread.__ttTint.game : sprite.leftTread.tint) }
        });
      });
      return { enabled: S.enabled, suspended: S.suspended, error: S.error, hooked: Boolean(ns.hook && ns.hook.getGames().length), matchStates: states.length, tanks };
    },
    knownName: id => S.names.get(String(id)) || null,
    /** Re-applies the intended look now (the half-second safety net below does the same). */
    _reconcile() { guard('reconcile', refresh); }
  };
  ns.core = api;
  // A light safety net: re-assert the intended look twice a second (cheap: at most 8 sprites, nothing is rebuilt when unchanged).
  if (typeof setInterval === 'function') setInterval(() => { if (S.live.length) guard('reconcile', refresh); }, 500);
})(typeof globalThis !== 'undefined' ? globalThis : this);
