// Inline the canonical 3Draft modeler into the MCP App HTML at resource-build time.
// Each dependency is wrapped in its own lexical scope; the iframe uses no imports,
// network, eval, dynamic imports, or remote geometry service.
// This is a packaging step in Node, NOT execution of modeling operations on the server.
import { readFileSync } from 'node:fs';
import { dirname, resolve, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT=dirname(fileURLToPath(import.meta.url));
const ENGINE={
  skyScene:'sky.js',SKY_TYPES:'sky.js',instantiate:'instances.js',
  box:'mesh.js',extrude:'mesh.js',faceNormal:'mesh.js',faceCenter:'mesh.js',
  merge:'mesh.js',rotate:'mesh.js',bounds:'mesh.js',
  extrudeFace:'edit.js',moveVertices:'edit.js',
  makeCamera:'camera.js',orbit:'camera.js',ray:'camera.js',VIEW_ORDER:'camera.js',
  pick:'pick.js',renderView:'svg.js',renderSheet:'svg.js',
  validate:'check.js',boolean:'csg.js',triangulate:'triangulate.js',
  buildCharacter:'character.js',normalizeCharacter:'character.js',
  variateCharacter:'character.js',CHARACTER_PRESETS:'character.js',
  posed:'rig.js',walkPose:'rig.js',HUMANOID_POSES:'rig.js',
  makeJoint:'joints.js',jointNow:'joints.js',hingeTo:'joints.js',
  pivotTo:'joints.js',railTo:'joints.js',carried:'joints.js',
  moveMesh:'joints.js',springMesh:'joints.js'
};
const parseNames=(csv)=>csv.split(',').map(s=>s.trim()).filter(Boolean).map(s=>{
  const match=/^([A-Za-z_$][\w$]*)(?:\s+as\s+([A-Za-z_$][\w$]*))?$/.exec(s);
  if(!match)throw Error('Unexpected named import: '+s);
  return {original:match[1],local:match[2]||match[1]};
});
export function bundleBrowserModel(){
  const modules=new Map(),output=[];
  function compile(path){
    const file=resolve(ROOT,path);
    if(!file.startsWith(ROOT+sep))throw Error('Unexpected module outside workshop: '+path);
    if(modules.has(file))return modules.get(file);
    const ns='__native_m'+modules.size;
    modules.set(file,ns);
    let body=readFileSync(file,'utf8');
    const imports=[];
    body=body.replace(/^\s*import\s*\{([^}]+)\}\s*from\s*['"]([^'"]+)['"];?[ \t]*$/gm,(_,names,dep)=>{
      imports.push({names:parseNames(names),dep});return '';
    });
    const bindings=[];
    for(const {names,dep} of imports){
      if(dep.startsWith('node:')){
        // File I/O is not exposed through the chat workshop tool allowlist.
        // References to safePath() are inert unless file-only tools are called.
        continue;
      }
      if(dep==='./engine/index.js'){
        const groups=new Map();
        for(const n of names){
          const path=ENGINE[n.original];
          if(!path)throw Error('Missing browser engine export: '+n.original);
          if(!groups.has(path))groups.set(path,[]);
          groups.get(path).push(n);
        }
        for(const [p,group] of groups){
          const depNs=compile('engine/'+p);
          bindings.push('const {'+group.map(n=>n.original+':'+n.local).join(',')+'}='+depNs+';');
        }
      }else{
        if(!dep.startsWith('./'))throw Error('Unsupported browser import: '+dep);
        const depNs=compile(relative(ROOT,resolve(dirname(file),dep)));
        bindings.push('const {'+names.map(n=>n.original+':'+n.local).join(',')+'}='+depNs+';');
      }
    }
    const exports=[];
    // The portable 3Draft model modules use declaration exports, not re-exports.
    body=body.replace(/^\s*export\s+(?:(async)\s+)?(const|let|var|function|class)\s+([A-Za-z_$][\w$]*)/gm,(_,asyncWord,kind,name)=>{
      exports.push(name);
      return '\n'+(asyncWord?'async ':'')+kind+' '+name;
    });
    if(/^\s*(?:import|export)\b/m.test(body))throw Error('Unbundled ESM in '+path);
    if(!exports.length)throw Error('No exports found in '+path);
    output.push('const '+ns+'=(()=>{\n'+bindings.join('\n')+'\n'+body+'\nreturn {'+[...new Set(exports)].join(',')+'};\n})();');
    return ns;
  }
  const entry=compile('workshop-client.js');
  return output.join('\n')+'\nconst {WorkshopModel}='+entry+';\n';
}
