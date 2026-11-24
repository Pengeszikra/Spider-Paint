// Browser-local workshop: the exact same 3Draft modeling operations as build_model.
// The host's MCP Apps iframe (ChatGPT, Claude...) receives declarative steps; all geometry executes in this model.
// No server geometry calculation, networking, browser imports or dynamic loading.
import { createScene } from './scene.js';
import { WORKSHOP_TOOLS as SHARED_TOOLS } from './workshop-tools.js';

export const WORKSHOP_TOOLS=SHARED_TOOLS;
const json=output=>{
  try{return JSON.parse(output.text)}catch{return output.text}
};
const copy=value=>JSON.parse(JSON.stringify(value));
export class WorkshopModel {
  constructor(base){
    this.core=createScene();
    if(base!==undefined&&base!==null){
      if(base.format!=='3draft-scene'||!Array.isArray(base.objects))throw Error('invalid base scene');
      const result=this.core.call('import',{json:JSON.stringify(base)});
      if(result.isError)throw Error('invalid base scene: '+result.text);
    }
    this.refresh();
  }
  refresh(){
    const result=this.core.call('export',{});
    if(result.isError)throw Error('scene export failed: '+result.text);
    this.scene=json(result);
    if(!Array.isArray(this.scene?.objects))throw Error('scene export returned no objects');
  }
  apply(tool,args={},refresh=true){
    if(!WORKSHOP_TOOLS.includes(tool))throw Error('unsupported browser workshop tool: '+tool);
    if(!args||typeof args!=='object'||Array.isArray(args))throw Error('args must be an object');
    const result=this.core.call(tool,args);
    if(result.isError)throw Error(result.text);
    if(refresh)this.refresh();
    return json(result);
  }
  replay(steps){
    if(!Array.isArray(steps)||steps.length>400)throw Error('too many workshop steps');
    const results=steps.map((step,index)=>{
      try{return {step:index,tool:step.tool,result:this.apply(step.tool,step.args||{},false)}}
      catch(error){return {step:index,tool:step?.tool,error:String(error?.message||error)}}
    });
    this.refresh();
    return results;
  }
  data(){return copy(this.scene)}
}
