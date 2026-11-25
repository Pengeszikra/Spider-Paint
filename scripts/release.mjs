// Publish through the project's date-based versioner, not a manually entered npm version.
// npm computes the package version before prepublishOnly, so bumping there is too late.
//
//   npm run release              test (npm run test:all), bump, publish to npm, then commit the new version and push it to brand.branch
//   npm run release -- --dry-run only show the next version
//
// The repository is the source of truth, so a release starts from a clean, up-to-date checkout and ends with the
// published version committed back: npm and git never disagree about the version.
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { versionFiles } from './version-files.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const dry = process.argv.includes('--dry-run');
const cmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const NPM = cmd;

const run = (command, args, env = process.env) => {
  const r = spawnSync(command, args, { cwd: root, stdio: 'inherit', env });
  if (r.error) throw r.error;
  if (r.status !== 0) process.exit(r.status ?? 1);
};
const out = (command, args) => {
  const r = spawnSync(command, args, { cwd: root, encoding: 'utf8' });
  if (r.status !== 0) throw Error(`${command} ${args.join(' ')}: ${(r.stderr || '').trim()}`);
  return r.stdout.trim();
};
// A release starts from what git has: changed tracked files stop it (they would be published without being committed);
// untracked files only stop it when npm would pack them (they are listed either way).
const stop = (message) => {
  console.error(`release: ${message}`);
  process.exit(1);
};
const cleanTree = () => {
  const lines = spawnSync('git', ['status', '--porcelain'], { cwd: root, encoding: 'utf8' }).stdout.split('\n').filter(Boolean); // (untrimmed: the status columns)
  const changed = lines.filter((l) => !l.startsWith('??')).map((l) => l.slice(3));
  const untracked = lines.filter((l) => l.startsWith('??')).map((l) => l.slice(3));
  if (changed.length) stop(`uncommitted changes, commit or stash them first:\n  ${changed.join('\n  ')}`);
  if (!untracked.length) return;
  const packed = new Set(JSON.parse(out(NPM, ['pack', '--dry-run', '--json', '--ignore-scripts']))[0].files.map((f) => f.path));
  const shipped = untracked.flatMap((u) => (u.endsWith('/') ? [...packed].filter((f) => f.startsWith(u)) : packed.has(u) ? [u] : []));
  if (shipped.length) stop(`untracked files would be published, commit or remove them first:\n  ${shipped.join('\n  ')}`);
  console.log(`(untracked, not published, left alone: ${untracked.join(', ')})`);
};
const pkg = () => JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

if (dry) {
  // Only preview the next version; never publish, never mutate package.json.
  run(process.execPath, ['scripts/bump.mjs', '--dry']);
} else {
  const { name, brand } = pkg();
  const branch = brand?.branch ?? 'main';
  cleanTree();
  if (out('git', ['rev-parse', '--abbrev-ref', 'HEAD']) !== branch) stop(`release from ${branch} (package.json brand.branch)`);
  run('git', ['pull', '--ff-only', 'origin', branch]); // the version continues from what the repository has
  // the whole test suite first: a failing test stops the release before anything is bumped or published
  if (spawnSync(process.execPath, ['scripts/test-all.mjs'], { cwd: root, stdio: 'inherit' }).status !== 0) stop('the tests failed: nothing was bumped or published');
  const original = pkg().version;
  run(process.execPath, ['scripts/bump.mjs']);
  const target = pkg().version;
  if (target === original) stop('release version was not incremented');
  console.log('Publishing ' + name + '@' + target);
  const published = spawnSync(cmd, ['publish', ...process.argv.slice(2)], {
    cwd: root, stdio: 'inherit', env: { ...process.env, SPIDER_PAINT_RELEASE_VERSION: target },
  });
  if (published.status !== 0) {
    run('git', ['checkout', '--', 'package.json', ...versionFiles(name).filter((p) => out('git', ['ls-files', p]))]);
    console.error('npm publish failed: the version bump was undone');
    process.exit(published.status ?? 1);
  }
  run('git', ['add', 'package.json', ...versionFiles(name).filter((p) => out('git', ['ls-files', p]))]);
  run('git', ['commit', '-m', `release: ${name}@${target}`]);
  const pushed = spawnSync('git', ['push', 'origin', branch], { cwd: root, stdio: 'inherit' });
  console.log(pushed.status === 0
    ? `Published ${name}@${target} and pushed the version to ${branch}.`
    : `Published ${name}@${target}; the version commit is local: push it to ${branch}.`);
}
