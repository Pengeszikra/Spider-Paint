// Shared spider-paint build identity for Cloud Run, MCP and the embedded workshop.
// The Docker image intentionally excludes .git. Deploy with SPIDER_PAINT_GIT_SHA
// set to the exact source commit; local checkouts can discover HEAD directly.
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const parts = String(pkg.version).split('.').map(Number);
if (parts.length !== 3 || parts.some(n => !Number.isInteger(n) || n < 0)) {
  throw Error('Invalid spider-paint package version');
}
const [year, month, dayBuild] = parts;
const pad = (value, width) => String(value).padStart(width, '0');
const display = [pad(year, 2), pad(month, 2), pad(Math.floor(dayBuild / 1000), 2), pad(dayBuild % 1000, 3)].join('.');

const validHash = value => /^[a-f0-9]{7,40}$/i.test(String(value || '').trim())
  ? String(value).trim().toLowerCase() : null;
// Docker source builds record HEAD while .git is still available, then discard
// the Git directory. Never infer a source commit from a mutable remote branch.
let embeddedHash = null;
try { embeddedHash = validHash(readFileSync(new URL('./build-sha.txt', import.meta.url), 'utf8')); }
catch { /* Local installs need no embedded build metadata. */ }
let gitHash = validHash(process.env.SPIDER_PAINT_GIT_SHA)
  || validHash(process.env.COMMIT_SHA)
  || validHash(process.env.GITHUB_SHA)
  || embeddedHash;
if (!gitHash) {
  try {
    gitHash = validHash(execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: fileURLToPath(new URL('../', import.meta.url)),
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 1000,
    }));
  } catch { /* Production images may not contain git or .git. */ }
}
const shortHash = gitHash ? gitHash.slice(0, 8) : null;
export const buildInfo = Object.freeze({
  name: pkg.name,
  version: pkg.version,
  display,
  gitHash,
  shortHash,
  label: display + ' · ' + (shortHash || 'git ?'),
});
