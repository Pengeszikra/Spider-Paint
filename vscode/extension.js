// spider-paint in VS Code: the real app (index.html and its modules) in a webview panel. VS Code is Chromium, so this is
// the browser app itself, sharp and with every key. The app's files: ./app (copied in by scripts/vscode-app.mjs when the
// extension is packaged) or, while it runs from the checkout (F5), the checkout itself.
// A scene file (the editor's .json / .3draft) travels into the page as the MCP links do (#scene= / #sky= / #story=,
// deflate-raw, base64url) and the panel loads it again whenever the file is saved.
const vscode = require('vscode');
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const { pageHtml, linkOf } = require('./page.js');

let panel = null; // one panel; a new command reuses it
let shown = null; // { kind: 'start' | 'name' | 'file', value }
let watcher = null;

const appRoot = (ctx) => {
  const own = path.join(ctx.extensionPath, 'app');
  return fs.existsSync(path.join(own, 'index.html')) ? own : path.resolve(ctx.extensionPath, '..');
};

const render = (ctx) => {
  if (!panel) return;
  const root = appRoot(ctx);
  const base = `${panel.webview.asWebviewUri(vscode.Uri.file(root)).toString()}/`;
  let link = '';
  if (shown?.kind === 'name') link = `?scene=${encodeURIComponent(shown.value)}`;
  if (shown?.kind === 'file') {
    try {
      link = linkOf(fs.readFileSync(shown.value, 'utf8'), zlib.deflateRawSync);
    } catch (e) {
      vscode.window.showWarningMessage(`spider-paint: ${path.basename(shown.value)} is not a scene yet (${e.message})`);
      return;
    }
  }
  const index = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  panel.webview.html = pageHtml(index, { base, link, cspSource: panel.webview.cspSource });
  panel.title = shown?.kind === 'file' ? `3D · ${path.basename(shown.value)}` : shown?.kind === 'name' ? `spider-paint · ${shown.value}` : 'spider-paint';
};

const open = (ctx, what) => {
  shown = what;
  if (!panel) {
    panel = vscode.window.createWebviewPanel('spider-paint', 'spider-paint', { viewColumn: what?.kind === 'file' ? vscode.ViewColumn.Beside : vscode.ViewColumn.Active, preserveFocus: what?.kind === 'file' }, {
      enableScripts: true,
      retainContextWhenHidden: true, // (the scene and the camera stay while the tab is in the back)
      localResourceRoots: [vscode.Uri.file(appRoot(ctx))],
    });
    panel.iconPath = vscode.Uri.file(path.join(ctx.extensionPath, 'icon.png'));
    panel.onDidDispose(() => {
      panel = null;
      watcher?.dispose();
      watcher = null;
    });
  } else panel.reveal(undefined, what?.kind === 'file');
  watcher?.dispose();
  watcher = null;
  if (what?.kind === 'file') {
    let again;
    watcher = vscode.workspace.onDidSaveTextDocument((doc) => {
      if (doc.uri.fsPath !== what.value) return;
      clearTimeout(again);
      again = setTimeout(() => render(ctx), 150);
    });
  }
  render(ctx);
};

exports.activate = (ctx) => {
  ctx.subscriptions.push(
    vscode.commands.registerCommand('spider-paint.open', () => open(ctx, { kind: 'start' })),
    vscode.commands.registerCommand('spider-paint.openScene', async () => {
      let names = [];
      try {
        const index = JSON.parse(fs.readFileSync(path.join(appRoot(ctx), 'models', 'index.json'), 'utf8'));
        names = (Array.isArray(index) ? index : index.examples ?? index.scenes ?? []).map((x) => (typeof x === 'string' ? { label: x } : { label: x.id ?? x.name, description: x.title ?? x.label ?? '' }));
      } catch {}
      if (!names.length) names = fs.readdirSync(path.join(appRoot(ctx), 'models')).filter((f) => f.endsWith('.scene.json')).map((f) => ({ label: f.replace(/\.scene\.json$/, '') }));
      const pick = await vscode.window.showQuickPick(names, { placeHolder: 'a scene of the + scene list (or type a name: deepsky, story:…, sky:…)', matchOnDescription: true });
      if (pick) open(ctx, { kind: 'name', value: pick.label });
    }),
    vscode.commands.registerCommand('spider-paint.showFile', (uri) => {
      const file = uri?.fsPath ?? vscode.window.activeTextEditor?.document.uri.fsPath;
      if (!file) return vscode.window.showInformationMessage('spider-paint: open a scene file (.json / .3draft) first');
      open(ctx, { kind: 'file', value: file });
    }),
  );
};
exports.deactivate = () => {};
