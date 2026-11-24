#!/usr/bin/env node
// stdio MCP bridge to the running local Workshop.
// One MCP server, one shared scene; do not instantiate a second scene here.
import { createInterface } from 'node:readline';
const endpoint=process.env.SPIDER_PAINT_WORKSHOP_URL || 'http://127.0.0.1:5173/mcp';
const rl=createInterface({input:process.stdin,crlfDelay:Infinity});
let pending=Promise.resolve();
const reply=obj=>process.stdout.write(JSON.stringify(obj)+'\n');
rl.on('line',line=>{
  pending=pending.then(async()=>{
    if(!line.trim())return;
    let rpc;
    try{rpc=JSON.parse(line)}catch{return reply({jsonrpc:'2.0',id:null,error:{code:-32700,message:'invalid JSON'}})}
    try {
      const response=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(rpc),signal:AbortSignal.timeout(30000)});
      if(rpc.id==null)return;
      if(!response.ok)throw Error('HTTP '+response.status);
      reply(await response.json());
    }catch(e){if(rpc.id!=null)reply({jsonrpc:'2.0',id:rpc.id,error:{code:-32000,message:'Workshop unreachable at '+endpoint+': '+e.message}})}
  }).catch(e=>console.error('workshop bridge:',e));
});
