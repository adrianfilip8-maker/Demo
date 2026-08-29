#!/usr/bin/env node
/**
 * coinfit.mjs — does the coin FIT where it was put, at the size it is drawn?
 *
 * §712's instrument, and `tools/bottlefit.mjs`'s method applied to the other collectible. The
 * question is the same one §701 asked about the bottles and it has the same trap in it: a coin
 * that grows sinks into whatever it floats beside and pokes through whatever it floats under,
 * and **nothing announces it** — the coin still bobs, still spins, still collects, still passes
 * every pickups test. The only symptom is a picture nobody took.
 *
 * ── Why triangles rather than rays (inherited from bottlefit's header, and it still binds) ───
 * `Raycaster` honours `material.side`, so a ray fired from inside a `FrontSide` wall exits
 * through its own back face and reports a buried object as one standing in open air. This is an
 * exact surface test instead: the coin's own 48 triangles, posed, against the world's triangles
 * with a separating-axis test — no ray, no side, no culling. Two numbers per placement:
 *
 *   CROSS      does any coin triangle actually intersect a world triangle. This is the defect.
 *   CLEARANCE  if not, how close it comes — min distance from a coin vertex to a world triangle.
 *
 * The world is the DRAWN scene (`camdot.drawnScene()`, props booted), not the collider set:
 * interpenetration is a thing you SEE, and plenty of what you see has no collider.
 *
 * ── The coin set is 82, and it is not the 44 anyone would guess ──────────────────────────────
 * `Props._collectibles()` authors 44 spots and draws them as an InstancedMesh named `coins`.
 * `Pickups._author()` **adopts all 44, hides that mesh, and adds 38 more** derived from
 * `Architecture.api.route`. What the player sees is `pickup_coins`, 82 instances. So both sources
 * are gathered here and every one of the 82 is tested — not a sample, and not the 44.
 *
 * Both coin meshes are excluded from the world soup by name; otherwise every coin is found
 * intersecting itself and the run reports 82 defects. `clue_bottles`/`pickup_clues` are already
 * excluded upstream by `bottlefit.worldSoup`, so a coin sharing space with a bottle is NOT
 * tested here — stated so nobody reads a clean run as covering it.
 *
 * ── The pose envelope, not the rest pose ─────────────────────────────────────────────────────
 * A coin in this game is never at its authored spot. `Pickups._writeCoinMatrices` bobs it
 * ±`TUNE.bobAmp` and spins it a full turn per cycle at `TUNE.spinRate`. Measured rather than
 * read off the Euler: the rotation is `Euler(π/2, 0, θ)` in XYZ order, and the coin's face
 * normal comes out **horizontal at every θ**, sweeping the full circle in the XZ plane. So the
 * coin stands upright like a wheel and turns about the vertical — face, edge, face — and its
 * swept volume is a ball of radius `hypot(r, t/2)`, not a flat disc. Yaw is therefore sampled
 * densely (12 by default, one per side of the 12-gon) rather than assumed harmless.
 *
 *   node tools/coinfit.mjs                 the shipped radius and 1.5x it
 *   node tools/coinfit.mjs 0.16 0.24       an explicit list of radii
 *   YAWS=24 PAD=1.0 node tools/coinfit.mjs
 */
import * as THREE from 'three';
import fs from 'node:fs';
import path from 'node:path';
import { drawnScene } from './camdot.mjs';
import { worldSoup, candidates, pointTri2, sat } from './bottlefit.mjs';
import { coin } from '../src/world/PropKit.js';
import { TUNE, authorRouteCoins } from '../src/world/Pickups.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const YAWS = +(process.env.YAWS || 12);
const PAD = +(process.env.PAD || 0.60);       // how far out a clearance is still worth reporting
const THICK_RATIO = 0.035 / 0.16;             // the shipped t:r proportion, so a swept radius tracks

/* The two coin meshes, excluded from the world by name. `coins` is Props' decorative twin —
   VISIBLE in `drawnScene()` because that boot has no `Pickups` to hide it, and therefore in the
   soup unless it is named here. */
const SELF = new Set(['coins', 'pickup_coins']);

