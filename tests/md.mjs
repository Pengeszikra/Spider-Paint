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
console.log('markdown and code colours: OK');
