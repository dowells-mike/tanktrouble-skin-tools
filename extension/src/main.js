/* Wires storage, engine and panel together. Runs at document_idle in the page's main world. */
(async () => {
  'use strict';
  const ns = globalThis.TankSkinTools;
  if (!ns || !ns.core || ns.main) return;
  const { core, store: storeModule, importer, panel } = ns;
  const store = storeModule.createStore();
  let settings = store.loadSettings();
  const records = new Map();   // id -> stored record
  const decoded = new Map();   // id -> { id, rev, tint, frames }
  let saveTimer = 0;
  const listeners = new Set();

  const flush = () => { clearTimeout(saveTimer); saveTimer = 0; store.saveSettings(settings); };
  const save = () => { clearTimeout(saveTimer); saveTimer = setTimeout(flush, 120); };
  // a tab closed right after a change must not lose it
  addEventListener('pagehide', () => { if (saveTimer) flush(); });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden' && saveTimer) flush(); });
  const engineSkins = () => [...decoded.values()].map(skin => ({ id: skin.id, rev: skin.rev, tint: skin.tint, laser: skin.laser, frames: skin.frames }));
  const push = (extra = {}) => core.configure({ enabled: settings.enabled, defaults: settings.defaults, players: settings.players, skins: engineSkins(), ...extra });

  async function load() {
    for (const record of await store.listSkins()) {
      try { decoded.set(record.id, await importer.decodeRecord(record)); records.set(record.id, record); }
      catch (error) { console.warn(`[skin-tools] could not load skin "${record.id}": ${error.message}`); }
    }
  }
  await load();
  push();

  const controller = {
    /** Lets the panel redraw when something outside it (for example the console) changed the state. */
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    notify() { for (const fn of listeners) { try { fn(); } catch { /* ignore */ } } },
    settings: () => settings,
    persistent: () => store.persistent,
    update(fn, options) { fn(settings); save(); if (!(options && options.quiet)) push(); },
    skins: () => [...records.values()].map(r => ({ id: r.id, name: r.name, author: r.author, version: r.version, tint: r.tint, scale: r.scale, frames: Object.keys(r.files).sort() })),
    decoded: id => decoded.get(id) || null,
    info: () => core.getInfo(),
    setEnabled(value) { settings.enabled = Boolean(value); save(); core.setEnabled(settings.enabled); },
    clearAssignments() { settings.defaults = { own: null, others: null }; settings.players = {}; save(); push(); },
    async importFiles(files) {
      const result = await importer.importFiles(files);
      if (result.report.ok) {
        const replaced = records.has(result.record.id);
        await store.putSkin(result.record);
        records.set(result.record.id, result.record);
        decoded.set(result.record.id, result.decoded);
        if (replaced) result.report.warnings.unshift(`Replaced the skin you already had with id "${result.record.id}".`);
        push();
      }
      return result.report;
    },
    async removeSkin(id) {
      await store.deleteSkin(id);
      records.delete(id); decoded.delete(id);
      for (const key of ['own', 'others']) if (settings.defaults[key] && settings.defaults[key].skin === id) settings.defaults[key].skin = null;
      for (const a of Object.values(settings.players)) if (a.skin === id) a.skin = null;
      save(); push();
    },
    setSkinTint(id, policy) {
      const record = records.get(id);
      if (!record || !['none', 'player'].includes(policy)) return;
      record.tint = { base: policy, tread: policy, turret: policy };
      const skin = decoded.get(id);
      if (skin) skin.tint = record.tint;
      store.putSkin(record);
      push();
    }
  };

  panel.mount(controller);
  ns.main = Object.freeze({ controller });
  // A console escape hatch that works even if the panel is hidden or broken.
  ns.reset = () => { controller.setEnabled(false); controller.notify(); };
})().catch(error => { try { console.warn('[skin-tools] failed to start:', error); } catch { /* ignore */ } });
