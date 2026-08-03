/**
 * deepscore — score the ledger's hue line on a RENDERER-DERIVED deep-shade population.
 *
 * WHY NOT roigen's archShade: roigen raycasts a 315k-tri level with no BVH (~30+ min/shot on
 * this container) and its own header declares it cannot see cast shadow. This mask is drawn by
 * the renderer, which is the standard §11 prefers.
 *
 * DEFINITION: the shadow light reaches a pixel in proportion to shadowMix, so |sbm20 - base| is
 * a monotone proxy for shadowMix (times an albedo/ao prefactor). The population scored is the
 * TOP QUARTILE of that delta — the pixels the bounce knob moves most, i.e. exactly where the
 * magenta risk is highest. Passing the hue line here is a conservative, worst-case pass.
 *
 * WHAT THIS IS NOT (§11 — the suffix not implemented):
 *   - It is NOT roigen's archShade. No material filter: character, props and terrain are
 *     admitted if they are shadow-dominated. So its absolute numbers are NOT comparable to
 *     §115.4's 211 / 5.7% — the BASE row here is this instrument's own reference.
 *   - The prefactor means a bright shaded surface outranks a dark one at equal shadowMix, so
 *     this is a shadow-INFLUENCE ranking, not a shadowMix ranking.
 */
import { readPNG, px } from '/home/user/Demo/tools/png.mjs';
import { existsSync } from 'node:fs';

const F = '/tmp/claude-0/-home-user-Demo/94022f73-a328-5e86-b2ec-031aa9c720ce/scratchpad/gate/frames';
const hue = (r, g, b) => { const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn; if (!d) return 0; let h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; h *= 60; return h < 0 ? h + 360 : h; };
const med = (a) => { const s = [...a].sort((x, y) => x - y); return s[s.length >> 1]; };

for (const shot of process.argv.slice(2)) {
  if (!existsSync(`${F}/${shot}-base.png`) || !existsSync(`${F}/${shot}-sbm20.png`)) { console.log(`${shot}: missing frames`); continue; }
  const base = readPNG(`${F}/${shot}-base.png`), rev = readPNG(`${F}/${shot}-sbm20.png`);
  const W = base.w, H = base.h, d = [];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const [a, b2, c] = px(base, x, y), [e, f, g] = px(rev, x, y);
    d.push(Math.max(Math.abs(a - e), Math.abs(b2 - f), Math.abs(c - g)));
  }
  const nz = d.filter((v) => v > 0).sort((a, b) => a - b);
  const thr = nz[Math.floor(nz.length * 0.75)];
  const pts = [];
  for (let y = 0, i = 0; y < H; y++) for (let x = 0; x < W; x++, i++) if (d[i] >= thr && d[i] > 0) pts.push([x, y]);
  console.log(`\n=== ${shot}: deep-shade proxy = top quartile of |sbm20-base|  (thr ${thr}/255, ${pts.length} px, ${(100 * pts.length / (W * H)).toFixed(1)}% of frame) ===`);
  console.log('arm            hueP50   satP50   meanL   G-darkest%   ledger(hue<=226 & Gdark<50)');
  for (const arm of ['base', 'gate20_85', 'gate20_95', 'sbm085', 'sbm175', 'sbm20']) {
    if (!existsSync(`${F}/${shot}-${arm}.png`)) continue;
    const im = readPNG(`${F}/${shot}-${arm}.png`);
    const hs = [], ss = []; let L = 0, gd = 0;
    for (const [x, y] of pts) {
      const [r, g, b] = px(im, x, y); hs.push(hue(r, g, b));
      const mx = Math.max(r, g, b), mn = Math.min(r, g, b); ss.push(mx ? (mx - mn) / mx : 0);
      L += 0.2126 * r + 0.7152 * g + 0.0722 * b; if (g < r && g < b) gd++;
    }
    const h = med(hs), gp = 100 * gd / pts.length;
    console.log(`${arm.padEnd(13)} ${h.toFixed(0).padStart(5)}    ${med(ss).toFixed(3)}   ${(L / pts.length).toFixed(1).padStart(5)}    ${gp.toFixed(1).padStart(5)}%       ${h <= 226 && gp < 50 ? 'pass' : 'FAIL'}`);
  }
}
