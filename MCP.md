# spider-paint MCP

This file is for the AI (and the person setting it up). spider-paint carries an MCP server: `mcp/server.js`, stdio, no dependencies, Node 18+. Through it an AI builds 3D models with tools, looks at them as SVG renders, and steers the live viewer in the browser: the spider-paint page and, when a 3Draft checkout sits beside this repo, the 3Draft viewer too. The server, its tools and the engine (`mcp/engine/`) are copied from 3Draft by `scripts/sync.mjs`, so it runs from this repo alone.

## Public endpoint (Gemini, ChatGPT, any web MCP client)

**`https://spider-paint.vercel.app/api/mcp`** is a public Streamable HTTP MCP server: no install, no sign-in (choose "no authentication" where a client asks). It is `api/mcp.mjs`, a Vercel function around `mcp/http.js`, and it is stateless: it writes no files and cannot steer an open viewer, so every result carries an `open_url` link that opens the scene in spider-paint.

- **Gemini:** Customize → Connectors → **+ Custom** → MCP Server URL: `https://spider-paint.vercel.app/api/mcp` → Next.
- **ChatGPT:** Settings → Apps / Connectors → create a custom connector (developer mode) with the same URL, authentication: none.
- **Claude:** Settings → Connectors → Add custom connector, same URL.

Tools:

