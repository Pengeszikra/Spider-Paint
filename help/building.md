# Building

| Key | Action |
|---|---|
| M | Put a prism down at the cross (over empty space it is shot out and flies), or a copy of the model chosen in the store |
| Shift+X | Delete the object under the cross (every mode; Delete too). In edit mode with something selected it deletes just that: a point with the faces and lines that use it, a line with the faces on it, a face alone |
| G | Grab the target (T) or the object under the cross: it follows the pointer; X, Y or Z locks an axis, type metres, click or Enter confirms, Esc cancels |
| Ctrl+D | Duplicate: a copy (a new model, not an instance) that is grabbed at once, so you can move it right away |
| U, Backspace | Undo |
| V | Spider bar: join two surface points with a thin bar |
| B | **Select objects:** B, then drag a box round them (B twice quickly: draw a lasso). An object is taken when its middle is inside; Shift adds to the selection, Esc clears it. Selected objects get a teal box, and **G**, **G G**, **R**, **S** move, place, turn (round the vertical axis) and size them together (Shift+R / Shift+S still fly) |
| bool button | **Boolean:** select two objects (B; the first taken is A, orange, the second B, green), press **bool** in the SYS group, then choose 1 union, 2 A−B, 3 B−A, 4 intersect, 5 cancel |
| H | Move gizmo: world axes, its own axes, off |
| J | Pose mode on the figure under the cross or the target (see Pose mode) |
| P | The material palette |
| I | Pick the material under the cross |
| Ctrl+click (Cmd on a Mac) | Paint the face under the cross; Ctrl+double click paints the whole object |
| Alt+Ctrl (Alt+Cmd) + move | With the palette open: no click, every face the pointer passes over takes the selected material (edit mode too). One stroke is one undo step |
| 7 | Open / close the store (second 3D view on the left) |
| G G | **Place mode** (G twice quickly on an object): the object **floats** in front of the eye under the pointer (the pointer sees through it), its foot being the point of its bounding box opposite the point you grabbed. A **click sticks** it to the surface under the pointer: its foot goes there, its up turns to the normal, and as you move it slides over the surfaces following them (round a ball too). **Another click unsticks** it: it floats again, choose a new target. A press on empty space (nothing there to stick to) turns the view as always. **G R S** work all along (R turns it round its foot, S sizes it from there; **X Y Z**, a number), a click takes them. **Ctrl+D** leaves it where it is and a copy floats on. **Esc** takes back the last step (the last click or G R S; with none left it goes back where it was, a new copy goes away), **Enter** keeps it (one U step). **In the store** G G picks the model: move to the build and a copy of it floats there, to be stuck down the same way |

## Materials (the palette)

Click a swatch to select it. The sliders change **metal**, **rough**, **alpha**, **emit** and **soft** of the selected material. Pick a colour with the square and the hue slider, or type a hex value, then **+ new** makes a new material from it. **pick** takes the material of the next surface you click.

## Groups and joints (mechanics)

- **Ctrl+G** groups the objects selected with **B**: from then on **G** (and G G, R, S) on any of them takes the whole group. **Ctrl+Shift+G** ungroups the selection's groups (or the group under the cross). Groups are named group-1, group-2, …; the AI can name them over MCP. They are saved with the scene.
- **Joints** join two objects: a *holder* and a *held part*. For now the AI makes them (the MCP `connect` tool); the viewer saves them with the scene and keeps to them. Moving the holder carries what it holds.
  - **glue**: the two move together (G on either takes both).
  - **hinge**: the held part turns round a line (a door round its side). **G** on it turns it round the hinge as you move the pointer round, inside its limit; a click or **Enter** keeps it (one **U** step), **Esc** takes it back.
  - **pivot**: a ball joint: **G** turns the part round the point, round the view's axis; **X Y Z** lock a world axis; the limits hold per axis.
  - **rail**: **G** slides the part along the rail, following the pointer, between its limits.
  - **spring**: the held part hangs on a spring: move it (or its holder) and it swings back to the rest length, damped; a spring object (a coil) stretches between the ends. **freeze** stops the springs.
- Try the **Mechanics** scene (+ scene list): a hinged door, a cart on a rail carrying a lamp, a lever on a pivot, a weight on a spring and a grouped table.

## Characters (the char button)

**char** (scene group) opens the **character panel**: modular low-poly humans and robots, built from interchangeable modules (models/modular-characters/). At the top are the actions (**place**, **edit selected**, **apply to selected**), under them the figure, which turns with a drag; every change shows at once.

