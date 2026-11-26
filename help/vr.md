# VR

## VR (WebXR)
**VR** (in the sys group at the bottom) shows the scene in a headset (on a Mac: install the Meta Immersive Web Emulator extension in Chrome, then press enter VR). The head turns the view; a controller button shows in the note beside the button. In the car the right stick drives: sideways the wheel (it comes back to the middle when you let go), up / down the gas (it stays where you leave it). exit (or ending it in the headset) gives the normal view back.

**Meta Quest 3 controllers** (flying, in space and on the ground). The same controls work outside VR too, with any gamepad the browser hands over (a standard gamepad: the left / right stick and the triggers, bumpers and face buttons in the Touch places; it wakes up at its first real push); X then does nothing. XR controllers (and those an emulator extension shows outside VR) only count in VR. VR starts only when you press VR.

**If the headset stays black:** open `xr-test.html` (beside the app: https://spider-paint.vercel.app/xr-test.html) on the headset: the smallest WebXR loop without 3Draft (a turning cube over a grid, the left eye on red, the right eye on blue) with a log of the session, the framebuffer, both eyes' viewports and the WebGL errors. If that works, open the viewer with `?xrtest=1` (the same cube through the viewer's own context and session) and `?xrtest=2` (the cube and the scene). After every VR session the viewer shows its XR log (click it to close); a dark red headset means the session runs but the 3Draft picture is missing (the log says why). In space the whole cockpit turns with the ship (heading, nod, roll); on the ground the horizon stays level.

| control | does |
| --- | --- |
| left stick sideways | A / D: the side speed, a step per push (it repeats while you hold it) |
| left stick up / down | nod: stick forward dips the nose, back raises it |
| right stick up / down | W / S: the forward speed, a step per push (repeats while held) |
| right stick sideways | [ / ]: roll left / right |
| right trigger | T: target what is straight ahead (the cross) |
| right grip | 0: orbit the target |
| A | Space: speed zero |
| B | Tab: the next target |
| left trigger / left grip | R / F: up / down |
| Y | freeze |
| left stick press | C in a game: helm / walk |
| **X** | **leave VR** | The stars' glow and the galaxies' point clouds (the Milky Way's stars) show in the headset too, in both eyes; the black hole's ray-traced picture does not yet.

## VR and EM
**VR** shows the scene in a headset (or the Immersive Web Emulator), one picture per eye. **EM** (temporarily) starts a three.js WebXR test scene in the headset instead: a turning cube, a golden lying egg, a floor grid and a star field, to compare three.js's VR with 3Draft's on the same headset (its log shows after the session); Shift+click EM is the old emulator mode. The old **EM** (emulator mode) uses the same headset or emulator connection (head turning, controllers), but draws one plain picture over the whole view, without stereo. Both are red while on; press again to turn off, or press the other to switch. The drive gauges at the bottom only show in car mode.
