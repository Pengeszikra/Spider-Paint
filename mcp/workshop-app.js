// MCP Apps transport (ChatGPT, Claude and other MCP Apps hosts) for the browser-local spider-paint workshop.
// The server validates/forwards commands and records timing; it does NOT build geometry.
import { buildInfo } from './build-info.js';
import { performance } from 'node:perf_hooks';
import { readFileSync } from 'node:fs';
import { deflateRawSync, inflateRawSync } from 'node:zlib';
// The workshop only compresses the declarative command history; no 3Draft imports.
const b64url=buffer=>Buffer.from(buffer).toString('base64url');
const pack=value=>b64url(deflateRawSync(Buffer.from(JSON.stringify(value)),{level:9}));
const unpack=encoded=>JSON.parse(inflateRawSync(Buffer.from(encoded,'base64url'),{maxOutputLength:250000}).toString('utf8'));
import { widgetHTML, APP_ORIGIN } from './workshop-widget.js';
import { WORKSHOP_TOOLS } from './workshop-tools.js';
import { startTrace, recordTrace, readTrace, recentTraces, linkTraceSession, instanceInfo, WIDGET_PHASES, safeErrorCode } from './diagnostics.js';
import { createWorkshopSession, readWorkshopSession, publishWorkshopScene, enqueueWorkshopEdit, rejectWorkshopEdit, workshopSessionExists, workshopSessionCount } from './workshop-session.js';

