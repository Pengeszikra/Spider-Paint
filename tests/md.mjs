// The markdown reader and the code colours: nested languages, jsDoc types, the smallest HTML, terminal lines.
import assert from 'node:assert/strict';
import { highlight } from '../src/md/highlight.js';
import { parse, toHtml, toAnsi, inline, outline, visible } from '../src/md/markdown.js';

const styled = (tokens) => tokens.map(([t, s]) => (s ? `«${s}:${t}»` : t)).join('');
const has = (tokens, text, style) => tokens.some(([t, s]) => s === style && t.includes(text));

// html -> script -> js -> /** jsDoc */ -> {types}
const hard = highlight(`<div onclick="go(1)"><script type="module">
/**
 * @template T - Payload Type
 * @param {Extract<AM, { type: T }>} action - the action
 * @typedef {{ [K in AM['type']]: K }} Keys
 * @return {[ST, Quack<AM>]}
 */
const reducer = (st, action) => ({ ...st, n: \`x\${st.n + 1}\` });
</script><style>.a { color: #fff; }</style></div>`, 'html');
assert.ok(has(hard, 'div', 'tg') && has(hard, 'onclick', 'at'), 'html tags and attributes');
assert.ok(has(hard, 'go', 'fn'), 'the on… attribute is JavaScript');
assert.ok(has(hard, '@template', 'jd') && has(hard, '@param', 'jd'), 'jsDoc tags');
assert.ok(has(hard, 'T', 'jn') && has(hard, 'action', 'jn') && has(hard, 'Keys', 'jn'), 'jsDoc names');
assert.ok(has(hard, 'Extract', 'ty') && has(hard, 'AM', 'ty') && has(hard, 'in', 'rw'), 'the types inside {…}');
assert.ok(has(hard, "'type'", 'st'), 'a string literal type');
assert.ok(has(hard, 'const', 'rw') && has(hard, '...', 'op') && has(hard, '${', 'bk'), 'the script itself');
assert.ok(has(hard, 'color', 'at') && has(hard, '#fff', 'nm'), 'the <style> is CSS');
assert.ok(!has(hard, '<script', 'cm'), 'the script is not swallowed by a comment');
// js details
const js = highlight("if (/^a+$/.test(x)) return a / b; // done\nconst o = { key: 1, f() {} };", 'js');
assert.ok(has(js, '/^a+$/', 'rx'), 'a regex literal');
assert.ok(!has(js, '/ b', 'rx'), 'a division is not a regex');
assert.ok(has(js, '// done', 'cm') && has(js, 'key', 'at'), 'comments, object keys');
assert.ok(has(highlight('{"a": [1, true, null]}', 'json'), '"a"', 'at'), 'json keys');
assert.ok(has(highlight('npm run term -- globe # go', 'sh'), 'npm', 'fn'), 'a shell command');
assert.ok(has(highlight('fn main() { let x = 1; }', 'rust'), 'fn', 'rw'), 'rust words');
assert.deepEqual(highlight('plain', 'nolang'), [['plain', '']], 'unknown: plain');
assert.equal(styled(highlight('a', 'js')), 'a');

// inline
assert.deepEqual(inline('a **b** `c` [d](e)').map((s) => [s.text, !!s.b, !!s.code, s.href ?? '']), [['a ', false, false, ''], ['b', true, false, ''], [' ', false, false, ''], ['c', false, true, ''], [' ', false, false, ''], ['d', false, false, 'e']]);
assert.equal(inline('snake_case_word').length, 1, 'underscores inside a word are not italic');

