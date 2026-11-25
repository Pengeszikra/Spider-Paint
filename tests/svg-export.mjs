// SVG export: one picture, or an animated SVG (SMIL) of a turntable or a part of a story; the MCP export_svg tool and the
// composer the viewer's svg panel uses (src/svg-anim.js)
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { animatedSvg, spread, svgInner, svgBackground } from '../src/svg-anim.js';
import { handleWorkshopMcp } from '../mcp/workshop-app.js';
import { nativeInlineHTML } from '../mcp/workshop-native-inline.js';

// the composer: equal neighbouring frames are one group; the first frame shows without animation; loop or freeze
const f = (c) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10" width="10" height="10">\n<rect fill="${c}"/>\n</svg>\n`;
const a = animatedSvg([f('#a00'), f('#a00'), f('#0a0'), f('#00a')], { size: 10, seconds: 2 });
assert.equal((a.match(/<g visibility/g) || []).length, 3, 'two equal frames make one group');
assert.match(a, /<g visibility="visible"><animate attributeName="visibility" calcMode="discrete" values="visible;hidden" keyTimes="0;0.5" dur="2s" repeatCount="indefinite"\/>/);
assert.match(a, /values="hidden;visible;hidden" keyTimes="0;0.5;0.75"/);
assert.match(a, /values="hidden;visible" keyTimes="0;0.75"/);
assert.match(animatedSvg([f('#a00'), f('#0a0')], { size: 10, loop: false }), /fill="freeze"/);
assert.equal(svgInner(f('#123')), '<rect fill="#123"/>');
assert.deepEqual(spread(0, 360, 4, true), [0, 90, 180, 270], 'a whole turn leaves the end (the start again) out');
assert.deepEqual(spread(0, 10, 3), [0, 5, 10]);
assert.equal(svgBackground('none'), 'none');
assert.equal(svgBackground('#fff'), '#fff');

