import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runInNewContext } from 'node:vm';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const source = readFileSync(new URL('../src/tutorial-keycast.js', import.meta.url), 'utf8');

test('compact native controls: save, character, tutorial', () => {
  for (const id of ['sceneSave', 'charBtn', 'tutorialKeyToggle']) {
    const button = html.match(new RegExp('<button id="' + id + '"[^>]*>[\\s\\S]*?<\\/button>'))?.[0];
    assert.ok(button, id + ' control is present');
    assert.ok(button.includes(' ic"'), id + ' uses the compact icon size');
    assert.match(button, /aria-label="[^"]+"/);
  }
  assert.match(html, /id="sceneSave"[^>]*><svg/);
  assert.ok(html.includes('aria-label="Character builder">🧍</button>'));
  assert.match(html, /id="tutorialKeyToggle"[^>]*aria-pressed="false"/);
  assert.ok(html.includes('src="./src/tutorial-keycast.js"'));
});

test('only the embedded workshop starts in the existing Zen mode', () => {
  assert.ok(html.includes("window.parent !== window && new URLSearchParams(location.search).has('workshop')"));
  assert.ok(html.includes('if (WORKSHOP_EMBED) toggleZen(true);'));
  assert.ok(html.includes("if (document.body.classList.contains('zen')) return void toggleZen(false)"));
});

test('keycast is opt-in, passive, click-through and persists its toggle state', () => {
  const handlers = new Map();
  const data = new Map();
  const nodes = [];
  const make = () => {
    const attrs = new Map();
    const classes = new Set();
    const listeners = new Map();
    return {
      attrs, listeners, children: [], textContent: '',
      classList: {
        toggle(name, forced) {
          const on = forced === undefined ? !classes.has(name) : forced;
          if (on) classes.add(name);
          else classes.delete(name);
          return on;
        },
        add(name) { classes.add(name); },
        remove(name) { classes.delete(name); },
        contains(name) { return classes.has(name); }
      },
      addEventListener(type, cb) { listeners.set(type, cb); },
      setAttribute(name, value) { attrs.set(name, value); },
      replaceChildren(...next) { this.children = next; }
    };
  };
  const button = make();
  const body = make();
  const head = make();
  const document = {
    head, body,
    createElement(name) { const node = make(); node.tag = name; nodes.push(node); return node; },
    getElementById(name) { return name === 'tutorialKeyToggle' ? button : null; }
  };
  body.append = (...x) => { body.children.push(...x); };
  head.append = (...x) => { head.children.push(...x); };
  const context = {
    document, navigator: { platform: 'MacIntel' },
    localStorage: {
      getItem(k) { return data.get(k) ?? null; },
      setItem(k, v) { data.set(k, v); }
    },
    window: { addEventListener(name, fn) { handlers.set(name, fn); } },
    clearTimeout() {},
    setTimeout() { return 1; }
  };
  runInNewContext(source, context);
  const overlay = body.children.find(node => node.id === 'tutorialKeycast');
  assert.ok(overlay);
  assert.equal(button.attrs.get('aria-pressed'), 'false');
  assert.equal(overlay.classList.contains('visible'), false);
  button.listeners.get('click')();
  assert.equal(button.attrs.get('aria-pressed'), 'true');
  assert.equal(data.get('spider-paint.tutorial'), '1');

  handlers.get('keydown')({
    key: 'g', repeat: false, isComposing: false,
    ctrlKey: false, altKey: false, shiftKey: false, metaKey: true
  });
  assert.equal(Array.from(overlay.children, node => node.textContent).join(' + '), '⌘ + G');
  assert.equal(overlay.classList.contains('visible'), true);
  handlers.get('blur')();
  assert.equal(overlay.classList.contains('visible'), false);
  button.listeners.get('click')();
  assert.equal(data.get('spider-paint.tutorial'), '0');
  assert.equal(button.attrs.get('aria-pressed'), 'false');
  assert.equal(source.includes('preventDefault'), false);
});
