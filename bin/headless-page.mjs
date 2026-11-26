// The page without a browser, as a driver for the terminal app view (bin/term-app.mjs runApp): index.html's module runs
// on bin/headless-dom.mjs, the 3D picture is the engine's WebGPU frame read back from the canvas's texture (Deno has
// navigator.gpu; node has not, and the page then draws its SVG view, which is not shown here). The same calls as the
// Chrome driver: page(method, params) answers the few DevTools methods the terminal sends, grab() gives the picture.
import { readFile, writeFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { installDom } from './headless-dom.mjs';

const GROUND = [18, 18, 16]; // the stage's colour behind the canvas (what the Chrome view's screenshots show)

export const headlessDriver = async ({ root, ss = 2, quiet = true } = {}) => {
  const cell = { w: ss, h: ss * 2 }; // page pixels a cell (two pixels a cell high, as the half blocks are), ss times over
  let size = { cols: 80, rows: 22 };
  const W = () => size.cols * cell.w, H = () => size.rows * cell.h;
  const html = await readFile(join(root, 'index.html'), 'utf8');
  // every canvas the page gives a WebGPU context (the 3D view #gpu; the sky layers #hole, #cloud, #glow): its frames go into a
  // texture of the canvas's size that grab() copies back and stacks as the page's CSS does
  const layers = new Map(); // canvas -> { cfg, tex }
  let gpuCanvas = null;
  try {
    if (globalThis.navigator?.gpu) navigator.gpu.getPreferredCanvasFormat ??= () => 'rgba8unorm';
  } catch {}
  globalThis.__webgpuContext = (canvas) => {
    const L = { cfg: null, tex: null };
    layers.set(canvas, L);
    if (canvas.id === 'gpu' || !gpuCanvas) gpuCanvas = canvas.id === 'gpu' ? canvas : gpuCanvas;
    return {
      canvas,
      configure: (c) => void (L.cfg = c),
      unconfigure: () => void (L.cfg = null),
      getCurrentTexture: () => {
        const w = Math.max(1, canvas.width), h = Math.max(1, canvas.height);
        if (!L.tex || L.tex.width !== w || L.tex.height !== h) {
          L.tex?.destroy?.();
          L.tex = L.cfg.device.createTexture({ size: [w, h], format: L.cfg.format, usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC | GPUTextureUsage.TEXTURE_BINDING });
        }
        return L.tex;
      },
    };
  };
  globalThis.__domErrors = [];
  // the page's console goes into a list (the terminal is the picture): globalThis.__pageLog
  const log = (globalThis.__pageLog = []);
  if (quiet) for (const k of ['log', 'info', 'warn', 'error', 'debug']) console[k] = (...a) => (log.push(`${k}: ${a.map((x) => (x?.stack ?? (typeof x === 'object' ? JSON.stringify(x) : String(x)))).join(' ')}`), log.length > 200 && log.shift());
  const started = { url: null };
  const boot = async (url) => {
    installDom({
      html,
      url,
      readFile: (p) => readFile(join(root, p)),
      width: W(),
      height: H(),
      layout: (el) => (['stage', 'frame', 'layer', 'screens'].includes(el.id) || el.localName === 'body' || el.localName === 'html' ? { x: 0, y: 0, width: W(), height: H() } : el === gpuCanvas || el.localName === 'canvas' ? { x: (W() - el.width) / 2, y: (H() - el.height) / 2, width: el.width, height: el.height } : { x: 0, y: 0, width: 0, height: 0 }),
    });
    globalThis.__elementAt = () => document.getElementById('stage');
    // the page's module, its ./ imports made absolute (to this checkout), from a temporary file; started once
    const start = html.indexOf('<script type="module">');
    const base = pathToFileURL(join(root, '/')).href;
    const code = html.slice(start + '<script type="module">'.length, html.indexOf('</script>', start)).replace(/(\bfrom\s+|\bimport\s*\(\s*)(['"])\.\//g, `$1$2${base}`).replace(/import\.meta\.url/g, JSON.stringify(`${base}index.html`));
    const dir = await mkdtemp(join(tmpdir(), 'spider-headless-'));
    const file = join(dir, 'app.mjs');
    await writeFile(file, code);
    await import(pathToFileURL(file).href);
    rm(dir, { recursive: true, force: true }).catch(() => {});
  };

  // ---- input as DOM events
  const target = () => document.activeElement ?? document.body;
  const typing = (el) => el && (el.localName === 'input' || el.localName === 'textarea');
  const key = (p) => {
    const mods = p.modifiers ?? 0;
    const init = { key: p.key, code: p.code ?? '', bubbles: true, cancelable: true, altKey: Boolean(mods & 1), ctrlKey: Boolean(mods & 2), metaKey: Boolean(mods & 4), shiftKey: Boolean(mods & 8) };
    const el = target();
    if (p.type === 'keyUp') return el.dispatchEvent(new KeyboardEvent('keyup', init));
    const go = el.dispatchEvent(new KeyboardEvent('keydown', init));
    // what the browser does by default in a text field: the letter goes in, Backspace takes one out
    if (go && typing(el)) {
      if (p.text && p.text !== '\r' && !init.ctrlKey && !init.metaKey) el.value = el.value + p.text;
      else if (p.key === 'Backspace') el.value = el.value.slice(0, -1);
      else return;
      el.dispatchEvent(new InputEvent('input', { bubbles: true, data: p.text ?? null }));
    }
  };
  let down = null;
  const mouse = (p) => {
    const stage = document.getElementById('stage');
    const mods = p.modifiers ?? 0;
    const btn = { left: 0, middle: 1, right: 2 }[p.button] ?? 0;
    const init = { bubbles: true, cancelable: true, clientX: p.x, clientY: p.y, button: btn, buttons: p.buttons ?? 0, pointerId: 1, pointerType: 'mouse', isPrimary: true, altKey: Boolean(mods & 1), ctrlKey: Boolean(mods & 2), metaKey: Boolean(mods & 4), shiftKey: Boolean(mods & 8), detail: p.clickCount ?? 1 };
    if (p.type === 'mouseWheel') return stage.dispatchEvent(new WheelEvent('wheel', { ...init, deltaX: p.deltaX ?? 0, deltaY: p.deltaY ?? 0 }));
    if (p.type === 'mouseMoved') {
      stage.dispatchEvent(new PointerEvent('pointermove', init));
      return stage.dispatchEvent(new MouseEvent('mousemove', init));
    }
    if (p.type === 'mousePressed') {
      down = { x: p.x, y: p.y, at: performance.now() };
      stage.dispatchEvent(new PointerEvent('pointerdown', init));
      stage.dispatchEvent(new MouseEvent('mousedown', init));
      stage.focus();
      return;
    }
    stage.dispatchEvent(new PointerEvent('pointerup', init));
    stage.dispatchEvent(new MouseEvent('mouseup', init));
    if (down && Math.hypot(p.x - down.x, p.y - down.y) < 4 * cell.w) {
      stage.dispatchEvent(new MouseEvent(btn === 2 ? 'contextmenu' : 'click', init));
      if (p.clickCount === 2) stage.dispatchEvent(new MouseEvent('dblclick', init));
    }
    down = null;
  };

  const page = async (method, p = {}) => {
    if (method === 'Runtime.evaluate') {
      try {
        let value = (0, eval)(p.expression);
        if (p.awaitPromise) value = await value;
        return { result: { value } };
      } catch (e) {
        return { exceptionDetails: { text: String(e?.message ?? e) }, result: {} };
      }
    }
    if (method === 'Input.dispatchKeyEvent') return void key(p);
    if (method === 'Input.dispatchMouseEvent') return void mouse(p);
    return {};
  };

  // ---- the picture: the canvases' last frames stacked as the page does (a story's sky under the 3D view, else over it; the
  // cloud screen-blended, the rest premultiplied over), over the stage's ground; each canvas is a square as wide as the page's
  // long side, centred; the visible middle is averaged ss × ss down to one pixel a cell edge
  const readLayer = async (L) => {
    const device = L.cfg.device, tex = L.tex;
    const tw = tex.width, th = tex.height;
    const bpr = Math.ceil((tw * 4) / 256) * 256;
    const buf = device.createBuffer({ size: bpr * th, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
    const enc = device.createCommandEncoder();
    enc.copyTextureToBuffer({ texture: tex }, { buffer: buf, bytesPerRow: bpr }, [tw, th]);
    device.queue.submit([enc.finish()]);
    await buf.mapAsync(GPUMapMode.READ);
    const raw = new Uint8Array(buf.getMappedRange()).slice();
    buf.unmap();
    buf.destroy();
    return { raw, tw, th, bpr, bgra: String(L.cfg.format).startsWith('bgra'), opaque: L.cfg.alphaMode === 'opaque' };
  };
  const grab = async (cols, rows) => {
    const main = layers.get(gpuCanvas);
    // no WebGPU (node: the page draws its SVG view, which is not shown here): a dark picture, the panels still work
    if (!main?.tex || !main.cfg) return { width: cols, height: rows * 2, rgb: new Uint8Array(cols * rows * 2 * 3).fill(18), set: new Uint8Array(cols * rows * 2).fill(1) };
    const shown = (id) => {
      const el = document.getElementById(id);
      const L = el && layers.get(el);
      return el && !el.hidden && L?.tex && L.cfg ? L : null;
    };
    const sky = ['hole', 'cloud', 'glow'].map((id) => [id, shown(id)]).filter(([, L]) => L);
    const storySky = document.getElementById('frame')?.classList.contains('story-sky');
    const order = storySky ? [...sky, ['gpu', main]] : [['gpu', main], ...sky];
    const read = await Promise.all(order.map(async ([id, L]) => ({ id, ...(await readLayer(L)) })));
    const w = cols, h = rows * 2, s = cell.w;
    const side = main.tex.width; // the square's side in the 3D view's pixels: the other layers are scaled to it
    const ox = (side - w * s) / 2, oy = (side - h * s) / 2;
    const rgb = new Uint8Array(w * h * 3);
    const px = [0, 0, 0];
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        let r = 0, g = 0, b = 0, n = 0;
        for (let j = 0; j < s; j++)
          for (let i = 0; i < s; i++) {
            const sx = (ox + x * s + i + 0.5) / side, sy = (oy + y * s + j + 0.5) / side; // 0..1 across the square
            if (sx < 0 || sy < 0 || sx >= 1 || sy >= 1) {
              r += GROUND[0];
              g += GROUND[1];
              b += GROUND[2];
              n++;
              continue;
            }
            px[0] = GROUND[0];
            px[1] = GROUND[1];
            px[2] = GROUND[2];
            for (const Lr of read) {
              const k = Math.floor(sy * Lr.th) * Lr.bpr + Math.floor(sx * Lr.tw) * 4;
              const cr = Lr.raw[k + (Lr.bgra ? 2 : 0)], cg = Lr.raw[k + 1], cb = Lr.raw[k + (Lr.bgra ? 0 : 2)];
              if (Lr.id === 'cloud') {
                // mix-blend-mode: screen
                px[0] = 255 - ((255 - px[0]) * (255 - cr)) / 255;
                px[1] = 255 - ((255 - px[1]) * (255 - cg)) / 255;
                px[2] = 255 - ((255 - px[2]) * (255 - cb)) / 255;
              } else {
                const t = Lr.opaque ? 0 : 1 - Lr.raw[k + 3] / 255; // premultiplied over
                px[0] = cr + px[0] * t;
                px[1] = cg + px[1] * t;
                px[2] = cb + px[2] * t;
              }
            }
            r += px[0];
            g += px[1];
            b += px[2];
            n++;
          }
        const o = (y * w + x) * 3;
        rgb[o] = Math.min(255, r / n);
        rgb[o + 1] = Math.min(255, g / n);
        rgb[o + 2] = Math.min(255, b / n);
      }
    return { width: w, height: h, rgb, set: new Uint8Array(w * h).fill(1) };
  };

  return {
    page,
    cell,
    base: 'http://spider.local',
    setSize: async (cols, rows) => {
      size = { cols, rows };
      if (!started.url) return;
      globalThis.innerWidth = W();
      globalThis.innerHeight = H();
      window.dispatchEvent(new Event('resize'));
    },
    grab,
    // the first address starts the page; a later one (a scene file saved again) loads its scene into the running page
    navigate: async (url) => {
      if (!started.url) {
        started.url = url;
        return boot(url);
      }
      const hash = new URL(url).hash;
      if (hash) {
        location.hash = hash;
        window.dispatchEvent(new Event('hashchange'));
      }
    },
    close: async () => {},
    kill: () => {},
  };
};
