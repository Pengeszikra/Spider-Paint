// node vscode/test.mjs: the page the webview gets, and the extension's commands (with a stand-in for the vscode module)
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { deflateRawSync, inflateRawSync } from 'node:zlib';
import Module from 'node:module';

const require = createRequire(import.meta.url);
const { pageHtml, linkOf } = require('./page.js');
const html = pageHtml('<!doctype html><html><head><title>x</title></head><body></body></html>', { base: 'vscode-resource://app/', link: '?scene=bridge', cspSource: 'vscode-webview://x' });
assert.match(html, /<head>\n<base href="vscode-resource:\/\/app\/">/, 'the base comes first');
assert.match(html, /Content-Security-Policy/);
assert.match(html, /scene=bridge/);
const link = linkOf(JSON.stringify({ format: '3draft-scene', objects: [{ name: 'a' }] }), deflateRawSync);
assert.match(link, /^\?empty#scene=[A-Za-z0-9_-]+$/);
const back = JSON.parse(inflateRawSync(Buffer.from(link.split('=')[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64')).toString());
assert.equal(back.objects[0].name, 'a');
assert.match(linkOf(JSON.stringify({ format: '3draft-sky', stars: [] }), deflateRawSync), /#sky=/);
assert.throws(() => linkOf('{ "half', deflateRawSync));

// the extension registers its three commands
const registered = [];
const fake = { commands: { registerCommand: (name) => (registered.push(name), { dispose() {} }) }, window: {}, workspace: {}, Uri: { file: (p) => ({ fsPath: p }) }, ViewColumn: {} };
const load = Module._load;
Module._load = function (req, ...rest) {
  return req === 'vscode' ? fake : load.call(this, req, ...rest);
};
require('./extension.js').activate({ subscriptions: [], extensionPath: new URL('.', import.meta.url).pathname });
Module._load = load;
assert.deepEqual(registered.sort(), ['spiderPaint.open', 'spiderPaint.openScene', 'spiderPaint.showFile']);
const pkg = require('./package.json');
assert.deepEqual(pkg.contributes.commands.map((c) => c.command).sort(), registered);
console.log('vscode extension: OK');
