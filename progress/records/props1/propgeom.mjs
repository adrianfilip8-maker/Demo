/**
 * propgeom.mjs — the PROPS lane's LOCK-FREE offline geometry instrument.
 *
 * Measures, from a given `src/` root, every quantity the PROPS bars are stated in:
 *   A. the rope-coil clone family (PREREG-basketvary)
 *   C. the seated-colossus silhouette profile + knee ledge (PREREG-colossus)
 *   plus the shared protections: prop triangle total, collider/hazard/decal registrations.
 *
 * WHY IT NEEDS NO CAPTURE LOCK AND INSTALLS NOTHING (§186): it imports the world modules
 * directly and never boots the page, so a CANDIDATE is measured by pointing `--root` at a
 * COPY of src/ with the candidate applied. `src/` on disk is never written by this script,
 * so it cannot poison another lane's boot however long it runs or waits.
 *
 * How it sees individual props at all: `Props` merges every piece into per-material buckets,
 * so the built scene has no prop identity left. Every piece passes through
 * `Props.prototype._push(key, geo)` first, already in world space; the census wraps that one
 * method from outside.
 *
 * DISCLOSURE (tools/lvl.mjs' standing warning, restated because it bounds every number here):
 * this builder has NO TERRAIN, so anything placed by ground height lands at y = 0 — the
 * sphinx avenue in particular. Nothing measured here is placed by ground height: the rope
 * coils, the courtyard dress and the two colossi are all at absolute coordinates.
 *
 *   node progress/records/props1/propgeom.mjs [--root <dir containing world/>] [--json out]
 */
import * as THREE from 'three';
import { writeFileSync } from 'node:fs';
import path from 'node:path';

const argv = process.argv.slice(2);
const opt = (n, d) => { const i = argv.indexOf(`--${n}`); if (i < 0) return d; const v = argv[i + 1]; argv.splice(i, 2); return v; };
const ROOT = path.resolve(opt('root', path.resolve(import.meta.dirname, '../../../src')));
const JSONOUT = opt('json', '');
const U = (p) => new URL(`file://${path.join(ROOT, p)}`).href;

/* ---- build with a census wrapper + counting engine stub ----------------------------------- */
const { SHOTS } = await import(U('core/Shots.js'));
const { Props } = await import(U('world/Props.js'));
const { Architecture } = await import(U('world/Architecture.js'));

const PIECES = [];
const origPush = Props.prototype._push;
Props.prototype._push = function (key, geo) {
  if (geo?.attributes?.position) {
    geo.computeBoundingBox();
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

const REG = { colliders: [], hazards: 0, decals: 0 };
const warnings = [];
const engine = {
  quality: 'high', scene: new THREE.Scene(), debug: {}, stats: {}, warnings,
  warn: (m) => warnings.push(m), get: () => null, has: () => false,
  on: () => () => {}, emit: () => {},
  registerCollider: (m, o) => {
    let box = null;
    try {
      m.updateMatrixWorld?.(true);
      m.geometry?.computeBoundingBox?.();
      const bb = m.geometry?.boundingBox;
      if (bb) {
        const b = bb.clone().applyMatrix4(m.matrixWorld);
        box = [b.min.x, b.min.y, b.min.z, b.max.x, b.max.y, b.max.z].map((v) => +v.toFixed(3));
      }
    } catch { /* a collider we cannot box is still a collider — counted, not measured */ }
    REG.colliders.push({ tag: o?.tag ?? null, material: o?.material ?? null, climbable: !!o?.climbable, box });
  },
};
const A = new Architecture(engine); await A.init();
const P = new Props(engine); await P.init();
REG.decals = P.stats?.decals ?? null;

for (const p of PIECES) {
  p.w = p.max[0] - p.min[0]; p.h = p.max[1] - p.min[1]; p.d = p.max[2] - p.min[2];
  p.cx = (p.min[0] + p.max[0]) / 2; p.cy = (p.min[1] + p.max[1]) / 2; p.cz = (p.min[2] + p.max[2]) / 2;
  p.diag = Math.hypot(p.w, p.h, p.d);
}

/* ---- registered shot frusta ---------------------------------------------------------------- */
const SHOTNAMES = Object.keys(SHOTS);
const frustumOf = (s, W = 1280, H = 720) => {
  const cam = new THREE.PerspectiveCamera(s.fov, W / H, 0.1, 600);
  cam.position.fromArray(s.pos);
  cam.lookAt(new THREE.Vector3().fromArray(s.target));
  if (s.roll) cam.rotateZ(THREE.MathUtils.degToRad(s.roll));
  cam.updateMatrixWorld(true); cam.updateProjectionMatrix();
  const f = new THREE.Frustum();
  f.setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse));
  return f;
};
const _b3 = new THREE.Box3(), _v1 = new THREE.Vector3(), _v2 = new THREE.Vector3();
const inFrustum = (p, f) => f.intersectsBox(_b3.set(_v1.set(...p.min), _v2.set(...p.max)));