/**
 * The authored route, scraped from `EgyptLevel.js` rather than copied — bottlefit's own rule:
 * a hand-copied fixture measures a layout nobody plays the moment the level moves a waypoint.
 */
function readRoute() {
  const src = fs.readFileSync(path.join(ROOT, 'src/world/EgyptLevel.js'), 'utf8');
  const m = /A\.api\.route = \[([\s\S]*?)\n\s*\];/.exec(src);
  if (!m) throw new Error('coinfit: could not scrape A.api.route from EgyptLevel.js');
  const out = [...m[1].matchAll(/\[\s*'([^']+)'\s*,\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*\]/g)]
    .map((r) => [r[1], +r[2], +r[3], +r[4]]);
  if (out.length < 2) throw new Error(`coinfit: scraped ${out.length} waypoints — the route format changed`);
  return out;
}

/**
 * Every coin the player actually sees, with a label naming where it came from.
 * The 44 are read out of the DRAWN mesh's instance matrices, not re-generated: `Props` seeds them
 * from its own rng, and regenerating them in a second boot is a different draw order away from
 * being a different layout.
 */
async function coinSpots() {
  const { engine } = await drawnScene();
  engine.scene.updateMatrixWorld(true);
  let deco = null;
  engine.scene.traverse((o) => { if (o.isInstancedMesh && o.name === 'coins') deco = o; });
  if (!deco) throw new Error('coinfit: no InstancedMesh named `coins` in the drawn scene');

  const out = [];
  const m = new THREE.Matrix4(), p = new THREE.Vector3();
  for (let i = 0; i < deco.count; i++) {
    deco.getMatrixAt(i, m); m.premultiply(deco.matrixWorld);
    p.setFromMatrixPosition(m);
    /* Props authors 34 scattered then 10 along the architrave ledge, in that order. */
    out.push({ label: i < 34 ? `props scatter ${i}` : `props ledge ${i - 34}`, x: p.x, y: p.y, z: p.z });
  }
  const propsCount = out.length;

  const route = readRoute();
  const trail = authorRouteCoins(route);
  trail.forEach((s, i) => out.push({ label: `route ${s.kind} ${i}`, x: s.x, y: s.y, z: s.z }));

  return { spots: out, propsCount, trailCount: trail.length };
}

/** The coin as flat arrays, at a given radius (thickness held to the shipped proportion). */
function coinGeom(r) {
  const t = r * THICK_RATIO;
  const geo = coin(r, t);
  const pos = geo.attributes.position, idx = geo.index;
  const verts = new Float64Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    verts[i * 3] = pos.getX(i); verts[i * 3 + 1] = pos.getY(i); verts[i * 3 + 2] = pos.getZ(i);
  }
  const index = idx
    ? Uint32Array.from({ length: idx.count }, (_, i) => idx.getX(i))
    : Uint32Array.from({ length: pos.count }, (_, i) => i);
  geo.computeBoundingBox();
  const out = { r, verts, index, t, triCount: index.length / 3, bbox: geo.boundingBox.clone() };
  geo.dispose();
  return out;
}

const BOBS = [-1, 0, 1];

/**
 * ONE placement, tested over the whole pose envelope. Extracted from `run()` (§732) so that the
 * census, the controls below and `tools/coinmove.mjs`'s relocation search all ask the **same**
 * question of the same code. A relocation searched with a second copy of this predicate would
 * prove the copy agrees with itself, which is §439's stub in a new costume.
 *
 * → { cross: {who,pose}|null, clear: number, who: string, pose: string }
 */
