#!/usr/bin/env node
// Cloud Run entrypoint: serve the spider-paint browser app and its MCP endpoint on one origin.
// This is intentionally independent of any Vercel deployment.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, resolve, dirname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import mcpHandler from '../api/mcp.mjs';
import { buildInfo } from '../mcp/build-info.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const port = Number(process.env.PORT || 8080);
const versionInfo = JSON.stringify(buildInfo);
const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.webmanifest': 'application/manifest+json',
  '.md': 'text/plain; charset=utf-8',
  '.wasm': 'application/wasm',
  '.woff2': 'font/woff2',
  '.ico': 'image/x-icon',
};
const publicFiles = new Set([
  'index.html', 'player.html', 'emulator.html', 'sky.html',
  'xr-test.html', 'xr-compare.html', 'workshop.html',
  'favicon.svg', 'manifest.webmanifest', 'sw.js', 'sky.md',
]);
const publicDirs = new Set(['src', 'engine', 'models', 'media', 'icons', 'app', 'help']);
async function serveStatic(req, res, url) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { Allow: 'GET, HEAD' }).end();
    return;
  }
  let pathname;
  try { pathname = decodeURIComponent(url.pathname); }
  catch { res.writeHead(400).end('Invalid path'); return; }
  const parts = pathname.split('/').filter(Boolean);
  if (parts.some(p => p === '.' || p === '..' || p.startsWith('.'))) {
    res.writeHead(403).end('Forbidden'); return;
  }
  const rel = parts.join('/') || 'index.html';
  if (!publicFiles.has(rel) && !publicDirs.has(parts[0])) {
    res.writeHead(404).end('Not found'); return;
  }
  const file = resolve(root, rel);
  if (!file.startsWith(root + sep)) {
    res.writeHead(403).end('Forbidden'); return;
  }
  try {
    const data = await readFile(file);
    res.writeHead(200, {
      'Content-Type': types[extname(file).toLowerCase()] || 'application/octet-stream',
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'public, max-age=300',
    });
    res.end(req.method === 'HEAD' ? undefined : data);
  } catch {
    res.writeHead(404).end('Not found');
  }
}
createServer(async (req, res) => {
  try {
    const url = new URL(req.url || '/', 'http://localhost');
    if (url.pathname === '/api/version') {
      if (req.method !== 'GET' && req.method !== 'HEAD') {
        res.writeHead(405, { Allow: 'GET, HEAD' }).end();
      } else {
        res.writeHead(200, {
          'Content-Type': 'application/json; charset=utf-8',
          'Cache-Control': 'no-store, max-age=0',
          'X-Content-Type-Options': 'nosniff',
        });
        res.end(req.method === 'HEAD' ? undefined : versionInfo);
      }
    } else if (url.pathname === '/mcp' || url.pathname === '/api/mcp') {
      await mcpHandler(req, res);
    } else {
      await serveStatic(req, res, url);
    }
  } catch (err) {
    console.error('spider-paint request failed:', err);
    if (!res.headersSent) res.writeHead(500, { 'Content-Type': 'text/plain' });
    res.end('Internal server error');
  }
}).listen(port, '0.0.0.0', () => {
  console.log('spider-paint ' + buildInfo.label + ' Cloud Run server listening on ' + port);
});
