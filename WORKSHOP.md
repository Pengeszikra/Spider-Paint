# spider-paint collaborative workshop — MCP v8 (26.11.22.001)

This is a browser-native, ChatGPT-embedded collaboration **MVP**. The real spider-paint `index.html` is the one and only editor. This protocol adds scene synchronization, not a new panel, toolbar or keyboard map.

## Data flow

1. Agent invokes `open_workshop({steps})`. MCP validates and relays the operations, creates a cryptographically random `session_id`, and sends a widget with `baseScene` + steps.
2. The widget executes those steps with bundled `WorkshopModel`, packs a `#scene` fragment, and embeds `index.html?workshop=1#session=...&scene=...`. Geometry still runs in the browser.
3. The **native** editor imports, emits `native_scene_loaded` and `native_scene_changed` carrying an exported `3draft-scene`. Native edits call existing `rebuild()`; its new hook debounces and publishes snapshots without changing the UI or key handling.
4. The parent widget calls `workshop_publish({session_id,revision,scene})` and receives the new revision.
5. Agent calls `workshop_state({session_id,include_scene?:boolean})` to inspect the latest real scene, object names, bounds, and revision. `include_scene:true` obtains the full native export when necessary.
6. Agent calls `workshop_edit({session_id,revision,steps})`. An accepted call means **queued**, not executed.
7. The still-open widget polls `workshop_poll`, replays the steps in a browser-side `WorkshopModel` initialized from the last native scene, and posts `apply_scene` to the native iframe. The native editor imports it through its existing `loadScene` path and publishes the result with the `batch_id`. The server commits the new revision and reports `last_edit.status=applied`. Errors are reported via `workshop_reject`.
8. Agent rechecks `workshop_state` before giving another geometry command. Revisions are optimistic compare-and-swap; stale edits are rejected instead of silently overwriting a human.

## Inline native editor (MCP App hosts without nested frames)

Since workshop-v12 the widget no longer frames `https://spider-paint.vercel.app`. `mcp/workshop-native-inline.js` packages the real `index.html` and its 3Draft engine into one document at resource-build time (scoped modules, no bundler, no network), and the widget loads it into its child frame with `srcdoc`. The editor source, UI and key bindings are unchanged; only its module imports, the worker engine URL (workers fall back to the main thread) and the launch parameters (`window.__native_launch` instead of `location.search` / `location.hash`) are rewired. This works in hosts that sandbox the widget without `allow-same-origin` and ignore `frameDomains` (Claude): the child then reports origin `null` and keeps Web Storage in memory. `tests/mcp-widget-inline-browser.mjs` (local, Playwright) runs the widget in such a sandboxed host and requires `native_editor_ready` and `widget_rendered`.

## App tools (host → view, no queue)

Since 26.11.23.007 the widget declares the MCP Apps `tools` capability in `ui/initialize` and answers the host's `tools/list` / `tools/call` requests itself, so a host that supports app tools (Claude) can edit the open view directly:

- `get_scene({include_scene?})` — object names and bounds of the scene in this view, plus the shared revision.
- `apply_steps({steps})` — replays the steps in the browser-side `WorkshopModel` built from the last native scene, posts `apply_scene` to the native editor and answers only after `native_scene_loaded` confirms it (20 s timeout). A failing step changes nothing. The native editor then publishes the result to the session as usual, so `workshop_state` stays in step.

