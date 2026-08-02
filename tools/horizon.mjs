/**
 * Can a canonical camera see the desert past the enclosure?
 *
 * This exists because a raise was justified with an elevation angle — "at 12.5 m the wall top
 * sits 6.56° above the eye line and the horizon is gone" — and an elevation angle proves the
 * wall is TALL ENOUGH, not that nothing sees past it. The temenos is a stepped run with a
 * collapsed breach at h=0, two segments well under the full height, and `gapChance` fallen
 * blocks. Any of those can hand the eye a horizon the tallest segment would have hidden.
 *
 * Threshold-free criterion, so there is nothing to tune:
 *
 *   Cast one ray per frustum sample. If it hits architecture it is BLOCKED. If it hits nothing
 *   and points at or below horizontal (d.y <= 0) it must descend to the desert floor, so the
 *   ground beyond the enclosure is what that pixel shows. If it hits nothing and points up it
 *   shows sky, which above a wall is not a defect.
 *
 * A descending miss is then charged to the surface it escaped through: the ray is marched to
 * the first court-envelope plane it crosses and the crossing is reported with its height, so
 * "over the wall", "through the breach" and "out of the south entry" are separated rather than
 * summed. A descending miss that reaches y=0 while still INSIDE the envelope never left the
 * court — that is a hole in the paving, a different defect, and it is reported apart from the
 * horizon count rather than inflating it.
 *
 * Architecture only (tools/lvl.mjs), which is what makes this a lower bound: TERRAIN's dunes
 * are not here to occlude an escaping ray. That is the harmless direction — a dune standing in
 * an escaped ray is still the desert beyond the enclosure, still not the enclosure.
 *
 * `floorGap` is reported but is NOT a defect count for the same reason: it is rays that reach
 * y=0 inside the court without meeting paving, and TERRAIN's sand is under all of it in the
 * real render. It is here only to keep those rays out of the horizon number.
 *
 *   node tools/horizon.mjs [--w 160] [--h 90] [shot ...]
 */
import * as THREE from 'three';
import { buildLevel } from './lvl.mjs';
import { SHOTS } from '../src/core/Shots.js';

const argv = process.argv.slice(2);
const opt = (n, d) => { const i = argv.indexOf(`--${n}`); if (i === -1) return d; const v = argv[i + 1]; argv.splice(i, 2); return v; };
const W = parseInt(opt('w', '160'), 10);
const H = parseInt(opt('h', '90'), 10);

/* The court envelope. x/z are the outer faces of the enclosure the raise was meant to close:
   the temenos runs at x = ±25.6 with w 2.0, so its outer face is ±26.6. South is the entry
   axis at the pylon line, north is the hall's south wall. A ray leaving through any of these
   has left the court. */
const ENV = { x: 26.6, zS: 35.5, zN: -53.0 };

const { A, warnings } = await buildLevel();
if (warnings.length) for (const w of warnings) console.log(`  ! ${w}`);

/* ---- world-space triangle soup + a uniform grid, same shape as tools/void.mjs ---- */
const TRI = [], NAME = [];
{
  const v = new THREE.Vector3();
  A.root.updateMatrixWorld(true);
  A.root.traverse((o) => {
    if (!o.isMesh || o.visible === false) return;
    const g = o.geometry; if (!g?.attributes?.position) return;
    const pos = g.attributes.position, idx = g.index;
    const n = idx ? idx.count : pos.count, inst = o.isInstancedMesh ? o.count : 1;
    const m = new THREE.Matrix4();
    for (let ii = 0; ii < inst; ii++) {
      if (o.isInstancedMesh) { o.getMatrixAt(ii, m); m.premultiply(o.matrixWorld); } else m.copy(o.matrixWorld);
      for (let i = 0; i < n; i += 3) {
        const t = new Float32Array(9);
        for (let k = 0; k < 3; k++) {
          const vi = idx ? idx.getX(i + k) : i + k;
          v.fromBufferAttribute(pos, vi).applyMatrix4(m);
          t[k * 3] = v.x; t[k * 3 + 1] = v.y; t[k * 3 + 2] = v.z;
        }
        TRI.push(t); NAME.push(o.name);
      }
    }
  });
}

const CELL = 4.0, grid = new Map(), key = (i, j, k) => `${i},${j},${k}`;
for (let n = 0; n < TRI.length; n++) {
  const t = TRI[n];
  let x0 = 1e9, y0 = 1e9, z0 = 1e9, x1 = -1e9, y1 = -1e9, z1 = -1e9;
  for (let k = 0; k < 3; k++) {
    x0 = Math.min(x0, t[k * 3]); x1 = Math.max(x1, t[k * 3]);
    y0 = Math.min(y0, t[k * 3 + 1]); y1 = Math.max(y1, t[k * 3 + 1]);
    z0 = Math.min(z0, t[k * 3 + 2]); z1 = Math.max(z1, t[k * 3 + 2]);
  }
  for (let i = Math.floor(x0 / CELL); i <= Math.floor(x1 / CELL); i++)
    for (let j = Math.floor(y0 / CELL); j <= Math.floor(y1 / CELL); j++)
      for (let k = Math.floor(z0 / CELL); k <= Math.floor(z1 / CELL); k++) {
        const kk = key(i, j, k); let b = grid.get(kk); if (!b) grid.set(kk, b = []); b.push(n);
      }
}

