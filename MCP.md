# Spider Paint MCP

This file is for the AI (and the person setting it up). Spider Paint carries an MCP server: `mcp/server.js`, stdio, no dependencies, Node 18+. Through it an AI builds 3D models with tools, looks at them as SVG renders, and steers the live viewer in the browser: the Spider Paint page and, when a 3Draft checkout sits beside this repo, the 3Draft viewer too. The server, its tools and the engine (`mcp/engine/`) are copied from 3Draft by `scripts/sync.mjs`, so it runs from this repo alone.

## Set up

From the Spider Paint folder:

```
codex mcp add spider-paint -- node "$(pwd)/mcp/server.js"
claude mcp add spider-paint -- node "$(pwd)/mcp/server.js"
```

Claude Desktop (`claude_desktop_config.json`):

```json
{ "mcpServers": { "spider-paint": { "command": "node", "args": ["/absolute/path/to/Spider-Paint/mcp/server.js"] } } }
```

Then ask the AI for the `viewer` tool's URL and open it. Environment:

| variable | default | |
|---|---|---|
| `3DRAFT_PORT` | 5173 | the live viewer's port (the next free one up to +9 if taken) |
| `3DRAFT_LIVE` | on | `0`: no live viewer, tools only |
| `3DRAFT_DIR` | `../3Draft` or `../3draft` | a 3Draft checkout to serve at `/3draft/app/` |

`node mcp/serve.js` serves the same pages without the MCP scene (PORT, default 5173). Everything listens on 127.0.0.1 only.

## The viewers

- `http://localhost:5173/?live`: Spider Paint. `?live` turns on the link: it shows the MCP scene and follows the `view_*` commands.
- `http://localhost:5173/3draft/app/`: the 3Draft viewer (only when a 3Draft checkout was found). It listens to the same link.

Every open viewer gets every change and every command. The viewers do not write back into the MCP scene: what the person edits by hand in the page stays in the page. The `viewer` tool lists the URLs and how many tabs are open.

## How to work (for the AI)

