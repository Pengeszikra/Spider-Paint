// Opt-in live snapshots from the open Spider Paint browser to its public MCP.
// The 256-bit random session token is a bearer secret. No public listing and no anonymous reads.
// Requires the project's existing Vercel Blob storage to be configured.
import { put, get, del } from '@vercel/blob';

const MAX_BYTES = 4 * 1024 * 1024;
const TTL_MS = 2 * 60 * 60 * 1000;
const validToken = (s) => typeof s === 'string' && /^[0-9a-f]{64}$/.test(s);
const blobPath = (token) => `ai-live/${token}.json`;
const tokenOption = () => {
  const old = process.env.BLOB_READ_WRITE_TOKEN || Object.entries(process.env).find(([k,v]) => /_READ_WRITE_TOKEN$/.test(k) && /^vercel_blob_rw_/.test(v ?? ''))?.[1];
  return process.env.BLOB_STORE_ID ? undefined : old;
};
const send = (res, status, body) => {
  res.setHeader('Content-Type','application/json; charset=utf-8');
  res.setHeader('Cache-Control','no-store, private');
  res.setHeader('X-Content-Type-Options','nosniff');
  res.statusCode=status;
  res.end(JSON.stringify(body));
};
const bodyOf = async (req) => {
  if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) return req.body;
  if (typeof req.body === 'string') return JSON.parse(req.body);
  if (Buffer.isBuffer(req.body)) return JSON.parse(req.body.toString('utf8'));
  let s='';
  for await (const c of req) {
    s+=c.toString();
    if (Buffer.byteLength(s,'utf8')>MAX_BYTES) throw new Error('snapshot exceeds 4 MiB');
  }
  return JSON.parse(s);
};
export default async function handler(req,res) {
  try {
    const origin = req.headers.origin;
    // Browsers may write/delete only from the same origin as the API.
    // MCP server-side reads carry no Origin header and require the secret token.
    if (req.method !== 'GET') {
      const proto=String(req.headers['x-forwarded-proto']??'https').split(',')[0];
      const host=String(req.headers['x-forwarded-host']??req.headers.host??'').split(',')[0];
      if (!origin || origin !== `${proto}://${host}`) return send(res,403,{error:'same-origin browser only'});
    }
    if (!process.env.BLOB_STORE_ID && !tokenOption()) return send(res,503,{error:'Connect Vercel Blob storage to this deployment'});
    if (req.method === 'POST') {
      const input=await bodyOf(req);
      if (!validToken(input.token)) return send(res,400,{error:'Invalid session token'});
      if (!input.scene || input.scene.format !== '3draft-scene' || !Array.isArray(input.scene.objects)) return send(res,400,{error:'Expected a 3draft-scene'});
      if (!input.render || !['svg','webgl2','webgpu'].includes(input.render.kind)) return send(res,400,{error:'Invalid render kind'});
      if (input.render.data && (typeof input.render.data !== 'string' || input.render.data.length > 650000)) return send(res,413,{error:'Render too large'});
      const snapshot={format:'spider-paint-live',version:1,updated:Date.now(),scene:input.scene,render:input.render};
      const json=JSON.stringify(snapshot);
      if (Buffer.byteLength(json,'utf8')>MAX_BYTES) return send(res,413,{error:'Snapshot exceeds 4 MiB'});
      await put(blobPath(input.token),json,{access:'private',addRandomSuffix:false,allowOverwrite:true,contentType:'application/json',token:tokenOption()});
      return send(res,200,{ok:true,updated:snapshot.updated,objects:snapshot.scene.objects.length});
    }
    const token=new URL(req.url,'http://local').searchParams.get('token');
    if (!validToken(token)) return send(res,400,{error:'Session token required'});
    if (req.method==='DELETE') {
      await del(blobPath(token),{token:tokenOption()});
      return send(res,200,{ok:true,stopped:true});
    }
    if (req.method!=='GET') return send(res,405,{error:'GET, POST or DELETE only'});
    const data=await get(blobPath(token),{access:'private',useCache:false,token:tokenOption()});
    if (!data || data.statusCode!==200) return send(res,404,{error:'No live session. Enable AI live in Spider Paint and share its code.'});
    const snapshot=JSON.parse(await new Response(data.stream).text());
    if (Date.now()-snapshot.updated>TTL_MS) return send(res,410,{error:'Live session expired (2 hours without updates)'});
    return send(res,200,snapshot);
  } catch(e) {
    const message=String(e?.message??e);
    return send(res,/not found|404/i.test(message)?404:500,{error:message.slice(0,250)});
  }
}
