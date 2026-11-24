import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('..', import.meta.url));
const types = { '.html': 'text/html', '.js': 'text/javascript' };
createServer(async (req, res) => {
  try {
    const p = normalize(new URL(req.url, 'http://x').pathname);
    const f = join(root, p.endsWith('/') ? p + 'index.html' : p);
    if (!f.startsWith(root)) throw 0;
    res.writeHead(200, { 'content-type': types[extname(f)] ?? 'text/plain' }).end(await readFile(f));
  } catch { res.writeHead(404).end('not found'); }
}).listen(5174, () => console.log('http://localhost:5174/ (the app) · http://localhost:5174/emulator.html?emulate (the emulator demo)'));
