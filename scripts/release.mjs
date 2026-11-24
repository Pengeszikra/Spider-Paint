// Publish through the project's date-based versioner, not a manually entered npm version.
// npm computes the package version before prepublishOnly, so bumping there is too late.
//
//   npm run release              bump, publish to npm, then commit the new version and push it to brand.branch
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
const pkg = () => JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

if (dry) {
  // Only preview the next version; never publish, never mutate package.json.
  run(process.execPath, ['scripts/bump.mjs', '--dry']);
} else {
  const { name, brand } = pkg();
  const branch = brand?.branch ?? 'main';
  if (out('git', ['status', '--porcelain'])) throw Error('uncommitted changes: commit or stash them before a release');
  if (out('git', ['rev-parse', '--abbrev-ref', 'HEAD']) !== branch) throw Error(`release from ${branch} (package.json brand.branch)`);
  run('git', ['pull', '--ff-only', 'origin', branch]); // the version continues from what the repository has
  const original = pkg().version;
  run(process.execPath, ['scripts/bump.mjs']);
  const target = pkg().version;
  if (target === original) throw Error('release version was not incremented');
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