// Which UI resources hosts actually read from this process (a host may keep an older cached one).
const resourceReads=[];
export const RESOURCE_URI='ui://spider-paint/workshop-v15.html';
const LEGACY_RESOURCE_URIS=['ui://spider-paint/workshop-v1.html','ui://spider-paint/workshop-v2.html','ui://spider-paint/workshop-v3.html','ui://spider-paint/workshop-v4.html','ui://spider-paint/workshop-v5.html','ui://spider-paint/workshop-v6.html','ui://spider-paint/workshop-v7.html','ui://spider-paint/workshop-v8.html','ui://spider-paint/workshop-v9.html','ui://spider-paint/workshop-v10.html','ui://spider-paint/workshop-v11.html','ui://spider-paint/workshop-v12.html','ui://spider-paint/workshop-v13.html','ui://spider-paint/workshop-v14.html'];
const version=buildInfo.version;
const MAX_STEPS=400, MAX_PAYLOAD=250000, COMPACT_HISTORY_BYTES=32768;
const displayTool={
  name:'open_workshop',
  description:'Open the complete native spider-paint editor inline in the conversation (an MCP Apps widget: ChatGPT, Claude and other hosts). The browser builds the scene and loads the real editor with its original UI and key bindings; the MCP server only relays declarative operations. Supported local operations: '+WORKSHOP_TOOLS.join(', ')+'. A box: {tool:"add_box",args:{name:"Cube",size:[1,1,1],at:[0,0.5,0],color:"#44aaff"}}. Pass steps to model, from to reopen a workshop_token or #scene link, or omit both to open an empty editor. steps is optional; model results are only confirmed after the embedded widget runs. Pass story (the story_token or open_url of build_story) instead to play an animated story inline in the editor\'s own Stories player.',
  inputSchema:{
    type:'object',
    properties:{
      steps:{type:'array',description:'Optional modeling operations; omit or pass [] to open an existing scene without editing it',items:{type:'object',properties:{tool:{type:'string',enum:WORKSHOP_TOOLS},args:{type:'object'}},required:['tool']}}, 
      from:{type:'string',description:'workshop_token from previous open_workshop; older #scene links also accepted'},
      story:{type:'string',description:'play a story: the story_token (or open_url) returned by build_story, or "story:<name>" for a story bundled with spider-paint (models/<name>.build.json); not combined with steps / from'}
    }
  },
  annotations:{readOnlyHint:false,openWorldHint:false},
  _meta:{ui:{resourceUri:RESOURCE_URI},'openai/outputTemplate':RESOURCE_URI}
};
const storyTool={
  name:'build_story',
  description:'Make an animated story (a Spider Build v2 recording, models/spider-build-v2.md) from a model and play it on a timeline: assembly, disassembly, explosions, mechanisms, fly-throughs. The model: from (a build_model open_url) and / or steps (build_model steps). motions: [{ object | objects: [names] | match: "pyr-*", pivot: "center" (default) | "foot" | [x, y, z], ease, keys: [{ t (ms), move: [dx, dy, dz] (from the object\'s place in the model), rotate: [x, y, z] (degrees about the pivot), scale, ease: smooth (default) | linear | in | out | cut }] }]: each key is a pose relative to where the object stands in the model; before its first key an object holds that key\'s pose, after its last it holds the last (so disassembly: keys from move [0,0,0] to the far place; assembly: the reverse). One motion per object; one motion can name many objects (they move alike). camera: { orbit: { turns (default 0.25), radius, height, center, start_yaw, fov } } (default: a slow orbit round everything) or { keys: [{ t, eye, look_at | yaw + pitch, transition: smoothstep | linear | cut, fov, roll }] }. captions: [{ start, end (ms), text, channel: voiceover | operation | chapter }]. background: "transparent" (nothing behind the model: the page round the player shows through) or a #rrggbb colour (default: the player\'s own). duration_ms (default: the last key + hold_ms 800). shapes: [{ object, keys: [{ t, shape }] }] morphs an object\'s mesh continuously between other objects of the model used as shapes (an extrusion grows, a face scales; the templates are left out). mode: auto (default) | animation (GPU-blended rigid channels, at most 64 distinct motions) | frames (stop-motion every sample_ms, default 80, no limit; only moving objects are stored). Returns open_url (the spider-paint editor playing it in its Stories player: play / pause, time slider, speed, recorded camera on/off, captions), player_url (the bare player.html for an iframe), story_token (pass it to open_workshop story to play it inline), a PNG preview of the start, middle and end (preview_at: up to 6 chosen times in ms instead), and with include_doc the .build.json document itself.',
  inputSchema:{type:'object',properties:{
    title:{type:'string'},
    from:{type:'string',description:'the model: an open_url of build_model'},
    steps:{type:'array',description:'modelling steps (as build_model), run after from',items:{type:'object',properties:{tool:{type:'string'},args:{type:'object'}},required:['tool']}},
    motions:{type:'array',items:{type:'object',properties:{object:{type:'string'},objects:{type:'array',items:{type:'string'}},match:{type:'string'},pivot:{},ease:{type:'string',enum:['smooth','linear','in','out','cut']},keys:{type:'array',items:{type:'object',properties:{t:{type:'number'},move:{type:'array',items:{type:'number'}},rotate:{type:'array',items:{type:'number'}},scale:{},ease:{type:'string',enum:['smooth','linear','in','out','cut']}},required:['t']}}},required:['keys']}},
    camera:{type:'object',properties:{orbit:{type:'object'},keys:{type:'array',items:{type:'object'}}}},
    captions:{type:'array',items:{type:'object',properties:{start:{type:'number'},end:{type:'number'},text:{type:'string'},channel:{type:'string',enum:['voiceover','operation','chapter']}},required:['start','end','text']}},
    duration_ms:{type:'number'},hold_ms:{type:'number'},
    mode:{type:'string',enum:['auto','animation','frames']},
    sample_ms:{type:'number',description:'sampling step in ms (animation default 50, frames default 80)'},
    shapes:{type:'array',description:'continuous mesh changes (an extrusion growing, a face scaling): [{ object, keys: [{ t, shape, ease }] }]. shape names another object of the model whose mesh is the shape at t (those template objects are left out of the story); between keys the mesh morphs: vertex i from vertex i of the previous shape, extra vertices grow out of the nearest previous vertex (extrude_face results grow). The object\'s own name is its model mesh. A shaped object has no motion.',items:{type:'object',properties:{object:{type:'string'},ease:{type:'string',enum:['smooth','linear','in','out','cut']},keys:{type:'array',items:{type:'object',properties:{t:{type:'number'},shape:{type:'string'},ease:{type:'string',enum:['smooth','linear','in','out','cut']}},required:['t','shape']}}},required:['object','keys']}},
    shape_ms:{type:'number',description:'how often a morphing mesh is stored, ms (default 70)'},
    background:{type:'string',description:'"transparent" or a #rrggbb colour behind the model (stored in the story; player_url gets ?bg= too)'},
    preview:{type:'boolean',description:'PNG preview of three moments (default true)'},
    preview_at:{type:'array',items:{type:'number'},maxItems:6,description:'the preview moments in ms (1 to 6), instead of start / middle / end'},
    include_doc:{type:'boolean',description:'also return the Spider Build v2 document (to save as .build.json)'}
  }},
  annotations:{readOnlyHint:true,openWorldHint:false}
};
const debugTool={
  name:'debug_trace',
  description:'Inspect spider-paint MCP workshop diagnostics. With trace_id: server preparation, browser widget / host handshake milestones, whether its session still exists, the server instance and a hint. Without trace_id: this server instance (id, uptime, runtime, build) and its recent traces. Two answers with different instance ids came from different server processes. Traces expire after 15 minutes and are instance-local.',
  inputSchema:{type:'object',properties:{trace_id:{type:'string'}}},
  annotations:{readOnlyHint:true,openWorldHint:false}
};
const widgetEventTool={
  name:'report_widget_event',
  description:'Internal diagnostic event from the embedded workshop; not used for normal model building.',
  inputSchema:{type:'object',properties:{trace_id:{type:'string'},phase:{type:'string',enum:WIDGET_PHASES},widgetObjects:{type:'number'},widgetFaces:{type:'number'},widgetMs:{type:'number'},reason:{type:'string'},host:{type:'string'}},required:['trace_id','phase']},
  annotations:{readOnlyHint:false,openWorldHint:false}
};
const sharedTools=[
  {name:'workshop_state',description:'Read the latest live spider-paint workshop scene, object bounds, revision and pending edit status using the session_id returned by open_workshop. Set include_scene=true for exact mesh geometry.',inputSchema:{type:'object',properties:{session_id:{type:'string'},include_scene:{type:'boolean'}},required:['session_id']},annotations:{readOnlyHint:true,openWorldHint:false}},
  {name:'workshop_edit',description:'Apply changes to the SAME open spider-paint workshop. Submit browser-local modeling steps against the exact revision from workshop_state; the active widget executes and displays them. Check workshop_state later for applied status. A queued response is not completion.',inputSchema:{type:'object',properties:{session_id:{type:'string'},revision:{type:'integer'},steps:{type:'array',items:{type:'object',properties:{tool:{type:'string',enum:WORKSHOP_TOOLS},args:{type:'object'}},required:['tool']}}},required:['session_id','revision','steps']},annotations:{readOnlyHint:false,openWorldHint:false}},
  {name:'workshop_poll',description:'Internal read-only widget poll for queued modeling operations.',inputSchema:{type:'object',properties:{session_id:{type:'string'}},required:['session_id']},annotations:{readOnlyHint:true,openWorldHint:false}},
  {name:'workshop_publish',description:'Internal widget callback: publish native editor scene after an edit with optimistic revision matching.',inputSchema:{type:'object',properties:{session_id:{type:'string'},revision:{type:'integer'},scene:{type:'object'},batch_id:{type:'string'}},required:['session_id','revision','scene']},annotations:{readOnlyHint:false,openWorldHint:false}},
  {name:'workshop_reject',description:'Internal widget callback: release an invalid queued batch and report the error.',inputSchema:{type:'object',properties:{session_id:{type:'string'},batch_id:{type:'string'},reason:{type:'string'}},required:['session_id','batch_id']},annotations:{readOnlyHint:false,openWorldHint:false}}
];
// build_model answers with a PNG image block (mcp/raster.js) instead of SVG text: hosts look at it as a picture,
// and a dense mesh no longer becomes a black blot or overflows the host's result limit. format:"svg" keeps the old text.
const withPngRender=t=>t.name!=='build_model'?t:{
  ...t,
  description:t.description.replace('a render (SVG text: a 2x2 sheet of front, side, top and perspective by default)','a render (a PNG image: a 2x2 sheet of front, side, top and perspective by default; format "svg" gives SVG text instead)'),
  inputSchema:{...t.inputSchema,properties:{...t.inputSchema.properties,
    size:{type:'number',description:'render size in pixels per view (default 280, 64 to 1024)'},
    format:{type:'string',enum:['png','svg'],description:'png (default): an image block to look at; svg: the deterministic SVG text'}}}
};
// the scene link is already size-capped by http.js (MAX_URL), so its inflated JSON may be larger than a workshop history
const unpackScene=encoded=>JSON.parse(inflateRawSync(Buffer.from(encoded,'base64url'),{maxOutputLength:64e6}).toString('utf8'));
async function buildModelPng(id,args,ctx){
  const { publicTools }=await import('./http.js');
  const tool=publicTools().find(t=>t.name==='build_model');
  const view=args.render??'sheet';
  let out;
  try{out=await tool.run({...args,render:'none'},ctx);}
  catch(e){return answer(id,{isError:true,content:[{type:'text',text:String(e?.message||e)}]});}
  const content=[];
  if(view!=='none'&&out.objects&&out.open_url){
    try{
      const { renderPng }=await import('./raster.js');
      const { expandInstances }=await import('./scene.js');
      const scene=expandInstances(unpackScene(/#scene=([A-Za-z0-9_-]+)/.exec(out.open_url)[1]));
      const size=Math.max(64,Math.min(1024,Math.round(Number(args.size)||280)));
      const png=renderPng(scene.objects,{view,size,palette:scene.palette});
      content.push({type:'image',data:png.toString('base64'),mimeType:'image/png'});
    }catch(e){out.render_error=String(e?.message||e).slice(0,200);}
  }else if(view!=='none'&&out.objects)out.render_error='the model is too big for a link, so it was not rendered';
  content.unshift({type:'text',text:JSON.stringify(out)});
  return answer(id,{content});
}
async function buildStoryCall(id,args,ctx){
  const { buildStory, storyMoments, StoryFail }=await import('./story.js');
  let made;
  try{made=await buildStory(args,ctx);}
  catch(e){return answer(id,{isError:true,content:[{type:'text',text:e instanceof StoryFail?e.message:'error: '+String(e?.message||e)}]});}
  const out={...made.summary};
  if(args.include_doc===true)out.story=made.doc;
  const content=[];
  if(args.preview!==false){
    try{
      const { renderPng }=await import('./raster.js');
      for(const m of storyMoments(made.doc,3,args.preview_at)){
        if(!m.objects.length)continue;
        content.push({type:'text',text:'t = '+m.t+' ms'});
        content.push({type:'image',data:renderPng(m.objects,{view:'persp',size:240,palette:made.doc.scene.palette,background:made.doc.presentation?.background}).toString('base64'),mimeType:'image/png'});
      }
    }catch(e){out.preview_error=String(e?.message||e).slice(0,200);}
  }
  content.unshift({type:'text',text:JSON.stringify(out)});
  return answer(id,{content});
}
const sharedResult=(id,value)=>answer(id,{content:[{type:'text',text:JSON.stringify(value)}],structuredContent:value});
const sharedError=(id,e)=>answer(id,{isError:true,content:[{type:'text',text:JSON.stringify({error:String(e?.message||e).slice(0,200),...(e?.details?{details:e.details}:{}),server:instanceInfo({build:buildInfo.label})})}]});
const err=(id,code,message)=>({jsonrpc:'2.0',id,error:{code,message}});
const answer=(id,result)=>({jsonrpc:'2.0',id,result});
const toolError=(id,trace_id,reason)=>answer(id,{isError:true,content:[{type:'text',text:JSON.stringify({trace_id,error:'workshop_failed',reason})}]});
function validateSteps(steps) {
  if(!Array.isArray(steps)||steps.length>MAX_STEPS)throw Error('steps must be an array of at most 400 operations');
  for(const [i,s] of steps.entries()){
    if(!s||!WORKSHOP_TOOLS.includes(s.tool))throw Error('unsupported_operation_at_'+i);
    if(s.args!==undefined&&(!s.args||typeof s.args!=='object'||Array.isArray(s.args)))throw Error('invalid_arguments_at_'+i);
  }
}
function fromHistory(from) {
  if(from===undefined)return {steps:[],baseScene:null};
  if(typeof from!=='string'||from.length>MAX_PAYLOAD)throw Error('invalid_history_token');
  const sceneLink=/#scene=([A-Za-z0-9_-]+)/.exec(from);
  if(sceneLink){
    const scene=unpack(sceneLink[1]);
    if(scene?.format!=='3draft-scene'||!Array.isArray(scene.objects))throw Error('invalid_base_scene');
    return {steps:[],baseScene:scene};
  }
  const token=/#workshop=([A-Za-z0-9_-]+)/.exec(from)?.[1] || (/^[A-Za-z0-9_-]+$/.test(from)?from:null);
  if(!token)throw Error('invalid_history_token');
  const value=unpack(token);
  if(value?.format!=='spider-paint-workshop-history'||value.version!==1||!Array.isArray(value.steps))throw Error('invalid_history_format');
  validateSteps(value.steps);
  return {steps:value.steps,baseScene:value.baseScene||null};
}
export async function handleWorkshopMcp(request,{origin,fetchText}) {
  if(!request||Array.isArray(request)||request.jsonrpc!=='2.0'||typeof request.method!=='string')return err(request?.id??null,-32600,'invalid request');
  const {id,method,params={}}=request;
  if(id===undefined||id===null)return null;
  if(method==='tools/list'){
    // Legacy tools remain available, but are only imported for discovery/use.
    const { publicTools }=await import('./http.js');
    return answer(id,{tools:[...publicTools().map(withPngRender).map(({name,description,inputSchema,annotations})=>({name,description,inputSchema,annotations})),displayTool,storyTool,debugTool,widgetEventTool,...sharedTools]});
  }
  if(method==='resources/list')return answer(id,{resources:[RESOURCE_URI,...LEGACY_RESOURCE_URIS].map(uri=>({uri,name:'spider-paint 3D Workshop',mimeType:'text/html;profile=mcp-app',description:'Native spider-paint editor and original keyboard controls embedded in the conversation'}))});
  if(method==='resources/read'){
    if(params.uri!==RESOURCE_URI&&!LEGACY_RESOURCE_URIS.includes(params.uri))return err(id,-32002,'resource not found');
    resourceReads.push({uri:params.uri,at:new Date().toISOString()});if(resourceReads.length>10)resourceReads.shift();
    console.log(JSON.stringify({severity:'INFO',component:'spider-paint-mcp',phase:'resource_read',resource:String(params.uri).slice(0,64),payloadBytes:Buffer.byteLength(widgetHTML)}));
    return answer(id,{contents:[{uri:params.uri,mimeType:'text/html;profile=mcp-app',text:widgetHTML,_meta:{ui:{csp:{frameDomains:[APP_ORIGIN]}}}}]});
  }
  if(method==='initialize')return answer(id,{
    protocolVersion:params.protocolVersion||'2025-06-18',
    capabilities:{tools:{},resources:{listChanged:false}},
    serverInfo:{name:'spider-paint',title:'spider-paint',version},
    instructions:'spider-paint builds scenes locally inside its MCP Apps widget in the conversation (ChatGPT, Claude and other hosts) and embeds the full native editor from its own origin. open_workshop relays modeling steps, not computed meshes. Model a repeated thing once and place copies with the instance step (source: an object or group; copies: [{ at, scale, rotate_y, color }]). Continue by passing the previous workshop_token as from. The server is the MCP bridge only.'
  });
  if(method==='tools/call'&&sharedTools.some(x=>x.name===params.name)){
    const args=params.arguments||{};
    try{
      if(params.name==='workshop_state')return sharedResult(id,readWorkshopSession(args.session_id,args.include_scene===true));
      if(params.name==='workshop_poll'){
        const state=readWorkshopSession(args.session_id);
        return sharedResult(id,{session_id:state.session_id,revision:state.revision,ready:state.ready,pending:state.pending,last_edit:state.last_edit});
      }
      if(params.name==='workshop_edit'){
        validateSteps(args.steps);
        if(!args.steps?.length||args.steps.length>100)throw Error('steps must contain 1 to 100 operations');
        return sharedResult(id,enqueueWorkshopEdit(args));
      }
      if(params.name==='workshop_publish')return sharedResult(id,publishWorkshopScene(args));
      if(params.name==='workshop_reject')return sharedResult(id,rejectWorkshopEdit(args));
    }catch(e){return sharedError(id,e);}
  }
  if(method==='tools/call'&&params.name==='build_story')return buildStoryCall(id,params.arguments||{},{origin,fetchText});
  if(method==='tools/call'&&params.name==='build_model'&&(params.arguments?.format??'png')==='png'){
    return buildModelPng(id,params.arguments||{},{origin,fetchText});
  }
  if(method==='tools/call'&&params.name==='debug_trace'){
    const traceId=params.arguments?.trace_id;
    const server=instanceInfo({build:buildInfo.label,sessions:workshopSessionCount()});
    if(traceId===undefined||traceId===''){
      return answer(id,{content:[{type:'text',text:JSON.stringify({server,ui_resource:RESOURCE_URI,resource_reads:resourceReads,recent:recentTraces(workshopSessionExists)})}]});
    }
    const trace=readTrace(traceId,workshopSessionExists);
    return answer(id,{content:[{type:'text',text:JSON.stringify(trace||{status:'not_found_or_expired',server,recent:recentTraces(workshopSessionExists,5),hint:'This process does not know the trace: it expired, or this call reached a different server process than open_workshop (compare instance ids).'})}]});
  }
  if(method==='tools/call'&&params.name==='report_widget_event'){
    const args=params.arguments||{};
    const accepted=WIDGET_PHASES.includes(args.phase)&&recordTrace(args.trace_id,args.phase,{widgetObjects:args.widgetObjects,widgetFaces:args.widgetFaces,widgetMs:args.widgetMs,reason:args.reason,host:args.host});
    // The widget mirrors this into its model context, so a mismatch between
    // the widget's server instance and the agent's server instance is visible.
    return answer(id,{content:[{type:'text',text:JSON.stringify({accepted,server:instanceInfo()})}],structuredContent:{accepted,server:instanceInfo()}});
  }
  if(method==='tools/call'&&params.name==='open_workshop'){
    const args=params.arguments||{};
    const trace_id=startTrace(Array.isArray(args.steps)?args.steps.length:0),started=performance.now();
    try {
      if(args.story!==undefined){
        if(args.steps!==undefined||args.from!==undefined)throw Error('story_is_not_combined_with_steps_or_from');
        const bundled=typeof args.story==='string'?/^story:([a-z0-9][a-z0-9-]{0,63})$/.exec(args.story)?.[1]:null;
        let story_token;
        if(bundled){
          let text;
          try{text=readFileSync(new URL(`../models/${bundled}.build.json`,import.meta.url),'utf8');}catch{throw Error('unknown_bundled_story');}
          if(text.length>2000000)throw Error('bundled_story_too_large');
          story_token=pack(JSON.parse(text));
        }else story_token=typeof args.story==='string'?(/#story=([A-Za-z0-9_-]+)/.exec(args.story)?.[1]||(/^[A-Za-z0-9_-]+$/.test(args.story)?args.story:null)):null;
        if(!story_token||story_token.length>400000)throw Error('invalid_story_token');
        let doc;
        try{doc=unpackScene(story_token);}catch{throw Error('invalid_story_token');}
        if(doc?.format!=='spider-build-tutorial'||doc.version!==2)throw Error('not_a_spider_build_v2_story');
        recordTrace(trace_id,'steps_validated',{stepCount:0,durationMs:performance.now()-started});
        const payload={trace_id,engine:'browser',story_token,title:doc.metadata?.title,durationMs:doc.timeline?.durationMs,build:buildInfo,server:instanceInfo()};
        const result={
          structuredContent:payload,
          content:[{type:'text',text:JSON.stringify({trace_id,engine:'browser',story:doc.metadata?.title,durationMs:doc.timeline?.durationMs,build:buildInfo.label,gitHash:buildInfo.gitHash,server:instanceInfo(),
            note:'The embedded editor plays the story in its own Stories player (play / pause, time slider, camera, captions). A story is not a shared workshop session: workshop_state / workshop_edit do not apply.'})}],
          _meta:{ui:{resourceUri:RESOURCE_URI},'openai/outputTemplate':RESOURCE_URI,'spider-paint/trace_id':trace_id}
        };
        recordTrace(trace_id,'response_ready',{payloadBytes:Buffer.byteLength(JSON.stringify(result)),durationMs:performance.now()-started});
        return answer(id,result);
      }
      const requestedSteps=args.steps===undefined?[]:args.steps;
      validateSteps(requestedSteps);
      const history=fromHistory(args.from);
      const steps=[...history.steps,...requestedSteps];
      validateSteps(steps);
      recordTrace(trace_id,'steps_validated',{stepCount:steps.length,durationMs:performance.now()-started});
      const state={format:'spider-paint-workshop-history',version:1,baseScene:history.baseScene,steps};
      const serialized=JSON.stringify(state);
      if(Buffer.byteLength(serialized)>MAX_PAYLOAD)throw Error('workshop_history_too_large');
      const workshop_token=pack(state);
      // Large declarative models (especially add_mesh) previously travelled twice:
      // as raw steps and as the compressed replay token. Keep only the token for
      // large requests so the host never has to shuttle megabytes of duplicate JSON.
      const compact=Buffer.byteLength(serialized)>COMPACT_HISTORY_BYTES;
      const session_id=createWorkshopSession();
      linkTraceSession(trace_id,session_id);
      const payload={
        trace_id,engine:'browser',
        ...(!compact?{steps,baseScene:history.baseScene}:{encoding:'deflate-raw+base64url'}),
        workshop_token,session_id,revision:0,requestedSteps:requestedSteps.length,
        build:buildInfo,server:instanceInfo()
      };
      const result={
        structuredContent:payload,
        content:[{type:'text',text:JSON.stringify({
          trace_id,engine:'browser',queuedSteps:requestedSteps.length,totalSteps:steps.length,
          session_id,build:buildInfo.label,gitHash:buildInfo.gitHash,server:instanceInfo(),
          workshop_token,
          note:'Geometry is built by the embedded browser widget, not the MCP server.'
        })}],
        _meta:{ui:{resourceUri:RESOURCE_URI},'openai/outputTemplate':RESOURCE_URI,'spider-paint/trace_id':trace_id}
      };
      recordTrace(trace_id,'response_ready',{payloadBytes:Buffer.byteLength(JSON.stringify(result)),durationMs:performance.now()-started});
      return answer(id,result);
    } catch(e) {
      recordTrace(trace_id,'request_failed',{reason:safeErrorCode(e),durationMs:performance.now()-started});
      return toolError(id,trace_id,String(e?.message||e).slice(0,100));
    }
  }
  return undefined;
}
