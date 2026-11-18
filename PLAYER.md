# Spider Player

A bare 3D player to embed in any web page. It shows one thing and has **no UI of its own**: no buttons, no panels, no
captions on screen, no keyboard or mouse handling. The page around it controls it with URL parameters and `postMessage`
commands, and it reports back with events.

- A **scene** (a 3Draft scene file, `.3draft`; older ones `.scene.json`) turns slowly on a turntable round its middle.
- A **story** (a Spider Build v2 file, `.build.json`) plays on its own timeline: the model is built step by step and the
  recorded camera moves with it. It loops by default.
- The background is **transparent** (the page shows through) or a colour you give.

It loads only the renderer (WebGL2), the scene loading and the story format: about 180–200 kB, **50–60 kB gzipped**,
instead of the whole editor. The scene files themselves are usually the bigger download.

**Address:** `https://spider-paint.vercel.app/player.html` (in the 3Draft repository: `app/player.html`).

## Embedding

```html
<iframe
  src="https://spider-paint.vercel.app/player.html?scene=models/lark-4.scene.json&bg=transparent&spin=20"
  style="width: 640px; height: 400px; border: 0; background: transparent"
  allowtransparency="true"
  title="LARK-4"></iframe>
```

The player fills the frame (any size or aspect ratio) and keeps the whole model in view across the shorter side.
A transparent background works when the iframe itself has no background (as above); the page's own colours show round the model.

### Where scenes come from

- the Spider site's own models: `models/lark-4.scene.json`, `models/bridge.scene.json`, `models/lark-4.build.json`, …;
- the online store: `scene=/api/store?name=<name>` (a scene saved with ☁ in Spider Paint);
- any other address that allows cross-origin reading (CORS), e.g. a raw GitHub file
  (`https://raw.githubusercontent.com/<user>/<repo>/main/x.scene.json`).

A relative address is relative to the player page.

## URL parameters

| Parameter | Default | Meaning |
|---|---|---|
| `scene` (or `src`) | — | the scene (`.3draft`, or an older `.scene.json`) or story (`.build.json`) to load |
| `bg` | `transparent` | `transparent`, or a colour: `1a1a2e`, `#1a1a2e`, `fff` |
| `spin` | `20` | the turntable's speed, degrees per second; `0` stands still, negative turns the other way |
| `yaw` | `30` | the turntable's starting angle round the vertical, degrees |
| `pitch` | `20` | how far the camera looks down on the model, degrees (−89 … 89) |
| `zoom` | `1` | `2` = twice as close, `0.5` = twice as far |
| `autoplay` | `1` | a story starts playing at once (`0`: it waits for `play`) |
| `loop` | `1` | a story starts again at its end (`0`: it stops on its last frame) |
| `speed` | `1` | a story's playback speed (0 … 16) |
| `camera` | `auto` | `auto`: a story uses its recorded camera, a scene the turntable; `orbit`: the turntable for a story too |
| `smooth` | `1` | smooth shading of curved surfaces (`0`: every face flat) |
| `studio` | `1` | three studio lights that follow the camera (`0`: one fixed sun) |
| `origin` | `*` | the embedding page's origin (e.g. `https://example.com`): events are posted only to that origin |

## Commands (the page → the player)

Send a message to the iframe's window. Every command is an object with `target: 'spider-player'` and a `cmd`; an `id` of
your own comes back with the answer.

```js
const player = document.querySelector('iframe').contentWindow;
const send = (cmd, extra = {}) => player.postMessage({ target: 'spider-player', cmd, ...extra }, '*');

send('load', { url: 'models/bridge.scene.json' });
send('spin', { value: 45 });
send('background', { value: '#101820' });
send('seek', { t: 12000, id: 'jump-1' });
```

| `cmd` | Fields | Does |
|---|---|---|
| `load` | `url` (address) or `data` (the scene / story object itself) | loads another scene or story in place of the current one |
| `play` | — | plays the story (from the start if it is at its end) |
| `pause` | — | stops the story where it is |
| `toggle` | — | play ↔ pause |
| `seek` | `t` (ms) | jumps to that moment of the story |
| `speed` | `value` (0 … 16) | playback speed |
| `loop` | `value` (true / false) | start again at the end, or stop there |
| `camera` | `value`: `auto` / `orbit` | a story's recorded camera, or the turntable round the model |
| `spin` | `value` (°/s) | the turntable's speed (0: still) |
| `yaw` | `value` (°) | the turntable's angle now |
| `pitch` | `value` (°, −89 … 89) | how far the camera looks down |
| `zoom` | `value` (0.05 … 50) | closer / farther |
| `background` | `value`: `transparent` or a colour | the background |
| `smooth` | `value` (true / false) | smooth shading |
| `studio` | `value` (true / false) | studio lights |
| `state` | — | only answers with the state |

`play`, `pause`, `toggle` and `seek` work on a story only; on a scene they answer with an `error`.

## Events (the player → the page)

Every event is a message with `source: 'spider-player'` and a `type`.

```js
addEventListener('message', (e) => {
  const m = e.data;
  if (m?.source !== 'spider-player') return;
  if (m.type === 'caption') subtitles.textContent = m.text;
  if (m.type === 'time') progress.value = m.t / m.durationMs;
  if (m.type === 'error') console.warn(m.message);
});
```

| `type` | Fields | When |
|---|---|---|
| `ready` | the state | the player has started (and loaded the URL's `scene`, if there was one) |
| `loaded` | the state | a scene or story has been loaded |
| `state` | the state, `cmd`, `id` | the answer to every command that worked |
| `error` | `message`, `cmd`, `id` | a command failed, a file could not be loaded, or WebGL2 is missing |
| `time` | `t`, `durationMs` (ms) | while a story plays, four times a second |
| `caption` | `text`, `cues` ([{ `channel`, `text` }]) | a story's narration changed (`text` is empty when there is none); show it yourself if you want subtitles |
| `ended` | `loop` | a story reached its end (with `loop` it goes on from the start) |

**The state:** `{ url, kind: 'scene' | 'story', playing, t, durationMs, speed, loop, camera, spin, yaw, pitch, zoom,
background, objects, title }`.

## On the same page (no iframe)

When the player page is opened directly (or from the same origin), the same commands are a function call and the same
events are a DOM event:

```js
await spiderPlayer.send({ cmd: 'pause' }); // → the state, or throws the error
spiderPlayer.state();
addEventListener('spider-player', (e) => console.log(e.detail)); // { source, type, ... }
```

## What it does not do

- No sound: a story's audio cues are not played (their text comes as `caption` events).
- Star maps and sky backdrops (`deepsky`, a story's sky environment) are not drawn: it is a player for models.
- Image, page and scene screens on faces (material `image` / `url` / `scene`) are not shown; the faces keep their colour.
- No VR, no editing, no picking with the mouse.
