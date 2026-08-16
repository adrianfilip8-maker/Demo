#!/usr/bin/env node
/**
 * armextent.mjs — the drawn extent of a subject, as the pixels that vanish when you hide it.
 *
 *   node tools/armextent.mjs shots/fxrim4-impact impact
 *
 * No browser, no capture lock. Scores PNGs `tools/fxrim.mjs` already wrote.
 *
 * ── Why this exists as its own tool ─────────────────────────────────────────────────────────
 * Three constants in `impactframe.mjs` are measurements: the figure plate, the dust plate, and
 * the ring's clip. Each was taken from an A/B pair on ONE tree, and `assertExtents` compares a
 * derived constant against those recorded pixels — which proves a constant reproduces its own
 * recording, and says nothing at all once the renderer has moved underneath it. `impactframe`'s
 * own guard now catches that by stamping `treeHash()`; clearing it needs a re-measurement, and
 * a re-measurement needs a tool that is not the thing being checked.
 *
 * ── The plateau, and why the bbox is not read at a chosen threshold ─────────────────────────
 * `|A − B| > cut` gives a different bbox at every cut, and picking one is picking an answer.
 * The project's convention is the PLATEAU: the run of consecutive cuts over which the bbox
 * stops moving. A subject with a hard edge has a long plateau and its extent is that bbox; a
 * subject that fades out has none, and *that is the finding* rather than something to threshold
 * away. So the plateau is detected and reported, and a subject without one is named as such.
 *
 * ── What it compares against ────────────────────────────────────────────────────────────────
 * `impactframe.mjs`'s `MEASURED` block, read out of its SOURCE. This tool never edits it and
 * never imports it as data it might silently re-base: it greps the numbers, prints them beside
 * the new ones, and reports the delta. Which constants to update is the shot owner's call.
 */
import { readPNG } from './png.mjs';
import { readFileSync, existsSync } from 'node:fs';
import { W, H } from './framelib.mjs';

const DIR = process.argv[2] || 'shots/fxrim4-impact';
const SHOT = process.argv[3] || 'impact';
const arm = (t) => `${DIR}/${SHOT}-${t}.png`;

/* label -> [base arm, isolation arm]. The base is the shipped frame; the isolation arm is the
   same frame with one subject hidden, so `base − isolation` is that subject's own pixels. */
const PAIRS = [
  { label: 'sly', base: 'A-ship', iso: 'S-nosly', what: 'the figure' },
  { label: 'dust', base: 'A-ship', iso: 'P-nodust', what: 'dive_dust + dive_debris' },
  { label: 'ring', base: 'A-ship', iso: 'P-noring', what: 'dive_ring' },
];
const CUTS = [2, 4, 8, 16, 32, 64];

for (const p of PAIRS) {
  for (const t of [p.base, p.iso]) {
    if (!existsSync(arm(t))) { console.error(`missing arm ${t} — ${arm(t)}`); process.exit(2); }
  }
}
const meta = existsSync(`${DIR}/arms.json`) ? JSON.parse(readFileSync(`${DIR}/arms.json`, 'utf8')) : null;

console.log(`armextent · ${DIR} · shot ${SHOT} · ${W}x${H}`);
if (meta?.tree) console.log(`captured from src ${meta.tree.src} (HEAD ${meta.tree.head}) at ${meta.at}`);
if (meta?.subject) console.log(`subject: ${JSON.stringify(meta.subject)}`);
if (meta?.arms) {
  const trees = [...new Set(meta.arms.map((r) => r.tree?.src))];
  console.log(`arm trees: ${trees.join(', ')}${trees.length === 1 ? '  (homogeneous)' : '  !! THE SET STRADDLES AN EDIT'}`);
  const A = meta.arms.find((r) => r.arm === 'A-ship'), Z = meta.arms.find((r) => r.arm === 'Z-null');
  console.log(A && Z
    ? `NULL CONTROL  A-ship ${A.sha === Z.sha ? '== Z-null, bit-identical — the renderer is deterministic'
      : '!= Z-null — two renders of one state disagree and no extent below is signal'}`
    : 'NULL CONTROL  Z-null not in this run — no verdict on determinism');
  /* §211.1: an arm that changed nothing measures nothing. Asserted from the shas per pair. */
  for (const p of PAIRS) {
    const b = meta.arms.find((r) => r.arm === p.base), i = meta.arms.find((r) => r.arm === p.iso);
    if (b && i && b.sha === i.sha) console.log(`!! LEVER DEAD  ${p.iso} is bit-identical to ${p.base} — ${p.what} drew nothing`);
  }
}

const lum = (im) => {
  const o = new Float32Array(W * H);
  for (let i = 0; i < W * H; i++) {
    const j = i * im.ch;
    o[i] = 0.2126 * im.data[j] + 0.7152 * im.data[j + 1] + 0.0722 * im.data[j + 2];
  }
  return o;
};

