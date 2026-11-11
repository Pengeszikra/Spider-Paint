# Spider Paint: developer handover

Spider Paint is the 3Draft viewer shipped as a standalone static PWA (https://spider-paint.vercel.app). **It has no engine and no viewer source of its own**: `index.html` is *generated* from the viewer in the [3Draft](https://github.com/Pengeszikra/3Draft) repo by `scripts/sync.mjs`. Features are built in 3Draft; this repo only ships them. Two collaborators (models) take turns on the project, so read this and 3Draft's `APP.md` before changing anything. The owner speaks Hungarian to the assistant; code, docs and commits are English.

Branch: `master` (the 2015 original is kept untouched in branch `2015-sept-11`).

## What is where

| File | Role |
|---|---|
| `index.html` | **generated**, never edit by hand |
| `help.md` | copied from `3Draft/app/help.md` by the sync |
| `models/*.scene.json` | example scenes the page fetches. `bridge` is copied from 3Draft by the sync; `globe, stars, stars-plain, milkyway, ex27, human, tr74` live only here |
| `scripts/sync.mjs` | the generator (see below) |
| `sw.js` | service worker: caches page, models, icons and the pinned engine so the app works offline |
| `manifest.webmanifest`, `icons/`, `favicon.svg` | PWA install files (sync does not touch them) |
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

`sync.mjs` reads `3Draft/app/index.html` and applies a list of **exact text replacements** (`steps`): title and header, engine import pinned to the commit, example paths `./models/`, the example list, the phone's Exa menu, opt-in `?live`, PWA `<head>` tags, the starting scene (globe) and service-worker registration. If a replacement no longer matches (the viewer changed that line) it **stops** with `step "<name>" did not match`. Fix the step in `sync.mjs` (or adjust the 3Draft line); do not patch the generated `index.html`. A step that mentions a path into the 3Draft repo (`../dist/`, `../examples/`) left in the output is also an error.

To add a model only this repo ships: put `models/<name>.scene.json` here, add it to the `example list` option group and, for the phone menu, to the `exa menu` array in `sync.mjs`, add the file to the `SHELL` list in `sw.js`, raise `CACHE`.

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
