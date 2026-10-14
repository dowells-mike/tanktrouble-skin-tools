// Builds the release twice into separate folders and compares every file and both ZIPs byte for byte (SHA-256).
//   node build/reproducible.mjs
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const hashes = dir => {
  const out = {};
  const walk = d => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else out[path.relative(dir, p).split(path.sep).join('/')] = crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex'); } };
  walk(dir);
  return out;
};
const runs = [];
for (let i = 0; i < 2; i++) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `skin-tools-build-${i}-`));
  execFileSync(process.execPath, [path.join(root, 'build', 'build.mjs'), '--out', dir], { stdio: 'inherit' });
  runs.push({ dir, hashes: hashes(dir) });
}
const [a, b] = runs.map(r => r.hashes);
const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])].sort();
const differ = keys.filter(k => a[k] !== b[k]);
for (const r of runs) fs.rmSync(r.dir, { recursive: true, force: true });
const zips = keys.filter(k => k.endsWith('.zip'));
for (const z of zips) console.log(`${z}  ${a[z]}`);
if (differ.length) { console.error(`NOT reproducible: ${differ.join(', ')}`); process.exit(1); }
console.log(`reproducible: ${keys.length} files, all identical across two builds`);
