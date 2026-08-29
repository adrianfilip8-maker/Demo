#!/usr/bin/env node
/**
 * coinmove.mjs — §732. Where should a buried coin GO?
 *
 * `tools/coinfit.mjs` says which of the 82 placements interpenetrate. It does not say what to do
 * about it, and the three wrong answers are all cheaper than the right one: shrink the coin,
 * turn its collision off, or push it 5 cm until the z-fighting stops. `coinfit`'s own POS-nudge
 * control exists to make the third one fail out loud — a coin 0.05 m out of a wall is still
 * 0.19 m inside it, because the swept radius is 0.2414.
 *
 * So this searches for a **legitimate nearby position** and reports the candidates with the two
 * numbers that decide between them:
 *
 *   CLEAR   the drawn-triangle clearance from `coinfit.poseTest` — the same predicate the census
 *           runs, imported rather than re-implemented (§439: a second copy would agree with the
 *           first by construction and prove nothing).
 *   STAND   whether the real `Collision` finds walkable ground under it at a height that puts a
 *           standing player's capsule CENTRE within reach — `Pickups.TUNE.grabHeight` 0.90 below
 *           the coin, `collect` 0.58, `magnet` 2.40.
 *
 * ── The two instruments are deliberately different, and §732 measured why it matters ─────────
 * The census reads DRAWN triangles; the runtime only has COLLIDERS. Those two sets disagree
 * hard in this level: of the 14 coins the drawn soup calls buried, `Collision.overlap` at the
 * coin's swept radius sees **7 not at all** (the hieroglyph walls, the granite, the KayKit body),
 * and it calls **4 of the 68 clear ones buried**. A relocation pass driven by colliders would
 * therefore move four good coins and leave seven bad ones exactly where they are. That is why
 * the placements this tool proposes are **authored into a table and re-verified by the census**,
 * rather than computed at runtime from the collider set.
 *
 * ── What this tool is NOT ────────────────────────────────────────────────────────────────────
 * It is a search, which is a model, and §435.4 is about exactly that: a probe written from my
 * picture of the level tests the picture. STAND is `groundCheck` plus arithmetic — it says a
 * point is 0.9 m over a walkable face, NOT that a player can get there. **The evidence that a
 * relocated coin is reachable is `tests/coinreach.test.mjs`, which walks a real `Controller`
 * with `input.move` until `Pickups.update` fires the collection.** This tool picks candidates
 * for that arm to shoot at.
 *
 *   node tools/coinmove.mjs                    # search around every crossing at the shipped r
 *   node tools/coinmove.mjs --json out.json    # also dump the candidate table
 *   MARGIN=0.30 node tools/coinmove.mjs        # a stricter "reads as placed" bar
 */
import './_domshim.mjs';
import * as THREE from 'three';
import fs from 'node:fs';
import { poseTest, coinGeom, coinSpots, worldSoup } from './coinfit.mjs';
import { TUNE } from '../src/world/Pickups.js';

const MARGIN = +(process.env.MARGIN || 0.25);   // clearance below which a coin still reads as clipped
const RINGS = [0.30, 0.45, 0.60, 0.80, 1.00, 1.25, 1.50, 2.00, 2.50, 3.00, 4.00];
const AZ = 24;
const DYS = [0, 0.35, -0.35, 0.70, -0.70, 1.10, -1.10, 1.60];
const KEEP = 6;

