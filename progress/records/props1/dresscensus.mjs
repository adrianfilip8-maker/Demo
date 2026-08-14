/**
 * dresscensus.mjs — LOCK-FREE offline census of every geometry PROPS emits, in world space.
 *
 * Instrument, not a scorer: prints the numbers the PROPS bars are derived from so the
 * thresholds in PREREG-basketvary / PREREG-colossus can be registered against measured
 * baselines instead of guesses.
 *
 * How it sees individual props at all: `Props` merges every piece into per-material buckets
 * at the end of init(), so the built scene has no prop identity left. Every piece passes
 * through `Props.prototype._push(key, geo)` FIRST, already placed in world space, so the
 * census wraps that one method from outside — no src edit, nothing installed, no lock taken.
 *
 * DISCLOSURE (tools/lvl.mjs' own standing warning): this builder has NO TERRAIN, so anything
 * placed by ground height lands at y = 0 — the sphinx avenue in particular. The courtyard
 * dress and the two colossi are placed by absolute coordinates and are unaffected; no claim
 * here uses the avenue.
 *
 *   node progress/records/props1/dresscensus.mjs            # summary
 *   node progress/records/props1/dresscensus.mjs --json out.json
 */
import * as THREE from 'three';
import { SHOTS } from '../../../src/core/Shots.js';

const argv = process.argv.slice(2);
const opt = (n, d) => { const i = argv.indexOf(`--${n}`); if (i < 0) return d; const v = argv[i + 1]; argv.splice(i, 2); return v; };
const JSONOUT = opt('json', '');

/* ---- wrap Props._push before anything builds ---------------------------------------------- */
const { Props } = await import('../../../src/world/Props.js');
const PIECES = [];
const origPush = Props.prototype._push;
Props.prototype._push = function (key, geo) {
  if (geo?.attributes?.position) {
    if (!geo.boundingBox) geo.computeBoundingBox();
    const bb = geo.boundingBox;
    PIECES.push({
      i: PIECES.length, key,
      verts: geo.attributes.position.count,
      tris: (geo.index ? geo.index.count : geo.attributes.position.count) / 3,
      min: [bb.min.x, bb.min.y, bb.min.z], max: [bb.max.x, bb.max.y, bb.max.z],
    });
  }
  return origPush.call(this, key, geo);
};

const { buildLevel } = await import('../../../tools/lvl.mjs');
const { P } = await buildLevel({ withProps: true });
if (!P) throw new Error('no Props');

/* ---- signature: what makes two placed props "the same prop again" -------------------------- */
/* Rounded to 5 cm so rng jitter inside one builder call does not fake variety, and keyed by
   material + vertex count so two different builders can never collide. */
const R5 = (v) => Math.round(v / 0.05);
for (const p of PIECES) {
  p.w = p.max[0] - p.min[0]; p.h = p.max[1] - p.min[1]; p.d = p.max[2] - p.min[2];
  p.sig = `${p.key}|v${p.verts}|${R5(p.w)}x${R5(p.h)}x${R5(p.d)}`;
  p.cx = (p.min[0] + p.max[0]) / 2; p.cy = (p.min[1] + p.max[1]) / 2; p.cz = (p.min[2] + p.max[2]) / 2;
}

/* ---- per-shot frustum membership ----------------------------------------------------------- */
function frustumOf(s, W = 1280, H = 720) {
  const cam = new THREE.PerspectiveCamera(s.fov, W / H, 0.1, 600);
  cam.position.fromArray(s.pos);
  cam.lookAt(new THREE.Vector3().fromArray(s.target));
  if (s.roll) cam.rotateZ(THREE.MathUtils.degToRad(s.roll));
  cam.updateMatrixWorld(true); cam.updateProjectionMatrix();
  const f = new THREE.Frustum();
  f.setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse));
  return { f, cam };
}
const _box = new THREE.Box3();
const inShot = (p, fr) => fr.f.intersectsBox(_box.set(new THREE.Vector3(...p.min), new THREE.Vector3(...p.max)));

const SHOTNAMES = Object.keys(SHOTS);
const report = { total: PIECES.length, shots: {} };
console.log(`pieces emitted through _push: ${PIECES.length}`);

/* Global clone table: every signature with 2+ placements. */
const bySig = new Map();
for (const p of PIECES) { if (!bySig.has(p.sig)) bySig.set(p.sig, []); bySig.get(p.sig).push(p); }
const clones = [...bySig.entries()].filter(([, a]) => a.length >= 3).sort((a, b) => b[1].length - a[1].length);
console.log(`\ndistinct signatures: ${bySig.size}   signatures with >=3 placements: ${clones.length}`);
console.log('top 12 global clone families:');
for (const [sig, arr] of clones.slice(0, 12)) console.log(`  ${String(arr.length).padStart(4)}  ${sig}`);

console.log('\nper-shot: pieces in frustum / distinct sigs / largest identical family (count, sig)');
for (const nm of SHOTNAMES) {
  const fr = frustumOf(SHOTS[nm]);
  const inn = PIECES.filter((p) => inShot(p, fr));
  const m = new Map();
  for (const p of inn) m.set(p.sig, (m.get(p.sig) || 0) + 1);
  const top = [...m.entries()].sort((a, b) => b[1] - a[1])[0] || ['-', 0];
  const dupPieces = [...m.values()].filter((c) => c >= 2).reduce((s, c) => s + c, 0);
  report.shots[nm] = { in: inn.length, sigs: m.size, topCount: top[1], topSig: top[0], dupPieces };
  console.log(`  ${nm.padEnd(14)} in=${String(inn.length).padStart(5)} sigs=${String(m.size).padStart(4)} maxIdentical=${String(top[1]).padStart(3)}  ${top[0]}`);
}

/* ---- colossus block: pieces inside the two authored envelopes ------------------------------ */
const COL = [{ x: -9.5, z: 25 }, { x: 9.5, z: 25 }];
for (const c of COL) {
  const near = PIECES.filter((p) => Math.abs(p.cx - c.x) < 6 && Math.abs(p.cz - c.z) < 6 && p.cy > 1.5 && p.cy < 16);
  const tris = near.reduce((s, p) => s + p.tris, 0);
  console.log(`\ncolossus @x${c.x}: pieces ${near.length}  tris ${tris}  yspan ${Math.min(...near.map((p) => p.min[1])).toFixed(2)}..${Math.max(...near.map((p) => p.max[1])).toFixed(2)}`);
}

if (JSONOUT) {
  const { writeFileSync } = await import('node:fs');
  writeFileSync(JSONOUT, JSON.stringify({ report, pieces: PIECES }, null, 1));
  console.log(`\nwrote ${JSONOUT}`);
}
