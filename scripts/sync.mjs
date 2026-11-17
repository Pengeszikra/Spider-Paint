// Turns the 3Draft viewer into Spider Paint.
//
//   node scripts/sync.mjs ../3Draft
//
// Reads app/index.html and examples/bridge.scene.json from a 3Draft checkout and writes
// index.html and models/bridge.scene.json here. The engine (3Draft's dist/) is copied beside the page into engine/<commit>/,
// so the page never waits for a CDN to pick up a new commit (jsDelivr answered 404 for the first minutes after each release, and
// the page stayed dead); the commit in the path keeps a cached old engine from meeting a new page. Every step is an exact text
// replacement; if one no longer matches (the viewer changed), the script stops and says which.

import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { join, resolve } from 'node:path';

const src = resolve(process.argv[2] ?? '../3Draft');
const here = resolve(new URL('..', import.meta.url).pathname);
const commit = execFileSync('git', ['-C', src, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const engineRel = `engine/${commit.slice(0, 12)}`;
const engine = process.argv.includes('--local-engine') ? '/3draft/dist/index.js' : `./${engineRel}/index.js`;
// the engine beside the page: engine/<commit>/ (the old ones go)
rmSync(join(here, 'engine'), { recursive: true, force: true });
mkdirSync(join(here, engineRel), { recursive: true });
for (const f of readdirSync(join(src, 'dist'))) if (f.endsWith('.js') && !f.endsWith('.test.js')) copyFileSync(join(src, 'dist', f), join(here, engineRel, f));

const steps = [
  ['title', '<title>3Draft Viewer</title>', '<title>Spider Paint</title>'],
  ['header', '<h1>3Draft<span>viewer</span></h1>', '<h1>Spider Paint<span>3Draft</span></h1>'],
  ['engine import', "from '../dist/index.js';", `from '${engine}';`],
  ['worker engine', "new URL('../dist/index.js', import.meta.url).href", `new URL('${engine}', import.meta.url).href`],
  // the table example is gone; the prisms keep the old table leg's base
  ['table import', "import { LEG, table } from '../examples/table-model.js';", 'const LEG = { base: 0.15 }; // the base of a placed prism'],
  ['table scene', "      if (name === 'table') return { objects: [{ name: 'table', mesh: table }] };\n", ''],
  ['example path', 'fetch(`../examples/${name}.scene.json`)', 'fetch(`./models/${name}.scene.json`)'],
  // story files (Spider Build v2, .build.json): the format module is 3Draft's app/story.js, copied to models/spider-build-v2.mjs below
  ['story import', "import * as storyFormat from './story.js';", "import * as storyFormat from './models/spider-build-v2.mjs';"],
  ['game path', 'fetch(`../examples/${name}.game.json`)', 'fetch(`./models/${name}.game.json`)'],
  ['sky path', 'fetch(`../examples/${name.slice(4)}.sky.json`)', 'fetch(`./models/${name.slice(4)}.sky.json`)'],
  ['story path', 'new URL(`../examples/${name.slice(6)}.build.json`, location.href)', 'new URL(`./models/${name.slice(6)}.build.json`, location.href)'],
  // the bridge and the globe are shipped (the scene starts with the globe)
  ['example list', /(<option value="">\+ scene<\/option>\n)[\s\S]*?(\s*<optgroup id="savedGroup")/, (_, head, tail) => `${head}        <option value="bridge">Stone bridge</option>\n        <option value="globe">Globe</option>\n        <option value="stars">Stars (500 nearest)</option>\n        <option value="milkyway">Milky Way (30 000 super-stars)</option>\n        <option value="deepsky">Deep sky (1000 galaxies, 400 black holes, 3000 stars)</option>\n        <option value="stars-plain">Stars (300) + 100 galaxies (point glow)</option>\n        <option value="ex27">EX-27 expedition module</option>\n        <option value="human">Low poly human</option>\n        <option value="betterman">Betterman (pose him: J)</option>\n        <option value="command-bridge">Command bridge (2 crew at the desk)</option>\n        <option value="mechanics">Mechanics (hinge, rail, pivot, spring, group)</option>\n        <option value="workshop">VR workshop (carve with bare hands)</option>\n        <optgroup label="games (format 3draft-game)"><option value="game:fifth-percent">Fifth Percent: the starship bridge in the Deep Sky</option></optgroup>\n        <option value="tr74">TR-74 expedition module</option>\n        <option value="station-screen">Station screen (a scene on a face)</option>\n        <optgroup label="sky catalogues (format 3draft-sky: sky.md)"><option value="sky:trappist-1">TRAPPIST-1 (7 planets, 40 ly)</option></optgroup>\n        <optgroup label="stories"><option value="story:lark-4c-accident">Story: LARK–4C / LAST LIGHT</option><option value="story:lark-4">Story: LARK–4C lander build (746 steps)</option><option value="story:spider-build-example">Story: independent tracks (3 steps)</option></optgroup>${tail}`],
  // the phone's Exa menu gets the low poly human too (its model lives only in this repo)
  ['exa menu', "['empty', 'globe', 'stars', 'stars-plain', 'milkyway', 'deepsky', 'ex27']", "['empty', 'globe', 'stars', 'stars-plain', 'milkyway', 'deepsky', 'ex27', 'human', 'betterman', 'tr74', 'station-screen']"],
  // Spider Paint starts with an empty scene (?deepsky starts with the deep sky, as 3Draft does)
  ['empty start', "else if (!EMBED && !SHOW && !new URLSearchParams(location.search).has('empty') && !new URLSearchParams(location.search).has('play'))", "else if (!EMBED && !SHOW && new URLSearchParams(location.search).has('deepsky'))"],
  // no MCP server here: the live link is opt-in (?live), so a static server is not polled for /events
  ['live link', "if (!EMBED && !SHOW && ['localhost', '127.0.0.1'].includes(location.hostname) && typeof EventSource", "if (!EMBED && !SHOW && new URLSearchParams(location.search).has('live') && typeof EventSource"],
  // installable on a phone: manifest, icons and theme colour (the files are in this repo, sync does not touch them)
  ['pwa head', '<link rel="icon" href="data:,">', `<link rel="icon" href="favicon.svg" type="image/svg+xml">
  <link rel="icon" href="icons/favicon-32.png" sizes="32x32" type="image/png">
  <link rel="apple-touch-icon" href="icons/apple-touch-icon.png">
  <link rel="manifest" href="manifest.webmanifest">
  <meta name="theme-color" content="#0b0b0a">
  <meta name="mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
  <meta name="apple-mobile-web-app-title" content="Spider Paint">`],
  // the scene starts with the globe; not in an artifact, where the shared database holds the scene
  // (adding it there would write a new bridge into the database at every visit)
  ['starting scene', '\n    draw();\n    window.__ready = true;', "\n    draw();\n    window.__ready = true;\n    // works offline once opened (not in an artifact, nor from a file)\n    if (!EMBED && 'serviceWorker' in navigator && location.protocol.startsWith('http') && !globalThis.claude?.use) navigator.serviceWorker.register('sw.js').catch(() => {});"],
];

let html = readFileSync(join(src, 'app/index.html'), 'utf8');
for (const [name, from, to] of steps) {
  const next = html.replace(from, to);
  if (next === html) throw new Error(`sync: step "${name}" did not match; the 3Draft viewer changed, update scripts/sync.mjs`);
  html = next;
}
if (html.includes('../dist/') || html.includes('../examples/')) throw new Error('sync: a path into the 3Draft repo is left in index.html');

writeFileSync(join(here, 'index.html'), html);
writeFileSync(join(here, 'xr-test.html'), readFileSync(join(src, 'app/xr-test.html'))); // the WebXR loop alone, for a headset that stays black
// the same test scene in VR through three.js and through the 3Draft engine (its engine import points at engine/<commit>/)
writeFileSync(join(here, 'xr-compare.html'), readFileSync(join(src, 'app/xr-compare.html'), 'utf8').replace("from '../dist/index.js'", `from './${engineRel}/index.js'`));
mkdirSync(join(here, 'models'), { recursive: true });
writeFileSync(join(here, 'models/bridge.scene.json'), readFileSync(join(src, 'examples/bridge.scene.json')));
writeFileSync(join(here, 'help.md'), readFileSync(join(src, 'app/help.md'))); // the help page (Markdown), shown in the side panel
// the sky guide (a page of its own, opened in a new tab from the help and the sky group) and its example catalogue
writeFileSync(join(here, 'sky.md'), readFileSync(join(src, 'app/sky.md')));
writeFileSync(join(here, 'sky.html'), readFileSync(join(src, 'app/sky.html')));
writeFileSync(join(here, 'models/trappist-1.sky.json'), readFileSync(join(src, 'examples/trappist-1.sky.json')));
// the globe: the ocean is the half-transparent teal material, so the far side of the earth shows through
const globe = JSON.parse(readFileSync(join(src, 'examples/globe.scene.json'), 'utf8'));
const seaMaterial = { color: '#4fb5a5', alpha: 0.55 };
Object.assign(globe.palette.find((m) => m.name === 'ocean'), seaMaterial);
for (const f of globe.objects.find((o) => o.name === 'Ocean').mesh.faces) f.color = seaMaterial.color;
writeFileSync(join(here, 'models/globe.scene.json'), JSON.stringify(globe));
// the 500 nearest stars (not in the offline shell: it is 5 MB, the service worker keeps it after the first use)
writeFileSync(join(here, 'models/stars.scene.json'), readFileSync(join(src, 'examples/stars.scene.json')));
writeFileSync(join(here, 'models/milkyway.scene.json'), readFileSync(join(src, 'examples/milkyway.scene.json')));
writeFileSync(join(here, 'models/deepsky.scene.json'), readFileSync(join(src, 'examples/deepsky.scene.json')));
writeFileSync(join(here, 'models/stars-plain.scene.json'), readFileSync(join(src, 'examples/stars-plain.scene.json')));
writeFileSync(join(here, 'models/ex27.scene.json'), readFileSync(join(src, 'examples/ex27.scene.json')));
// betterman: the figure pose mode (J) is made for
writeFileSync(join(here, 'models/betterman.scene.json'), readFileSync(join(src, 'examples/betterman.scene.json')));
writeFileSync(join(here, 'models/command-bridge.scene.json'), readFileSync(join(src, 'examples/command-bridge.scene.json')));
writeFileSync(join(here, 'models/workshop.scene.json'), readFileSync(join(src, 'examples/workshop.scene.json')));
writeFileSync(join(here, 'models/mechanics.scene.json'), readFileSync(join(src, 'examples/mechanics.scene.json'))); // groups and joints
writeFileSync(join(here, 'models/fifth-percent.game.json'), readFileSync(join(src, 'examples/fifth-percent.game.json'))); // the game: the bridge over the Deep Sky
// the story format (Spider Build v2): one source, 3Draft's app/story.js (its spec, schema, tests and authoring tools stay here)
writeFileSync(join(here, 'models/spider-build-v2.mjs'), `// (copied from 3Draft app/story.js by scripts/sync.mjs: change it there)\n${readFileSync(join(src, 'app/story.js'), 'utf8')}`);
// models/human.scene.json (the low poly human) and models/tr74.scene.json (the TR-74 module) live only in this repo: sync leaves them alone

// ---- The MCP server (mcp/): 3Draft's server, scene tools and live link, with the engine beside them (mcp/engine/, the runtime
// files of dist/), so it runs from this repo alone. mcp/serve.js (the static server: Spider Paint at /, a 3Draft checkout at
// /3draft/) and MCP.md are this repo's own; sync fills MCP.md's tool list (between the tools markers) from the tools themselves.
const mcpDir = join(here, 'mcp');
const engineDir = join(mcpDir, 'engine');
rmSync(engineDir, { recursive: true, force: true });
mkdirSync(engineDir, { recursive: true });
for (const f of readdirSync(join(src, 'dist'))) if (f.endsWith('.js') && !f.endsWith('.test.js')) copyFileSync(join(src, 'dist', f), join(engineDir, f));
const mcpSteps = {
  'server.js': [["from '../dist/index.js'", "from './engine/index.js'"], ["serverInfo: { name: '3draft', version }", "serverInfo: { name: 'spider-paint', version }"], ['3draft MCP server ${version} ready on stdio', 'Spider Paint MCP server (3Draft ${version}) ready on stdio']],
  'scene.js': [["from '../dist/index.js'", "from './engine/index.js'"]],
  'live.js': [["from '../app/serve.js'", "from './serve.js'"]],
  'http.js': [["from '../dist/index.js'", "from './engine/index.js'"]], // the public HTTP server (api/mcp.mjs)
};
for (const [file, reps] of Object.entries(mcpSteps)) {
  let text = readFileSync(join(src, 'mcp', file), 'utf8');
  for (const [from, to] of reps) {
    if (!text.includes(from)) throw new Error(`sync: mcp/${file}: "${from}" not found; update scripts/sync.mjs`);
    text = text.replace(from, to);
  }
  if (text.includes('../dist/') || text.includes('../app/')) throw new Error(`sync: mcp/${file} still points into the 3Draft repo`);
  const note = `// (copied from 3Draft ${commit.slice(0, 7)} by scripts/sync.mjs: change it there)\n`;
  writeFileSync(join(mcpDir, file), text.startsWith('#!') ? text.replace(/^(#!.*\n)/, `$1${note}`) : note + text);
}
const { version: engineVersion } = await import(pathToFileURL(join(engineDir, 'index.js')).href);
writeFileSync(join(mcpDir, 'package.json'), `${JSON.stringify({ name: 'spider-paint-mcp', private: true, type: 'module', description: 'The Spider Paint / 3Draft MCP server: node mcp/server.js', '3draft': { version: engineVersion, commit } }, null, 2)}\n`);
// MCP.md: the tool list
const { createScene } = await import(pathToFileURL(join(mcpDir, 'scene.js')).href);
const cell = (t) => String(t).replace(/\|/g, '\\|').replace(/\n/g, ' ');
const args = (schema) => Object.keys(schema?.properties ?? {}).map((k) => ((schema.required ?? []).includes(k) ? `**${k}**` : k)).join(', ') || '–';
const toolRows = createScene().list().map((t) => `| \`${t.name}\` | ${args(t.inputSchema)} | ${cell(t.description)} |`).join('\n');
const mdPath = join(here, 'MCP.md');
const md = readFileSync(mdPath, 'utf8');
const marks = /(<!-- tools:start -->)[\s\S]*?(<!-- tools:end -->)/;
if (!marks.test(md)) throw new Error('sync: MCP.md has no <!-- tools:start --> / <!-- tools:end --> markers');
writeFileSync(mdPath, md.replace(marks, (_, a, b) => `${a}\n| tool | arguments (bold: required) | what it does |\n|---|---|---|\n${toolRows}\n${b}`));
console.log(`Spider Paint <- 3Draft ${commit}`);