function rayTri(o, d, T) {
  const e1x = T[3] - T[0], e1y = T[4] - T[1], e1z = T[5] - T[2];
  const e2x = T[6] - T[0], e2y = T[7] - T[1], e2z = T[8] - T[2];
  const px = d.y * e2z - d.z * e2y, py = d.z * e2x - d.x * e2z, pz = d.x * e2y - d.y * e2x;
  const det = e1x * px + e1y * py + e1z * pz; if (Math.abs(det) < 1e-12) return -1;
  const inv = 1 / det, tx = o.x - T[0], ty = o.y - T[1], tz = o.z - T[2];
  const u = (tx * px + ty * py + tz * pz) * inv; if (u < -1e-7 || u > 1 + 1e-7) return -1;
  const qx = ty * e1z - tz * e1y, qy = tz * e1x - tx * e1z, qz = tx * e1y - ty * e1x;
  const vv = (d.x * qx + d.y * qy + d.z * qz) * inv; if (vv < -1e-7 || u + vv > 1 + 1e-7) return -1;
  const t = (e2x * qx + e2y * qy + e2z * qz) * inv; return t > 1e-4 ? t : -1;
}

function cast(o, d, maxT = 600) {
  let ci = Math.floor(o.x / CELL), cj = Math.floor(o.y / CELL), ck = Math.floor(o.z / CELL);
  const si = d.x > 0 ? 1 : -1, sj = d.y > 0 ? 1 : -1, sk = d.z > 0 ? 1 : -1;
  const inv = (v) => Math.abs(v) < 1e-12 ? Infinity : 1 / v;
  const dtx = Math.abs(CELL * inv(d.x)), dty = Math.abs(CELL * inv(d.y)), dtz = Math.abs(CELL * inv(d.z));
  const nb = (c, s) => s > 0 ? (c + 1) * CELL : c * CELL;
  /* `(boundary - o) * inv(d)` is 0 * Infinity = NaN when the ray is axis-aligned AND its origin
     sits exactly on a cell plane — and every NaN comparison below is false, so the walk falls
     into the z branch, sets travelled = NaN, and `travelled < maxT` ends the loop on its first
     iteration. The cast then reports a clean miss through solid geometry. It cost a wall
     profile that read as holed at exactly every 4.0 m, i.e. at CELL. Guard the zero directly
     rather than relying on the sign test to catch it. */
  const t0 = (b, o1, d1) => (Math.abs(d1) < 1e-12 ? Infinity : (() => { const t = (b - o1) / d1; return t < 0 ? Infinity : t; })());
  let tx = t0(nb(ci, si), o.x, d.x);
  let ty = t0(nb(cj, sj), o.y, d.y);
  let tz = t0(nb(ck, sk), o.z, d.z);
  let travelled = 0, guard = 0;
  while (travelled < maxT && guard++ < 6000) {
    const b = grid.get(key(ci, cj, ck));
    if (b) {
      let best = Infinity, bn = -1;
      for (const n of b) { const t = rayTri(o, d, TRI[n]); if (t > 0 && t < best) { best = t; bn = n; } }
      const cellEnd = Math.min(tx, ty, tz);
      if (bn >= 0 && best <= cellEnd + 1e-3) return { t: best, n: bn };
    }
    if (tx < ty && tx < tz) { travelled = tx; ci += si; tx += dtx; }
    else if (ty < tz) { travelled = ty; cj += sj; ty += dty; }
    else { travelled = tz; ck += sk; tz += dtz; }
  }
  return { t: Infinity, n: -1 };
}

/** Where does a descending miss leave the court? Analytic — no marching, no tolerance. */
function exitCorridor(o, d) {
  let best = Infinity, side = null;
  const test = (t, s) => { if (t > 1e-6 && t < best) { best = t; side = s; } };
  if (d.x > 0) test((ENV.x - o.x) / d.x, 'temenos E');
  if (d.x < 0) test((-ENV.x - o.x) / d.x, 'temenos W');
  if (d.z > 0) test((ENV.zS - o.z) / d.z, 'south entry');
  if (d.z < 0) test((ENV.zN - o.z) / d.z, 'north hall');
  /* The floor plane. If the ray reaches y=0 before any side plane it never left the court:
     that is a gap in the paving, not a horizon. */
  if (d.y < 0) test((0 - o.y) / d.y, 'floor (inside court)');
  if (!side) return null;
  const p = { x: o.x + d.x * best, y: o.y + d.y * best, z: o.z + d.z * best };
  return { side, t: best, p };
}

