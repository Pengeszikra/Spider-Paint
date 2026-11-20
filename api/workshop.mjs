// Persistent, private command mailbox for opt-in Spider Paint human/AI workshops.
// Each command is a separate Blob to prevent independent agents overwriting a shared queue.
// This is not an unauthenticated arbitrary browser executor: clients require the 256-bit
// session secret plus the browser's explicit "Allow AI edits" approval to execute commands.
import { put, get, del, list } from '@vercel/blob';
import { randomBytes } from 'node:crypto';

const validToken = (s) => typeof s === 'string' && /^[0-9a-f]{64}$/.test(s);
const validId = (s) => typeof s === 'string' && /^[0-9a-f]{24}$/.test(s);
const pathOf = (token, id, kind = 'commands') => `workshop/${token}/${kind}/${id}.json`;
const MAX = 256 * 1024;
const TTL = 2 * 60 * 60 * 1000;
const opts = () => ({ token: process.env.BLOB_STORE_ID ? undefined : (process.env.BLOB_READ_WRITE_TOKEN || Object.entries(process.env).find(([k, v]) => /_READ_WRITE_TOKEN$/.test(k) && /^vercel_blob_rw_/.test(v ?? ''))?.[1]) });
const json = (res, status, body) => { res.setHeader('content-type','application/json; charset=utf-8'); res.setHeader('cache-control','no-store, private'); res.setHeader('x-content-type-options','nosniff'); res.statusCode = status; res.end(JSON.stringify(body)); };
const bodyOf = async (req) => {
  if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) return req.body;
  if (typeof req.body === 'string' || Buffer.isBuffer(req.body)) return JSON.parse(req.body.toString());
  let text = '';
  for await (const chunk of req) { text += chunk.toString(); if (Buffer.byteLength(text) > MAX) throw new Error('Body too large'); }
  return JSON.parse(text);
};
const load = async (path) => {
  const r = await get(path, { access:'private', useCache:false, ...opts() });
  if (!r || r.statusCode !== 200) return null;
  return JSON.parse(await new Response(r.stream).text());
};
const active = async (token) => {
  const s = await load(`ai-live/${token}.json`);
  return s && Date.now() - s.updated < TTL;
};
const sameOrigin = (req) => {
  const origin = req.headers.origin;
  const proto = String(req.headers['x-forwarded-proto'] || 'https').split(',')[0];
  const host = String(req.headers['x-forwarded-host'] || req.headers.host || '').split(',')[0];
  return origin === `${proto}://${host}`;
};
export default async function handler(req, res) {
  try {
    if (!process.env.BLOB_STORE_ID && !opts().token) return json(res,503,{error:'Connect private Vercel Blob storage'});
    const url = new URL(req.url,'https://localhost');
    const q = req.method === 'POST' ? await bodyOf(req) : { token:url.searchParams.get('token') };
    const token = q.token;
    if (!validToken(token)) return json(res,400,{error:'64-character workshop session token required'});
    if (req.method === 'DELETE') {
      if (!sameOrigin(req)) return json(res,403,{error:'Only the sharing browser can end the workshop'});
      const prefix=`workshop/${token}/`;
      let cursor,removed=0;
      do {
        const page=await list({prefix,cursor,limit:100,...opts()});
        if(page.blobs.length){ await del(page.blobs.map(b=>b.url),opts()); removed+=page.blobs.length; }
        cursor=page.hasMore?page.cursor:undefined;
      } while(cursor);
      return json(res,200,{stopped:true,deleted:removed});
    }
    if (!(await active(token))) return json(res,404,{error:'No active AI live session; enable AI live in Spider Paint'});
    if (req.method === 'POST' && q.kind === 'enqueue') {
      if (!Array.isArray(q.actions) || !q.actions.length || q.actions.length > 30) return json(res,400,{error:'1–30 actions required'});
      if (Buffer.byteLength(JSON.stringify(q.actions)) > MAX) return json(res,413,{error:'Actions too large'});
      const id = randomBytes(12).toString('hex');
      const command = { id, at:Date.now(), actions:q.actions };
      await put(pathOf(token,id), JSON.stringify(command), {access:'private',addRandomSuffix:false,contentType:'application/json', ...opts()});
      return json(res,200,{queued:true,id,actions:q.actions.length});
    }
    if (req.method === 'POST' && q.kind === 'ack') {
      if (!sameOrigin(req)) return json(res,403,{error:'Browser acknowledgement must be same-origin'});
      if (!validId(q.id)) return json(res,400,{error:'Invalid command id'});
      const result = { id:q.id, at:Date.now(), results:Array.isArray(q.results) ? q.results.slice(0,30) : [], ok:Boolean(q.ok) };
      await put(pathOf(token,q.id,'results'),JSON.stringify(result),{access:'private',addRandomSuffix:false,contentType:'application/json',...opts()});
      await del(pathOf(token,q.id),opts()).catch(()=>{});
      return json(res,200,{ok:true});
    }
    if (req.method === 'GET') {
      const id = url.searchParams.get('result');
      if (id) {
        if (!validId(id)) return json(res,400,{error:'Invalid command id'});
        const r = await load(pathOf(token,id,'results'));
        return json(res,200,r || { id, pending:true });
      }
      const files = await list({prefix:`workshop/${token}/commands/`,limit:50,...opts()});
      const commands = (await Promise.all(files.blobs.map(async b=>load(b.pathname)))).filter(x=>x && Date.now()-x.at < TTL).sort((a,b)=>a.at-b.at).slice(0,30);
      return json(res,200,{commands});
    }
    return json(res,405,{error:'GET / POST only'});
  } catch(e) {
    return json(res,500,{error:String(e?.message??e).slice(0,220)});
  }
}
