# Spider Build v2

Spider Build is a UTF-8 JSON recording with the recommended extension `.build.json`.
It saves the complete construction history, independent camera motion, and independent
text/audio narration in one portable document. All included content uses English and metres.

- [JSON Schema](spider-build-v2.schema.json) (Draft 2020-12)
- [Small working example](spider-build-example.build.json)
- [LARK–4C recording](lark-4.build.json)
- [Player](lark-4-tutorial.html)

## Document layout

```text
format: "spider-build-tutorial"
version: 2
metadata             Title, identifier, language, units, creation/completion dates
timeline             timeUnit: "ms", durationMs
assets.meshes        Shared, exact mesh snapshots keyed by asset ID
assets.audio         Audio URI and MIME type keyed by asset ID
scene                Initial objects and material palette
chapters             Named timeline ranges for navigation
tracks.construction  Timestamped commands and authoritative resulting changes
tracks.camera        Initial pose, keyframes and named inspection presets
tracks.narration     Timestamped text and optional audio cues
presentation         Optional cutaway masks, named object inspection views and background
result               Optional summary of the finished model
```

Every required track may be empty. Camera and narration tracks may be edited, removed
or disabled without changing construction. They reference global time, never construction
step IDs or chapter IDs. Chapters contain navigation titles and ranges only; descriptive
chapter narration belongs in `tracks.narration`. All camera coordinates, including inspection
presets, belong in `tracks.camera`; presentation views reference presets by name.
`presentation.background` (optional) is `"transparent"` or a `#rrggbb` colour drawn behind the
model; a player's own background setting (e.g. `player.html?bg=`) overrides it.

## Construction

```json
{
  "id": "build-000001",
  "timeMs": 1000,
  "command": {
    "tool": "add_box",
    "args": {"name": "example/block", "min": [-0.5, 0, -0.5], "max": [0.5, 1, 0.5]}
  },
  "changes": [{"type": "put", "object": {"name": "example/block", "meshRef": "block-mesh"}}],
  "provenance": {"source": "spider-paint MCP", "executedAt": "2026-11-15T12:00:00Z"}
}
```

`command` preserves the actual tool name and arguments for inspection, provenance and
future tool-aware players. **Replay applies `changes`; it does not execute commands.**
This preserves results across engine versions and does not depend on a viewport, random
seed or the availability of the original tool. Any operation is supported when its resulting
object changes are captured, including transforms, booleans and replacement meshes.

`put` creates or replaces a complete object, while `remove` deletes an existing object
by name. A multi-object operation stores multiple changes in order; a step is applied atomically.
Start from `scene.objects`, apply all steps with `timeMs <= playhead`, and preserve array
order when timestamps match. Replacement retains object order; removal followed by a new
put appends the object. Seeking backwards rebuilds from the initial scene, so deletions
and replacements are fully reversible. UI stepping treats equal-time steps as one group.

Mesh assets contain exact `positions` and convex CCW `faces` with optional `color` and
`mat`. Faces reference `scene.palette` materials by name, including alpha and emission.
Coordinates are stored without rounding. Identical mesh snapshots share one asset;
objects refer to it using `meshRef`. Recorded raw mesh tool arguments remain intact.
This is snapshot sharing, not a claim that every similar component has identical geometry.

## Camera

```json
{
  "initialPose": {"eye": [8, 6, 10], "yaw": -38.66, "pitch": 18.99},
  "keyframes": [
    {"id": "hold", "timeMs": 1000, "transition": "cut", "pose": {"eye": [8, 6, 10], "yaw": -38.66, "pitch": 18.99}},
    {"id": "orbit", "timeMs": 5000, "transition": "smoothstep", "pose": {"eye": [-8, 6, 10], "yaw": 38.66, "pitch": 18.99}}
  ],
  "presets": {}
}
```

The engine uses Y up. Eye positions are in metres; yaw/pitch are in degrees. Yaw 0
looks toward -Z, positive yaw turns toward +X, and positive pitch looks down.
Pitch is limited to -90…90. Forward is
`[sin(yaw)*cos(pitch), -sin(pitch), -cos(yaw)*cos(pitch)]`.

Keyframes are strictly ordered by time. `transition` describes the approach **to that
keyframe** from the previous keyframe, or from the initial pose at time zero:

- `cut`: hold the previous pose until this timestamp, then switch immediately.
- `linear`: linearly interpolate eye and pitch; take the shortest yaw rotation.
- `smoothstep`: the same path with easing `t*t*(3-2*t)`.

The last pose holds to the end. A frame at time zero replaces the initial pose immediately.
Insert a duplicate pose at the intended movement start to create a stationary hold.
Native Stories additionally supports optional `roll` and `fov` values in degrees;
the original debug-bridge tutorial player uses eye/yaw/pitch only. Splines are outside
v2. A player must reject unsupported format versions.

## Narration

```json
{
  "id": "intro",
  "startMs": 500,
  "endMs": 6500,
  "channel": "voiceover",
  "language": "en",
  "text": "Build the floor before adding the cabin frame.",
  "audio": {"assetId": "intro-voice", "offsetMs": 0, "volume": 1}
}
```

Cue intervals include their start and exclude their end. Use `chapter` for descriptive
chapter text, `operation` for action captions, and `voiceover` for independent narration.
Each cue contains text, audio, or both. Cues can overlap and need not align with construction.
They are sorted by start time; ties retain serialized order. The player joins active text
per channel and can play overlapping audio. Language uses tags such as `en` or `en-GB`;
the supplied tutorials use `en`.

