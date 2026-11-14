// (copied from 3Draft 4895dac by scripts/sync.mjs: change it there)
// The live link: the MCP process also serves the viewer and pushes the scene to it.
//   GET /app/      the viewer (same files as `npm run app`)
//   GET /scene     the scene as JSON
//   GET /events    Server-Sent Events: a `scene` event on connect and after every change,
//                  a `view` event for a viewer command (target, camera, vehicle, example: the view_* tools)
//   POST /viewer-state  the open viewer reports what it shows (every 2 s): read with the view_state tool
// Loopback only. The viewer in the browser does not change the MCP scene; the AI edits through MCP.

import { createViewerServer, VIEWERS } from './serve.js';

/**
 * Starts the server on `port` (0 = any free port); when it is taken, tries the next
 * `tries` ports. Resolves { url, port, clients(), close() }, or null when none was free.
 */
export const startLive = async (scene, { port = 5173, tries = 10 } = {}) => {
  const clients = new Set();
  const send = (res) => res.write(`event: scene\ndata: ${JSON.stringify(scene.data())}\n\n`);

  let viewer = null; // the last report of an open viewer: { at (ms), ...state }
  const extra = (req, res, path) => {
    if (req.method === 'POST' && path === '/viewer-state') {
      let body = '';
      req.setEncoding('utf8');
      req.on('data', (c) => {
        body += c;
        if (body.length > 65536) req.destroy();
      });
      req.on('end', () => {
        try {
          viewer = { at: Date.now(), ...JSON.parse(body) };
          res.writeHead(204);
        } catch {
          res.writeHead(400);
        }
        res.end();
      });
      return true;
    }
    if (req.method !== 'GET') return false;
    if (path === '/scene') {
      res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
      res.end(JSON.stringify(scene.data()));
      return true;
    }
    if (path === '/events') {
      res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-store', connection: 'keep-alive' });
      res.write('retry: 1000\n\n');
      clients.add(res);
      req.on('close', () => clients.delete(res));
      send(res);
      return true;
    }
    return false;
  };

  const unsubscribe = scene.subscribe(() => clients.forEach(send));
  const ping = setInterval(() => clients.forEach((res) => res.write(': ping\n\n')), 20000);
  ping.unref();

  for (let i = 0; i < tries; i++) {
    const p = port === 0 ? 0 : port + i;
    const server = createViewerServer(extra);
    const ok = await new Promise((resolve) => {
      server.once('error', () => resolve(false));
      server.listen(p, '127.0.0.1', () => resolve(true));
    });
    if (!ok) continue;
    const bound = server.address().port;
    const viewers = Object.fromEntries(Object.entries(VIEWERS).map(([k, v]) => [k, `http://localhost:${bound}${v}`]));
    return {
      url: Object.values(viewers)[0],
      viewers,
      port: bound,
      clients: () => clients.size,
      /** Sends a viewer command (a `view` event) to every open viewer; returns how many got it. */
      command: (cmd) => {
        clients.forEach((res) => res.write(`event: view\ndata: ${JSON.stringify(cmd)}\n\n`));
        return clients.size;
      },
      /** The last state an open viewer reported, with its age in seconds, or null. */
      viewer: () => (viewer ? { ...viewer, age_s: Math.round((Date.now() - viewer.at) / 100) / 10 } : null),
      close: () => {
        unsubscribe();
        clearInterval(ping);
        clients.forEach((res) => res.end());
        server.closeAllConnections?.();
        return new Promise((r) => server.close(r));
      },
    };
  }
  unsubscribe();
  clearInterval(ping);
  return null;
};
