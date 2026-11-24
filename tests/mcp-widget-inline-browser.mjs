// Headless Chromium test of the MCP App widget with the inline native editor (srcdoc), in a host that
// sandboxes the widget like Claude: allow-scripts without allow-same-origin, so no nested frame to
// https://spider-paint.vercel.app is needed. The host answers ui/initialize, sends a tool-result with a cube and
// records the widget's tools/call messages. Passes when the native editor reports the scene rendered.
//   node tests/mcp-widget-inline-browser.mjs      (needs a chromium via Playwright, like tests/smoke.mjs)
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { widgetHTML } from '../mcp/workshop-widget.js';

const host = `<!doctype html><html><body style="margin:0">
<iframe id="w" sandbox="allow-scripts" style="width:900px;height:730px;border:0"></iframe>
<script>
const calls = [];
window.__calls = calls;
const w = document.getElementById('w');
addEventListener('message', (e) => {
  if (e.source !== w.contentWindow) return;
  const m = e.data;
  if (!m || m.jsonrpc !== '2.0') return;
  if (m.method === 'ui/initialize') {
    w.contentWindow.postMessage({ jsonrpc: '2.0', id: m.id, result: { protocolVersion: '2026-01-26', hostInfo: { name: 'TestHost', version: '1' } } }, '*');
  } else if (m.method === 'ui/notifications/initialized') {
    w.contentWindow.postMessage({ jsonrpc: '2.0', method: 'ui/notifications/tool-result', params: { structuredContent: {
      trace_id: 'inline-browser', session_id: 'c'.repeat(40), revision: 0, baseScene: null,
      steps: [{ tool: 'add_box', args: { name: 'Cube', size: [1, 1, 1], at: [0, 0.5, 0], color: '#44aaff' } }] } } }, '*');
  } else if (m.method === 'tools/call') {
    calls.push(m.params);
    const r = m.params.name === 'workshop_publish' ? { revision: (m.params.arguments.revision || 0) + 1 } : m.params.name === 'workshop_poll' ? { pending: null } : { ok: true };
    w.contentWindow.postMessage({ jsonrpc: '2.0', id: m.id, result: { structuredContent: r } }, '*');
  } else if (m.id) {
    w.contentWindow.postMessage({ jsonrpc: '2.0', id: m.id, result: {} }, '*');
  }
});
fetch('/widget').then((r) => r.text()).then((t) => { w.srcdoc = t; });
</script></body></html>`;

const server = createServer((req, res) => {
  if (req.url === '/widget') return res.writeHead(200, { 'content-type': 'text/html' }).end(widgetHTML);
  if (req.url === '/') return res.writeHead(200, { 'content-type': 'text/html' }).end(host);
  res.writeHead(404).end();
}).listen(0);
const { chromium } = createRequire(import.meta.url)('playwright');
const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
const errors = [];
try {
  const page = await browser.newPage();
  page.on('pageerror', (e) => errors.push(String(e.message || e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(`http://127.0.0.1:${server.address().port}/`);
  const phases = () => page.evaluate(() => window.__calls.filter((c) => c.name === 'report_widget_event').map((c) => c.arguments.phase + (c.arguments.reason ? ':' + c.arguments.reason : '')));
  let seen = [];
  for (let i = 0; i < 120 && !seen.some((p) => p.startsWith('widget_rendered')); i++) { await page.waitForTimeout(500); seen = await phases(); }
  console.log('phases', seen.join(' | '));
  const publishes = await page.evaluate(() => window.__calls.filter((c) => c.name === 'workshop_publish').map((c) => c.arguments.scene?.objects?.map((o) => o.name)));
  console.log('published', JSON.stringify(publishes));
  assert.ok(seen.some((p) => p.startsWith('native_boot')), 'the inline native editor booted inside the sandboxed widget');
  assert.ok(seen.includes('native_editor_ready'), 'native editor ready: ' + errors.slice(0, 5).join(' / '));
  assert.ok(seen.includes('widget_rendered'), 'native scene confirmed');
  assert.ok(!seen.some((p) => p.startsWith('native_boot_error')), 'no boot error');
  await page.screenshot({ path: '/tmp/inline-widget.png' });
  console.log('inline widget browser test passed');
} finally {
  await browser.close();
  server.close();
}
