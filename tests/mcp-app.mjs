import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Script } from 'node:vm';
import { deflateRawSync } from 'node:zlib';
import { handleWorkshopMcp, RESOURCE_URI } from '../mcp/workshop-app.js';
import { widgetHTML, widgetShellHTML } from '../mcp/workshop-widget.js';
import { WorkshopModel, WORKSHOP_TOOLS } from '../mcp/workshop-client.js';
import { buildInfo } from '../mcp/build-info.js';

const nativeEditor=readFileSync(new URL('../index.html', import.meta.url),'utf8');
for(const signal of ["workshopNotice('native_editor_ready')","workshopNotice('native_scene_loaded'","workshopNotice('native_key_seen')"])assert.ok(nativeEditor.includes(signal),'native app must emit '+signal);
assert.ok(nativeEditor.includes("e.target?.closest?.('input, textarea, select, [contenteditable]')"),'no text-input keyboard logging');
const ctx={origin:'https://spider-paint.example',fetchText:async()=>{throw Error('no remote data needed')}};
const call=(id,method,params={})=>handleWorkshopMcp({jsonrpc:'2.0',id,method,params},ctx);
const init=await call(1,'initialize',{protocolVersion:'2025-06-18'});
assert.equal(init.result.serverInfo.name,'spider-paint');
const liveVersion=(await import('../package.json',{with:{type:'json'}})).default.version;
assert.equal(init.result.serverInfo.version,liveVersion,'MCP must advertise spider-paint own version');

