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
  let gpuCanvas = null, cfg = null, tex = null;
  const BIG = { x: 0, y: 0 };
  try {
    if (globalThis.navigator?.gpu) navigator.gpu.getPreferredCanvasFormat ??= () => 'rgba8unorm';
  } catch {}
  // the canvas's WebGPU context: frames go into a texture of the canvas's size that grab() copies back
  globalThis.__webgpuContext = (canvas) => {
    gpuCanvas = canvas;
    return {
      canvas,
      configure: (c) => void (cfg = c),
      unconfigure: () => void (cfg = null),
      getCurrentTexture: () => {
        const w = Math.max(1, canvas.width), h = Math.max(1, canvas.height);
        if (!tex || tex.width !== w || tex.height !== h) {
          tex?.destroy?.();
          tex = cfg.device.createTexture({ size: [w, h], format: cfg.format, usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC | GPUTextureUsage.TEXTURE_BINDING });
        }
        return tex;
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
      layout: (el) => (['stage', 'frame', 'layer', 'screens'].includes(el.id) || el.localName === 'body' || el.localName === 'html' ? { ...BIG, width: W(), height: H() } : el === gpuCanvas || el.localName === 'canvas' ? { x: (W() - el.width) / 2, y: (H() - el.height) / 2, width: el.width, height: el.height } : { x: 0, y: 0, width: 0, height: 0 }),
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

  // ---- the picture: the canvas's last frame, its visible middle (the canvas is a square as wide as the page's long side),
  // averaged ss × ss down to one pixel a cell edge
  const grab = async (cols, rows) => {
    // no WebGPU (node: the page draws its SVG view, which is not shown here): a dark picture, the panels still work
    if (!tex || !cfg) return { width: cols, height: rows * 2, rgb: new Uint8Array(cols * rows * 2 * 3).fill(18), set: new Uint8Array(cols * rows * 2).fill(1) };
    const device = cfg.device;
    const tw = tex.width, th = tex.height;
    const bpr = Math.ceil((tw * 4) / 256) * 256;
    const buf = device.createBuffer({ size: bpr * th, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
    const enc = device.createCommandEncoder();
    enc.copyTextureToBuffer({ texture: tex }, { buffer: buf, bytesPerRow: bpr }, [tw, th]);
    device.queue.submit([enc.finish()]);
    await buf.mapAsync(GPUMapMode.READ);
    const raw = new Uint8Array(buf.getMappedRange());
    const bgra = String(cfg.format).startsWith('bgra');
    const w = cols, h = rows * 2, s = cell.w;
    const ox = Math.floor((tw - w * s) / 2), oy = Math.floor((th - h * s) / 2);
    const rgb = new Uint8Array(w * h * 3);
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        let r = 0, g = 0, b = 0, n = 0;
        for (let j = 0; j < s; j++) {
          const yy = oy + y * s + j;
          if (yy < 0 || yy >= th) continue;
          for (let i = 0; i < s; i++) {
            const xx = ox + x * s + i;
            if (xx < 0 || xx >= tw) continue;
            // the canvas is premultiplied and see-through where nothing is drawn: over the stage's dark ground, as the page shows it
            const k = yy * bpr + xx * 4, t = 1 - raw[k + 3] / 255;
            r += raw[k + (bgra ? 2 : 0)] + GROUND[0] * t;
            g += raw[k + 1] + GROUND[1] * t;
            b += raw[k + (bgra ? 0 : 2)] + GROUND[2] * t;
            n++;
          }
        }
        const o = (y * w + x) * 3;
        if (n) ((rgb[o] = Math.min(255, r / n)), (rgb[o + 1] = Math.min(255, g / n)), (rgb[o + 2] = Math.min(255, b / n)));
      }
    buf.unmap();
    buf.destroy();
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
