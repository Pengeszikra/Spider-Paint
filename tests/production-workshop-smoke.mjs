import assert from 'node:assert/strict';
const base='https://spider-paint.vercel.app';
const mcp=base+'/api/mcp';
const rpc=async(method,params={})=>{
  const r=await fetch(mcp,{method:'POST',headers:{'content-type':'application/json','accept':'application/json, text/event-stream'},body:JSON.stringify({jsonrpc:'2.0',id:1,method,params})});
  const t=await r.text();
  console.log('MCP',method,'HTTP',r.status,'bytes',t.length);
  assert.equal(r.status,200,'MCP '+method+' HTTP '+r.status+': '+t.slice(0,200));
  const obj=JSON.parse(t);
  assert.ok(!obj.error,JSON.stringify(obj.error));
  return obj.result;
};
const tools=(await rpc('tools/list')).tools;
const names=tools.map(x=>x.name);
console.log('TOOLS:',names.join(', '));
for(const n of ['get_scene','get_render','open_workshop','workshop_controls','workshop_apply','workshop_result'])
  assert.ok(names.includes(n),'Missing live MCP tool: '+n);
const resources=(await rpc('resources/list')).resources;
console.log('RESOURCES:',resources.map(x=>x.uri));
assert.ok(resources.some(x=>x.uri==='ui://spider-paint/workshop.html'));
const read=await rpc('resources/read',{uri:'ui://spider-paint/workshop.html'});
assert.ok(read.contents[0].text.includes('<iframe'));
const init=await rpc('initialize',{protocolVersion:'2025-06-18',capabilities:{},clientInfo:{name:'smoke',version:'1.0'}});
console.log('MCP SERVER',init.serverInfo);
for(const url of ['/api/live','/api/workshop?token='+('00'.repeat(32))]){
 const r=await fetch(base+url,{method:'GET',headers:{'accept':'application/json'}});
 let data;try{data=await r.json()}catch{data={error:'NON_JSON'}};
 console.log(url.split('?')[0],'HTTP',r.status,'result',JSON.stringify(data).slice(0,240));
 assert.ok([400,404,410,503].includes(r.status),'Expected non-public session rejection');
}
console.log('PASS public production MCP smoke tests');
