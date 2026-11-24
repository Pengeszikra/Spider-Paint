// Capability-scoped, short-lived shared workshop state.
// In-memory MVP: pin Cloud Run to one instance. Restart drops sessions;
// production multi-instance collaboration requires a durable adapter.
import { randomBytes } from 'node:crypto';

const TTL=2*60*60*1000, MAX_SESSIONS=64, MAX_SCENE_BYTES=600000;
const sessions=new Map();
const copy=v=>JSON.parse(JSON.stringify(v));
const validId=id=>typeof id==='string'&&/^[0-9a-f]{40}$/.test(id);
function clean(){
  const now=Date.now();
  for(const [id,s] of sessions)if(now-s.touched>TTL)sessions.delete(id);
  while(sessions.size>=MAX_SESSIONS)sessions.delete(sessions.keys().next().value);
}
export class WorkshopSessionError extends Error {
  constructor(code,details={}){super(code);this.code=code;this.details=details;}
}
export const workshopSessionCount=()=>sessions.size;
export function workshopSessionExists(id){clean();return validId(id)&&sessions.has(id);}
function get(id){
  clean();
  if(!validId(id))throw new WorkshopSessionError('workshop_session_not_found',{cause:'malformed_session_id'});
  if(!sessions.has(id))throw new WorkshopSessionError('workshop_session_not_found',{cause:'unknown_in_this_process',sessions:sessions.size,ttl_s:TTL/1000});
  const s=sessions.get(id);s.touched=Date.now();return s;
}
const summary=scene=>(scene?.objects||[]).slice(0,150).map(o=>{
  const ps=o.mesh?.positions||[];
  const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];
  for(const p of ps)for(let i=0;i<3;i++){min[i]=Math.min(min[i],p[i]);max[i]=Math.max(max[i],p[i]);}
  return {name:o.name,vertices:ps.length,faces:o.mesh?.faces?.length||0,...(ps.length?{min,max}:{})};
});
export function createWorkshopSession(){
  clean();
  const id=randomBytes(20).toString('hex');
  sessions.set(id,{id,revision:0,scene:null,pending:null,lastEdit:null,touched:Date.now()});
  return id;
}
export function readWorkshopSession(id,includeScene=false){
  const s=get(id);
  return {session_id:id,revision:s.revision,ready:!!s.scene,objects:summary(s.scene),
    object_count:s.scene?.objects?.length||0,
    pending:s.pending?{batch_id:s.pending.id,steps:s.pending.steps,revision:s.pending.revision}:null,
    last_edit:s.lastEdit,
    ...(includeScene&&s.scene?{scene:copy(s.scene)}:{})};
}
export function publishWorkshopScene({session_id,revision,scene,batch_id}){
  const s=get(session_id);
  if(!Number.isSafeInteger(revision)||revision!==s.revision)throw Error('workshop_revision_conflict');
  if(s.pending&&batch_id!==s.pending.id)throw Error('workshop_edit_pending');
  if(!s.pending&&batch_id)throw Error('unexpected_workshop_batch');
  if(!scene||scene.format!=='3draft-scene'||!Array.isArray(scene.objects))throw Error('invalid_workshop_scene');
  const json=JSON.stringify(scene);
  if(Buffer.byteLength(json)>MAX_SCENE_BYTES||scene.objects.length>3000)throw Error('workshop_scene_too_large');
  if(scene.objects.some(o=>!o||typeof o.name!=='string'||!o.mesh||!Array.isArray(o.mesh.positions)||!Array.isArray(o.mesh.faces)))throw Error('invalid_workshop_object');
  s.scene=JSON.parse(json);
  s.revision++;
  if(s.pending){
    s.lastEdit={batch_id:s.pending.id,status:'applied',revision:s.revision};
    s.pending=null;
  }
  return {session_id:s.id,revision:s.revision,objects:s.scene.objects.length,applied:true};
}
export function enqueueWorkshopEdit({session_id,revision,steps}){
  const s=get(session_id);
  if(!s.scene)throw Error('workshop_scene_not_ready');
  if(s.pending)throw Error('workshop_edit_already_pending');
  if(!Number.isSafeInteger(revision)||revision!==s.revision)throw Error('workshop_revision_conflict');
  if(!Array.isArray(steps)||steps.length<1||steps.length>100)throw Error('invalid_workshop_steps');
  if(steps.some(v=>!v||typeof v.tool!=='string'||(v.args!==undefined&&(typeof v.args!=='object'||!v.args||Array.isArray(v.args)))))throw Error('invalid_workshop_step');
  if(Buffer.byteLength(JSON.stringify(steps))>100000)throw Error('workshop_edit_too_large');
  s.pending={id:randomBytes(12).toString('hex'),revision,steps:copy(steps)};
  return {session_id,revision,batch_id:s.pending.id,status:'queued',steps:steps.length};
}
export function rejectWorkshopEdit({session_id,batch_id,reason}){
  const s=get(session_id);
  if(!s.pending||s.pending.id!==batch_id)throw Error('workshop_batch_not_found');
  s.lastEdit={batch_id,status:'failed',reason:String(reason||'client_rejected').slice(0,200),revision:s.revision};
  s.pending=null;
  return {session_id,revision:s.revision,...s.lastEdit};
}