The tool definitions are constant (a host's saved "Always allow" is tied to them). Hosts list a newly opened view's tools with the user's next message. The server queue (`workshop_edit` + poll) remains the path for hosts without app tools. `tests/mcp-widget-bridge.mjs` covers the list, read, apply and failure paths.

## Stories inline (`open_workshop` `story`)

`open_workshop({ story })` takes the `story_token` (or `open_url`) of `build_story` instead of steps. The server only
checks that it is a Spider Build v2 recording and returns it as `structuredContent.story_token`, with no session. The
widget launches the same native editor with `#story=<token>`, and the editor opens it with its existing `openStory`, the
Stories player of the LARK recordings: no new UI. The native scene-count check is skipped for a story (its objects come
from the timeline). `workshop_state` / `workshop_edit` do not apply. `tests/story.mjs` covers the server side.

## Large model transfer

For tool requests whose declarative command history exceeds 32 KiB, `open_workshop` returns only a compressed `workshop_token` in its structured payload, not duplicate raw steps. The widget unpacks the history locally using `DecompressionStream('deflate-raw')` before executing the same `WorkshopModel`. Small calls still use direct steps for compatibility. This avoids unnecessarily large MCP responses without adding a UI or moving modelling to the server. `tests/mcp-app.mjs` and `tests/mcp-widget-bridge.mjs` exercise both paths.

## Session and security

- `session_id` is a 160-bit bearer capability, and appears only in tool payloads and URL fragments (not HTTP query URLs). Treat it like a secret; do not paste it into public logs or issues.
- The widget accepts native event messages only when `event.source === frame.contentWindow`, `event.origin === APP_ORIGIN` and `source === 'spider-paint-native'`. The native editor accepts `apply_scene` only from its actual parent and with the matching session capability.
- The backend keeps up to 64 sessions for 2 hours since last access. Scenes up to 600,000 bytes and 3,000 objects, with up to 100 steps per agent edit. Only one agent edit can be pending per session.
- This in-memory store is for a **single Cloud Run instance**. Deploy with `--max-instances 1` while testing. It is not durable across restart/redeploy, and multi-instance deployment requires Redis/Firestore/GCS or equivalent shared state and conflict strategy.
- There is no autonomous remote agent. The LLM is invoked only by an ordinary chat turn; the widget polls for queued edits while it is running. Closing the widget stops automatic application of pending steps.
- Simultaneous human/AI writes are guarded by revision checks, but concurrent pointer editing during an incoming agent batch needs further UX/rebase handling. Do not claim production multi-user conflict-free editing.
- The native scene export contains actual geometry and scene metadata. If `workshop_publish` fails, the widget displays an error; the agent must not assume the snapshot was saved.

## Acceptance test

1. Deploy a build with version `26.11.22.001` and the matching Git SHA. Reconnect the custom ChatGPT plugin so it reads the v8 MCP App resource.
2. Ask `open_workshop` to build a cube. Inspect the actual native editor and its native version stamp. Do not count MCP `response_ready` as proof of rendering.
3. Call `workshop_state` using the returned `session_id`. Verify `ready=true` and the real cube's bounds.
4. In the embedded editor, add/transform an object with its **existing** keyboard and pointer controls. Call `workshop_state` again: object count/positions and revision should change.
5. Call `workshop_edit` with the just-read revision and an `add_box` or `place_on` command. Check the object appears in the **same** iframe. Recheck `workshop_state` and `last_edit.status=applied`.
6. Submit a stale revision and verify conflict rejection. Try an invalid object name; verify failure is surfaced, no silent success, and the session remains editable.
7. For the eight-legged spider demo, identify the tabletop object's top Y and bounds from `workshop_state` first, then place eight low-poly legs and a body with absolute geometry calculated from the real scene. Do not guess which object is the table.

## Diagnosing a silent widget
A widget that opens but never reports anything is located with three
independent channels; compare them before concluding anything.

1. **Server trace** — `debug_trace {trace_id}` returns the server phases,
   every widget phase that reached *this process*, `widget_events`,
   `session_alive`, a `hint`, and `server.instance` / `uptimeS` / `runtime`.
   `debug_trace {}` (no id) lists the instance and its recent traces.
   `workshop_state` errors carry `details.cause` and the same `server` block.
   Different `instance` ids in two answers mean two server processes
   (restart, another Cloud Run instance, or a local connector next to the
   cloud one): process-local sessions cannot be shared between them.
2. **Widget handshake phases** — `native_boot` (the native frame's origin and Web Storage state; `origin null` means the host sandbox gave it an opaque origin, storage is then kept in memory), `native_boot_error` (first uncaught error before readiness), `widget_boot`, `bridge_ready` /
   `bridge_init_rejected`, `tool_input_received`, `tool_result_received`,
   `tool_output_missing` (8 s after init), `host_call_failed`
   (`reason` = refused tool and host error) and `context_push_failed`.
   Phases seen before the trace id arrives are queued and flushed with it.
   The host name/version from `ui/initialize` travels as `host`.
3. **Model context** — the widget mirrors the same diagnostics (no meshes,
   tokens or session ids) with `ui/update-model-context`. A host that lets
   the agent read widget context (Claude: `widget_context_v0`) shows them
   even when the host refuses `tools/call` from the widget, which is exactly
   the case the server trace cannot see.

No widget event in the trace + the host says the widget is loaded =
the widget's tool calls are not reaching this server; read channel 3.

## Local automated checks

```sh
npm run test:mcp-app
node tests/mcp-widget-bridge.mjs
node tests/workshop-session.mjs
node tests/cloud-run.mjs
```

These cover the MCP protocol and simulated parent/native message bridge, not the real ChatGPT host's keyboard focus or Cloud Run multi-instance persistence. Those still require an actual embedded end-to-end test.
