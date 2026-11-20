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
},render:{kind:'webgl2',data:'data:image/png;base64,aGVsbG8='},capabilities:{editable:true,operations:['model.create','model.transform','material.upsert'],controls:[{id:'undo',type:'button'}],keys:['u']}};
const fetchWorkshop=async(method,session,extra)=>{
  assert.equal(session,token);
  if(method==='POST')return {queued:true,id:'ab'.repeat(12),actions:extra.actions.length};
  if(method==='GET')return {id:extra.result,ok:true,results:[{op:'model.transform',ok:true}]};
  throw Error('Unexpected method');
};
const fetchText=async (path)=>{
  assert.equal(path,'/api/live?token='+token);
  return JSON.stringify(snapshot);
};
async function call(name,args) {
  const res=await handleHttp({method:'POST',origin:'https://example.test',fetchText,
    body:JSON.stringify({jsonrpc:'2.0',id:7,method:'tools/call',params:{name,arguments:args}}),fetchWorkshop});
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

test('Workshop controls inspect the actual browser UI inventory',async()=>{
  const r=await call('workshop_controls',{session:token});
  const x=JSON.parse(r.content[0].text);
  assert.equal(x.capabilities.editable,true);
  assert.equal(typeof x.serverVersion,'string');
  assert.equal(typeof x.versionMatch,'boolean');
  assert.equal(x.capabilities.controls[0].id,'undo');
});
test('Workshop mutations are queued, not claimed completed',async()=>{
  const r=await call('workshop_apply',{session:token,actions:[{op:'model.transform',name:'boat',move:[1,0,0]}]});
  const x=JSON.parse(r.content[0].text);
  assert.equal(x.queued,true);
  assert.match(x.note,/Queued, not completed/);
  const done=await call('workshop_result',{session:token,id:x.id});
  assert.equal(JSON.parse(done.content[0].text).ok,true);
});
test('Workshop mutations fail when the user has not approved AI edits',async()=>{
  snapshot.capabilities.editable=false;
  try{
    const r=await call('workshop_apply',{session:token,actions:[{op:'scene.clear'}]});
    assert.equal(r.isError,true);
    assert.match(r.content[0].text,/Allow AI edits/);
  }finally{snapshot.capabilities.editable=true;}
});
test('Open-workshop advertises a valid MCP App UI resource',async()=>{
  const init=(method,params={})=>handleHttp({method:'POST',origin:'https://example.test',fetchText,fetchWorkshop,
    body:JSON.stringify({jsonrpc:'2.0',id:42,method,params})});
  const tools=JSON.parse((await init('tools/list')).body).result.tools;
  const tool=tools.find(x=>x.name==='open_workshop');
  assert.equal(tool._meta.ui.resourceUri,'ui://spider-paint/workshop.html');
  const listed=JSON.parse((await init('resources/list')).body).result.resources;
  assert.equal(listed[0].mimeType,'text/html;profile=mcp-app');
  const resource=JSON.parse((await init('resources/read',{uri:'ui://spider-paint/workshop.html'})).body).result.contents[0];
  assert.equal(resource.mimeType,'text/html;profile=mcp-app');
  assert.match(resource.text,/<iframe/);
});
test('Browser UI and durable source template have matching workshop dispatcher',()=>{
  const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
  const ui=readFileSync(new URL('../scripts/workshop-ui.txt',import.meta.url),'utf8');
  assert.ok(ui.includes('workshopCapabilities'));
  assert.ok(ui.includes('workshopRun'));
  assert.ok(html.includes(ui));
  assert.ok(html.includes('Allow AI edits in this browser'));
});

test('Tutorial keycast is wired, safe for pointer clicks and retained by sync',()=>{
  const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
  const keycast=readFileSync(new URL('../scripts/tutorial-keycast.txt',import.meta.url),'utf8');
  const sync=readFileSync(new URL('../scripts/sync.mjs',import.meta.url),'utf8');
  assert.ok(html.includes(keycast),'Current editor contains keycast module');
  assert.ok(sync.includes("scripts/tutorial-keycast.txt"),'3Draft synchronization retains keycast');
  assert.match(keycast,/pointer-events: none !important/);
  assert.match(keycast,/user-select: none !important/);
  assert.match(keycast,/window.addEventListener\('keydown'/);
  assert.match(keycast,/window.addEventListener\('keyup'/);
  assert.match(keycast,/tutorialButton.addEventListener\('click'/);
  assert.match(keycast,/localStorage.setItem\('spider-paint.tutorial'/);
  assert.match(keycast,/event.repeat/);
});
