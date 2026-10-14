/* The Skin Tools panel: a small Shadow-DOM window in the page's main world, drawn in the game's own style
 * (black title bar, the blue gradient buttons, light "snippet" cards; the page already loads the "TankTrouble" font).
 *   Compact view: who wears it (My tank / Everyone / A player) -> which skin -> done (a pick applies at once).
 *   Secondary: "Manage skins" (import, preview, remove) as a page inside the panel, and a collapsible "Advanced" fold
 *   (recolour, colour mode of a skin, preview tools, resets).
 * Every piece of text from outside (skin names, player names, file names) goes through textContent, never innerHTML;
 * innerHTML is used only for the constant icon strings below. No framework, no timers while collapsed. */
(function (root) {
  'use strict';
  const ns = root.TankSkinTools = root.TankSkinTools || {};
  if (ns.panel) return;

  const CSS = `
:host{all:initial}
*{box-sizing:border-box}
.win{--blue1:#427fff;--blue2:#0014ab;--ink:#464646;--ink2:#222;--line:#8f8f8f;--green:#31e000;--glass:linear-gradient(#ffffff,#e4e4e4);
  position:fixed;width:272px;max-width:calc(100vw - 16px);max-height:calc(100vh - 16px);display:flex;flex-direction:column;
  font:700 13px/1.25 Arial,Helvetica,sans-serif;color:var(--ink);background:linear-gradient(#f0f0f0,#cbcbcb);border-radius:6px;
  box-shadow:0 10px 18px rgba(0,0,0,.28),0 0 0 1px rgba(0,0,0,.18);pointer-events:auto;z-index:2147483000;user-select:none}
button,input,select{font:inherit;color:inherit;margin:0}
button{cursor:pointer}
:focus{outline:none}
:focus-visible{outline:3px solid #ffd400;outline-offset:1px;box-shadow:0 0 0 1px #000}
.hidden{display:none!important}
.sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
svg.i{width:16px;height:16px;flex:none;fill:none;stroke:currentColor;stroke-width:2.2;stroke-linecap:round;stroke-linejoin:round}
.head{display:flex;align-items:center;gap:8px;height:36px;padding:0 6px 0 10px;background:#000;color:#fff;border-radius:6px 6px 0 0;cursor:grab;touch-action:none;flex:none}
.head:active{cursor:grabbing}
.head .logo{width:22px;height:22px;flex:none}
.head .title{flex:1;min-width:0;font:15px/1 TankTrouble,Arial,sans-serif;letter-spacing:.2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:#fff}
.opener{display:flex;align-items:center;gap:8px;flex:1;min-width:0;height:100%;padding:0;border:0;background:none;color:#fff;text-align:left}
.ib{width:28px;height:28px;display:grid;place-items:center;padding:0;border:0;border-radius:5px;background:rgba(255,255,255,.16);color:#fff;flex:none}
.ib:hover{background:rgba(255,255,255,.3)}.ib:active{transform:translateY(1px)}
.ib.dark{background:linear-gradient(#fff,#e0e0e0);color:#333;box-shadow:0 2px 3px rgba(0,0,0,.3)}
.ib.dark:hover{background:linear-gradient(#fff,#d4d4d4)}
.win.mini{width:auto}
.win.mini .head{border-radius:6px;height:34px;cursor:grab}
.sw{display:inline-flex;align-items:center;gap:6px;padding:0;border:0;background:none;color:#fff;font:13px/1 TankTrouble,Arial,sans-serif}
.sw .trk{position:relative;width:38px;height:20px;border-radius:10px;background:linear-gradient(#8a8a8a,#555);box-shadow:inset 0 2px 3px rgba(0,0,0,.55);transition:background .12s}
.sw .thb{position:absolute;top:2px;left:2px;width:16px;height:16px;border-radius:50%;background:linear-gradient(#fff,#d9d9d9);box-shadow:0 1px 2px rgba(0,0,0,.6);transition:left .12s}
.sw[aria-checked=true] .trk{background:linear-gradient(#5cf03a,#1e9c00)}
.sw[aria-checked=true] .thb{left:20px}
.sw .lbl{min-width:22px;text-align:left}
.scroll{flex:1;min-height:0;overflow:auto;display:flex;flex-direction:column}
.body{padding:9px 9px 4px;display:flex;flex-direction:column;gap:9px}
.lab{display:block;margin:0 0 4px;font:700 12px/1 Arial,sans-serif;color:var(--ink);letter-spacing:.2px}
.off .live{opacity:.5}
.offnote{margin:8px 9px 0;padding:5px 8px;border-radius:5px;background:#000;color:#fff;font:12px/1.3 TankTrouble,Arial,sans-serif;display:flex;gap:6px;align-items:center}
.btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;min-height:32px;padding:0 12px;border:0;border-radius:5px;color:#fff;background:linear-gradient(var(--blue1),var(--blue2));box-shadow:0 3px 4px rgba(0,0,0,.5);font:15px/32px TankTrouble,Arial,sans-serif;white-space:nowrap}
.btn:hover:not(:disabled){filter:brightness(1.1)}
.btn:active:not(:disabled){transform:translateY(2px);box-shadow:0 1px 4px rgba(0,0,0,.5)}
.btn.warn{background:linear-gradient(#ff0000,#800000)}
.btn:disabled{background:linear-gradient(#ccc,#4d4d4d);color:#f0f0f0;cursor:default}
.btn.glass{color:#222;background:var(--glass);border:1px solid var(--line);box-shadow:0 2px 3px rgba(0,0,0,.3);font:700 12px/1 Arial,sans-serif;min-height:30px;padding:0 10px}
.btn.glass:hover:not(:disabled){background:linear-gradient(#fff,#d6d6d6);filter:none}
.btn.glass:active:not(:disabled){box-shadow:0 1px 2px rgba(0,0,0,.3)}
.btn.sm{min-height:26px;padding:0 8px;font-size:13px;line-height:26px}
.btn.glass.sm{font-size:12px;line-height:1}
.btn.grow{flex:1;min-width:0}
.seg{display:flex;border-radius:5px;box-shadow:0 3px 4px rgba(0,0,0,.4)}
.seg button{flex:1;min-width:0;height:32px;padding:0 4px;border:1px solid var(--line);border-left-width:0;background:var(--glass);color:#333;font:700 13px/30px Arial,Helvetica,sans-serif;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.seg button:first-child{border-left-width:1px;border-radius:5px 0 0 5px}.seg button:last-child{border-radius:0 5px 5px 0}
.seg button:hover:not([aria-checked=true]){background:linear-gradient(#fff,#d6d6d6)}
.seg button[aria-checked=true]{color:#fff;background:linear-gradient(var(--blue1),var(--blue2));border-color:var(--blue2);box-shadow:inset 0 2px 3px rgba(0,0,0,.35)}
.seg button:focus-visible{position:relative;z-index:1}
.combo{position:relative;min-width:0}
.trig{width:100%;height:40px;display:flex;align-items:center;gap:8px;padding:0 8px 0 10px;text-align:left;border:1px solid var(--line);border-radius:5px;background:var(--glass);color:var(--ink2);font:400 14px/1 Arial,sans-serif;box-shadow:inset 0 1px 0 #fff}
.trig:hover{background:linear-gradient(#fff,#d9d9d9)}
.trig .t{flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.trig .t small{display:block;margin-top:2px;font:400 11px/1 Arial,sans-serif;color:#666;overflow:hidden;text-overflow:ellipsis}
.trig .chev{color:#555}
.trig[aria-expanded=true] .chev{transform:rotate(180deg)}
.list{position:fixed;z-index:20;display:flex;flex-direction:column;background:#fff;border:1px solid #9a9a9a;border-radius:5px;box-shadow:0 10px 16px rgba(0,0,0,.35);overflow:hidden}
.list .find{display:flex;align-items:center;gap:6px;padding:5px 8px;border-bottom:1px solid #bbb;background:#f2f2f2;color:#555;flex:none}
.list .find input{flex:1;min-width:0;height:28px;border:1px solid #b5b5b5;border-radius:4px;padding:0 6px;font:400 13px Arial,sans-serif;background:#fff;color:#222;user-select:text}
.list .opts{overflow:auto;padding:0;margin:0;list-style:none}
.opt{display:flex;align-items:center;gap:8px;min-height:34px;padding:3px 8px;border-bottom:1px solid #dcdcdc;font:400 14px/1.15 Arial,sans-serif;color:#222;cursor:pointer}
.opt:last-child{border-bottom:0}
.opt .t{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.opt .t small{display:block;margin-top:1px;font-size:11px;color:#666;overflow:hidden;text-overflow:ellipsis}
.opt.act,.opt:hover{background:#e3e9f6}
.opt[aria-selected=true]{font-weight:700}
.opt[aria-disabled=true]{color:#777;cursor:default}
.opt .ck{color:var(--blue1);visibility:hidden}.opt[aria-selected=true] .ck{visibility:visible}
.opt canvas{width:30px;height:30px;border-radius:4px;flex:none;background:#dfe4e8}
.none{padding:10px 8px;color:#666;font:400 13px Arial,sans-serif}
.dots{display:inline-flex;gap:2px;flex:none}.dots i{width:9px;height:14px;border-radius:2px;border:1px solid rgba(0,0,0,.55);display:block;background:#bbb}
.skinrow{display:flex;gap:8px;align-items:flex-end}
.tile{position:relative;width:56px;height:56px;flex:none;padding:0;border:1px solid var(--line);border-radius:6px;background:#dfe4e8;box-shadow:inset 0 2px 4px rgba(0,0,0,.28),0 1px 0 #fff;overflow:hidden}
.tile canvas{display:block;width:100%;height:100%}
.tile:hover{border-color:#555}
.tile .mag{position:absolute;right:2px;bottom:2px;width:16px;height:16px;border-radius:50%;background:#fff;color:#333;display:grid;place-items:center;box-shadow:0 1px 2px rgba(0,0,0,.4)}
.tile .mag svg{width:10px;height:10px;stroke-width:2.6}
.noteline{display:flex;align-items:flex-start;gap:5px;min-height:16px;margin-top:-2px;font:700 12px/1.25 Arial,sans-serif;color:#2a7a00}
.noteline svg{width:14px;height:14px;stroke-width:3;margin-top:1px}
.noteline.muted{color:#4d4d4d;font-weight:400}
.noteline.bad{color:#a30000}
.chip{display:flex;align-items:center;gap:7px;min-height:34px;padding:2px 4px 2px 9px;border:1px solid var(--line);border-radius:5px;background:var(--glass);color:var(--ink2);font:700 14px/1 Arial,sans-serif;box-shadow:inset 0 1px 0 #fff}
.chip .t{flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.chip .you{font:400 11px Arial,sans-serif;color:#555}
.foot{display:flex;gap:6px;padding:4px 9px 9px}
.foot .btn{min-height:30px}
.foot .btn[aria-expanded=true] svg.chev{transform:rotate(180deg)}
.adv{margin:0 9px 9px;padding:9px 0 0;border-top:1px solid rgba(0,0,0,.25);display:flex;flex-direction:column;gap:10px;box-shadow:0 -1px 0 rgba(255,255,255,.6)}
.adv h4{margin:0 0 5px;font:14px/1 TankTrouble,Arial,sans-serif;color:#222}
.colours{display:flex;gap:8px}
.colours .c{flex:1;min-width:0;display:flex;flex-direction:column;gap:3px;font:700 11px/1 Arial,sans-serif;color:var(--ink)}
.colours .c .r{display:flex;gap:2px}
.colours input[type=color]{flex:1;min-width:0;height:26px;padding:0;border:1px solid var(--line);border-radius:4px;background:none}
.colours input.unset{opacity:.4}
.colours .x{width:22px;padding:0;border:1px solid var(--line);border-radius:4px;background:var(--glass);color:#333;line-height:1}
.mini-seg{display:flex;border-radius:5px;box-shadow:0 2px 3px rgba(0,0,0,.3)}
.mini-seg button{flex:1;height:26px;padding:0 6px;border:1px solid var(--line);border-left-width:0;background:var(--glass);color:#333;font:700 12px/24px Arial,sans-serif;white-space:nowrap}
.mini-seg button:first-child{border-left-width:1px;border-radius:5px 0 0 5px}.mini-seg button:last-child{border-radius:0 5px 5px 0}
.mini-seg button[aria-checked=true]{color:#fff;background:linear-gradient(var(--blue1),var(--blue2));border-color:var(--blue2)}
.fold{display:flex;align-items:center;gap:6px;width:100%;padding:0;border:0;background:none;color:#222;font:14px/1 TankTrouble,Arial,sans-serif;text-align:left;min-height:24px}
.fold svg{transition:transform .12s}.fold[aria-expanded=true] svg{transform:rotate(180deg)}
.pvbox{display:flex;flex-direction:column;gap:8px;margin-top:8px}
.pvbox .stage{align-self:center;width:144px;height:144px;border-radius:6px;border:1px solid var(--line);background:#dfe4e8;box-shadow:inset 0 2px 4px rgba(0,0,0,.28)}
.pvbox .stage canvas{width:100%;height:100%;display:block}
.form{display:grid;grid-template-columns:58px 1fr;gap:6px 8px;align-items:center}
.form>span{font:700 12px/1 Arial,sans-serif}
.form select{height:28px;border:1px solid var(--line);border-radius:5px;background:var(--glass);color:#222;font:400 13px Arial,sans-serif;padding:0 4px;min-width:0}
.form input[type=range]{width:100%;min-width:0;accent-color:var(--blue1)}
.form .inl{display:flex;gap:8px;align-items:center;min-width:0}
.form label.chk{display:inline-flex;gap:5px;align-items:center;font:700 12px Arial,sans-serif}
.form input[type=color]{width:36px;height:24px;padding:0;border:1px solid var(--line);border-radius:4px;background:none}
.danger-row{display:flex;gap:6px}
.confirm{display:flex;align-items:center;gap:6px;flex-wrap:wrap;padding:6px 8px;border-radius:5px;background:#fff;border:1px solid #c33;color:#7a0000;font:700 12px/1.25 Arial,sans-serif}
.confirm .grow{flex:1 1 100%}.confirm .btn{flex:1}
.drop{display:flex;flex-direction:column;gap:6px;padding:8px;border:2px dashed #7d7d7d;border-radius:6px;background:rgba(255,255,255,.55)}
.drop.over,.win.dropping .drop{background:#e3e9f6;border-color:var(--blue1)}
.drop .hint{font:400 12px/1.3 Arial,sans-serif;color:#444}
.drop .btns{display:flex;gap:6px}.drop .btns .btn{flex:1;min-width:0;padding:0 8px}
.hintline{margin:-3px 0 0;font:400 12px/1.3 Arial,sans-serif;color:#444}
.skins{display:flex;flex-direction:column;border:1px solid var(--line);border-radius:6px;background:#fff;overflow:hidden auto;max-height:188px}
.row{display:flex;align-items:center;gap:4px;min-height:46px;padding:0 6px 0 4px;border-bottom:1px solid #dcdcdc;background:#fff}
.row:last-child{border-bottom:0}
.row:hover{background:#eef2fb}
.row.is-wearing{background:#e3e9f6;box-shadow:inset 3px 0 0 var(--blue1)}
.row .pv{flex:none;width:40px;height:40px;padding:0;border:1px solid #b5b5b5;border-radius:5px;background:#dfe4e8;overflow:hidden}
.row .pv canvas{width:100%;height:100%;display:block}
.row .pv:hover{border-color:#555}
.srow{flex:1;min-width:0;display:flex;flex-direction:column;justify-content:center;align-self:stretch;padding:0 6px;border:0;background:none;text-align:left;color:#222;font:700 13px/1.15 Arial,sans-serif}
.srow .n{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.srow small{display:block;margin-top:3px;font:400 11px/1 Arial,sans-serif;color:#666;overflow:hidden;text-overflow:ellipsis}
.row.is-wearing small{color:#1f6d00;font-weight:700}
.report{display:flex;flex-direction:column;gap:5px;padding:7px 8px;border-radius:5px;background:#fff;border-left:5px solid #888;font:400 12px/1.35 Arial,sans-serif;color:#222;user-select:text}
.report.ok{border-left-color:var(--green)}.report.err{border-left-color:#e00000}
.report b{display:block;font:700 13px/1.2 Arial,sans-serif}
.report ul{margin:0;padding-left:15px}
.report details{color:#555}.report summary{cursor:pointer;font-weight:700}
.empty{padding:14px 8px;text-align:center;color:#555;font:400 12px/1.4 Arial,sans-serif}
.zoom{position:absolute;left:0;right:0;bottom:calc(100% + 12px);z-index:30;padding:8px;border-radius:6px;background:linear-gradient(#ccc 10%,#999 90%);box-shadow:0 12px 14px rgba(0,0,0,.4);display:flex;flex-direction:column;gap:6px;align-items:center}
.zoom.below{bottom:auto;top:calc(100% + 12px)}
.zoom canvas{width:100%;max-width:240px;aspect-ratio:1;border-radius:6px;border:1px solid #666;background:#dfe4e8;box-shadow:inset 0 2px 4px rgba(0,0,0,.25)}
.zoom .cap{display:flex;gap:8px;align-items:center;width:100%;color:#222;font:700 13px Arial,sans-serif}
.zoom .cap .t{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
@media (max-width:340px){.win{width:calc(100vw - 16px)}}
@media (prefers-reduced-motion:reduce){*{transition:none!important;animation:none!important}}
@media (forced-colors:active){.btn,.trig,.seg button,.tile,.chip,.row{border:1px solid CanvasText}.seg button[aria-checked=true],.mini-seg button[aria-checked=true]{outline:2px solid Highlight}}
`;

  /** Constant icon markup (never built from outside text). */
  const ICON = {
    tank: '<svg class="i logo" viewBox="0 0 24 24" style="stroke:none"><rect x="2" y="3" width="5" height="18" rx="1.5" fill="#fff"/><rect x="17" y="3" width="5" height="18" rx="1.5" fill="#fff"/><rect x="6" y="5" width="12" height="14" rx="2" fill="#427fff"/><circle cx="12" cy="13" r="4" fill="#fff"/><rect x="10.8" y="1" width="2.4" height="9" rx="1" fill="#fff"/></svg>',
    chev: '<svg class="i chev" viewBox="0 0 16 16"><path d="M3.5 6l4.5 4.5L12.5 6"/></svg>',
    back: '<svg class="i" viewBox="0 0 16 16"><path d="M10 3L5 8l5 5"/></svg>',
    min: '<svg class="i" viewBox="0 0 16 16"><path d="M3.5 11h9"/></svg>',
    x: '<svg class="i" viewBox="0 0 16 16"><path d="M4 4l8 8M12 4l-8 8"/></svg>',
    search: '<svg class="i" viewBox="0 0 16 16"><circle cx="7" cy="7" r="4.2"/><path d="M10.2 10.2L13.5 13.5"/></svg>',
    check: '<svg class="i ck" viewBox="0 0 16 16"><path d="M3 8.5l3.2 3.2L13 4.8"/></svg>',
    plus: '<svg class="i" viewBox="0 0 16 16"><path d="M8 3v10M3 8h10"/></svg>',
    trash: '<svg class="i" viewBox="0 0 16 16"><path d="M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.6 8.5h5.8l.6-8.5"/></svg>',
    zoom: '<svg class="i" viewBox="0 0 16 16"><path d="M9.5 2.5h4v4M6.5 13.5h-4v-4M13.5 2.5L9 7M2.5 13.5L7 9"/></svg>',
    info: '<svg class="i" viewBox="0 0 16 16"><circle cx="8" cy="8" r="6"/><path d="M8 7.2V11M8 5v.1"/></svg>'
  };
  const icon = name => { const t = document.createElement('template'); t.innerHTML = ICON[name]; return t.content.firstChild; };

  const h = (tag, attrs, ...kids) => {
    const node = document.createElement(tag);
    for (const [key, value] of Object.entries(attrs || {})) {
      if (value === false || value == null) continue;
      if (key === 'class') node.className = value;
      else if (key === 'text') node.textContent = value;
      else if (key.startsWith('on')) node.addEventListener(key.slice(2), value);
      else node.setAttribute(key, value === true ? '' : String(value));
    }
    for (const kid of kids.flat()) if (kid != null && kid !== false) node.append(kid);
    return node;
  };
  const hex = n => `#${(n & 0xffffff).toString(16).padStart(6, '0')}`;
  const parseHex = text => parseInt(text.slice(1), 16);
  const ROLE_LABEL = { base: 'Body', turret: 'Turret', tread: 'Treads' };
  const WHO = { me: 'your tank', all: 'everyone', player: 'this player' };
  const DEFAULT_SAMPLE = { base: 0x4a9a4a, tread: 0x3a3a3a, turret: 0xcc4444 };
  const MIXED = '__mixed', INHERIT = '__inherit';

  /** The importer's wording, made plainer for the common mistakes (the importer's own messages are unchanged). */
  function plain(line) {
    let m;
    if ((m = /^(\w+)\.png is required\.$/.exec(line))) return `${m[1]}.png is missing. Every skin needs it.`;
    if ((m = /^([\w.-]+): is (\d+x\d+); (\w+) must be ([\dx, ]+) \(1x, 2x or 4x of (\d+x\d+)\)\.$/.exec(line))) return `${m[1]} is ${m[2]}, but the ${m[3]} image must be ${m[5]} (or exactly 2× or 4× that).`;
    if ((m = /^([\w.-]+): has no transparency channel\./.exec(line))) return `${m[1]} has no see-through background. Save it as a PNG with transparency.`;
    if ((m = /^([\w.-]+): interlaced PNGs are not supported/.exec(line))) return `${m[1]} is saved as an “interlaced” PNG. Save it again without interlacing.`;
    if ((m = /^Mixed resolutions: (.*)\. Export every file of a skin at the same scale\.$/.exec(line))) return `The images are drawn at different sizes (${m[1]}). Export them all at the same size.`;
    return line.replace(/^skin\.json: /, 'skin.json: ');
  }

  function mount(ctl) {
    const host = h('div', { id: 'tanktrouble-skin-tools-host' });
    host.style.cssText = 'all:initial!important;position:fixed!important;inset:0!important;pointer-events:none!important;z-index:2147483000!important;display:block!important';
    const shadow = host.attachShadow({ mode: 'open' });
    shadow.append(h('style', { text: CSS }));
    const settings = () => ctl.settings();
    const ui = {
      page: 'main', target: 'me', player: null, open: null, query: '', active: 0, adv: false, pvtools: false, zoom: false, confirm: null, report: null,
      flash: '', flashTimer: 0, sampleOverride: null, thumbs: new Map(), sig: '', typed: '', typedAt: 0, previewSkin: null, drag: null,
      pv: { angle: 0.6, frame: 'turret0', zoom: 2, guides: false, spin: false, raf: 0 }
    };
    const win = h('div', { class: 'win', role: 'dialog', 'aria-label': 'TankTrouble Skin Tools' });
    shadow.append(win);
    // file inputs live outside the re-rendered window so they survive every redraw
    const files = h('input', { type: 'file', multiple: true, accept: '.png,.json,image/png,application/json', class: 'hidden', tabindex: -1, 'aria-hidden': 'true' });
    const folder = h('input', { type: 'file', multiple: true, webkitdirectory: true, class: 'hidden', tabindex: -1, 'aria-hidden': 'true' });
    shadow.append(files, folder);
    const statusLive = h('div', { class: 'sr', role: 'status', 'aria-live': 'polite' });      // announces what just happened
    shadow.append(statusLive);

    /* ---------------- data helpers ---------------- */
    const skinList = () => ctl.skins();
    const skinName = id => { const k = skinList().find(x => x.id === id); return k ? k.name : id; };
    const clean = a => (!a || (a.skin == null && !a.recolor) ? null : { skin: a.skin, recolor: a.recolor });
    const tanks = () => ctl.info().tanks;
    const ownColours = () => { const own = tanks().find(t => t.own); return own && own.colours ? own.colours : null; };
    const sample = () => ui.sampleOverride || ownColours() || DEFAULT_SAMPLE;
    const skinVal = a => (a && a.skin != null ? a.skin : null);

    function playerRows() {
      const s = settings();
      const rows = new Map();
      for (const t of tanks()) rows.set(t.id, { id: t.id, name: t.name || (s.players[t.id] && s.players[t.id].name) || `Player ${t.id}`, here: true, own: t.own, colours: t.colours });
      for (const [id, a] of Object.entries(s.players)) if (!rows.has(id)) rows.set(id, { id, name: a.name || `Player ${id}`, here: false, own: false, colours: null });
      return [...rows.values()].sort((a, b) => (b.own - a.own) || (b.here - a.here) || a.name.localeCompare(b.name));
    }
    const playerSub = row => {
      const a = settings().players[row.id];
      const skin = a && a.skin ? skinName(a.skin) : null;
      return [row.own ? 'your tank' : row.here ? 'in this match' : 'seen before', skin].filter(Boolean).join(' · ');
    };

    /** What the chosen target wears now: a skin id, '' (original look), INHERIT (a player on the default) or MIXED. */
    function currentSkin() {
      const s = settings();
      if (ui.target === 'me') return skinVal(s.defaults.own) || '';
      if (ui.target === 'all') { const a = skinVal(s.defaults.own) || '', b = skinVal(s.defaults.others) || ''; return a === b ? a : MIXED; }
      const a = ui.player ? s.players[ui.player] : null;
      return a && a.skin != null ? a.skin : INHERIT;
    }
    function currentRecolor() {
      const s = settings();
      if (ui.target === 'me' || ui.target === 'all') return (s.defaults.own && s.defaults.own.recolor) || null;
      return (ui.player && s.players[ui.player] && s.players[ui.player].recolor) || null;
    }
    function writeTarget(patch) {            // patch: { skin } and/or { recolor }
      const row = ui.target === 'player' ? playerRows().find(r => r.id === ui.player) : null;
      ctl.update(x => {
        const apply = (a, isDefault) => {
          const next = { skin: a ? a.skin : null, recolor: a ? a.recolor : null };
          if ('skin' in patch) next.skin = patch.skin;
          if ('recolor' in patch) next.recolor = patch.recolor;
          if (isDefault && next.skin === '') next.skin = null;           // for a default, "original" and "nothing" are the same
          return clean(next);
        };
        if (ui.target === 'me') x.defaults.own = apply(x.defaults.own, true);
        else if (ui.target === 'all') { x.defaults.own = apply(x.defaults.own, true); x.defaults.others = apply(x.defaults.others, true); }
        else if (ui.player) {
          const next = apply(x.players[ui.player], false);
          if (next) x.players[ui.player] = { ...next, name: row ? row.name : (x.players[ui.player] && x.players[ui.player].name) }; else delete x.players[ui.player];
        }
      });
    }
    function setSkin(value) {
      writeTarget({ skin: value === INHERIT ? null : value });
      const who = ui.target === 'player' ? (playerRows().find(r => r.id === ui.player) || { name: 'this player' }).name : ({ me: 'your tank', all: 'everyone’s tank (only you see it)' })[ui.target];
      say(value === '' ? `Original look is back on ${who}.` : value === INHERIT ? `${who} follows the default again.` : `${skinName(value)} is on ${who}.`);
    }

    /* ---------------- feedback ---------------- */
    function say(text) {
      ui.flash = text; statusLive.textContent = text;
      clearTimeout(ui.flashTimer);
      ui.flashTimer = setTimeout(() => { ui.flash = ''; if (!settings().panel.collapsed) render(); }, 5000);
      render();
    }

    /* ---------------- thumbnails and previews ---------------- */
    const dpr = () => Math.min(2, Math.max(1, window.devicePixelRatio || 1));
    function paintOriginal(canvas) {         // a plain stand-in for the game's own tank (the game's art is not copied)
      const c = canvas.getContext('2d'), n = canvas.width, k = n / 100, col = sample();
      c.fillStyle = '#dfe4e8'; c.fillRect(0, 0, n, n);
      c.translate(n / 2, n / 2); c.rotate(0.42); c.scale(k, k);
      const box = (x, y, w, h, color, r) => { c.fillStyle = color; c.beginPath(); c.roundRect(x, y, w, h, r); c.fill(); };
      box(-37, -38, 14, 80, hex(col.tread), 3); box(23, -38, 14, 80, hex(col.tread), 3);
      box(-24, -38, 48, 80, hex(col.base), 4);
      box(-5, -58, 10, 34, hex(col.turret), 3);
      c.fillStyle = hex(col.turret); c.beginPath(); c.arc(0, -5, 15, 0, Math.PI * 2); c.fill();
    }
    /** A cached tank picture of a skin (or of the original look), drawn into `canvas`. */
    function paintThumb(canvas, skinId, cssSize) {
      const px = Math.round(cssSize * dpr());
      canvas.width = canvas.height = px;
      const decoded = skinId ? ctl.decoded(skinId) : null;
      const col = sample();
      const key = `${skinId}|${decoded ? decoded.rev : 0}|${px}|${col.base}.${col.turret}.${col.tread}`;
      let cached = ui.thumbs.get(key);
      if (!cached) {
        cached = document.createElement('canvas'); cached.width = cached.height = px;
        if (decoded) ns.preview.draw(cached, decoded, { angle: 0.42, zoom: px / 125, colours: col, background: '#dfe4e8' }); else paintOriginal(cached);
        if (ui.thumbs.size > 80) ui.thumbs.clear();
        ui.thumbs.set(key, cached);
      }
      canvas.getContext('2d').drawImage(cached, 0, 0);
      return canvas;
    }
    const thumb = (skinId, cssSize) => { const c = h('canvas', { 'aria-hidden': 'true' }); c.style.width = c.style.height = `${cssSize}px`; return paintThumb(c, skinId, cssSize); };
    const dots = c => h('span', { class: 'dots' }, c ? [c.base, c.turret, c.tread].map(x => h('i', { style: `background:${hex(x)}` })) : [h('i'), h('i'), h('i')]);

    // the big preview (enlarge popover and the preview-tools stage) share one set of controls
    function previewTarget() {
      const v = ui.target === 'player' && !ui.player ? '' : currentSkin();
      if (v && v !== MIXED && v !== INHERIT) return v;
      if (v === INHERIT) { const d = settings().defaults.others; if (d && d.skin) return d.skin; }
      return ui.previewSkin && skinList().some(k => k.id === ui.previewSkin) ? ui.previewSkin : '';
    }
    function drawPreview(canvas, skinId, cssSize) {
      const px = Math.round(cssSize * dpr());
      canvas.width = canvas.height = px;
      const decoded = skinId ? ctl.decoded(skinId) : null;
      if (!decoded) { paintOriginal(canvas); return { missing: null }; }
      return ns.preview.draw(canvas, decoded, { angle: ui.pv.angle, turretFrame: ui.pv.frame, zoom: ui.pv.zoom * px / 300, colours: sample(), guides: ui.pv.guides });
    }
    function repaintStage() {
      const stage = shadow.querySelector('.stage canvas'), big = shadow.querySelector('.zoom canvas');
      const id = ui.zoomSkin !== undefined && ui.zoom ? ui.zoomSkin : previewTarget();
      if (stage) drawPreview(stage, previewTarget(), 144);
      if (big) drawPreview(big, id, 240);
    }
    function spinLoop() {
      cancelAnimationFrame(ui.pv.raf);
      if (!ui.pv.spin || settings().panel.collapsed || (!ui.zoom && !(ui.adv && ui.pvtools))) { ui.pv.spin = false; return; }
      ui.pv.angle = (ui.pv.angle + 0.02) % (Math.PI * 2);
      repaintStage();
      ui.pv.raf = requestAnimationFrame(spinLoop);
    }

    /* ---------------- small components ---------------- */
    function switchButton() {
      const on = settings().enabled;
      return h('button', { class: 'sw', role: 'switch', 'aria-checked': String(on), 'data-fk': 'switch', 'aria-label': 'Skins on or off (off shows the original graphics)', onclick: () => { ctl.setEnabled(!settings().enabled); render(); } },
        h('span', { class: 'trk' }, h('span', { class: 'thb' })), h('span', { class: 'lbl', text: on ? 'On' : 'Off' }));
    }
    /** Radio group with roving tabindex; arrows move and select. */
    function radios(label, items, value, onPick, cls, fk) {
      const group = h('div', { class: cls || 'seg', role: 'radiogroup', 'aria-label': label });
      items.forEach(([v, text, disabled]) => {
        const button = h('button', { role: 'radio', 'aria-checked': String(v === value), tabindex: v === value ? 0 : -1, 'data-fk': `${fk}-${v}`, disabled: disabled || null, text, onclick: () => onPick(v) });
        group.append(button);
      });
      group.addEventListener('keydown', event => {
        const enabled = items.filter(i => !i[2]).map(i => i[0]);
        let i = enabled.indexOf(value);
        if (['ArrowRight', 'ArrowDown'].includes(event.key)) i = (i + 1) % enabled.length;
        else if (['ArrowLeft', 'ArrowUp'].includes(event.key)) i = (i - 1 + enabled.length) % enabled.length;
        else if (event.key === 'Home') i = 0; else if (event.key === 'End') i = enabled.length - 1; else return;
        event.preventDefault(); event.stopPropagation();
        onPick(enabled[i]);
      });
      return group;
    }

    /** Dropdown with an optional search box. Options: [{ value, text, sub, colours, skin, disabled }]. */
    function combo({ key, label, options, selected, searchable, placeholder, onPick, thumbs }) {
      const wrap = h('div', { class: 'combo', 'data-key': key });
      const open = ui.open === key;
      const sel = options.find(o => o.value === selected) || { text: placeholder || '', sub: placeholder ? `${options.length} to choose from` : '' };
      const rows = () => options.filter(o => !ui.query || o.text.toLowerCase().includes(ui.query.toLowerCase()));
      const trig = h('button', { class: 'trig', role: 'combobox', 'aria-haspopup': 'listbox', 'aria-expanded': String(open), 'aria-controls': `${key}-list`, 'aria-label': `${label}: ${sel.text}`, 'data-fk': `${key}-trig` },
        sel.colours !== undefined ? dots(sel.colours) : null, h('span', { class: 't' }, sel.text, sel.sub ? h('small', { text: sel.sub }) : null), icon('chev'));
      wrap.append(trig);
      const pick = value => { ui.open = null; ui.query = ''; onPick(value); ui.focusKey = `${key}-trig`; render(); };
      let input = null;
      if (open) {
        const list = h('div', { class: 'list' });
        if (searchable) {
          input = h('input', { type: 'search', placeholder: 'Search players', 'aria-label': 'Search players', 'data-fk': `${key}-search`, role: 'combobox', 'aria-expanded': 'true', 'aria-controls': `${key}-list`, 'aria-autocomplete': 'list' });
          input.value = ui.query;
          list.append(h('div', { class: 'find' }, icon('search'), input));
        }
        const ul = h('ul', { class: 'opts', role: 'listbox', id: `${key}-list`, 'aria-label': label });
        list.append(ul);
        const fill = () => {
          ul.replaceChildren();
          const shown = rows();
          if (ui.active >= shown.length) ui.active = Math.max(0, shown.length - 1);
          shown.forEach((o, i) => {
            const li = h('li', { class: `opt${i === ui.active ? ' act' : ''}`, role: 'option', id: `${key}-o${i}`, 'aria-selected': String(o.value === selected), 'aria-disabled': o.disabled ? 'true' : null },
              thumbs ? thumb(o.skin === undefined ? o.value : o.skin, 30) : (o.colours !== undefined ? dots(o.colours) : null),
              h('span', { class: 't' }, o.text, o.sub ? h('small', { text: o.sub }) : null), icon('check'));
            li.addEventListener('pointerdown', e => e.preventDefault());
            li.addEventListener('click', () => { if (!o.disabled) pick(o.value); });
            ul.append(li);
          });
          if (!shown.length) ul.append(h('li', { class: 'none', text: ui.query ? `No player matches “${ui.query}”.` : 'Nothing here yet.' }));
          const focusEl = input || trig;
          focusEl.setAttribute('aria-activedescendant', shown.length ? `${key}-o${ui.active}` : '');
        };
        fill();
        const move = to => {
          const shown = rows(); if (!shown.length) return;
          ui.active = (to + shown.length) % shown.length;
          if (shown[ui.active].disabled) { ui.active = (ui.active + (to >= 0 ? 1 : -1) + shown.length) % shown.length; }
          [...ul.children].forEach((li, i) => li.classList.toggle('act', i === ui.active));
          (input || trig).setAttribute('aria-activedescendant', `${key}-o${ui.active}`);
          const li = ul.children[ui.active]; if (li && li.scrollIntoView) li.scrollIntoView({ block: 'nearest' });
        };
        const onKey = event => {
          const k = event.key;
          if (k === 'ArrowDown') { event.preventDefault(); move(ui.active + 1); }
          else if (k === 'ArrowUp') { event.preventDefault(); move(ui.active - 1); }
          else if (k === 'Home' && !input) { event.preventDefault(); move(0); }
          else if (k === 'End' && !input) { event.preventDefault(); move(rows().length - 1); }
          else if (k === 'Enter' || (k === ' ' && !input)) { event.preventDefault(); const o = rows()[ui.active]; if (o && !o.disabled) pick(o.value); }
          else if (k === 'Escape') { event.preventDefault(); event.stopPropagation(); ui.open = null; ui.query = ''; ui.focusKey = `${key}-trig`; render(); }
          else if (k === 'Tab') { ui.open = null; ui.query = ''; render(); }
          else if (!input && k.length === 1 && !event.ctrlKey && !event.metaKey) {      // type-ahead
            const now = Date.now(); ui.typed = now - ui.typedAt > 700 ? k : ui.typed + k; ui.typedAt = now;
            const at = rows().findIndex(o => o.text.toLowerCase().startsWith(ui.typed.toLowerCase())); if (at >= 0) move(at);
          }
        };
        (input || trig).addEventListener('keydown', onKey);
        if (input) input.addEventListener('input', () => { ui.query = input.value; ui.active = 0; fill(); placeLists(); });
        wrap.append(list);
      } else {
        trig.addEventListener('keydown', event => {
          if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(event.key)) { event.preventDefault(); openCombo(key, options, selected); }
        });
      }
      trig.addEventListener('click', () => { if (ui.open === key) { ui.open = null; ui.query = ''; ui.focusKey = `${key}-trig`; render(); } else openCombo(key, options, selected); });
      return wrap;
    }
    function openCombo(key, options, selected) {
      ui.open = key; ui.query = ''; ui.active = Math.max(0, options.findIndex(o => o.value === selected));
      ui.focusKey = searchableKeys.has(key) ? `${key}-search` : `${key}-trig`;
      render();
    }
    const searchableKeys = new Set(['players']);
    /** Popup lists are fixed-position (the scroll area cannot clip them) and open below the field, or above it when there is no room. */
    function placeLists() {
      for (const wrap of shadow.querySelectorAll('.combo')) {
        const list = wrap.querySelector('.list'); if (!list) continue;
        const t = wrap.querySelector('.trig').getBoundingClientRect();
        list.style.left = `${t.left}px`; list.style.width = `${t.width}px`;
        const ul = list.querySelector('.opts'), find = list.querySelector('.find');
        const natural = Math.min(216, (ul ? ul.scrollHeight : 0) + (find ? find.offsetHeight : 0) + 2);
        const below = innerHeight - t.bottom - 8, above = t.top - 8;
        const useBelow = below >= natural || below >= above;
        const height = Math.min(natural, useBelow ? below : above);
        list.style.maxHeight = `${Math.max(80, height)}px`;
        list.style.top = `${useBelow ? t.bottom + 3 : Math.max(8, t.top - 3 - height)}px`;
        if (ul) ul.style.maxHeight = `${Math.max(40, height - (find ? find.offsetHeight : 0) - 2)}px`;
      }
    }

    /* ---------------- pages ---------------- */
    function noteLine() {
      const info = ctl.info();
      if (ui.flash) return h('div', { class: 'noteline' }, icon('check'), ui.flash);
      if (info.error) return h('div', { class: 'noteline bad' }, 'Skin Tools paused itself after a problem. Turn Skins off and on to retry.');
      if (!skinList().length) return h('div', { class: 'noteline muted', text: 'No skins yet. Use “Manage skins” to add one.' });
      if (!info.hooked) return h('div', { class: 'noteline muted', text: 'Waiting for the game to start…' });
      const v = currentSkin();
      if (ui.target === 'player' && !ui.player) return h('div', { class: 'noteline muted', text: 'Choose a player to give them their own skin.' });
      return h('div', { class: 'noteline muted', text: v === '' ? `Pick a skin to put it on ${ui.target === 'all' ? 'everyone' : 'your tank'}.` : v === INHERIT ? 'This player follows the default skin.' : v === MIXED ? 'Your tank and the others wear different skins.' : '' });
    }

    function mainBody() {
      const wrap = h('div', { class: 'live', style: 'display:flex;flex-direction:column;gap:9px' });
      wrap.append(h('div', {}, h('span', { class: 'lab', id: 'lab-who', text: 'Who wears it' }),
        radios('Who wears the skin', [['me', 'My tank'], ['all', 'Everyone'], ['player', 'A player']], ui.target, v => { ui.target = v; ui.open = null; ui.confirm = null; ui.flash = ''; ui.focusKey = `who-${v}`; render(); }, 'seg', 'who')));
      if (ui.target === 'player') {
        const rows = playerRows();
        if (ui.player && rows.some(r => r.id === ui.player)) {
          const p = rows.find(r => r.id === ui.player);
          wrap.append(h('div', { class: 'chip' }, dots(p.colours), h('span', { class: 't', text: p.name }), p.own ? h('span', { class: 'you', text: 'you' }) : null,
            h('button', { class: 'ib dark', style: 'width:26px;height:26px', 'aria-label': `Choose another player (now ${p.name})`, 'data-fk': 'player-clear', onclick: () => { ui.player = null; ui.focusKey = 'players-trig'; render(); } }, icon('x'))));
        } else {
          ui.player = null;
          wrap.append(combo({ key: 'players', label: 'Player', searchable: true, placeholder: 'Choose a player…', selected: '', options: rows.map(r => ({ value: r.id, text: r.name, sub: playerSub(r), colours: r.colours || null })), onPick: id => { ui.player = id; } }));
        }
      }
      if (ui.target !== 'player' || ui.player) {
        const value = currentSkin();
        const options = [{ value: '', text: 'Original look', sub: 'the game’s own tank', skin: '' }, ...skinList().map(k => ({ value: k.id, text: k.name, sub: [k.author, k.version && `v${k.version}`].filter(Boolean).join(' · ') || `${k.frames.length} images` }))];
        if (ui.target === 'player') options.unshift({ value: INHERIT, text: 'Same as everyone else', sub: 'the default', skin: '' });
        if (value === MIXED) options.unshift({ value: MIXED, text: 'Different skins', sub: 'pick one to give everyone the same', disabled: true, skin: '' });
        const shown = value === INHERIT ? previewSkinForInherit() : value === MIXED ? '' : value;
        const name = value === '' ? 'the original look' : value === INHERIT ? 'the default skin' : value === MIXED ? 'the original look' : skinName(value);
        const tile = h('button', { class: 'tile', 'aria-label': `Enlarge the preview of ${name}`, 'data-fk': 'tile', onclick: () => { ui.zoom = true; ui.zoomSkin = shown; ui.zoomFrom = 'tile'; ui.focusKey = 'zoom-close'; render(); } }, thumb(shown, 56), h('span', { class: 'mag' }, icon('zoom')));
        wrap.append(h('div', { class: 'skinrow' }, tile,
          h('div', { style: 'flex:1;min-width:0' }, h('span', { class: 'lab', text: 'Skin' }), combo({ key: 'skins', label: `Skin for ${WHO[ui.target] === 'this player' ? (playerRows().find(r => r.id === ui.player) || { name: 'this player' }).name : WHO[ui.target]}`, options, selected: value, thumbs: true, onPick: setSkin }))));
      }
      wrap.append(noteLine());
      return wrap;
    }
    function previewSkinForInherit() { const d = settings().defaults.others; return d && d.skin ? d.skin : ''; }

    function advancedSection() {
      const a = h('div', { class: 'adv', id: 'adv' });
      const value = currentSkin();
      const hasTarget = ui.target !== 'player' || ui.player;
      if (hasTarget) {
        const recolor = currentRecolor();
        const fallback = ui.target === 'player' ? (playerRows().find(r => r.id === ui.player) || {}).colours : ownColours();
        const colours = h('div', { class: 'colours' });
        for (const role of ['base', 'turret', 'tread']) {
          const set = recolor && recolor[role] != null;
          const input = h('input', { type: 'color', class: set ? '' : 'unset', value: hex(set ? recolor[role] : (fallback && fallback[role] != null ? fallback[role] : 0x808080)), 'aria-label': `${ROLE_LABEL[role]} colour` });
          input.addEventListener('change', () => { writeTarget({ recolor: { ...(currentRecolor() || {}), [role]: parseHex(input.value) } }); render(); });
          const clear = set ? h('button', { class: 'x', 'aria-label': `Clear ${ROLE_LABEL[role]} colour`, title: `Back to the ${ROLE_LABEL[role].toLowerCase()} colour the game uses`, text: '×', onclick: () => { const next = { ...currentRecolor() }; delete next[role]; writeTarget({ recolor: Object.keys(next).length ? next : null }); render(); } }) : null;
          colours.append(h('div', { class: 'c' }, ROLE_LABEL[role], h('span', { class: 'r' }, input, clear)));
        }
        a.append(h('div', {}, h('h4', { text: `Recolour ${ui.target === 'me' ? 'my tank' : ui.target === 'all' ? 'everyone' : 'this player'}` }), colours));
      }
      const real = value && value !== MIXED && value !== INHERIT ? skinList().find(k => k.id === value) : null;
      if (real) {
        const policy = real.tint.base === 'player' && real.tint.tread === 'player' && real.tint.turret === 'player' ? 'player' : real.tint.base === 'none' && real.tint.tread === 'none' && real.tint.turret === 'none' ? 'none' : 'mixed';
        a.append(h('div', {}, h('h4', { text: 'Colours of this skin' }),
          radios(`Colour mode of ${real.name}`, [['none', 'As painted'], ['player', 'Player’s colour'], ...(policy === 'mixed' ? [['mixed', 'Mixed', true]] : [])], policy, v => { ctl.setSkinTint(real.id, v); ui.focusKey = `mode-${v}`; render(); }, 'mini-seg', 'mode')));
      }
      // preview tools
      const tools = h('div', {}, h('button', { class: 'fold', 'aria-expanded': String(ui.pvtools), 'aria-controls': 'pvtools', 'data-fk': 'pvfold', onclick: () => { ui.pvtools = !ui.pvtools; ui.focusKey = 'pvfold'; render(); } }, 'Preview tools', icon('chev')));
      if (ui.pvtools) tools.append(previewTools());
      a.append(tools);
      if (ui.target === 'player' && ui.player && settings().players[ui.player]) {
        a.append(h('button', { class: 'btn glass', 'data-fk': 'forget', text: 'Forget this player’s settings', title: 'Remove this player’s skin and colours', onclick: () => { ctl.update(x => { delete x.players[ui.player]; }); say('That player’s settings are forgotten.'); } }));
      }
      if (ui.confirm === 'clear') {
        a.append(h('div', { class: 'confirm', role: 'alertdialog', 'aria-label': 'Clear every assignment' }, h('span', { class: 'grow', text: 'Remove every skin and recolour assignment? Installed skins are kept.' }),
          h('button', { class: 'btn warn sm', 'data-fk': 'confirm-yes', text: 'Clear', onclick: () => { ctl.clearAssignments(); ui.confirm = null; ui.player = null; say('Every assignment was cleared.'); } }),
          h('button', { class: 'btn glass sm', 'data-fk': 'confirm-no', text: 'Keep', onclick: () => { ui.confirm = null; ui.focusKey = 'clear'; render(); } })));
      } else {
        a.append(h('div', { class: 'danger-row' },
          h('button', { class: 'btn glass grow', 'data-fk': 'reset', text: 'Show originals', title: 'Show the game’s own graphics right now (skins stay installed; switch Skins back on to use them)', onclick: () => { ctl.setEnabled(false); render(); } }),
          h('button', { class: 'btn glass grow', 'data-fk': 'clear', text: 'Clear assignments', onclick: () => { ui.confirm = 'clear'; ui.focusKey = 'confirm-yes'; render(); } })));
      }
      if (!ctl.persistent()) a.append(h('div', { class: 'noteline bad', text: 'Storage is blocked in this browser: nothing will be saved.' }));
      return a;
    }

    function previewTools() {
      const skins = skinList();
      const target = previewTarget();
      const meta = skins.find(k => k.id === target);
      const box = h('div', { class: 'pvbox', id: 'pvtools' });
      if (!skins.length) return h('div', { class: 'noteline muted', id: 'pvtools', style: 'margin-top:6px', text: 'Install a skin to preview it here.' });
      box.append(h('div', { class: 'stage' }, h('canvas', { role: 'img', 'aria-label': `Preview of ${meta ? meta.name : 'the original look'}` })));
      const form = h('div', { class: 'form' });
      if (!meta || previewTarget() !== currentSkin()) {                      // nothing chosen yet: let the user look at any installed skin
        const pick = h('select', { 'aria-label': 'Skin to preview' }, skins.map(k => h('option', { value: k.id, text: k.name })));
        pick.value = meta ? meta.id : skins[0].id;
        if (!meta) ui.previewSkin = skins[0].id;
        pick.addEventListener('change', () => { ui.previewSkin = pick.value; render(); });
        form.append(h('span', { text: 'Skin' }), pick);
      }
      const frames = Array.from({ length: 17 }, (_, i) => `turret${i}`).filter(n => !meta || meta.frames.includes(n));
      if (!frames.includes(ui.pv.frame)) ui.pv.frame = 'turret0';
      const frame = h('select', { 'aria-label': 'Turret frame' }, frames.map(n => h('option', { value: n, text: n === 'turret0' ? 'Idle (turret0)' : n })));
      frame.value = ui.pv.frame; frame.addEventListener('change', () => { ui.pv.frame = frame.value; repaintStage(); });
      form.append(h('span', { text: 'Turret' }), frame);
      const angle = h('input', { type: 'range', min: 0, max: 360, step: 1, 'aria-label': 'Rotation' });
      angle.value = Math.round((ui.pv.angle * 180 / Math.PI) % 360);
      const spin = h('button', { class: 'btn glass sm', 'aria-pressed': String(ui.pv.spin), text: ui.pv.spin ? 'Stop' : 'Spin' });
      angle.addEventListener('input', () => { ui.pv.angle = angle.value * Math.PI / 180; ui.pv.spin = false; spin.textContent = 'Spin'; spin.setAttribute('aria-pressed', 'false'); repaintStage(); });
      spin.addEventListener('click', () => { ui.pv.spin = !ui.pv.spin; spin.textContent = ui.pv.spin ? 'Stop' : 'Spin'; spin.setAttribute('aria-pressed', String(ui.pv.spin)); spinLoop(); });
      form.append(h('span', { text: 'Rotate' }), h('div', { class: 'inl' }, angle, spin));
      const zoom = h('select', { 'aria-label': 'Zoom' }, [1, 2, 3].map(z => h('option', { value: z, text: `${z}×` })));
      zoom.value = String(ui.pv.zoom); zoom.addEventListener('change', () => { ui.pv.zoom = Number(zoom.value); repaintStage(); });
      const guides = h('input', { type: 'checkbox', 'data-fk': 'guides' }); guides.checked = ui.pv.guides;
      guides.addEventListener('change', () => { ui.pv.guides = guides.checked; ui.focusKey = 'guides'; render(); });
      form.append(h('span', { text: 'Zoom' }), h('div', { class: 'inl' }, zoom, h('label', { class: 'chk' }, guides, 'Hitbox guides')));
      if (meta && (meta.tint.base === 'player' || meta.tint.tread === 'player' || meta.tint.turret === 'player')) {
        const colours = h('div', { class: 'inl' });
        for (const role of ['base', 'turret', 'tread']) {
          const input = h('input', { type: 'color', value: hex(sample()[role]), 'aria-label': `Sample ${ROLE_LABEL[role]} colour` });
          input.addEventListener('input', () => { ui.sampleOverride = { ...sample(), [role]: parseHex(input.value) }; repaintStage(); });
          colours.append(input);
        }
        form.append(h('span', { text: 'Colours' }), colours);
      }
      box.append(form);
      box.append(h('div', { class: 'noteline muted', text: 'Red: hitbox · orange: barrel · green: muzzle · blue: centre.', style: ui.pv.guides ? '' : 'display:none' }));
      return box;
    }

    /* ---- manage skins ---- */
    function reportView(r) {
      if (!r) return null;
      if (r.busy) return h('div', { class: 'report', role: 'status', text: 'Reading the files…' });
      if (r.ok) {
        const notes = r.warnings || [];
        return h('div', { class: 'report ok', role: 'status' },
          h('b', { text: `Installed “${r.meta.name}”` }),
          h('div', { text: `${r.frames.length} images${r.scale > 1 ? `, ${r.scale}× art reduced to the game’s size` : ''}.` }),
          h('button', { class: 'btn sm', 'data-fk': 'use-new', text: `Put it on ${ui.target === 'all' ? 'everyone' : ui.target === 'player' ? (ui.player ? 'this player' : 'a player') : 'my tank'}`, disabled: ui.target === 'player' && !ui.player ? true : null, onclick: () => { setSkin(r.meta.id); ui.page = 'main'; render(); } }),
          notes.length ? h('details', {}, h('summary', { text: `Notes (${notes.length})` }), h('ul', {}, notes.map(t => h('li', { text: t })))) : null);
      }
      const lines = (r.errors || []).map(plain);
      return h('div', { class: 'report err', role: 'status' }, h('b', { text: 'This skin was not installed' }), h('div', { text: 'Fix these and add the files again:' }),
        h('ul', {}, lines.slice(0, 6).map(t => h('li', { text: t })), lines.length > 6 ? h('li', { text: `…and ${lines.length - 6} more.` }) : null),
        h('details', {}, h('summary', { text: 'What size should the images be?' }), h('div', { text: 'The game’s tank parts are 68×84 (body), 12×80 (treads) and 68×82 (turrets). Exactly 2× or 4× larger copies are fine; use PNG with transparency. The skin-making guide has the details.' })));
    }
    async function doImport(list) {
      if (!list || !list.length) return;
      ui.page = 'manage'; ui.report = { busy: true }; render();
      ui.report = await ctl.importFiles(list);
      if (ui.report.ok) ui.thumbs.clear();
      ui.focusKey = ui.report.ok ? 'use-new' : null;
      render();
      statusLive.textContent = ui.report.ok ? `Installed ${ui.report.meta.name}.` : 'This skin was not installed.';
    }
    files.addEventListener('change', () => { doImport(files.files); files.value = ''; });
    folder.addEventListener('change', () => { doImport(folder.files); folder.value = ''; });

    function managePage() {
      const wrap = h('div', { class: 'body', style: 'padding-bottom:10px' });
      wrap.append(h('div', { class: 'drop', 'data-drop': '' },
        h('div', { class: 'hint', text: 'Add a skin: drop its PNG files (and skin.json) anywhere here, or choose them.' }),
        h('div', { class: 'btns' }, h('button', { class: 'btn', 'data-fk': 'add-files', text: 'Add files', onclick: () => files.click() }), h('button', { class: 'btn glass', 'data-fk': 'add-folder', text: 'Add a folder', onclick: () => folder.click() }))));
      const report = reportView(ui.report); if (report) wrap.append(report);
      const skins = skinList();
      if (!skins.length) { wrap.append(h('div', { class: 'empty', text: 'No skins yet. Your own PNG files go here; nothing is bundled.' })); return wrap; }
      const who = { me: 'your tank', all: 'everyone', player: ui.player ? (playerRows().find(r => r.id === ui.player) || { name: 'the chosen player' }).name : 'the chosen player' }[ui.target];
      const needPlayer = ui.target === 'player' && !ui.player;
      wrap.append(h('p', { class: 'hintline', text: needPlayer ? 'To put a skin on a player, choose the player on the main screen first. You can still preview and remove skins here.' : `Click a skin to put it on ${who}. Click its picture to preview.` }));
      const list = h('div', { class: 'skins', role: 'list', 'aria-label': 'Installed skins' });
      const current = currentSkin();
      for (const k of skins) {
        if (ui.confirm === k.id) {
          list.append(h('div', { class: 'confirm', role: 'alertdialog', 'aria-label': `Remove ${k.name}`, style: 'border:0;border-radius:0' }, h('span', { class: 'grow', text: `Remove “${k.name}” from this browser?` }),
            h('button', { class: 'btn warn sm', 'data-fk': 'confirm-yes', text: 'Remove', onclick: async () => { ui.confirm = null; await ctl.removeSkin(k.id); ui.thumbs.clear(); say(`“${k.name}” was removed.`); } }),
            h('button', { class: 'btn glass sm', 'data-fk': 'confirm-no', text: 'Keep', onclick: () => { ui.confirm = null; ui.focusKey = `rm-${k.id}`; render(); } })));
          continue;
        }
        const worn = current === k.id;
        const canUse = !(ui.target === 'player' && !ui.player);
        list.append(h('div', { class: `row${worn ? ' is-wearing' : ''}`, role: 'listitem' },
          h('button', { class: 'pv', 'aria-label': `Preview ${k.name}`, 'data-fk': `pv-${k.id}`, onclick: () => { ui.zoom = true; ui.zoomSkin = k.id; ui.zoomFrom = `pv-${k.id}`; ui.focusKey = 'zoom-close'; render(); } }, thumb(k.id, 40)),
          h('button', { class: 'srow', 'aria-pressed': String(worn), 'data-fk': `use-${k.id}`, disabled: canUse ? null : true, 'aria-label': `${worn ? 'Wearing' : 'Use'} ${k.name}`, title: `${k.frames.length} images · ${k.scale}× art${k.author ? ` · ${k.author}` : ''}`, onclick: () => setSkin(k.id) },
            h('span', { class: 'n', text: k.name }), h('small', { text: worn ? `✓ on ${who}` : `${k.frames.length} images${k.tint.base === 'player' ? ' · keeps player colours' : ''}` })),
          h('button', { class: 'ib dark', 'aria-label': `Remove ${k.name}`, 'data-fk': `rm-${k.id}`, onclick: () => { ui.confirm = k.id; ui.focusKey = 'confirm-yes'; render(); } }, icon('trash'))));
      }
      wrap.append(list);
      return wrap;
    }

    /* ---------------- window shell ---------------- */
    function zoomPopover() {
      const id = ui.zoomSkin === undefined ? previewTarget() : ui.zoomSkin;
      const title = id ? skinName(id) : 'Original look';
      const box = h('div', { class: 'zoom', role: 'dialog', 'aria-label': `Preview of ${title}` },
        h('canvas', { role: 'img', 'aria-label': `${title}, seen from above` }),
        h('div', { class: 'cap' }, h('span', { class: 't', text: title }),
          h('button', { class: 'btn glass sm', 'aria-pressed': String(ui.pv.spin), text: ui.pv.spin ? 'Stop' : 'Spin', 'data-fk': 'zoom-spin', onclick: () => { ui.pv.spin = !ui.pv.spin; ui.focusKey = 'zoom-spin'; render(); spinLoop(); } }),
          h('button', { class: 'ib dark', 'aria-label': 'Close the preview', 'data-fk': 'zoom-close', onclick: closeZoom }, icon('x'))));
      return box;
    }
    function closeZoom() { ui.zoom = false; ui.zoomSkin = undefined; ui.pv.spin = false; ui.focusKey = ui.zoomFrom || null; render(); }

    function render() {
      const keep = shadow.activeElement && shadow.activeElement.getAttribute ? shadow.activeElement.getAttribute('data-fk') : null;
      const wantFocus = ui.focusKey !== undefined ? ui.focusKey : keep;
      ui.focusKey = undefined;
      const s = settings();
      const collapsed = s.panel.collapsed;
      win.className = `win${collapsed ? ' mini' : ''}${s.enabled ? '' : ' off'}`;
      if (collapsed) {
        win.replaceChildren(h('div', { class: 'head' },
          h('button', { class: 'opener', 'aria-label': 'Open Skin Tools', 'aria-expanded': 'false', 'data-fk': 'opener', onclick: () => setCollapsed(false) }, icon('tank'), h('span', { class: 'title', text: 'Skins' })),
          switchButton()));
      } else {
        const manage = ui.page === 'manage';
        const head = h('div', { class: 'head' },
          manage ? h('button', { class: 'ib', 'aria-label': 'Back to skin selection', 'data-fk': 'back', onclick: () => { ui.page = 'main'; ui.confirm = null; ui.focusKey = 'manage'; render(); } }, icon('back')) : icon('tank'),
          h('span', { class: 'title', text: manage ? 'Manage skins' : 'Skin Tools' }),
          manage ? null : switchButton(),
          h('button', { class: 'ib', 'aria-label': 'Collapse the panel', 'aria-expanded': 'true', 'data-fk': 'collapse', onclick: () => setCollapsed(true) }, icon('min')));
        const scroll = h('div', { class: 'scroll' });
        if (!manage) {
          if (!s.enabled) scroll.append(h('div', { class: 'offnote' }, icon('info'), 'Skins are off: the game shows its own graphics.'));
          scroll.append(h('div', { class: 'body' }, mainBody()));
          scroll.append(h('div', { class: 'foot' },
            h('button', { class: `btn ${skinList().length ? 'glass' : ''} grow`.replace('  ', ' '), 'data-fk': 'manage', onclick: () => { ui.page = 'manage'; ui.open = null; ui.focusKey = 'add-files'; render(); } }, icon('plus'), 'Manage skins'),
            h('button', { class: 'btn glass grow', 'aria-expanded': String(ui.adv), 'aria-controls': 'adv', 'data-fk': 'adv', onclick: () => { ui.adv = !ui.adv; ui.focusKey = 'adv'; render(); } }, 'Advanced', icon('chev'))));
          if (ui.adv) scroll.append(advancedSection());
        } else scroll.append(managePage());
        win.replaceChildren(head, scroll);
        if (ui.zoom) win.append(zoomPopover());
      }
      place();
      placeLists();
      if (ui.zoom && !collapsed) { win.querySelector('.zoom').classList.toggle('below', win.getBoundingClientRect().top < 300); }
      repaintStage();
      ui.sig = signature();
      if (wantFocus) {
        const el = [...shadow.querySelectorAll('[data-fk]')].find(e => e.getAttribute('data-fk') === wantFocus);
        if (el) { el.focus({ preventScroll: true }); if (el.tagName === 'INPUT' && el.type === 'search') el.setSelectionRange(el.value.length, el.value.length); }
      }
      const scrollBody = shadow.querySelector('.scroll'); if (scrollBody && !scrollBody.__tt) { scrollBody.__tt = 1; }
    }
    shadow.addEventListener('scroll', event => { if (ui.open && !(event.target.closest && event.target.closest('.list'))) { ui.open = null; render(); } }, true);

    function place() {
      const p = settings().panel;
      const rect = win.getBoundingClientRect();
      const width = rect.width || 272, height = rect.height || 40;
      let x = p.x, y = p.y;
      if (x == null || y == null) { x = window.innerWidth - width - 12; y = window.innerHeight - height - 12; }
      x = Math.min(Math.max(8, x), Math.max(8, window.innerWidth - width - 8));
      y = Math.min(Math.max(8, y), Math.max(8, window.innerHeight - height - 8));
      win.style.left = `${x}px`; win.style.top = `${y}px`;
    }
    let poll = 0;
    function setCollapsed(value) {
      ctl.update(s => { s.panel.collapsed = value; }, { quiet: true });
      ui.open = null; ui.zoom = false; ui.zoomSkin = undefined; ui.pv.spin = false;
      ui.focusKey = value ? 'opener' : 'collapse';
      render(); startPoll();
    }
    // while the window is open, refresh when the players or skins change (once a second, only when something changed)
    const signature = () => JSON.stringify([tanks().map(t => [t.id, t.name, t.own, t.colours && t.colours.base, t.colours && t.colours.turret]), settings().players, settings().defaults, skinList().map(k => [k.id, k.tint]), ctl.info().hooked, ctl.info().error, settings().enabled]);
    function startPoll() {
      clearInterval(poll); poll = 0;
      if (settings().panel.collapsed) return;
      poll = setInterval(() => {
        if (document.hidden || signature() === ui.sig) return;
        const typing = shadow.activeElement && shadow.activeElement.matches && shadow.activeElement.matches('input[type=search],input[type=color],select,input[type=range]');
        if (ui.open || typing) return;
        render();
      }, 1000);
    }

    /* ---------------- drag, outside clicks, keyboard, drop ---------------- */
    win.addEventListener('pointerdown', event => {
      const head = event.target.closest && event.target.closest('.head');
      if (!head || event.target.closest('button.ib, .sw, input')) return;
      const rect = win.getBoundingClientRect();
      ui.drag = { dx: event.clientX - rect.left, dy: event.clientY - rect.top, x0: event.clientX, y0: event.clientY, moved: false, head, id: event.pointerId };
    });
    win.addEventListener('pointermove', event => {
      const d = ui.drag; if (!d) return;
      if (!d.moved && Math.hypot(event.clientX - d.x0, event.clientY - d.y0) < 4) return;
      if (!d.moved) { d.moved = true; try { d.head.setPointerCapture(d.id); } catch { /* ignore */ } }
      ctl.update(s => { s.panel.x = event.clientX - d.dx; s.panel.y = event.clientY - d.dy; }, { quiet: true });
      place(); placeLists();
    });
    const endDrag = () => { ui.drag = null; };
    win.addEventListener('pointerup', endDrag); win.addEventListener('pointercancel', endDrag);
    window.addEventListener('resize', () => { place(); placeLists(); });
    if (typeof ResizeObserver === 'function') new ResizeObserver(() => place()).observe(win);
    document.addEventListener('pointerdown', event => {
      if ((!ui.open && !ui.zoom) || event.composedPath().includes(win)) return;
      if (ui.open) ui.open = null;
      if (ui.zoom) { ui.zoom = false; ui.zoomSkin = undefined; ui.pv.spin = false; }
      render();
    }, true);
    win.addEventListener('keydown', event => {
      if (event.key !== 'Escape') return;
      if (ui.open) return;                       // the list handles its own Escape
      if (ui.zoom) { event.stopPropagation(); closeZoom(); return; }
      if (ui.confirm) { event.stopPropagation(); ui.confirm = null; render(); return; }
      if (ui.page === 'manage') { event.stopPropagation(); ui.page = 'main'; ui.focusKey = 'manage'; render(); }
    });
    const hasFiles = event => event.dataTransfer && [...(event.dataTransfer.types || [])].includes('Files');
    win.addEventListener('dragenter', event => { if (hasFiles(event)) { event.preventDefault(); win.classList.add('dropping'); } });
    win.addEventListener('dragover', event => { if (hasFiles(event)) { event.preventDefault(); win.classList.add('dropping'); } });
    win.addEventListener('dragleave', event => { if (!win.contains(event.relatedTarget)) win.classList.remove('dropping'); });
    win.addEventListener('drop', event => { if (!hasFiles(event)) return; event.preventDefault(); win.classList.remove('dropping'); doImport(event.dataTransfer.files); });

    /* ---------------- start ---------------- */
    (document.documentElement || document.body).append(host);
    // keep the panel mounted if the page replaces its body
    const remount = () => { if (!host.isConnected) (document.documentElement || document.body).append(host); };
    new MutationObserver(remount).observe(document, { childList: true });
    if (document.documentElement) new MutationObserver(remount).observe(document.documentElement, { childList: true });
    if (ctl.subscribe) ctl.subscribe(() => render());
    render();
    startPoll();
    return { host, shadow, render, setCollapsed, place };
  }

  ns.panel = { mount, plain };
})(typeof globalThis !== 'undefined' ? globalThis : this);
