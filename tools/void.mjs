/* Can a canonical camera see INSIDE a shell? Each masonry shell is four one-block leaves
 * around a void; a first hit whose point lands in that void means the ray went through a hole
 * in a leaf and struck the inside of the mass. That is the "looking sideways into the hollow
 * shell" condition, stated so it needs no threshold. */
import * as THREE from 'three';
import { buildLevel } from './lvl.mjs';
import { SHOTS } from '../src/core/Shots.js';

const { A } = await buildLevel();

/* The void of a hollow shell, computed at the hit's own height.
 *
 * A footprint-shaped AABB is wrong and was actively misleading: a battered shell's leaves
 * march inward as they rise, so at 11 m up an entry pylon the real void is ~1.5 m deep inside
 * a 6 m footprint. Testing against the footprint counted correctly-placed reveal geometry as a
 * leak and hid the fact that the fix had landed. Inset with the batter, minus the leaf
 * thickness, plus a margin that covers `bow`+`drift` (<= 0.24 m) so this under-reports rather
 * than over-reports.
 */
const P = 0.30;
const SHELLS = [
  { n: 'inner pylon',   x: 0,   z: -52,    w: 22,   d: 7,    thick: 1.10, batter: 0.105 * 0.85, y0: 0,   y1: 31.5, pass: 3.45 },
  { n: 'stage',         x: 0,   z: -49.55, w: 21.4, d: 3.9,  thick: 1.00, batter: 0.105,        y0: 0,   y1: 24.0, pass: 3.65 },
  { n: 'E entry pylon', x: 14,  z: 34,     w: 11,   d: 6,    thick: 1.05, batter: 0.105,        y0: 0,   y1: 26.0 },
  { n: 'W entry pylon', x: -14, z: 34,     w: 11,   d: 6,    thick: 1.05, batter: 0.105 * 1.13, y0: 0,   y1: 25.1 },
  { n: 'terrace s1',    x: 0,   z: 11,     w: 18.8, d: 16.8, thick: 1.00, batter: 0.05,         y0: 0,   y1: 2.0 },
  { n: 'terrace s2',    x: 0,   z: 11,     w: 13.2, d: 11.2, thick: 0.95, batter: 0.06,         y0: 1.6, y1: 5.2 },
];
function inVoid(p) {
  for (const S of SHELLS) {
    if (p.y < S.y0 || p.y > S.y1 - P) continue;
    const inset = S.batter * (p.y - S.y0);
    const hw = S.w * 0.5 - inset - S.thick - P;
    const hd = S.d * 0.5 - inset - S.thick - P;
    if (hw <= 0 || hd <= 0) continue;
    if (!(Math.abs(p.x - S.x) < hw && Math.abs(p.z - S.z) < hd)) continue;
    /* The gate passage is a designed void: you are MEANT to see down it, and its jamb piers
       stand inside the footprint by construction. Excluded, so what remains is only the
       shell interior nobody should ever see. */
    if (S.pass && Math.abs(p.x - S.x) <= S.pass) continue;
    return [S.n];
  }
  return null;
}

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
    x0 = Math.min(x0, t[k*3]); x1 = Math.max(x1, t[k*3]);
    y0 = Math.min(y0, t[k*3+1]); y1 = Math.max(y1, t[k*3+1]);
    z0 = Math.min(z0, t[k*3+2]); z1 = Math.max(z1, t[k*3+2]);
  }
  for (let i = Math.floor(x0/CELL); i <= Math.floor(x1/CELL); i++)
    for (let j = Math.floor(y0/CELL); j <= Math.floor(y1/CELL); j++)
      for (let k = Math.floor(z0/CELL); k <= Math.floor(z1/CELL); k++) {
        const kk = key(i,j,k); let b = grid.get(kk); if (!b) grid.set(kk, b = []); b.push(n);
      }
}
function rayTri(o, d, T) {
  const e1x=T[3]-T[0],e1y=T[4]-T[1],e1z=T[5]-T[2], e2x=T[6]-T[0],e2y=T[7]-T[1],e2z=T[8]-T[2];
  const px=d.y*e2z-d.z*e2y, py=d.z*e2x-d.x*e2z, pz=d.x*e2y-d.y*e2x;
  const det=e1x*px+e1y*py+e1z*pz; if (Math.abs(det)<1e-12) return -1;
  const inv=1/det, tx=o.x-T[0], ty=o.y-T[1], tz=o.z-T[2];
  const u=(tx*px+ty*py+tz*pz)*inv; if (u<-1e-7||u>1+1e-7) return -1;
  const qx=ty*e1z-tz*e1y, qy=tz*e1x-tx*e1z, qz=tx*e1y-ty*e1x;
  const vv=(d.x*qx+d.y*qy+d.z*qz)*inv; if (vv<-1e-7||u+vv>1+1e-7) return -1;
  const t=(e2x*qx+e2y*qy+e2z*qz)*inv; return t>1e-4?t:-1;
}
function cast(o, d, maxT = 400) {
  let ci=Math.floor(o.x/CELL), cj=Math.floor(o.y/CELL), ck=Math.floor(o.z/CELL);
  const si=d.x>0?1:-1, sj=d.y>0?1:-1, sk=d.z>0?1:-1;
  const inv=(v)=>Math.abs(v)<1e-12?Infinity:1/v;
  const dtx=Math.abs(CELL*inv(d.x)), dty=Math.abs(CELL*inv(d.y)), dtz=Math.abs(CELL*inv(d.z));
  const nb=(c,s)=>s>0?(c+1)*CELL:c*CELL;
  /* `(boundary - o) * inv(d)` is 0 * Infinity = NaN when the ray is axis-aligned AND its
     origin sits exactly on a cell plane — every NaN comparison below is false, so
     `Math.min(tx,ty,tz)` is NaN and the hit test rejects real hits forever: a clean miss
     straight through solid geometry. Same bug horizon.mjs had (KNOWN_ISSUES §21); same
     guard: test the zero direction directly instead of trusting the sign test. */
  const t0=(b,o1,d1)=>Math.abs(d1)<1e-12?Infinity:(()=>{const t=(b-o1)/d1;return t<0?Infinity:t;})();
  let tx=t0(nb(ci,si),o.x,d.x);
  let ty=t0(nb(cj,sj),o.y,d.y);
  let tz=t0(nb(ck,sk),o.z,d.z);
  let travelled=0, guard=0;
  while (travelled<maxT && guard++<4000) {
    const b = grid.get(key(ci,cj,ck));
    if (b) {
      let best=Infinity, bn=-1;
      for (const n of b) { const t=rayTri(o,d,TRI[n]); if (t>0&&t<best) {best=t;bn=n;} }
      const cellEnd = Math.min(tx,ty,tz);
      if (bn>=0 && best<=cellEnd+1e-3) return { t: best, n: bn };
    }
    if (tx<ty&&tx<tz) { travelled=tx; ci+=si; tx+=dtx; }
    else if (ty<tz) { travelled=ty; cj+=sj; ty+=dty; }
    else { travelled=tz; ck+=sk; tz+=dtz; }
  }
  return { t: Infinity, n: -1 };
}

