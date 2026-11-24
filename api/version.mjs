// /api/version on a Vercel deployment (Cloud Run and the local server answer it themselves): the deployed package.json
// version and the commit, read by the app's header.
import { buildInfo } from '../mcp/build-info.js';

const body = JSON.stringify(buildInfo);
export default function handler(req, res) {
  res.statusCode = 200;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.setHeader('cache-control', 'no-store');
  res.setHeader('access-control-allow-origin', '*');
  res.end(req.method === 'HEAD' ? '' : body);
}