/* ── the recorded constants, grepped from impactframe's source and never written back ────── */
const IF_SRC = existsSync('tools/impactframe.mjs') ? readFileSync('tools/impactframe.mjs', 'utf8') : '';
const recorded = {};
{
  const blk = IF_SRC.match(/const MEASURED = \{([\s\S]*?)\};/);
  if (blk) {
    for (const m of blk[1].matchAll(/(\w+):\s*\{\s*x0:\s*(-?\d+),\s*x1:\s*(-?\d+),\s*y0:\s*(-?\d+),\s*y1:\s*(-?\d+)/g)) {
      recorded[m[1]] = { x0: +m[2], x1: +m[3], y0: +m[4], y1: +m[5] };
    }
  }
  const src = IF_SRC.match(/src:\s*'([^']*)'/);
  console.log(`\nimpactframe records its extents from: ${src ? src[1] : '(not stated)'}`);
  console.log(`  MEASURED holds ${Object.keys(recorded).length} plate(s): ${Object.keys(recorded).join(', ') || '(none parsed)'}`);
}

const bboxOf = (test) => {
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity, n = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (!test(y * W + x)) continue;
    n++; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
  }
  return { x0, x1, y0, y1, n };
};
const near = (a, b, tol) => Math.abs(a.x0 - b.x0) <= tol && Math.abs(a.x1 - b.x1) <= tol
  && Math.abs(a.y0 - b.y0) <= tol && Math.abs(a.y1 - b.y1) <= tol;

const out = {};
for (const p of PAIRS) {
  const LA = lum(readPNG(arm(p.base))), LB = lum(readPNG(arm(p.iso)));
  const dL = new Float32Array(W * H);
  for (let i = 0; i < W * H; i++) dL[i] = LA[i] - LB[i];

  console.log(`\n── ${p.label}  (${p.base} − ${p.iso}) — ${p.what} ─────────────────────────`);
  const rows = CUTS.map((c) => ({ c, b: bboxOf((i) => Math.abs(dL[i]) > c) }));
  for (const r of rows) {
    console.log(`   |dL|>${String(r.c).padEnd(3)} ${String(r.b.n).padStart(8)} px   `
      + `x ${String(r.b.x0).padStart(4)}..${String(r.b.x1).padEnd(4)} rows ${String(r.b.y0).padStart(3)}..${String(r.b.y1).padEnd(3)}`);
  }
  /* Longest run of consecutive cuts whose bboxes agree within 2 px. */
  let best = null;
  for (let i = 0; i < rows.length; i++) {
    for (let j = rows.length - 1; j >= i; j--) {
      let ok = true;
      for (let k = i; k <= j; k++) if (!near(rows[i].b, rows[k].b, 2)) { ok = false; break; }
      if (ok && (!best || j - i > best.j - best.i)) best = { i, j };
      if (ok) break;
    }
  }
  const hasPlateau = best && best.j > best.i;
  const chosen = hasPlateau ? rows[best.i] : null;
  if (hasPlateau) {
    console.log(`   PLATEAU |dL| ${rows[best.i].c}..${rows[best.j].c}  ->  `
      + `x ${chosen.b.x0}..${chosen.b.x1}, rows ${chosen.b.y0}..${chosen.b.y1}`);
    out[p.label] = chosen.b;
  } else {
    console.log('   NO PLATEAU — the bbox moves at every threshold, so this subject has no hard');
    console.log('   edge and no single extent. Reported rather than thresholded away.');
  }

  const rec = recorded[p.label];
  if (rec && hasPlateau) {
    const d = { x0: chosen.b.x0 - rec.x0, x1: chosen.b.x1 - rec.x1, y0: chosen.b.y0 - rec.y0, y1: chosen.b.y1 - rec.y1 };
    const moved = Math.max(...Object.values(d).map(Math.abs));
    console.log(`   impactframe records  x ${rec.x0}..${rec.x1}, rows ${rec.y0}..${rec.y1}`);
    console.log(`   DELTA                x0 ${d.x0 >= 0 ? '+' : ''}${d.x0}  x1 ${d.x1 >= 0 ? '+' : ''}${d.x1}  `
      + `y0 ${d.y0 >= 0 ? '+' : ''}${d.y0}  y1 ${d.y1 >= 0 ? '+' : ''}${d.y1}   (max |move| ${moved} px)`);
    console.log(`   ${moved <= 2 ? 'STABLE — the recorded plate still describes what the renderer draws.'
      : 'MOVED — the recorded plate describes a frame this tree no longer renders.'}`);
  } else if (rec) {
    console.log(`   impactframe records  x ${rec.x0}..${rec.x1}, rows ${rec.y0}..${rec.y1} — no plateau here to compare it against`);
  }
}

console.log('\n── what this does and does not settle ──────────────────────────────────────────');
console.log('   It measures the DRAWN pixels on this tree. It does not decide which constants');
console.log('   `impactframe` should carry: a plate is sized to CONTAIN a subject for a cropping');
console.log('   test, so a shrunk measurement does not license a shrunk plate (§141.1). The');
console.log('   deltas are the input to that decision, not the decision.');
