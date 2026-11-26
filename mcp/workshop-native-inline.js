// Package the REAL spider-paint editor (index.html + its 3Draft engine) as one self-contained HTML document,
// so an MCP App host that does not allow a nested frame to https://spider-paint.vercel.app (Claude) can still run
// the native editor: the widget loads this document into its child frame with srcdoc.
// This is a packaging step at resource-build time in Node, in the style of workshop-browser-model.js:
// every module gets its own lexical scope, no bundler, no network, no eval. The editor source is unchanged;
// only its two module imports, its worker engine URL and its launch parameters are rewired here.
import { readFileSync } from 'node:fs';
import { dirname, resolve, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const NAME = /^([A-Za-z_$][\w$]*)(?:\s+as\s+([A-Za-z_$][\w$]*))?$/;
const parseNames = (csv) => csv.split(',').map((s) => s.trim()).filter(Boolean).map((s) => {
  const m = NAME.exec(s);
  if (!m) throw Error('Unexpected named binding: ' + s);
  return { original: m[1], local: m[2] || m[1] };
});

/** Bundle ES modules with named imports / declaration exports / named re-exports into scoped constants. */
export function bundleModules(entries) {
  const modules = new Map(), output = [];
  function compile(file) {
    if (!file.startsWith(REPO + sep)) throw Error('Module outside the repository: ' + file);
    if (modules.has(file)) return modules.get(file);
    const ns = '__native_n' + modules.size;
    modules.set(file, ns);
    let body = readFileSync(file, 'utf8');
    const bindings = [], exports = [];
    const dep = (spec) => {
      if (!spec.startsWith('./') && !spec.startsWith('../')) throw Error('Unsupported import ' + spec + ' in ' + relative(REPO, file));
      return compile(resolve(dirname(file), spec));
    };
    body = body.replace(/^\s*export\s*\{\s*\}\s*;?[ \t]*$/gm, '');
    body = body.replace(/^\s*import\s*\{([^}]+)\}\s*from\s*['"]([^'"]+)['"];?[ \t]*$/gm, (_, names, spec) => {
      bindings.push('const {' + parseNames(names).map((n) => n.original + ':' + n.local).join(',') + '}=' + dep(spec) + ';');
      return '';
    });
    body = body.replace(/^\s*export\s*\{([^}]+)\}\s*from\s*['"]([^'"]+)['"];?[ \t]*$/gm, (_, names, spec) => {
      const list = parseNames(names);
      bindings.push('const {' + list.map((n) => n.original + ':' + n.local).join(',') + '}=' + dep(spec) + ';');
      exports.push(...list.map((n) => n.local));
      return '';
    });
    body = body.replace(/^\s*export\s+(?:(async)\s+)?(const|let|var|function\*?|class)\s+([A-Za-z_$][\w$]*)/gm, (_, asyncWord, kind, name) => {
      exports.push(name);
      return '\n' + (asyncWord ? 'async ' : '') + kind + ' ' + name;
    });
    if (/^\s*(?:import|export)\b/m.test(body) || /\bimport\.meta\b|\bimport\s*\(/.test(body)) throw Error('Unbundled ESM in ' + relative(REPO, file));
    output.push('const ' + ns + '=(()=>{\n' + bindings.join('\n') + '\n' + body + '\nreturn {' + [...new Set(exports)].join(',') + '};\n})();');
    return ns;
  }
  const names = entries.map((e) => compile(resolve(REPO, e)));
  return { source: output.join('\n'), names };
}

const ENGINE_IMPORT = /^\s*import\s*\{([^}]+)\}\s*from\s*'\.\/engine\/[0-9a-f]+\/index\.js';[^\n]*$/m;
const STORY_IMPORT = /^\s*import\s*\*\s*as\s+storyFormat\s+from\s*'\.\/models\/spider-build-v2\.mjs';[^\n]*$/m;
const ENGINE_URL = /const ENGINE_URL = new URL\('\.\/engine\/[0-9a-f]+\/index\.js', import\.meta\.url\)\.href;/;
const must = (s, re, what) => { if (!re.test(s)) throw Error('Native inline: ' + what + ' not found in index.html'); return s; };
const scriptSafe = (s) => s.replace(/<\/script/gi, '<\\/script');

/** The native editor as one HTML document. Launch parameters come from window.__native_launch {search, hash}. */
export function nativeInlineHTML() {
  let html = readFileSync(resolve(REPO, 'index.html'), 'utf8');
  const engineDir = must(html, ENGINE_IMPORT, 'engine import').match(/'\.\/(engine\/[0-9a-f]+)\/index\.js'/)[1];
  must(html, STORY_IMPORT, 'story import');
  must(html, ENGINE_URL, 'worker ENGINE_URL');
  // the editor's own modules (import { … } from './src/….js'): bundled with the engine, as named constants
  const SRC_IMPORT = /^[ \t]*import \{([^}]*)\} from '\.\/(src\/[\w/-]+\.js)';[^\n]*$/gm;
  const srcImports = [...html.matchAll(SRC_IMPORT)].map((m) => ({ line: m[0], names: parseNames(m[1]), file: m[2] }));
  const { source, names: [engineNs, storyNs, ...srcNs] } = bundleModules([engineDir + '/index.js', 'models/spider-build-v2.mjs', ...srcImports.map((x) => x.file)]);
  const engineNames = parseNames(html.match(ENGINE_IMPORT)[1]);
  srcImports.forEach((x, k) => (html = html.replace(x.line, () => '    const {' + x.names.map((n) => n.original + ':' + n.local).join(',') + '}=' + srcNs[k] + ';')));
  html = html
    .replace(ENGINE_IMPORT, () => scriptSafe(source) + '\nconst {' + engineNames.map((n) => n.original + ':' + n.local).join(',') + '}=' + engineNs + ';')
    .replace(STORY_IMPORT, () => 'const storyFormat=' + storyNs + ';')
    // Workers cannot import a document-scoped bundle; the editor already falls back to the main thread.
    .replace(ENGINE_URL, () => "const ENGINE_URL = 'data:text/javascript,throw%20Error(%22inline%20workshop%3A%20no%20worker%20engine%22)';");
  // srcdoc documents have no real URL: the launch parameters replace location.search / location.hash.
  html = html.replace(/\blocation\.search\b/g, '__nativeSearch').replace(/\blocation\.hash\b/g, '__nativeHash');
  const keycast = readFileSync(resolve(REPO, 'src/tutorial-keycast.js'), 'utf8');
  html = html.replace('<script defer src="./src/tutorial-keycast.js"></script>', () => '<script>' + scriptSafe(keycast) + '</script>');
  html = html.replace(/^\s*<link rel="(?:icon|apple-touch-icon|manifest)"[^>]*>\s*$/gm, '');
  let modelsIndex = 'null';
  try { modelsIndex = JSON.stringify(JSON.parse(readFileSync(resolve(REPO, 'models/index.json'), 'utf8'))).replace(/</g, '\\u003c'); } catch { /* no list: the select stays empty */ }
  const launch = '<script>window.__MODELS_INDEX=' + modelsIndex + ';var __nativeLaunch=window.__native_launch||{};var __nativeSearch=String(__nativeLaunch.search||"");var __nativeHash=String(__nativeLaunch.hash||"");window.__native_inline=true;</script>';
  if (!/<head>/.test(html)) throw Error('Native inline: <head> not found');
  html = html.replace('<head>', () => '<head>\n' + launch);
  if (/\bimport\s*\{[^}]*\}\s*from\s*'\.\//.test(html)) throw Error('Native inline: a relative module import is left');
  return html;
}
