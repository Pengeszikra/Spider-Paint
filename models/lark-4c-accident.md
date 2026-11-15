# LARK–4C / LAST LIGHT

A silent, 72-second **native Spider Paint Story** starring Betterman and the existing LARK–4C.

Load **+ scene → stories → Story: LARK–4C / LAST LIGHT** and press Play.
Alternatively use **f↑** to open `lark-4c-accident.build.json`, or
[open the story directly](../?scene=story:lark-4c-accident).
No separate player, audio file, or authoring script is needed to play the saved story.

The sequence has seven shots: approach, Betterman at the controls, the black-hole reveal,
escape burn, structural failure, the final transmission, and the debris field. Thirty
structural groups let the wings, tail, engines, hangar panels and equipment separate at
different times. Betterman is rigged and seated at the original pilot station; his standing
height is 1.80 metres. Captions and all player text are English.

After separation, each fragment retains the vessel's momentum and its own initial kick,
then accelerates under a softened central gravitational field and attraction toward the
**actual tilted accretion-disc plane**. Gas drag near the disc damps vertical motion and
draws the debris into a rotating inward stream. The cockpit joins the fall after its last
interior shot at 56 seconds. Fragments reaching the native black-hole shadow are removed;
the pilot disappears with the cockpit. By the final shot, the surviving pieces have settled
into the disc plane and continue moving.

The authoring simulation uses fixed 1/120-second velocity-Verlet steps. Gravity and drag
strengths are cinematic parameters, not a relativistic simulation. The resulting transforms
and capture events are saved in the Story, so playback and reverse seeking reproduce the
same motion without running the simulation in the player. Camera and caption tracks remain
independent and retain their original timing.

## One portable story file

`lark-4c-accident.build.json` embeds the ship, character, materials, animation and environment.
It uses the same `spider-build-tutorial`, version 2 format as Spider's other Stories, with
optional animation and environment sections:

- `scene.environment` contains **one native Deep Sky black-hole instance** with its existing
  `hole` prototype, `bh-core` / `bh-disc` materials and original orientation. It also contains
  a 2,048-point sample of the actual Deep Sky Milky Way background. The black hole is
  placed in the sequence's local metre coordinate frame; the background is distant.
- `tracks.animation` contains captured affine transforms for the vessel fragments, Betterman's
  skeleton, and the visual engine plumes. Bind geometry and skin weights stay on the GPU.
- `tracks.construction` removes captured fragments and extinguished engine plumes at their
  recorded times; reverse seeking restores the appropriate objects.
- `tracks.camera` independently contains the cinematic camera poses, cuts, bank and lens.
- `tracks.narration` independently contains English caption intervals.
- `assets.audio` is empty; there are no audio cues or sound tracks.

The story uses Spider's **existing Deep Sky ray tracer** for the accretion disc, light
bending and photon ring. It does not embed the complete universe, additional black holes,
planets, orbital paths or galaxies. The old polygon-ring environment and custom movie
player have been replaced. The old movie URL redirects to the native story.

The original LARK construction tutorial remains in `lark-4.build.json`.
`lark-4c-accident.scene.json` is an editable native snapshot of the opening scene.
Pause the story and use **✕** to leave story mode: the ship and pilot retain their current
animated positions as ordinary editable objects, together with the native background.

## Rebuild and verify

```sh
node scripts/lark-4c-accident/build.mjs
node --test scripts/lark-4c-accident/test.mjs
python3 scripts/lark-4c-accident/browser-test.py
```

The authoring inputs are the original ship, Betterman and Deep Sky scene files, plus
`scripts/lark-4c-accident/sequence.json` and its pure motion sampler. Rebuilding regenerates
the portable story and opening snapshot; these source scripts are not required for playback.

The browser check uses the normal Spider app and its actual f↑ file input. It checks all
seven shots, the native black-hole tracer, compact background, foreground transparency,
absence of planets and audio, playback, pause, rewind, camera independence, and keeping
an editable scene when leaving Stories. It requires the local server on port 5173 and
macOS Chrome, and uses a separate temporary profile with software rendering.