/* =========================== A. the rope-coil clone family ================================== */
/* SILHOUETTE SIGNATURE, registered form: material key + bbox extents rounded to 0.10 m. The
   0.10 m quantum is the readable-difference floor, not a tuning knob: at the courtyard camera
   a coil sits 13-18 m out, where 0.10 m subtends ~4 px — the smallest extent change that can
   alter the drawn silhouette at all. Vertex count is deliberately NOT in the signature: two
   coils with the same vertex count and different extents are different objects on screen, and
   two with different vertex counts and the same extents are the same object on screen. */
const S10 = (v) => Math.round(v / 0.10);
const sigOf = (p) => `${p.key}|${S10(p.w)}x${S10(p.h)}x${S10(p.d)}`;
/* The rope FAMILY = every piece in the `rope` bucket standing on the courtyard floor
   (y < 1.2). That is `ropeCoil` and only `ropeCoil` in HEAD; stated as a predicate rather than
   a vertex count so a candidate that re-models the coil is still measured by it. */
const isCoil = (p) => p.key === 'rope' && p.max[1] < 1.2;
const coils = PIECES.filter(isCoil);
for (const p of coils) p.sig = sigOf(p);

const A_out = { count: coils.length, perShot: {}, sigs: {}, diagCV: 0, maxIdenticalAnyShot: 0 };
{
  const m = new Map();
  for (const p of coils) m.set(p.sig, (m.get(p.sig) || 0) + 1);
  A_out.sigs = Object.fromEntries(m);
  const dg = coils.map((p) => p.diag);
  const mean = dg.reduce((s, v) => s + v, 0) / (dg.length || 1);
  const sd = Math.sqrt(dg.reduce((s, v) => s + (v - mean) ** 2, 0) / (dg.length || 1));
  A_out.diagMean = mean; A_out.diagCV = mean ? sd / mean : 0;
  for (const nm of SHOTNAMES) {
    const f = frustumOf(SHOTS[nm]);
    const inn = coils.filter((p) => inFrustum(p, f));
    const mm = new Map();
    for (const p of inn) mm.set(p.sig, (mm.get(p.sig) || 0) + 1);
    const top = Math.max(0, ...mm.values());
    A_out.perShot[nm] = { n: inn.length, maxIdentical: top };
    A_out.maxIdenticalAnyShot = Math.max(A_out.maxIdenticalAnyShot, top);
  }
}

/* =========================== C. the seated colossus ========================================= */
/* Envelope: the two authored landmarks (Props.L.colossus) plus the plinth top (colossusY 2.0).
   Everything below y 2.0 is ARCHITECTURE's throne block and is not this lane's to measure. */
