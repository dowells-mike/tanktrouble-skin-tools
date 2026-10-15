// Privacy check for the starter kit: the kit must carry the TankTrouble username "Bleed" and no real-world identifier.
// The identifiers themselves are NOT written here (this file is public). Each is stored as a salted SHA-256 of the lower-cased word plus its
// length, and every window of that length in a file is hashed and compared, so the word is found in any text, in any case, and also inside
// binary files (PSD layer names and metadata, PNG chunks, ZIP names) in plain ASCII or UTF-16.
//   import { findIdentifiers } from './privacy.mjs'
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// The ONE address allowed to appear: the project's public repository link (build/release.config.json), which the guide gives so players can find the main download.
const configFile = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'build', 'release.config.json');
const REPO_URL = fs.existsSync(configFile) ? JSON.parse(fs.readFileSync(configFile, 'utf8')).repoUrl : null;
const SALT = 'starter-kit-privacy:';
export const FORBIDDEN = [
  { len: 7, sha256: '25bb8251aa62b634d8f5100e5ece6c9a28cf2b06358f4ddca9d12c973c35f464', scope: 'all', label: 'a real name or account name' },
  { len: 5, sha256: '561095c87d6676a165232a0ad63f16f7a2d3d7d0c5bc077219fe5ff564693f53', scope: 'text', label: 'a computer account name' }
];

const hash = bytes => crypto.createHash('sha256').update(SALT).update(bytes).digest('hex');
export const hashWord = word => crypto.createHash('sha256').update(SALT + word.toLowerCase()).digest('hex');
const isLetter = b => (b >= 97 && b <= 122) || (b >= 65 && b <= 90);

/** Embedded pictures (data: URIs) are random-looking letters: a short word could appear by chance, so text scans skip them. */
const withoutDataUris = text => text.replace(/data:[a-z]+\/[a-z0-9.+-]+;base64,[A-Za-z0-9+/=]+/gi, 'data:');

/** @returns {string[]} what was found (labels and offsets, never the word itself) */
export function findIdentifiers(name, data, { text = false, extra = [] } = {}) {
  let bytes = Buffer.isBuffer(data) ? data : Buffer.from(data);
  if (text) { let s = withoutDataUris(bytes.toString('utf8')); if (REPO_URL) s = s.split(REPO_URL).join(''); bytes = Buffer.from(s, 'utf8'); }
  const lower = Buffer.from(bytes);
  for (let i = 0; i < lower.length; i++) if (lower[i] >= 65 && lower[i] <= 90) lower[i] += 32;
  const found = [];
  for (const rule of [...FORBIDDEN, ...extra]) {
    if (rule.scope === 'text' && !text) continue;
    // plain ASCII/UTF-8, then UTF-16 little- and big-endian (letters separated by zero bytes), as PSD layer names and metadata use
    for (const stride of [1, 2, 3]) {
      const span = stride === 1 ? rule.len : rule.len * 2;
      for (let i = 0; i + span <= lower.length; i++) {
        const first = stride === 3 ? lower[i + 1] : lower[i];
        if (!isLetter(first) || (stride === 3 ? lower[i] !== 0 : stride === 2 && lower[i + 1] !== 0)) continue;
        let window;
        if (stride === 1) { window = lower.subarray(i, i + span); if (!window.every(isLetter)) continue; }
        else {
          const letters = Buffer.alloc(rule.len);
          let ok = true;
          for (let k = 0; k < rule.len && ok; k++) { const lo = lower[i + k * 2], hi = lower[i + k * 2 + 1]; const letter = stride === 2 ? lo : hi, zero = stride === 2 ? hi : lo; if (zero !== 0 || !isLetter(letter)) ok = false; else letters[k] = letter; }
          if (!ok) continue;
          window = letters;
        }
        if (hash(window) === rule.sha256) { found.push(`${name}: ${rule.label} at byte ${i}${stride === 1 ? '' : ' (UTF-16)'}`); break; }
      }
    }
  }
  return found;
}
