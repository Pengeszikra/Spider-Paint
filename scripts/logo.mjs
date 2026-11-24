#!/usr/bin/env node
// Generates the spider-paint vector logo.
//   media/spider-paint-logo.svg  animated mark (drop-in on its thread, walking legs, pulsing core, blinking eyes)
//   favicon.svg             the same mark, static
// Usage: node scripts/logo.mjs
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const C = { bg: '#0b0d10', ink: '#06080a', cyan: '#3ee6f0', cyanDeep: '#14a9b8', orange: '#ff8a1f', steel: ['#5a6472', '#465060', '#363e4b', '#272d37'] };
const W = 512, MID = W / 2;
const f = (n) => +n.toFixed(1);
const pts = (a) => a.map(([x, y]) => `${f(x)},${f(y)}`).join(' ');
const lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];

// Left legs: hip, knee, tip. Front legs reach up and curl in, back legs reach down and curl in: a round badge silhouette.
const LEGS = [
  { hip: [228, 170], knee: [150, 112], tip: [168, 34], gait: 'a' },
  { hip: [216, 190], knee: [100, 168], tip: [62, 92], gait: 'b' },
  { hip: [216, 214], knee: [98, 262], tip: [56, 344], gait: 'a' },
  { hip: [228, 234], knee: [140, 330], tip: [150, 470], gait: 'b' },
];

function leg({ hip, knee, tip }) {
  const split = lerp(knee, tip, 0.38);
  // tapered claw: perpendicular half-width 7 at the split, sharp at the tip
  const dx = tip[0] - split[0], dy = tip[1] - split[1], len = Math.hypot(dx, dy);
  const nx = -dy / len * 9, ny = dx / len * 9;
  const claw = [[split[0] + nx, split[1] + ny], tip, [split[0] - nx, split[1] - ny]];
  const k = 8; // knee joint diamond
  const joint = [[knee[0], knee[1] - k], [knee[0] + k, knee[1]], [knee[0], knee[1] + k], [knee[0] - k, knee[1]]];
  return [
    `<polyline points="${pts([hip, knee, split])}" fill="none" stroke="${C.ink}" stroke-width="31" stroke-linejoin="miter" stroke-miterlimit="8"/>`,
    `<polyline points="${pts([hip, knee])}" fill="none" stroke="${C.steel[1]}" stroke-width="21"/>`,
    `<polyline points="${pts([hip, lerp(hip, knee, 0.6)])}" fill="none" stroke="${C.steel[0]}" stroke-width="6" transform="translate(-2 -3)"/>`,
    `<polyline points="${pts([knee, split])}" fill="none" stroke="${C.steel[2]}" stroke-width="16"/>`,
    `<polygon filter="url(#g)" points="${pts(claw)}" fill="${C.cyan}" stroke="${C.ink}" stroke-width="5" paint-order="stroke" stroke-linejoin="miter"/>`,
    `<polygon points="${pts(joint)}" fill="${C.orange}" stroke="${C.ink}" stroke-width="4" paint-order="stroke"/>`,
  ].join('');
}

function legs(animated) {
  const side = LEGS.map((l, i) => {
    const cls = animated ? ` class="leg ${l.gait}" style="transform-origin:${l.hip[0]}px ${l.hip[1]}px"` : '';
    return `<g${cls}>${leg(l)}</g>`;
  });
  // right side: same geometry mirrored, opposite gait phase (alternating tetrapod)
  const right = LEGS.map((l) => {
    const g = l.gait === 'a' ? 'b' : 'a';
    const cls = animated ? ` class="leg ${g}" style="transform-origin:${l.hip[0]}px ${l.hip[1]}px"` : '';
    return `<g${cls}>${leg(l)}</g>`;
  });
  return `<g>${side.join('')}</g><g transform="matrix(-1 0 0 1 ${W} 0)">${right.join('')}</g>`;
}

// Faceted (low-poly) shape: fan of triangles around a centre, shaded by facing (light from top-left).
function facets(outline, centre) {
  const out = [];
  for (let i = 0; i < outline.length; i++) {
    const a = outline[i], b = outline[(i + 1) % outline.length];
    const mx = (a[0] + b[0]) / 2 - centre[0], my = (a[1] + b[1]) / 2 - centre[1];
    const light = (-mx * 0.6 - my * 0.8) / Math.hypot(mx, my); // -1..1
    const shade = C.steel[Math.min(3, Math.max(0, Math.round((1 - light) * 1.5)))];
    out.push(`<polygon points="${pts([centre, a, b])}" fill="${shade}"/>`);
  }
  out.push(`<polygon points="${pts(outline)}" fill="none" stroke="${C.ink}" stroke-width="8" stroke-linejoin="miter"/>`);
  return out.join('');
}

const head = [[256, 136], [292, 150], [306, 186], [298, 226], [256, 250], [214, 226], [206, 186], [220, 150]];
const abdomen = [[256, 266], [306, 282], [334, 330], [328, 384], [294, 424], [256, 438], [218, 424], [184, 384], [178, 330], [206, 282]];
const coreC = [256, 352];
const hex = (c, r, rot = 0) => Array.from({ length: 6 }, (_, i) => {
  const a = rot + i * Math.PI / 3; return [c[0] + Math.cos(a) * r, c[1] + Math.sin(a) * r];
});

