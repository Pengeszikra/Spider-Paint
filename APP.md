# Spider Paint: developer handover

Spider Paint is the 3Draft viewer shipped as a standalone static PWA (https://spider-paint.vercel.app). **It has no engine and no viewer source of its own**: `index.html` is *generated* from the viewer in the [3Draft](https://github.com/Pengeszikra/3Draft) repo by `scripts/sync.mjs`. Features are built in 3Draft; this repo only ships them. Two collaborators (models) take turns on the project, so read this and 3Draft's `APP.md` before changing anything. The owner speaks Hungarian to the assistant; code, docs and commits are English.

Branch: `master` (the 2015 original is kept untouched in branch `2015-sept-11`).

## What is where

| File | Role |
|---|---|
| `index.html` | **generated**, never edit by hand |
| `help.md` | copied from `3Draft/app/help.md` by the sync |
| `models/*.scene.json` | example scenes the page fetches. `bridge` and `betterman` (the figure for pose mode, `J`) are copied from 3Draft by the sync, as are `globe, stars, stars-plain, milkyway, deepsky, ex27`; `human, tr74, station-screen` live only here, and so does `WU-3463-Wyoming-UP-3463.json` (the station that `station-screen` plays on its monitor through a scene screen) |
| `scripts/sync.mjs` | the generator (see below) |
| `sw.js` | service worker: caches page, models, icons and the pinned engine so the app works offline |
| `manifest.webmanifest`, `icons/`, `favicon.svg` | PWA install files (sync does not touch them) |
| `mcp/server.js`, `mcp/scene.js`, `mcp/live.js`, `mcp/engine/`, `mcp/package.json` | **generated** by the sync: 3Draft's MCP server, tools and live link, with the engine's runtime files, so `node mcp/server.js` runs from this repo alone |
| `mcp/serve.js` | this repo's own: the live viewer's static server (Spider Paint at `/?live`, a 3Draft checkout at `/3draft/app/`; no `sw.js`, which would cache the live stream) |
| `MCP.md` | the MCP guide for the AI and the setup; its tool table (between the `tools` markers) is filled by the sync from the tools themselves |
| `.vercelignore` | keeps `mcp/` and `MCP.md` off the website |
| `media/` | README pictures |
| `README.md` | what the program is, for users |

## Shipping a 3Draft change here

```sh
cd Spider-Paint
git pull
node scripts/sync.mjs ../3draft        # sibling checkout; must print "Spider Paint <- 3Draft <commit hash>"
# raise CACHE in sw.js by one: 'spider-paint-v109' -> 'spider-paint-v110'
git add -A && git commit -m "Sync 3Draft: <what changed> (cache v110)" && git push origin master
```

Do 3Draft's own release first (bump, build, test, commit, **push**): the page imports the engine from `https://cdn.jsdelivr.net/gh/Pengeszikra/3Draft@<commit>/dist/index.js`, so the commit the sync pins must already be on GitHub. Vercel deploys `master` on push.

If you forget to raise `CACHE`, installed phones keep the old shell. Always raise it when any shipped file changed.

## How the sync works

`sync.mjs` reads `3Draft/app/index.html` and applies a list of **exact text replacements** (`steps`): title and header, engine import pinned to the commit, example paths `./models/`, the example list, the phone's Exa menu, opt-in `?live`, PWA `<head>` tags and service-worker registration. (The starting scene: empty, the `empty start` step; `?deepsky` loads 3Draft's start, the deep sky, alone. An earlier globe start made the deep sky merge beside it, 500 million light years away.) If a replacement no longer matches (the viewer changed that line) it **stops** with `step "<name>" did not match`. Fix the step in `sync.mjs` (or adjust the 3Draft line); do not patch the generated `index.html`. A step that mentions a path into the 3Draft repo (`../dist/`, `../examples/`) left in the output is also an error.

To add a model only this repo ships: put `models/<name>.scene.json` here, add it to the `example list` option group and, for the phone menu, to the `exa menu` array in `sync.mjs`, add the file to the `SHELL` list in `sw.js`, raise `CACHE`.

## Construction recordings

