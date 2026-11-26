# The screen and the console

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

## Loading
While a scene is fetched and built (the list, f↑, a saved scene, the starting scene) a little star system turns over the view, with the scene's name, the step it is at (downloading, building) and a bar for the download. Galaxies are sampled in the background (web workers): a small note at the bottom says how many are still coming, and each one appears as soon as it is ready.

## Zoom
The **mouse wheel** (or a trackpad pinch) zooms in and out: the lens narrows or widens, the eye stays where it is. **=** (the **ó** key on a Hungarian keyboard) puts the zoom back. The **sideways wheel** (a trackpad swipe left or right, or a tilting wheel) turns the view round the point under the cursor, like A / D round a target but without one; the point stays under the cursor. Over empty space it turns round the middle of the view.

## Leaving by accident
Once there is anything in the scene (or anything to undo), closing the tab, reloading or typing another address makes the browser ask first. The back button, the back swipe and the phone's back key need pressing **twice within two seconds** (the first one only says "back again to leave"), and a sideways swipe on a trackpad does not page back.
