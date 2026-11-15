/** Spider Build v2: dependency-free, shared by the browser and Node authoring tools. */
export const FORMAT = 'spider-build-tutorial';
export const VERSION = 2;
const copy = value => structuredClone(value);
const pose = (eye, target) => {
  const d = target.map((v, i) => v - eye[i]);
  return {eye, yaw: Math.atan2(d[0], -d[2]) * 180 / Math.PI,
    pitch: -Math.atan2(d[1], Math.hypot(d[0], d[2])) * 180 / Math.PI};
};

/** Upgrade legacy logs without altering their recorded commands or geometry. */
export function migrateV1(old) {
  if (old?.format !== FORMAT || old.version !== 1) throw Error('Expected a version 1 Spider build log.');
  const meshes = {}, meshIds = new Map(), steps = [], cues = [], frames = [], chapters = [];
  const isLark = /^LARK/i.test(old.shortTitle ?? old.title ?? '');
  const intern = mesh => {
    const key = JSON.stringify(mesh);
    if (!meshIds.has(key)) {
      const id = `mesh-${String(meshIds.size + 1).padStart(6, '0')}`;
      meshIds.set(key, id); meshes[id] = copy(mesh);
    }
    return meshIds.get(key);
  };
  const chapterByStart = new Map(old.chapters.map(c => [c.start, c]));
  let time = 0;
  for (const [i, event] of old.events.entries()) {
    const chapter = chapterByStart.get(i);
    if (chapter) {
      if (i) time += 1500;
      chapters.push({id: `chapter-${chapter.id}`, title: chapter.title, startMs: time, endMs: 0});
      cues.push({id: `chapter-text-${chapter.id}`, channel: 'chapter', language: old.language ?? 'en',
        startMs: time, endMs: 0, text: chapter.text});
      if (chapter.camera) {
        const c = chapter.camera, target = c.target ?? [0, 2, 0];
        // Preserve the original player's framing, including its distance adjustment.
        frames.push({id: `camera-${chapter.id}`, timeMs: time, transition: 'cut',
          pose: {eye: c.eye.map((v, k) => target[k] + (v - target[k]) * (isLark ? (chapter.id >= 15 ? 1.12 : 1.3) : 1)), yaw: c.yaw, pitch: c.pitch}});
      }
    }
    time += event.duration ?? 650;
    steps.push({id: `build-${String(i + 1).padStart(6, '0')}`, timeMs: time,
      command: {tool: event.method, args: copy(event.args)},
      changes: event.after ? [{type: 'put', object: {name: event.after.name, meshRef: intern(event.after.mesh)}}] :
        event.method === 'remove' ? [{type: 'remove', name: event.name}] : [],
      provenance: {source: event.source ?? 'spider-paint MCP', ...(event.executedAt ? {executedAt: event.executedAt} : {})}});
    cues.push({id: `operation-text-${i + 1}`, channel: 'operation', language: old.language ?? 'en',
      startMs: time, endMs: 0, text: event.label ?? event.method});
  }
  const durationMs = time + 1500;
  for (let i = 0; i < chapters.length; i++) chapters[i].endMs = chapters[i + 1]?.startMs ?? durationMs;
  for (const channel of ['chapter', 'operation']) {
    const group = cues.filter(c => c.channel === channel);
    group.forEach((cue, i) => {cue.endMs = group[i + 1]?.startMs ?? durationMs;});
  }
  const presets = {
    cutaway: old.cutawayCamera ? {eye: copy(old.cutawayCamera.eye), yaw: old.cutawayCamera.yaw, pitch: old.cutawayCamera.pitch} : pose([-10.4, 10, 13], [0, 2, 0]),
    hangar: pose([10, 13, -21], [0, 3.2, -10.2]),
    quarters: pose([-8.5, 10.5, .5], [0, 2.7, -4.8])
  };
  const extended = isLark && old.chapters.find(c => c.id === 15);
  const availableFromMs = extended ? chapters.find(c => c.id === 'chapter-15').startMs : durationMs;
  const doc = {
    $schema: './spider-build-v2.schema.json', format: FORMAT, version: VERSION,
    metadata: {id: old.id ?? ((old.shortTitle ?? old.title ?? 'build').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'build'), title: old.title, shortTitle: old.shortTitle ?? old.title, language: old.language ?? 'en', units: old.units ?? 'metres',
      ...(old.createdAt ? {createdAt: old.createdAt} : {}), ...(old.finishedAt ? {finishedAt: old.finishedAt} : {})},
    timeline: {timeUnit: 'ms', durationMs},
    assets: {meshes, audio: {}}, scene: {palette: copy(old.palette ?? []), objects: []}, chapters,
    tracks: {
      construction: {steps},
      camera: {initialPose: frames[0]?.pose ?? pose([8, 6, 10], [0, 2, 0]), keyframes: frames, presets},
      narration: {cues: cues.sort((a, b) => a.startMs - b.startMs)}
    },
    presentation: {cutaway: {excludePrefixes: copy(old.cutawayPrefixes ?? []), cameraPreset: 'cutaway'}, views: extended ? [
      {id: 'hangar', title: 'Hangar', cameraPreset: 'hangar', availableFromMs,
        includePrefixes: ['hangar/', 'extension/structure/hangar-', 'extension/interior/hangar-floor', 'extension/shell/hangar-'],
        excludePrefixes: ['hangar/ramp/', 'hangar/gate/leaf-']},
      {id: 'quarters', title: 'Crew quarters', cameraPreset: 'quarters', availableFromMs,
        includePrefixes: ['extension/interior/', 'interior/oxygen-', 'extension/shell/crew-'],
        excludePrefixes: ['extension/interior/hangar-floor']}
    ] : []},
    ...(old.final ? {result: copy(old.final)} : {})
  };
  validateBuildDocument(doc);
  return doc;
}

