/* Localise tools/void.mjs's into-void first hits, and apply the facing test its own comment
 * describes but does not implement.
 *
 * void.mjs counts a hit as soon as the first-hit POINT lands inside a shell's void volume.
 * Its loop comment says the real leak condition is stricter — "the ray that reaches the
 * *inside* of a leaf — a face pointing away from the camera" — but no facing test is applied,
 * so a reveal pier or niche back that legitimately stands in the void is counted too.
 *
 * This prints, per hit: world position, owning mesh, the hit triangle's geometric normal
 * dotted with the ray direction, and the shell. dot > 0 = backface = the camera is seeing the
 * inside of a leaf = a genuine seal leak. dot < 0 = a front face = legitimate occupancy.
 */
import * as THREE from 'three';
import { buildLevel } from '../../tools/lvl.mjs';
import { SHOTS } from '../../src/core/Shots.js';

const { A } = await buildLevel();

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
    if (S.pass && Math.abs(p.x - S.x) <= S.pass) continue;
    /* How far INSIDE the analytic void boundary the point sits. A hit a few centimetres in is
       the boundary model disagreeing with a settled/chipped block, not stone missing. */
    return [S.n, Math.min(hw - Math.abs(p.x - S.x), hd - Math.abs(p.z - S.z))];
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
const triNormal = (T) => {
  const ax=T[3]-T[0], ay=T[4]-T[1], az=T[5]-T[2];
  const bx=T[6]-T[0], by=T[7]-T[1], bz=T[8]-T[2];
  const nx=ay*bz-az*by, ny=az*bx-ax*bz, nz=ax*by-ay*bx;
  const L=Math.hypot(nx,ny,nz)||1;
  return new THREE.Vector3(nx/L, ny/L, nz/L);
};

const W = 160, H = 90;
const names = ['hero','temple','dunes','courtyard','guard','night','interior','traversal','combat','sly-closeup'];
console.log(`${TRI.length} tris\n`);
let back = 0, front = 0;
for (const nm of names) {
  const s = SHOTS[nm]; if (!s) continue;
  const cam = new THREE.PerspectiveCamera(s.fov, 16/9, 0.1, 1000);
  cam.position.fromArray(s.pos); cam.lookAt(new THREE.Vector3().fromArray(s.target));
  cam.updateMatrixWorld(true);
  const o = cam.position.clone();
  for (let py=0; py<H; py++) for (let px=0; px<W; px++) {
    const ndc = new THREE.Vector3((px+0.5)/W*2-1, 1-(py+0.5)/H*2, 0.5);
    const d = ndc.unproject(cam).sub(o).normalize();
    const r = cast(o, d);
    if (r.n < 0) continue;
    const p = o.clone().addScaledVector(d, r.t);
    const v = inVoid(p);
    if (!v) continue;
    const nrm = triNormal(TRI[r.n]);
    const dot = nrm.dot(d);
    if (dot > 0) back++; else front++;
    console.log(`${nm.padEnd(12)} px(${String(px).padStart(3)},${String(py).padStart(2)})  `
      + `p=(${p.x.toFixed(2)}, ${p.y.toFixed(2)}, ${p.z.toFixed(2)})  dist=${r.t.toFixed(1)}  `
      + `n·d=${dot.toFixed(3)} ${dot > 0 ? 'BACKFACE(leak)' : 'frontface(occupied)'}  `
      + `depth-inside-boundary=${v[1].toFixed(3)}m  ${v[0]}  mesh=${NAME[r.n] || '(unnamed)'}`);
  }
}
console.log(`\nbackface (genuine leak): ${back}    frontface (legitimate occupancy): ${front}`);

/* ---- CONTROL (§128.3): the facing test must be able to SEE a backface ----
 * Origin placed inside each shell's void, casting outward. The first hit must be the inside
 * of a leaf, i.e. a backface, n·d > 0. If this control does not produce backfaces, the
 * facing test above is not measuring what it claims and its "0 leaks" is worthless. */
console.log(`\n=== CONTROL: rays cast from INSIDE the void, outward ===`);
let cb = 0, cf = 0, cm = 0;
for (const S of SHELLS) {
  const y = (S.y0 + Math.min(S.y1, S.y0 + 6)) / 2;
  const o = new THREE.Vector3(S.x + (S.pass ? S.pass + 1.0 : 0), y, S.z);
  let b = 0, f = 0, miss = 0;
  for (const d of [[1,0,0],[-1,0,0],[0,0,1],[0,0,-1],[0.7,0,0.7],[-0.7,0,-0.7]]) {
    const dir = new THREE.Vector3(...d).normalize();
    const r = cast(o, dir, 60);
    if (r.n < 0) { miss++; continue; }
    const dot = triNormal(TRI[r.n]).dot(dir);
    if (dot > 0) b++; else f++;
  }
  cb += b; cf += f; cm += miss;
  console.log(`  ${S.n.padEnd(14)} from (${o.x.toFixed(1)},${o.y.toFixed(1)},${o.z.toFixed(1)}): backface ${b}, frontface ${f}, miss ${miss}`);
}
console.log(`CONTROL TOTAL: backface ${cb}, frontface ${cf}, miss ${cm}`);
console.log(cb > 0
  ? `CONTROL PASSES — the facing test does detect backfaces, so "0 leaks" above is meaningful.`
  : `CONTROL FAILS — the facing test never reports a backface; do not trust the leak count.`);