const COL = [{ tag: 'west', x: -9.5, z: 25 }, { tag: 'east', x: 9.5, z: 25 }];
const C_out = {};
for (const c of COL) {
  /* Envelope: HW 2.62 + nemes 2.4 puts every part of the figure inside |dx| < 4.2, and the
     back pillar / foot span puts it inside dz in [-4.2, +4.6]. Tightened from a 6x7 box after
     the loose one caught a neighbouring prop on the east figure only and made the two front
     reliefs incomparable (2.13 vs 5.73 m of range on a mirrored pair). */
  const near = PIECES.filter((p) => Math.abs(p.cx - c.x) < 4.2 && (p.cz - c.z) > -4.2 && (p.cz - c.z) < 4.6 && p.cy > 1.9 && p.cy < 18);
  const y0 = 2.0, y1 = Math.max(...near.map((p) => p.max[1]));
  const N = 160, prof = [];
  for (let i = 0; i < N; i++) {
    const y = y0 + (y1 - y0) * (i + 0.5) / N;
    let xlo = Infinity, xhi = -Infinity, zlo = Infinity, zhi = -Infinity, hit = 0;
    for (const p of near) {
      if (y < p.min[1] || y > p.max[1]) continue;
      hit++;
      if (p.min[0] < xlo) xlo = p.min[0]; if (p.max[0] > xhi) xhi = p.max[0];
      if (p.min[2] < zlo) zlo = p.min[2]; if (p.max[2] > zhi) zhi = p.max[2];
    }
    prof.push({ y, w: hit ? xhi - xlo : 0, d: hit ? zhi - zlo : 0, zf: hit ? zhi : 0 });
  }
  /* INFLECTIONS: sign changes of the discrete slope of the extent profile, counted only where
     the run either side moves at least NOISE metres. A stack of slabs gives a short monotone
     staircase; a seated figure gives feet-knee-lap-waist-chest-shoulder-jaw-nemes. */
  const NOISE = 0.10;
  const inflections = (key) => {
    let n = 0, dir = 0, last = prof[0][key], acc = 0;
    for (let i = 1; i < prof.length; i++) {
      const dv = prof[i][key] - last; last = prof[i][key]; acc += dv;
      if (Math.abs(acc) < NOISE) continue;
      const s = Math.sign(acc);
      if (dir !== 0 && s !== dir) n++;
      dir = s; acc = 0;
    }
    return n;
  };
  /* FRONT-FACE RELIEF — the statistic the r11/r12 word "slab" actually names. zf(y) is how far
     forward the figure reaches at each height; on a crate it is a constant, on a seated figure
     it swings out at the feet, back at the shin, out again at the knee and away to the hip.
     Measured over the seat band y 2.0..6.6 (plinth top to hip) where the legs live. */
  const band = prof.filter((p) => p.y >= 2.0 && p.y <= 6.6 && p.zf !== 0);
  const zfm = band.reduce((s, p) => s + p.zf, 0) / (band.length || 1);
  const zfSd = Math.sqrt(band.reduce((s, p) => s + (p.zf - zfm) ** 2, 0) / (band.length || 1));
  const zfRange = band.length ? Math.max(...band.map((p) => p.zf)) - Math.min(...band.map((p) => p.zf)) : 0;

  /* KNEE LEDGE: an upward-facing surface at the spec height (§8.1 y ~ 4.5), landable — the
     0.68 m footprint floor is 2 x Controller.TUNE.radius 0.34, i.e. the capsule fits on it. */
  const kneeTops = near.filter((p) => p.max[1] >= 4.35 && p.max[1] <= 4.70 && p.w >= 0.68 && p.d >= 0.68);
  /* The knee's reach past the mass ABOVE it (hip/torso front at y = knee + 1.0). A knee that
     does not clear the body it belongs to cannot read as a knee, and cannot be stood on. */
  const frontAt = (y) => { let z = -Infinity; for (const p of near) if (y >= p.min[1] && y <= p.max[1]) z = Math.max(z, p.max[2]); return z === -Infinity ? null : z; };
  const above = frontAt(5.55);
  const kneeFrontZ = kneeTops.length ? Math.max(...kneeTops.map((p) => p.max[2])) : null;
  C_out[c.tag] = {
    pieces: near.length, tris: near.reduce((s, p) => s + p.tris, 0),
    top: y1, infW: inflections('w'), infD: inflections('d'),
    zfSd: +zfSd.toFixed(4), zfRange: +zfRange.toFixed(3),
    profW: prof.map((p) => +p.w.toFixed(3)), profD: prof.map((p) => +p.d.toFixed(3)),
    profZf: prof.map((p) => +p.zf.toFixed(3)),
    kneeTops: kneeTops.length, kneeTopY: kneeTops.map((p) => +p.max[1].toFixed(3)),
    kneeFrontZ: kneeFrontZ === null ? null : +kneeFrontZ.toFixed(3),
    hipFrontZ: above === null ? null : +above.toFixed(3),
    kneeReach: (kneeFrontZ === null || above === null) ? null : +(kneeFrontZ - above).toFixed(3),
  };
  /* REACHABLE: a registered `ledge` collider whose top plate is at the knee height and whose
     footprint overlaps the knee tops in plan. A decorative knee is a bug (mission (c)). */
  const led = REG.colliders.filter((k) => k.tag === 'ledge' && k.box
    && k.box[4] >= 4.30 && k.box[1] <= 4.75
    && k.box[0] < c.x + 6 && k.box[3] > c.x - 6 && k.box[2] < c.z + 8 && k.box[5] > c.z - 2);
  C_out[c.tag].kneeLedgeColliders = led.length;
  C_out[c.tag].kneeLedgeBoxes = led.map((k) => k.box);
  /* Does the registered collider actually sit under a knee top? (plan overlap, both ways) */
  C_out[c.tag].kneeLedgeCoversKnee = kneeTops.some((p) => led.some((k) =>
    k.box[0] <= p.max[0] && k.box[3] >= p.min[0] && k.box[2] <= p.max[2] && k.box[5] >= p.min[2]));
}
/* Asymmetry between the pair: how much of the west profile is NOT reproduced by the east. */
{
  const a = C_out.west.profW, b = C_out.east.profW;
  let diff = 0; for (let i = 0; i < a.length; i++) diff += Math.abs(a[i] - b[i]);
  C_out.pairProfileL1 = +(diff / a.length).toFixed(4);
}

