// The store: scenes and models kept online, for every device (https://spider-paint.vercel.app/api/store).
// A Vercel Blob store behind this function: connect a Blob store (public or private) to the Vercel project (Storage → Create → Blob → connect:
// it sets BLOB_READ_WRITE_TOKEN) and set SPIDER_KEY (any secret) in the project's environment variables.
//   GET    /api/store              the list: { items: [{ name, size, at }] }
//   GET    /api/store?name=<name>  one scene (JSON)
//   PUT    /api/store?name=<name>  save it (body: the scene JSON; header x-spider-key: SPIDER_KEY)
//   DELETE /api/store?name=<name>  take it out (header x-spider-key)
// Reading is open; writing needs the key. Names: letters, digits, space, - _ . (up to 60).
import { put, list, del, get } from '@vercel/blob';

const PREFIX = 'store/';
// the store's token: BLOB_READ_WRITE_TOKEN, or <PREFIX>_READ_WRITE_TOKEN when the store was connected with a custom prefix
// A store connected the new way has no token: the SDK signs in with the project's OIDC token and BLOB_STORE_ID by itself, and
// that wins over an old read-write token (left by an earlier store) when both are there.
const RW_TOKEN = () => process.env.BLOB_READ_WRITE_TOKEN || Object.entries(process.env).find(([k, v]) => /_READ_WRITE_TOKEN$/.test(k) && /^vercel_blob_rw_/.test(v ?? ''))?.[1] || '';
const OIDC = () => Boolean(process.env.BLOB_STORE_ID);
const TOKEN = () => (OIDC() ? undefined : RW_TOKEN() || undefined);
const HAS_STORE = () => OIDC() || Boolean(RW_TOKEN());
const clean = (name) => String(name ?? '').trim().replace(/[^\p{L}\p{N} _.-]/gu, '').slice(0, 60);
const pathOf = (name) => `${PREFIX}${encodeURIComponent(name)}.json`;
const nameOf = (pathname) => decodeURIComponent(pathname.slice(PREFIX.length).replace(/\.json$/, ''));

const readBody = (req) => new Promise((resolve, reject) => {
  if (typeof req.body === 'string') return resolve(req.body);
  if (Buffer.isBuffer(req.body)) return resolve(req.body.toString('utf8'));
  if (req.body && typeof req.body === 'object') return resolve(JSON.stringify(req.body));
  let data = '';
  req.setEncoding('utf8');
  req.on('data', (c) => { data += c; });
  req.on('end', () => resolve(data));
  req.on('error', reject);
});

const send = (res, status, obj) => {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.setHeader('cache-control', 'no-store');
  res.setHeader('access-control-allow-origin', '*');
  res.setHeader('access-control-allow-headers', 'content-type, x-spider-key');
  res.setHeader('access-control-allow-methods', 'GET, PUT, DELETE, OPTIONS');
  res.end(typeof obj === 'string' ? obj : JSON.stringify(obj));
};

const findBlob = async (name) => {
  const want = pathOf(name);
  let cursor;
  do {
    const page = await list({ prefix: PREFIX, cursor, token: TOKEN() });
    const hit = page.blobs.find((b) => b.pathname === want);
    if (hit) return hit;
    cursor = page.hasMore ? page.cursor : undefined;
  } while (cursor);
  return null;
};

// the store may be public or private (Vercel asks when it is made): the first save tries the one known (SPIDER_BLOB_ACCESS, or
// what the last save found), and on the store's "cannot use public / private access" answer saves the other way
let access = process.env.SPIDER_BLOB_ACCESS === 'private' ? 'private' : process.env.SPIDER_BLOB_ACCESS === 'public' ? 'public' : null;
const isPrivate = (blob) => /\.private\.blob\./.test(blob.url ?? '') || access === 'private';
const putEither = async (path, body) => {
  const opts = (a) => ({ access: a, contentType: 'application/json', addRandomSuffix: false, allowOverwrite: true, token: TOKEN() });
  const first = access ?? 'public';
  try {
    const b = await put(path, body, opts(first));
    access = first;
    return b;
  } catch (err) {
    if (!/(public|private) access on a (private|public) store/i.test(err?.message ?? '')) throw err;
    const other = first === 'public' ? 'private' : 'public';
    const b = await put(path, body, opts(other));
    access = other;
    return b;
  }
};

export default async function handler(req, res) {
  try {
    if (req.method === 'OPTIONS') return send(res, 204, '');
    if (!HAS_STORE()) return send(res, 503, { error: 'no Blob store token in this deployment yet: connect the Blob store to the project (Production too) and redeploy', seen: Object.keys(process.env).filter((k) => /BLOB|READ_WRITE|SPIDER|OIDC/.test(k)) });
    const url = new URL(req.url, 'http://x');
    const name = clean(url.searchParams.get('name'));
    if (req.method === 'GET' && !name) {
      const items = [];
      let cursor;
      do {
        const page = await list({ prefix: PREFIX, cursor, token: TOKEN() });
        for (const b of page.blobs) items.push({ name: nameOf(b.pathname), size: b.size, at: b.uploadedAt });
        cursor = page.hasMore ? page.cursor : undefined;
      } while (cursor);
      items.sort((a, b) => a.name.localeCompare(b.name));
      return send(res, 200, { items, via: OIDC() ? 'oidc' : 'token' }); // (via: how this deployment reaches its store)
    }
    if (!name) return send(res, 400, { error: 'name?' });
    if (req.method === 'GET') {
      const blob = await findBlob(name);
      if (!blob) return send(res, 404, { error: `no "${name}" in the store` });
      if (isPrivate(blob)) {
        // a private store: read through the SDK (with the token), the latest version
        const got = await get(blob.pathname, { access: 'private', useCache: false, token: TOKEN() });
        if (!got || got.statusCode !== 200) return send(res, 502, { error: `could not read "${name}" from the private store` });
        return send(res, 200, await new Response(got.stream).text());
      }
      const r = await fetch(`${blob.url}?v=${Date.now()}`);
      return send(res, r.ok ? 200 : 502, await r.text());
    }
    const key = process.env.SPIDER_KEY;
    if (!key || req.headers['x-spider-key'] !== key) return send(res, 401, { error: 'the key is missing or wrong' });
    if (req.method === 'PUT' || req.method === 'POST') {
      const body = await readBody(req);
      const data = JSON.parse(body);
      if (!Array.isArray(data?.objects)) return send(res, 400, { error: 'not a scene (no objects)' });
      const b = await putEither(pathOf(name), body);
      return send(res, 200, { ok: true, name, size: body.length, url: b.url });
    }
    if (req.method === 'DELETE') {
      const blob = await findBlob(name);
      if (blob) await del(blob.url, { token: TOKEN() });
      return send(res, 200, { ok: true, name, gone: Boolean(blob) });
    }
    return send(res, 405, { error: 'GET, PUT or DELETE' });
  } catch (err) {
    return send(res, 500, { error: String(err?.message ?? err) });
  }
}