export function poseTest(W, C, s, opts = {}) {
  const swept = Math.hypot(C.r, C.t / 2);
  const pad = opts.pad ?? PAD;
  const yaws = opts.yaws ?? YAWS;
  const env = new THREE.Box3(
    new THREE.Vector3(s.x - swept, s.y - swept - TUNE.bobAmp, s.z - swept),
    new THREE.Vector3(s.x + swept, s.y + swept + TUNE.bobAmp, s.z + swept));
  const cand = candidates(W, env, pad);
  const posed = new Float64Array(C.verts.length);
  const triA = new Float64Array(9);
  const M = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
  const one = new THREE.Vector3(1, 1, 1), p = new THREE.Vector3();
  let cross = null, minClear = Infinity, minWho = -1, minPose = '';

  for (let yi = 0; yi < yaws && !cross; yi++) {
    const th = (yi / yaws) * Math.PI * 2;
    for (const bob of BOBS) {
      if (cross) break;
      const poseName = `yaw ${(th * 180 / Math.PI).toFixed(0)}° bob ${bob >= 0 ? '+' : ''}${bob}`;
      /* The shipped pose, verbatim from `Pickups._writeCoinMatrices`. */
      p.set(s.x, s.y + bob * TUNE.bobAmp, s.z);
      M.compose(p, q.setFromEuler(e.set(Math.PI / 2, 0, th)), one);
      const el = M.elements;
      for (let i = 0; i < C.verts.length; i += 3) {
        const x = C.verts[i], y = C.verts[i + 1], z = C.verts[i + 2];
        posed[i] = el[0] * x + el[4] * y + el[8] * z + el[12];
        posed[i + 1] = el[1] * x + el[5] * y + el[9] * z + el[13];
        posed[i + 2] = el[2] * x + el[6] * y + el[10] * z + el[14];
      }
      for (let ci = 0; ci < cand.length; ci += 7) {
        const t = cand[ci];
        if (SELF.has(W.names[W.owner[t]])) continue;      // a coin is not its own obstacle
        const o = t * 9;
        for (let i = 0; i < posed.length; i += 3) {
          const d2 = pointTri2(posed[i], posed[i + 1], posed[i + 2], W.tris, o);
          if (d2 < minClear * minClear) { minClear = Math.sqrt(d2); minWho = W.owner[t]; minPose = poseName; }
        }
        /* The gate is safe rather than merely fast: any world point inside the coin is within the
           swept radius 0.2414 of its centre, so a crossing triangle ALWAYS drives `minClear`
           under 0.25 in this same iteration before the gate is read. */
        if (minClear < 0.25) {
          for (let f = 0; f < C.index.length && !cross; f += 3) {
            for (let k = 0; k < 3; k++) {
              const v = C.index[f + k] * 3;
              triA[k * 3] = posed[v]; triA[k * 3 + 1] = posed[v + 1]; triA[k * 3 + 2] = posed[v + 2];
            }
            if (sat(triA, 0, W.tris, o)) cross = { who: W.names[W.owner[t]], pose: poseName };
          }
        }
        if (cross) break;
      }
    }
  }
  return { cross, clear: minClear, who: minWho >= 0 ? W.names[minWho] : '', pose: minPose };
}

/**
 * ── §732: the instrument's own controls, run on every census ──────────────────────────────
 *
 * §439/§440: an instrument built from the same assumption as the thing it measures cannot
 * falsify it. `poseTest` had, until this section, never been shown to say either word on an
 * input whose answer was known independently of the answer. Four planted placements, all
 * against the REAL soup, all through `poseTest` itself:
 *
 *   POS-centre  the coin centred exactly on a real wall triangle's centroid   MUST cross
 *   POS-nudge   the same, pushed 0.05 m along that face's normal              MUST STILL cross
 *   NEG-air     the coin at (0, 400, 0)                                        MUST NOT cross
 *   BOUNDARY    step off the same face until it stops crossing                 MUST clear, at
 *               (ladder 0.05 m out to 1.20 m, both ways along ±n)              d* >= swept 0.2414
 *
 * POS-nudge is the one that earns its place: 0.05 m is exactly the "nudge it out until it stops
 * z-fighting" repair, and an instrument that went quiet there would certify that non-fix.
 *
 * BOUNDARY is the discriminating negative, and the FIRST draft of it was wrong in a way worth
 * keeping. It read "0.60 m along the face normal must be clear" — and it FAILED, because the
 * largest triangle on this mesh is a horizontal face whose winding puts `n` at (0,−1,0), so
 * 0.60 m "out" is 0.60 m further INTO the slab. The instrument was right and my control was
 * measuring my assumption about which way a normal points (§435.4, in one line of arithmetic).
 * Replaced by a **two-sided ladder**, which needs no such assumption: it asserts that SOME
 * offset within 1.20 m clears — a claim a predicate that shouted CROSS at everything could not
 * satisfy — and that the first clear offset is **at least the swept radius**, which is a fact
 * about geometry (a centre closer than 0.2414 m to a large planar face cannot be clear of it)
 * and therefore an assertion the instrument cannot pass by being sloppy in either direction.
 *
 * The seed triangle is chosen by **largest area on a named wall mesh**, which is a property of
 * the level and not of the result: nothing here searches for a triangle that makes the controls
 * pass. If a control fails, the census aborts rather than printing numbers.
 */
