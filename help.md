# Help

A minimal 3D scene builder. Fly through a scene, build with solid prisms, and edit them like a woodworker: saw, move, scale, extrude. This page is `help.md`; edit that file and the panel follows.

[Open the keyboard map](#keys)

## The screen

- **Top:** a quiet line of readouts: yaw, pitch, speed, pick, objects, view, live. The small box at the top left says what is under the cross and whether a target is set.
- **Middle:** the 3D view, full screen. The **cross** follows the surface under the pointer; most keys act on what is under it.
- **Bottom (desktop):** the console. Its panels are `make`, `view`, `scene`, `sys`; in edit mode `make` and `scene` are replaced by `edit`.
- **Side panel:** the material palette (**P**) and this help (**?**) open on the right, one at a time. **Esc** closes it.
- **Phone:** no console; the fly pad has the keys, **Exa** opens the scene menu (also the store switch; on the phone the store takes the top part of the screen).

## Console

| Control | What it does |
|---|---|
| Cube | Place a prism at the cross, or shoot one into empty space (M) |
| Bin | Delete the object under the cross (X) |
| Target | Target the object under the cross (T) |
| Store / Build | Open / close the store (7) |
| Edges | Edges and points on or off (E). The marks (points, selection, gizmo, cross) are drawn by the GPU in these views, not by an SVG layer. In the WebGPU and WebGL2 views the edges are fine 1-pixel lines, hidden where the surface hides them |
| View | SVG, WebGPU or WebGL2 (9) |
| Glow | Emitting materials light their surroundings as local lights, no shadows (C). With Light off only they light the scene |
| Smooth | Smooth shading (N): edges are rounded only on materials with soft above 0 (soft 0 keeps every edge hard; from 0.5 up the full 40° crease is smoothed) |
| Studio | Key, fill and rim light that follow the camera (K) |
| Freeze | Everything that moves stands still (`;`, which is `é` on a Hungarian keyboard) |
| Light | Light on or off (L). Off: no light in the scene at all, only emitting surfaces (lamps, windows) and the edge lines show |
| Edit | Edit mode on or off (Q); red while editing |
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
| ; (é) | Freeze |
| / | Show only the object under the cross (again: everything) |
| Z | Zen: only the model |
| 8 | VR: two eyes side by side |

With a **target**, W A S D R F move the camera round and towards the target instead.

## Building

| Key | Action |
|---|---|
| M | Put a prism down at the cross (over empty space it is shot out and flies), or a copy of the model chosen in the store |
| Shift+X | Delete the object under the cross (every mode; Delete too). In edit mode with something selected it deletes just that: a point with the faces and lines that use it, a line with the faces on it, a face alone |
| G | Grab the target (T) or the object under the cross: it follows the pointer; X, Y or Z locks an axis, type metres, click or Enter confirms, Esc cancels |
| Ctrl+D | Duplicate: a copy (a new model, not an instance) that is grabbed at once, so you can move it right away |
| U, Backspace | Undo |
| V | Spider bar: join two surface points with a thin bar |
| O | Boolean: mark an object, then a second one, then choose 1 union, 2 A−B, 3 B−A, 4 intersect, 5 cancel |
| H | Move gizmo: world axes, its own axes, off |
| P | The material palette |
| I | Pick the material under the cross |
| Ctrl+click (Cmd on a Mac) | Paint the face under the cross; Ctrl+double click paints the whole object |
| Alt+Ctrl (Alt+Cmd) + move | With the palette open: no click, every face the pointer passes over takes the selected material (edit mode too). One stroke is one undo step |
| 7 | Open / close the store (second 3D view on the left) |
| Alt + drag | In the store: drag the object under the pointer over the build and let go, a copy is put down there, the point you grabbed (dropped straight to the floor of the store) on the surface and its up along the surface normal; that point is the new object's origin (Esc cancels). The store stands still while you drag |

## Materials (the palette)

Click a swatch to select it. The sliders change **metal**, **rough**, **alpha**, **emit** and **soft** of the selected material. Pick a colour with the square and the hue slider, or type a hex value, then **+ new** makes a new material from it. **pick** takes the material of the next surface you click.

## Record and play

**rec** (in the *sys* group of the console) starts a recording: the scene is cleared first (you are asked if there is something in it), then everything you do — mouse, keys, wheel, palette clicks — is written down with its time. Press **rec** again to stop: a `3draft-rec-….json` file is downloaded.

**play** asks for such a file, clears the scene and does everything again by itself, in real time (long pauses are cut to 3 s). It starts from the palette and the switches (freeze, smooth, studio, glow) of the recording and fixes the random numbers, so the same names and colours come out. While it plays your own mouse and keys are ignored; press **play** again to stop. Positions are scaled to the window, so the same window size gives the same result.

`?play=<url of a recording>` plays one as soon as the page is up. In code (and for Claude): `rec.start()`, `rec.stop()` returns the recording object, `rec.play(object or JSON text)`, `rec.scene()` is a short fingerprint of the scene (compare two runs).

The store pane (drag and drop from it) is not recorded.

## Two views: build and store

**7** or the **store** switch (VIEW group, second row) opens the store as a second 3D view on the left, a third of the width (the build keeps two thirds); 7 again closes it. They are two separate engines, each with its own objects, undo steps and camera. The keys go to the view the pointer is over (a teal frame marks it). The *store* holds loose objects (timber stock: lath, board, plank, beam, plywood). In the store, **target** an object (**T**) and press **M**: it becomes the model of **M** in the build. Move the pointer over the build and **M** puts a copy of that model down at the cross, every time (the brush chip names it; click the chip to go back to the plain prism). Or **drag and drop**: hold **Alt**, press an object in the store, drag it over the build and let go.

## Edit mode

Put the cross on an object and press **Q**. That object is the active one; everything else stays visible. The grid lies under it, its **origin is the middle of its base**, the camera looks at the middle of the whole object, so all of it is in view, and distances are in **metres**. **Q** again leaves; the camera goes back. With nothing under the cross and no target, **Q** makes a new 1 m cube of the selected material.

| Key | Action |
|---|---|
| 1 / 2 / 3 | Select points / lines / faces (the grey points show only in points mode, 1). Click selects, Shift+click adds or removes; a click on empty space clears the selection, but a drag there (orbiting) keeps it |
| A, A A | Select everything; two quick presses clear the selection |
| G | Grab: move the selection with the pointer; X Y Z lock an axis; type metres; click or Enter confirms, Esc cancels |
| S | Scale about the centre; X Y Z scale along an axis; type a factor |
| R | Rotate: about the middle of the selected points or faces; with a selected **line** the line is the axis (the other selected parts turn about it, or the whole object when the line is all that is selected). Move the pointer round the pivot, X Y Z turn about a world axis, type degrees |
| E | Extrude and grab at once: a point becomes a line, a line becomes a face, a face is pushed out along its normal |
| 5 | Sketch mode: V draws lines on the surface; **Enter** (or 5 again) turns the drawing into the mesh: a chain that comes back near where it began (within a third of a stroke) becomes a face, an open chain becomes lines. The new faces are selected, so E pulls them out. They take the selected material and sit a hair above the surface |
| V | Sketch a line from point to point on the surface (in the sketch mode, 5; Enter builds it) |
| 4, then V | **Saw**: V puts two or three points. Two on one face: a cut square to it. Three: a cut through the triangle. **Enter** cuts the object into closed solids that keep their material |
| F | **Fill:** the selected points (or the points of the selected lines) become one new face, wound to face away from the object, in the material of a neighbouring face. Closes a hole; a concave outline (L, V) is followed along its lines, not ordered by angle |
| Ctrl+R | **Loop cut:** with a line selected (2), the ring of four-sided faces through it is cut across. Type a number for how many cuts (1 by default), move the pointer along the line to slide them, Enter confirms, Esc cancels. The new line stays selected |
| Shift+W A S D R F | Fly (plain, these are edit keys) |
| U | Undo (stops at the start of the edit session) |

## Keys are data

The program keeps two plain objects, `ACTIONS` (what it can do) and `KEYMAP` (which key does it), both reachable from the browser console. `bindKey('q', 'scene')` rebinds a key, `bindKey('q')` frees it.

## Screen material

A material with an `url` (the palette's url field; the built-in `monitor` has one) is a screen: on every four-cornered face made of it the page runs in an iframe. The iframe is a DOM layer over the picture (`#screens`), warped onto the face with a CSS `matrix3d` (a perspective map of the face's four corners, up is the world up, the face's own up when it lies flat). Limits: it is not part of the 3D picture (no depth against other objects, so something standing in front does not hide it, and no light), it does not show in a VR view, faces seen from behind or behind the eye are hidden, at most 6 screens at once, the pointer goes through it until you take control of it (below), and sites that forbid framing (X-Frame-Options, CSP) stay blank. Only http(s) addresses are taken. Faces with another number of corners are plain surfaces. **Control:** double-click a screen and the page gets the pointer and the keys; the camera stays where it is. A `network` module appears after `sys` in the console: `exit`, an on / off switch (off blanks that screen, the monitor stays dark) and the page address, a link that opens it in a new tab. A press outside the page, `exit` or Esc (when the focus is not inside the page) gives the control back to the 3D view.

## Saving scenes

The `scene` panel has one list for adding a scene: the examples, and under `saved here` what was saved in this browser. Choosing an entry loads it: with the `merge` switch on (the default, remembered) it is added next to what is there, with `merge` off the scene is cleared first and the loaded one stands alone (U twice brings the old one back: the load, then the clear). It holds for the examples and `file ↑` too. Below the list: a name box and **save** (stores the whole scene under that name in this browser's local storage; an empty name gets a dated one), **file ↓** (downloads it as `name.json`), **file ↑** (adds a scene from a `.json` file) and **✕** (forgets the saved scene whose name is in the box). A scene file is `{ format: "3draft-scene", version: 1, name, palette: [the materials its faces use], objects: [{ name, mesh, wire? }] }`, the same shape as an example scene. Materials the palette lacks come along (screens keep their url). Not saved: the camera, the point clouds and flying prisms; instanced objects (the stars) are saved as the meshes they have at that moment. Local storage is per browser and per address, and about 5 MB; for anything bigger use the file.

**View in the scene file.** A scene is saved with its view: `view: { edges, light, glow, smooth, studio, cam }` (the switches and the camera). It is applied when the scene stands alone (`merge` off, or nothing was in the scene); a merged scene keeps the view you have. The edges start off.

**`?ply=name`** opens the scene saved here under that name at once, alone, with its view, in zen. Without such a saved scene the page starts as usual.

## Text
In edit mode, select a face (3) and press **T**: type the words and press Enter. The text becomes a **new model**, standing out of that face in the **active material**. The face sets where the first letter starts (its lower left corner), the reading direction and the letter height; the text runs on to the right, so a long text goes past the face. The font is a minimalist blocky stroke font (A–Z, 0–9, `. , : ! ? - _ + / '` and the Hungarian accents); lower case is drawn as upper case. The stroke, and the depth the letters stand out, is 20 % of the letter height.

The model keeps its words (a `text` attribute, saved in the scene file with the frame it stands in), so to fix them: edit the text model (Q on it) and press **T** again.

## Selecting faces from inside
In edit mode the pointer also finds the far side of a face, so from inside a hull (a spaceship, a room) its walls can be selected with 3 like any other face.

## Ctrl+E: extrude with a back face
In edit mode **E** pulls the selected faces out (open at the start side where they were part of the model). **Ctrl+E** (Cmd+E on a Mac) does the same but leaves a face on the starting side as well, so what you pull out is a closed shell: good for building a mass inward from a wall, and for sawing or boolean afterwards.