/** Walkable ground under a proposed coin, via the REAL collision set. */
function stand(collision, s) {
  /* Probe from the feet a standing player would have if the coin were at his capsule centre. */
  const feet = new THREE.Vector3(s.x, s.y - TUNE.grabHeight, s.z);
  const g = collision.groundCheck(feet, 0.34, 2.60);
  if (!g?.hit) return { ok: false, why: 'no ground within 2.6 m below grab height' };
  const drop = feet.y - g.y;                         // how far the floor is below the ideal feet
  const centre = new THREE.Vector3(s.x, g.y + TUNE.grabHeight, s.z);
  const d = centre.distanceTo(new THREE.Vector3(s.x, s.y, s.z));
  /* A capsule actually standing there, not a point: `overlap` at the player radius over the
     capsule's own span. A candidate inside a pillar reports ground and is unstandable. */
  let blocked = 0;
  for (const h of [0.35, 0.90, 1.45]) {
    const p = new THREE.Vector3(s.x, g.y + h, s.z);
    if (collision.overlap(p, 0.34, ['wall', 'ledge', 'misc']).length) blocked++;
  }
  return {
    ok: g.walkable && !blocked && d <= TUNE.magnet,
    walkable: !!g.walkable, groundY: g.y, tag: g.tag, drop, dist: d, blocked,
    why: !g.walkable ? `ground not walkable (slope ${((g.slope || 0) * 180 / Math.PI).toFixed(0)}°, tag ${g.tag})`
      : blocked ? `${blocked}/3 capsule samples inside a solid`
        : d > TUNE.magnet ? `coin ${d.toFixed(2)} m above the reachable capsule centre (magnet ${TUNE.magnet})`
          : 'ok',
  };
}

const { engine: _e, collision } = await (async () => {
  const m = await import('../tests/_moveset.mjs');
  return m.realWorld();
})();

process.stdout.write('· booting the drawn soup\n');
const W = await worldSoup();
const { spots } = await coinSpots();
const C = coinGeom(TUNE.coinRadius);
process.stdout.write(`· ${W.triCount.toLocaleString()} world triangles · ${spots.length} coins · ` +
  `r ${TUNE.coinRadius} · margin ${MARGIN} m\n\n`);

const buried = [];
for (let i = 0; i < spots.length; i++) {
  const r = poseTest(W, C, spots[i]);
  if (r.cross) buried.push({ i, ...spots[i], who: r.cross.who });
}
process.stdout.write(`${buried.length} placements interpenetrate. Searching each.\n`);

const table = [];
for (const b of buried) {
  const cands = [];
  for (const dy of DYS) {
    for (const rho of RINGS) {
      for (let a = 0; a < AZ; a++) {
        const th = (a / AZ) * Math.PI * 2;
        const s = { x: b.x + Math.cos(th) * rho, y: b.y + dy, z: b.z + Math.sin(th) * rho };
        const t = poseTest(W, C, s);
        if (t.cross || !(t.clear >= MARGIN)) continue;
        const st = stand(collision, s);
        cands.push({ s, clear: t.clear, who: t.who, st, d: Math.hypot(s.x - b.x, s.y - b.y, s.z - b.z) });
      }
      /* Nearest-first: once a ring has produced standable candidates there is no reason to walk
         further out for this dy. */
      if (cands.some((c) => c.st.ok && Math.abs(c.s.y - b.y - dy) < 1e-9 && c.d <= rho + 1e-6)) break;
    }
  }
  cands.sort((p, q) => (Number(q.st.ok) - Number(p.st.ok)) || (p.d - q.d));
  table.push({ ...b, cands: cands.slice(0, KEEP) });
  process.stdout.write(`\n${String(b.i).padStart(3)}  (${b.x.toFixed(2)}, ${b.y.toFixed(2)}, ${b.z.toFixed(2)})  buried in ${b.who}\n`);
  if (!cands.length) { process.stdout.write('     no candidate within 4 m clears by the margin — the whole neighbourhood is bad\n'); continue; }
  for (const c of cands.slice(0, KEEP)) {
    process.stdout.write(`     d ${c.d.toFixed(2)}  ->  (${c.s.x.toFixed(2)}, ${c.s.y.toFixed(2)}, ${c.s.z.toFixed(2)})  ` +
      `clear ${Number.isFinite(c.clear) ? c.clear.toFixed(3) : '>PAD'} (${c.who || '—'})  ` +
      `stand ${c.st.ok ? 'YES' : 'no '} — ${c.st.why}${c.st.ok ? ` [floor y ${c.st.groundY.toFixed(2)}, ${c.st.tag}]` : ''}\n`);
  }
}

const jsonAt = process.argv.indexOf('--json');
if (jsonAt >= 0 && process.argv[jsonAt + 1]) {
  fs.writeFileSync(process.argv[jsonAt + 1], JSON.stringify(table, null, 1));
  process.stdout.write(`\nwrote ${process.argv[jsonAt + 1]}\n`);
}
process.exit(0);
