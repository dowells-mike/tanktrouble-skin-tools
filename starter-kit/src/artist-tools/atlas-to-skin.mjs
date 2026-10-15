#!/usr/bin/env node
// Turns a "texture atlas" (one PNG sheet + a JSON file listing where each picture sits on it) into a Skin Tools skin folder:
// one correctly sized PNG per picture plus a skin.json that the extension accepts. For artists who already have tank pictures
// packed in the TexturePacker / Phaser / PixiJS format. Needs Node.js 20 or newer. Works offline and installs nothing.
//
//   node atlas-to-skin.mjs <atlas.json> [<more.json> ...] --out <folder> --id <skin-id> [options]
//
//   --out <folder>      where to write the skin (must be new or empty unless you pass --force)
//   --id <skin-id>      lower-case letters, digits and hyphens, for example ember-camo   (required)
//   --name "Ember Camo" --author "You" --version 1.0.0     shown in the Skin Tools panel
//   --tint none|player  none = show the pictures exactly as drawn (default); player = multiply by each player's colour
//   --scale auto|1|2|4  output size relative to the game's own (1 = 68x84 body). auto = the atlas's most common size, rounded down
//   --upscale smooth|sharp|off   enlarge pictures smaller than the output size. Opt-in: without it such a sheet is refused (off, the default)
//   --image <file.png>  the PNG for the single JSON given (default: same name as the JSON, or the JSON's "meta.image")
//   --preview           also write <folder>-preview.png, a contact sheet to look at before importing
//   --partial           write what can be written even if Skin Tools would not accept it yet
//   --force             write into a folder that already has files
//
// Rights: only convert pictures you made or have permission to use, and do not share artwork that belongs to someone else.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { decodePng } = require('./lib/png.js');
const { convertAtlases, contactSheet } = require('./lib/atlas.js');

const USAGE = 'usage: node atlas-to-skin.mjs <atlas.json> [more.json ...] --out <folder> --id <skin-id> [--name ".."] [--author ".."] [--tint none|player] [--scale auto|1|2|4] [--upscale smooth|sharp] [--preview] [--partial] [--force]';
const VALUE_OPTIONS = ['--out', '--id', '--name', '--author', '--version', '--tint', '--scale', '--upscale', '--image'];
const FLAG_OPTIONS = ['--preview', '--partial', '--force', '--help'];

function parseArgs(argv) {
  const opts = {}, inputs = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (VALUE_OPTIONS.includes(a)) { if (i + 1 >= argv.length) throw new Error(`${a} needs a value`); opts[a.slice(2)] = argv[++i]; }
    else if (FLAG_OPTIONS.includes(a)) opts[a.slice(2)] = true;
    else if (a.startsWith('--')) throw new Error(`unknown option ${a}`);
    else inputs.push(a);
  }
  return { opts, inputs };
}

try {
  const { opts, inputs } = parseArgs(process.argv.slice(2));
  if (opts.help || !inputs.length) { console.log(USAGE); process.exit(opts.help ? 0 : 2); }
  if (!opts.out) throw new Error('--out <folder> is needed');
  if (opts.tint && !['none', 'player'].includes(opts.tint)) throw new Error('--tint must be none or player');
  if (opts.upscale && !['smooth', 'sharp', 'off'].includes(opts.upscale)) throw new Error('--upscale must be smooth, sharp or off');
  if (opts.image && inputs.length !== 1) throw new Error('--image only works with a single JSON file');

  const loaded = inputs.map(jsonPath => {
    const text = fs.readFileSync(jsonPath, 'utf8');
    let image = opts.image;
    if (!image) {
      let meta = null;
      try { meta = JSON.parse(text).meta; } catch { /* reported by the converter */ }
      const sibling = jsonPath.replace(/\.json$/i, '.png');
      const named = meta && typeof meta.image === 'string' ? path.join(path.dirname(jsonPath), meta.image) : null;
      image = fs.existsSync(sibling) ? sibling : named && fs.existsSync(named) ? named : null;
    }
    if (!image) throw new Error(`cannot find the PNG for ${jsonPath}: name it like the JSON (${path.basename(jsonPath).replace(/\.json$/i, '.png')}) or pass --image`);
    return { label: path.basename(jsonPath), json: text, image: decodePng(fs.readFileSync(image)), imagePath: image };
  });

  const result = convertAtlases(loaded, {
    scale: opts.scale ? (opts.scale === 'auto' ? 'auto' : Number(opts.scale)) : 'auto', upscale: opts.upscale, id: opts.id, name: opts.name, author: opts.author, version: opts.version,
    tint: opts.tint, partial: opts.partial
  });

  const lines = [];
  lines.push(`Atlas to Skin Tools skin: ${inputs.map(p => path.basename(p)).join(', ')}`);
  lines.push(`Output scale: ${result.scale ? `${result.scale}x (body ${68 * result.scale}x${84 * result.scale})` : 'not decided'}`);
  lines.push('');
  lines.push(`${'picture'.padEnd(13)}${'in the atlas'.padEnd(14)}${'size seen'.padEnd(12)}${'x game size'.padEnd(13)}what was done`);
  for (const f of result.frames) lines.push(`${f.name.padEnd(13)}${(`${f.rect.w}x${f.rect.h}`).padEnd(14)}${f.canvas.padEnd(12)}${String(f.ratio).padEnd(13)}${f.steps.join('; ')}`);
  if (result.ignored.length) lines.push('', `Ignored ${result.ignored.length} picture(s) that are not tank frames: ${result.ignored.slice(0, 12).join(', ')}${result.ignored.length > 12 ? ', ...' : ''}`);
  if (result.warnings.length) lines.push('', 'Warnings:', ...result.warnings.map(w => `  - ${w}`));
  if (result.errors.length) lines.push('', 'Problems:', ...result.errors.map(e => `  - ${e}`));
  console.log(lines.join('\n'));

  if (!result.ok) { console.error(`\nNothing was written.${result.files.length || result.frames.length ? ' Fix the problems above (or use --partial to write what exists).' : ''}`); process.exit(1); }
  const out = path.resolve(opts.out);
  if (fs.existsSync(out) && fs.readdirSync(out).length && !opts.force) throw new Error(`${out} already has files; choose a new folder or pass --force`);
  fs.mkdirSync(out, { recursive: true });
  for (const f of result.files) fs.writeFileSync(path.join(out, f.name), f.png);
  fs.writeFileSync(path.join(out, 'skin.json'), JSON.stringify(result.skinJson, null, 2) + '\n');
  fs.writeFileSync(path.join(out, 'CONVERSION-REPORT.txt'), lines.join('\n') + '\n\nMade by atlas-to-skin.mjs from the TankTrouble Skin Creator Starter Kit. Only pictures you have the right to use belong in a skin you share.\n');
  if (opts.preview) fs.writeFileSync(`${out}-preview.png`, contactSheet(result.files));
  console.log(`\nWrote ${result.files.length} pictures and skin.json to ${out}${opts.preview ? ` (contact sheet: ${out}-preview.png)` : ''}.`);
  console.log('Import it: open tanktrouble.com, click Skins, Manage skins, Add a folder, and choose this folder.');
} catch (error) {
  console.error(`ERROR: ${error.message}`);
  console.error(USAGE);
  process.exit(2);
}
