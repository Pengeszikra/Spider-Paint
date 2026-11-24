// Bounded, privacy-preserving diagnostics for the spider-paint MCP App.
// Never log arguments, scene meshes, URLs, tokens or raw exception stacks.
import { randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';

const MAX_TRACES = 128;
const TTL_MS = 15 * 60 * 1000;
const MAX_EVENTS = 48;
const traces = new Map();
const fields = new Set(['stepCount','objects','vertices','faces','payloadBytes','durationMs','phase','reason','httpStatus','widgetObjects','widgetFaces','widgetMs','host']);
// Widget phases that describe the MCP Apps host handshake. They exist so a
// missing editor can be located: no tool result, rejected init, failed calls.
export const WIDGET_PHASES = ['widget_loaded','widget_rendered','widget_error','widget_empty','native_frame_loaded','native_editor_ready','native_key_seen',
  'widget_boot','bridge_ready','bridge_init_rejected','tool_input_received','tool_result_received','tool_output_missing','host_call_failed','context_push_failed','native_boot','native_boot_error'];
const phases = new Set(['request_received','steps_validated','model_started','model_finished','scene_unpacked','response_ready','request_failed',...WIDGET_PHASES]);
// One id per server process. Two calls that disagree about it reached two
// different processes (Cloud Run instance, restarted local server, other host).
const INSTANCE = Object.freeze({ id: randomUUID().slice(0, 8), startedMs: Date.now() });
export function instanceInfo(extra = {}) {
  return {
    instance: INSTANCE.id,
    uptimeS: Math.round((Date.now() - INSTANCE.startedMs) / 1000),
    runtime: process.env.K_SERVICE ? 'cloud-run' : process.env.VERCEL ? 'vercel' : 'local',
    ...(process.env.K_REVISION ? { revision: process.env.K_REVISION } : {}),
    ...extra,
  };
}
const number = value => typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.round(value)) : undefined;
function trim() {
  const now = Date.now();
  for (const [id, t] of traces) if (now - t.createdMs > TTL_MS) traces.delete(id);
  while (traces.size > MAX_TRACES) traces.delete(traces.keys().next().value);
}
function log(t, e) {
  console.log(JSON.stringify({
    severity: e.phase === 'request_failed' || e.phase === 'widget_error' ? 'ERROR' : 'INFO',
    component: 'spider-paint-mcp',
    traceId: t.id,
    phase: e.phase,
    elapsedMs: e.elapsedMs,
    ...Object.fromEntries(Object.entries(e).filter(([k]) => fields.has(k))),
  }));
}
export function startTrace(stepCount = 0) {
  trim();
  const id = randomUUID();
  const t = { id, createdMs: Date.now(), started: performance.now(), events: [], status: 'running' };
  traces.set(id, t);
  recordTrace(id, 'request_received', { stepCount });
  return id;
}
export function recordTrace(id, phase, details = {}) {
  trim();
  const t = traces.get(id);
  if (!t || !phases.has(phase)) return false;
  const e = { phase, elapsedMs: Math.round(performance.now() - t.started) };
  for (const [key, value] of Object.entries(details)) {
    if (!fields.has(key)) continue;
    if (key === 'reason' || key === 'host') e[key] = String(value || 'unknown').slice(0, 64).replace(/[^\w .:/@-]/g, '_');
    else if (key === 'phase') continue;
    else { const n = number(value); if (n !== undefined) e[key] = n; }
  }
  t.events.push(e);
  if (t.events.length > MAX_EVENTS) t.events.shift();
  if (phase === 'response_ready') t.status = 'server_complete';
  if (phase === 'request_failed') t.status = 'server_error';
  if (phase === 'widget_rendered') t.status = 'widget_rendered';
  if (phase === 'native_frame_loaded' && t.status === 'server_complete') t.status = 'native_frame_loaded';
  if (phase === 'native_editor_ready' && !['widget_rendered','widget_empty'].includes(t.status)) t.status = 'native_editor_ready';
  if (phase === 'native_key_seen' && !['widget_rendered','widget_empty','widget_error'].includes(t.status)) t.status = 'native_key_seen';
  if (phase === 'widget_error') t.status = 'widget_error';
  if (['widget_boot','bridge_ready','tool_input_received','tool_result_received'].includes(phase) && t.status === 'server_complete') t.status = 'widget_handshake';
  if (['bridge_init_rejected','tool_output_missing'].includes(phase) && !['widget_rendered','widget_empty'].includes(t.status)) t.status = phase;
  log(t, e);
  return true;
}
// Remember which workshop session a trace opened. The id itself is a
// capability and is never returned; only whether it still exists.
export function linkTraceSession(id, sessionId) {
  const t = traces.get(id);
  if (t) t.sessionId = sessionId;
}
export function recentTraces(sessionExists = () => null, limit = 10) {
  trim();
  return [...traces.values()].slice(-limit).reverse().map(t => ({
    trace_id: t.id,
    status: t.status,
    created_at: new Date(t.createdMs).toISOString(),
    events: t.events.length,
    last_phase: t.events.at(-1)?.phase,
    widget_events: t.events.filter(e => WIDGET_PHASES.includes(e.phase)).length,
    ...(t.sessionId ? { session_alive: sessionExists(t.sessionId) } : {}),
  }));
}
export function readTrace(id, sessionExists = () => null) {
  trim();
  if (typeof id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f-]{27,}$/.test(id)) return null;
  const t = traces.get(id);
  if (!t) return null;
  return {
    trace_id: t.id,
    status: t.status,
    created_at: new Date(t.createdMs).toISOString(),
    events: t.events.map(e => ({ ...e })),
    widget_events: t.events.filter(e => WIDGET_PHASES.includes(e.phase)).length,
    ...(t.sessionId ? { session_alive: sessionExists(t.sessionId) } : {}),
    server: instanceInfo({ traces: traces.size }),
    hint: hintFor(t),
    note: 'Instance-local, expires after 15 minutes. Missing client events do not prove a client failure. Cloud Logging provides cross-instance correlation.',
  };
}
export function safeErrorCode(error) {
  const s = String(error?.code || error?.name || 'Error');
  return s.replace(/[^a-zA-Z0-9_:-]/g, '_').slice(0, 48) || 'Error';
}