// the MCP tool
const ctx = { origin: 'https://spider-paint.example', fetchText: async () => { throw Error('offline'); } };
const call = async (name, args) => (await handleWorkshopMcp({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } }, ctx)).result;
const tools = (await handleWorkshopMcp({ jsonrpc: '2.0', id: 1, method: 'tools/list' }, ctx)).result.tools;
assert.ok(tools.some((t) => t.name === 'export_svg'), 'tools/list has export_svg');
const bm = await call('build_model', { steps: [{ tool: 'add_box', args: { name: 'a', mat: 'wood' } }, { tool: 'add_box', args: { name: 'b', at: [0, 1, 0], size: [0.5, 0.5, 0.5], mat: 'glass' } }], render: 'none' });
const from = JSON.parse(bm.content[0].text).open_url;
const pic = await call('export_svg', { from, size: 300 });
assert.equal(pic.isError, undefined, pic.content?.[0]?.text);
assert.equal(pic.structuredContent.kind, 'picture');
assert.match(pic.content[1].text, /^<svg [^>]*viewBox="0 0 300 300"/);
assert.match(pic.content[1].text, /fill="#8a5a36"/, 'the palette colours (wood)');
assert.match(pic.content[1].text, /fill-opacity="0\.3"/, 'glass is see-through');
assert.ok(!/stroke="#/.test(pic.content[1].text), 'no edges and no sheet frame by default');
assert.ok(!/<rect/.test(pic.content[1].text), 'transparent by default');
const turn = await call('export_svg', { from, animate: { frames: 12, seconds: 3 } });
assert.equal(turn.structuredContent.frames, 12);
assert.equal(turn.structuredContent.loop, true);
assert.equal((turn.content[1].text.match(/<animate /g) || []).length, 12);
const part = await call('export_svg', { story: 'story:spider-build-example', animate: { from: 1000, to: 5000, frames: 9 } });
assert.deepEqual([part.structuredContent.kind, part.structuredContent.from, part.structuredContent.to, part.structuredContent.loop, part.structuredContent.seconds], ['story', 1000, 5000, false, 4]);
assert.match(part.content[1].text, /fill="freeze"/);
assert.equal((await call('export_svg', { from, story: 'story:spider-build-example' })).isError, true, 'one source');
assert.equal((await call('export_svg', { from, animate: { kind: 'story' } })).isError, true, 'a story motion needs a story');
assert.equal((await call('export_svg', { from: 'https://x' })).isError, true);

// the viewer's svg panel: the button, the panel and its module are in the editor, and the inline workshop bundles it
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
for (const id of ['svgBtn', 'svgPanel', 'svgSave', 'svgAnim', 'svgKind', 'svgFrom', 'svgTo', 'svgFrames', 'stSvg']) assert.ok(html.includes(`id="${id}"`), id);
const inline = nativeInlineHTML();
assert.ok(!/from '\.\/src\//.test(inline), 'the inline editor has the svg module bundled');
assert.match(inline, /const \{animatedSvg:animatedSvg/);
console.log('svg export: picture, turntable and story part (viewer composer, MCP export_svg, inline bundle): OK');

// the svg panel's own layout (#svgPanel: flex) must not keep it on screen when it is hidden
{
  const html = (await import('node:fs')).readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.match(html, /\.side\[hidden\] \{ display: none !important; \}/, 'hidden side panels stay hidden');
}

// lit colours: every polygon takes the average of its own pixels; see-through and pixel-less polygons keep theirs
{
  const { litSvg, cropSvg } = await import('../src/svg-lit.js');
  const W = 10, H = 10, data = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) data.set(x < 5 ? [200, 100, 50, 255] : [10, 20, 30, 255], (y * W + x) * 4);
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10" width="10" height="10">\n'
    + '<polygon data-face="0" points="0,0 5,0 5,10 0,10" fill="#ffffff" stroke="none"/>\n'
    + '<polygon data-face="1" points="5,0 10,0 10,10 5,10" fill="#ffffff" stroke="none"/>\n'
    + '<polygon data-face="2" points="0,0 10,0 10,10" fill="#ffffff" fill-opacity="0.3" stroke="none"/>\n'
    + '<polygon data-face="3" points="20,20 30,20 30,30" fill="#ffffff" stroke="none"/>\n</svg>';
  const r = litSvg(svg, { width: W, height: H, data });
  assert.match(r.svg, /data-face="0"[^>]*fill="#c86432"/, 'left face: the left pixels');
  assert.match(r.svg, /data-face="1"[^>]*fill="#0a141e"/, 'right face: the right pixels');
  assert.match(r.svg, /data-face="2"[^>]*fill="#ffffff"/, 'glass keeps its colour');
  assert.match(r.svg, /data-face="3"[^>]*fill="#ffffff"/, 'off-frame keeps its colour');
  assert.equal(r.lit, 2);
  // a later polygon covers an earlier one (painter's order)
  const over = litSvg('<polygon points="0,0 10,0 10,10 0,10" fill="#000000"/><polygon points="5,0 10,0 10,10 5,10" fill="#000000"/>', { width: W, height: H, data });
  assert.match(over.svg, /^<polygon[^>]*fill="#c86432"/, 'the covered part does not count');
  const cut = cropSvg(svg, [0, 2.5, 10, 5]);
  assert.match(cut, /viewBox="0 2.5 10 5" width="10" height="5"/);
  console.log('svg lit colours and crop: OK');
}

// animated GIF: one palette, index 0 see-through, cut to the visible box; a small decoder reads it back
{
  const { encodeGif, visibleBox } = await import('../src/gif.js');
  const W = 64, H = 48, frames = [];
  for (let t = 0; t < 3; t++) {
    const data = new Uint8ClampedArray(W * H * 4);
    for (let y = 10; y < 30; y++) for (let x = 10 + t * 4; x < 40 + t * 4; x++) data.set([(x * 9) & 255, (y * 13) & 255, (x * y) & 255, 255], (y * W + x) * 4);
    frames.push({ width: W, height: H, data });
  }
  const box = visibleBox(frames, 2);
  assert.deepEqual(box, { x: 8, y: 8, w: 42, h: 24 });
  const gif = encodeGif(frames, { box, delay: 0.1 });
  assert.equal(String.fromCharCode(...gif.slice(0, 6)), 'GIF89a');
  assert.equal(gif[gif.length - 1], 0x3b);
  // decode: global table, then per frame the graphic control, the image descriptor and the LZW data
  const pal = gif.slice(13, 13 + 768);
  let p = 13 + 768 + 19; // (the NETSCAPE loop block)
  const decoded = [];
  while (gif[p] === 0x21) {
    p += 8; // graphic control
    const w = gif[p + 5] | (gif[p + 6] << 8), h = gif[p + 7] | (gif[p + 8] << 8);
    p += 10;
    const min = gif[p++];
    const bytes = [];
    while (gif[p]) (bytes.push(...gif.slice(p + 1, p + 1 + gif[p])), (p += gif[p] + 1));
    p++;
    const clear = 1 << min, out = [];
    let size = min + 1, dict = [], prev = null, bit = 0;
    const read = () => { let v = 0; for (let i = 0; i < size; i++, bit++) v |= ((bytes[bit >> 3] >> (bit & 7)) & 1) << i; return v; };
    const reset = () => { dict = Array.from({ length: clear + 2 }, (_, i) => [i]); size = min + 1; prev = null; };
    reset();
    for (;;) {
      const c = read();
      if (c === clear) { reset(); continue; }
      if (c === clear + 1) break;
      const e = c < dict.length ? dict[c] : [...prev, prev[0]];
      out.push(...e);
      if (prev) dict.push([...prev, e[0]]);
      prev = e;
      if (dict.length === 1 << size && size < 12) size++;
    }
    assert.equal(out.length, w * h);
    decoded.push(out);
  }
  assert.equal(decoded.length, 3);
  const at = (f, x, y) => decoded[f][(y - box.y) * box.w + (x - box.x)];
  assert.equal(at(0, 8, 8), 0, 'outside the model: see-through');
  const k = at(2, 30, 20);
  assert.ok(k > 0);
  const [r, g, b] = pal.slice(k * 3, k * 3 + 3);
  assert.ok(Math.abs(r - 14) + Math.abs(g - 4) + Math.abs(b - 88) < 60, 'close to the source colour');
  console.log('animated gif: OK');
}
