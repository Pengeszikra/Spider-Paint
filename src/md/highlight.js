// Code-block colouring that does not give up when the languages nest: a ```html block whose <script> holds JavaScript whose
// /** jsDoc */ holds {TypeScript types} is coloured all the way down. Region by region: each language finds where its
// inner language starts and ends (a fence, </script>, the end of a comment, the matching brace) and hands that part on.
// The result is a flat list of [text, style] pairs; style '' is plain text. No DOM, no node: the same tokens become the
// smallest HTML (toHtml in ./markdown.js) or terminal colours (toAnsi).
//
// (two-letter tags that are no HTML element: not br, which would break the line)
// styles: rw reserved word · st string · nm number · cm comment · bk bracket · pn punctuation · op operator · ty type ·
// fn call · cl a Capitalized name (class, component) · tg tag · at attribute / property name · av attribute value ·
// jd jsDoc tag (@param) · jn jsDoc name · lt literal (true, null, this) · rx regular expression · es escape · vr variable

const push = (out, text, style = '') => {
  if (!text) return;
  const last = out[out.length - 1];
  if (last && last[1] === style) last[0] += text;
  else out.push([text, style]);
};

// the end of a bracket that opens at `at` (counts nesting, skips strings)
const closing = (src, at, open = '{', close = '}') => {
  let depth = 0;
  for (let i = at; i < src.length; i++) {
    const c = src[i];
    if (c === '"' || c === "'" || c === '`') {
      const q = c;
      for (i++; i < src.length && src[i] !== q; i++) if (src[i] === '\\') i++;
      continue;
    }
    if (c === open) depth++;
    else if (c === close && --depth === 0) return i;
  }
  return src.length - 1;
};

// ---- JavaScript (and TypeScript's few extra words)
const JS_RW = new Set('await break case catch class const continue debugger default delete do else export extends finally for from function if import in instanceof let new of return static super switch throw try typeof var void while with yield async get set as satisfies interface type enum implements declare namespace keyof readonly abstract private protected public'.split(' '));
const JS_LT = new Set('true false null undefined this NaN Infinity arguments globalThis'.split(' '));
const IDENT = /[A-Za-z_$À-￿][\w$À-￿]*/y;
const NUMBER = /(?:0[xX][\da-fA-F_]+|0[bB][01_]+|0[oO][0-7_]+|(?:\d[\d_]*\.?[\d_]*|\.\d[\d_]*)(?:[eE][+-]?\d+)?)n?/y;
const OPERATOR = /=>|\.\.\.|\?\?=?|\?\.|\*\*=?|&&=?|\|\|=?|===?|!==?|>>>=?|<<=?|>>=?|[+\-*/%&|^<>!=~?:]=?/y;

