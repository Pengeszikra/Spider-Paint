// Publish through the project's date-based versioner, not a manually entered npm version.
// npm computes the package version before prepublishOnly, so bumping there is too late.
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const dry = process.argv.includes('--dry-run');
const cmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';

const run = (command, args, env = process.env) => {
  const r = spawnSync(command, args, { cwd: root, stdio: 'inherit', env });
  if (r.error) throw r.error;
  if (r.status !== 0) process.exit(r.status ?? 1);
};
const pkg = () => JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
if (dry) {
  // Only preview the next version; never publish, never mutate package.json.
  run(process.execPath, ['scripts/bump.mjs', '--dry']);
} else {
  const original = pkg().version;
  run(process.execPath, ['scripts/bump.mjs']);
  const target = pkg().version;
  if (target === original) throw Error('release version was not incremented');
  console.log('Publishing spider-paint@' + target);
  run(cmd, ['publish', ...process.argv.slice(2).filter(x => x !== '--dry-run')], {
    ...process.env,
    SPIDER_PAINT_RELEASE_VERSION: target,
  });
  console.log('Published spider-paint@' + target + '; commit the package.json version to Git.');
}