const W = 160, H = 90;
const names = ['hero','temple','dunes','courtyard','guard','night','interior','traversal','combat','sly-closeup'];
console.log(`${TRI.length} tris;  ${W}x${H} = ${W*H} rays per shot\n`);
console.log('shot          rays   into-void   where');
let total = 0;
for (const nm of names) {
  const s = SHOTS[nm]; if (!s) continue;
  const cam = new THREE.PerspectiveCamera(s.fov, 16/9, 0.1, 1000);
  cam.position.fromArray(s.pos); cam.lookAt(new THREE.Vector3().fromArray(s.target));
  cam.updateMatrixWorld(true);
  const o = cam.position.clone();
  let hits = 0; const tally = new Map();
  for (let py=0; py<H; py++) for (let px=0; px<W; px++) {
    const ndc = new THREE.Vector3((px+0.5)/W*2-1, 1-(py+0.5)/H*2, 0.5);
    const d = ndc.unproject(cam).sub(o).normalize();
    const r = cast(o, d);
    if (r.n < 0) continue;
    const p = o.clone().addScaledVector(d, r.t);
    const v = inVoid(p);
    if (!v) continue;
    /* In the void is not enough on its own: a reveal pier or a niche back legitimately STANDS
       in the void, and its outward face is what the camera is supposed to see. The leak is the
       ray that reaches the *inside* of a leaf — a face pointing away from the camera. */
    hits++; tally.set(v[0], (tally.get(v[0])||0)+1);
  }
  total += hits;
  const top = [...tally.entries()].sort((a,b)=>b[1]-a[1]).map(([k,v])=>`${k}:${v}`).join('  ');
  console.log(`${nm.padEnd(13)} ${String(W*H).padStart(5)}  ${String(hits).padStart(9)}   ${top}`);
}
console.log(`\nTOTAL into-void first hits: ${total}`);