`models/*.build.json` use Spider Build v2, a tutorial document separate from a native
`.scene.json` geometry snapshot. Construction commands and exact resulting mesh assets,
camera keyframes, and text/audio narration occupy independent tracks on a millisecond
timeline. See [the format specification](models/spider-build-v2.md),
[JSON Schema](models/spider-build-v2.schema.json), and the dependency-free
`models/spider-build-v2.mjs` validator/replay module.

**Stories in the app**: the + scene list's *stories* group (`story:lark-4`, `story:spider-build-example`) and f↑ with a `.build.json` open a recording in Spider Paint itself: the console becomes a player (3Draft's story mode, see its APP.md). `models/spider-build-v2.mjs` is now **copied from 3Draft's `app/story.js` by the sync** (one source; change it there); the spec, schema, tests and authoring scripts stay here. It is in the service worker's shell (the page imports it).

`models/lark-4-tutorial.html` loads `models/lark-4.build.json` through
`models/spider-build-player.mjs` and embeds the generated viewer using its debug bridge.
It also accepts `?file=spider-build-example.build.json` or a legacy v1 log. These tutorial
files are authored here; they are not generated by the 3Draft sync. Keep core viewer
and engine changes in 3Draft as usual.

`node scripts/spider-build.mjs validate INPUT` checks semantic validity;
`node scripts/spider-build.mjs convert INPUT OUTPUT.build.json` upgrades a v1 log.
Run `node --test scripts/spider-build.test.mjs` for format and complete-history checks.
With the local server running, `python3 scripts/spider-build.browser-test.py` checks
the player using macOS system Chrome in a separate temporary profile.
LARK's commit/finalize/translation scripts regenerate its v2 export automatically from
the retained v1 authoring journal. Copy edited v2 tracks to another file before re-exporting.

## The MCP server

### LARK–4C cinematic story

`models/lark-4c-accident.build.json` is the silent native **LAST LIGHT** Story, available
in the stories scene list, f↑, and `?scene=story:lark-4c-accident`. It embeds one Deep Sky hole
prototype/instance and 2,048 background points in `scene.environment`; no planets or audio.
Its optional `tracks.animation` stores sampled affine matrices and rigid/skin bindings.
Camera poses independently include lens and bank. These capabilities are implemented in
3Draft's `app/story.js` and `app/index.html` and are copied here by the sync. The renderer's
transparent-background option places the native sky behind opaque animated foregrounds.

Rebuild with `node scripts/lark-4c-accident/build.mjs`, then run its `test.mjs` with
`node --test` and `browser-test.py` with the local server on port 5173. The `.scene.json`
is the editable opening; leaving story mode retains the deformed vessel and native sky.
The old `.html` movie URL redirects to the native Story; there is no separate film player.
The original LARK construction tutorial is unchanged. Scene notes are in
`models/lark-4c-accident.md`. Use `node scripts/sync.mjs ../3Draft --local-engine` only for
local checks against `/3draft/dist/index.js`; the normal release sync always pins the CDN.

`node mcp/server.js` (stdio): the same server as 3Draft's, see `MCP.md`. Sync copies it with three path changes (`../dist/` -> `./engine/`, `../app/serve.js` -> `./serve.js`, the server's name) and the runtime files of `dist/` (no tests, no `.d.ts`). The live viewer is served by `mcp/serve.js`: `/?live` is Spider Paint listening to the MCP scene and the `view_*` commands (`/events`, `/viewer-state`; `sw.js` leaves these alone), `/3draft/app/` the 3Draft viewer from `3DRAFT_DIR` or a sibling `../3Draft` / `../3draft`. The page loads the engine from jsDelivr like on the web, so the pinned commit must be pushed.

## Running and testing locally

```sh
python3 -m http.server 5173     # or: npx serve .   (a static server is required: models load with fetch)
```

Open `http://localhost:5173/?gl&debug` for the test hooks (`window.__3draft`, see 3Draft's APP.md). `?pwa` shows the phone touch pad in a desktop tab. Headless Chromium needs `--use-gl=swiftshader --enable-unsafe-swiftshader`. A service worker only registers over http(s).

## Rules

- Never copy engine code here; the engine comes from jsDelivr by commit.
- Keep `models/` valid: closed convex-face meshes, y up (the 3Draft `validate()` checks).
- Docs for users go to `3Draft/app/help.md`; it is what the sync copies into the in-app help.
- When done, leave the repo committed and pushed and say what changed.
