// The kit's tools use the SAME frame table, PNG reader, resampler and skin checker as the extension. They are copied (not duplicated in git)
// from extension/src/ into starter-kit/src/artist-tools/lib/ whenever the kit is built; the copies are git-ignored.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const SHARED = ['frames.js', 'resample.js', 'png-info.js', 'skin-package.js'];
export function syncLibs() {
  const to = path.join(root, 'starter-kit', 'src', 'artist-tools', 'lib');
  for (const name of SHARED) fs.copyFileSync(path.join(root, 'extension', 'src', name), path.join(to, name));
  return SHARED.map(name => path.join(to, name));
}
