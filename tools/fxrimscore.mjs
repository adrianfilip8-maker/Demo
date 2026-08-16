#!/usr/bin/env node
/**
 * fxrimscore.mjs — §379.4's objective half, scored against PNGs on disk.
 *
 *   node tools/fxrimscore.mjs shots/fxrim-impact
 *
 * No browser. `tools/fxrim.mjs` holds the FIFO capture lock for as short a time as it can and
 * this does the arithmetic afterwards, because §400 records five container rollbacks and every
 * one of them ate an in-flight capture.
 *
 * ── THE QUESTION ────────────────────────────────────────────────────────────────────────────
 * §379.1's structural fact: particles set `depthWrite: false` (`Particles.js:1468, 1800, 2041,
 * 2193, 2405`), so `PostFX`'s edge pass — which keys off depth and normals — cannot see them;
 * and they are instanced quads, not `isMesh`, so `Outline.js:381`'s gate excludes them from the
 * hull system. Both mandatory ink treatments therefore miss them **in the source**. Nobody has
 * ever checked the picture. `dive_ring` is the place to check: 104x `alert_spot`'s peak
 * projected ink and 7.6x the next largest sprite in the game.
 *
 * ── THE INSTRUMENT: ink is what the ink passes CHANGE ────────────────────────────────────────
 * Not a near-black threshold. §270 is the record of that instrument being VOIDed on this very
 * project — a ridge detector found, on `night.png`, an "ink" median brighter than the frame
 * median — and the authored hexes are not what lands in the file anyway: hull ink is graded to
 * display L 12.3–23.4, crease ink leaks 5% of the background through `inkStrength 0.95`, is
 * faded by `smoothstep(0.05, 0.20, lum)`, then vignetted and smeared by FXAA. §2.1.2's colours
 * are still measured here, but as a REPORTED CROSS-CHECK on the definitional answer, never as
 * the detector. See `§colour` at the bottom.
 *
 * ── THE THREE REGIONS, and why each is located the way it is ────────────────────────────────
 *
 *   RIM     the `dive_ring` rim, projected from the point and radius the SHIPPED
 *           `Particles._stageImpact()` returns, through `framelib.discOf`. Not restated: the
 *           staging function is executed and `discOf` samples its own rim.
 *
 *   HERO    Sly's silhouette boundary — §379.4's MUST-FIND probe. Located from `A − S-nosly`,
 *           the pixels that vanish when the character root is hidden. It has to be located by
 *           something other than ink: using the hull mask `B − C` would make the calibration
 *           "ink is where the ink is", which proves nothing about anything.
 *
 *   FLOOR   open paving — §379.4's MUST-NOT-FIND probe. Ground-plane points sampled on a grid,
 *           kept only where `framelib` says there is architecture at the impact's own height,
 *           the camera has a clear line to it, and the projection is clear of every other
 *           region by a margin. A density number with no such probe means nothing: a bar the
 *           frame passes everywhere is measuring the frame, not the ring.
 *
 * ── THE BAR IS DERIVED FROM THE FLOOR, NOT PICKED ───────────────────────────────────────────
 * "The rim reads like the floor" is only a claim if "like the floor" has a width. The floor
 * probe is cut into disjoint patches of the SAME pixel count as the rim band, and the bar is
 * the largest density any one of them reaches. A rim at or under that is inside the null
 * region's own scatter — measured, not asserted. The band half-width comes from
 * `ToonMaterial.TUNE.inkPx` (the shipped 2.5 px line) rather than from taste, and every number
 * is printed across a sweep of it so no verdict can turn on that choice either.
 */
import { readPNG, px } from './png.mjs';
import { readFileSync, existsSync } from 'node:fs';
import * as THREE from 'three';
import { SHOTS } from '../src/core/Shots.js';
import { Particles } from '../src/fx/Particles.js';
import { TUNE as TOON_TUNE } from '../src/render/ToonMaterial.js';
import {
  W, H, SLY, provenance, camFor, boxOf, discOf, project, clear, assertOccluded,
  groundUnder,
} from './framelib.mjs';
import {
  BAND_R, idx, inFrame, stamp, bandOfPolyline, bandOfPixels, boundaryOf, density,
} from './fxrimlib.mjs';

