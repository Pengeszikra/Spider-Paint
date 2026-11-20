// The public MCP endpoint: https://spider-paint.vercel.app/api/mcp (Streamable HTTP, stateless, no auth).
// A Vercel Node function around mcp/http.js (synced from 3Draft). Static files it reads (sky.md, the Deep Sky
// catalogue) are fetched from the site itself.
import { handleHttp } from '../mcp/http.js';

const readBody = (req) => new Promise((resolve, reject) => {
  if (typeof req.body === 'string') return resolve(req.body);
  if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) return resolve(JSON.stringify(req.body));
  if (Buffer.isBuffer(req.body)) return resolve(req.body.toString('utf8'));
  let data = '';
  req.setEncoding('utf8');
  req.on('data', (c) => { data += c; });
  req.on('end', () => resolve(data));
  req.on('error', reject);
});

export default async function handler(req, res) {
  const proto = String(req.headers['x-forwarded-proto'] ?? 'https').split(',')[0];
  const host = String(req.headers['x-forwarded-host'] ?? req.headers.host ?? 'spider-paint.vercel.app').split(',')[0];
  const origin = `${proto}://${host}`;
  const fetchText = async (path) => {
    const r = await fetch(origin + path);
    if (!r.ok) throw new Error(`${path}: HTTP ${r.status}`);
    return r.text();
  };
  const body = req.method === 'POST' ? await readBody(req) : '';
  // Same-origin server-side call to the private, token-gated workshop mailbox.
  const fetchWorkshop = async (method, token, extra = {}) => {
    const url = new URL(origin + '/api/workshop');
    let init;
    if (method === 'GET') {
      url.searchParams.set('token', token);
      if (extra.result) url.searchParams.set('result', extra.result);
      init = { method:'GET', cache:'no-store' };
    } else {
      init = { method:'POST', headers:{'content-type':'application/json'},
        body:JSON.stringify({token,...extra}), cache:'no-store' };
    }
    const r = await fetch(url, init);
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || 'Workshop HTTP '+r.status);
    return data;
  };
  const out = await handleHttp({ method: req.method, body, origin, fetchText, fetchWorkshop });
  for (const [k, v] of Object.entries(out.headers ?? {})) res.setHeader(k, v);
  res.statusCode = out.status;
  res.end(out.body ?? '');
}
