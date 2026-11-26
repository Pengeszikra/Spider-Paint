// The help: a folder of markdown files, index.md lists them ("- [Title](file.md)"). Shared by the page (the help panel,
// /help) and the terminal (bin/term-help.mjs). Pure: the caller reads the files.
import { parse, inline } from './markdown.js';

/** index.md -> [{ file, title }] (the list items that link to a .md file, in order) */
export const helpSections = (indexMd) => {
  const out = [];
  const walk = (blocks) => {
    for (const b of blocks) {
      if (b.type === 'list')
        for (const it of b.items) {
          const link = inline(it.text).find((s) => s.href && /\.md(#.*)?$/.test(s.href));
          if (link) out.push({ file: link.href.replace(/#.*$/, ''), title: inline(it.text).filter((s) => s.href === link.href).map((s) => s.text).join('') });
          walk(it.children);
        }
      if (b.type === 'quote') walk(b.blocks);
    }
  };
  walk(parse(indexMd));
  return out;
};

/** Plain-text blocks of a section for searching: [{ text, id (the heading above), heading }] */
export const helpBlocks = (md) => {
  const out = [];
  let id = '';
  const plain = (t) => inline(t).map((s) => s.text).join('');
  const walk = (blocks) => {
    for (const b of blocks) {
      if (b.type === 'h') ((id = b.id), out.push({ text: plain(b.text), id, heading: true }));
      else if (b.type === 'p') out.push({ text: plain(b.text), id });
      else if (b.type === 'list') for (const it of b.items) (out.push({ text: plain(it.text), id }), walk(it.children));
      else if (b.type === 'table') for (const r of b.rows) out.push({ text: r.map(plain).join(' · '), id });
      else if (b.type === 'quote') walk(b.blocks);
      else if (b.type === 'code') out.push({ text: b.text, id });
    }
  };
  walk(parse(md));
  return out;
};
