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
