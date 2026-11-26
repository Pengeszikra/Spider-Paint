// The material palette (P) drawn as text in the terminal app view: a panel on the right over the picture, so the model
// stays in sight while you paint (Ctrl+click on the picture still paints). The page's own palette is hidden there; this
// one reads it through globalThis.__palette() and changes it through globalThis.__paletteSet({ current } | { key, value }).
//
//   ↑ ↓          the material (the wheel over the panel too)
//   Tab, ⇧Tab    the value that ← → change (metal, rough, alpha, emit, soft)
//   ← →          that value one step (with Shift five)
//   a click      a material, a place on a value's bar, ✕ closes; P or Esc closes too (the page's own keys)

const PANEL = '22;24;28', HEAD = '34;37;43', TEXT = '220;222;214', DIM = '130;134;140', SEL = '77;171;247', SEL_FG = '4;20;36';
const BAR_ON = '230;196;120', BAR_OFF = '52;55;62';
const rgb = (hex) => {
  const h = String(hex ?? '#888').replace('#', '');
  const f = h.length === 3 ? h.split('').map((c) => c + c).join('') : h.padEnd(6, '0').slice(0, 6);
  return [0, 2, 4].map((k) => parseInt(f.slice(k, k + 2), 16) || 0).join(';');
};
const cells = (s, fg, bg) => [...s].map((ch) => [fg, bg, ch]);
const fitText = (s, n) => {
  const a = [...s];
  return a.length > n ? `${a.slice(0, Math.max(0, n - 1)).join('')}…` : s + ' '.repeat(n - a.length);
};

export const createPaletteView = () => {
  let prop = 0; // the value ← → change
  let layout = null; // the last drawn panel: { x0, w, rows: [{ y, kind, i?, bar? }] }

  /** The panel for a picture `cols` wide and `rows` high: { x0, lines: Map(row -> cells of the panel's width) } */
  const draw = (pal, cols, rows) => {
    const w = Math.max(24, Math.min(36, Math.floor(cols * 0.45)));
    const x0 = Math.max(0, cols - w);
    const lines = new Map();
    const at = [];
    const put = (y, c, meta) => {
      if (y >= rows) return;
      lines.set(y, c.slice(0, w).concat(cells(' '.repeat(Math.max(0, w - c.length)), TEXT, c.at(-1)?.[1] ?? PANEL)));
      if (meta) at.push({ y, ...meta });
    };
    const items = pal.items ?? [];
    const props = pal.props ?? [];
    prop = Math.min(prop, Math.max(0, props.length - 1));
    // what fits: the header, the materials, a gap, the values, the colour, the hint (two lines)
    const fixed = 1 + 1 + props.length + 1 + 2;
    const room = Math.max(1, rows - fixed);
    const first = items.length <= room ? 0 : Math.min(items.length - room, Math.max(0, pal.current - Math.floor(room / 2)));
    let y = 0;
    put(y++, [...cells(fitText(' materials', w - 3), TEXT, HEAD), ...cells(' ✕ ', TEXT, HEAD)], { kind: 'head' });
    for (let i = first; i < Math.min(items.length, first + room); i++) {
      const m = items[i], on = i === pal.current;
      const bg = on ? SEL : PANEL, fg = on ? SEL_FG : TEXT;
      const more = (i === first && first > 0) || (i === first + room - 1 && first + room < items.length);
      put(y++, [...cells(on ? '▸' : ' ', fg, bg), ...cells('   ', '0;0;0', rgb(m.color)), ...cells(fitText(` ${m.name}${m.metal > 0.5 ? ' ·metal' : ''}${m.alpha < 1 ? ' ·clear' : ''}`, w - 6), fg, bg), ...cells(more ? '⋮ ' : '  ', DIM, bg)], { kind: 'mat', i });
    }
    put(y++, cells('', TEXT, PANEL));
    const barW = Math.max(6, w - 15);
    props.forEach((p, k) => {
      const f = p.max > p.min ? (p.value - p.min) / (p.max - p.min) : 0;
      const n = Math.round(Math.max(0, Math.min(1, f)) * barW);
      const focus = k === prop;
      const label = cells(fitText(` ${focus ? '›' : ' '}${p.key}`, 8), focus ? SEL : TEXT, PANEL);
      const bar = [...Array(barW)].map((_, j) => [j < n ? BAR_ON : BAR_OFF, PANEL, '━']);
      put(y++, [...label, ...bar, ...cells(` ${p.value.toFixed(2).padStart(5)}`, focus ? TEXT : DIM, PANEL)], { kind: 'prop', k, bar: [8, 8 + barW] });
    });
    const cur = items[pal.current];
    if (cur) put(y++, [...cells('  ', TEXT, PANEL), ...cells('  ', '0;0;0', rgb(cur.color)), ...cells(` ${cur.color}`, DIM, PANEL)]);
    put(y++, cells(fitText(' ↑↓ material  Tab ←→ value', w), DIM, PANEL));
    put(y++, cells(fitText(' P/Esc close · Ctrl+click paints', w), DIM, PANEL));
    layout = { x0, w, rows: at, first, h: y };
    return { x0, lines };
  };

  /** A key while the palette is open: an action for the page ({ current } / { key, value }), 'draw' (only this view
   *  changed), or null (the key is the page's). */
  const key = (k, pal) => {
    const items = pal.items ?? [], props = pal.props ?? [];
    if (k.key === 'ArrowUp' || k.key === 'ArrowDown') {
      if (!items.length) return 'draw';
      return { current: (pal.current + (k.key === 'ArrowUp' ? -1 : 1) + items.length) % items.length };
    }
    if (k.key === 'Tab') {
      prop = props.length ? (prop + (k.shift ? -1 : 1) + props.length) % props.length : 0;
      return 'draw';
    }
    if ((k.key === 'ArrowLeft' || k.key === 'ArrowRight') && props[prop]) {
      const p = props[prop];
      const step = (p.step || 0.05) * (k.shift ? 5 : 1) * (k.key === 'ArrowLeft' ? -1 : 1);
      const value = Math.max(p.min, Math.min(p.max, Math.round((p.value + step) / (p.step || 0.05)) * (p.step || 0.05)));
      return { key: p.key, value: +value.toFixed(4) };
    }
    return null;
  };

  /** The mouse at cell x, y (0-based) over the picture: an action, 'close', 'inside' (over the panel, nothing to do) or
   *  null (not over the panel: the page's). */
  const mouse = (x, y, { press = false, wheel = 0 } = {}, pal) => {
    if (!layout || x < layout.x0) return null;
    const r = layout.rows.find((q) => q.y === y);
    if (y >= layout.h) return null;
    if (!r) return 'inside';
    if (wheel) return (pal.items ?? []).length ? { current: (pal.current + wheel + pal.items.length) % pal.items.length } : 'inside';
    if (!press) return 'inside';
    if (r.kind === 'head') return x >= layout.x0 + layout.w - 3 ? 'close' : 'inside';
    if (r.kind === 'mat') return { current: r.i };
    if (r.kind === 'prop') {
      prop = r.k;
      const p = pal.props[r.k];
      const [a, b] = r.bar;
      const f = Math.max(0, Math.min(1, (x - layout.x0 - a + 0.5) / (b - a)));
      const v = p.min + f * (p.max - p.min);
      return { key: p.key, value: +(Math.round(v / (p.step || 0.05)) * (p.step || 0.05)).toFixed(4) };
    }
    return 'inside';
  };

  return { draw, key, mouse, get prop() { return prop; } };
};