const DIR = process.argv[2] || 'shots/fxrim-impact';
const SHOT = process.argv[3] || 'impact';

/* ── arms ──────────────────────────────────────────────────────────────────────────────── */

const TAGS = ['A-ship', 'B-nocrease', 'C-noink', 'N-nofx', 'S-nosly', 'Z-null'];
const IM = {};
for (const t of TAGS) {
  const f = `${DIR}/${SHOT}-${t}.png`;
  if (!existsSync(f)) { console.error(`missing arm ${t}: ${f}`); process.exit(2); }
  IM[t] = readPNG(f);
}
const meta = existsSync(`${DIR}/arms.json`) ? JSON.parse(readFileSync(`${DIR}/arms.json`, 'utf8')) : null;

console.log(`fxrimscore · ${DIR} · shot ${SHOT} · tool tree ${provenance}`);
if (meta?.tree) console.log(`captured from src ${meta.tree.src ?? '?'} (HEAD ${meta.tree.head ?? '?'}) at ${meta.at}`);
for (const t of TAGS) {
  if (IM[t].w !== W || IM[t].h !== H) {
    console.error(`arm ${t} is ${IM[t].w}x${IM[t].h}; framelib projects at ${W}x${H}. A margin `
      + 'measured at the wrong size is a different claim.');
    process.exit(2);
  }
}

/** |Δ| over the three channels, max-channel. 0 means byte-identical. */
function delta(a, b, i) {
  const ca = a.ch, cb = b.ch, ia = i * ca, ib = i * cb;
  return Math.max(
    Math.abs(a.data[ia] - b.data[ib]),
    Math.abs(a.data[ia + 1] - b.data[ib + 1]),
    Math.abs(a.data[ia + 2] - b.data[ib + 2]),
  );
}
/** Boolean mask of pixels where two arms differ by more than `thr`. */
function diffMask(a, b, thr = 0) {
  const m = new Uint8Array(W * H);
  let n = 0;
  for (let i = 0; i < W * H; i++) if (delta(a, b, i) > thr) { m[i] = 1; n++; }
  m.n = n;
  return m;
}

/* ── instrument gates: every one of these must hold or nothing below is evidence ────────── */

const gates = [];
const gate = (id, ok, msg) => { gates.push({ id, ok, msg }); return ok; };

const zero = diffMask(IM['A-ship'], IM['Z-null'], 0);
gate('G1 null arm', zero.n === 0,
  `A vs Z differ in ${zero.n} px — two renders of the identical state do not reproduce, so every `
  + 'mask below is noise');

const inkMask = diffMask(IM['A-ship'], IM['C-noink'], 0);
const creaseMask = diffMask(IM['A-ship'], IM['B-nocrease'], 0);
const hullMask = diffMask(IM['B-nocrease'], IM['C-noink'], 0);
const fxMask = diffMask(IM['A-ship'], IM['N-nofx'], 0);
const slyMask = diffMask(IM['A-ship'], IM['S-nosly'], 0);

gate('G2 ink lever', inkMask.n > 0, 'defeating both ink systems changed no pixels — the ink map is empty');
gate('G3 fx lever', fxMask.n > 0, 'hiding the FX root changed no pixels — the presence probe cannot fire');
gate('G4 sly lever', slyMask.n > 0, 'hiding the character root changed no pixels — the MUST-FIND probe cannot fire');

console.log(`\nmasks (px, ${(W * H / 1e3).toFixed(0)}k frame)`);
for (const [n, m] of [['ink A−C', inkMask], ['crease A−B', creaseMask], ['hull B−C', hullMask],
  ['fx A−N', fxMask], ['sly A−S', slyMask]]) {
  console.log(`  ${n.padEnd(12)} ${String(m.n).padStart(7)}  ${(100 * m.n / (W * H)).toFixed(3)}% of frame`);
}

/* ── geometry: the ring, from the shipped staging function ──────────────────────────────── */

console.log(`\n${assertOccluded()}`);

