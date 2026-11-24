// Guard against npm publish accidentally reusing an existing version.
// The release script bumps package.json before invoking npm publish.
import { readFileSync } from 'node:fs';
const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
if (process.env.SPIDER_PAINT_RELEASE_VERSION !== pkg.version) {
  console.error('Use npm run release instead of npm publish: it increments YY.M.DNNN before packaging.');
  process.exit(1);
}