const listed=await call(2,'tools/list');
const tool=listed.result.tools.find(x=>x.name==='open_workshop');
assert.equal(tool?._meta?.ui?.resourceUri,RESOURCE_URI);
assert.ok(tool.description.includes('browser builds the scene'));
assert.ok(!tool.inputSchema.required?.includes('steps'),'open_workshop steps must be optional for scene-only reopening');
assert.ok(WORKSHOP_TOOLS.includes('add_box'));
assert.equal(WORKSHOP_TOOLS.length,25,'browser and build_model must advertise the same 25 modeling operations');
for(const t of WORKSHOP_TOOLS)assert.ok(listed.result.tools.find(x=>x.name==='build_model').description.includes(t),'build_model advertises '+t);
for(const advanced of ['add_character','place_on','sense','sensing','boolean','connect','disconnect','joints','move_joint','pick'])assert.ok(WORKSHOP_TOOLS.includes(advanced),advanced);
const resource=await call(3,'resources/read',{uri:RESOURCE_URI});
assert.equal(resource.result.contents[0].mimeType,'text/html;profile=mcp-app');
const oldResource=await call(300,'resources/read',{uri:'ui://spider-paint/workshop-v1.html'});
assert.equal(oldResource.result.contents[0].uri,'ui://spider-paint/workshop-v1.html', 'legacy cached UI must remain readable');
const oldV2=await call(301,'resources/read',{uri:'ui://spider-paint/workshop-v2.html'});
assert.equal(oldV2.result.contents[0].uri,'ui://spider-paint/workshop-v2.html');
assert.equal(RESOURCE_URI, 'ui://spider-paint/workshop-v15.html', 'UI changes need a fresh resource to bypass old host cache');
const oldV3=await call(302,'resources/read',{uri:'ui://spider-paint/workshop-v3.html'});
assert.equal(oldV3.result.contents[0].uri,'ui://spider-paint/workshop-v3.html');
const oldV4=await call(303,'resources/read',{uri:'ui://spider-paint/workshop-v4.html'});
assert.equal(oldV4.result.contents[0].uri,'ui://spider-paint/workshop-v4.html');
const oldV5=await call(304,'resources/read',{uri:'ui://spider-paint/workshop-v5.html'});
assert.equal(oldV5.result.contents[0].uri,'ui://spider-paint/workshop-v5.html');
const oldV6=await call(305,'resources/read',{uri:'ui://spider-paint/workshop-v6.html'});
assert.equal(oldV6.result.contents[0].uri,'ui://spider-paint/workshop-v6.html');
const oldV7=await call(3031,'resources/read',{uri:'ui://spider-paint/workshop-v7.html'});
assert.equal(oldV7.result.contents[0].uri,'ui://spider-paint/workshop-v7.html');
assert.deepEqual(resource.result.contents[0]._meta.ui.csp.frameDomains,['https://spider-paint.vercel.app']);
assert.match(widgetHTML, /method,params\},'\*'\)/);
assert.ok(widgetHTML.includes("bridgeSend('ui/initialize'"), 'browser must initialize MCP Apps UI bridge');
assert.ok(widgetHTML.includes("bridgeSend('ui/notifications/initialized')"), 'browser must acknowledge host handshake');
assert.ok(widgetHTML.includes("bridgeSend('ui/notifications/size-changed'"), 'browser must report widget height');
assert.ok(widgetHTML.includes("msg.method==='ui/notifications/tool-result'"), 'browser must accept standard MCP Apps results');
assert.ok(widgetHTML.includes("msg.method==='ui/notifications/tool-input'"), 'browser must accept standard MCP Apps input');
assert.ok(widgetHTML.includes("window.openai?.toolOutput"), 'legacy ChatGPT global remains supported');
assert.ok(widgetHTML.includes('WorkshopModel'));
assert.ok(widgetHTML.includes('const createScene'), 'canonical 3Draft core is bundled into widget');
assert.ok(widgetHTML.includes('const __native_m'), 'browser modules have self-contained lexical scopes');
assert.ok(widgetHTML.includes('id="native"'), 'embed the actual spider-paint application');
assert.ok(widgetHTML.includes('https://spider-paint.vercel.app'), 'use original spider-paint editor');
assert.ok(widgetHTML.includes('new CompressionStream('), 'scene links use native deflate-raw codec');
assert.ok(!widgetHTML.includes('id="ui-toggle"'), 'no separate miniature toolbar');
assert.ok(!widgetHTML.includes('class WorkshopView'), 'no duplicate WebGL viewer in the MCP widget');
assert.ok(widgetHTML.includes('native_frame_loaded'), 'iframe navigation is distinguishable from rendering');
assert.ok(widgetHTML.includes('native_editor_ready'), 'native editor readiness is observable');
assert.ok(widgetHTML.includes('native_key_seen'), 'native keyboard focus is observable');
assert.ok(widgetHTML.includes('native_scene_changed'), 'real editor edits must be sent to MCP');
assert.ok(widgetHTML.includes("invokeTool('workshop_poll'"), 'agent changes must reach the browser');
assert.ok(widgetHTML.includes("invokeTool('workshop_publish'"), 'browser publishes an authoritative snapshot');
assert.ok(widgetHTML.includes('apply_scene'), 'browser can send an updated scene back to native UI');
assert.ok(widgetHTML.includes('event.origin===APP_ORIGIN'), 'native messages require trusted origin');
assert.ok(widgetHTML.includes(buildInfo.label), 'workshop must preserve the true spider-paint build identity');
assert.ok(widgetHTML.includes('trace_id'));
assert.ok(widgetHTML.includes('native_frame_loaded'));
assert.ok(widgetHTML.includes("window.openai?.callTool"));
assert.ok(!widgetHTML.includes('<script src='),'client resource must be self-contained');
assert.ok(!widgetShellHTML.includes('fetch('),'scene generation must not call a remote geometry API');
assert.ok(widgetHTML.includes('window.__native_inline=true'),'the real native editor is packaged inline');
const browserScript=widgetHTML.match(/<script>([\s\S]*?)<\/script>/)?.[1];
assert.ok(browserScript);
assert.doesNotThrow(()=>new Script(browserScript),'embedded browser JavaScript syntax');

