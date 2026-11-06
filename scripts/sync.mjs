// Turns the 3Draft viewer into Spider Paint.
//
//   node scripts/sync.mjs ../3Draft
//
// Reads app/index.html and examples/bridge.scene.json from a 3Draft checkout and writes
// index.html and models/bridge.scene.json here. The engine is not copied: the page imports it
// from jsDelivr, pinned to the 3Draft commit it was taken from. Every step is an exact text
// replacement; if one no longer matches (the viewer changed), the script stops and says which.

import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const src = resolve(process.argv[2] ?? '../3Draft');
const here = resolve(new URL('..', import.meta.url).pathname);
const commit = execFileSync('git', ['-C', src, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const engine = `https://cdn.jsdelivr.net/gh/Pengeszikra/3Draft@${commit}/dist/index.js`;

const steps = [
  ['title', '<title>3Draft Viewer</title>', '<title>Spider Paint</title>'],
  ['header', '<h1>3Draft<span>viewer</span></h1>', '<h1>Spider Paint<span>3Draft</span></h1>'],
  ['engine import', "from '../dist/index.js';", `from '${engine}';`],
  // the table example is gone; the prisms keep the old table leg's base
  ['table import', "import { LEG, table } from '../examples/table-model.js';", 'const LEG = { base: 0.15 }; // the base of a placed prism'],
  ['table scene', "      if (name === 'table') return { objects: [{ name: 'table', mesh: table }] };\n", ''],
  ['example path', 'fetch(`../examples/${name}.scene.json`)', 'fetch(`./models/${name}.scene.json`)'],
  // only the bridge is shipped
  ['example list', /(<option value="">\+ Example…<\/option>\n)[\s\S]*?(\s*<\/select>)/, (_, head, tail) => `${head}        <option value="bridge">Stone bridge</option>${tail}`],
  // no MCP server here: the live link is opt-in (?live), so a static server is not polled for /events
  ['live link', "if (['localhost', '127.0.0.1'].includes(location.hostname) && typeof EventSource", "if (new URLSearchParams(location.search).has('live') && typeof EventSource"],
  // the scene starts with the bridge; not in an artifact, where the shared database holds the scene
  // (adding it there would write a new bridge into the database at every visit)
  ['starting scene', '\n    draw();\n  </script>', "\n    draw();\n    if (!globalThis.claude?.use) addExample('bridge'); // the starting scene\n  </script>"],
];

let html = readFileSync(join(src, 'app/index.html'), 'utf8');
for (const [name, from, to] of steps) {
  const next = html.replace(from, to);
  if (next === html) throw new Error(`sync: step "${name}" did not match; the 3Draft viewer changed, update scripts/sync.mjs`);
  html = next;
}
if (html.includes('../dist/') || html.includes('../examples/')) throw new Error('sync: a path into the 3Draft repo is left in index.html');

writeFileSync(join(here, 'index.html'), html);
mkdirSync(join(here, 'models'), { recursive: true });
writeFileSync(join(here, 'models/bridge.scene.json'), readFileSync(join(src, 'examples/bridge.scene.json')));
console.log(`Spider Paint <- 3Draft ${commit}`);
