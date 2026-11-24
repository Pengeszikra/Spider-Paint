// Moves the shared code from this checkout into a sibling project's checkout, renaming the project as it goes.
//
//   npm run transfer -- ../other-checkout          copy + rename (the target's git tree must be clean)
//   npm run transfer -- ../other-checkout --dry    only show what would change
//   npm run brand                                  show this project's brand tokens
//
// One rule makes it work: package.json is the only place that says which project a checkout is. Its `name` and `brand`
// block give the tokens (see TRANSFER.md); the same tokens of the target's package.json replace them in every shared file
// and path. The paths in either project's `brand.own` list stay where they are (each project keeps its own models, docs,
// workflows); `brand.share` names the exceptions inside them. Before anything is written the script checks that the rename
// is lossless both ways (no shared file may name the other project), that every JS file still parses and every JSON file
// still reads; if one check fails nothing is written.

import { execFileSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { versionFiles, withVersion } from './version-files.mjs';

const here = resolve(new URL('..', import.meta.url).pathname);
const args = process.argv.slice(2);
const flag = (f) => args.includes(f);
const readPkg = (dir) => JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));

/** The brand tokens of a package.json, by role. Every one of them is renamed in transfer (the version is each project's own: package.json and the plugin manifests). */
export const brandOf = (pkg) => {
  const b = pkg.brand ?? {};
  const name = pkg.name;
  const ident = name.replace(/[^A-Za-z0-9]+/g, '_'); // as a JS / shell identifier
  const missing = ['repo', 'branch', 'site', 'mcp'].filter((k) => typeof b[k] !== 'string' || !b[k]);
  if (!name || missing.length) throw Error(`package.json of ${name ?? '?'}: brand.${missing.join(', brand.')} missing`);
  return {
    name,
    roles: { mcp: b.mcp, site: b.site, repo: b.repo, env: ident.toUpperCase(), name, ident },
    own: b.own ?? [],
    share: b.share ?? [],
    branch: b.branch,
  };
};

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** A loose pattern for a project name: any case, any separator (my-app, My App, MY_APP …). */
const looseName = (name) => new RegExp(name.split(/[^A-Za-z0-9]+/).map(esc).join('[\\s_-]?'), 'gi');

/** from → to pairs by role, longest first; a token used by several roles keeps its first (most specific) role. */
const pairsOf = (from, to) => {
  const seen = new Set();
  return Object.keys(from.roles)
    .map((role) => [from.roles[role], to.roles[role], role])
    .filter(([f]) => !seen.has(f) && seen.add(f))
    .sort((a, b) => b[0].length - a[0].length);
};
/** Renames in one pass (placeholders, so a replacement is never renamed again); the repo matches in any letter case. */
const renamer = (pairs) => {
  const repo = pairs.find(([, , r]) => r === 'repo');
  const rest = pairs.filter((p) => p !== repo);
  const reRepo = new RegExp(esc(repo[0]), 'gi');
  const reRest = new RegExp(rest.map(([f]) => esc(f)).join('|'), 'g');
  const map = new Map(rest.map(([f, t]) => [f, t]));
  return (text) => text.replace(reRepo, () => '\u0000R\u0000').replace(reRest, (m) => map.get(m)).replace(/\u0000R\u0000/g, repo[1]);
};

const inList = (path, list) => list.some((p) => (p.endsWith('/') ? path.startsWith(p) : path === p));
const git = (dir, ...a) => execFileSync('git', ['-C', dir, ...a], { encoding: 'utf8', maxBuffer: 1 << 28 });
const filesOf = (dir) => git(dir, 'ls-files', '-co', '--exclude-standard', '-z').split('\0').filter((f) => f && existsSync(join(dir, f)));
const isBinary = (buf) => buf.subarray(0, 8000).includes(0);
// package.json: the shared part (scripts, files, dependencies …) moves; who the project is stays the target's own
const PKG_OWN = ['name', 'version', 'description', 'brand', 'private', 'repository', 'homepage', 'bugs', 'author', 'keywords', 'publishConfig'];

const me = brandOf(readPkg(here));

if (flag('--brand')) {
  console.log(`${me.name}  (branch ${me.branch})`);
  for (const [role, token] of Object.entries(me.roles)) console.log(`  ${role.padEnd(6)} ${token}`);
  console.log(`  own    ${me.own.join(', ') || '-'}\n  share  ${me.share.join(', ') || '-'}`);
  process.exit(0);
}

const targetArg = args.find((a) => !a.startsWith('--'));
if (!targetArg) {
  console.error('usage: npm run transfer -- <target checkout> [--dry] [--force]');
  process.exit(2);
}
const there = resolve(targetArg);
if (there === here) throw Error('the target is this checkout');
const them = brandOf(readPkg(there));
if (them.name === me.name) throw Error(`the target is the same project (${me.name})`);

