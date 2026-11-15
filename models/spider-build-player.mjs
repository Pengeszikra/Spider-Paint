import {normalizeBuildDocument, constructionAt, constructionIndexAtTime, cameraAt, narrationAt} from './spider-build-v2.mjs';

const $ = id => document.getElementById(id);
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const params = new URLSearchParams(location.search);
const source = new URL(params.get('file') ?? 'lark-4.build.json', location.href);
let data, api, ready = false, timeMs = 0, index = -1, playing = false, frame = 0, lastTick = 0;
let cutaway = false, focusGroup = null, loadedView = '', objectCount = 0, following = params.has('follow');
const audioPlayers = new Map();
const matches = (name, prefixes) => prefixes.some(prefix => name.startsWith(prefix));
const formatTime = ms => `${Math.floor(ms / 60000)}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')}`;
const currentChapter = () => data.chapters.find(c => c.startMs <= timeMs && timeMs < c.endMs) ?? data.chapters.at(-1);
const useCamera = () => $('recordedCamera').checked;
const useNarration = () => $('narration').checked;

function stopAudio() {for (const audio of audioPlayers.values()) audio.pause();}
function syncAudio(cues, force) {
  const active = new Set();
  if (playing && useNarration() && $('voiceover').checked) for (const cue of cues.filter(c => c.audio)) {
    active.add(cue.id);
    let audio = audioPlayers.get(cue.id);
    if (!audio) {
      const asset = data.assets.audio[cue.audio.assetId];
      audio = new Audio(new URL(asset.uri, source).href);
      audio.preload = 'auto'; audioPlayers.set(cue.id, audio);
    }
    const desired = (timeMs - cue.startMs + (cue.audio.offsetMs ?? 0)) / 1000;
    audio.playbackRate = Number($('speed').value); audio.volume = cue.audio.volume ?? 1;
    if (Number.isFinite(audio.duration) && desired >= audio.duration) {audio.pause(); continue;}
    if (force || Math.abs(audio.currentTime - desired) > .3) audio.currentTime = desired;
    if (audio.paused) audio.play().catch(error => {
      if (error.name !== 'AbortError') $('status').textContent = 'Voiceover could not play. Check the audio file or enable browser audio.';
    });
  }
  for (const [id, audio] of audioPlayers) if (!active.has(id)) audio.pause();
}
function show(nextTime, {force = false} = {}) {
  if (!ready) return;
  timeMs = Math.max(0, Math.min(nextTime, data.timeline.durationMs));
  const nextIndex = constructionIndexAtTime(data, timeMs), chapter = currentChapter();
  const viewKey = `${cutaway}/${focusGroup}`;
  if (force || index !== nextIndex || viewKey !== loadedView) {
    let objects = constructionAt(data, timeMs);
    if (cutaway) objects = objects.filter(o => !matches(o.name, data.presentation?.cutaway?.excludePrefixes ?? []));
    const view = data.presentation?.views?.find(v => v.id === focusGroup);
    if (view) objects = objects.filter(o => matches(o.name, view.includePrefixes) && !matches(o.name, view.excludePrefixes));
    api.load({format: '3draft-scene', version: 1, objects});
    objectCount = objects.length; loadedView = viewKey;
  }
  index = nextIndex;
  if (useCamera() && !cutaway && !focusGroup) {
    const c = cameraAt(data, timeMs); api.eye(...c.eye, c.yaw, c.pitch);
  }
  const cues = narrationAt(data, Math.min(timeMs, Math.max(0, data.timeline.durationMs - .001)));
  $('title').textContent = chapter?.title ?? 'Build recording';
  $('description').textContent = useNarration() ? cues.filter(c => c.channel === 'chapter').map(c => c.text).filter(Boolean).join('\n') : 'Narration is disabled.';
  $('action').textContent = useNarration() ? cues.filter(c => c.channel !== 'chapter').map(c => c.text).filter(Boolean).join('\n') || (index ? 'Construction in progress.' : 'The scene is empty.') : `${index} construction steps applied.`;
  const step = data.tracks.construction.steps[index - 1];
  if (step) {
    const args = {...step.command.args};
    if (args.positions) {args.vertexCount = args.positions.length; delete args.positions;}
    if (args.faces) {args.faceCount = args.faces.length; delete args.faces;}
    $('details').textContent = JSON.stringify({id: step.id, timeMs: step.timeMs, tool: step.command.tool, args}, null, 2);
  } else $('details').textContent = '';
  $('timeline').max = data.timeline.durationMs; $('timeline').value = timeMs;
  $('position').textContent = `${formatTime(timeMs)} / ${formatTime(data.timeline.durationMs)} · ${index} / ${data.tracks.construction.steps.length} steps · ${objectCount} objects`;
  $('chapter').value = chapter?.id ?? '';
  $('previous').disabled = timeMs === 0; $('next').disabled = index === data.tracks.construction.steps.length;
  for (const id of ['hangar', 'quarters']) {
    const view = data.presentation?.views?.find(v => v.id === id);
    $(id).hidden = !view; $(id).disabled = !view || timeMs < view.availableFromMs;
  }
  window.tutorialState = {version: data.version, timeMs, durationMs: data.timeline.durationMs, index,
    total: data.tracks.construction.steps.length, chapter: chapter?.id, objects: objectCount,
    playing, cutaway, focusGroup, recordedCamera: useCamera(), narration: useNarration()};
  syncAudio(cues, force);
}
function pause() {
  playing = false; cancelAnimationFrame(frame); stopAudio(); $('play').textContent = 'Play';
  if (window.tutorialState) window.tutorialState.playing = false;
}
function tick(now) {
  if (!playing) return;
  const delta = now - lastTick; lastTick = now;
  show(timeMs + delta * Number($('speed').value));
  if (timeMs >= data.timeline.durationMs) pause(); else frame = requestAnimationFrame(tick);
}
function play() {
  if (playing) return pause();
  if (timeMs >= data.timeline.durationMs) {focusGroup = null; cutaway = false; setViewButtons(); show(0, {force: true});}
  playing = true; $('play').textContent = 'Pause'; lastTick = performance.now();
  show(timeMs); frame = requestAnimationFrame(tick);
}
function seek(t) {pause(); focusGroup = null; show(t, {force: true}); if (cutaway) preset(data.presentation?.cutaway?.cameraPreset);}
function step(direction) {
  const steps = data.tracks.construction.steps;
  if (direction > 0) seek(steps[index]?.timeMs ?? data.timeline.durationMs);
  else {
    // A single timestamp can contain several atomic construction steps.
    const previousTimes = steps.filter(s => s.timeMs < (steps[index - 1]?.timeMs ?? 0));
    seek(previousTimes.at(-1)?.timeMs ?? 0);
  }
}
function preset(id) {const c = data.tracks.camera.presets[id]; if (c) api.eye(...c.eye, c.yaw, c.pitch);}
function setViewButtons() {$('interior').setAttribute('aria-pressed', cutaway); $('exterior').setAttribute('aria-pressed', !cutaway);}
function view(inside) {
  focusGroup = null; cutaway = inside; setViewButtons(); show(timeMs, {force: true});
  if (inside) preset(data.presentation?.cutaway?.cameraPreset); else {const c=cameraAt(data,timeMs); api.eye(...c.eye,c.yaw,c.pitch);}
}
function focusRoom(id) {
  const v = data.presentation?.views?.find(v => v.id === id); if (!v) return;
  pause(); focusGroup = id; cutaway = true; setViewButtons(); show(timeMs, {force: true}); preset(v.cameraPreset);
}
function chapters() {
  $('chapter').replaceChildren(...data.chapters.map(c => Object.assign(document.createElement('option'), {value: c.id, textContent: c.title})));
}
async function fetchJournal() {
  const response = await fetch(source, {cache: 'no-store'});
  if (!response.ok) throw Error('The build recording could not be loaded.');
  return normalizeBuildDocument(await response.json());
}
$('play').onclick = play;
$('start').onclick = () => seek(0); $('finish').onclick = () => seek(data.timeline.durationMs);
$('previous').onclick = () => step(-1); $('next').onclick = () => step(1);
$('timeline').oninput = event => seek(Number(event.target.value));
$('chapter').onchange = event => seek(data.chapters.find(c => c.id === event.target.value).startMs);
$('exterior').onclick = () => view(false); $('interior').onclick = () => view(true);
$('hangar').onclick = () => focusRoom('hangar'); $('quarters').onclick = () => focusRoom('quarters');
$('recordedCamera').onchange = () => {focusGroup = null; show(timeMs);};
$('narration').onchange = () => show(timeMs); $('voiceover').onchange = () => show(timeMs);
$('follow').onclick = () => {following = !following; $('follow').setAttribute('aria-pressed', following); if (following) seek(data.timeline.durationMs);};
window.addEventListener('keydown', event => {
  if (['INPUT', 'SELECT'].includes(document.activeElement.tagName)) return;
  if (event.code === 'Space') {event.preventDefault(); play();}
  if (event.key === 'ArrowLeft') {event.preventDefault(); step(-1);}
  if (event.key === 'ArrowRight') {event.preventDefault(); step(1);}
});
try {
  data = await fetchJournal(); $('modelName').textContent = data.metadata.shortTitle ?? data.metadata.title;
  $('interior').hidden = !data.presentation?.cutaway;
  document.title = `${data.metadata.title} · Spider Build`;
  if (params.has('file')) {
    $('intro').textContent = data.metadata.title;
    $('crewBadge').hidden = !data.result?.crew;
    if (data.result?.crew) $('crewBadge').textContent = `${data.result.crew} crew`;
    for (const link of document.querySelectorAll('.downloads a:not(#buildDownload)')) link.hidden = true;
  }
  $('buildDownload').href = source.href;
  const deadline = performance.now() + 45000;
  while (!api && performance.now() < deadline) {api = $('viewer').contentWindow?.__3draft; if (!api) await sleep(150);}
  if (!api) throw Error('The Spider engine did not start. Reload the page to try again.');
  await api.open({format: '3draft-scene', version: 1, palette: data.scene.palette, objects: [],
    view: {render: 'webgpu', edges: false, light: true, smooth: true, studio: true}});
  ready = true; chapters(); $('follow').setAttribute('aria-pressed', following);
  $('voiceover').disabled = !data.tracks.narration.cues.some(c => c.audio);
  show(following || params.get('step') === 'final' ? data.timeline.durationMs : 0, {force: true});
  $('status').textContent = 'Spider Build v2 · independent construction, camera and narration tracks.';
  window.tutorialReady = true;
  let polling = false;
  setInterval(async () => {
    if (!following || polling) return; polling = true;
    try {
      const next = await fetchJournal();
      if (next.tracks.construction.steps.length > data.tracks.construction.steps.length) {
        const wasPlaying = playing; pause(); stopAudio(); audioPlayers.clear(); data = next; chapters(); index = -1;
        show(timeMs, {force: true}); if (wasPlaying || timeMs < data.timeline.durationMs) play();
      }
    } catch (error) {$('status').textContent = error.message;} finally {polling = false;}
  }, 1800);
} catch (error) {
  pause(); $('error').style.display = 'block'; $('error').textContent = error.message;
  $('title').textContent = 'The tutorial could not start'; document.querySelectorAll('button').forEach(b => b.disabled = true); console.error(error);
}