const cubeStep={tool:'add_box',args:{name:'cube',size:[1,1,1],at:[0,.5,0],color:'#44aacc'}};
const result=await call(4,'tools/call',{name:'open_workshop',arguments:{steps:[cubeStep]}});
assert.ok(!result.result.isError,JSON.stringify(result));
const out=result.result.structuredContent;
assert.equal(out.engine,'browser');
assert.match(out.session_id,/^[0-9a-f]{40}$/,'new workshop creates capability-scoped session');
assert.equal(out.revision,0);
assert.ok(listed.result.tools.some(t=>t.name==='workshop_state'));
assert.ok(listed.result.tools.some(t=>t.name==='workshop_edit'));
assert.ok(listed.result.tools.some(t=>t.name==='workshop_publish'));
assert.equal(out.build.version, liveVersion);
assert.equal(out.build.gitHash, buildInfo.gitHash);
assert.equal(out.steps.length,1);
assert.equal(out.steps[0].tool,'add_box');
assert.ok(!('scene' in out),'MCP server must not compute scene geometry');
assert.ok(typeof out.workshop_token==='string'&&out.workshop_token.length>10);
assert.equal(result.result._meta.ui.resourceUri,RESOURCE_URI);

// Opening an empty workshop or reopening a previous scene must not require
// artificial modeling commands. This previously failed with a 400-step error.
const emptyWorkshop=await call(405,'tools/call',{name:'open_workshop',arguments:{}});
assert.ok(!emptyWorkshop.result.isError, 'empty editor should open without steps');
assert.deepEqual(emptyWorkshop.result.structuredContent.steps,[]);
assert.equal(emptyWorkshop.result.structuredContent.requestedSteps,0);
const reopenedToken=await call(406,'tools/call',{name:'open_workshop',arguments:{from:out.workshop_token}});
assert.ok(!reopenedToken.result.isError,'workshop_token should reopen without steps');
assert.equal(reopenedToken.result.structuredContent.steps.length,1);
assert.equal(reopenedToken.result.structuredContent.requestedSteps,0);
const exportedScene=new WorkshopModel();
assert.deepEqual(exportedScene.replay([cubeStep]).filter(x=>x.error),[]);
const sceneLink='https://spider-paint.vercel.app/#scene='+
  deflateRawSync(Buffer.from(JSON.stringify(exportedScene.data()))).toString('base64url');
const reopenedScene=await call(407,'tools/call',{name:'open_workshop',arguments:{from:sceneLink}});
assert.ok(!reopenedScene.result.isError,'build_model #scene link should reopen without steps');
assert.equal(reopenedScene.result.structuredContent.steps.length,0);
assert.equal(reopenedScene.result.structuredContent.baseScene.objects.length,1);
assert.equal(new WorkshopModel(reopenedScene.result.structuredContent.baseScene).scene.objects.length,1);
const invalidSteps=await call(408,'tools/call',{name:'open_workshop',arguments:{steps:null}});
assert.equal(invalidSteps.result.isError,true,'explicit invalid steps must still be rejected');
const excessiveSteps=await call(409,'tools/call',{name:'open_workshop',arguments:{steps:Array.from({length:401},()=>({tool:'list'}))}});
assert.equal(excessiveSteps.result.isError,true,'400-step safety limit must remain intact');
// Large commands must not be duplicated in the tool result as uncompressed
// structured steps plus a compressed replay token.
const large=await call(404,'tools/call',{name:'open_workshop',arguments:{steps:[{
  tool:'add_box',args:{name:'big-payload-cube',size:[1,1,1],at:[0,.5,0],comment:'x'.repeat(35000)}
}]}});
assert.equal(large.result.isError,undefined);
assert.equal(large.result.structuredContent.encoding,'deflate-raw+base64url');
assert.equal(large.result.structuredContent.steps,undefined);
assert.ok(large.result.structuredContent.workshop_token.length>10);