/* The enclosure's real skyline, read off the built geometry rather than off the plan. The plan
   jitters every segment length and height, so the only trustworthy statement about what the
   wall actually does at a given z is a ray fired straight down at it. */
function wallProfile(x, z0, z1, step = 0.5) {
  const rows = [];
  const down = new THREE.Vector3(0, -1, 0);
  for (let z = z0; z <= z1; z += step) {
    let top = 0;
    /* Three probes across the 2.0 m thickness: a single centre ray can drop through the hollow
       shell's core and report the floor. */
    for (const dx of [-0.6, 0, 0.6]) {
      const o = new THREE.Vector3(x + dx, 30, z);
      const r = cast(o, down, 40);
      if (r.n >= 0) top = Math.max(top, 30 - r.t);
    }
    rows.push([z, top]);
  }
  return rows;
}

if (argv.includes('--profile')) {
  argv.splice(argv.indexOf('--profile'), 1);
  for (const [side, x] of [['W', -25.6], ['E', 25.6]]) {
    const rows = wallProfile(x, -15.5, 33.5);
    const tops = rows.map((r) => r[1]);
    console.log(`\ntemenos ${side} (x=${x}) skyline, z -15.5..33.5:`);
    console.log(`  min ${Math.min(...tops).toFixed(2)}  max ${Math.max(...tops).toFixed(2)}  ` +
      `mean ${(tops.reduce((a, b) => a + b, 0) / tops.length).toFixed(2)}`);
    /* Any run below eye height is where a standing camera can see over. */
    const low = rows.filter((r) => r[1] < 5.6);
    if (low.length) {
      console.log(`  BELOW the courtyard eye (5.6 m) at z: ` +
        low.map((r) => `${r[0].toFixed(1)}(${r[1].toFixed(1)})`).join(' '));
    }
    let bar = '';
    for (let i = 0; i < rows.length; i += 2) bar += ' .:-=+*#%@'[Math.min(9, Math.round(rows[i][1] / 1.4))];
    console.log(`  ${bar}`);
  }
}

/* A temenos crossing has to be charged to the right cause: "over the wall" from a 14 m rooftop
   camera is not an enclosure failure and must not be summed with "through the wall", which is.
   The wall's own extent along z — outside it there is no wall to be over or through. */
const RUN = { z0: -15.5, z1: 33.5 };
/* The wall top at the crossing's OWN z, probed on demand rather than looked up in a 0.25 m
   grid. The grid was the last source of misclassification: the breach edge is a hard step from
   12.5 m to 0, its z is jittered, and any nearest-sample lookup charges rays on the open side
   of that step to the solid side of it. Memoised at centimetre resolution — there are only a
   few hundred distinct crossings per shot, so exactness is affordable here. */
const TOPMEMO = new Map();
function wallTopAt(side, z) {
  if (z < RUN.z0 || z > RUN.z1) return null;          // past the end of the run
  const k = `${side}|${z.toFixed(2)}`;
  let top = TOPMEMO.get(k);
  if (top === undefined) {
    const x = side === 'temenos W' ? -25.6 : 25.6;
    top = 0;
    const down = new THREE.Vector3(0, -1, 0);
    for (const dx of [-0.6, -0.3, 0, 0.3, 0.6]) {
      const r = cast(new THREE.Vector3(x + dx, 30, z), down, 40);
      if (r.n >= 0) top = Math.max(top, 30 - r.t);
    }
    TOPMEMO.set(k, top);
  }
  return top;
}
/* A crossing is only charged as a hole if it clears the local top by more than the wall's own
   top roughness. Calling every borderline ray a hole was the first version's mistake: it put
   16 of `hero`'s rays in a THROUGH-WALL bucket whose y range (8.99..9.23) sat inside the same
   band as its over-top rays (9.04..10.28), i.e. both sides of a top that is really ~9 m there
   because segment 2 of the plan is a low step, not the full 12.5 m. */
const ROUGH = 0.35;
function chargeCrossing(side, p) {
  if (!side.startsWith('temenos')) return side;
  const top = wallTopAt(side, p.z);
  if (top === null) return `${side} PAST-END`;
  if (p.y > top - ROUGH) return `${side} over-top`;
  return `${side} THROUGH-WALL`;
}

const names = argv.filter((a) => !a.startsWith('--'));
if (!names.length) names.push('courtyard', 'hero', 'guard', 'dunes', 'night', 'combat', 'traversal', 'temple', 'sly-closeup');

