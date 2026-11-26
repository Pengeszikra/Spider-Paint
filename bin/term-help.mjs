// The help in a terminal: the help/ folder's markdown drawn as text (src/md: the same files and colours as the page's
// help panel). A row of the sections on top, the section under it, scrolled with the keys or the wheel.
//   ↑ ↓ (k j) a line · PgUp PgDn (Space) a page · Home End (g G) · ← → (Tab, Shift+Tab, h l) the sections ·
//   a click on a section's name · Esc, ?, q: back to the view
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { toAnsi, visible } from '../src/md/markdown.js';
import { helpSections } from '../src/md/help.js';

const fg = (r, g, b) => `\x1b[38;2;${r};${g};${b}m`;
const bg = (r, g, b) => `\x1b[48;2;${r};${g};${b}m`;
const RESET = '\x1b[0m';
const fold = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

export const createHelpView = (root) => {
  const dir = join(root, 'help');
  const read = (f) => (existsSync(join(dir, f)) ? readFileSync(join(dir, f), 'utf8') : `# ${f}\n\nThis section is not there.`);
  const index = read('index.md');
  const sections = [{ file: 'index.md', title: 'Help' }, ...helpSections(index)];
  let at = 0, top = 0, width = 0, lines = [], marks = {}, tabs = [], pending = null;
  const layout = (cols) => {
    if (cols === width && lines.length) return;
    width = cols;
    marks = {};
    lines = toAnsi(read(sections[at].file), { width: Math.max(20, cols - 2), marks }).map((l) => ` ${l}`);
    if (pending) go(pending), (pending = null);
  };
  // to a place: a heading id, or the first line holding some words
  const go = ({ id, text }) => {
    if (id && marks[id] !== undefined) return void (top = Math.max(0, marks[id] - 1));
    if (text) {
      const key = fold(text.replace(/\s+/g, ' ').trim().slice(0, 24));
      const k = lines.findIndex((l) => fold(l.replace(/\x1b\[[0-9;]*m/g, '')).includes(key));
      if (k >= 0) top = Math.max(0, k - 2);
    }
  };
  const view = {
    open(file = 'index.md', place = null) {
      const k = Math.max(0, sections.findIndex((s) => s.file === file));
      if (k !== at || !lines.length) {
        at = k;
        width = 0; // (laid out again at the next draw, then the place is found)
        top = 0;
        pending = place;
      } else if (place) go(place);
    },
    get file() {
      return sections[at].file;
    },
    section(step) {
      at = (at + step + sections.length) % sections.length;
      width = 0;
      top = 0;
    },
    scroll(n, rows) {
      top = Math.max(0, Math.min(Math.max(0, lines.length - rows + 1), top + n));
    },
    /** The rows to draw: the section row, then the text (rows - 1 lines); each at most cols wide. */
    rows(cols, rows) {
      layout(cols);
      // the section row: their names, the current one lit; scrolled so the current one shows
      tabs = [];
      let x = 0, row = '';
      const names = sections.map((s, k) => ` ${s.title.replace(/\s*\(.*\)$/, '')} `);
      let first = 0;
      while (names.slice(first, at + 1).reduce((a, n) => a + n.length + 1, 0) > cols && first < at) first++;
      for (let k = first; k < sections.length && x + names[k].length <= cols; k++) {
        row += (k === at ? `${bg(47, 191, 201)}${fg(4, 24, 26)}\x1b[1m` : `${bg(26, 28, 24)}${fg(150, 154, 146)}`) + names[k] + RESET + ' ';
        tabs.push({ from: x, to: x + names[k].length, k });
        x += names[k].length + 1;
      }
      const out = [`${row}${bg(11, 11, 10)}${' '.repeat(Math.max(0, cols - x))}${RESET}`];
      top = Math.max(0, Math.min(top, Math.max(0, lines.length - (rows - 1) + 1)));
      for (let i = 0; i < rows - 1; i++) {
        const l = lines[top + i] ?? '';
        out.push(`${bg(11, 11, 10)}${l.replaceAll(RESET, RESET + bg(11, 11, 10))}${' '.repeat(Math.max(0, cols - visible(l)))}${RESET}`);
      }
      return out;
    },
    /** A key ({ key, shift }); true when it was the help's, 'close' to leave. */
    key({ key, shift }, rows) {
      const page = Math.max(1, rows - 3);
      if (key === 'Escape' || key === '?' || key === 'q') return 'close';
      if (key === 'ArrowDown' || key === 'j') return view.scroll(1, rows), true;
      if (key === 'ArrowUp' || key === 'k') return view.scroll(-1, rows), true;
      if (key === 'PageDown' || key === ' ') return view.scroll(page, rows), true;
      if (key === 'PageUp') return view.scroll(-page, rows), true;
      if (key === 'Home' || key === 'g') return (top = 0), true;
      if (key === 'End' || key === 'G') return view.scroll(1e9, rows), true;
      if (key === 'ArrowRight' || key === 'l' || (key === 'Tab' && !shift)) return view.section(1), true;
      if (key === 'ArrowLeft' || key === 'h' || (key === 'Tab' && shift)) return view.section(-1), true;
      return false;
    },
    /** A click on the section row (x: 0-based column). */
    click(x) {
      const t = tabs.find((t) => x >= t.from && x < t.to);
      if (t) (at = t.k), (width = 0), (top = 0);
      return Boolean(t);
    },
  };
  return view;
};
