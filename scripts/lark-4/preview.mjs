import {readFileSync,writeFileSync} from 'node:fs';
import {merge,validate,renderSheet,renderView,orbit} from '../../mcp/engine/index.js';
const root=new URL('../../',import.meta.url),j=JSON.parse(readFileSync(new URL('models/lark-4-tutorial.json',root),'utf8'));
const map=new Map;for(const e of j.events){if(e.after)map.set(e.name,e.after);else if(e.method==='remove')map.delete(e.name)}
const objects=[...map.values()],bad=objects.map(o=>({name:o.name,...validate(o.mesh)})).filter(o=>!o.ok);if(bad.length)throw Error(JSON.stringify(bad));
const materials=Object.fromEntries(j.palette.map(({name,...m})=>[name,m]));
const clean=objects.filter(o=>!o.name.startsWith('guide/'));
const all=merge(...clean.map(o=>o.mesh));
writeFileSync('/tmp/lark-4-current.svg',renderView(all,orbit({yaw:-.65,pitch:.43}),{size:1300,points:false,palette:materials,stroke:'#15232a35',background:'#dbe3df'}));
writeFileSync('/tmp/lark-4-sheet.svg',renderSheet(all,{size:600,points:false,palette:materials,stroke:'#15232a35',background:'#dbe3df'}));
writeFileSync(new URL('models/lark-4-working.scene.json',root),JSON.stringify({format:'3draft-scene',version:1,name:'LARK–4 — construction',palette:j.palette,objects,view:{render:'webgpu',edges:false,light:true,smooth:true,studio:true}}));
console.log(JSON.stringify({chapters:j.chapters.length,operations:j.events.length,objects:objects.length,invalid:bad.length}));