// Run exactly the commands the iframe receives, entirely in a pure JS model.
const browser=new WorkshopModel(out.baseScene||undefined);
const stepResults=browser.replay(out.steps);
assert.equal(stepResults.length,1);
assert.ok(!stepResults[0].error);
assert.equal(browser.scene.objects.length,1);
assert.equal(browser.scene.objects[0].mesh.positions.length,8);
assert.equal(browser.scene.objects[0].mesh.faces.length,6);
assert.deepEqual(stepResults[0].result.min,[-.5,0,-.5]);
assert.deepEqual(stepResults[0].result.max,[.5,1,.5]);

const continued=await call(5,'tools/call',{name:'open_workshop',arguments:{
  from:out.workshop_token,steps:[{tool:'transform',args:{name:'cube',move:[1,0,0]}}]
}});
const next=continued.result.structuredContent;
assert.equal(next.steps.length,2,'subsequent calls must replay prior commands');
const browserNext=new WorkshopModel(next.baseScene||undefined);
assert.equal(browserNext.replay(next.steps).filter(x=>x.error).length,0);
assert.equal(browserNext.scene.objects.length,1);
assert.deepEqual(browserNext.scene.objects[0].mesh.positions[0],[.5,0,-.5]);
const replayAgain=await call(6,'tools/call',{name:'open_workshop',arguments:{
  from:next.workshop_token,steps:[{tool:'recolor',args:{name:'cube',color:'#aabbcc'}}]
}});
assert.equal(replayAgain.result.structuredContent.steps.length,3);

// Convex prism geometry and face winding are tested in the actual browser model.
const prism=new WorkshopModel();
assert.equal(prism.replay([{tool:'add_extrusion',args:{name:'prism',polygon:[[-1,-1],[1,-1],[1,1],[-1,1]],height:2}}]).filter(x=>x.error).length,0);
assert.equal(prism.scene.objects[0].mesh.faces.length,6);
const p=prism.scene.objects[0].mesh;
const faceNormal=ids=>{
  const [a,b,c]=ids.map(i=>p.positions[i]);
  const u=b.map((v,i)=>v-a[i]),v=c.map((v,i)=>v-a[i]);
  return [u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]];
};
assert.ok(faceNormal(p.faces[0].v)[1]>0,'top face must point upward');
assert.ok(faceNormal(p.faces[1].v)[1]<0,'bottom face must point downward');
assert.ok(Math.abs(faceNormal(p.faces[2].v)[0])+Math.abs(faceNormal(p.faces[2].v)[2])>0,'a side face must have a horizontal normal');
assert.equal(prism.replay([{tool:'transform',args:{name:'prism',rotate_y:90}}]).filter(x=>x.error).length,0);

// Full 3Draft operations execute locally, rather than falling back to server geometry.
const advanced=new WorkshopModel();
const advancedSteps=advanced.replay([
  {tool:'add_box',args:{name:'solid',size:[2,2,2],at:[0,1,0]}},
  {tool:'add_box',args:{name:'cutter',size:[1,3,1],at:[0,1,0]}},
  {tool:'boolean',args:{a:'solid',b:'cutter',op:'subtract',name:'cut-solid'}},
  {tool:'inspect',args:{name:'cut-solid'}},
  {tool:'sense',args:{from:[0,3,0],dir:[0,-1,0]}},
]);
assert.deepEqual(advancedSteps.filter(x=>x.error),[],'advanced CSG and sense must run using 3Draft inside the model');
assert.equal(advanced.scene.objects.length,1);
assert.ok(advanced.scene.objects[0].mesh.faces.length>6,'boolean must generate cut faces');
const jointModel=new WorkshopModel();
const jointSteps=jointModel.replay([
  {tool:'add_box',args:{name:'holder',size:[2,1,2],at:[0,.5,0]}},
  {tool:'add_box',args:{name:'door',size:[1,2,.1],at:[2,1,0]}},
  {tool:'connect',args:{type:'hinge',a:'holder',b:'door',axis:[[1.5,0,0],[1.5,2,0]]}},
  {tool:'joints',args:{}},
]);
assert.deepEqual(jointSteps.filter(x=>x.error),[],'hinge creation and inspection should be available in browser');
assert.ok(jointModel.scene.joints?.length===1);
// Server validation rejects unsupported operations; never silently execute on server.
const bad=await call(7,'tools/call',{name:'open_workshop',arguments:{steps:[{tool:'not_a_modeling_tool',args:{}}]}});
assert.equal(bad.result.isError,true);
const badTrace=JSON.parse(bad.result.content[0].text);
assert.ok(badTrace.trace_id);