const shot = SHOTS[SHOT];
const emits = [];
const stageCtx = {
  engine: { get: (k) => (k === 'movement' && shot.player?.pos
    ? { position: new THREE.Vector3(...shot.player.pos) } : null) },
  _emit: (n, at, o) => emits.push({ n, at: at.clone(), ...o }),
  decal: () => {},
};
const staged = Particles.prototype._stageImpact.call(stageCtx);
const cam = camFor(shot);
/* 720 segments, not `discOf`'s default 24: the band is a curve here, not a bounding box, and at
   24 the chords cut ~2 px inside the true rim on a 360 px ellipse — which would walk the band
   off the ink it is looking for. The default is right for `impactframe`, which only needs the
   extremes. */
const ring = discOf(cam, staged.point.x, staged.point.y, staged.point.z, staged.radius, 720);
const slyBox = boxOf(cam, ...shot.player.pos, SLY);
console.log(`ring r ${staged.radius} m at (${staged.point.toArray().join(', ')}) `
  + `→ ${(ring.x1 - ring.x0).toFixed(0)} x ${(ring.y1 - ring.y0).toFixed(0)} px, ${ring.rim.length} rim samples`);
console.log(`sly box rows ${slyBox.y0.toFixed(0)}..${slyBox.y1.toFixed(0)} (${(slyBox.y1 - slyBox.y0).toFixed(0)} px)`);
console.log(`staged sprites: ${emits.map((e) => `${e.n}@${e.age}s`).join(' ')}`);

/* ── regions ────────────────────────────────────────────────────────────────────────────── */

/**
 * The floor control, chosen by GEOMETRY.
 *
 * Ground-plane points on a grid, kept only where all four hold: `framelib` finds architecture
 * within 0.25 m of the impact's own height (so it is the paving and not a terrace or a hole —
 * the check that rejected two impact sites when this shot was authored); `clear()` says the
 * camera can see it; the projection sits inside the frame with a margin; and it is far from
 * every other region in pixels. The last one is what makes it a control rather than a second
 * sample of the same thing.
 */
function floorPoints() {
  const keep = [];
  const [ix, , iz] = shot.player.pos;
  for (let wx = -14; wx <= 14; wx += 0.5) {
    for (let wz = -20; wz <= 6; wz += 0.5) {
      const g = groundUnder(wx, wz, staged.point.y + 1.0);
      if (g === null || Math.abs(g - shot.player.pos[1]) > 0.25) continue;
      const p = project(cam, wx, staged.point.y, wz);
      if (!p || p.px < 40 || p.py < 40 || p.px > W - 40 || p.py > H - 40) continue;
      if (!clear(cam, { x: wx, y: staged.point.y, z: wz })) continue;
      keep.push({ wx, wz, px: p.px, py: p.py, d: Math.hypot(wx - ix, wz - iz) });
    }
  }
  return keep;
}
/* Cast once. The geometry a candidate has to satisfy — real paving at the impact's own height,
   visible from the lens, inside the frame — does not depend on the band width, and re-raycasting
   it per sweep step turned a two-minute score into an unfinishable one. The band-dependent half
   of the rule (clearance from every other region) is applied per step below. */
const FLOOR_CANDIDATES = floorPoints();

/** Is a disc of radius `r` at (cx, cy) entirely clear of `excl`? */
function discClear(excl, cx, cy, r) {
  for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++) {
    for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
      if (!inFrame(x, y)) return false;
      const dx = x + 0.5 - cx, dy = y + 0.5 - cy;
      if (dx * dx + dy * dy <= r * r && excl[idx(x, y)]) return false;
    }
  }
  return true;
}

/* ── the sweep ──────────────────────────────────────────────────────────────────────────── */

/* `BAND_R` is `inkPx / 2 + 1` and its derivation lives in `fxrimlib.mjs` beside the builders
   that consume it. Every other half-width in the sweep is printed beside it so no verdict can
   turn on the choice. */
const R0 = BAND_R;
const SWEEP = [1, 2, R0, 4, 5, 6].filter((v, i, a) => a.indexOf(v) === i).sort((a, b) => a - b);