const LADDER = [0.05, 0.10, 0.15, 0.20, 0.25, 0.30, 0.40, 0.50, 0.60, 0.80, 1.00, 1.20];

export function controls(W, C, seedMesh = 'arch:court:sandstone_block') {
  let best = -1, bestArea = 0;
  for (let t = 0; t < W.owner.length; t++) {
    if (W.names[W.owner[t]] !== seedMesh) continue;
    const o = t * 9;
    const ux = W.tris[o + 3] - W.tris[o], uy = W.tris[o + 4] - W.tris[o + 1], uz = W.tris[o + 5] - W.tris[o + 2];
    const vx = W.tris[o + 6] - W.tris[o], vy = W.tris[o + 7] - W.tris[o + 1], vz = W.tris[o + 8] - W.tris[o + 2];
    const a = Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx) / 2;
    if (a > bestArea) { bestArea = a; best = t; }
  }
  if (best < 0) throw new Error(`coinfit controls: no triangle owned by \`${seedMesh}\` — the mesh names changed`);
  const o = best * 9;
  const cx = (W.tris[o] + W.tris[o + 3] + W.tris[o + 6]) / 3;
  const cy = (W.tris[o + 1] + W.tris[o + 4] + W.tris[o + 7]) / 3;
  const cz = (W.tris[o + 2] + W.tris[o + 5] + W.tris[o + 8]) / 3;
  const ux = W.tris[o + 3] - W.tris[o], uy = W.tris[o + 4] - W.tris[o + 1], uz = W.tris[o + 5] - W.tris[o + 2];
  const vx = W.tris[o + 6] - W.tris[o], vy = W.tris[o + 7] - W.tris[o + 1], vz = W.tris[o + 8] - W.tris[o + 2];
  let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
  const nl = Math.hypot(nx, ny, nz) || 1; nx /= nl; ny /= nl; nz /= nl;

  const at = (d) => ({ x: cx + nx * d, y: cy + ny * d, z: cz + nz * d });
  const out = [
    ['POS-centre', at(0), true],
    ['POS-nudge', at(0.05), true],
    ['NEG-air', { x: 0, y: 400, z: 0 }, false],
  ].map(([name, s, want]) => {
    const r = poseTest(W, C, s);
    return { name, want, got: !!r.cross, s, who: r.cross ? r.cross.who : r.who, clear: r.clear };
  });

  /* BOUNDARY — the two-sided ladder. `d*` is the smallest offset, either way along n, at which
     the coin stops crossing. Both facts asserted: that one exists inside 1.20 m, and that it is
     not closer than the swept radius. */
  const swept = Math.hypot(C.r, C.t / 2);
  let dStar = Infinity, dSide = 0;
  for (const d of LADDER) {
    for (const sgn of [1, -1]) {
      if (d >= dStar) continue;
      if (!poseTest(W, C, at(sgn * d)).cross) { dStar = d; dSide = sgn; }
    }
  }
  out.push({
    name: 'BOUNDARY', want: false, got: !(Number.isFinite(dStar) && dStar >= swept - 1e-9),
    s: Number.isFinite(dStar) ? at(dSide * dStar) : null, who: seedMesh,
    clear: Number.isFinite(dStar) ? dStar : Infinity,
    note: Number.isFinite(dStar)
      ? `first clear at d* ${dStar.toFixed(2)} m on the ${dSide > 0 ? '+n' : '−n'} side (swept ${swept.toFixed(4)})`
      : `NO offset within ${LADDER[LADDER.length - 1]} m clears — the predicate never says no`,
  });
  return { seed: { mesh: seedMesh, tri: best, area: bestArea, c: [cx, cy, cz], n: [nx, ny, nz] }, out };
}