| tool | what it does |
| --- | --- |
| `build_model` | runs model steps (`add_box`, `add_extrusion`, `add_mesh`, `add_character`, `transform` (also rotate_x / rotate_z, pivot), `instance` (copies of one object or group: one tree, many placements; unedited copies are stored once as a scene v2 prototype, so the link stays small), `place_on` (like G G: puts an object onto a surface), `sense` / `sensing` (the cursor's feel from the camera, with distances; which objects it feels), `extrude_face`, `move_vertices`, `boolean`, `recolor`, `remove`, `list`, `inspect`, …) and returns the objects, an SVG render and an `open_url` (`/#scene=…`, the whole scene packed into the link); pass that link back as `from` to keep building |
| `build_story` | an **animated story** from a model: keyframed `motions` (move / rotate / scale per object or `match` group), a `camera` orbit or keyframes, `captions` → a Spider Build v2 recording (see [Stories](#stories-build_story)); returns `open_url` (`/#story=…`, the editor's Stories player), `player_url` (`/player.html#story=…`), `story_token` (for `open_workshop` `story`) and a PNG preview of three moments. spider-paint endpoint only |
| `export_svg` | a model or a story as **SVG**: one picture of a view, or an **animated SVG** (SMIL, plays in any browser) of a turntable (`animate: { kind: "turntable", from, to }` in degrees) or of a **part of a story's timeline** (`animate: { kind: "story", from, to }` in ms); `frames`, `seconds`, `loop`, `size`, `background` (none = transparent by default, dark, light, #rrggbb), `edges` (off by default), `view` (a name or `{ yaw, pitch }`), `at_ms`. Source: `from` (a build_model open_url), `story` (a story_token, open_url or `story:<name>`) or `session_id` (the workshop widget's scene). The SVG comes back as text |
| `sky_scene` | a 3draft-sky catalogue (stars, planets, orbits) → a `#sky=…` link, optionally `target` to lock onto one body |
| `find` | searches the Deep Sky catalogue (stars, galaxies, nebulae, planets) → name, kind, distance and a `?scene=deepsky&target=…` link |
| `examples` | the bundled scenes with their links |
| `sky_guide` | the sky catalogue guide (sky.md) |

Links hold the scene in the URL fragment (deflate-raw, base64url), so they never reach a server; very large scenes (over ~200 KB of link) are refused.

## Set up

From the spider-paint folder:

```
codex mcp add spider-paint -- node "$(pwd)/mcp/server.js"
claude mcp add spider-paint -- node "$(pwd)/mcp/server.js"
```

Claude Desktop (`claude_desktop_config.json`):

```json
{ "mcpServers": { "spider-paint": { "command": "node", "args": ["/absolute/path/to/spider-paint/mcp/server.js"] } } }
```

Then ask the AI for the `viewer` tool's URL and open it. Environment:

| variable | default | |
|---|---|---|
| `3DRAFT_PORT` | 5173 | the live viewer's port (the next free one up to +9 if taken) |
| `3DRAFT_LIVE` | on | `0`: no live viewer, tools only |
| `3DRAFT_DIR` | `../3Draft` or `../3draft` | a 3Draft checkout to serve at `/3draft/app/` |

`node mcp/serve.js` serves the same pages without the MCP scene (PORT, default 5173). Everything listens on 127.0.0.1 only.

## The viewers

- `http://localhost:5173/?live`: spider-paint. `?live` turns on the link: it shows the MCP scene and follows the `view_*` commands.
- `http://localhost:5173/3draft/app/`: the 3Draft viewer (only when a 3Draft checkout was found). It listens to the same link.

Every open viewer gets every change and every command. The viewers do not write back into the MCP scene: what the person edits by hand in the page stays in the page. The `viewer` tool lists the URLs and how many tabs are open.

## How to work (for the AI)

1. **Model** with `add_box`, `add_extrusion`, `add_mesh` (surfaces: `mat` names a palette material, so metal, glass and glow come with it; `color` is a plain colour; `material` makes new ones), then shape with `extrude_face`, `move_vertices`, `boolean`, `transform`, `recolor`. Feel the scene like the viewer's cursor with `sense` (through a pixel of a render: the first surface, everything behind it, the distances); leave objects out with `sensing` (or `exclude` for one call) to place behind or into them. Make mechanisms with `group` (objects that move as one) and `connect` (glue, pivot, hinge, rail, spring: the holder carries the held part, which moves only as the joint allows; `move_joint` turns or slides it inside its limits, `joints` reports their state). Put things on each other with `place_on` (the viewer's G G: the foot onto the surface straight down at [x, z], upright or turned to the surface) and figures in with `add_character`. Name objects after what they are (`seat`, `leg_fl`): every later tool finds them by name. Repeat things with `instance`: model one pine (or one needle ring, one rock), group it if it has parts, then place many copies in one step with `copies: [{ at, scale, rotate_y, color }]`; a uniform scale, no rotate_z and no `colors` keeps a copy compact (format v2 `prototypes`, as the viewer's stars).
2. **Look** after every few changes: `render` (an SVG sheet of four views by default; read it), `inspect` (closed, planar, convex, faces counter-clockwise from outside), `pick` (a pixel of a render -> object, face, 3D point, normal).
3. **Show** it: `viewer` gives the URL for the person. `view_target` aims the viewer at an object, `view_camera` places the eye, `view_state` tells you what the person sees.
4. **Keep** it: `export` (JSON text, or a `.json` file inside the server's working directory), `import`.

The engine: flat-coloured convex faces, no textures (except screens, below). Y is up, the ground is y = 0. Faces are listed counter-clockwise seen from outside.

### Stories: `build_story`

A story is a model on a timeline: assembly, disassembly, an explosion view, a mechanism moving, a camera flight. `build_story`
writes it in the **Spider Build v2** format ([models/spider-build-v2.md](models/spider-build-v2.md)), the same format as the
LARK–4 assembly and the LARK–4C black-hole scene, so the same players play it: the editor's **Stories** mode (play / pause,
time slider, steps, speed, recorded camera on / off, captions) and the bare `player.html` ([PLAYER.md](PLAYER.md)). It is
stateless like `build_model`: the whole story travels packed in the link's `#story=` fragment.

| argument | meaning |
|---|---|
| `from`, `steps` | the model: a `build_model` `open_url` and / or modelling steps (as `build_model`), run first |
| `motions` | `[{ object \| objects: [...] \| match: "pyr-*", pivot: "center" (default) \| "foot" \| [x, y, z], ease, keys: [{ t, move, rotate, scale, ease }] }]` |
| `camera` | `{ orbit: { turns (default 0.25), radius, height, center, start_yaw, fov } }` (default: a slow orbit round everything that moves) or `{ keys: [{ t, eye, look_at \| yaw + pitch, transition: smoothstep \| linear \| cut, fov, roll }] }` |
| `captions` | `[{ start, end, text, channel: voiceover \| operation \| chapter }]` (ms) |
| `duration_ms`, `hold_ms` | the length (default: the last key + `hold_ms`, 800) |
| `mode` | `auto` (default), `animation` or `frames` (below) |
| `sample_ms` | the sampling step (animation 50, frames 80) |
| `shapes`, `shape_ms` | continuous mesh changes: `[{ object, keys: [{ t, shape, ease }] }]`, the mesh stored every `shape_ms` (default 70) |
| `preview` | PNG frames of the start, middle and end (default true) |
| `include_doc` | also return the `.build.json` document itself, to save or edit |

- **Keys are poses relative to the model.** `move` is the offset from where the object stands in the model, `rotate`
  degrees round X, Y, Z about the pivot (applied as `transform`: scale, X, Z, Y, then move), `scale` a number or
  `[x, y, z]`. Before its first key an object holds that key's pose, after its last key the last one: a disassembly goes
  from `move: [0, 0, 0]` to the far place, an assembly the other way round (its first key already far away).
- `ease` (per key, the approach to it; or per motion): `smooth` (default), `linear`, `in`, `out`, `cut`. An arc is a
  middle key (up and out with `out`, down with `in`).
- One motion per object. One motion may name many objects (`objects`, `match` with `*`): they move alike, each about its
  own pivot.
- **Two storages.** `animation`: one rigid affine channel per distinct motion on the shared animation clock
  (`tracks.animation`), blended on the GPU: smooth and small, but at most **64** distinct motions (the engine's limit).
  `frames`: stop-motion on the construction track: every `sample_ms` only the objects that moved are put again with their
  moved mesh; no limit, the size grows with how much moves. `auto` takes `animation` when it fits, else `frames`.
- **Shapes are processes, not jumps.** A modelling operation (an extrusion growing, a face scaling) is shown as a
  continuous morph: each key names another object of the model whose mesh is the shape at `t` (the object's own name is
  its model mesh). Those template objects are left out of the story. Between two keys vertex *i* moves from vertex *i*
  of the previous shape; a vertex the previous shape lacks grows out of its nearest vertex, so an `extrude_face` result
  rises from the face it was pulled from. To hold a shape, repeat it in the next key. The frames go on the construction
  track (a `put` of the object every `shape_ms`), so shapes work in both storages. A shaped object has no motion.
- Links over ~200 KB are refused (the result says so): use a larger `sample_ms`, fewer moving objects, or `include_doc`
  and keep the `.build.json` as a file (`player.html?scene=<its address>`).
- **Inline:** `open_workshop` with `story: <story_token>` (or `story: "story:<name>"` for a story bundled as
  `models/<name>.build.json`, such as `story:spider-sculpt`) plays it inside the chat, in the native editor's Stories player.
  A story is a recording, not a shared workshop session: `workshop_state` / `workshop_edit` do not apply to it.

A 91-brick pyramid taken apart from the top (frames mode, ~116 000 characters of link):

```json
{ "tool": "build_story", "arguments": {
  "title": "Brick pyramid, taken apart",
  "from": "<build_model open_url of the pyramid>",
  "motions": [
    { "object": "pyr-90", "keys": [ { "t": 0 }, { "t": 450, "move": [1.5, 2.4, 2], "rotate": [30, 40, 15], "ease": "out" }, { "t": 900, "move": [3, -2.5, 4], "rotate": [0, 120, 0], "ease": "in" } ] },
    { "object": "pyr-89", "keys": [ { "t": 55 }, { "t": 505, "move": [3, 2, 0], "ease": "out" }, { "t": 955, "move": [6, -2, 1], "ease": "in" } ] }
  ],
  "captions": [ { "start": 0, "end": 2500, "text": "The capstone goes first" } ],
  "camera": { "orbit": { "turns": 0.3 } }
} }
```

### Screens: an image, a scene or a web page on a face

`set_screen` turns four-cornered faces of an object into a screen in the viewer. Give exactly one of:

| | What the face shows | Where it shows |
|---|---|---|
| `image` | a picture (`.png .jpg .jpeg .webp .gif .avif .svg`) laid on the face as a texture, cut to the face's shape (not stretched) | the WebGL2 / WebGPU view, **in VR too**; depth tested like the face |
| `scene` | a 3Draft scene file (`.json`) played on the face, turning round its middle | the same, in VR too |
| `url` | a web page in an iframe over the face | the desktop only (not in VR, no depth); sites that forbid framing stay blank |

- Only **four-cornered** faces show a screen, seen from the front (the side the face's counter-clockwise winding faces).
  Without `face` every four-cornered face of the object becomes the screen (a box: all six sides); for one side give its
  face index (`get_mesh`; an `add_box`'s faces are +z, −z, +x, −x, +y, −y: its front, facing +z, is face 0).
- An image is read with `fetch`, so its server must allow cross-origin reading (**CORS**): the Spider site's own files
  (`media/…`, relative addresses) do, many image hosts do not. When it is refused the
  desktop shows the picture as a page (an iframe) instead, and the viewer says so.
- The screen is a material (`material`, default `screen-<object>`; faces that share it share the screen) kept in the
  scene's `palette`: `export` / `import` keep it, and the viewer adds it to its palette. Call `set_screen` without
  image / scene / url to make the faces plain again.
- The person can do the same in the viewer: the palette (P), a material's **url** field takes a page, an image or a scene.

```json
{ "tool": "add_box", "arguments": { "name": "poster", "size": [1.6, 0.9, 0.04], "at": [0, 1.4, 0], "color": "#202020" } }
{ "tool": "get_mesh", "arguments": { "name": "poster" } }
{ "tool": "set_screen", "arguments": { "name": "poster", "face": 0, "image": "https://spider-paint.vercel.app/media/spider-web.png" } }
```

### Steering the viewer

- `view_example` loads one of the viewer's scenes into the browser (beside the MCP objects, or alone with `replace: true`): `deepsky` (1000 galaxies, 11 colliding systems, 400 black holes, 3000 stars), `stars` (500 nearest), `milkyway` (30 000 super-stars), `stars-plain`, `globe`, `bridge`, `ex27`, `betterman`, and in spider-paint `human`, `tr74`, `station-screen`. These live in the browser only: `render`, `inspect`, `list` do not see them.
- `view_target` finds by name like the viewer's Enter search: case and accents do not matter; the whole name ranks first, then the start, a word start, any part. It also takes a kind (`planet`, `black hole`, `spiral galaxy`, `white dwarf`, `hot gas giant`): the nearest one of that kind. It works on everything shown, also the example scenes (`andromeda`, `sirius`, `sgr a`).
- `view_camera`: `eye` [x, y, z], `yaw` (0 looks towards -z, positive turns towards +x), `pitch` (positive looks down, as in Spider Build), `roll` (starship bank), all in degrees. It lets the target go. In the star maps 1 unit = 1 light year and the Sun is at the origin.
- `view_vehicle`: `starship` (space flight; speeds in ly/s, braking program, orbit), `car` (drives on the ground), `none` (the model camera).
- `view_state` returns the viewer's last report (every 2 s): vehicle, eye, yaw / pitch / roll, target, speed, orbit, object count, scene, view mode, and the report's age. `null` when no viewer is open.

- `view_sky` makes a whole space scene from a **sky catalogue** (format `3draft-sky`): stars, planets, moons, exoplanets, black holes and galaxies in astronomers' units (RA / Dec, distance or parallax, spectral type, AU, Earth radii…). The server turns it into a scene and the viewer shows it; the result lists what was left out and why. The format, how every kind of object is drawn, example prompts and where to find the data are in the **sky guide**: `sky.md` (shown as a page at `/sky.html`, linked from the viewer's help and its sky group).

A command reaches only viewers that are open: the result's `sent_to` says how many.

### What the person can do in the viewer

Enter: find a target by name. Tab: next target. W/S, A/D, R/F: speed forward, sideways, up. [ / ő and ] / ú: roll. 0 / ö: orbit. Space: stop. Esc: let go. `?` opens the full help (help.md).

## Tools

<!-- tools:start -->
| tool | arguments (bold: required) | what it does |
|---|---|---|
| `add_box` | **name**, size, at, mat, color, replace | Add an axis-aligned box. `at` is the CENTER, so its bottom is at at[1] - size[1] / 2. Y is up, the ground is y = 0. Units are arbitrary but keep them consistent. |
| `add_extrusion` | **name**, **polygon**, **height**, y, mat, color, replace | Add a prism: a CONVEX footprint polygon on the ground plane, given as [[x, z], ...] in any winding, extruded up by `height` from `y`. Use it for triangles, hexagons, wedges, roofs, columns. Concave shapes must be split into several convex extrusions. |
| `add_mesh` | **name**, **positions**, **faces**, mat, color, replace | Add a raw mesh: `positions` [[x,y,z],...] and `faces` [{ v: [indices], color }]. Each face must be planar, convex and listed COUNTER-CLOCKWISE seen from outside (right-hand rule: the normal points out). Run inspect afterwards. |
| `transform` | **name**, scale, rotate_x, rotate_z, rotate_y, pivot, move | Scale, then rotate round X, then round Z, then round Y, then move an object. Scale and rotations are about the center of its bounding box (or about `pivot`). Rotations are degrees, counter-clockwise looking from the + end of the axis towards the origin (right-hand rule): rotate_y 90 turns +x into -z, rotate_x 90 turns +y into +z, rotate_z 90 turns +x into +y. |
| `instance` | **name**, **source**, at, scale, rotate_x, rotate_y, rotate_z, mat, mats, color, colors, copies, replace | Copies of an object or group (`source`, the prototype as it is now), each placed by its foot at `at`, scaled and turned about the foot (as transform), with `color` (all faces) or `colors` ({ "#old": "#new" }). `copies` places many in one step; unnamed ones are <name>-1, <name>-2…; a group source makes <copy>.<member> objects grouped as <copy>. Copies with a uniform scale, no rotate_z and no `colors` are exported compactly (`export` with compact: true, and every `open_url`): scene format v2 `prototypes` + `{ name, proto, at, scale, rot, color }`, the same records the viewer uses for stars. Editing a copy later makes it a plain mesh again. |
| `place_on` | **name**, onto, at, point, normal, from, dir, x, y, view, yaw, pitch, size, exclude, include, align, turn, gap | Put an object down on the surface of others, like the viewer's G G: its foot (the middle of the bottom of its bounding box; for a character the middle of where it stands) goes onto the surface point, and with align "normal" its up turns to the surface normal (a thing on a slope, a ball, a wall). Say where with `at` [x, z] (dropped straight down there: the highest surface under that spot), or a pixel `x`, `y` of a render (the ray from the camera, like the viewer's cursor; view / yaw / pitch / size as render), or `point` (+ `normal`) from sense / pick, or a ray (`from` + `dir`). Default: straight down at the object's own x, z. It lands on the sensing set (see sensing) without itself, or on `onto`; exclude / include change the set for this call (exclude a wall to place behind it). Returns the new bounds and the surface it landed on with its distance along the ray. |
| `add_character` | **name**, preset, seed, spec, pose, at, yaw, onto, replace | Add a character from the viewer's character builder: a stylized figure (about 1.6-1.9 tall, the units are metres) in a few meshes merged into one object, its feet on y = 0 at `at`, facing `yaw`. Presets: scientist, mechanic, crew (Space 1999 style uniform), astronaut. `seed` makes a random variation of the preset, `spec` overrides any field of the builder's spec (base: "male" \| "female", body: { height, build, shoulders, head }, face: { shape, skin }, hair: { style, mat }, outfit: { kind, main, second, helmet }, prop). Pose: stand, sit (the seat under the hips at about 0.44) or walk (one stride). Give `onto` (and `at`) to stand it on a surface, as place_on. |
| `sense` | view, yaw, pitch, size, x, y, from, dir, exclude, include, limit | Feel the scene along a ray, as the viewer's cursor does from the camera: through pixel (x, y) of a render (same view and size as render), or from `from` along `dir`. Returns the first surface (object, face, point, normal, distance from the eye or `from`) and `hits`: everything along the ray, nearest first, with `outside` true where the ray enters an object and false where it leaves it, so you can see what is behind and how thick it is. Only the sensing set counts (see sensing); exclude / include change it for this call. Use the point and normal with place_on (point + normal), or give place_on the same pixel. |
| `sensing` | ignore, sense, only, reset | The sensing set: which objects sense, pick and place_on feel (the viewer's cursor feels everything; here you choose). New objects are sensed. ignore takes objects out (e.g. a wall to place things behind it, a box to place into it), sense puts them back, only senses just these, reset senses everything again. Returns the sensed and the ignored objects. |
| `group` | **name**, objects, rename | Make a group: the objects move as one (in the viewer a G on any of them takes the whole group; the user groups a B selection with Ctrl+G). `objects` join the group `name` (leaving any group they were in); `rename` gives the group a new name. Returns every group. |
| `ungroup` | **name** | Break a group up: its objects move on their own again (joints stay). |
| `connect` | **type**, **a**, **b**, name, at, at_b, contact, edge, axis, path, slider, limit, limits, rest_length, stiffness, damping, ends, spring_object, spring_line | Join two objects with a joint (the basic mechanics). `a` holds, `b` is held: moving a carries b along; b itself moves only as the joint allows (move_joint here, a drag in the viewer). Kinds: glue (a and b move together; `contact`: the touching point, line or face as points), pivot (b turns about the point `at`, a ball joint; `limits` { x: [min, max], y, z } degrees round the world axes from the pose now), hinge (b turns about a line: `edge` [i, j], two vertex indices of b, e.g. a door's vertical side, or `axis` [[x,y,z], [x,y,z]]; `limit` [min, max] degrees, positive counter-clockwise looking from the second point towards the first), rail (b slides along the polyline `path` of a, its point `slider` (default its vertex nearest the rail) on the rail; `limit` [min, max] distance along the rail from its start), spring (b hangs on a spring from `at` on a to `at_b` on b; `rest_length` (default the distance now), `stiffness` (default 40), `damping` (default 3), `ends` [glue \| pivot, glue \| pivot]; `spring_object`: an object to stretch between the ends, its line `spring_line` [i, j] (default its longest side); the viewer animates it). Every geometry is in world coordinates now and then sticks to the objects. Returns the joint and its state. |
| `disconnect` | **name** | Take a joint away (by its name; see joints). |
| `joints` | – | The joints and groups now: each joint's kind, holder (a), held part (b), its limits and its state (a hinge's angle, a pivot's angles, a rail's position, a spring's length) with its geometry in world coordinates. |
| `move_joint` | **name**, angle, angles, position | Move a held part as its joint allows, kept inside the limits: a hinge to `angle` (degrees from the pose it was connected in), a pivot to `angles` [x, y, z] (degrees round the world axes), a rail to `position` (distance along the rail). What b holds moves along. Returns the state reached (clamped). |
| `get_mesh` | **name** | Read an object's geometry so you can shape it: the vertices (index = position in the list) and the faces with their vertex indices, color, center and outward normal. Use it to find the face or vertex indices for extrude_face and move_vertices. |
| `extrude_face` | **name**, **face**, distance, scale, mat, color | Shape an object by pushing one of its faces out, like a modeller. The face is replaced (same index) by a copy moved `distance` along its outward normal and scaled by `scale` about its center, joined to the old edges by new side faces. distance > 0 and scale 1: a prism grows out (a wing, a chimney, a step). distance > 0 and scale < 1: a taper (roof, tower top, frustum). distance 0 and scale < 1: an inset (a panel or window frame; extrude it again, negative, for a recess). distance < 0: a dent into the solid (a niche, a door recess). The result is a closed solid again; chain calls on the returned `cap` face. |
| `move_vertices` | **name**, **indices**, **by** | Move the vertices with the given indices by [dx, dy, dz] (see get_mesh for the indices): shear, lean, pinch a roof ridge, raise a corner. Faces keep their vertices, so moving only some corners of a face can make it non-planar; the result reports that. Move all the corners of a face together to keep it flat. |
| `boolean` | **a**, **b**, **op**, name, keep | Boolean of two closed solids: union, subtract (a minus b: a door, a window, a hole) or intersect. Both objects must be closed solids with outward faces (inspect says so). The result is a new closed solid; faces keep their colors and a face cut into a solid takes the color of the cutting face. By default a and b are replaced by the result; `keep: true` keeps them. |
| `recolor` | **name**, mat, color, face | Change the material (`mat`) or the plain color of a whole object, or of one face when `face` is given. |
| `material` | **name**, like, color, metal, rough, alpha, emit, soft | Make or change a palette material (alpha below 1: glass; emit: glow; soft: skin-like light); every face made of it changes. Built in: plaster, sand, wood, dark-wood, concrete, slate, grass, brick, steel, gold, glass, copper, ruby-glass, lacquer-blue, lamp (the viewer's starting palette, mcp/materials.js). With only a name it returns that material. |
| `set_screen` | **name**, face, image, scene, url, material, color | Make faces of an object a screen in the viewer: give exactly one of `image` (a picture, .png .jpg .jpeg .webp .gif .avif .svg: laid on the face as a texture, cut to the face's shape, depth tested and seen in VR too; its server must allow cross-origin reading (CORS), else the desktop shows it as a page), `scene` (a 3Draft scene file .3draft / .json, played on the face turning round its middle) or `url` (a web page, shown in an iframe over the face on the desktop; not in VR, sites that forbid framing stay blank). Only four-cornered faces show it; seen from the front (the side the face's CCW winding faces). Without `face` every four-cornered face of the object becomes the screen (a box: all six sides), so for one side give its face index (get_mesh). The screen is a material (`material`, default "screen-<object>") kept in the scene's palette (export / import keep it); give none of image / scene / url to make the faces plain again. |
| `remove` | **name** | Remove one object. |
| `clear` | – | Remove every object. |
| `list` | – | List the objects with their face counts and axis-aligned bounds (min / max corners). |
| `inspect` | name | Check an object (or all when name is omitted): closed shell, faces CCW from outside, planar, convex. Returns plain-text notes about what to fix. Run it after add_mesh. |
| `render` | view, yaw, pitch, size, points | Render the scene as a flat-colored SVG with edges and points (text, deterministic). Default is a 2x2 sheet of front, side, top and perspective. Each <polygon data-face=".."> is one face, <circle data-v=".."> a vertex. Look at it to judge the model, then fix and render again. |
| `pick` | view, yaw, pitch, size, **x**, **y**, exclude, include | What is at pixel (x, y) of a render? Uses the same camera and size as render. Returns the object, its face index, the 3D point, the surface normal and the distance. Use it to find coordinates to place or stack things. Only the sensing set counts (see sensing; exclude / include for this call); sense also lists what lies behind. |
| `export` | path | Return the scene as JSON, or write it to `path` (relative, inside the server working directory, ending in .3draft (the 3Draft scene file) or .json). |
| `import` | json, path | Replace the scene with a JSON scene, given as `json` text or read from `path` (same rules as export). |
| `view_target` | **name** | Make the open viewer target an object by name (as the viewer's Enter search: case and accents do not matter; the whole name, then the start, a word start, any part). In a star map the starship turns to it and the braking program stops it at the surface when you fly there. Works on everything the viewer shows, also the loaded example scenes (stars, galaxies), not only the MCP objects. |
| `view_camera` | **eye**, yaw, pitch, roll | Put the open viewer's eye at a point, looking along yaw / pitch (degrees; yaw 0 looks towards -z, positive yaw turns towards +x, positive pitch looks down, as in the Spider Build format). In a star map the units are light years (the Sun at the origin). `roll` (degrees) banks the starship. |
| `view_vehicle` | **vehicle** | Switch the open viewer's vehicle: "starship" (space flight, light years), "car" (drives on the ground), or "none" (the ordinary model camera). |
| `view_example` | **name**, replace | Load one of the viewer's bundled scenes into the open viewer (beside the MCP objects, or instead of everything with replace: true). The names are the viewer's scene list, e.g. deepsky (1000 galaxies, 400 black holes, 3000 stars), stars, milkyway, stars-plain, sky:trappist-1 (a sky catalogue), globe, bridge, ex27, betterman (spider-paint also: human, tr74, station-screen). It is shown in the browser only: render and inspect do not see it. |
| `view_sky` | sky, path, replace, save | Make a space scene from a sky catalogue and show it in the open viewer (the format is app/sky.md, "3draft-sky"): stars, planets, moons, dwarf planets, exoplanets, black holes and galaxies in astronomers' units. A place is ra / dec (degrees, or "hh mm ss" / "±dd mm ss" strings, or ra_h hours) with dist + unit (ly, pc, kpc, Mpc, AU, kly, Mly, Gly) or parallax (mas), or at [x, y, z] in scene light years (the Sun at the origin, y = equatorial north). A star: spect (e.g. "G2V", "M5.5Ve", "DA"), temp (K), lum (L☉) or absmag or vmag, radius (R☉). A planet / moon goes round another object with around (its name), a (AU) or a_km, optional incl / node / angle (degrees), radius_earth / radius_km / radius_jup, teq (K, else from the star), surface (a planet shader recipe), ring, orbit: true (draw the orbit). A black hole: mass (M☉), radius_ly (drawn size). A galaxy: kind (spiral, elliptical, irregular, dwarf, interacting, early), diameter_kly or radius_ly, incl / pa, arms, bar. Any object: name, info (shown under the name when targeted), category (the find box's kind), color. start: { near: name, distance: ly } or { eye, yaw, pitch }. Returns the counts and notes about anything left out; save writes the made scene as a .3draft file the viewer opens (f↑). |
| `view_state` | – | What the open viewer shows now (it reports every 2 seconds): vehicle, eye, yaw / pitch / roll (degrees), the target, the speed, the object count, the loaded scene. null when no viewer is open. |
| `viewer` | – | The URL of the live viewer: a browser page that shows this scene and updates after every change you make. Tell the user to open it. Returns null when the live viewer is off. |
<!-- tools:end -->
