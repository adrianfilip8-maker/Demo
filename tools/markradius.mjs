#!/usr/bin/env node
/**
 * markradius.mjs — the DRAWN radius of the alert marks, measured instead of assumed.
 *
 *   node tools/markradius.mjs shots/fxalert alert
 *
 * `tools/alertframe.mjs` frames both alert marks as circles of `MARK_R = 0.55 m`, commented
 * "the mark's own radius, so \"in frame\" means all of it". Two of its bars read that number:
 * CROPPING (under-measuring lets it certify a cropped mark as in-frame) and the 30 px
 * readability bar (which errs safe). §407 derived the drawn extent from the emitters' own data
 * and got 1.333 m for rung 3 and 0.857 m for rung 2 — geometric extent, an upper bound, because
 * a soft sprite's VISIBLE extent is smaller than its quad. So the true framing radius is
 * somewhere between 0.55 and 1.333 and nobody has measured it.
 *
 * ── The method, and why it is the ring's method reused ──────────────────────────────────────
 * §405 measured `dive_ring` by unprojecting every pixel the batch lights onto the impact plane
 * and profiling the added light by world radius. That worked because the ring is PLANAR — it
 * lies on a known plane. The alert marks are BILLBOARDS in the `dust` batch, so there is no
 * plane to unproject onto; instead the geometry is simpler. A camera-facing quad at world point
 * M subtends the same angle in every screen direction, so one scale factor converts screen
 * radius to world radius at M's depth, and a radial profile in pixels IS a radial profile in
 * metres.
 *
 * `A − P-nodust` is every pixel the dust batch draws. Both marks live in that batch
 * (`Emitters.js`: `alert_spot` and `alert_search` are both `batch: 'dust'`), and they hang on
 * two different guards, so they are separated by proximity to their own projected centres
 * rather than by any threshold.
 *
 * ── What this cannot tell you ───────────────────────────────────────────────────────────────
 * It measures where the mark puts LIGHT, which is the right quantity for a cropping bar and for
 * "is all of it in frame". It is not the alpha silhouette a cel artist would ink, and it says
 * nothing about whether the mark READS — that is §379.3's boundary and it needs eyes.
 */
import { readPNG } from './png.mjs';
import { readFileSync, existsSync } from 'node:fs';
import { SHOTS } from '../src/core/Shots.js';
import { camFor, project, W, H } from './framelib.mjs';

const DIR = process.argv[2] || 'shots/fxalert';
const SHOT = process.argv[3] || 'alert';
const need = ['A-ship', 'P-nodust'];
for (const t of need) {
  if (!existsSync(`${DIR}/${SHOT}-${t}.png`)) { console.error(`missing arm ${t}`); process.exit(2); }
}
const A = readPNG(`${DIR}/${SHOT}-A-ship.png`), P = readPNG(`${DIR}/${SHOT}-P-nodust.png`);
const meta = existsSync(`${DIR}/arms.json`) ? JSON.parse(readFileSync(`${DIR}/arms.json`, 'utf8')) : null;
const AF = readFileSync(new URL('./alertframe.mjs', import.meta.url), 'utf8');
const num = (re, what) => {
  const m = AF.match(re);
  if (!m) { console.error(`alertframe no longer states ${what} in a form this tool can read`); process.exit(2); }
  return Number(m[1]);
};
const MARK_Y = num(/const MARK_Y = ([\d.]+)/, 'MARK_Y');
/* Per-rung since §407: `MARK_R` was one number for both rungs and is now `MARK_R3` / `MARK_R2`,
   the DERIVED geometric envelopes. Those are upper bounds — a soft sprite's visible extent is
   smaller than its quad — so the measurement below should land at or under them, and by how
   much is the whole point of taking it. */
const MARK_R3 = num(/const MARK_R3 = ([\d.]+)/, 'MARK_R3');
const MARK_R2 = num(/const MARK_R2 = ([\d.]+)/, 'MARK_R2');

console.log(`markradius · ${DIR} · shot ${SHOT}`);
if (meta?.tree) console.log(`captured from src ${meta.tree.src} (HEAD ${meta.tree.head}) at ${meta.at}`);
if (meta?.subject) console.log(`subject: ${JSON.stringify(meta.subject)}`);
console.log(`alertframe: MARK_R3 ${MARK_R3} m · MARK_R2 ${MARK_R2} m · at guard.y + ${MARK_Y}\n`);

const lum = (im) => {
  const o = new Float32Array(W * H);
  for (let i = 0; i < W * H; i++) { const j = i * im.ch; o[i] = 0.2126 * im.data[j] + 0.7152 * im.data[j + 1] + 0.0722 * im.data[j + 2]; }
  return o;
};
const la = lum(A), lp = lum(P);
const add = new Float32Array(W * H);            // light the dust batch contributes
for (let i = 0; i < W * H; i++) add[i] = la[i] - lp[i];

const shot = SHOTS[SHOT];
const cam = camFor(shot);
const stands = [
  { name: 'rung 3 (alert_spot)', at: shot.guard, framed: MARK_R3 },
  { name: 'rung 2 (alert_search)', at: shot.guard2, framed: MARK_R2 },
].filter((s) => Array.isArray(s.at));

let anyLit = 0;
for (let i = 0; i < W * H; i++) if (Math.abs(add[i]) > 0.5) anyLit++;
console.log(`dust batch lights ${anyLit} px total (${(100 * anyLit / (W * H)).toFixed(2)}% of frame)\n`);
if (!anyLit) { console.log('THE DUST BATCH DREW NOTHING — no mark to measure; the arms or the staging are wrong.'); process.exit(3); }