async function run(radii) {
  process.stdout.write('· booting the drawn level (props included)\n');
  const t0 = Date.now();
  const W = await worldSoup();
  const { spots, propsCount, trailCount } = await coinSpots();
  process.stdout.write(`· world: ${W.meshCount} drawn meshes → ${W.triCount.toLocaleString()} world triangles ` +
    `(${W.spill.length} oversize on the spill list)  ${((Date.now() - t0) / 1000).toFixed(1)}s\n`);
  process.stdout.write(`· coins: ${propsCount} adopted from Props + ${trailCount} authored on the route = ` +
    `${spots.length} drawn — every one tested\n`);

  /* The self-exclusion, as a fact rather than a hope: how many soup triangles belong to a coin
     mesh. If this is 0 the name changed and every clearance below is measured against the wrong
     world. */
  let selfTris = 0;
  for (let t = 0; t < W.owner.length; t++) if (SELF.has(W.names[W.owner[t]])) selfTris++;
  process.stdout.write(`· self-exclusion: ${selfTris.toLocaleString()} soup triangles belong to a coin mesh ` +
    `(${[...SELF].join(', ')}) and are skipped\n`);
  if (!selfTris) throw new Error('coinfit: 0 coin triangles found in the soup — the mesh names changed');

  const results = {};
  for (const r of radii) {
    const C = coinGeom(r);
    const swept = Math.hypot(r, C.t / 2);      // the ball the spin sweeps
    process.stdout.write(`\n${'='.repeat(104)}\n  r = ${r}   t = ${C.t.toFixed(5)}   diameter ${(r * 2).toFixed(4)} m` +
      `   ${C.triCount} tris\n  pose envelope: spin a full turn about Y (swept ball radius ${swept.toFixed(5)} m)` +
      `  bob ±${TUNE.bobAmp} m   ${YAWS} yaws x ${BOBS.length} bobs = ${YAWS * BOBS.length} poses each\n${'='.repeat(104)}\n`);

    /* §732 — the controls run FIRST, at this radius, and the census does not print if they fail.
       A number produced by an instrument that has not just demonstrated it can say both words is
       the thing §439 is about. */
    const ctl = controls(W, C);
    process.stdout.write(`  CONTROLS on \`${ctl.seed.mesh}\` tri ${ctl.seed.tri} (area ${ctl.seed.area.toFixed(4)} m², ` +
      `centroid ${ctl.seed.c.map((n) => n.toFixed(2)).join(',')}, n ${ctl.seed.n.map((n) => n.toFixed(2)).join(',')}):\n`);
    for (const k of ctl.out) {
      process.stdout.write(`    ${k.name.padEnd(11)} want ${k.want ? 'CROSS   ' : 'no cross'} ` +
        `got ${k.got ? 'CROSS   ' : 'no cross'} ${k.got === k.want ? 'OK ' : 'BAD'}   ` +
        `(${k.note || `${k.who || '—'}${Number.isFinite(k.clear) ? `, clear ${k.clear.toFixed(3)} m` : ', nothing within PAD'}`})\n`);
    }
    const failed = ctl.out.filter((k) => k.got !== k.want);
    if (failed.length) throw new Error(`coinfit: ${failed.length} control(s) failed — ${failed.map((k) => k.name).join(', ')}. ` +
      `The census is not printed: an instrument that cannot demonstrate both answers is not measuring.`);

    const rows = [];
    for (let si = 0; si < spots.length; si++) {
      const s = spots[si];
      const r2 = poseTest(W, C, s);
      rows.push({ i: si, label: s.label, spot: [s.x, s.y, s.z], cross: r2.cross, clear: r2.clear, who: r2.who, pose: r2.pose });
    }

    const bad = rows.filter((r) => r.cross);
    /* Print the crossings in full, then the tightest clear placements — 82 rows of "clear" is
       not a report, it is a wall. */
    if (bad.length) {
      process.stdout.write(`  CROSSINGS (${bad.length}/${rows.length}):\n`);
      for (const b of bad) {
        process.stdout.write(`   ${String(b.i).padStart(3)}  ${b.label.padEnd(20)} ` +
          `(${b.spot.map((n) => n.toFixed(1)).join(', ').padEnd(22)})  CROSSES ${b.who}   [${b.cross.pose}]\n`);
      }
    } else {
      process.stdout.write(`  no crossings\n`);
    }
    const clear = rows.filter((r) => !r.cross).sort((a, b) => a.clear - b.clear).slice(0, 12);
    process.stdout.write(`  TIGHTEST CLEAR PLACEMENTS:\n`);
    for (const c of clear) {
      process.stdout.write(`   ${String(c.i).padStart(3)}  ${c.label.padEnd(20)} ` +
        `(${c.spot.map((n) => n.toFixed(1)).join(', ').padEnd(22)})  ` +
        `${c.clear === Infinity ? `> ${PAD.toFixed(2)} m (nothing that close)` : `${c.clear.toFixed(3)} m  (${c.who})`}\n`);
    }
    process.stdout.write(`\n  VERDICT r=${r}: ${bad.length ? `${bad.length}/${rows.length} INTERPENETRATE` : `${rows.length}/${rows.length} clear of world geometry`}\n`);
    results[r] = rows;
    /* `JSON=<path>` writes the full per-placement table. The printed report deliberately shows
       only the crossings and the twelve tightest — 82 rows of "clear" is a wall, not a report —
       and picking a camera subject or quoting a margin needs all 82. */
    if (process.env.JSON) {
      const out = process.env.JSON.replace('{r}', String(r));
      fs.writeFileSync(out, JSON.stringify(rows.map((x) => ({
        i: x.i, label: x.label, x: x.spot[0], y: x.spot[1], z: x.spot[2],
        cross: x.cross ? x.cross.who : null, clear: Number.isFinite(x.clear) ? x.clear : null, who: x.who,
      }))));
      process.stdout.write(`  wrote ${out}\n`);
    }
  }

  /* The delta is the whole point when more than one radius was run. */
  const keys = Object.keys(results);
  if (keys.length > 1) {
    const a = results[keys[0]], b = results[keys[keys.length - 1]];
    const newCross = b.filter((r, i) => r.cross && !a[i].cross);
    const goneCross = a.filter((r, i) => r.cross && !b[i].cross);
    process.stdout.write(`\n${'='.repeat(104)}\n  DELTA  r=${keys[0]} → r=${keys[keys.length - 1]}\n${'='.repeat(104)}\n`);
    process.stdout.write(`  crossings: ${a.filter((r) => r.cross).length} → ${b.filter((r) => r.cross).length}` +
      `   (${newCross.length} new, ${goneCross.length} resolved)\n`);
    for (const n of newCross) {
      process.stdout.write(`   NEW  ${String(n.i).padStart(3)}  ${n.label.padEnd(20)} CROSSES ${n.cross.who}\n`);
    }
    /* Worst clearance loss among the placements that stayed clear. */
    const lost = a.map((r, i) => ({ i, label: r.label, from: r.clear, to: b[i].clear }))
      .filter((d) => Number.isFinite(d.from) && Number.isFinite(d.to) && !b[d.i].cross)
      .sort((x, y) => (x.to - x.from) - (y.to - y.from)).slice(0, 8);
    process.stdout.write(`  biggest clearance losses among placements that stayed clear:\n`);
    for (const l of lost) {
      process.stdout.write(`   ${String(l.i).padStart(3)}  ${l.label.padEnd(20)} ${l.from.toFixed(3)} → ${l.to.toFixed(3)} m` +
        `  (${(l.to - l.from >= 0 ? '+' : '')}${(l.to - l.from).toFixed(3)})\n`);
    }
  }
  return results;
}

export { coinSpots, coinGeom, readRoute, worldSoup };

/* ---- CLI. Guarded so the probes above can be imported without running an 82-coin sweep. ---- */
if (process.argv[1] && process.argv[1].endsWith('coinfit.mjs')) {
  const rs = process.argv.slice(2).map(Number).filter((n) => n > 0);
  await run(rs.length ? rs : [TUNE.coinRadius, +(TUNE.coinRadius * 1.5).toFixed(6)]);
  process.exit(0);
}
