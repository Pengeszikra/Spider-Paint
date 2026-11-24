# Modular characters

Low-poly humans and droids assembled from interchangeable modules, all of them on one height (the `betterman` model).
A character is a **selection**: one option per part slot and per colour slot. The modules are 3Draft prototypes, so a
crowd of characters costs one mesh per module, not one per person.

| slot        | options |
| ----------- | ------- |
| `body`      | straight, tapered, sturdy, slender, curved, thin, fat, robot-light, robot-heavy, robot-service |
| `head`      | block, cut-jaw, long, broad, soft-jaw, robot-box, robot-visor, robot-optic |
| `face`      | neutral, smile, focused, lined, led-pair, scanner, mono-eye |
| `hair`      | bald, crop, sweep, bob, long, spikes, bun, antenna, aerials |
| `top`       | tee, shirt, jacket, vest, coat, workwear, shell, armour, open-frame |
| `bottom`    | straight, tapered, cargo, skirt, actuators, armoured-legs |
| `shoes`     | formal, trainers, boots, magnetic, split-foot |
| `accessory` | none, glasses, headset, beard, visor |
| `skin`, `hairColor`, `outfit` | the colour sets (`mc-skin-1…7`, `mc-hair-*`, dock, command, lab, field, plum, street, robot-*) |

Faces, hair and accessories are fitted per head; tops, bottoms and shoes per body. So every combination fits.

## Files

- `library.json`: every module (format `spider-modular-character-library`), with the palette, the outfits and the defaults.
- `compose.mjs`: the API. `characterScene(library, selection, { at, yaw, scale })` gives a `3draft-scene` of one character.
  `selectionOf(library, selection)` checks a selection. `inspectionScene(library, scene, mode)` gives the face and
  exploded views.
- `index.html` + `designer.mjs`: the designer page (`/models/modular-characters/`). It picks the parts and shows the
  character, and opens it in the app.
- `<id>.scene.json`: the 22 ready-made characters. `lineup`, `women`, `robots`: groups of them. `bodies`, `heads`,
  `parts`: every module side by side. `*.svg`: their pictures (`-front` is the front view).
- `cast.json`: named characters (crew, residents, robots) as selections, for scenes that need a cast.
- `reference/`: the pictures the modelling started from.

In the app the groups and module sheets are in the "+ scene" list (models/index.json), and any character opens as
`?scene=modular-characters/<id>`.

## Building and testing

The generator is `scripts/build-modular-characters.mjs`; it writes this folder from the code (`OPTIONS`, `EXAMPLES`) and
the engine (`mcp/engine`). Rebuild and test from the repository root:

```sh
node scripts/build-modular-characters.mjs
node --test scripts/modular-characters.test.mjs
```

The generator and the test are listed in package.json `brand.own`, so `npm run transfer` leaves them where they are.
This folder came over from the dark-spider side project (built during the competition, 2026-11-20).
