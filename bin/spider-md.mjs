#!/usr/bin/env node
// Markdown in colour in the terminal (src/md: the same reader and code colours as the help):
//   spider-md file.md [more.md …] [--width N] [--page]     (- reads stdin; spider-paint -md file.md does the same)
// A file that is not markdown (.js, .html, .json, .rs, .sh…) is shown as one coloured code block.
// --page: through `less -R` when it is longer than the screen. --plain: no colours (a pipe gets them unless asked).
import { readFileSync, realpathSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { extname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { toAnsi } from '../src/md/markdown.js';

const LANG = { '.js': 'js', '.mjs': 'js', '.cjs': 'js', '.jsx': 'js', '.ts': 'ts', '.tsx': 'ts', '.html': 'html', '.htm': 'html', '.svg': 'html', '.xml': 'html', '.css': 'css', '.json': 'json', '.3draft': 'json', '.sh': 'sh', '.bash': 'sh', '.zsh': 'sh', '.rs': 'rust', '.c': 'c', '.h': 'c', '.cpp': 'c', '.go': 'go', '.py': 'python', '.wat': 'wat', '.hexaw': 'wat' };

export const mdToTerminal = (text, { file = '', width = 100 } = {}) => {
  const lang = LANG[extname(file).toLowerCase()];
  const fence = '`'.repeat(Math.max(3, ...[...text.matchAll(/`{3,}/g)].map((m) => m[0].length + 1)));
  const md = lang ? `${fence}${lang}\n${text.replace(/\n$/, '')}\n${fence}` : text;
  return toAnsi(md, { width }).join('\n');
};

export const run = (argv = process.argv.slice(2)) => {
  const opt = (n) => {
    const i = argv.indexOf(`--${n}`);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const files = argv.filter((a, i) => (!a.startsWith('-') || a === '-') && argv[i - 1] !== '--width');
  if (!files.length) {
    console.error('spider-md file.md [more.md …] [--width N] [--page] [--plain]   (- reads stdin)');
    return 2;
  }
  const width = Math.max(20, Number(opt('width')) || Math.min(process.stdout.columns || 100, 120));
  let out = files
    .map((f) => {
      const text = f === '-' ? readFileSync(0, 'utf8') : readFileSync(f, 'utf8');
      return (files.length > 1 ? `\x1b[2m── ${f === '-' ? 'stdin' : basename(f)} ──\x1b[0m\n` : '') + mdToTerminal(text, { file: f, width });
    })
    .join('\n\n');
  if (argv.includes('--plain')) out = out.replace(/\x1b\[[0-9;]*m/g, '');
  const rows = process.stdout.rows || 0;
  if (argv.includes('--page') && process.stdout.isTTY && out.split('\n').length > rows) {
    const r = spawnSync('less', ['-R'], { input: `${out}\n`, stdio: ['pipe', 'inherit', 'inherit'] });
    if (!r.error) return 0;
  }
  process.stdout.write(`${out}\n`);
  return 0;
};

// run as a command (also through npm's link in node_modules/.bin), not when imported
const self = (() => { try { return realpathSync(process.argv[1] ?? '') === realpathSync(fileURLToPath(import.meta.url)); } catch { return false; } })();
if (self) process.exitCode = run();