export function normalizeBuildDocument(doc) {
  if (doc?.version === 1) return migrateV1(doc);
  validateBuildDocument(doc);
  return doc;
}

/** Semantic checks supplement the published JSON Schema; throws a path-specific error. */
export function validateBuildDocument(doc) {
  const fail = (path, message) => {throw Error(`${path}: ${message}`);};
  const object = (v, path) => {if (!v || typeof v !== 'object' || Array.isArray(v)) fail(path, 'expected an object');};
  const array = (v, path) => {if (!Array.isArray(v)) fail(path, 'expected an array');};
  const string = (v, path) => {if (typeof v !== 'string' || !v.length) fail(path, 'expected a nonempty string');};
  const finite = (v, path) => {if (typeof v !== 'number' || !Number.isFinite(v)) fail(path, 'expected a finite number');};
  const keys = (v, allowed, path) => {object(v, path); for (const k of Object.keys(v)) if (!allowed.includes(k)) fail(`${path}.${k}`, 'unknown field');};
  object(doc, '$');
  keys(doc, ['$schema','format','version','metadata','timeline','assets','scene','chapters','tracks','presentation','result'], '$');
  if (doc.format !== FORMAT || doc.version !== VERSION) fail('$', 'unsupported Spider build format/version');
  if (doc.$schema !== undefined) string(doc.$schema, '$schema');
  if (doc.result !== undefined) object(doc.result, 'result');
  keys(doc.metadata, ['id','title','shortTitle','language','units','createdAt','finishedAt'], 'metadata');
  for (const k of ['id','title','language','units']) string(doc.metadata[k], `metadata.${k}`);
  if (doc.metadata.units !== 'metres') fail('metadata.units', 'v2 uses metres');
  if (doc.metadata.shortTitle !== undefined) string(doc.metadata.shortTitle, 'metadata.shortTitle');
  for (const k of ['createdAt','finishedAt']) if (doc.metadata[k] !== undefined && (typeof doc.metadata[k] !== 'string' || !Number.isFinite(Date.parse(doc.metadata[k])))) fail(`metadata.${k}`, 'expected an ISO date-time');
  keys(doc.timeline, ['timeUnit','durationMs'], 'timeline');
  if (doc.timeline.timeUnit !== 'ms') fail('timeline.timeUnit', 'expected ms');
  const duration = doc.timeline.durationMs;
  finite(duration, 'timeline.durationMs');
  if (duration < 0) fail('timeline.durationMs', 'must be nonnegative');
  const time = (v, path) => {finite(v, path); if (v < 0 || v > duration) fail(path, 'outside timeline');};
  const vec = (v, path) => {array(v, path); if (v.length !== 3) fail(path, 'expected three coordinates'); v.forEach((x, i) => finite(x, `${path}[${i}]`));};
  const camera = (v, path) => {keys(v, ['eye','yaw','pitch'], path); vec(v.eye, `${path}.eye`); finite(v.yaw, `${path}.yaw`); finite(v.pitch, `${path}.pitch`); if (v.pitch < -90 || v.pitch > 90) fail(path, 'pitch must be between -90 and 90');};
  const unique = (items, path) => {array(items, path); const ids = new Set(); for (const item of items) {object(item,path); string(item.id, `${path}.id`); if (ids.has(item.id)) fail(path, `duplicate id ${item.id}`); ids.add(item.id);}};
  const ordered = (items, field, path) => {let previous = -1; for (const item of items) {time(item[field], `${path}.${field}`); if (item[field] < previous) fail(path, 'times must be nondecreasing'); previous = item[field];}};
  keys(doc.assets, ['meshes','audio'], 'assets'); object(doc.assets.meshes, 'assets.meshes'); object(doc.assets.audio, 'assets.audio');
  keys(doc.scene, ['palette','objects'], 'scene'); array(doc.scene.palette, 'scene.palette'); array(doc.scene.objects, 'scene.objects');
  const materials = new Set();
  for (const material of doc.scene.palette) {
    object(material, 'scene.palette'); string(material.name, 'scene.palette.name');
    if (materials.has(material.name)) fail('scene.palette', `duplicate material ${material.name}`);
    materials.add(material.name);
    if (material.color !== undefined) string(material.color, 'scene.palette.color');
    for (const k of ['metal','rough','emit','soft']) if (material[k] !== undefined) finite(material[k], `scene.palette.${k}`);
    if (material.alpha !== undefined) {finite(material.alpha, 'scene.palette.alpha'); if (material.alpha < 0 || material.alpha > 1) fail('scene.palette.alpha', 'outside 0..1');}
  }
  for (const [id, mesh] of Object.entries(doc.assets.meshes)) {
    const path = `assets.meshes.${id}`;
    keys(mesh, ['positions','faces'], path); array(mesh.positions, `${path}.positions`); array(mesh.faces, `${path}.faces`);
    mesh.positions.forEach((v, i) => vec(v, `${path}.positions[${i}]`));
    for (const face of mesh.faces) {
      keys(face, ['v','color','mat'], path); array(face.v, `${path}.faces.v`);
      if (face.v.length < 3 || face.v.some(v => !Number.isInteger(v) || v < 0 || v >= mesh.positions.length)) fail(path, 'invalid face vertex indices');
      if (face.color !== undefined) string(face.color, `${path}.faces.color`);
      if (face.mat !== undefined && !materials.has(face.mat)) fail(path, `unknown material ${face.mat}`);
    }
  }
  for (const [id, asset] of Object.entries(doc.assets.audio)) {
    keys(asset, ['uri','mimeType'], `assets.audio.${id}`); string(asset.uri, `assets.audio.${id}.uri`); string(asset.mimeType, `assets.audio.${id}.mimeType`);
    if (!/^(?:https?:|data:audio\/|[^:/?#]+(?:\/|$))/.test(asset.uri) || /^(?:javascript|file):/i.test(asset.uri)) fail(`assets.audio.${id}.uri`, 'expected relative, HTTP(S), or audio data URI');
  }
  const names = new Set();
  const obj = (o, path) => {keys(o, ['name','meshRef'], path); string(o.name, `${path}.name`); string(o.meshRef, `${path}.meshRef`); if (!Object.hasOwn(doc.assets.meshes, o.meshRef)) fail(path, `unknown mesh ${o.meshRef}`);};
  for (const o of doc.scene.objects) {obj(o, 'scene.objects'); if (names.has(o.name)) fail('scene.objects', `duplicate object ${o.name}`); names.add(o.name);}
  keys(doc.tracks, ['construction','camera','narration'], 'tracks');
  keys(doc.tracks.construction, ['steps'], 'tracks.construction');
  const steps = doc.tracks.construction.steps;
  unique(steps, 'construction.steps'); ordered(steps, 'timeMs', 'construction.steps');
  for (const s of steps) {
    keys(s, ['id','timeMs','command','changes','provenance'], `construction.${s.id}`);
    keys(s.command, ['tool','args'], `construction.${s.id}.command`); string(s.command.tool, 'command.tool'); object(s.command.args, 'command.args');
    if (s.provenance !== undefined) {
      keys(s.provenance,['source','executedAt'],'provenance'); string(s.provenance.source,'provenance.source');
      if (s.provenance.executedAt !== undefined && (typeof s.provenance.executedAt !== 'string' || !Number.isFinite(Date.parse(s.provenance.executedAt)))) fail('provenance.executedAt', 'expected an ISO date-time');
    }
    array(s.changes, 'changes');
    if (!s.changes.length) fail(s.id, 'must record at least one resulting change');
    for (const c of s.changes) {
      if (c.type === 'put') {keys(c, ['type','object'], s.id); obj(c.object, s.id); names.add(c.object.name);}
      else if (c.type === 'remove') {keys(c, ['type','name'], s.id); string(c.name, s.id); if (!names.delete(c.name)) fail(s.id, `cannot remove missing object ${c.name}`);}
      else fail(s.id, 'unknown change type');
    }
  }
  const cam = doc.tracks.camera;
  keys(cam, ['initialPose','keyframes','presets'], 'tracks.camera'); camera(cam.initialPose, 'camera.initialPose');
  unique(cam.keyframes, 'camera.keyframes'); ordered(cam.keyframes, 'timeMs', 'camera.keyframes'); object(cam.presets, 'camera.presets');
  let prev = -1;
  for (const f of cam.keyframes) {
    keys(f, ['id','timeMs','pose','transition'], f.id); camera(f.pose, f.id);
    if (f.timeMs <= prev) fail(f.id, 'camera times must be strictly increasing'); prev = f.timeMs;
    if (!['cut','linear','smoothstep'].includes(f.transition)) fail(f.id, 'unknown camera transition');
  }
  for (const [id, p] of Object.entries(cam.presets)) camera(p, `camera.presets.${id}`);
  keys(doc.tracks.narration, ['cues'], 'tracks.narration');
  const cues = doc.tracks.narration.cues;
  unique(cues, 'narration.cues'); ordered(cues, 'startMs', 'narration.cues');
  for (const c of cues) {
    keys(c, ['id','startMs','endMs','channel','language','text','audio'], c.id);
    time(c.endMs, `${c.id}.endMs`); if (c.endMs <= c.startMs) fail(c.id, 'cue end must follow start');
    if (!['chapter','operation','voiceover'].includes(c.channel)) fail(c.id, 'unknown narration channel');
    string(c.language, `${c.id}.language`);
    if (c.text !== undefined) string(c.text, `${c.id}.text`);
    if (!c.text && !c.audio) fail(c.id, 'expected text or audio');
    if (c.audio) {
      keys(c.audio, ['assetId','offsetMs','volume'], `${c.id}.audio`);
      if (!Object.hasOwn(doc.assets.audio, c.audio.assetId)) fail(c.id, `unknown audio asset ${c.audio.assetId}`);
      if (c.audio.offsetMs !== undefined) {finite(c.audio.offsetMs, c.id); if (c.audio.offsetMs < 0) fail(c.id, 'negative audio offset');}
      if (c.audio.volume !== undefined) {finite(c.audio.volume, c.id); if (c.audio.volume < 0 || c.audio.volume > 1) fail(c.id, 'audio volume outside 0..1');}
    }
  }
  unique(doc.chapters, 'chapters'); ordered(doc.chapters, 'startMs', 'chapters');
  let chapterEnd = 0;
  for (const c of doc.chapters) {
    keys(c, ['id','title','startMs','endMs'], c.id); string(c.title, c.id); time(c.endMs, c.id);
    if (c.startMs < chapterEnd || c.endMs <= c.startMs) fail(c.id, 'overlapping or empty chapter'); chapterEnd = c.endMs;
  }
  if (doc.presentation) {
    keys(doc.presentation, ['cutaway','views'], 'presentation');
    const preset = v => {if (!Object.hasOwn(cam.presets, v)) fail('presentation', `unknown camera preset ${v}`);};
    const prefixes = (v, path) => {array(v,path); v.forEach(x => string(x,path));};
    if (doc.presentation.cutaway) {const v=doc.presentation.cutaway; keys(v,['excludePrefixes','cameraPreset'],'presentation.cutaway'); preset(v.cameraPreset); prefixes(v.excludePrefixes,'cutaway.excludePrefixes');}
    unique(doc.presentation.views ?? [], 'presentation.views');
    for (const v of doc.presentation.views ?? []) {
      keys(v, ['id','title','cameraPreset','availableFromMs','includePrefixes','excludePrefixes'], v.id);
      string(v.title,v.id); preset(v.cameraPreset); time(v.availableFromMs,v.id);
      prefixes(v.includePrefixes,`${v.id}.includePrefixes`); prefixes(v.excludePrefixes,`${v.id}.excludePrefixes`);
    }
  }
  return doc;
}

/** Count all steps at or before the playhead; equal times use serialized array order. */
export function constructionIndexAtTime(doc, timeMs) {
  const steps = doc.tracks.construction.steps;
  let lo = 0, hi = steps.length;
  while (lo < hi) {const mid = (lo + hi) >>> 1; if (steps[mid].timeMs <= timeMs) lo = mid + 1; else hi = mid;}
  return lo;
}
export function constructionAt(doc, timeMs) {
  const map = new Map(doc.scene.objects.map(o => [o.name, o]));
  const end = constructionIndexAtTime(doc, timeMs);
  for (let i = 0; i < end; i++) for (const c of doc.tracks.construction.steps[i].changes) {
    if (c.type === 'put') map.set(c.object.name, c.object); else map.delete(c.name);
  }
  // Returned snapshots are independent: a viewer/editor cannot mutate saved assets.
  return copy([...map.values()].map(o => ({name: o.name, mesh: doc.assets.meshes[o.meshRef]})));
}
export function cameraAt(doc, timeMs) {
  let previous = {timeMs: 0, pose: doc.tracks.camera.initialPose};
  for (const next of doc.tracks.camera.keyframes) {
    if (next.timeMs <= timeMs) {previous = next; continue;}
    if (next.transition === 'cut' || timeMs <= previous.timeMs) return copy(previous.pose);
    let t = Math.max(0, Math.min(1, (timeMs - previous.timeMs) / (next.timeMs - previous.timeMs)));
    if (next.transition === 'smoothstep') t = t * t * (3 - 2 * t);
    const a = previous.pose, b = next.pose, yawDelta = ((b.yaw - a.yaw + 180) % 360 + 360) % 360 - 180;
    return {eye: a.eye.map((v, i) => v + (b.eye[i] - v) * t), yaw: a.yaw + yawDelta * t, pitch: a.pitch + (b.pitch - a.pitch) * t};
  }
  return copy(previous.pose);
}
export function narrationAt(doc, timeMs) {
  return doc.tracks.narration.cues.filter(c => c.startMs <= timeMs && timeMs < c.endMs);
}