// blocks
const md = `# Title\n\nSome *text* here\nand more.\n\n- one\n- two\n  - deeper\n\n| a | b |\n|---|--:|\n| 1 | 2 |\n\n\`\`\`js\nconst x = 1;\n\`\`\`\n\n> quoted\n\n## Title`;
const blocks = parse(md);
assert.deepEqual(blocks.map((b) => b.type), ['h', 'p', 'list', 'table', 'code', 'quote', 'h']);
assert.equal(blocks[1].text, 'Some *text* here and more.');
assert.equal(blocks[2].items[1].children[0].type, 'list', 'a nested list');
assert.deepEqual(outline(md).map((h) => h.id), ['title', 'title-1'], 'unique heading ids');
const html = toHtml(md);
assert.match(html, /<h1 id="title">Title<\/h1>/);
assert.match(html, /<pre data-lang="js"><code><rw>const<\/rw> x <op>=<\/op> <nm>1<\/nm><pn>;<\/pn><\/code><\/pre>/, 'the smallest code HTML');
assert.match(html, /<td align="right">2<\/td>/);
assert.ok(!/<script/i.test(toHtml('<script>alert(1)</script>')), 'raw HTML is text');
// terminal
const marks = {};
const lines = toAnsi(md, { width: 30, marks });
assert.ok(lines.every((l) => visible(l) <= 30), 'no line is wider than the width');
assert.ok(lines.some((l) => l.includes('\x1b[38;2;')), '24-bit colours');
assert.equal(marks.title, 0, 'a heading’s line');
assert.ok(toAnsi('| a | b |\n|---|---|\n| ' + 'x'.repeat(60) + ' | y |', { width: 30 }).every((l) => visible(l) <= 30), 'a wide table folds');
// spider-md / spider-paint -md: markdown (or a code file) in colour on stdout
{
  const { spawnSync } = await import('node:child_process');
  const { mdToTerminal } = await import('../bin/spider-md.mjs');
  assert.match(mdToTerminal('const x = 1;', { file: 'a.js', width: 40 }), /38;2;172;214;65mconst/, 'a .js file is one coloured code block');
  const cwd = new URL('..', import.meta.url);
  const a = spawnSync(process.execPath, ['bin/spider-md.mjs', 'help/writing.md', '--width', '60'], { cwd, encoding: 'utf8' });
  assert.equal(a.status, 0, a.stderr);
  assert.ok(a.stdout.includes('\x1b[38;2;') && a.stdout.split('\n').every((l) => visible(l) <= 60), 'coloured, wrapped to the width');
  const b = spawnSync(process.execPath, ['bin/spider-paint.mjs', '-md', '-', '--plain'], { cwd, input: '# Hi *there*', encoding: 'utf8' });
  assert.equal(b.status, 0, b.stderr);
  assert.match(b.stdout, /^ Hi there\n ━+/, 'spider-paint -md reads stdin, --plain drops the colours, one character of room on the left');
  assert.ok(a.stdout.split('\n').every((l) => !l || (l.startsWith(' ') && visible(l) <= 59)), 'one character of room on each side');
}
// pictures in the terminal: PNG and GIF read here, drawn in half blocks; the markdown places them on their own lines
{
  const { readPng, readGif, imageLines } = await import('../bin/term-image.mjs');
  const { encodeGif } = await import('../src/gif.js');
  const { deflateSync } = await import('node:zlib');
  const W = 8, H = 8, data = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) data.set(x < 4 ? [255, 0, 0, 255] : [0, 0, 255, y < 4 ? 255 : 0], (y * W + x) * 4);
  const gif = readGif(Buffer.from(encodeGif([{ width: W, height: H, data }])));
  assert.deepEqual([gif.width, gif.height], [8, 8]);
  assert.deepEqual([...gif.rgba.slice(0, 4)], [255, 0, 0, 255], 'a GIF pixel');
  assert.equal(gif.rgba[(7 * W + 7) * 4 + 3], 0, 'a see-through GIF pixel');
  const raw = Buffer.alloc(H * (W * 4 + 1));
  for (let y = 0; y < H; y++) Buffer.from(data.buffer, y * W * 4, W * 4).copy(raw, y * (W * 4 + 1) + 1);
  const chunk = (name, d) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(d.length);
    return Buffer.concat([len, Buffer.from(name, 'latin1'), d, Buffer.alloc(4)]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0), ihdr.writeUInt32BE(H, 4), (ihdr[8] = 8), (ihdr[9] = 6);
  const png = readPng(Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]));
  assert.deepEqual([...png.rgba.slice((2 * W + 5) * 4, (2 * W + 5) * 4 + 4)], [0, 0, 255, 255], 'a PNG pixel');
  const lines = imageLines(png, { cols: 4, rows: 2 });
  assert.equal(lines.length, 2, 'two pixels a cell: 4 rows of pixels, 2 lines');
  assert.ok(lines.every((l) => visible(l) === 4), 'as wide as asked');
  assert.match(lines[0], /38;2;255;0;0/, 'the red half');
  const md = toAnsi('Look: ![pic](a.png) there', { width: 40, image: (src, alt, cols) => (src === 'a.png' ? ['[PIC]'] : null) });
  assert.deepEqual(md.map((l) => l.replace(/\x1b\[[0-9;]*m/g, '')), ['Look: ', '[PIC]', 'pic', 'there'].map((t) => t.trimEnd()), 'the picture on its own lines, its alt as the caption');
}
{
  // the help as one web page (scripts/docs-page.mjs, the Tüskék és Gyökerek docs page): every anchor link lands
  const { docsParts } = await import('../scripts/docs-page.mjs');
  const { nav, body } = await docsParts();
  const ids = new Set([...body.matchAll(/ id="([^"]+)"/g)].map((m) => m[1]));
  const hrefs = [...(nav + body).matchAll(/href="#([^"]+)"/g)].map((m) => m[1]);
  assert.ok(hrefs.length > 20, 'the side menu and the cross links');
  assert.deepEqual(hrefs.filter((h) => !ids.has(h)), [], 'no anchor without its heading');
  assert.ok(!/href="[a-z]+\.md/.test(body), 'no .md links left');
}
console.log('markdown and code colours: OK');