console.log(`${TRI.length} triangles;  ${W}x${H} = ${W * H} rays per shot`);
console.log(`envelope: |x| <= ${ENV.x}, z in [${ENV.zN}, ${ENV.zS}]\n`);

const out = {};
for (const nm of names) {
  const s = SHOTS[nm]; if (!s) { console.log(`${nm}: unknown shot`); continue; }
  const cam = new THREE.PerspectiveCamera(s.fov ?? 50, 16 / 9, 0.1, 1000);
  cam.position.fromArray(s.pos);
  cam.up.set(0, 1, 0);
  cam.lookAt(new THREE.Vector3().fromArray(s.target));
  if (s.roll) cam.rotateZ(THREE.MathUtils.degToRad(s.roll));
  cam.updateProjectionMatrix();
  cam.updateMatrixWorld(true);
  const o = cam.position.clone();

  let blocked = 0, sky = 0, ground = 0, floorGap = 0;
  const bySide = new Map();
  const heights = [];
  let bb = null;   // frame bbox of the horizon leak, in pixels
  for (let py = 0; py < H; py++) {
    for (let px = 0; px < W; px++) {
      const ndc = new THREE.Vector3((px + 0.5) / W * 2 - 1, 1 - (py + 0.5) / H * 2, 0.5);
      const d = ndc.unproject(cam).sub(o).normalize();
      const r = cast(o, d);
      if (r.n >= 0) { blocked++; continue; }
      if (d.y > 0) { sky++; continue; }
      const ex = exitCorridor(o, d);
      if (!ex || ex.side === 'floor (inside court)') { floorGap++; continue; }
      ground++;
      const cause = chargeCrossing(ex.side, ex.p);
      bySide.set(cause, (bySide.get(cause) || 0) + 1);
      heights.push({ ...ex.p, cause });
      if (!bb) bb = { x0: px, x1: px, y0: py, y1: py };
      else { bb.x0 = Math.min(bb.x0, px); bb.x1 = Math.max(bb.x1, px); bb.y0 = Math.min(bb.y0, py); bb.y1 = Math.max(bb.y1, py); }
    }
  }
  /* An enclosure can only fail for an eye it is supposed to enclose. `dunes` stands on the
     approach ridge at z 84 and is MEANT to show the desert; counting its rays as a leak would
     be scoring the shot against its own purpose. Reported either way, but flagged. */
  const inside = Math.abs(o.x) < ENV.x && o.z < ENV.zS && o.z > ENV.zN && o.y > 0;
  const pct = (100 * ground / (W * H)).toFixed(2);
  const sides = [...bySide.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}:${v}`).join('  ') || '—';
  console.log(`${nm.padEnd(13)} ${inside ? 'IN ' : 'out'} blocked ${String(blocked).padStart(5)}  sky ${String(sky).padStart(5)}  ` +
    `DESERT ${String(ground).padStart(5)} (${pct}%)  floorGap ${String(floorGap).padStart(4)}`);
  console.log(`${''.padEnd(13)}   exits: ${sides}`);
  if (heights.length) {
    /* Per cause, not pooled: a min..max over every crossing at once mixed a breach at z 9 with
       a rooftop overshoot at z −53 and described neither. */
    const byCause = new Map();
    for (const h of heights) { let a = byCause.get(h.cause); if (!a) byCause.set(h.cause, a = []); a.push(h); }
    for (const [c, list] of [...byCause.entries()].sort((a, b) => b[1].length - a[1].length)) {
      const ys = list.map((h) => h.y).sort((a, b) => a - b);
      const zs = list.map((h) => h.z).sort((a, b) => a - b);
      console.log(`${''.padEnd(13)}   ${c.padEnd(22)} n=${String(list.length).padStart(4)}  ` +
        `y ${ys[0].toFixed(2)}..${ys[ys.length - 1].toFixed(2)}  z ${zs[0].toFixed(1)}..${zs[zs.length - 1].toFixed(1)}`);
    }
    console.log(`${''.padEnd(13)}   frame bbox px x[${bb.x0}..${bb.x1}] y[${bb.y0}..${bb.y1}] of ${W}x${H}`);
  }
  out[nm] = {
    inside, blocked, sky, ground, floorGap, pct: +pct, sides: Object.fromEntries(bySide),
    crossings: heights.map((h) => ({ x: +h.x.toFixed(2), y: +h.y.toFixed(2), z: +h.z.toFixed(2) })).slice(0, 40),
  };
}

const enclosed = Object.entries(out).filter(([, v]) => v.inside).sort((a, b) => b[1].ground - a[1].ground);
console.log(`\nof the ${enclosed.length} cameras standing inside the enclosure, ` +
  `${enclosed.filter(([, v]) => v.ground > 0).length} see desert past it` +
  (enclosed.length && enclosed[0][1].ground > 0 ? `; worst ${enclosed[0][0]} at ${enclosed[0][1].pct}% of frame` : ''));