console.log(`\nband half-width from ToonMaterial.TUNE.inkPx ${TOON_TUNE.inkPx} → ${R0} px (line/2 + 1 for FXAA)`);
console.log('\n                     RIM (dive_ring)          HERO (Sly silhouette)    FLOOR (open paving)');
console.log('  r    what           ink%   crease%  fx%     ink%   crease%  hull%    ink%   patches  worst%');

const heroBoundary = boundaryOf(slyMask);
const rows = [];
for (const r of SWEEP) {
  const rim = bandOfPolyline(ring.rim, r);
  const hero = bandOfPixels(heroBoundary, r);

  /* Everything the control must stay away from, at this band width — plus an 8 px cordon, so a
     patch cannot sit one pixel outside the ring's own band and still be called "open floor". */
  const excl = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) if (rim[i] || hero[i] || fxMask[i] || slyMask[i]) excl[i] = 1;
  const CORDON = 8;

  /* Disjoint patches of the same radius as the rim band, so the bar below is a like-for-like
     scatter and not an average over a larger, quieter area. */
  const floor = new Uint8Array(W * H);
  const patches = [];
  for (const q of FLOOR_CANDIDATES) {
    if (!discClear(excl, q.px, q.py, r + CORDON)) continue;
    if (!discClear(floor, q.px, q.py, r)) continue;         // disjoint from the patches so far
    const one = stamp(new Uint8Array(W * H), q.px, q.py, r);
    let n = 0;
    for (let i = 0; i < W * H; i++) if (one[i]) { floor[i] = 1; n++; }
    one.n = n;
    patches.push(one);
  }
  floor.n = patches.reduce((a, p) => a + p.n, 0);

  const dRim = density(rim, inkMask), cRim = density(rim, creaseMask), fRim = density(rim, fxMask);
  const dHero = density(hero, inkMask), cHero = density(hero, creaseMask), hHero = density(hero, hullMask);
  const dFloor = density(floor, inkMask);
  const worst = patches.length ? Math.max(...patches.map((p) => density(p, inkMask).d)) : NaN;

  rows.push({ r, dRim, cRim, fRim, dHero, cHero, hHero, dFloor, worst, patches: patches.length, rimN: rim.n, heroN: hero.n });
  const pc = (v) => (100 * v).toFixed(2).padStart(6);
  console.log(`  ${String(r).padEnd(4)} ${(r === R0 ? '← derived' : '').padEnd(14)}`
    + `${pc(dRim.d)} ${pc(cRim.d)} ${pc(fRim.d)}   ${pc(dHero.d)} ${pc(cHero.d)} ${pc(hHero.d)}   `
    + `${pc(dFloor.d)}  ${String(patches.length).padStart(5)}  ${pc(worst)}`);
}

const main = rows.find((x) => x.r === R0);

/* ── verdict ────────────────────────────────────────────────────────────────────────────── */

console.log(`\nat the derived half-width r = ${R0}:`);
console.log(`  RIM band     ${main.rimN} px · ${(100 * main.fRim.d).toFixed(1)}% of it is FX (presence probe)`);
console.log(`  HERO band    ${main.heroN} px · ${(100 * main.dHero.d).toFixed(1)}% ink`);
console.log(`  FLOOR probe  ${main.dFloor.n} px in ${main.patches} disjoint patches · ${(100 * main.dFloor.d).toFixed(3)}% ink`);

/* CAL-A: the rim band is ON the ring. Without this "no ink on the rim" and "the band missed the
   ring" are the same number. Bar: a band centred on a drawn ring is mostly FX pixels. */
gate('CAL-A rim is on the ring', main.fRim.d > 0.5,
  `only ${(100 * main.fRim.d).toFixed(1)}% of the rim band is FX — the band is not on the drawn `
  + 'ring, so its ink density is a measurement of empty floor');
/* CAL-B: MUST FIND. The hero boundary carries ink or the instrument cannot see ink at all. */
gate('CAL-B hero boundary carries ink', main.dHero.d > 0.5,
  `the hero silhouette band is only ${(100 * main.dHero.d).toFixed(1)}% ink — the frame's most `
  + 'heavily inked boundary does not read as inked, so a low rim number means nothing');
