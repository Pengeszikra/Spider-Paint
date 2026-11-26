// A small markdown reader with two outputs from the same blocks: the smallest HTML (the code blocks coloured by
// ./highlight.js, with two-letter tags the stylesheet colours) and terminal lines (24-bit colours, wrapped to a width).
// Blocks: # headings (with ids), paragraphs, - / 1. lists (nested by indent), > quotes, | tables |, ``` fences, ---,
// images. Inline: `code`, **bold**, *italic* / _italic_, [links](…), ![images](…), \escapes. No raw HTML, no code runs.
import { highlight, PALETTE } from './highlight.js';

// ---- inline: segments { text, b, i, code, href, img }
export const inline = (src) => {
  const out = [];
  let buf = '', b = false, it = false;
  const flush = () => {
    if (buf) out.push({ text: buf, ...(b ? { b } : {}), ...(it ? { i: it } : {}) });
    buf = '';
  };
  for (let k = 0; k < src.length; ) {
    const c = src[k], rest = src.slice(k);
    if (c === '\\' && /[\\`*_[\]()#+\-.!|>~{}]/.test(src[k + 1] ?? '')) {
      buf += src[k + 1];
      k += 2;
      continue;
    }
    if (c === '`') {
      const ticks = /^`+/.exec(rest)[0];
      const end = src.indexOf(ticks, k + ticks.length);
      if (end > 0) {
        flush();
        out.push({ text: src.slice(k + ticks.length, end).replace(/^ (.*) $/, '$1'), code: true });
        k = end + ticks.length;
        continue;
      }
    }
    const img = /^!\[([^\]]*)\]\(([^)\s]+)(?:\s+"([^"]*)")?\)/.exec(rest);
    if (img) {
      flush();
      out.push({ text: img[1], img: img[2] });
      k += img[0].length;
      continue;
    }
    const link = /^\[((?:[^\]\\]|\\.)*)\]\(([^)\s]+)(?:\s+"([^"]*)")?\)/.exec(rest);
    if (link) {
      flush();
      for (const s of inline(link[1])) out.push({ ...s, href: link[2], ...(b ? { b } : {}), ...(it ? { i: it } : {}) });
      k += link[0].length;
      continue;
    }
    const auto = /^<(https?:\/\/[^>\s]+)>/.exec(rest);
    if (auto) {
      flush();
      out.push({ text: auto[1], href: auto[1] });
      k += auto[0].length;
      continue;
    }
    if (rest.startsWith('**') || rest.startsWith('__')) {
      const mark = rest.slice(0, 2);
      if (b || src.indexOf(mark, k + 2) > k + 2) {
        flush();
        b = !b;
        k += 2;
        continue;
      }
    }
    if ((c === '*' || c === '_') && src[k + 1] !== c) {
      const before = src[k - 1] ?? ' ', after = src[k + 1] ?? ' ';
      const opening = !it && !/\s/.test(after) && (c === '*' || /[\s(\[“"'-]/.test(before) || k === 0) && src.indexOf(c, k + 1) > k + 1;
      const closing = it === c && !/\s/.test(before) && (c === '*' || !/\w/.test(after));
      if (opening || closing) {
        flush();
        it = opening ? c : false;
        k++;
        continue;
      }
    }
    buf += c;
    k++;
  }
  flush();
  return out;
};

// ---- blocks
export const slug = (text) => text.toLowerCase().replace(/<[^>]+>|[`*_]/g, '').replace(/[^\p{L}\p{N}\s-]/gu, '').trim().replace(/\s+/g, '-') || 'section';

/** markdown -> [{ type: 'h', level, text, id } | { type: 'p', text } | { type: 'code', lang, text } | { type: 'list', ordered, items: [{ text, children }] } | { type: 'quote', blocks } | { type: 'table', head, align, rows } | { type: 'hr' }] */
export const parse = (md, ids = new Map()) => {
  const lines = String(md).replace(/\r\n?/g, '\n').split('\n');
  const blocks = [];
  const unique = (s) => {
    const n = ids.get(s) ?? 0;
    ids.set(s, n + 1);
    return n ? `${s}-${n}` : s;
  };
  for (let k = 0; k < lines.length; ) {
    const line = lines[k];
    if (!line.trim()) {
      k++;
      continue;
    }
    const fence = /^(\s*)(`{3,}|~{3,})\s*([^\s`]*)?.*$/.exec(line);
    if (fence) {
      const body = [];
      let j = k + 1;
      for (; j < lines.length && !new RegExp(`^\\s*${fence[2][0]}{${fence[2].length},}\\s*$`).test(lines[j]); j++) body.push(lines[j].slice(Math.min(fence[1].length, /^\s*/.exec(lines[j])[0].length)));
      blocks.push({ type: 'code', lang: fence[3] ?? '', text: body.join('\n') });
      k = j + 1;
      continue;
    }
    const h = /^(#{1,6})\s+(.*?)\s*#*\s*$/.exec(line);
    if (h) {
      blocks.push({ type: 'h', level: h[1].length, text: h[2], id: unique(slug(h[2])) });
      k++;
      continue;
    }
    if (/^\s{0,3}([-*_])(\s*\1){2,}\s*$/.test(line)) {
      blocks.push({ type: 'hr' });
      k++;
      continue;
    }
    if (/^\s*>/.test(line)) {
      const inner = [];
      for (; k < lines.length && /^\s*>/.test(lines[k]); k++) inner.push(lines[k].replace(/^\s*>\s?/, ''));
      blocks.push({ type: 'quote', blocks: parse(inner.join('\n'), ids) });
      continue;
    }
    if (/^\s*\|.*\|\s*$/.test(line) && /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(lines[k + 1] ?? '')) {
      const cells = (l) => l.trim().replace(/^\||\|$/g, '').split(/(?<!\\)\|/).map((c) => c.trim().replace(/\\\|/g, '|'));
      const head = cells(line);
      const align = cells(lines[k + 1]).map((c) => (/^:-+:$/.test(c) ? 'c' : /-:$/.test(c) ? 'r' : ''));
      const rows = [];
      for (k += 2; k < lines.length && /^\s*\|/.test(lines[k]); k++) rows.push(cells(lines[k]));
      blocks.push({ type: 'table', head, align, rows });
      continue;
    }
    const item = /^(\s*)([-*+]|\d+[.)])\s+/.exec(line);
    if (item) {
      // a list: its items, the deeper lines belong to the item (a nested list)
      const base = item[1].length, ordered = /\d/.test(item[2]);
      const items = [];
      while (k < lines.length) {
        const m = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/.exec(lines[k]);
        if (!m || m[1].length !== base) break;
        const text = [m[3]], sub = [];
        for (k++; k < lines.length; k++) {
          const l = lines[k];
          if (!l.trim()) {
            if (/^\s+\S/.test(lines[k + 1] ?? '') && /^\s*/.exec(lines[k + 1])[0].length > base) {
              sub.push('');
              continue;
            }
            break;
          }
          const ind = /^\s*/.exec(l)[0].length;
          if (ind > base && /^\s*([-*+]|\d+[.)])\s+/.test(l)) sub.push(l.slice(base + 2));
          else if (ind > base || (!/^\s*([-*+]|\d+[.)])\s+/.test(l) && !sub.length && !/^\s*(#|>|\||```)/.test(l))) (sub.length ? sub : text).push(sub.length ? l.slice(base + 2) : l.trim());
          else break;
        }
        items.push({ text: text.join(' '), children: sub.length ? parse(sub.join('\n'), ids) : [] });
      }
      blocks.push({ type: 'list', ordered, items });
      continue;
    }
    // a paragraph: up to a blank line or another block
    const para = [line.trim()];
    for (k++; k < lines.length; k++) {
      const l = lines[k];
      if (!l.trim() || /^(#{1,6}\s|\s*>|\s*(`{3,}|~{3,})|\s*([-*+]|\d+[.)])\s+|\s*\|.*\|\s*$)/.test(l)) break;
      para.push(l.trim());
    }
    blocks.push({ type: 'p', text: para.join(' ') });
  }
  return blocks;
};

// ---- HTML: as small as it can be
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
export const inlineHtml = (src, { link = (h) => h } = {}) =>
  inline(src)
    .map((s) => {
      if (s.img) return `<img src="${esc(link(s.img))}" alt="${esc(s.text)}">`;
      let t = s.code ? `<code>${esc(s.text)}</code>` : esc(s.text);
      if (s.i) t = `<i>${t}</i>`;
      if (s.b) t = `<b>${t}</b>`;
      return s.href ? `<a href="${esc(link(s.href))}"${/^https?:/.test(s.href) ? ' target="_blank" rel="noopener"' : ''}>${t}</a>` : t;
    })
    .join('');

/** The tokens of a code block as HTML: <rw>const</rw> … (the tags are the styles; plain text stays bare). */
export const codeHtml = (text, lang) => highlight(text, lang).map(([t, s]) => (s ? `<${s}>${esc(t)}</${s}>` : esc(t))).join('');

export const toHtml = (md, opts = {}) => {
  const blocks = Array.isArray(md) ? md : parse(md);
  const il = (t) => inlineHtml(t, opts);
  const html = (bs) =>
    bs
      .map((b) => {
        if (b.type === 'h') return `<h${b.level} id="${b.id}">${il(b.text)}</h${b.level}>`;
        if (b.type === 'p') return `<p>${il(b.text)}</p>`;
        if (b.type === 'hr') return '<hr>';
        if (b.type === 'code') return `<pre${b.lang ? ` data-lang="${esc(b.lang)}"` : ''}><code>${codeHtml(b.text, b.lang)}</code></pre>`;
        if (b.type === 'quote') return `<blockquote>${html(b.blocks)}</blockquote>`;
        if (b.type === 'list') return `<${b.ordered ? 'ol' : 'ul'}>${b.items.map((it) => `<li>${il(it.text)}${html(it.children)}</li>`).join('')}</${b.ordered ? 'ol' : 'ul'}>`;
        if (b.type === 'table') {
          const al = (k) => (b.align[k] === 'c' ? ' align="center"' : b.align[k] === 'r' ? ' align="right"' : '');
          return `<table><tr>${b.head.map((c, k) => `<th${al(k)}>${il(c)}</th>`).join('')}</tr>${b.rows.map((r) => `<tr>${r.map((c, k) => `<td${al(k)}>${il(c)}</td>`).join('')}</tr>`).join('')}</table>`;
        }
        return '';
      })
      .join('\n');
  return html(blocks);
};

/** The stylesheet for the code colours (scope: a selector the rendered markdown sits in). */
export const codeCss = (scope = '.md') => Object.entries(PALETTE).map(([k, c]) => `${scope} ${k} { color: ${c}; }`).join('\n');

// ---- terminal lines: 24-bit colours, wrapped to `width`
const rgb = (hex) => hex.replace('#', '').match(/../g).map((x) => parseInt(x, 16)).join(';');
const fg = (hex) => `\x1b[38;2;${rgb(hex)}m`;
const bgc = (hex) => `\x1b[48;2;${rgb(hex)}m`;
const RESET = '\x1b[0m';
const TEXT = '#c9cdc2', DIM = '#8a8e86', HEAD = ['#f0c27a', '#e8a55a', '#d9b98a', '#c9b48f', '#c9b48f', '#c9b48f'], CODE_BG = '#181a1c', LINK = '#7fb7ff', INLINE_CODE = '#9fd4ff';
export const visible = (s) => s.replace(/\x1b\[[0-9;]*m/g, '').length;

// words with their look -> lines no wider than width (a word longer than the width is cut)
const wrapWords = (words, width, first = '', next = first) => {
  const lines = [];
  let line = first, len = visible(first), empty = true;
  for (const w of words) {
    if (w.space) {
      if (!empty) (line += ' '), len++;
      continue;
    }
    let text = w.text;
    while (text.length) {
      const room = width - len;
      if (text.length <= room) {
        line += w.style + text + RESET;
        len += text.length;
        empty = false;
        text = '';
      } else if (!empty && text.length <= width - visible(next)) {
        lines.push(line.replace(/ +$/, ''));
        line = next;
        len = visible(next);
        empty = true;
      } else {
        const cut = Math.max(1, room);
        line += w.style + text.slice(0, cut) + RESET;
        lines.push(line);
        line = next;
        len = visible(next);
        empty = true;
        text = text.slice(cut);
      }
    }
  }
  if (!empty || !lines.length) lines.push(line.replace(/ +$/, ''));
  return lines;
};
const styleOf = (s, base = TEXT) => {
  let st = s.code ? fg(INLINE_CODE) : s.href ? `${fg(LINK)}\x1b[4m` : fg(base);
  if (s.b) st += '\x1b[1m';
  if (s.i) st += '\x1b[3m';
  return st;
};
const wordsOf = (src, base) =>
  inline(src).flatMap((s) => {
    if (s.img) return [{ text: `[image: ${s.text || s.img}]`, style: fg(DIM) }];
    const st = styleOf(s, base);
    return s.text.split(/( +)/).filter(Boolean).map((w) => (/^ +$/.test(w) ? { space: true } : { text: w, style: st }));
  });

/** markdown -> terminal lines (each at most `width` visible characters); `marks` gets { id: line } of the headings. */
export const toAnsi = (md, { width = 80, marks = {} } = {}) => {
  const blocks = Array.isArray(md) ? md : parse(md);
  const out = [];
  const para = (text, first, next, base) => out.push(...wrapWords(wordsOf(text, base), width, first, next));
  const walk = (bs, indent = '') => {
    for (const b of bs) {
      if (out.length && out[out.length - 1] !== indent.replace(/\s+$/, '') && b.type !== 'list') out.push(indent.replace(/\s+$/, ''));
      if (b.type === 'h') {
        marks[b.id] = out.length;
        const st = `${fg(HEAD[b.level - 1])}\x1b[1m`;
        out.push(...wrapWords(wordsOf(b.text, HEAD[b.level - 1]).map((w) => (w.space ? w : { ...w, style: st + w.style })), width, indent));
        if (b.level <= 2) out.push(indent + fg(HEAD[b.level - 1]) + (b.level === 1 ? '━' : '─').repeat(Math.min(width - visible(indent), Math.max(8, visible(out[out.length - 1]) - visible(indent)))) + RESET);
      } else if (b.type === 'p') para(b.text, indent, indent);
      else if (b.type === 'hr') out.push(indent + fg(DIM) + '─'.repeat(width - visible(indent)) + RESET);
      else if (b.type === 'quote') {
        const bar = `${indent}${fg('#5a6a5a')}│${RESET} `;
        walk(b.blocks, bar);
      } else if (b.type === 'list') {
        b.items.forEach((it, k) => {
          const mark = b.ordered ? `${k + 1}.` : '•';
          para(it.text, `${indent}${fg(DIM)}${mark}${RESET} `, `${indent}${' '.repeat(mark.length + 1)}`);
          if (it.children.length) walk(it.children, `${indent}${' '.repeat(mark.length + 1)}`);
        });
      } else if (b.type === 'code') {
        const inner = width - visible(indent) - 2;
        const tok = highlight(b.text, b.lang);
        // tokens -> lines, cut at the width (code is not word-wrapped: a long line goes on, marked ↪)
        let line = [], len = 0;
        const lines = [];
        const end = () => (lines.push({ parts: line, len }), (line = []), (len = 0));
        for (const [t, s] of tok)
          for (const part of t.split(/(\n)/)) {
            if (part === '\n') {
              end();
              continue;
            }
            let rest = part;
            while (rest.length) {
              const room = inner - len;
              if (rest.length <= room) {
                line.push([rest, s]);
                len += rest.length;
                rest = '';
              } else {
                line.push([rest.slice(0, room), s]);
                len += room;
                end();
                line.push(['↪ ', 'cm']);
                len = 2;
                rest = rest.slice(room);
              }
            }
          }
        end();
        if (b.lang) out.push(`${indent}${fg(DIM)}${b.lang}${RESET}`);
        for (const l of lines) out.push(`${indent}${bgc(CODE_BG)} ${l.parts.map(([t, s]) => fg(s ? PALETTE[s] : TEXT) + t).join('')}${' '.repeat(Math.max(0, inner - l.len))} ${RESET}`);
      } else if (b.type === 'table') {
        const cols = b.head.length;
        const plain = (c) => inline(c).map((s) => s.text).join('');
        const widths = [...Array(cols).keys()].map((k) => Math.max(plain(b.head[k] ?? '').length, ...b.rows.map((r) => plain(r[k] ?? '').length)));
        const room = width - visible(indent);
        if (widths.reduce((a, w) => a + w + 3, 1) <= room) {
          // a grid
          const cell = (c, k, base, bold) => {
            const ws = wordsOf(c ?? '', base);
            const text = ws.map((w) => (w.space ? ' ' : w.style + (bold ? '\x1b[1m' : '') + w.text + RESET)).join('');
            return text + ' '.repeat(Math.max(0, widths[k] - visible(text)));
          };
          const sep = `${fg(DIM)} │ ${RESET}`;
          out.push(indent + ' ' + b.head.map((c, k) => cell(c, k, HEAD[2], true)).join(sep));
          out.push(indent + fg(DIM) + '─'.repeat(Math.min(room, widths.reduce((a, w) => a + w + 3, 1))) + RESET);
          for (const r of b.rows) out.push(indent + ' ' + widths.map((_, k) => cell(r[k], k, TEXT)).join(sep));
        } else {
          // too wide: each row as its first cell, then "head: cell" lines under it
          for (const r of b.rows) {
            para(r[0] ?? '', indent, indent, HEAD[2]);
            for (let k = 1; k < cols; k++) if ((r[k] ?? '').trim()) para(`${plain(b.head[k]) ? `${b.head[k]}: ` : ''}${r[k]}`, `${indent}  `, `${indent}    `);
          }
        }
      }
    }
  };
  walk(blocks);
  return out;
};

/** The headings as an outline: [{ level, text, id }]. */
export const outline = (md) => (Array.isArray(md) ? md : parse(md)).filter((b) => b.type === 'h').map(({ level, text, id }) => ({ level, text, id }));
