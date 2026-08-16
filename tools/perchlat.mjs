#!/usr/bin/env node
/**
 * perchlat.mjs — the `perch_idle` lateral line of action, measured in RENDERED PIXELS.
 *
 *   node tools/perchlat.mjs [shots/perchlat] [sly-perch]
 *   node tools/perchlat.mjs --self-test          # instrument controls only, no arms needed
 *
 * No browser, no capture lock. Scores PNGs `tools/fxrim.mjs` already wrote.
 *
 * ── The open item this closes ───────────────────────────────────────────────────────────────
 * §413.3: *"The rendered-pixel confirmation at `sly-perch` — the twin authored for exactly this,
 * where the excursion is 11.2 px against a 2.5 px hull, 4.5x — has, as far as this ledger
 * records, never been taken."* §345 verified the pose in rig space and settled `hero` by
 * arithmetic; neither is a per-row centroid measured off a real frame. This is that measurement.
 *
 * It can confirm and it cannot change anything — §345 already priced the only keyframe change
 * (+17 deg of torso Z-roll, 2.8x the shipped span, and `latEx` flips sign before you reach it)
 * and refused it. So this is registered as a confirmation, and if it comes back small that is a
 * result about the projection rather than a reason to touch the clip.
 *
 * ── What is measured, stated precisely because it is NOT the rig's `latEx` ──────────────────
 * For each row of the figure's silhouette, the horizontal centroid of the lit pixels. The
 * sequence `cx(y)` is the drawn centre line, and its lateral travel is the line of action as the
 * renderer actually presents it.
 *
 * **This is not `latEx` and must not be quoted as it.** `latEx` is a rig-space lateral
 * displacement of a bone chain; `cx(y)` is a screen-x statistic that carries whatever the camera
 * projects onto screen-x — at `sly-perch` (view 33 deg) that is 0.839 lateral and 0.545 sagittal,
 * so the two axes are mixed and the pixel instrument cannot separate them. §413.1's arithmetic
 * predicts the LATERAL component alone arrives at 11.18 px here. If the measured centre line
 * travels appreciably more than that, the excess is sagittal and not evidence of a bigger lean.
 *
 * The operative claim is narrower than either, and it is the one worth confirming: **does the
 * centre line move by more than the ink line drawn over it?** `Outline.js` holds a ~2.5 px hull
 * at a 900-row reference, so at this capture's height the bar scales with it.
 *
 * ── The figure is located by hiding it, not by a colour threshold ───────────────────────────
 * `A-ship` minus `S-nosly` is every pixel the character draws — the §270 lesson, and the same
 * lever `fxrim` uses for every other subject. No threshold decides what is Sly.
 */
import { readPNG } from './png.mjs';
import { readFileSync, existsSync } from 'node:fs';
import { W, H } from './framelib.mjs';

const DIR = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : 'shots/perchlat';
const SHOT = process.argv[3] && !process.argv[3].startsWith('--') ? process.argv[3] : 'sly-perch';
const SELFTEST = process.argv.includes('--self-test');

/** The ink hull, from `Outline.js`'s own statement of it, scaled to this capture's height. */
const HULL_REF_PX = 2.5, HULL_REF_ROWS = 900;
const HULL_PX = HULL_REF_PX * (H / HULL_REF_ROWS);

/* ── the statistic, and it is separated from the arms so it can be controlled ─────────────── */
/**
 * Per-row horizontal centroid of a mask, and the travel of that centre line.
 *
 * `trim` drops a fraction of rows from each end before the travel is taken: the crown and the
 * feet swing for reasons that are not the torso's line of action, and a peak-to-peak over the
 * whole figure would be dominated by whichever extremity happens to stick out. Reported at
 * several trims rather than one, because a statistic that needs a chosen window is a statistic
 * that can be chosen to say things.
 */