Audio assets have `{ "uri": "voice/intro.ogg", "mimeType": "audio/ogg" }`. URIs are
relative to the build document, HTTP(S), or `data:audio/...`. For a single-file recording,
embed audio as a data URI; external files must travel with the recording. `offsetMs` starts
inside the source clip. Playback speed applies to every track; pause, seeking and mute
resynchronize the audio. The player has independent Narration and Voiceover switches.
Audio still requires a browser-supported codec and permission to play. The migrated LARK
recording contains text narration; no voice recording has been fabricated.

## Timeline and validation

Time is elapsed playback time in milliseconds, independent of wall-clock `executedAt`.
`durationMs` includes any final hold and must cover all steps, frames, chapters and cues.
Construction steps and cue starts must be nondecreasing; camera timestamps must be unique.
IDs are unique within their own collection. Chapters cannot overlap. Material, mesh, audio
and camera-preset references must resolve. Negative/nonfinite times, out-of-range vertices,
removal of nonexistent objects and unsupported versions are errors.

Validate both the JSON Schema and semantic rules implemented by `validateBuildDocument`
in `spider-build-v2.mjs`. The schema checks structure; the runtime also checks references,
timeline bounds and object lifecycle. It does not prove that an arbitrary mesh is manifold
or that a recorded command would produce its captured result; use the engine geometry
validator and a comparison against the source scene for those checks.

```sh
node scripts/spider-build.mjs validate models/lark-4.build.json
node scripts/spider-build.mjs convert models/lark-4-tutorial.json models/lark-4.build.json
node --test scripts/spider-build.test.mjs
```

Open `http://localhost:5173/models/lark-4-tutorial.html`. To load another recording, use
`?file=spider-build-example.build.json`. The player also accepts a v1 log and converts it
in memory. Native `.scene.json` files remain geometry snapshots and are unchanged.

## Native animation and Deep Sky environments

The native Stories player accepts optional `scene.environment` and `tracks.animation`
sections. Existing build-only files remain valid. An environment is an embedded native
`3draft-scene` with its prototype instances and optional point cloud; its materials belong
in the story's main `scene.palette`. This retains `bh-core` instances as native black holes,
so Spider draws its existing ray-traced accretion and lensing. Embed only the environment
subset needed for the scene.

`tracks.animation` contains `timesMs` (strictly increasing, beginning at zero), `channels`
and `bindings`. Each channel has an `id` and one `matrices` entry per sample time. Each
matrix contains 12 finite numbers: three row-major rows `[x, y, z, translation]` of an affine
transform. Adjacent captured matrices interpolate linearly; out-of-range times hold the
nearest pose. Capture rotations densely enough to preserve their shape during blending.
All channels share the animation clock, independently of construction, camera and
narration. The GPU supports at most 64 channels.

A channel may also have `emission`, an array of nonnegative finite brightness multipliers
with the same length as `timesMs`. It interpolates linearly on that clock and defaults to
1 when omitted. `animationAt(doc, timeMs, matrices, emission)` can fill a reusable 64-entry
emission array as well as the matrix array. The native WebGPU/WebGL2 player applies these
gains in the skin shader; emissive faces also become moving local lights when glow is on.
This animates brightness without rebuilding or uploading bind geometry every frame.

`scene.environment.view` saves `glow`, `light`, `studio` and other native view switches.
Its optional `material` object saves nonnegative global `ambient`, `diffuse`, `specular`
and `shininess` strengths, independently of the named surface materials in the palette.

A binding uses `{ "object": "wing", "channel": "port-wing" }` for a rigid part.
A skinned binding instead has `weights`: one array per vertex, containing one to four
`[channelId, weight]` pairs summing to one. Its vertex count must remain compatible across
construction replacements. Bindings reference the original meshes in the story assets.
The native player uploads these once and updates only the matrices. `sceneAt(doc, timeMs)`
creates editable geometry at a moment, triangulating flexible faces. Leaving Stories
retains this deformed geometry and the native environment.

Camera poses may additionally contain `roll` and `fov`, both in degrees. Lens values must
be between 5 and 150 degrees. They interpolate independently of motion; cuts still switch
immediately. See [LARK–4C / LAST LIGHT](lark-4c-accident.md) for a silent example using
these sections. Its complete recording is `lark-4c-accident.build.json`.

## Migration and authoring

The v1 adapter preserves every original command, resulting mesh, material and timestamp.
Legacy event durations and 1.5-second chapter pauses become explicit timeline time;
chapter cameras become cuts. It does not invent continuous camera paths that were never
recorded. For LARK recordings it preserves the old player's camera distance adjustment
and inspection views. Narration moves into its own cues. The original v1 file remains
available for existing authoring scripts and backward compatibility.

LARK's commit, finalize and English translation scripts automatically export v2 after
updating the legacy authoring journal. Changes made directly to the exported camera or
narration tracks should be saved as a separate edited recording before re-exporting: a
fresh export intentionally regenerates all tracks from the source journal. New generic
authoring tools should write v2 directly, capturing both command arguments and resulting
changes at each completed operation. The MCP tool `build_story` (MCP.md, Stories) is such a writer: it records a model plus keyframed rigid motions either as
`tracks.animation` channels or as stop-motion construction steps, with a camera track and narration cues. Camera recording must write camera keyframes only;
narration editing must write narration cues only.

The format can preserve the complete history that was recorded. It cannot recover modeling
actions performed before recording began. Initial imported models can be embedded in
`scene.objects`, with geometry in `assets.meshes`; later edits are recorded as steps.