const traceId=out.trace_id;
assert.match(traceId,/^[0-9a-f-]{36}$/);
const before=await call(8,'tools/call',{name:'debug_trace',arguments:{trace_id:traceId}});
const info=JSON.parse(before.result.content[0].text);
assert.equal(info.status,'server_complete');
assert.ok(info.events.some(e=>e.phase==='steps_validated'));
assert.ok(info.events.some(e=>e.phase==='response_ready'));
assert.ok(!info.events.some(e=>e.phase==='model_started'),'server must not build geometry');
assert.ok(info.events.find(e=>e.phase==='response_ready').payloadBytes>100);
const feedback=await call(9,'tools/call',{name:'report_widget_event',arguments:{trace_id:traceId,phase:'widget_rendered',widgetObjects:1,widgetFaces:6}});
assert.equal(JSON.parse(feedback.result.content[0].text).accepted,true);
const after=await call(10,'tools/call',{name:'debug_trace',arguments:{trace_id:traceId}});
assert.equal(JSON.parse(after.result.content[0].text).status,'widget_rendered');
assert.equal(JSON.parse(after.result.content[0].text).events.at(-1).widgetFaces,6);
const missing=await call(11,'tools/call',{name:'debug_trace',arguments:{trace_id:'invalid'}});
assert.equal(JSON.parse(missing.result.content[0].text).status,'not_found_or_expired');
const failed=await call(12,'tools/call',{name:'debug_trace',arguments:{trace_id:badTrace.trace_id}});
assert.equal(JSON.parse(failed.result.content[0].text).status,'server_error');
// Diagnostics that locate a silent widget: instance identity, session link, hint.
assert.match(info.server.instance,/^[0-9a-f]{8}$/);
assert.equal(info.session_alive,true,'the trace knows its session still exists');
assert.equal(info.widget_events,0);
assert.match(info.hint,/No widget event/);
assert.equal(out.server.instance,info.server.instance,'open_workshop and debug_trace report the same process');
const overview=JSON.parse((await call(13,'tools/call',{name:'debug_trace',arguments:{}})).result.content[0].text);
assert.equal(overview.server.instance,info.server.instance);
assert.ok(overview.recent.some(t=>t.trace_id===traceId&&t.widget_events===1));
const handshake=await call(14,'tools/call',{name:'report_widget_event',arguments:{trace_id:badTrace.trace_id,phase:'host_call_failed',reason:'workshop_publish: refused',host:'Claude@1.0'}});
assert.equal(JSON.parse(handshake.result.content[0].text).accepted,true);
const failedWidget=JSON.parse((await call(15,'tools/call',{name:'debug_trace',arguments:{trace_id:badTrace.trace_id}})).result.content[0].text);
assert.equal(failedWidget.events.at(-1).host,'Claude@1.0');
assert.match(failedWidget.events.at(-1).reason,/workshop_publish/);
const gone=await call(16,'tools/call',{name:'workshop_state',arguments:{session_id:'0'.repeat(40)}});
const goneInfo=JSON.parse(gone.result.content[0].text);
assert.equal(goneInfo.details.cause,'unknown_in_this_process');
assert.equal(goneInfo.server.instance,info.server.instance);

console.log('spider-paint browser-side MCP workshop contract and geometry: OK');