function body(animated) {
  const eyes = [[240, 158], [272, 158]].map(([x, y]) =>
    `<polygon points="${pts([[x, y - 6], [x + 6, y], [x, y + 6], [x - 6, y]])}" fill="${C.cyan}"/>`).join('');
  const small = [[226, 172], [286, 172]].map(([x, y]) =>
    `<rect x="${x - 3}" y="${y - 3}" width="6" height="6" fill="${C.cyanDeep}"/>`).join('');
  // the 3: angular, built like a model edge
  const three = `<polyline points="242,180 272,180 258,198 274,210 266,230 240,230" fill="none" stroke="${C.ink}" stroke-width="14" stroke-linejoin="miter"/>` +
    `<polyline filter="url(#g)" points="242,180 272,180 258,198 274,210 266,230 240,230" fill="none" stroke="${C.cyan}" stroke-width="7" stroke-linejoin="miter"/>`;
  const ring = hex(coreC, 44, Math.PI / 6), core = hex(coreC, 30, Math.PI / 6), inner = hex(coreC, 14, Math.PI / 6);
  return [
    `<rect x="246" y="242" width="20" height="30" fill="${C.steel[3]}" stroke="${C.ink}" stroke-width="6"/>`,
    `<g>${facets(abdomen, [252, 340])}`,
    `<polyline points="${pts([[214, 296], [256, 282], [298, 296]])}" fill="none" stroke="${C.orange}" stroke-width="5"/>`,
    `<polyline points="${pts([[226, 414], [256, 424], [286, 414]])}" fill="none" stroke="${C.orange}" stroke-width="5"/>`,
    `<polygon points="${pts(ring)}" fill="${C.ink}" stroke="${C.orange}" stroke-width="4"/>`,
    `<g${animated ? ' class="core"' : ''} style="transform-origin:${coreC[0]}px ${coreC[1]}px">`,
    `<polygon filter="url(#g)" points="${pts(core)}" fill="${C.cyanDeep}"/>`,
    `<polygon points="${pts(inner)}" fill="${C.cyan}"/>`,
    `<polygon points="${pts([coreC, core[4], core[5]])}" fill="#fff" opacity=".35"/>`,
    `</g></g>`,
    `<g>${facets(head, [256, 192])}${three}`,
    `<g${animated ? ' class="eyes"' : ''} style="transform-origin:256px 160px">${eyes}${small}</g></g>`,
  ].join('');
}

function svg(animated) {
  const style = animated ? `<style>
.spider{animation:drop 1.4s cubic-bezier(.3,1.5,.5,1) both,bob 4s ease-in-out 1.4s infinite}
.thread{stroke-dasharray:160;animation:spin 1s ease-out both}
.leg{animation:step 1.6s ease-in-out infinite}
.leg.b{animation-delay:-.8s}
.core{animation:pulse 2.4s ease-in-out infinite}
.eyes{animation:blink 5s steps(1,end) infinite}
@keyframes drop{0%{transform:translateY(-150px)}100%{transform:none}}
@keyframes spin{0%{stroke-dashoffset:160}100%{stroke-dashoffset:0}}
@keyframes bob{0%,100%{transform:translateY(0)}50%{transform:translateY(6px)}}
@keyframes step{0%,100%{transform:rotate(0)}25%{transform:rotate(-5deg)}75%{transform:rotate(3deg)}}
@keyframes pulse{0%,100%{transform:scale(1);opacity:1}50%{transform:scale(.86);opacity:.7}}
@keyframes blink{0%,94%{transform:none}95%{transform:scaleY(.1)}97%{transform:none}}
@media (prefers-reduced-motion:reduce){.spider,.thread,.leg,.core,.eyes{animation:none}}
</style>` : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${W}" role="img" aria-label="spider-paint">
${animated ? '<title>spider-paint</title>' : ''}${style}<defs><filter id="g" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="5" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>
<rect width="${W}" height="${W}" rx="112" fill="${C.bg}"/>
<line class="thread" x1="${MID}" y1="0" x2="${MID}" y2="150" stroke="${C.cyan}" stroke-width="3" opacity=".7"/>
<g class="spider">${legs(animated)}${body(animated)}</g>
</svg>
`;
}

// maskable: full-bleed background, mark inside the 80% safe zone
const maskable = svg(false)
  .replace(/<rect width="512" height="512" rx="112" fill="([^"]+)"\/>/, '<rect width="512" height="512" fill="$1"/><g transform="translate(256 256) scale(.8) translate(-256 -256)">')
  .replace(/<\/svg>\s*$/, '</g></svg>\n');

writeFileSync(join(root, 'media/spider-paint-logo.svg'), svg(true));
writeFileSync(join(root, 'favicon.svg'), svg(false));
writeFileSync(join(root, 'icons/icon.svg'), svg(false));
writeFileSync(join(root, 'icons/icon-maskable.svg'), maskable);
console.log('wrote media/spider-paint-logo.svg, favicon.svg, icons/icon.svg, icons/icon-maskable.svg');
// PNG icons (optional, needs rsvg-convert):
//   rsvg-convert -w 512 icons/icon.svg -o icons/icon-512.png ; -w 192 → icon-192.png ; -w 180 → apple-touch-icon.png
//   rsvg-convert -w 32 icons/icon.svg -o icons/favicon-32.png ; rsvg-convert -w 512 icons/icon-maskable.svg -o icons/icon-maskable-512.png
