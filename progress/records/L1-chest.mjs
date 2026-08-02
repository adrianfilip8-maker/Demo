/* L1 — swept-normal area of the SHIPPED belly loft vs the chunkAt slabs it replaced.
   Three arms; arm C is a CALIBRATION arm that must reproduce the recorded 72.1%
   before arms A/B are trusted. Pure geometry, no WebGL, no lock. */
import { rng } from '/home/user/Demo/src/core/Rand.js';
import { Bag, chunkAt, loft } from '/home/user/Demo/src/world/PropKit.js';

/* Same area-weighted normal clustering as scratchpad/form.mjs (0.9998 cos tolerance). */
function normalStats(parts) {
  const clusters = []; let total = 0;
  for (const p of parts) {
    const g = p.geo || p; if (!g?.attributes) continue;
    const pos = g.attributes.position, idx = g.index;
    const nTri = idx ? idx.count / 3 : pos.count / 3;
    for (let t = 0; t < nTri; t++) {
      const a = idx ? idx.getX(t*3) : t*3, b = idx ? idx.getX(t*3+1) : t*3+1, c = idx ? idx.getX(t*3+2) : t*3+2;
      const ax=pos.getX(a), ay=pos.getY(a), az=pos.getZ(a);
      const ux=pos.getX(b)-ax, uy=pos.getY(b)-ay, uz=pos.getZ(b)-az;
      const vx=pos.getX(c)-ax, vy=pos.getY(c)-ay, vz=pos.getZ(c)-az;
      const nx=uy*vz-uz*vy, ny=uz*vx-ux*vz, nz=ux*vy-uy*vx;
      const len=Math.hypot(nx,ny,nz); if(len<1e-12) continue;
      const area=len*0.5; total+=area;
      const d=[nx/len,ny/len,nz/len];
      let hit=null;
      for(const cl of clusters){ if(cl.n[0]*d[0]+cl.n[1]*d[1]+cl.n[2]*d[2]>0.9998){hit=cl;break;} }
      if(hit) hit.area+=area; else clusters.push({n:d,area});
    }
  }
  clusters.sort((x,y)=>y.area-x.area);
  const cum=k=>clusters.slice(0,k).reduce((s,c)=>s+c.area,0)/total;
  const tri=parts.reduce((s,p)=>{const g=p.geo||p;return s+(g.index?g.index.count/3:g.attributes.position.count/3);},0);
  return { tri, nClusters:clusters.length, top6:cum(6)*100, top12:cum(12)*100, top24:cum(24)*100, area:total };
}

const SECTIONS = [
  { z:-2.18, w:0.72, y0:0.84, top:1.82, n:2.4 },
  { z:-1.78, w:0.90, y0:0.84, top:2.06, n:2.3 },
  { z:-1.12, w:0.87, y0:0.84, top:2.00, n:2.4 },
  { z:-0.42, w:0.79, y0:0.84, top:1.89, n:2.6 },
  { z: 0.22, w:0.80, y0:0.84, top:1.93, n:2.6 },
  { z: 0.74, w:0.84, y0:0.84, top:2.16, n:2.7 },
  { z: 1.06, w:0.80, y0:0.84, top:2.32, n:3.6, spring:0.55 },
  { z: 1.26, w:0.70, y0:0.84, top:2.36, n:4.2, spring:0.60 },
];
const mk = (fn) => { const R = rng(12345); return fn(R); };

// A — the two chunkAt body slabs the loft replaced (pre-loft tree 1fbc137, verbatim params)
const A = mk(R => [
  chunkAt(-0.80,0.80,0.84,1.92,-2.05,0.95,{rng:R,jitter:0.025,taper:0.14,c:0.10}),
  chunkAt(-0.86,0.86,0.84,2.05,-2.15,-0.55,{rng:R,jitter:0.03,round:0.18,c:0.14}),
]);
// A3 — the THREE slabs the loft actually replaced. Statues.js's own comment beside the loft
// reads "haunch, barrel and chest as ONE lofted mass", and the pre-loft chest slab
// chunkAt(-0.78,0.78,1.60,2.30,0.35,1.20) is absent from the shipped sphinx. Params verbatim
// from d542055~1:src/world/Statues.js.
const A3 = mk(R => [
  chunkAt(-0.80,0.80,0.84,1.92,-2.05,0.95,{rng:R,jitter:0.025,taper:0.14,c:0.10}),
  chunkAt(-0.86,0.86,0.84,2.05,-2.15,-0.55,{rng:R,jitter:0.03,round:0.18,c:0.14}),
  chunkAt(-0.78,0.78,1.60,2.30,0.35,1.20,{rng:R,jitter:0.02,taper:-0.14,c:0.09}),
]);
// B — SHIPPED loft, belly at its default 0.06
const B = mk(R => [loft(SECTIONS,{arc:9,rng:R,wobble:0.035,capBack:true,capFront:true})]);
// C — CALIBRATION: the same loft with flat flanks (belly 0), must reproduce ~72.1%
const C = mk(R => [loft(SECTIONS,{arc:9,rng:R,wobble:0.035,capBack:true,capFront:true,belly:0})]);

const rows = { 'A  slabs x2 (stated control)':A, 'A3 slabs x3 (actually replaced)':A3, 'B  loft belly=0.06 (SHIPPED)':B, 'C  loft belly=0 (calibration)':C };
console.log('arm                             tris   clusters   top6%   top12%   top24%   swept(100-top6)');
for (const [k,v] of Object.entries(rows)) {
  const s = normalStats(v);
  console.log(`${k.padEnd(30)} ${String(s.tri).padStart(5)}   ${String(s.nClusters).padStart(6)}   ${s.top6.toFixed(1).padStart(5)}   ${s.top12.toFixed(1).padStart(6)}   ${s.top24.toFixed(1).padStart(6)}   ${(100-s.top6).toFixed(1).padStart(6)}`);
}
