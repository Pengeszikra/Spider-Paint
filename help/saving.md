# Saving and exporting

## Saving scenes

The `scene` panel has one list for adding a scene: the examples, and under `saved here` what was saved in this browser. Choosing an entry loads it: with the `merge` switch on (the default, remembered) it is added next to what is there, with `merge` off the scene is cleared first and the loaded one stands alone (U twice brings the old one back: the load, then the clear). It holds for the examples and `f↑` too. Below the list: a name box and **save** (stores the whole scene under that name in this browser's local storage; an empty name gets a dated one), **f↓** (downloads it as `name.3draft`, the 3Draft scene file: JSON inside), **f↑** (adds a scene from a `.3draft` file, or an older `.json` one) and **✕** (forgets the saved scene whose name is in the box). A scene file is `{ format: "3draft-scene", version: 1, name, palette: [the materials its faces use], objects: [{ name, mesh, wire? }] }`, the same shape as an example scene. Materials the palette lacks come along (screens keep their url). Not saved: the camera, the point clouds and flying prisms; instanced objects (the stars) are saved as the meshes they have at that moment. Local storage is per browser and per address, and about 5 MB; for anything bigger use the file.

**View in the scene file.** A scene is saved with its view: `view: { render, edges, light, glow, smooth, studio, cam }` (the view switches and the camera; `render` is the renderer, `webgpu`, `webgl2` or `svg`: a missing WebGPU falls back to WebGL2, the installed app stays on the GPU). Freeze, store, palette and edit are about the work, not the look, and are not saved. It is applied when the scene stands alone (`merge` off, or nothing was in the scene); a merged scene keeps the view you have. The edges start off.

**`?ply=name`** opens the scene saved here under that name at once, alone, with its view, in zen. Without such a saved scene the page starts as usual.

## SVG export (the svg button)

**svg** (scene group; in a story, the **svg** button of the story bar) opens the SVG export: the view drawn as vectors, flat-coloured faces in the palette's colours (glass see-through), far to near, as the SVG view draws them.

- **picture**: the size in pixels, the background (none: transparent, the default; dark; light) and the edges (no lines by default, or lines). **save svg** saves the view as it is now: one `.svg` file. Typing in the panel's fields is only typing (no key commands); Esc leaves a field. **colours**: *lit (GPU)* (the default) gives every face the colour it has on screen, with the light and the studio rig (a GPU frame of the same view is drawn behind the scenes, one colour a face; glass keeps its palette colour); *flat* uses the palette's colours. The picture shows what the screen shows: the part of the drawing square that is on the stage, the size is its width.
- **animated**: **save animated svg** saves the frames as one SVG that plays by itself (SMIL: in any browser, without script). Frames that came out the same are stored once, so a pause costs nothing. **save gif** saves the same motion as an animated GIF: GPU frames with the view's light, a see-through background, cut to where the model is in any frame plus a little room (one palette of 255 colours; GIF edges are hard: a pixel is either there or not).
  - **turntable**: round the view's middle; **from / to** are degrees (0 to 360 is a whole turn, -45 to 45 a swing).
  - **the story's timeline** (a story is loaded): **from / to** are seconds of the story, so any part of it can be saved; **from ← now** and **to ← now** take the Stories slider's time, **whole** the whole story in its own time. The story's own camera is used while the Stories panel's camera is on (otherwise the view as it is).
  - **frames** (2 to 240), **seconds** (the length of one pass), **repeat**: loop, or once (it stops on the last frame).
- Many frames of a big scene make a big file: the note shows its size; past 60 MB it stops and says so.

The MCP has the same as **export_svg**.

## Record and play

**rec** (in the *sys* group of the console) starts a recording: the scene is cleared first (you are asked if there is something in it), then everything you do — mouse, keys, wheel, palette clicks — is written down with its time. Press **rec** again to stop: a `3draft-rec-….json` file is downloaded.

**play** asks for such a file, clears the scene and does everything again by itself, in real time (long pauses are cut to 3 s). It starts from the palette and the switches (freeze, smooth, studio, glow) of the recording and fixes the random numbers, so the same names and colours come out. While it plays your own mouse and keys are ignored; press **play** again to stop. Positions are scaled to the window, so the same window size gives the same result.

`?play=<url of a recording>` plays one as soon as the page is up. In code (and for Claude): `rec.start()`, `rec.stop()` returns the recording object, `rec.play(object or JSON text)`, `rec.scene()` is a short fingerprint of the scene (compare two runs).

The store pane (and G G from it) is not recorded.
