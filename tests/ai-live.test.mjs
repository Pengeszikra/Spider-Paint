import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { handleHttp } from '../mcp/http.js';

const token='ab'.repeat(32);
const snapshot={format:'spider-paint-live',updated:Date.now(),scene:{
  format:'3draft-scene',version:1,name:'paper boat',view:{render:'webgl2',cam:{yaw:10,pitch:20}},
  palette:[{name:'water',color:'#a9d3e8',alpha:0.3}],
  objects:[{name:'boat',mesh:{positions:[[0,0,0],[1,0,0],[0,1,0]],faces:[{v:[0,1,2],mat:'paper'}]}}]
},render:{kind:'webgl2',data:'data:image/png;base64,aGVsbG8='}};
const fetchText=async (path)=>{
  assert.equal(path,'/api/live?token='+token);
  return JSON.stringify(snapshot);
};
async function call(name,args) {
  const res=await handleHttp({method:'POST',origin:'https://example.test',fetchText,
    body:JSON.stringify({jsonrpc:'2.0',id:7,method:'tools/call',params:{name,arguments:args}})});
  assert.equal(res.status,200);
  return JSON.parse(res.body).result;
}
test('MCP exposes get_scene and get_render',async()=>{
  const r=await handleHttp({method:'POST',origin:'https://example.test',fetchText,
    body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/list'})});
  const tools=JSON.parse(r.body).result.tools;
  assert.ok(tools.some(x=>x.name==='get_scene'));
  assert.ok(tools.some(x=>x.name==='get_render'));
});
test('get_scene includes actual materials and optional geometry',async()=>{
  const x=await call('get_scene',{session:token});
  assert.equal(x.isError,undefined);
  const o=JSON.parse(x.content[0].text);
  assert.equal(o.palette[0].alpha,0.3);
  assert.equal(o.objects[0].name,'boat');
  assert.equal(o.scene,undefined);
  const f=await call('get_scene',{session:token,full:true});
  assert.equal(JSON.parse(f.content[0].text).scene.objects[0].mesh.positions.length,3);
});
test('get_render includes image typed content',async()=>{
  const x=await call('get_render',{session:token});
  assert.equal(x.content[1].type,'image');
  assert.equal(x.content[1].mimeType,'image/png');
  assert.equal(x.content[1].data,'aGVsbG8=');
});
test('unshared or malformed token cannot be read',async()=>{
  const x=await call('get_scene',{session:'oops'});
  assert.equal(x.isError,true);
});
test('inline browser module parses as JavaScript',()=>{
  const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
  const code=html.match(/<script type="module">([\s\S]*?)<\/script>/)?.[1];
  assert.ok(code);
  const dir=mkdtempSync(join(tmpdir(),'spi3der-live-'));
  try {
    const path=join(dir,'index.mjs');
    writeFileSync(path,code);
    execFileSync('node',['--check',path]);
  } finally { rmSync(dir,{recursive:true,force:true}); }
});