const fwd = renamer(pairsOf(me, them));
const back = renamer(pairsOf(them, me));
const own = [...me.own, ...them.own];
const share = [...me.share, ...them.share];
const shared = (path) => path !== 'package.json' && (!inList(path, own) || inList(path, share));
const foreign = [looseName(them.name), ...[them.roles.site, them.roles.mcp].map((u) => new RegExp(esc(new URL(u).host), 'gi'))];

// ---- 1. read and rename everything in memory, collecting every problem
const problems = [];
const out = new Map(); // target path -> { data, mode }
for (const path of filesOf(here).filter(shared)) {
  const to = fwd(path);
  if (back(to) !== path) problems.push(`${path}: the path does not rename back`);
  if (!shared(to)) continue; // its new name is one of the target's own paths
  const buf = readFileSync(join(here, path));
  const mode = statSync(join(here, path)).mode & 0o777;
  if (isBinary(buf)) {
    out.set(to, { data: buf, mode });
    continue;
  }
  const text = buf.toString('utf8');
  text.split('\n').forEach((line, i) => {
    for (const re of foreign) if (line.match(re)) problems.push(`${path}:${i + 1}: names the other project: ${line.trim().slice(0, 140)}`);
    for (const m of line.match(looseName(me.name)) ?? [])
      if (![me.roles.name, me.roles.ident, me.roles.env].includes(m)) problems.push(`${path}:${i + 1}: "${m}" is not one of the brand tokens, it would not be renamed`);
  });
  const renamed = fwd(text);
  if (back(renamed) !== text) problems.push(`${path}: the rename is not lossless (it would not come back the same)`);
  // the plugin manifests carry the target's own version (package.json's, see scripts/version-files.mjs)
  out.set(to, { data: versionFiles(them.name).includes(to) ? withVersion(renamed, readPkg(there).version) : renamed, mode });
}

const srcPkg = readPkg(here);
const dstPkg = readPkg(there);
const pkg = JSON.parse(fwd(JSON.stringify(srcPkg)));
for (const k of PKG_OWN) if (k in dstPkg) pkg[k] = dstPkg[k]; else delete pkg[k];
const pkgText = JSON.stringify(pkg, null, 2) + '\n';

// ---- 2. stage it and check it: every JS file parses, every JSON file reads
const stage = mkdtempSync(join(tmpdir(), 'transfer-'));
try {
  writeFileSync(join(stage, 'package.json'), pkgText);
  for (const [path, { data }] of out) {
    mkdirSync(dirname(join(stage, path)), { recursive: true });
    writeFileSync(join(stage, path), data);
    if (typeof data !== 'string') continue;
    if (/\.(m?js|cjs)$/.test(path)) {
      try { execFileSync(process.execPath, ['--check', join(stage, path)], { stdio: 'pipe' }); }
      catch (e) { problems.push(`${path}: does not parse after the rename: ${String(e.stderr).split('\n').find((l) => /Error/.test(l)) ?? ''}`); }
    }
    if (path.endsWith('.json')) { try { JSON.parse(data); } catch (e) { problems.push(`${path}: not JSON after the rename: ${e.message}`); } }
  }
} finally {
  rmSync(stage, { recursive: true, force: true });
}

if (problems.length) {
  console.error(`transfer ${me.name} → ${them.name}: ${problems.length} problem(s), nothing written\n  ${problems.join('\n  ')}`);
  process.exit(1);
}

// ---- 3. what changes in the target
const changed = [...out].filter(([path, { data }]) => {
  const file = join(there, path);
  return !existsSync(file) || !readFileSync(file).equals(Buffer.from(data));
}).map(([p]) => p);
const removed = filesOf(there).filter((p) => shared(p) && !out.has(p));
const pkgChanged = readFileSync(join(there, 'package.json'), 'utf8') !== pkgText;

console.log(`transfer ${me.name} → ${them.name}: ${changed.length} file(s) to write, ${removed.length} to remove${pkgChanged ? ', package.json updated' : ''}, ${out.size - changed.length} unchanged`);
if (flag('--dry') || changed.length + removed.length < 40) {
  for (const p of changed) console.log(`  + ${p}`);
  for (const p of removed) console.log(`  - ${p}`);
}
if (flag('--dry')) process.exit(0);

if (!flag('--force') && git(there, 'status', '--porcelain').trim()) {
  console.error(`${there} has uncommitted changes: commit or stash them first (or --force), so the transfer is one reviewable diff`);
  process.exit(1);
}

// ---- 4. write
for (const p of changed) {
  const { data, mode } = out.get(p);
  mkdirSync(dirname(join(there, p)), { recursive: true });
  writeFileSync(join(there, p), data);
  chmodSync(join(there, p), mode);
}
for (const p of removed) rmSync(join(there, p));
if (pkgChanged) writeFileSync(join(there, 'package.json'), pkgText);
console.log(`done: review with  git -C ${targetArg} diff --stat  and commit to ${them.branch}`);
