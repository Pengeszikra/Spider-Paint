// The Spider Paint live viewer's static server (no dependencies), used by the MCP server (mcp/server.js, mcp/live.js).
//   /            Spider Paint (index.html with ?live: it listens to the MCP scene and the view_* commands)
//   /3draft/...  a 3Draft checkout's viewer, when one is found: 3DRAFT_DIR, or ../3Draft / ../3draft beside this repo
// Only on 127.0.0.1, only for a loopback Host header (no DNS rebinding), only the listed files and folders.
// The service worker (sw.js) is not served here: it would cache the live stream.

import { createServer } from 'node:http';
import { existsSync } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const FILES = new Set(['index.html', 'help.md', 'APP.md', 'MCP.md', 'manifest.webmanifest', 'favicon.svg']);
const DIRS = new Set(['models', 'icons', 'media']);

const findThreeDraft = () => {
  const tries = [process.env['3DRAFT_DIR'], join(root, '..', '3Draft'), join(root, '..', '3draft')].filter(Boolean);
  return tries.map((d) => resolve(d)).find((d) => existsSync(join(d, 'app', 'index.html')) && existsSync(join(d, 'dist', 'index.js'))) ?? null;
};
const threeDraft = findThreeDraft();

/** The viewer pages (name -> path); the MCP live link reports them with the viewer tool. */
export const VIEWERS = { 'spider-paint': '/?live', ...(threeDraft ? { '3draft': '/3draft/app/' } : {}) };

const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.css': 'text/css; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.wasm': 'application/wasm',
};

const localHost = (req) => /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(req.headers.host ?? '');

// a request path -> a file on disk, or null when it is not served
const fileOf = (path) => {
  if (path.startsWith('/3draft/')) {
    if (!threeDraft) return null;
    let rest = path.slice('/3draft'.length);
    if (rest.endsWith('/')) rest += 'index.html';
    const file = resolve(join(threeDraft, normalize(rest)));
    const rel = relative(threeDraft, file);
    return !rel.startsWith('..') && ['app', 'dist', 'examples'].includes(rel.split(sep)[0]) ? file : null;
  }
  if (path === '/') path = '/index.html';
  const file = resolve(join(root, normalize(path)));
  const rel = relative(root, file);
  if (rel.startsWith('..')) return null;
  const top = rel.split(sep)[0];
  return FILES.has(rel) || (DIRS.has(top) && rel !== top) ? file : null;
};

/** The server; `extra(req, res, pathname)` may answer first (true when it did): the live endpoints of mcp/live.js. */
export const createViewerServer = (extra) =>
  createServer(async (req, res) => {
    try {
      if (!localHost(req)) return void (res.writeHead(403), res.end('forbidden'));
      const path = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
      if (extra?.(req, res, path)) return;
      if (path === '/3draft' || path === '/3draft/app') return void (res.writeHead(302, { location: '/3draft/app/' }), res.end());
      const file = fileOf(path);
      if (!file || !(await stat(file).catch(() => null))?.isFile()) return void (res.writeHead(404), res.end('not found'));
      const data = await readFile(file);
      res.writeHead(200, { 'content-type': types[extname(file)] ?? 'application/octet-stream', 'cache-control': 'no-store' });
      res.end(data);
    } catch {
      res.writeHead(404);
      res.end('not found');
    }
  });

// node mcp/serve.js: only the static viewer (PORT, default 5173), without the MCP scene
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const port = Number(process.env.PORT) || 5173;
  createViewerServer().listen(port, '127.0.0.1', () => {
    console.log(`Spider Paint: http://localhost:${port}/`);
    if (threeDraft) console.log(`3Draft (${threeDraft}): http://localhost:${port}/3draft/app/`);
  });
}
