import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';

const port = 19080;
const testCommit = '0123456789abcdef0123456789abcdef01234567';
const base = 'http://127.0.0.1:' + port;
const child = spawn(process.execPath, ['bin/cloud-run.mjs'], {
  env: { ...process.env, PORT: String(port), SPIDER_PAINT_GIT_SHA: testCommit },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let stderr = '';
child.stderr.on('data', c => { stderr += c.toString(); });
try {
  let ready = false;
  for (let i = 0; i < 60; i++) {
    if (child.exitCode !== null) throw Error('Server exited: ' + stderr);
    try {
      const res = await fetch(base + '/');
      if (res.ok) { ready = true; break; }
    } catch {}
    await delay(100);
  }
  assert.ok(ready, 'Cloud Run server did not start: ' + stderr);
  const home = await fetch(base + '/');
  assert.equal(home.status, 200);
  assert.match(await home.text(), /spider-paint/);
  const versionResponse = await fetch(base + '/api/version');
  assert.equal(versionResponse.status, 200);
  assert.match(versionResponse.headers.get('cache-control') || '', /no-store/);
  const liveVersion = await versionResponse.json();
  const expectedVersion = (await import('../package.json', { with: { type: 'json' } })).default.version;
  assert.equal(liveVersion.name, 'spider-paint');
  assert.equal(liveVersion.version, expectedVersion);
  assert.equal(liveVersion.gitHash, testCommit);
  assert.equal(liveVersion.shortHash, testCommit.slice(0, 8));
  // Docker must preserve source identity before the final image drops .git.
  const { readFileSync } = await import('node:fs');
  const dockerfile = readFileSync(new URL('../Dockerfile',import.meta.url),'utf8');
  const dockerignore = readFileSync(new URL('../.dockerignore',import.meta.url),'utf8');
  assert.match(dockerfile, /git rev-parse HEAD/, 'Docker source build must capture HEAD');
  assert.match(dockerfile, /mcp\/build-sha\.txt/, 'Docker must embed the source SHA');
  assert.match(dockerfile, /rm -rf \.git/, 'Final runtime must not expose Git metadata');
  assert.ok(!dockerignore.split(/\r?\n/).some(line=>line.trim()==='.git'),
    '.git must reach the source stage to identify the exact commit');
  const displayVersion = (v) => {
    const [yy, mm, packed] = v.split('.').map(Number);
    return [yy,String(mm).padStart(2,'0'),String(Math.floor(packed/1000)).padStart(2,'0'),String(packed%1000).padStart(3,'0')].join('.');
  };
  assert.match(displayVersion(liveVersion.version), /^\d{2}\.\d{2}\.\d{2}\.\d{3}$/);
  assert.equal(liveVersion.display, displayVersion(liveVersion.version));
  assert.equal(liveVersion.label, liveVersion.display + ' · ' + testCommit.slice(0, 8));
  const html = await (await fetch(base + '/index.html')).text();
  assert.ok(html.includes("fetch('/api/version'"), 'UI must fetch spider-paint version from backend');
  assert.ok(!html.includes("document.getElementById('build').textContent = displayVersion(version)"), 'UI must not display 3Draft version');
  const brand = await fetch(base + '/media/spider-paint-logo.svg');
  assert.equal(brand.status, 200);
  assert.match(brand.headers.get('content-type') || '', /image\/svg\+xml/);
  const privateFile = await fetch(base + '/api/mcp.mjs');
  assert.equal(privateFile.status, 404);
  const request = async (path, id, method, params = {}) => {
    const response = await fetch(base + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json, text/event-stream' },
      body: JSON.stringify({ jsonrpc: '2.0', id, method, params }),
    });
    assert.equal(response.status, 200, path);
    return response.json();
  };
  const init = await request('/mcp', 1, 'initialize', {
    protocolVersion: '2025-06-18',
    capabilities: {},
    clientInfo: { name: 'cloud-run-test', version: '1' },
  });
  assert.equal(init.result.serverInfo.name, 'spider-paint');
  const tools = await request('/api/mcp', 2, 'tools/list');
  assert.ok(tools.result.tools.some(t => t.name === 'open_workshop'));
  const built = await fetch(base+'/mcp',{
    method:'POST',
    headers:{'Content-Type':'application/json','Accept':'application/json'},
    body:JSON.stringify({jsonrpc:'2.0',id:3,method:'tools/call',params:{
      name:'open_workshop',arguments:{steps:[{tool:'add_box',args:{name:'trace-cube',size:[1,1,1],at:[0,0,0]}}]}
    }})
  });
  assert.equal(built.status,200);
  const result=await built.json();
  assert.equal(result.result.structuredContent.engine,'browser');
  assert.equal(result.result.structuredContent.build.gitHash, testCommit);
  assert.ok(!('scene' in result.result.structuredContent));
  const traceId=result.result.structuredContent.trace_id;
  assert.equal(built.headers.get('x-spider-paint-trace-id'),traceId);
  const trace=await request('/mcp',4,'tools/call',{name:'debug_trace',arguments:{trace_id:traceId}});
  const diagnostics=JSON.parse(trace.result.content[0].text);
  assert.equal(diagnostics.status,'server_complete');
  assert.ok(diagnostics.events.some(e=>e.phase==='steps_validated'));
  assert.ok(!diagnostics.events.some(e=>e.phase==='model_started'));
  console.log('Cloud Run static + MCP smoke test passed');
} finally {
  child.kill('SIGTERM');
}
