/* Skin Tools hook. Runs in the page's main world at document_start, before the game boots.
 * It only LISTENS: it remembers the Phaser.Game instances, and notices when the game's match state builds its tank
 * sprite pool so the engine (core.js) can wrap the sprite class's `spawn`. It sends nothing and alters no game data.
 *
 * Coexistence: other extensions may hook the same two things, the `Phaser` global and `Phaser.Game`. Whichever hook runs
 * last would replace an earlier accessor, so this hook chains to any accessor already installed instead of replacing it, and re-checks after every script has loaded and on every read.
 * It also wraps `game.state.add` and calls the previous version, so other hooks that wrap it keep working. */
(() => {
  'use strict';
  const root = globalThis;
  const ns = (root.TankSkinTools = root.TankSkinTools || {});
  if (ns.hook) return;

  const instances = [];
  const wrappedGames = new WeakSet();
  const attached = new WeakSet();
  const watchedStates = new WeakSet();
  const listeners = new Set();
  const core = () => ns.core;

  const remember = game => { instances.push(new WeakRef(game)); try { watchStates(game); } catch { /* never break the page */ } return game; };

  /** Wrap `state.add`: when the game registers its "Game" state, notice the moment it builds the tank pool. */
  function watchStates(game) {
    const manager = game && game.state;
    if (!manager || typeof manager.add !== 'function' || manager.__skinToolsWatched) return;
    const add = manager.add;
    manager.__skinToolsWatched = true;
    manager.add = function (key, state) {
      const result = add.apply(this, arguments);
      if (key === 'Game') { try { watchState(state && this.states && this.states[key] || state, game); } catch { /* ignore */ } }
      for (const fn of [...listeners]) { try { fn(key, game); } catch { /* ignore */ } }
      return result;
    };
  }

  const EFFECT_POOLS = { projectileGroup: 'projectile', missileGroup: 'missile', mineGroup: 'mine', shrapnelGroup: 'shrapnel', laserGroup: 'laser', aimerGroup: 'aimer' };
  const attachedKinds = new WeakMap();
  /** The match state's create() assigns each pool property (`this.tankGroup = ...`) and then `add`s the pooled sprites to it. Shadow the
   *  properties on the instance, and on the first `add` hand the pool to the engine: that is before any sprite is spawned, even a spawn that
   *  happens inside create() when the viewer joins a round in progress. */
  function watchState(state, game) {
    if (!state || typeof state !== 'object' || watchedStates.has(state)) return;
    watchedStates.add(state);
    const tryAttach = prop => {
      if (!core()) return;
      if (prop === 'tankGroup') { if (!attached.has(state) && core().attachState(state, game)) attached.add(state); return; }
      let kinds = attachedKinds.get(state); if (!kinds) attachedKinds.set(state, kinds = new Set());
      const kind = EFFECT_POOLS[prop];
      if (!kinds.has(kind) && core().attachGroup && core().attachGroup(kind, state, game)) kinds.add(kind);
    };
    for (const prop of ['tankGroup', ...Object.keys(EFFECT_POOLS)]) {
      const descriptor = Object.getOwnPropertyDescriptor(state, prop);
      if (descriptor && descriptor.configurable === false) continue;
      let group = descriptor && 'value' in descriptor ? descriptor.value : undefined;
      const watchGroup = value => {
        group = value;
        if (!value || typeof value.add !== 'function' || value.__skinToolsWatched) return;
        value.__skinToolsWatched = true;
        const add = value.add;
        value.add = function () {
          const result = add.apply(this, arguments);
          try { tryAttach(prop); } catch { /* ignore */ }
          return result;
        };
      };
      Object.defineProperty(state, prop, { configurable: true, enumerable: true, get: () => group, set: watchGroup });
      if (group) watchGroup(group);
    }
  }

  function wrapGame(Game) {
    if (typeof Game !== 'function' || wrappedGames.has(Game)) return Game;
    let proxy;
    proxy = new Proxy(Game, {
      construct(target, args, newTarget) { return remember(Reflect.construct(target, args, newTarget === proxy ? target : newTarget)); }
    });
    wrappedGames.add(proxy);
    return proxy;
  }

  const attachedEngines = new WeakSet();
  function attachEngine(engine) {
    if (!engine || typeof engine !== 'object' || attachedEngines.has(engine)) return;
    attachedEngines.add(engine);
    const descriptor = Object.getOwnPropertyDescriptor(engine, 'Game');
    if (descriptor && descriptor.configurable === false) { if (descriptor.writable) engine.Game = wrapGame(engine.Game); return; }
    const previousGet = descriptor && descriptor.get;
    const previousSet = descriptor && descriptor.set;
    const read = () => (previousGet ? previousGet.call(engine) : undefined);
    let Game = wrapGame(previousGet ? read() : engine.Game);
    Object.defineProperty(engine, 'Game', {
      configurable: true,
      enumerable: true,
      get: () => Game,
      set: value => {
        if (previousSet) previousSet.call(engine, value);
        Game = wrapGame(previousGet ? read() : value);
      }
    });
  }
  const ensure = () => { try { attachEngine(root.Phaser); } catch { /* never break the page */ } };

  const phaserDescriptor = Object.getOwnPropertyDescriptor(root, 'Phaser');
  if (!phaserDescriptor || phaserDescriptor.configurable) {
    const previousGet = phaserDescriptor && phaserDescriptor.get;
    const previousSet = phaserDescriptor && phaserDescriptor.set;
    let engine = phaserDescriptor && 'value' in phaserDescriptor ? phaserDescriptor.value : (previousGet ? previousGet.call(root) : undefined);
    Object.defineProperty(root, 'Phaser', {
      configurable: true,
      enumerable: true,
      get: () => (previousGet ? previousGet.call(root) : engine),
      set: value => {
        engine = value;
        if (previousSet) previousSet.call(root, value);
        attachEngine(value);
      }
    });
  }
  ensure();
  if (typeof document !== 'undefined' && document.addEventListener) {
    document.addEventListener('load', ensure, true); // script load events do not bubble: capture them
    document.addEventListener('DOMContentLoaded', ensure);
  }

  function getGames() {
    ensure();
    const games = [];
    for (let i = instances.length - 1; i >= 0; i--) {
      const game = instances[i].deref();
      if (!game || game.isDestroyed) { instances.splice(i, 1); continue; }
      games.unshift(game);
    }
    return games;
  }

  // Safety net: if a match state was registered some way this hook did not see, find it by shape.
  setInterval(() => {
    try {
      for (const game of getGames()) {
        const current = game.state && game.state.getCurrentState && game.state.getCurrentState();
        if (current && current.tankGroup && !attached.has(current) && core() && core().attachState(current, game)) attached.add(current);
        if (current && core() && core().attachGroup) {
          let kinds = attachedKinds.get(current); if (!kinds) attachedKinds.set(current, kinds = new Set());
          for (const [prop, kind] of Object.entries(EFFECT_POOLS)) if (current[prop] && !kinds.has(kind) && core().attachGroup(kind, current, game)) kinds.add(kind);
        }
      }
    } catch { /* ignore */ }
  }, 750);

  ns.hook = Object.freeze({ getGames, onStateAdded(fn) { listeners.add(fn); return () => listeners.delete(fn); } });
})();