export const lexJs = (src, out = []) => {
  let i = 0, prev = 'start'; // prev: what came last, to tell a / regex from a division
  const at = (re) => ((re.lastIndex = i), re.exec(src)?.[0]);
  while (i < src.length) {
    const c = src[i], d = src[i + 1];
    if (/\s/.test(c)) {
      const m = /\s+/y;
      m.lastIndex = i;
      const w = m.exec(src)[0];
      push(out, w);
      i += w.length;
      continue;
    }
    if (c === '/' && d === '/') {
      const end = src.indexOf('\n', i);
      const e = end < 0 ? src.length : end;
      push(out, src.slice(i, e), 'cm');
      i = e;
      continue;
    }
    if (c === '/' && d === '*') {
      const end = src.indexOf('*/', i + 2);
      const e = end < 0 ? src.length : end + 2;
      if (src[i + 2] === '*' && src[i + 3] !== '/') lexJsDoc(src.slice(i, e), out);
      else push(out, src.slice(i, e), 'cm');
      i = e;
      continue;
    }
    if (c === '"' || c === "'") {
      let j = i + 1;
      for (; j < src.length && src[j] !== c && src[j] !== '\n'; j++) if (src[j] === '\\') j++;
      push(out, src.slice(i, j + 1), 'st');
      i = j + 1;
      prev = 'value';
      continue;
    }
    if (c === '`') {
      i = lexTemplate(src, i, out);
      prev = 'value';
      continue;
    }
    if (c === '/' && (prev === 'start' || prev === 'op' || prev === 'rw')) {
      // a regular expression literal
      let j = i + 1, cls = false;
      for (; j < src.length && src[j] !== '\n'; j++) {
        if (src[j] === '\\') j++;
        else if (src[j] === '[') cls = true;
        else if (src[j] === ']') cls = false;
        else if (src[j] === '/' && !cls) break;
      }
      if (src[j] === '/') {
        let k = j + 1;
        while (/[a-z]/.test(src[k] ?? '')) k++;
        push(out, src.slice(i, k), 'rx');
        i = k;
        prev = 'value';
        continue;
      }
    }
    const num = /\d/.test(c) || (c === '.' && /\d/.test(d ?? '')) ? at(NUMBER) : null;
    if (num) {
      push(out, num, 'nm');
      i += num.length;
      prev = 'value';
      continue;
    }
    const word = at(IDENT);
    if (word) {
      const after = src.slice(i + word.length).match(/^\s*(\(|=>|<)?/)?.[1];
      const dot = src[i - 1] === '.' && src[i - 2] !== '.'; // (a property; ...spread is not)
      const style = JS_RW.has(word) && !dot ? 'rw' : JS_LT.has(word) && !dot ? 'lt' : after === '(' ? 'fn' : /^[A-Z]/.test(word) ? 'cl' : dot ? 'at' : /^\s*:(?!:)/.test(src.slice(i + word.length)) && /[{,]\s*$/.test(src.slice(Math.max(0, i - 40), i)) ? 'at' : '';
      push(out, word, style);
      i += word.length;
      prev = style === 'rw' ? (['return', 'typeof', 'case', 'in', 'of', 'new', 'delete', 'void', 'throw', 'yield', 'await', 'else', 'do'].includes(word) ? 'rw' : 'value') : 'value';
      continue;
    }
    if ('(){}[]'.includes(c)) {
      push(out, c, 'bk');
      i++;
      prev = ')]}'.includes(c) ? 'value' : 'start';
      continue;
    }
    if (c === '.' && d === '.' && src[i + 2] === '.') {
      push(out, '...', 'op');
      i += 3;
      prev = 'op';
      continue;
    }
    if (c === ';' || c === ',' || c === '.') {
      push(out, c, 'pn');
      i++;
      prev = c === '.' ? 'dot' : 'start';
      continue;
    }
    const op = at(OPERATOR);
    if (op) {
      push(out, op, 'op');
      i += op.length;
      prev = 'op';
      continue;
    }
    push(out, c);
    i++;
  }
  return out;
};

// `text ${expression} text`: the expressions are JavaScript again
const lexTemplate = (src, start, out) => {
  let i = start + 1, from = start;
  while (i < src.length) {
    if (src[i] === '\\') {
      i += 2;
      continue;
    }
    if (src[i] === '`') {
      push(out, src.slice(from, i + 1), 'st');
      return i + 1;
    }
    if (src[i] === '$' && src[i + 1] === '{') {
      push(out, src.slice(from, i), 'st');
      push(out, '${', 'bk');
      const end = closing(src, i + 1);
      lexJs(src.slice(i + 2, end), out);
      push(out, '}', 'bk');
      i = from = end + 1;
      continue;
    }
    i++;
  }
  push(out, src.slice(from), 'st');
  return src.length;
};

// ---- jsDoc: /** … */ with @tags, {types} and the names they describe
const DOC_NAMED = new Set(['param', 'arg', 'argument', 'property', 'prop', 'typedef', 'template', 'callback', 'name', 'member', 'var', 'event', 'function', 'func', 'method', 'class', 'constant', 'const', 'namespace', 'module', 'exports', 'enum']);
export const lexJsDoc = (src, out = []) => {
  let i = 0;
  while (i < src.length) {
    const tag = /@[A-Za-z]+/y;
    tag.lastIndex = i;
    const t = (src[i] === '@' && (i === 0 || /[\s*{]/.test(src[i - 1]))) ? tag.exec(src)?.[0] : null;
    if (t) {
      push(out, t, 'jd');
      i += t.length;
      const name = t.slice(1);
      // its {type}
      const ws = /[ \t]*/y;
      ws.lastIndex = i;
      const sp = ws.exec(src)[0];
      if (src[i + sp.length] === '{') {
        push(out, sp, 'cm');
        i += sp.length;
        const end = closing(src, i);
        push(out, '{', 'bk');
        lexType(src.slice(i + 1, end), out);
        push(out, '}', 'bk');
        i = end + 1;
      }
      // the name it names (param, typedef, template T, …): [name=default] too
      if (DOC_NAMED.has(name)) {
        const nm = /([ \t]+)(\[[^\]\n]*\]|[\w$.,]+)/y;
        nm.lastIndex = i;
        const m = nm.exec(src);
        if (m) {
          push(out, m[1], 'cm');
          push(out, m[2], 'jn');
          i += m[0].length;
        }
      }
      continue;
    }
    if (src[i] === '{' && src[i + 1] === '@') {
      // {@link Name}
      const end = closing(src, i);
      push(out, '{', 'bk');
      const inner = src.slice(i + 1, end), sp = inner.indexOf(' ');
      push(out, sp < 0 ? inner : inner.slice(0, sp), 'jd');
      if (sp >= 0) push(out, inner.slice(sp), 'jn');
      push(out, '}', 'bk');
      i = end + 1;
      continue;
    }
    if (src[i] === '`') {
      const end = src.indexOf('`', i + 1);
      const e = end < 0 ? src.length : end + 1;
      push(out, src.slice(i, e), 'st');
      i = e;
      continue;
    }
    push(out, src[i], 'cm');
    i++;
  }
  return out;
};

// ---- TypeScript types (inside a jsDoc {…}, or after : in TypeScript)
const TYPE_RW = new Set('extends infer keyof typeof in is readonly as asserts unique new import'.split(' '));
const TYPE_PRIM = new Set('string number boolean object any unknown never void null undefined symbol bigint true false this function Function Object Array Promise Record Partial Required Readonly Pick Omit Exclude Extract ReturnType Parameters NonNullable InstanceType Awaited Map Set'.split(' '));
export const lexType = (src, out = []) => {
  let i = 0;
  const at = (re) => ((re.lastIndex = i), re.exec(src)?.[0]);
  while (i < src.length) {
    const c = src[i];
    if (/\s/.test(c)) {
      const w = at(/\s+/y);
      push(out, w);
      i += w.length;
      continue;
    }
    if (c === '"' || c === "'" || c === '`') {
      let j = i + 1;
      for (; j < src.length && src[j] !== c; j++) if (src[j] === '\\') j++;
      push(out, src.slice(i, j + 1), 'st');
      i = j + 1;
      continue;
    }
    const num = /\d/.test(c) ? at(NUMBER) : null;
    if (num) {
      push(out, num, 'nm');
      i += num.length;
      continue;
    }
    const word = at(IDENT);
    if (word) {
      const key = /^\s*\??\s*:/.test(src.slice(i + word.length)) && !TYPE_RW.has(word); // a property or a parameter name
      push(out, word, TYPE_RW.has(word) ? 'rw' : key ? 'at' : TYPE_PRIM.has(word) || /^[A-Z]/.test(word) ? 'ty' : '');
      i += word.length;
      continue;
    }
    if ('(){}[]<>'.includes(c)) {
      push(out, c, 'bk');
      i++;
      continue;
    }
    const op = at(/=>|\.\.\.|[|&?:=,;.]/y);
    if (op) {
      push(out, op, op === ',' || op === ';' || op === '.' ? 'pn' : 'op');
      i += op.length;
      continue;
    }
    push(out, c);
    i++;
  }
  return out;
};

// ---- HTML (its <script> is JavaScript, <style> CSS, on…="" attributes JavaScript)
export const lexHtml = (src, out = []) => {
  let i = 0;
  while (i < src.length) {
    if (src.startsWith('<!--', i)) {
      const end = src.indexOf('-->', i + 4);
      const e = end < 0 ? src.length : end + 3;
      push(out, src.slice(i, e), 'cm');
      i = e;
      continue;
    }
    const open = /<(\/?)([A-Za-z][\w:.-]*)/y;
    open.lastIndex = i;
    const m = src[i] === '<' ? open.exec(src) : null;
    if (m) {
      push(out, `<${m[1]}`, 'pn');
      const tagName = m[2];
      push(out, tagName, /^[A-Z]/.test(tagName) ? 'cl' : 'tg');
      i += m[0].length;
      let attrs = '';
      // attributes up to > (a quoted value may hold >)
      while (i < src.length && src[i] !== '>') {
        const ws = /\s+/y;
        ws.lastIndex = i;
        const w = ws.exec(src)?.[0];
        if (w) {
          push(out, w);
          i += w.length;
          continue;
        }
        if (src[i] === '/') {
          push(out, '/', 'pn');
          i++;
          continue;
        }
        const an = /[^\s=>/"']+/y;
        an.lastIndex = i;
        const name = an.exec(src)?.[0];
        if (name) {
          push(out, name, 'at');
          i += name.length;
          attrs += ` ${name.toLowerCase()}`;
          if (src[i] === '=') {
            push(out, '=', 'op');
            i++;
            const q = src[i];
            if (q === '"' || q === "'") {
              const end = src.indexOf(q, i + 1);
              const e = end < 0 ? src.length : end;
              const value = src.slice(i + 1, e);
              push(out, q, 'av');
              if (/^on/i.test(name)) lexJs(value, out);
              else if (name.toLowerCase() === 'style') lexCssBody(value, out);
              else push(out, value, 'av');
              push(out, src[e] ?? '', 'av');
              i = e + 1;
              attrs += `=${value.toLowerCase()}`;
            } else {
              const uv = /[^\s>]+/y;
              uv.lastIndex = i;
              const v = uv.exec(src)?.[0] ?? '';
              push(out, v, 'av');
              i += v.length;
            }
          }
          continue;
        }
        push(out, src[i]);
        i++;
      }
      if (src[i] === '>') {
        push(out, '>', 'pn');
        i++;
      }
      // the inside of <script> / <style>
      const lower = tagName.toLowerCase();
      if (!m[1] && (lower === 'script' || lower === 'style')) {
        const close = src.toLowerCase().indexOf(`</${lower}`, i);
        const e = close < 0 ? src.length : close;
        const body = src.slice(i, e);
        if (lower === 'style') lexCss(body, out);
        else if (/type=(application\/(ld\+)?json|importmap)/.test(attrs)) lexJson(body, out);
        else if (/type=text\/(html|template|x-template)/.test(attrs)) lexHtml(body, out);
        else lexJs(body, out);
        i = e;
      }
      continue;
    }
    if (src[i] === '&') {
      const ent = /&(#?\w+);/y;
      ent.lastIndex = i;
      const e = ent.exec(src)?.[0];
      if (e) {
        push(out, e, 'es');
        i += e.length;
        continue;
      }
    }
    push(out, src[i]);
    i++;
  }
  return out;
};

// ---- CSS
const lexCssBody = (src, out) => {
  // declarations: name: value;
  let i = 0;
  while (i < src.length) {
    if (src.startsWith('/*', i)) {
      const end = src.indexOf('*/', i + 2);
      const e = end < 0 ? src.length : end + 2;
      push(out, src.slice(i, e), 'cm');
      i = e;
      continue;
    }
    const decl = /([\s]*)(--[\w-]+|-?[a-zA-Z][\w-]*)(\s*)(:)/y;
    decl.lastIndex = i;
    const m = decl.exec(src);
    if (m) {
      push(out, m[1]);
      push(out, m[2], 'at');
      push(out, m[3]);
      push(out, ':', 'pn');
      i += m[0].length;
      const end = src.slice(i).search(/[;}]/);
      const e = end < 0 ? src.length : i + end;
      lexCssValue(src.slice(i, e), out);
      i = e;
      continue;
    }
    push(out, src[i], src[i] === ';' ? 'pn' : src[i] === '}' || src[i] === '{' ? 'bk' : '');
    i++;
  }
};
const lexCssValue = (src, out) => {
  const re = /(\/\*[\s\S]*?\*\/)|("[^"]*"|'[^']*')|(#[\da-fA-F]{3,8}\b)|(-?\d*\.?\d+(?:%|[a-z]+)?)|(!important)|([a-zA-Z-]+(?=\())|(var|calc|min|max|clamp)|([(),])|(\s+)|([^\s(),"'#\d!]+)|(.)/gy;
  for (const m of src.matchAll(re)) {
    const [t, cm, st, col, nm, imp, fn, , br] = m;
    push(out, t, cm ? 'cm' : st ? 'st' : col ? 'nm' : nm ? 'nm' : imp ? 'rw' : fn ? 'fn' : br ? 'bk' : /^[a-z-]+$/.test(t) ? 'av' : '');
  }
};
export const lexCss = (src, out = []) => {
  let i = 0;
  while (i < src.length) {
    if (src.startsWith('/*', i)) {
      const end = src.indexOf('*/', i + 2);
      const e = end < 0 ? src.length : end + 2;
      push(out, src.slice(i, e), 'cm');
      i = e;
      continue;
    }
    if (src[i] === '{') {
      const end = closing(src, i);
      push(out, '{', 'bk');
      const body = src.slice(i + 1, end);
      if (/[{]/.test(body)) lexCss(body, out); // (@media: rules inside)
      else lexCssBody(body, out);
      push(out, src[end] === '}' ? '}' : '', 'bk');
      i = end + 1;
      continue;
    }
    // a selector or an @rule, up to {
    const end = src.indexOf('{', i);
    const e = end < 0 ? src.length : end;
    const sel = src.slice(i, e);
    for (const m of sel.matchAll(/(@[\w-]+)|([.#][\w-]+)|(:{1,2}[\w-]+)|(\[[^\]]*\])|([a-zA-Z][\w-]*)|(\s+)|(.)/g)) {
      const [t, atRule, cls, pseudo, attr, tag] = m;
      push(out, t, atRule ? 'rw' : cls ? 'cl' : pseudo ? 'fn' : attr ? 'at' : tag ? 'tg' : /[>+~,*]/.test(t) ? 'op' : '');
    }
    i = e;
  }
  return out;
};

// ---- JSON
export const lexJson = (src, out = []) => {
  const re = /("(?:[^"\\]|\\.)*")(\s*:)?|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)|(true|false|null)|([{}[\]])|([,:])|(\/\/[^\n]*|\/\*[\s\S]*?\*\/)|(\s+)|(.)/gy;
  for (const m of src.matchAll(re)) {
    const [t, str, colon, nm, lt, br, pn, cm] = m;
    if (str) {
      push(out, str, colon ? 'at' : 'st');
      if (colon) push(out, colon, 'pn');
    } else push(out, t, nm ? 'nm' : lt ? 'lt' : br ? 'bk' : pn ? 'pn' : cm ? 'cm' : '');
  }
  return out;
};

// ---- shell
const SH_RW = new Set('if then else elif fi for while until do done case esac in function return export local readonly declare unset source alias break continue select time'.split(' '));
export const lexShell = (src, out = []) => {
  for (const line of src.split(/(?<=\n)/)) {
    let first = true;
    const re = /(#.*)|("(?:[^"\\]|\\.)*"|'[^']*')|(\$\{[^}]*\}|\$\w+|\$[?#@*0-9])|(\s--?[\w-]+)|([|&;<>]+|&&|\|\|)|(\d+\b)|([\w./~@:+-]+)|(\s+)|(.)/gy;
    for (const m of line.matchAll(re)) {
      const [t, cm, st, vr, flag, op, nm, word] = m;
      if (word) {
        push(out, t, SH_RW.has(word) ? 'rw' : first && !/=/.test(word) ? 'fn' : /^[A-Z_]+=/.test(word) ? 'vr' : '');
        first = SH_RW.has(word) && word !== 'in';
        continue;
      }
      if (op) first = true;
      push(out, t, cm ? 'cm' : st ? 'st' : vr ? 'vr' : flag ? 'at' : op ? 'op' : nm ? 'nm' : '');
    }
  }
  return out;
};

// ---- any C-like language (Rust, C, Go, WAT…): words, strings, numbers, comments
const WORDS = {
  rust: 'as async await break const continue crate dyn else enum extern fn for if impl in let loop match mod move mut pub ref return self Self static struct super trait type unsafe use where while macro_rules',
  c: 'auto break case char const continue default do double else enum extern float for goto if inline int long register return short signed sizeof static struct switch typedef union unsigned void volatile while bool true false NULL include define',
  go: 'break case chan const continue default defer else fallthrough for func go goto if import interface map package range return select struct switch type var',
  python: 'and as assert async await break class continue def del elif else except False finally for from global if import in is lambda None nonlocal not or pass raise return True try while with yield',
  wat: 'module func param result local global memory table export import type call call_indirect if then else end block loop br br_if br_table return drop select get set tee i32 i64 f32 f64 const load store',
};
export const lexGeneric = (src, lang, out = []) => {
  const rw = new Set((WORDS[lang] ?? '').split(' '));
  const hash = lang === 'python' || lang === 'toml' || lang === 'yaml';
  const re = hash
    ? /(#[^\n]*)|("""[\s\S]*?"""|"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*')|(\b\d[\d_.]*\w*)|([A-Za-z_][\w]*)(\s*\()?|([(){}[\]])|([^\w\s])|(\s+)/gy
    : /(\/\/[^\n]*|\/\*[\s\S]*?\*\/|;;[^\n]*)|("(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)')|(\b\d[\d_.]*\w*)|([A-Za-z_$][\w$]*!?)(\s*\()?|([(){}[\]])|([^\w\s])|(\s+)/gy;
  for (const m of src.matchAll(re)) {
    const [t, cm, st, nm, word, call, br, pn] = m;
    if (word) {
      push(out, word, rw.has(word) ? 'rw' : call ? 'fn' : /^[A-Z]/.test(word) ? 'ty' : '');
      if (call) push(out, call);
      continue;
    }
    push(out, t, cm ? 'cm' : st ? 'st' : nm ? 'nm' : br ? 'bk' : pn ? 'op' : '');
  }
  return out;
};

const ALIAS = { js: 'js', javascript: 'js', mjs: 'js', cjs: 'js', jsx: 'js', ts: 'js', typescript: 'js', tsx: 'js', jsdoc: 'jsdoc', html: 'html', htm: 'html', xml: 'html', svg: 'html', vue: 'html', css: 'css', json: 'json', jsonc: 'json', '3draft': 'json', sh: 'shell', bash: 'shell', zsh: 'shell', shell: 'shell', console: 'shell', rust: 'rust', rs: 'rust', c: 'c', cpp: 'c', h: 'c', go: 'go', py: 'python', python: 'python', wat: 'wat', wasm: 'wat', hexaw: 'wat', type: 'type', ts_type: 'type' };

/** Tokens of `src` in the language `lang` (a fence's word: js, html, css, json, sh, rust…; unknown: plain). */
export const highlight = (src, lang = '') => {
  const l = ALIAS[String(lang).toLowerCase().split(/[\s{]/)[0]] ?? '';
  if (l === 'js') return lexJs(src);
  if (l === 'jsdoc') return lexJsDoc(src);
  if (l === 'type') return lexType(src);
  if (l === 'html') return lexHtml(src);
  if (l === 'css') return lexCss(src);
  if (l === 'json') return lexJson(src);
  if (l === 'shell') return lexShell(src);
  if (WORDS[l]) return lexGeneric(src, l);
  return src ? [[src, '']] : [];
};

// ---- the colours (one palette for the page and the terminal; on a dark ground)
export const PALETTE = {
  rw: '#acd641', // reserved words
  st: '#2fd57f', // strings
  nm: '#e8a55a', // numbers
  cm: '#768d76', // comments
  bk: '#fb8600', // brackets
  pn: '#8f8f86', // punctuation
  op: '#c98f7f', // operators
  ty: '#b48ce8', // types
  fn: '#e8d47f', // calls
  cl: '#7fc7e8', // Capitalized names
  tg: '#618be3', // tags
  at: '#d9a7c7', // attributes, properties
  av: '#2fd57f', // attribute values
  jd: '#c58af0', // jsDoc @tags
  jn: '#7fe0d0', // jsDoc names
  lt: '#ff8f8f', // literals
  rx: '#f0a0d0', // regular expressions
  es: '#e8a55a', // escapes, entities
  vr: '#7fc7e8', // variables
};
