#!/usr/bin/env node
// Markdown in colour in the terminal (src/md: the same reader and code colours as the help):
//   spider-md file.md [more.md …] [--width N] [--page]     (- reads stdin; spider-paint -md file.md does the same)
// A file that is not markdown (.js, .html, .json, .rs, .sh…) is shown as one coloured code block.
// Pictures (![alt](file.png), https://…) are drawn in half blocks (--image-rows N, --no-images).
// --page: through `less -R` when it is longer than the screen. --plain: no colours (a pipe gets them unless asked).
import { readFileSync, realpathSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { extname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { toAnsi, parse, inline } from '../src/md/markdown.js';
import { dirname, resolve as resolvePath } from 'node:path';
import { decodeImage, imageLines, closeImages } from './term-image.mjs';

const LANG = { '.js': 'js', '.mjs': 'js', '.cjs': 'js', '.jsx': 'js', '.ts': 'ts', '.tsx': 'ts', '.html': 'html', '.htm': 'html', '.svg': 'html', '.xml': 'html', '.css': 'css', '.json': 'json', '.3draft': 'json', '.sh': 'sh', '.bash': 'sh', '.zsh': 'sh', '.rs': 'rust', '.c': 'c', '.h': 'c', '.cpp': 'c', '.go': 'go', '.py': 'python', '.wat': 'wat', '.hexaw': 'wat' };

export const mdToTerminal = (text, { file = '', width = 100, images = null, rows = 20 } = {}) => {
  const lang = LANG[extname(file).toLowerCase()];
  const fence = '`'.repeat(Math.max(3, ...[...text.matchAll(/`{3,}/g)].map((m) => m[0].length + 1)));
  const md = lang ? `${fence}${lang}\n${text.replace(/\n$/, '')}\n${fence}` : text;
  const image = images ? (src, alt, cols) => (images.get(src) ? imageLines(images.get(src), { cols, rows }) : null) : null;
  // one character of room on each side: the text is laid out two narrower and every line starts with a space
  return toAnsi(md, { width: Math.max(10, width - 2), image }).map((l) => (l ? ` ${l}` : l)).join('\n');
};

// the pictures a markdown text shows: read (a path next to the file, or https://…) and decoded, before the text is laid out
const picturesOf = (md) => {
  const srcs = new Set();
  const walk = (blocks) => {
    for (const b of blocks) {
      if (b.type === 'p') for (const s of inline(b.text)) if (s.img) srcs.add(s.img);
      if (b.type === 'list') for (const it of b.items) (inline(it.text).forEach((s) => s.img && srcs.add(s.img)), walk(it.children));
      if (b.type === 'quote') walk(b.blocks);
    }
  };
  walk(parse(md));
  return [...srcs];
};
export const loadPictures = async (md, file) => {
  const map = new Map();
  for (const src of picturesOf(md)) {
    try {
      let buf;
      if (/^https?:\/\//.test(src)) {
        const r = await fetch(src, { signal: AbortSignal.timeout(8000) });
        if (!r.ok) continue;
        buf = Buffer.from(await r.arrayBuffer());
      } else if (/^data:/.test(src)) buf = Buffer.from(src.split(',')[1] ?? '', /;base64,/.test(src) ? 'base64' : 'utf8');
      else buf = readFileSync(resolvePath(file && file !== '-' ? dirname(file) : '.', decodeURIComponent(src.replace(/[?#].*$/, ''))));
      const img = await decodeImage(buf, src);
      if (img) map.set(src, img);
    } catch {} // (a missing picture keeps its alt text)
  }
  return map;
};

export const run = async (argv = process.argv.slice(2)) => {
  const opt = (n) => {
    const i = argv.indexOf(`--${n}`);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const files = argv.filter((a, i) => (!a.startsWith('-') || a === '-') && !['--width', '--image-rows'].includes(argv[i - 1]));
  if (!files.length) {
    console.error('spider-md file.md [more.md …] [--width N] [--page] [--plain]   (- reads stdin)');
    return 2;
  }
  const width = Math.max(20, Number(opt('width')) || Math.min(process.stdout.columns || 100, 120));
  const pics = !argv.includes('--no-images') && !argv.includes('--plain');
  const rows = Math.max(6, Math.min(Number(opt('image-rows')) || 20, (process.stdout.rows || 40) - 4));
  const parts = [];
  for (const f of files) {
    const text = f === '-' ? readFileSync(0, 'utf8') : readFileSync(f, 'utf8');
    const images = pics && !LANG[extname(f).toLowerCase()] ? await loadPictures(text, f) : null;
    parts.push((files.length > 1 ? `\x1b[2m── ${f === '-' ? 'stdin' : basename(f)} ──\x1b[0m\n` : '') + mdToTerminal(text, { file: f, width, images, rows }));
  }
  await closeImages();
  let out = parts.join('\n\n');
  if (argv.includes('--plain')) out = out.replace(/\x1b\[[0-9;]*m/g, '');
  if (argv.includes('--page') && process.stdout.isTTY && out.split('\n').length > (process.stdout.rows || 0)) {
    const r = spawnSync('less', ['-R'], { input: `${out}\n`, stdio: ['pipe', 'inherit', 'inherit'] });
    if (!r.error) return 0;
  }
  process.stdout.write(`${out}\n`);
  return 0;
};

// run as a command (also through npm's link in node_modules/.bin), not when imported
const self = (() => { try { return realpathSync(process.argv[1] ?? '') === realpathSync(fileURLToPath(import.meta.url)); } catch { return false; } })();
if (self) run().then((code) => (process.exitCode = code));