export function centreLine(mask, weight = null) {
  const rows = [];
  for (let y = 0; y < H; y++) {
    let sum = 0, wsum = 0, n = 0;
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      if (!mask[i]) continue;
      const w = weight ? weight[i] : 1;
      sum += x * w; wsum += w; n++;
    }
    if (n > 0) rows.push({ y, cx: sum / wsum, n });
  }
  return rows;
}
export function travelOf(rows, trim = 0) {
  if (rows.length < 3) return null;
  const k = Math.floor(rows.length * trim);
  const win = rows.slice(k, rows.length - k);
  if (win.length < 3) return null;
  let lo = Infinity, hi = -Infinity, loY = 0, hiY = 0;
  for (const r of win) { if (r.cx < lo) { lo = r.cx; loY = r.y; } if (r.cx > hi) { hi = r.cx; hiY = r.y; } }
  return { pp: hi - lo, lo, hi, loY, hiY, rows: win.length, y0: win[0].y, y1: win[win.length - 1].y };
}

/* ══ INSTRUMENT CONTROLS — can this statistic return "no excursion"? ══════════════════════ */
/* §409: a measurement that cannot produce its own null is not a measurement. Before any frame
   is opened, the statistic is run on shapes whose answer is known by construction. If a
   symmetric column does not read ~0, nothing below means anything. */
function selfTest() {
  const mk = (fn) => { const m = new Uint8Array(W * H); for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (fn(x, y)) m[y * W + x] = 1; return m; };
  const cases = [
    ['upright rectangle  (expect 0)', mk((x, y) => x >= 600 && x < 700 && y >= 200 && y < 600), 0],
    ['upright ellipse    (expect 0)', mk((x, y) => ((x - 640) / 60) ** 2 + ((y - 400) / 200) ** 2 <= 1), 0],
    ['sheared 20 px      (expect 20)', mk((x, y) => { const s = 600 + Math.round(20 * (y - 200) / 400); return y >= 200 && y < 600 && x >= s && x < s + 100; }), 20],
    ['S-curve +-8 px     (expect 16)', mk((x, y) => { const s = 640 + Math.round(8 * Math.sin((y - 200) / 400 * Math.PI * 2)); return y >= 200 && y < 600 && x >= s - 50 && x < s + 50; }), 16],
  ];
  console.log('── instrument controls, before any frame is opened ─────────────────────────────');
  let bad = 0;
  for (const [name, m, expect] of cases) {
    const t = travelOf(centreLine(m), 0);
    const ok = Math.abs(t.pp - expect) <= 1.0;
    if (!ok) bad++;
    console.log(`   ${name.padEnd(32)} centre line travels ${t.pp.toFixed(2)} px   ${ok ? 'ok' : '*** WRONG ***'}`);
  }
  console.log(`   ${bad ? '*** the statistic does not reproduce known shapes — stop ***'
    : 'the statistic reads 0 on symmetric shapes and reproduces known shears, so it can return a null'}\n`);
  return bad === 0;
}

if (SELFTEST) { process.exit(selfTest() ? 0 : 1); }

/* ══ THE ARMS ═════════════════════════════════════════════════════════════════════════════ */
const arm = (t) => `${DIR}/${SHOT}-${t}.png`;
for (const t of ['A-ship', 'S-nosly']) {
  if (!existsSync(arm(t))) { console.error(`missing arm ${t} — ${arm(t)}  (or pass --self-test)`); process.exit(2); }
}
const meta = existsSync(`${DIR}/arms.json`) ? JSON.parse(readFileSync(`${DIR}/arms.json`, 'utf8')) : null;

console.log(`perchlat · ${DIR} · shot ${SHOT} · ${W}x${H} · ink hull ${HULL_PX.toFixed(2)} px at this height\n`);
if (meta?.tree) console.log(`captured from src ${meta.tree.src} (HEAD ${meta.tree.head}) at ${meta.at}`);
if (meta?.subject) console.log(`subject: ${JSON.stringify(meta.subject)}`);
if (meta?.arms) {
  const A = meta.arms.find((r) => r.arm === 'A-ship'), Z = meta.arms.find((r) => r.arm === 'Z-null'),
    S = meta.arms.find((r) => r.arm === 'S-nosly');
  console.log(A && Z ? `NULL CONTROL  A-ship ${A.sha === Z.sha ? '== Z-null — deterministic' : '!= Z-null — NOT deterministic, nothing below is signal'}`
    : 'NULL CONTROL  Z-null not captured — no verdict');
  console.log(A && S ? `LEVER CONTROL A-ship ${A.sha !== S.sha ? '!= S-nosly — hiding the character moved pixels' : '== S-nosly — THE CHARACTER DREW NOTHING, and no centre line below is his'}`
    : 'LEVER CONTROL S-nosly not captured — no verdict');
}
console.log();
if (!selfTest()) process.exit(1);

