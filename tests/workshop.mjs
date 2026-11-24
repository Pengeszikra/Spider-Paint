// Dependency-free local workshop integration test.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';

const port = 19381;
const base = 'http://127.0.0.1:' + port;
const child = spawn(process.execPath, ['bin/workshop.mjs', String(port)], { cwd: new URL('../', import.meta.url), stdio:['ignore','pipe','pipe'] });
const ctl = new AbortController();
const json = async (url, body) => {
  const res = await fetch(base + url, { ...(body ? { method:'POST', headers:{'content-type':'application/json'},body:JSON.stringify(body)} : {}), signal:ctl.signal });
  if (!res.ok) throw new Error('HTTP '+res.status+': '+await res.text()); return res.json();
};
try {
  let ready = false;
  for(let i=0;i<60;i++) {try {const r=await fetch(base+'/api/scene');if(r.ok){ready=true;break}}catch{}await delay(100)}
  assert.ok(ready,'workshop server starts');
  let state=await json('/api/scene');assert.equal(state.objects.length,0);
  const response=await json('/mcp',{jsonrpc:'2.0',id:1,method:'tools/call',params:{name:'add_box',arguments:{name:'agent-cube',size:[1,1,1],at:[0,.5,0],color:'#22ccdd'}}});
  assert.equal(response.result.isError,undefined);
  state=await json('/api/scene');assert.equal(state.objects[0].name,'agent-cube');
  const r=await fetch(base+'/api/render?view=persp&size=400');assert.ok(r.ok);assert.match(await r.text(),/<svg\b/);
  const edited=await json('/api/tool',{name:'transform',arguments:{name:'agent-cube',move:[3,0,0]}});
  assert.ok(edited.rev>0);
  const observed=await json('/mcp',{jsonrpc:'2.0',id:2,method:'tools/call',params:{name:'list',arguments:{}}});
  assert.match(observed.result.content[0].text,/agent-cube/);
  assert.equal((await json('/api/scene')).objects[0].mesh.positions.some(p=>p[0]>2),true);
  // Human instruction arrives independently of the ongoing modelling task.
  const queued=await json('/api/inbox',{text:'Add a second wheel',participant:'human-test'});
  assert.equal(queued.message.status,'pending');
  const messages=await json('/mcp',{jsonrpc:'2.0',id:3,method:'tools/call',params:{name:'workshop_messages',arguments:{after:0}}});
  assert.match(messages.result.content[0].text,/Add a second wheel/);
  const ack=await json('/mcp',{jsonrpc:'2.0',id:4,method:'tools/call',params:{name:'workshop_reply',arguments:{id:queued.message.id,status:'acknowledged',reply:'Will do'}}});
  assert.match(ack.result.content[0].text,/Will do/);
  assert.equal((await json('/api/inbox')).messages[0].status,'acknowledged');
  // Multiple viewers can be present without storing their personal cameras in scene.
  await json('/api/presence',{id:'participant-A',label:'Human'});
  await json('/api/presence',{id:'participant-B',label:'AI'});
  const people=await json('/api/participants');
  assert.equal(people.participants.length,2);
  const version=await json('/api/version');assert.match(version.display,/^\\d{2}\\.\\d{2}\\.\\d{2}\\.\\d{3}$/);
  const page=await fetch(base+'/workshop.html');assert.ok(page.ok);assert.match(await page.text(),/WORKSHOP 002/);
  const code=await fetch(base+'/src/workshop-view.js');assert.ok(code.ok);assert.match(await code.text(),/class WorkshopView/);
  const denied=await fetch(base+'/AGENTS.md');assert.equal(denied.status,404);
  console.log('Workshop integration passed: MCP ↔ shared scene ↔ browser, messages, participants');
} finally {ctl.abort();child.kill('SIGTERM')}
