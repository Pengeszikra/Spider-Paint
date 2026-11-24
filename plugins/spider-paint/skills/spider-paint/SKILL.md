---
name: spider-paint
description: Use when the user wants to build, model, show, edit or explore something in 3D — "open spider-paint", "model a spider / house / chair in 3D", "put a cube on a workbench", "animate this assembly", "fly to Betelgeuse", "show the solar system" — or mentions spider-paint, 3Draft, spider-paint or the spider-paint workshop.
---

# spider-paint workshop

spider-paint is a browser-native 3D workshop (engine: 3Draft). The `spider-paint` MCP server relays declarative operations; the geometry runs in the user's browser, inside the real spider-paint editor that opens **inline in the conversation** as an MCP App widget. The user and Claude look at and edit the same scene.

## Pick the tool

| Goal | Tool |
| --- | --- |
| Open the editor inline, optionally with modeling steps | `open_workshop` (`steps`, or `from` a previous `workshop_token`, or nothing for an empty editor) |
| Read what is in the open workshop now (also the user's own edits) | `workshop_state` (`session_id`; `include_scene: true` for exact meshes) |
| Change the **same** open workshop | `workshop_edit` (`session_id`, `revision` from `workshop_state`, `steps`) |
| Headless model + SVG/PNG preview + `open_url` link, no widget | `build_model` |
| Animated story (assembly, explosion, mechanism, fly-through) | `build_story`, then `open_workshop({ story: story_token })` to play it inline. Show a modelling operation (extrude, scale) as a process with `shapes`, not as a cut |
| Space scenes | read `sky_guide` first, then `sky_scene`; `find` searches the deep-sky catalogue |
| Bundled sample scenes | `examples` |

Never call the internal widget tools yourself: `workshop_poll`, `workshop_publish`, `workshop_reject`, `report_widget_event`. Use `debug_trace` only to diagnose a widget that did not render.

## Workflow

1. Start with `open_workshop`. Give it the first modeling steps in the same call when the request is clear; otherwise open it empty.
2. Keep the `session_id` it returns for the rest of the conversation. It is a bearer capability: do not print it to the user, put it in links or write it into files.
3. For every further change call `workshop_state`, then `workshop_edit` with that exact `revision`. Do not open a new workshop for each change: that spawns a new widget and loses the shared scene.
4. A queued `workshop_edit` is **not** a finished edit. Call `workshop_state` again and report success only when `last_edit.status` is `applied`. On a stale-revision error, re-read the state and retry once.
5. Before editing, read the state: the user may have changed the scene by hand in the editor. Build on their changes, do not overwrite them.
6. If the session has expired (server restart, 2-hour idle limit), reopen with `open_workshop({ from: <last workshop_token> })` and say so.

## Modeling conventions

- Y is up, the ground is y = 0, units are metres; faces counter-clockwise seen from outside.
- Name every object after what it is (`seat`, `leg_fl`, `roof`): later steps address objects by name.
- Model a repeated part once, `group` it if it has several pieces, then place copies with one `instance` step (`copies: [{ at, scale, rotate_y, color }]`). This keeps the scene and its links small.
- Use `place_on` to set an object onto a surface, `connect` + `move_joint` for hinges, rails and pivots, `boolean` for cuts, `inspect` / `list` / `sense` to check results instead of guessing.
- Work in small batches of steps and check the result between batches.

## Boundaries

- The editor's own UI and key bindings are the interface. Do not describe, invent or promise extra panels, buttons or shortcuts. If the host blocks something (keyboard focus, a nested frame), state the exact limitation.
- Do not claim live two-way sync, durable storage or multi-user editing beyond what the tool results confirm. Sessions live in one server process and can be lost on redeploy.
- When the widget cannot render in the current host, fall back to `build_model` and give the user its `open_url`.
