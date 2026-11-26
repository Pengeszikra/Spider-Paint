# Writing this help

The help is the `help/` folder: `index.md` lists the sections, one markdown file each, in the order of the row at the top
of the panel. Edit a file and the panel shows it (the terminal's help view reads the same files).

What the reader knows: `#` headings (each gets an id: link to it as `file.md#the-heading`), paragraphs, `-` and `1.`
lists (indent for a deeper list), `>` quotes, `|` tables, `---`, links, pictures, `inline code`, **bold** and *italic*.
No raw HTML, nothing runs.

## Code blocks

A fence names its language (`js`, `ts`, `html`, `css`, `json`, `sh`, `rust`, `c`, `go`, `py`, `wat`). The colours do not
stop where the languages nest: an html block's `<script>` is JavaScript, its `/** jsDoc */` has its tags, names and
`{types}` coloured, a `<style>` is CSS, an `on…=""` attribute is JavaScript again.

```html
<button onclick="spin(45)">turn</button>
<script type="module">
  /**
   * @template T - Payload Type
   * @typedef {{ type: T, payload?: P }} Quack
   * @param {Extract<AM, { type: T }>} action - what happened
   * @return {[ST, Quack<AM>]}
   */
  const reducer = (state, action) => ({ ...state, [action.type]: `#${state.n + 1}` });
  if (/^\d+$/.test(location.hash.slice(1))) reducer({ n: 0 }, { type: 'go' });
</script>
<style>
  button { color: #2fd57f; padding: 4px 8px !important; }
</style>
```

```js
/** @type {(scene: import('./scene.js').Scene, at?: [number, number, number]) => number} */
export const count = (scene, at = [0, 0, 0]) => scene.objects.filter((o) => o.mesh?.positions.length).length;
```

```json
{ "format": "3draft-scene", "objects": [{ "name": "cube", "mesh": { "positions": [[0, 0, 0]], "faces": [] } }] }
```

```sh
npm run term -- bridge   # the terminal view
```

The page gets the smallest HTML for this (`<rw>const</rw>`: the tag is the colour); the terminal gets the same colours.
