// The whole test suite, one test after the other: every tests/*.mjs (serve.mjs is the dev server, not a test).
// npm run test:all runs it; npm run release runs it before anything is bumped or published.
//
// The browser tests need the playwright package; where it is missing they are skipped with a note (CI runs them).
// tests/smoke.mjs rewrites its screenshot, tests/smoke.png, on every run: it is put back afterwards, so a test run leaves
// the checkout as it found it.
import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const NOT_TESTS = ['serve.mjs'];
const BROWSER = ['smoke.mjs', 'mcp-widget-inline-browser.mjs'];
const hasPlaywright = (() => {
  try {
    createRequire(import.meta.url).resolve('playwright');
    return true;
  } catch {
    return false;
  }
})();
const git = (...a) => spawnSync('git', a, { cwd: root, encoding: 'utf8' });
const shotWasClean = !git('status', '--porcelain', '--', 'tests/smoke.png').stdout.trim();

const tests = readdirSync(new URL('../tests/', import.meta.url)).filter((f) => f.endsWith('.mjs') && !NOT_TESTS.includes(f)).sort();
const failed = [];
const skipped = [];
for (const t of tests) {
  if (BROWSER.includes(t) && !hasPlaywright) {
    skipped.push(t);
    continue;
  }
  const start = Date.now();
  const r = spawnSync(process.execPath, [`tests/${t}`], { cwd: root, encoding: 'utf8', timeout: 300_000 });
  const ok = r.status === 0;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${t.padEnd(32)} ${((Date.now() - start) / 1000).toFixed(1)}s`);
  if (!ok) {
    failed.push(t);
    console.log(`${r.stdout ?? ''}${r.stderr ?? ''}`.trim().split('\n').slice(-12).map((l) => `     ${l}`).join('\n'));
  }
}
if (shotWasClean) git('checkout', '--', 'tests/smoke.png');
if (skipped.length) console.log(`skipped (no playwright here; CI runs them): ${skipped.join(', ')}`);
console.log(failed.length ? `${failed.length} of ${tests.length - skipped.length} tests failed: ${failed.join(', ')}` : `all ${tests.length - skipped.length} tests passed`);
process.exit(failed.length ? 1 : 0);