for (const s of stands) {
  const M = [s.at[0], s.at[1] + MARK_Y, s.at[2]];
  const c = project(cam, ...M);
  if (!c) { console.log(`${s.name}: behind the lens`); continue; }
  /* Screen pixels per world metre AT THIS DEPTH, measured by projecting a metre offset
     perpendicular to the view axis rather than assumed from the fov. */
  const fwd = cam.getWorldDirection(new (cam.position.constructor)());
  const right = [fwd.z, 0, -fwd.x];
  const rl = Math.hypot(right[0], right[2]) || 1;
  const q = project(cam, M[0] + right[0] / rl, M[1], M[2] + right[2] / rl);
  const pxPerM = Math.hypot(q.px - c.px, q.py - c.py);

  /* ── The mark is its CONNECTED COMPONENT, not its share of the frame ──────────────────────
     The first version binned every lit pixel by distance from the mark centre, splitting the
     frame between the two marks by proximity. That is wrong here and the numbers said so:
     `dust` holds 154 live instances in this shot and the two marks are at most 18 of them
     (`alert_spot` 8-11, `alert_search` 5-7), so the bins filled with unrelated dust and rung 2's
     median lit radius came out at 6.35 m — six metres, for a mark framed at 0.857.
     A mark is one blob. Taking the connected component that contains the mark's own projected
     centre isolates it from the other 136 sprites without a threshold on distance, and the
     result is stable across cut levels — which is the evidence that it IS the mark and not a
     cut artefact. Same failure and same fix as the `spark` batch in §405. */
  const CUT = 0.5;
  const m = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) if (add[i] > CUT) m[i] = 1;
  const lab = new Int32Array(W * H).fill(-1);
  let nComp = 0; const st = [];
  for (let i = 0; i < W * H; i++) {
    if (!m[i] || lab[i] >= 0) continue;
    const id = nComp++; st.length = 0; st.push(i); lab[i] = id;
    while (st.length) {
      const p2 = st.pop(), px2 = p2 % W, py2 = (p2 / W) | 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = px2 + dx, ny = py2 + dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const r2 = ny * W + nx;
        if (m[r2] && lab[r2] < 0) { lab[r2] = id; st.push(r2); }
      }
    }
  }
  let id = -1;
  for (let rad = 0; rad < 40 && id < 0; rad++) {
    for (let a = 0; a < 64 && id < 0; a++) {
      const x = Math.round(c.px + Math.cos(a / 64 * 6.283) * rad), y = Math.round(c.py + Math.sin(a / 64 * 6.283) * rad);
      if (x >= 0 && y >= 0 && x < W && y < H && lab[y * W + x] >= 0) id = lab[y * W + x];
    }
  }
  const bins = new Map();
  if (id >= 0) {
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        if (lab[y * W + x] !== id) continue;
        const d = Math.hypot(x + 0.5 - c.px, y + 0.5 - c.py);
        const r = Math.round((d / pxPerM) * 20) / 20;
        const b = bins.get(r) ?? { n: 0, s: 0, mx: 0 };
        b.n++; b.s += add[y * W + x]; b.mx = Math.max(b.mx, add[y * W + x]);
        bins.set(r, b);
      }
    }
  }
  const keys = [...bins.keys()].sort((a, b) => a - b);
  const tot = keys.reduce((a, k) => a + bins.get(k).n, 0);
  console.log(`── ${s.name} at (${s.at.join(', ')}) + ${MARK_Y}  ·  centre px ${c.px.toFixed(0)}, ${c.py.toFixed(0)}  ·  ${pxPerM.toFixed(1)} px/m`);
  if (!tot || tot < 50) {
    console.log(`   NO MEASURABLE MARK — the component at this centre is ${tot} px. Not a null`);
    console.log(`   result: this frame cannot isolate this mark, and the radius is HELD.\n`);
    continue;
  }
  console.log('     r(m)      px   mean dL   max dL');
  for (const k of keys) {
    if (k > 2.6) break;
    const b = bins.get(k);
    if (b.n < 12) continue;
    console.log(`   ${k.toFixed(2).padStart(6)} ${String(b.n).padStart(7)} ${(b.s / b.n).toFixed(1).padStart(8)} ${b.mx.toFixed(1).padStart(8)}  ${'#'.repeat(Math.min(44, Math.round(b.s / b.n)))}`);
  }
  let cum = 0; const pct = {};
  for (const k of keys) { cum += bins.get(k).n; for (const p of [50, 90, 99]) if (pct[p] === undefined && cum >= tot * p / 100) pct[p] = k; }
  const rMax = keys[keys.length - 1];
  console.log(`   radius containing 50/90/99% of the lit pixels: ${pct[50]} / ${pct[90]} / ${pct[99]} m · outermost ${rMax} m`);
  const contains = (r) => (100 * keys.filter((k) => k <= r).reduce((a, k) => a + bins.get(k).n, 0) / tot);
  console.log(`   framed at ${s.framed} m, which contains ${contains(s.framed).toFixed(1)}% of the mark's light`);
  console.log(`   the old single 0.55 m contained ${contains(0.55).toFixed(1)}%`);
  console.log(`   smallest radius containing 99%: ${pct[99]} m  ->  framing is ${(s.framed / pct[99]).toFixed(2)}x that\n`);
}
