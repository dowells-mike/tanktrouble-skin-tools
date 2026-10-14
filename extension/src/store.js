/* Local persistence. Skins (PNG blobs) live in IndexedDB in the page's origin; small settings in localStorage.
 * Both are wrapped so the extension still works (without saving) when storage is blocked or cleared. Nothing leaves the browser. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else (root.TankSkinTools = root.TankSkinTools || {}).store = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const DB_NAME = 'tanktrouble-skin-tools-v1';
  const SETTINGS_KEY = 'ttSkinTools.v1';

  const defaultSettings = () => ({
    v: 1,
    enabled: true,
    defaults: { own: null, others: null },
    players: {},
    panel: { x: null, y: null, collapsed: true }
  });

  /** Keep only well-formed values from whatever is in storage. */
  function sanitiseSettings(raw) {
    const out = defaultSettings();
    if (!raw || typeof raw !== 'object') return out;
    if (typeof raw.enabled === 'boolean') out.enabled = raw.enabled;
    const colour = value => (Number.isInteger(value) && value >= 0 && value <= 0xffffff ? value : null);
    const assignment = value => {
      if (!value || typeof value !== 'object') return null;
      const recolor = {};
      for (const role of ['base', 'tread', 'turret']) { const c = value.recolor && colour(value.recolor[role]); if (c != null) recolor[role] = c; }
      const result = { skin: typeof value.skin === 'string' ? value.skin.slice(0, 40) : null, recolor: Object.keys(recolor).length ? recolor : null };
      if (typeof value.name === 'string') result.name = value.name.slice(0, 60);
      return result;
    };
    if (raw.defaults && typeof raw.defaults === 'object') { out.defaults.own = assignment(raw.defaults.own); out.defaults.others = assignment(raw.defaults.others); }
    if (raw.players && typeof raw.players === 'object') {
      for (const [id, value] of Object.entries(raw.players).slice(0, 200)) { const a = assignment(value); if (a && /^[\w-]{1,64}$/.test(id)) out.players[id] = a; }
    }
    if (raw.panel && typeof raw.panel === 'object') {
      const finite = v => (Number.isFinite(v) ? v : null);
      out.panel = { x: finite(raw.panel.x), y: finite(raw.panel.y), collapsed: raw.panel.collapsed !== false };
    }
    return out;
  }

  function createStore({ indexedDB: idb = globalThis.indexedDB, localStorage: storage = (() => { try { return globalThis.localStorage; } catch { return null; } })() } = {}) {
    let dbPromise = null;
    const memory = new Map();       // used when IndexedDB is unavailable
    let persistent = true;

    function open() {
      if (dbPromise) return dbPromise;
      dbPromise = new Promise(resolve => {
        if (!idb) { persistent = false; resolve(null); return; }
        let request;
        try { request = idb.open(DB_NAME, 1); } catch { persistent = false; resolve(null); return; }
        request.onupgradeneeded = () => { request.result.createObjectStore('skins', { keyPath: 'id' }); };
        request.onsuccess = () => resolve(request.result);
        request.onerror = request.onblocked = () => { persistent = false; resolve(null); };
      });
      return dbPromise;
    }
    const run = (db, mode, fn) => new Promise((resolve, reject) => {
      const tx = db.transaction('skins', mode);
      const store = tx.objectStore('skins');
      const request = fn(store);
      tx.oncomplete = () => resolve(request && 'result' in request ? request.result : undefined);
      tx.onerror = tx.onabort = () => reject(tx.error || new Error('storage failed'));
    });

    return {
      get persistent() { return persistent; },
      async listSkins() {
        const db = await open();
        if (!db) return [...memory.values()];
        try { return (await run(db, 'readonly', s => s.getAll())) || []; } catch { persistent = false; return [...memory.values()]; }
      },
      async putSkin(record) {
        const db = await open();
        if (!db) { memory.set(record.id, record); return false; }
        try { await run(db, 'readwrite', s => s.put(record)); return true; } catch { persistent = false; memory.set(record.id, record); return false; }
      },
      async deleteSkin(id) {
        memory.delete(id);
        const db = await open();
        if (db) { try { await run(db, 'readwrite', s => s.delete(id)); } catch { /* ignore */ } }
      },
      loadSettings() {
        try { return sanitiseSettings(JSON.parse(storage.getItem(SETTINGS_KEY) || 'null')); } catch { return defaultSettings(); }
      },
      saveSettings(settings) {
        try { storage.setItem(SETTINGS_KEY, JSON.stringify(settings)); return true; } catch { return false; }
      }
    };
  }

  return { createStore, sanitiseSettings, defaultSettings, SETTINGS_KEY, DB_NAME };
});