/* CAL-C: MUST NOT FIND. Open paving is the null. */
gate('CAL-C open floor is quiet', main.dFloor.n > 0 && main.dFloor.d < 0.10,
  main.dFloor.n === 0 ? 'no floor control could be placed at all'
    : `open paving is ${(100 * main.dFloor.d).toFixed(1)}% ink — the detector fires on flat ground, `
      + 'so it is not measuring boundaries');

console.log('\ninstrument gates');
let voided = false;
for (const g of gates) {
  console.log(`  ${g.ok ? 'PASS' : 'FAIL'}  ${g.id}${g.ok ? '' : ` — ${g.msg}`}`);
  if (!g.ok) voided = true;
}
if (voided) {
  console.log('\nVOID — an instrument gate failed. No verdict is available from this set.');
  process.exit(3);
}

/* The bar: the rim reads like the floor if it is inside the floor's own patch-to-patch scatter,
   measured on patches of the rim band's own size. Derived from this frame, not chosen. */
const BAR = main.worst;
const z = (main.dHero.d - main.dFloor.d) > 0
  ? (main.dRim.d - main.dFloor.d) / (main.dHero.d - main.dFloor.d) : NaN;

console.log(`\n── VERDICT ────────────────────────────────────────────────────────────────────`);
console.log(`  rim ink        ${(100 * main.dRim.d).toFixed(3)}%`);
console.log(`  floor ink      ${(100 * main.dFloor.d).toFixed(3)}%   (bar: worst single patch ${(100 * BAR).toFixed(3)}%)`);
console.log(`  hero ink       ${(100 * main.dHero.d).toFixed(3)}%`);
console.log(`  rim on the floor→hero scale: ${(100 * z).toFixed(2)}%  (0% = reads exactly like bare floor)`);
if (main.dRim.d <= BAR) {
  console.log(`\n  §379.1 DEMONSTRATED on this frame. The largest sprite in the game carries no more`);
  console.log(`  ink along its rim than bare paving does, while the hero boundary a hand's width`);
  console.log(`  away is ${(main.dHero.d / Math.max(main.dRim.d, 1 / main.rimN)).toFixed(0)}x that.`);
} else {
  console.log(`\n  §379.1 IS NOT DEMONSTRATED. The rim carries ink above the floor's own scatter`);
  console.log(`  (${(100 * main.dRim.d).toFixed(3)}% vs a ${(100 * BAR).toFixed(3)}% bar). The hypothesis that particles carry`);
  console.log(`  neither ink treatment does not survive this measurement.`);
}

/* ── §colour: what the ink actually measures as, reported not used ──────────────────────── */

const fam = (m, name) => {
  const R = [], G = [], B = [], L = [];
  for (let i = 0; i < W * H; i++) {
    if (!m[i]) continue;
    const x = i % W, y = (i / W) | 0;
    const [r, g, b] = px(IM['A-ship'], x, y);
    R.push(r); G.push(g); B.push(b); L.push(0.2126 * r + 0.7152 * g + 0.0722 * b);
  }
  if (!L.length) return null;
  const med = (a) => { const s = a.slice().sort((p, q) => p - q); return s[s.length >> 1]; };
  const warm = R.filter((_, i) => R[i] > B[i]).length / R.length;
  const nearBlack = L.filter((v) => v <= 40).length / L.length;
  console.log(`  ${name.padEnd(22)} median rgb (${med(R)}, ${med(G)}, ${med(B)})  luma ${med(L).toFixed(1)}/255  `
    + `warm(R>B) ${(100 * warm).toFixed(0)}%  luma≤40 ${(100 * nearBlack).toFixed(0)}%`);
  return { medL: med(L), nearBlack };
};
console.log(`\n§colour — what §2.1.2's two ink families actually measure as in the graded frame`);
console.log(`  (#1a1210 is rgb(26,18,16) as authored; #161022 is rgb(22,16,34))`);
fam(creaseMask, 'crease ink A−B');
fam(hullMask, 'hull ink B−C');
fam(inkMask, 'all ink A−C');
console.log(`  A near-black threshold applied to these would be a DIFFERENT measurement from the`);
console.log(`  one above; the verdict does not use it. §270 is why.`);
