# Spider Paint

A first-person 3D world builder in the browser: you fly through the space, place, shoot and connect objects, and shape them right where they are.

Spider Paint started in 2015 as a light experimental WebGL scene builder on Three.js, an experiment about objects scattered in space and the connections between them. The name came from the first version's picture, a digital spider web. That version is kept, unchanged, in the [`2015-sept-11`](../../tree/2015-sept-11) branch.

This version picks the same idea up again, now on the [3Draft](https://github.com/Pengeszikra/3Draft) engine.

## Run it

It is one page, `index.html`, and one model, `models/bridge.scene.json`. Serve the folder with any static server and open it:

```sh
npx serve .            # or: python3 -m http.server
```

(A static server is needed because the page loads the model with `fetch`; GitHub Pages works too.) The view starts in WebGPU and falls back to SVG by itself when WebGPU is not there.

## What it can do

**Looking around.** Drag rotates, double click resets the view, the arrow keys rotate too. A cross follows the pointer and lies flat on the surface under it. On a phone the cross aims at the middle of the screen, and four round buttons cover travel, place, delete and the view mode.

**Flying.** `w a s d r f` fly forward, left, back, right, up and down; every press is a speed step, the opposite key slows down, `Space` stops. `T` flies to the object under the cross (over nothing: out to the nearest object). `/` shows only the object under the cross; again: the whole scene, and the camera flies back.

**Placing and connecting.**

- `M` places a prism on the surface under the cross, or shoots one into empty space. In isolated mode (`/`) it fires a bullet: if it hits the object it sinks in and carves its shape out of it.
- `V` is the spider bar: the first `V` remembers a surface point, the second joins the two points with a thin prism.
- `X` deletes the object under the cross, `Clear` removes everything, `U` (or `Backspace`) undoes, one step at a time.
- `+ Example…` adds the stone bridge to the scene.

**Moving.** `H` puts a move gizmo on the object (first `H`: world axes, second: the object's own axes, third: off). Drag an arrow to slide the object along it.

**Booleans.** `O` marks an object, `O` on a second one asks for the operation: `1` union, `2` A − B, `3` B − A, `4` intersect. Only closed solids are calculated; the status line shows the health of the object under the cross.

**Edit mode (`Tab`): drawing on a model.**

- `V` draws lines on the surface. Points snap to vertices; two points on one face cut it, so the surface gets detail exactly where you drew. Points in the air extend the model.
- `Enter` closes a loop into a face.
- `1`, `2` and `3` move points, lines or faces (drag, or use the gizmo).
- `B` turns the spider bars into lines on the edited object.
- `X` removes lines, `Esc` steps back out.

**Materials (`P`).** Twelve starting materials (plaster, sand, wood, dark wood, concrete, slate, grass, brick, steel, gold, glass, lamp), each with `metal`, `rough`, `alpha`, `soft` and `emit` sliders and a colour; `+ new` makes a new one. `Shift` + press paints a face, `Shift` + double click the whole object, and `I` picks up the material under the cross. A face keeps the material's name, so editing a material changes every face made of it.

**Look.** `G` switches between SVG and WebGPU. `E` toggles edges and points, `L` turns the light, `C` toggles the filmic look (HDR light, glow, tone mapping), `N` smooth shading, `K` studio light. These last three only work in the WebGPU view. `?` shows all the shortcuts under the view.

Published as a Claude artifact, the scene and the palette live in a shared database, so a person and an AI see and edit the same objects.

## About 3Draft

[3Draft](https://github.com/Pengeszikra/3Draft) is a minimalist, AI first 3D engine: a model is plain data that a human, a program and an LLM can all read and write. It has an SVG and a WebGPU renderer, surface picking (with a WebAssembly kernel written in HEXAW), solid booleans and mesh editing.

The engine is not in this repo. The page imports it from jsDelivr, pinned to the 3Draft commit it was taken from. Development happens in the 3Draft repo, where this program is the viewer. From time to time the viewer becomes Spider Paint again: `node scripts/sync.mjs ../3Draft` copies the viewer and the bridge, and pins the engine to that commit.
