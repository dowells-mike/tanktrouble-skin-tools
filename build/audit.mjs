// Security and privacy audit of what is actually distributed: it opens the ZIP archives (not the folder they were made
// from) and inspects every entry. Also usable on the project's tracked files before the repository is made public.
//   node build/audit.mjs                 audits dist/*.zip from the last build, and the tracked files of this repository
// Personal patterns (your name, username, e-mail...) go in build/private-patterns.txt, one regular expression per line.
// That file is gitignored: the patterns are checked without ever being published.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { readZip } from './zip.mjs';
import { chunkTypes } from './png.mjs';
import { findIdentifiers } from '../starter-kit/privacy.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(here, '..');

const TEXT = /\.(js|json|html|txt|md|css|svg|mjs|cjs|py)$/i;
const GENERIC = [
  ['a Windows user folder path', /[A-Za-z]:[\\/]+(Users|Documents and Settings)[\\/]+/i],
  ['a home folder path', /\/(home|Users)\/[A-Za-z0-9._-]+\//],
  ['an e-mail address', /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/],
  ['a GitHub token', /\b(gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})/],
  ['an API key', /\b(sk-[A-Za-z0-9]{20,}|AKIA[0-9A-Z]{16}|AIza[0-9A-Za-z_-]{35}|xox[baprs]-[A-Za-z0-9-]+)/],
  ['a private key', /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
  ['a JSON web token', /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}/],
  ['a credential assignment', /\b(password|passwd|secret|api[_-]?key|access[_-]?token|client[_-]?secret|auth[_-]?token)\b\s*["']?\s*[:=]\s*["'][^"']{4,}/i],
  ['session or cookie material', /\b(PHPSESSID|sessionid|session_id|set-cookie|document\.cookie)\b/i],
  ['an IP address', /\b(?:\d{1,3}\.){3}\d{1,3}\b(?!\.)/],
  ['a reference to private development material', /tanktrouble_bot|live-build|research\/|\bharness\b|simulat(or|ion)|recorder|policy-model|planner\.js|TankGameInstances|lobby-tools|game-hook\.js|codex|anthropic|\bclaude\b/i],
  ['a source map', /sourceMappingURL|\.js\.map\b/]
];
// code that would make it a gameplay tool rather than a cosmetic one
const AUTOMATION = [
  ['synthetic keyboard or mouse input', /dispatchEvent\(\s*new\s+(Keyboard|Mouse|Pointer)Event/],
  ['game input or networking calls', /\b(InputManager|KeyboardInputManager|TTClient|ClientManager|sendInput|socket\.emit|\.emit\(\s*["']input)/],
  ['a network or code-evaluation API', /\b(fetch|XMLHttpRequest|WebSocket|EventSource|importScripts|eval)\s*\(|new\s+Function\b|navigator\.sendBeacon/],
  ['an extension API that needs permissions', /\bchrome\.(runtime|storage|tabs|webRequest|cookies|history|identity|scripting|downloads)\b/]
];
const ALLOWED_URL = /^https?:\/\/(tanktrouble\.com|github\.com|nodejs\.org|www\.w3\.org\/2000\/svg|creativecommons\.org|opensource\.org|spdx\.org|example\.(org|com))(\/|$|")/;   // example.* are reserved test domains
const ALLOWED_PNG_CHUNKS = new Set(['IHDR', 'PLTE', 'tRNS', 'IDAT', 'IEND']);
const SKIN_JSON_KEYS = new Set(['schema', 'id', 'name', 'author', 'version', 'tint', 'pixelScale', 'laser']);

function privatePatterns() {
  const file = path.join(here, 'private-patterns.txt');
  if (!fs.existsSync(file)) return [];
  return fs.readFileSync(file, 'utf8').split(/\r?\n/).map(s => s.trim()).filter(s => s && !s.startsWith('#')).map((s, i) => [`private pattern #${i + 1}`, new RegExp(s, 'i')]);
}

/** Findings for one file. `where` names it in messages; `runtime` = shipped executable code. */
export function auditFile(where, data, { runtime = false, rules = [...GENERIC, ...privatePatterns()] } = {}) {
  const out = [];
  if (where.endsWith('.png')) {
    let types;
    try { types = chunkTypes(data); } catch { return [`${where}: not a valid PNG`]; }
    const extra = types.filter(t => !ALLOWED_PNG_CHUNKS.has(t));
    if (extra.length) out.push(`${where}: PNG metadata chunks ${extra.join(', ')}`);
    return out;
  }
  if (!TEXT.test(where)) return [`${where}: unexpected file type`];
  const text = data.toString('utf8');
  for (const [label, re] of rules) { const m = re.exec(text); if (m) out.push(`${where}: ${label} (${JSON.stringify(m[0].slice(0, 40))})`); }
  for (const m of text.matchAll(/https?:\/\/[^\s"'`<>)\]]+/g)) if (!ALLOWED_URL.test(m[0].replace(/[.,;:]+$/, ''))) out.push(`${where}: link to an unexpected site ${m[0].slice(0, 60)}`);
  if (runtime) {
    for (const [label, re] of AUTOMATION) { const m = re.exec(text); if (m) out.push(`${where}: ${label} (${JSON.stringify(m[0].slice(0, 40))})`); }
    for (const m of text.matchAll(/https?:\/\/[^\s"'`<>)]+/g)) if (!/^https:\/\/tanktrouble\.com/.test(m[0])) out.push(`${where}: runtime code names a site other than tanktrouble.com`);
  }
  if (where.endsWith('skin.json')) {
    try { const j = JSON.parse(text); for (const k of Object.keys(j)) if (!SKIN_JSON_KEYS.has(k)) out.push(`${where}: unexpected key ${k}`); } catch { out.push(`${where}: invalid JSON`); }
  }
  return out;
}

function auditManifest(where, data) {
  const out = [];
  const m = JSON.parse(data.toString('utf8'));
  for (const key of ['permissions', 'optional_permissions', 'host_permissions', 'optional_host_permissions', 'background', 'web_accessible_resources', 'externally_connectable', 'content_security_policy', 'update_url', 'key', 'oauth2'])
    if (key in m) out.push(`${where}: requests "${key}"`);
  for (const cs of m.content_scripts || []) if (JSON.stringify(cs.matches) !== '["https://tanktrouble.com/*"]') out.push(`${where}: a content script runs outside https://tanktrouble.com/*`);
  if (m.manifest_version !== 3) out.push(`${where}: not Manifest V3`);
  return out;
}

/** Audits the release archive entry by entry. Returns a list of findings (empty = clean). */
export function auditRelease({ zipFile }) {
  const findings = [];
  for (const file of [zipFile]) {
    const name = path.basename(file);
    const entries = readZip(fs.readFileSync(file));
    for (const e of entries) {
      const where = `${name}:${e.path}`;
      if (/(^|\/)\.|\.map$|\.psd$|\.blend|\.svg$|\.log$|Thumbs\.db|desktop\.ini/i.test(e.path)) findings.push(`${where}: a file type that must not be shipped`);
      if (e.extra) findings.push(`${where}: carries extra ZIP metadata`);
      const runtime = /(^|\/)extension\/runtime\/|^runtime\//.test(e.path);
      findings.push(...auditFile(where, e.data, { runtime }));
      if (/(^|\/)manifest\.json$/.test(e.path)) findings.push(...auditManifest(where, e.data));
    }
  }
  return findings;
}

/** Audits the starter-kit archive: every entry name and every file for real-world identifiers, plus the usual file rules. */
export function auditKitZip(zipFile) {
  const findings = [];
  const name = path.basename(zipFile);
  const bytes = fs.readFileSync(zipFile);
  findings.push(...findIdentifiers(`${name} (archive headers)`, bytes));
  for (const e of readZip(bytes)) {
    const where = `${name}:${e.path}`;
    findings.push(...findIdentifiers(`${where} (name)`, e.path, { text: true }));
    findings.push(...findIdentifiers(where, e.data, { text: !/\.(png|psd)$/i.test(e.path) }));
    if (e.extra) findings.push(`${where}: carries extra ZIP metadata`);
    if (/\.png$/i.test(e.path)) findings.push(...auditFile(where, e.data));
  }
  return findings;
}

/** Audits a skin pack ZIP (skins/build-packs.mjs): only the skin folder's PNGs and skin.json plus three notes, no metadata, no real-world identifiers. */
export function auditSkinPackZip(zipFile) {
  const findings = [];
  const name = path.basename(zipFile);
  const bytes = fs.readFileSync(zipFile);
  findings.push(...findIdentifiers(`${name} (archive headers)`, bytes));
  for (const e of readZip(bytes)) {
    const where = `${name}:${e.path}`;
    findings.push(...findIdentifiers(`${where} (name)`, e.path, { text: true }));
    findings.push(...findIdentifiers(where, e.data, { text: !/\.png$/i.test(e.path) }));
    if (e.extra) findings.push(`${where}: carries extra ZIP metadata`);
    if (!/^[A-Za-z0-9-]+\/(skin\.json|[A-Za-z0-9]+\.png)$|^(INSTALL|CREDITS|LICENSE)\.txt$/.test(e.path)) findings.push(`${where}: not a file a player skin pack may contain`);
    if (/\.(psd|blend1?|py|mjs|js|svg)$/i.test(e.path)) findings.push(`${where}: a source or tool file in a player download`);
    findings.push(...auditFile(where, e.data));
  }
  return findings;
}

/** Audits every file git tracks in this project (what a public repository would show). */
export function auditRepository(root = projectRoot) {
  const files = execFileSync('git', ['ls-files', '-z'], { cwd: root }).toString().split('\0').filter(Boolean);
  const findings = [];
  const skip = /^(package-lock\.json|build\/audit\.mjs)$/;     // the audit names the patterns it looks for
  for (const rel of files) {
    if (skip.test(rel)) continue;
    const data = fs.readFileSync(path.join(root, rel));
    // the starter kit carries only the TankTrouble username: no real-world identifier may appear in its sources, its tests or its pictures
    if (/^(starter-kit\/|tests\/starter-kit\.)/.test(rel)) findings.push(...findIdentifiers(rel, data, { text: !/\.(png|psd)$/i.test(rel) }));
    // the skin sources (skins/) carry only the TankTrouble username too; their layered PSDs are binary, so only the identifier scan applies to them
    if (/^skins\//.test(rel)) findings.push(...findIdentifiers(rel, data, { text: !/\.(png|psd)$/i.test(rel) }));
    if (/^skins\/.*\.psd$/i.test(rel)) continue;
    if (/\.(png)$/i.test(rel)) { findings.push(...auditFile(rel, data)); continue; }
    const plain = /(^|\/)(LICENSE|\.gitignore|\.gitattributes)$/.test(rel);
    if (!TEXT.test(rel) && !plain) { findings.push(`${rel}: unexpected file type in the repository`); continue; }
    findings.push(...auditFile(plain ? `${rel}.txt` : rel, data));
  }
  return findings;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const dist = path.join(projectRoot, 'dist');
  const zips = fs.existsSync(dist) ? fs.readdirSync(dist).filter(n => n.endsWith('.zip')) : [];
  const zipFile = zips[0];
  let findings = [];
  if (zipFile) findings = auditRelease({ zipFile: path.join(dist, zipFile) });
  else console.log('no release archives in dist/ (run npm run build first); auditing the repository only');
  const kitDist = path.join(projectRoot, 'dist-starter-kit');
  const kitZips = fs.existsSync(kitDist) ? fs.readdirSync(kitDist).filter(n => n.endsWith('.zip')) : [];
  for (const z of kitZips) findings.push(...auditKitZip(path.join(kitDist, z)));
  const skinDist = path.join(projectRoot, 'dist-skins');
  const skinZips = fs.existsSync(skinDist) ? fs.readdirSync(skinDist).filter(n => n.endsWith('.zip')) : [];
  for (const z of skinZips) findings.push(...auditSkinPackZip(path.join(skinDist, z)));
  let repo = [];
  try { repo = auditRepository(); } catch (e) {
    // inside a git checkout an audit that cannot finish is a failure, never a silent skip
    if (fs.existsSync(path.join(projectRoot, '.git'))) repo = [`the repository audit could not finish: ${e.message}`];
    else console.log(`repository audit skipped (not a git checkout): ${e.message}`);
  }
  for (const f of [...findings, ...repo]) console.log(`FINDING  ${f}`);
  console.log(`${privatePatterns().length} private pattern(s) loaded from build/private-patterns.txt`);
  console.log(findings.length + repo.length ? `${findings.length + repo.length} finding(s)` : 'clean: no findings in the archives or the tracked files');
  process.exit(findings.length + repo.length ? 1 : 0);
}