1. **Model** with `add_box`, `add_extrusion`, `add_mesh`, then shape with `extrude_face`, `move_vertices`, `boolean`, `transform`, `recolor`. Name objects after what they are (`seat`, `leg_fl`): every later tool finds them by name.
2. **Look** after every few changes: `render` (an SVG sheet of four views by default; read it), `inspect` (closed, planar, convex, faces counter-clockwise from outside), `pick` (a pixel of a render -> object, face, 3D point, normal).
3. **Show** it: `viewer` gives the URL for the person. `view_target` aims the viewer at an object, `view_camera` places the eye, `view_state` tells you what the person sees.
4. **Keep** it: `export` (JSON text, or a `.json` file inside the server's working directory), `import`.

The engine: flat-coloured convex faces, no textures. Y is up, the ground is y = 0. Faces are listed counter-clockwise seen from outside.

### Steering the viewer

- `view_example` loads one of the viewer's scenes into the browser (beside the MCP objects, or alone with `replace: true`): `deepsky` (1000 galaxies, 11 colliding systems, 400 black holes, 3000 stars), `stars` (500 nearest), `milkyway` (30 000 super-stars), `stars-plain`, `globe`, `bridge`, `ex27`, `betterman`, and in Spider Paint `human`, `tr74`, `station-screen`. These live in the browser only: `render`, `inspect`, `list` do not see them.
- `view_target` finds by name like the viewer's Enter search: case and accents do not matter; the whole name ranks first, then the start, a word start, any part. It works on everything shown, also the example scenes (`andromeda`, `sirius`, `sgr a`).
- `view_camera`: `eye` [x, y, z], `yaw` (0 looks towards -z), `pitch` (up > 0), `roll` (starship bank), all in degrees. It lets the target go. In the star maps 1 unit = 1 light year and the Sun is at the origin.
- `view_vehicle`: `starship` (space flight; speeds in ly/s, braking program, orbit), `car` (drives on the ground), `none` (the model camera).
- `view_state` returns the viewer's last report (every 2 s): vehicle, eye, yaw / pitch / roll, target, speed, orbit, object count, scene, view mode, and the report's age. `null` when no viewer is open.

A command reaches only viewers that are open: the result's `sent_to` says how many.

### What the person can do in the viewer

Enter: find a target by name. Tab: next target. W/S, A/D, R/F: speed forward, sideways, up. [ / ő and ] / ú: roll. 0 / ö: orbit. Space: stop. Esc: let go. `?` opens the full help (help.md).

## Tools

<!-- tools:start -->
| tool | arguments (bold: required) | what it does |
|---|---|---|
| `add_box` | **name**, size, at, color, replace | Add an axis-aligned box. `at` is the CENTER, so its bottom is at at[1] - size[1] / 2. Y is up, the ground is y = 0. Units are arbitrary but keep them consistent. |
| `add_extrusion` | **name**, **polygon**, **height**, y, color, replace | Add a prism: a CONVEX footprint polygon on the ground plane, given as [[x, z], ...] in any winding, extruded up by `height` from `y`. Use it for triangles, hexagons, wedges, roofs, columns. Concave shapes must be split into several convex extrusions. |
| `add_mesh` | **name**, **positions**, **faces**, color, replace | Add a raw mesh: `positions` [[x,y,z],...] and `faces` [{ v: [indices], color }]. Each face must be planar, convex and listed COUNTER-CLOCKWISE seen from outside (right-hand rule: the normal points out). Run inspect afterwards. |
| `transform` | **name**, scale, rotate_y, move | Scale, then rotate around the Y axis, then move an object. Scale and rotation are about the center of its bounding box. |
| `get_mesh` | **name** | Read an object's geometry so you can shape it: the vertices (index = position in the list) and the faces with their vertex indices, color, center and outward normal. Use it to find the face or vertex indices for extrude_face and move_vertices. |
| `extrude_face` | **name**, **face**, distance, scale, color | Shape an object by pushing one of its faces out, like a modeller. The face is replaced (same index) by a copy moved `distance` along its outward normal and scaled by `scale` about its center, joined to the old edges by new side faces. distance > 0 and scale 1: a prism grows out (a wing, a chimney, a step). distance > 0 and scale < 1: a taper (roof, tower top, frustum). distance 0 and scale < 1: an inset (a panel or window frame; extrude it again, negative, for a recess). distance < 0: a dent into the solid (a niche, a door recess). The result is a closed solid again; chain calls on the returned `cap` face. |
| `move_vertices` | **name**, **indices**, **by** | Move the vertices with the given indices by [dx, dy, dz] (see get_mesh for the indices): shear, lean, pinch a roof ridge, raise a corner. Faces keep their vertices, so moving only some corners of a face can make it non-planar; the result reports that. Move all the corners of a face together to keep it flat. |
| `boolean` | **a**, **b**, **op**, name, keep | Boolean of two closed solids: union, subtract (a minus b: a door, a window, a hole) or intersect. Both objects must be closed solids with outward faces (inspect says so). The result is a new closed solid; faces keep their colors and a face cut into a solid takes the color of the cutting face. By default a and b are replaced by the result; `keep: true` keeps them. |
| `recolor` | **name**, **color**, face | Change the color of a whole object, or of one face when `face` is given. |
| `remove` | **name** | Remove one object. |
| `clear` | – | Remove every object. |
| `list` | – | List the objects with their face counts and axis-aligned bounds (min / max corners). |
| `inspect` | name | Check an object (or all when name is omitted): closed shell, faces CCW from outside, planar, convex. Returns plain-text notes about what to fix. Run it after add_mesh. |
| `render` | view, yaw, pitch, size, points | Render the scene as a flat-colored SVG with edges and points (text, deterministic). Default is a 2x2 sheet of front, side, top and perspective. Each <polygon data-face=".."> is one face, <circle data-v=".."> a vertex. Look at it to judge the model, then fix and render again. |
| `pick` | view, yaw, pitch, size, **x**, **y** | What is at pixel (x, y) of a render? Uses the same camera and size as render. Returns the object, its face index, the 3D point, the surface normal and the distance. Use it to find coordinates to place or stack things. |
| `export` | path | Return the scene as JSON, or write it to `path` (relative, inside the server working directory, must end in .json). |
| `import` | json, path | Replace the scene with a JSON scene, given as `json` text or read from `path` (same rules as export). |
| `view_target` | **name** | Make the open viewer target an object by name (as the viewer's Enter search: case and accents do not matter; the whole name, then the start, a word start, any part). In a star map the starship turns to it and the braking program stops it at the surface when you fly there. Works on everything the viewer shows, also the loaded example scenes (stars, galaxies), not only the MCP objects. |
| `view_camera` | **eye**, yaw, pitch, roll | Put the open viewer's eye at a point, looking along yaw / pitch (degrees; yaw 0 looks towards -z, pitch > 0 up). In a star map the units are light years (the Sun at the origin). `roll` (degrees) banks the starship. |
| `view_vehicle` | **vehicle** | Switch the open viewer's vehicle: "starship" (space flight, light years), "car" (drives on the ground), or "none" (the ordinary model camera). |
| `view_example` | **name**, replace | Load one of the viewer's bundled scenes into the open viewer (beside the MCP objects, or instead of everything with replace: true). The names are the viewer's scene list, e.g. deepsky (1000 galaxies, 400 black holes, 3000 stars), stars, milkyway, stars-plain, globe, bridge, ex27, betterman (Spider Paint also: human, tr74, station-screen). It is shown in the browser only: render and inspect do not see it. |
| `view_state` | – | What the open viewer shows now (it reports every 2 seconds): vehicle, eye, yaw / pitch / roll (degrees), the target, the speed, the object count, the loaded scene. null when no viewer is open. |
| `viewer` | – | The URL of the live viewer: a browser page that shows this scene and updates after every change you make. Tell the user to open it. Returns null when the live viewer is off. |
<!-- tools:end -->
