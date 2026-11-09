# Help

A minimal 3D scene builder. Fly through a scene, build with solid prisms, and edit them like a woodworker: saw, move, scale, extrude. This page is `help.md`; edit that file and the panel follows.

[Open the keyboard map](#keys)

## The screen

- **Top:** a quiet line of readouts: yaw, pitch, speed, pick, objects, view, live. The small box at the top left says what is under the cross and whether a target is set.
- **Middle:** the 3D view, full screen. The **cross** follows the surface under the pointer; most keys act on what is under it.
- **Bottom (desktop):** the console. Its panels are `make`, `view`, `scene`, `sys`; in edit mode `make` and `scene` are replaced by `edit`.
- **Side panel:** the material palette (**P**) and this help (**?**) open on the right, one at a time. **Esc** closes it.
- **Phone:** no console; the fly pad has the keys, **Exa** opens the scene menu (also the store / build switch).

## Console

| Control | What it does |
|---|---|
| Cube | Place a prism at the cross, or shoot one into empty space (M) |
| Bin | Delete the object under the cross (X) |
| Target | Target the object under the cross (T) |
| Store / Build | Switch between the two scenes (B) |
| Edges | Edges and points on or off (E) |
| View | SVG, WebGPU or WebGL2 (9) |
| Filmic | HDR light, glow, tone mapping (C) |
| Smooth | Smooth shading (N) |
| Studio | Key, fill and rim light that follow the camera (K) |
| Freeze | Everything that moves stands still (J) |
| Light | Turn the sun in steps (L) |
| + example | Add an example scene |
| Clear | Remove every object (U brings them back) |
| Undo, Reset view, Zen | Take the last change back; frame the scene; hide all but the model (Z) |
| ? | This help |

## Flying and looking

| Key | Action |
|---|---|
| W A S D R F | Fly forward, left, back, right, up, down; every press is one speed step |
| Space | Speed zero |
| Arrow keys | Rotate the view in steps; drag does the same |
| T | Target the object under the cross; the camera keeps looking at it |
| Tab / Shift+Tab | Next / previous target |
| Esc | Let go of the target |
| J | Freeze |
| / | Show only the object under the cross (again: everything) |
| Z | Zen: only the model |
| Y | VR: two eyes side by side |

With a **target**, W A S D R F move the camera round and towards the target instead.

## Building

| Key | Action |
|---|---|
| M | Put a prism down at the cross (over empty space it is shot out and flies), or a copy of the model chosen in the store |
| X | Delete the object under the cross |
| U, Backspace | Undo |
| V | Spider bar: join two surface points with a thin bar |
| O | Boolean: mark an object, then a second one, then choose 1 union, 2 A−B, 3 B−A, 4 intersect, 5 cancel |
| H | Move gizmo: world axes, its own axes, off |
| P | The material palette |
| I | Pick the material under the cross |
| Ctrl+click (Cmd on a Mac) | Paint the face under the cross; Ctrl+double click paints the whole object |
| B | Switch build / store |

## Materials (the palette)

Click a swatch to select it. The sliders change **metal**, **rough**, **alpha**, **emit** and **soft** of the selected material. Pick a colour with the square and the hue slider, or type a hex value, then **+ new** makes a new material from it. **pick** takes the material of the next surface you click.

## Two scenes: build and store

**B** or the Store / Build button switches, and the view cuts over without a flight. The *store* holds loose objects (timber stock: lath, board, plank, beam, plywood). In the store, **target** an object (**T**): it becomes the model of **M**. Switch back to the build and **M** puts a copy of that model down at the cross, every time (a chip next to the cube button names it; click the chip to go back to the plain prism). Each scene has its own objects, undo steps and camera.

## Edit mode

Put the cross on an object and press **Q**. That object is the active one; everything else stays visible. The grid lies under it, its **origin is the middle of its base**, the camera looks at that point, and distances are in **metres**. **Q** again leaves; the camera goes back. With nothing under the cross and no target, **Q** makes a new 1 m cube of the selected material.

| Key | Action |
|---|---|
| 1 / 2 / 3 | Select points / lines / faces. Click selects, Shift+click adds or removes |
| A, A A | Select everything; two quick presses clear the selection |
| G | Grab: move the selection with the pointer; X Y Z lock an axis; type metres; click or Enter confirms, Esc cancels |
| S | Scale about the centre; X Y Z scale along an axis; type a factor |
| R | Rotate: about the middle of the selected points or faces; with a selected **line** the line is the axis (the other selected parts turn about it, or the whole object when the line is all that is selected). Move the pointer round the pivot, X Y Z turn about a world axis, type degrees |
| E | Extrude the selected faces along their normal |
| V | Sketch a line from point to point (nothing happens yet) |
| 4, then V | **Saw**: V puts two or three points. Two on one face: a cut square to it. Three: a cut through the triangle. **Enter** cuts the object into closed solids that keep their material |
| F | **Fill:** the selected points (or the points of the selected lines) become one new face, wound to face away from the object, in the material of a neighbouring face. Closes a hole |
| Shift+X | Delete the object under the cross |
| Shift+W A S D R F | Fly (plain, these are edit keys) |
| U | Undo (stops at the start of the edit session) |

## Keys are data

The program keeps two plain objects, `ACTIONS` (what it can do) and `KEYMAP` (which key does it), both reachable from the browser console. `bindKey('q', 'scene')` rebinds a key, `bindKey('q')` frees it.