- **random**: every part and colour at random (a human stays human, a robot robot).
- **figure**: body (straight, tapered, sturdy, slender, curved, thin, fat, three robot frames), head, face. **hair**: style, colour, an extra (glasses, headset, beard, visor). **clothes**: top, bottom, shoes and the outfit's colours. **skin**.
- Faces, hair and extras are fitted to every head, clothes to every body, so any combination fits. The materials (mc-…) come into the palette; edit one there and every character made of it changes.
- **save** keeps the selection under a name in this browser; the list next to it opens it again.
- **place**: in an empty scene the character stands at the origin (0, 0, 0), facing you. Otherwise it floats under the pointer in place mode (as **G G**): a click stands it on the surface under the pointer, **Enter** keeps it, **Esc** takes it away. One **U** takes it back.
- **edit selected** takes the character under the cross (or the target) back into the panel; **apply** rebuilds only that one, where it stands (one U step).
- **designer ↗** opens the designer page: every module side by side, the line-up, the face and exploded views.

A placed character can be **posed** like any figure: put the cross on it (or target it, T) and press **J**; **1–5** the ready poses (rest, T, wave, sit, phone), **6** walk, **7** run, **Enter** keeps the pose, **J** or **Esc** leaves it. Its skeleton comes from the library (every body has its own, robots too) and each module follows its bone, so the boxes bend at the joints; a turned character bends the same way. A kept pose makes the moved parts ordinary objects; **apply** in the panel stands it up again.

A placed character is a **group of instances**: one object per module (body, head, face, hair, top, bottom, shoes, extra), grouped under the character's name, each an instance of the library's prototype. So a crowd shares a few meshes. It moves with **G**, turns with **R** and sizes with **S** as one, and stays made of instances (a save writes the prototypes once and a short record per module); an edit of its mesh, or a tilt off upright, makes that part an ordinary object.

## Text
In edit mode, select a face (3) and press **T**: type the words and press Enter. The text becomes a **new model**, standing out of that face in the **active material**. The face sets where the first letter starts (its lower left corner), the reading direction and the letter height; the text runs on to the right, so a long text goes past the face. The font is a minimalist blocky stroke font (A–Z, 0–9, `. , : ! ? - _ + / '` and the Hungarian accents); lower case is drawn as upper case. The stroke, and the depth the letters stand out, is 20 % of the letter height.

The model keeps its words (a `text` attribute, saved in the scene file with the frame it stands in), so to fix them: edit the text model (Q on it) and press **T** again.

## Screen material

A material with an `url` (the palette's url field; the built-in `monitor` has one) is a screen: on every four-cornered face made of it the page runs in an iframe. The iframe is a DOM layer over the picture (`#screens`), warped onto the face with a CSS `matrix3d` (a perspective map of the face's four corners, up is the world up, the face's own up when it lies flat). In the WebGPU / WebGL2 view the page sits behind the 3D picture, and the picture is see-through exactly where the screen face shows (a hole the GPU punches with the depth test), so whatever stands in front of the screen hides it, pixel for pixel; the page is still a live page (scripts, scrolling). Limits: no light on it, it does not show in a VR view (in the SVG view it lies over the picture, unhidden), faces seen from behind or behind the eye are hidden, at most 6 screens at once, the pointer goes through it until you take control of it (below), and sites that forbid framing (X-Frame-Options, CSP) stay blank. Only http(s) addresses are taken. Faces with another number of corners are plain surfaces. **Control:** double-click a screen and the page gets the pointer and the keys; the camera stays where it is. A `network` module appears after `sys` in the console: `exit`, an on / off switch (off blanks that screen, the monitor stays dark) and the page address, a link that opens it in a new tab. A press outside the page, `exit` or Esc (when the focus is not inside the page) gives the control back to the 3D view.

**Scene screen.** Put the address of a 3Draft scene file (`.3draft` or `.json`, relative to the page or `https://…`) in the url field instead of a page, and the face plays that scene: the material gets `scene` instead of `url`. In the WebGPU / WebGL2 view the scene is drawn into a picture on the GPU and that picture is put on the face, so it is part of the 3D view: what stands in front hides it, and it shows in VR. The scene is lit, without edge lines, framed whole and turns slowly round its middle like A / D on a target (freeze stops it). A wide face shows the middle band of the picture. In the SVG view it falls back to an iframe screen (the viewer itself as a player, `?show=<scene file>`). Not interactive yet. spider-paint's **Station screen** example plays the WU-3463 station on a monitor.

## Two views: build and store

**7** or the **store** switch (VIEW group, second row) opens the store as a second 3D view on the left, a third of the width (the build keeps two thirds); 7 again closes it. They are two separate engines, each with its own objects, undo steps and camera. The keys go to the view the pointer is over (a teal frame marks it). The *store* holds loose objects (timber stock: lath, board, plank, beam, plywood). In the store, **target** an object (**T**) and press **M**: it becomes the model of **M** in the build. Move the pointer over the build and **M** puts a copy of that model down at the cross, every time (the brush chip names it; click the chip to go back to the plain prism). Or press **G G** on an object in the store: a copy of it floats in the build under the pointer, a click sticks it to a surface (place mode, see G G above), Enter keeps it.