const lum = (im) => {
  const o = new Float32Array(W * H);
  for (let i = 0; i < W * H; i++) { const j = i * im.ch; o[i] = 0.2126 * im.data[j] + 0.7152 * im.data[j + 1] + 0.0722 * im.data[j + 2]; }
  return o;
};
const LA = lum(readPNG(arm('A-ship'))), LS = lum(readPNG(arm('S-nosly')));
const dL = new Float32Array(W * H);
for (let i = 0; i < W * H; i++) dL[i] = Math.abs(LA[i] - LS[i]);

/* The figure's mask at several cuts. The low cuts catch his cast SHADOW, which is not his line
   of action and sits below him — so the cut is swept and the answer is read where it stops
   moving, the same plateau discipline `armextent` uses. */
console.log('── the drawn figure, and its centre line ───────────────────────────────────────');
console.log('   cut     px    rows          centre-line travel (peak-to-peak), by row trim');
console.log('                               trim 0%    trim 10%   trim 20%   trim 30%');
const results = [];
for (const cut of [2, 4, 8, 16, 32, 64]) {
  const mask = new Uint8Array(W * H);
  let n = 0;
  for (let i = 0; i < W * H; i++) if (dL[i] > cut) { mask[i] = 1; n++; }
  const rows = centreLine(mask);
  if (rows.length < 3) { console.log(`   >${String(cut).padEnd(3)} ${String(n).padStart(7)}  (too few rows)`); continue; }
  const t = [0, 0.10, 0.20, 0.30].map((tr) => travelOf(rows, tr));
  results.push({ cut, n, rows, t });
  console.log(`   >${String(cut).padEnd(3)} ${String(n).padStart(7)}  ${String(rows[0].y).padStart(3)}..${String(rows[rows.length - 1].y).padEnd(3)}   `
    + t.map((v) => `${v ? v.pp.toFixed(2) : '—'} px`.padEnd(11)).join(''));
}

/* ── the verdict, against the two numbers that exist ─────────────────────────────────────── */
const PRED_LAT = 11.18;      // §413.1 / §345: the LATERAL component alone, at 1600x900
const predAtH = PRED_LAT * (H / 900);
console.log(`\n── against the numbers that already exist ──────────────────────────────────────`);
console.log(`   §413.1 predicts the LATERAL component alone at ${PRED_LAT} px (1600x900)`);
console.log(`          = ${predAtH.toFixed(2)} px at this capture's ${H} rows`);
console.log(`   the ink hull drawn over it is ${HULL_PX.toFixed(2)} px`);
const stable = results.filter((r) => r.cut >= 16);
if (stable.length) {
  const pp = stable.map((r) => r.t[1]?.pp).filter((v) => v != null);
  const med = pp.sort((a, b) => a - b)[pp.length >> 1];
  console.log(`\n   MEASURED centre-line travel (cuts >= 16, trim 10%): ${pp.map((v) => v.toFixed(2)).join(', ')} px  median ${med.toFixed(2)}`);
  console.log(`   against the ${HULL_PX.toFixed(2)} px hull: ${(med / HULL_PX).toFixed(2)}x`);
  console.log(`   against the ${predAtH.toFixed(2)} px predicted lateral component: ${(med / predAtH).toFixed(2)}x`);
  console.log(`\n   ${med > HULL_PX * 2
    ? 'The drawn centre line travels well past the line drawn over it, so the pose SURVIVES\n   projection at this shot — which is the claim §413.3 registered and never took.'
    : 'The drawn centre line does NOT clear the ink hull by a comfortable margin here.'}`);
  console.log('   The excess over the predicted lateral component, if any, is SAGITTAL: this');
  console.log('   statistic mixes both axes and cannot attribute travel to one of them.');
}