function hintFor(t) {
  const seen = new Set(t.events.map(e => e.phase));
  if (t.status === 'server_error') return 'The server rejected the request; see reason.';
  if (!WIDGET_PHASES.some(p => seen.has(p))) return 'No widget event reached this server process. Either the host did not render the widget, the widget never got its tool result, or the host refuses widget tools/call for this connector. Read the widget model context (ui/update-model-context) to tell these apart.';
  if (seen.has('bridge_init_rejected')) return 'The host rejected ui/initialize.';
  if (seen.has('tool_output_missing')) return 'The widget initialised but received neither tool-result nor usable tool-input.';
  if (seen.has('host_call_failed')) return 'At least one widget tools/call failed; see reason.';
  if (seen.has('native_boot_error') && !seen.has('native_editor_ready')) return 'The native editor started but threw before it was ready; see the native_boot_error reason (and native_boot for origin/storage).';
  if (!seen.has('native_frame_loaded') && seen.has('widget_loaded')) return 'The native editor iframe did not load; check frame CSP (frameDomains).';
  if (seen.has('native_frame_loaded') && !seen.has('native_boot') && !seen.has('native_editor_ready')) return 'The editor frame navigated but no native script reported back: the frame was probably blocked (host frame CSP / frameDomains) or its messages were filtered.';
  if (!seen.has('widget_rendered') && !seen.has('widget_empty') && seen.has('native_frame_loaded')) return 'The editor loaded but did not confirm the scene.';
  return 'Widget pipeline complete.';
}
