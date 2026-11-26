#!/usr/bin/env node
// The help/ folder as one web page: every section of help/index.md, rendered by src/md (the same code as the help
// panel and the terminal), with a side menu. Used by the Tüskék és Gyökerek site (its spider-docs page).
//
//   node scripts/docs-page.mjs [--template page.html] [--out file.html] [--base https://spider-paint.vercel.app/]
//
// --template: an HTML page with <!--spider-docs:css-->, <!--spider-docs:nav-->, <!--spider-docs:body--> and
// <!--spider-docs:stamp--> in it (the site's header and footer around them). Without it: a plain standalone page.
// Links between the help files become anchors on the page; other relative links and pictures point at --base.
import { readFile, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse, toHtml, codeCss, inline } from '../src/md/markdown.js';
import { helpSections } from '../src/md/help.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const opt = (name, def) => {
  const k = args.indexOf(name);
  return k >= 0 ? args[k + 1] : def;
};
const base = opt('--base', 'https://spider-paint.vercel.app/').replace(/\/?$/, '/');
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const stem = (file) => file.replace(/\.md$/, '');

// Headings get the section's name in front ("flying-tab"), so the same heading in two files stays two anchors;
// a section's first heading is the section itself ("flying").
const renameIds = (blocks, name) => {
  let first = true;
  const walk = (bs) => {
    for (const b of bs) {
      if (b.type === 'h') ((b.from = b.id), (b.id = first ? name : `${name}-${b.id}`), (first = false));
      if (b.type === 'quote') walk(b.blocks);
      if (b.type === 'list') for (const it of b.items) walk(it.children);
    }
  };
  walk(blocks);
  return blocks;
};

/** The help as page parts: { css, nav, body, version, commit } */
export const docsParts = async () => {
  const read = (f) => readFile(join(root, 'help', f), 'utf8');
  const indexMd = await read('index.md');
  const sections = helpSections(indexMd);
  const names = new Set(sections.map((s) => stem(s.file)));
  const docs = [{ name: 'help', title: 'Overview', blocks: renameIds(parse(indexMd), 'help') }];
  for (const s of sections) docs.push({ name: stem(s.file), title: s.title, blocks: renameIds(parse(await read(s.file)), stem(s.file)) });

  // anchor ids per section: the heading's own id -> the page id
  const idsOf = new Map(docs.map((d) => [d.name, new Map()]));
  for (const d of docs) for (const b of d.blocks) if (b.type === 'h') idsOf.get(d.name).set(b.from, b.id);
  const link = (cur) => (href) => {
    const m = /^([^#?]*?)\.md(?:#(.*))?$/.exec(href);
    if (m && names.has(m[1].replace(/^\.\//, ''))) {
      const n = m[1].replace(/^\.\//, '');
      return `#${(m[2] && idsOf.get(n).get(m[2])) || n}`;
    }
    if (href.startsWith('#')) return idsOf.get(cur).has(href.slice(1)) ? `#${idsOf.get(cur).get(href.slice(1))}` : `${base}${href}`;
    if (/^[a-z]+:|^\/\//i.test(href)) return href;
    return base + href.replace(/^\.?\//, '');
  };
  // help/index.md lists the sections itself: on the page the side menu does that, so its list goes
  const overview = docs[0].blocks.filter((b, k, all) => !(b.type === 'list' && all[k - 1]?.type === 'h' && all[k - 1].from === 'sections') && !(b.type === 'h' && b.from === 'sections'));
  docs[0].blocks = overview;

  const body = docs.map((d) => `<section class="sd-section" id="sd-${d.name}">\n${toHtml(d.blocks, { link: link(d.name) })}\n</section>`).join('\n');
  const plain = (t) => esc(inline(t).map((s) => s.text).join(''));
  const nav = docs
    .map((d) => {
      const subs = d.blocks.filter((b) => b.type === 'h' && b.level === 2);
      return `<li><a href="#${d.name}">${esc(d.title)}</a>${subs.length ? `<ul>${subs.map((b) => `<li><a href="#${b.id}">${plain(b.text)}</a></li>`).join('')}</ul>` : ''}</li>`;
    })
    .join('');
  const version = JSON.parse(await readFile(join(root, 'package.json'), 'utf8')).version;
  let commit = '';
  try {
    commit = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
  } catch {}
  return { css: codeCss('.sd-doc'), nav: `<ul>${nav}</ul>`, body, version, commit };
};

const standalone = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>spider-paint · Help</title><style>
body{margin:0;font:16px/1.6 system-ui,sans-serif;background:#f6f3ea;color:#102e30;display:grid;grid-template-columns:260px minmax(0,1fr)}
nav{position:sticky;top:0;height:100vh;overflow:auto;padding:20px;font-size:14px;border-right:1px solid #0002}nav ul{list-style:none;padding-left:12px;margin:4px 0}
main{padding:20px 5%;max-width:980px}pre{background:#0c2225;color:#e8efda;padding:14px;overflow:auto}table{border-collapse:collapse}td,th{border:1px solid #0002;padding:4px 8px;vertical-align:top}
<!--spider-docs:css--></style></head><body><nav><!--spider-docs:nav--></nav><main class="sd-doc"><!--spider-docs:body--><p><small><!--spider-docs:stamp--></small></p></main></body></html>`;

const run = async () => {
  const parts = await docsParts();
  const tpl = opt('--template') ? await readFile(opt('--template'), 'utf8') : standalone;
  const stamp = `Generated from <a href="https://github.com/Pengeszikra/spider-paint/tree/master/help">spider-paint/help</a> · v${esc(parts.version)}${parts.commit ? ` · <a href="https://github.com/Pengeszikra/spider-paint/commit/${parts.commit}">${parts.commit}</a>` : ''}`;
  const html = tpl
    .replace('<!--spider-docs:css-->', () => parts.css)
    .replace('<!--spider-docs:nav-->', () => parts.nav)
    .replace('<!--spider-docs:body-->', () => parts.body)
    .replace('<!--spider-docs:stamp-->', () => stamp);
  const out = opt('--out');
  if (out) await writeFile(out, html);
  else process.stdout.write(html);
};

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) run();
