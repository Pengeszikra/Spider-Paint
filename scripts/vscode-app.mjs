#!/usr/bin/env node
// Copies the app (the browser files: index.html, its modules, the models, the help) into vscode/app, so the packaged
// extension carries the same version of spider-paint. `cd vscode && npm run package` does this, then makes the .vsix.
import { cpSync, rmSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'vscode', 'app');
const APP = ['index.html', 'help', 'sky.md', 'favicon.svg', 'manifest.webmanifest', 'src', 'engine', 'icons', 'media', 'models'];
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
for (const f of APP) if (existsSync(join(root, f))) cpSync(join(root, f), join(out, f), { recursive: true });
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
// the extension's version follows the app's (YY.MM.DDNNN is a valid semver)
const ext = JSON.parse(readFileSync(join(root, 'vscode', 'package.json'), 'utf8'));
ext.version = pkg.version;
writeFileSync(join(root, 'vscode', 'package.json'), `${JSON.stringify(ext, null, 2)}\n`);
for (const f of ['LICENSE']) if (existsSync(join(root, f))) cpSync(join(root, f), join(root, 'vscode', f));
console.log(`vscode/app: spider-paint ${pkg.version} copied (${APP.filter((f) => existsSync(join(root, f))).join(', ')})`);