/* =========================== shared protections ============================================= */
const PROT = {
  propTris: PIECES.reduce((s, p) => s + p.tris, 0),
  propPieces: PIECES.length,
  colliders: REG.colliders.length,
  colliderTags: REG.colliders.reduce((m, c) => (m[c.tag] = (m[c.tag] || 0) + 1, m), {}),
  decals: REG.decals,
  hazards: (P.stats?.hazards ?? null),
  fx: (P._fx?.length ?? null), lights: (P._lights?.length ?? null),
};

const out = { root: ROOT, A: A_out, C: C_out, PROT, warnings: warnings.length };
console.log(`root ${ROOT}`);
console.log(`\n[A] rope coils: n=${A_out.count}  distinct silhouettes=${Object.keys(A_out.sigs).length}  diag mean=${A_out.diagMean.toFixed(3)} CV=${A_out.diagCV.toFixed(4)}`);
console.log(`    signatures: ${JSON.stringify(A_out.sigs)}`);
for (const nm of SHOTNAMES) { const r = A_out.perShot[nm]; if (r.n) console.log(`      ${nm.padEnd(13)} inFrustum=${r.n}  maxIdentical=${r.maxIdentical}`); }
console.log(`    MAX identical in any registered shot: ${A_out.maxIdenticalAnyShot}`);
for (const t of ['west', 'east']) {
  const c = C_out[t];
  console.log(`\n[C] colossus ${t}: pieces=${c.pieces} tris=${c.tris} top=${c.top.toFixed(2)}  infW=${c.infW} infD=${c.infD}`);
  console.log(`     front relief over the seat band: sd=${c.zfSd} range=${c.zfRange} m`);
  console.log(`     kneeTops=${c.kneeTops} at y ${JSON.stringify(c.kneeTopY)} frontZ=${c.kneeFrontZ} hipFrontZ=${c.hipFrontZ} reach=${c.kneeReach} m`);
  console.log(`     ledge colliders at knee height: ${c.kneeLedgeColliders} coversKnee=${c.kneeLedgeCoversKnee} ${JSON.stringify(c.kneeLedgeBoxes)}`);
}
console.log(`[C] pair profile L1 (asymmetry): ${C_out.pairProfileL1} m`);
console.log(`\n[PROT] propTris=${PROT.propTris} pieces=${PROT.propPieces} colliders=${PROT.colliders} ${JSON.stringify(PROT.colliderTags)} decals=${PROT.decals} fx=${PROT.fx} lights=${PROT.lights}`);
if (JSONOUT) { writeFileSync(JSONOUT, JSON.stringify(out, null, 1)); console.log(`wrote ${JSONOUT}`); }
