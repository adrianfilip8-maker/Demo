/* Mechanism test, independent of the disputed aggregate: how many DEGREES does the
   surface actually turn across a nominally-flat side face?
   §51.1 claims chamferBox pillows ~7 deg and a ruled flank turns exactly 0. */
import { rng } from '/home/user/Demo/src/core/Rand.js';
import { chunkAt, loft } from '/home/user/Demo/src/world/PropKit.js';
const SECTIONS=[
  {z:-2.18,w:0.72,y0:0.84,top:1.82,n:2.4},{z:-1.78,w:0.90,y0:0.84,top:2.06,n:2.3},
  {z:-1.12,w:0.87,y0:0.84,top:2.00,n:2.4},{z:-0.42,w:0.79,y0:0.84,top:1.89,n:2.6},
  {z: 0.22,w:0.80,y0:0.84,top:1.93,n:2.6},{z: 0.74,w:0.84,y0:0.84,top:2.16,n:2.7},
  {z: 1.06,w:0.80,y0:0.84,top:2.32,n:3.6,spring:0.55},{z: 1.26,w:0.70,y0:0.84,top:2.36,n:4.2,spring:0.60}];

/* Area-weighted spread of triangle normals that face broadly +X (the flank). */
function flankSpread(geo,label){
  const pos=geo.attributes.position, idx=geo.index;
  const nTri=idx?idx.count/3:pos.count/3;
  const sel=[];
  for(let t=0;t<nTri;t++){
    const a=idx?idx.getX(t*3):t*3,b=idx?idx.getX(t*3+1):t*3+1,c=idx?idx.getX(t*3+2):t*3+2;
    const ax=pos.getX(a),ay=pos.getY(a),az=pos.getZ(a);
    const ux=pos.getX(b)-ax,uy=pos.getY(b)-ay,uz=pos.getZ(b)-az;
    const vx=pos.getX(c)-ax,vy=pos.getY(c)-ay,vz=pos.getZ(c)-az;
    let nx=uy*vz-uz*vy,ny=uz*vx-ux*vz,nz=ux*vy-uy*vx;
    const len=Math.hypot(nx,ny,nz); if(len<1e-12)continue;
    nx/=len;ny/=len;nz/=len;
    if(nx>0.70) sel.push({n:[nx,ny,nz],area:len*0.5});   // within ~45 deg of +X
  }
  if(!sel.length){console.log(`${label}: no +X-facing area`);return;}
  const A=sel.reduce((s,t)=>s+t.area,0);
  let mx=0,my=0,mz=0; for(const t of sel){mx+=t.n[0]*t.area;my+=t.n[1]*t.area;mz+=t.n[2]*t.area;}
  const ml=Math.hypot(mx,my,mz); mx/=ml;my/=ml;mz/=ml;
  let wsum=0,maxd=0;
  for(const t of sel){const d=Math.acos(Math.min(1,t.n[0]*mx+t.n[1]*my+t.n[2]*mz))*180/Math.PI;
    wsum+=d*t.area; if(d>maxd)maxd=d;}
  console.log(`${label.padEnd(34)} ${String(sel.length).padStart(4)} tris  area ${A.toFixed(2)}  mean turn ${(wsum/A).toFixed(2)} deg  max ${maxd.toFixed(2)} deg`);
}
// a body slab, exactly as the pre-loft tree built it
flankSpread(chunkAt(-0.80,0.80,0.84,1.92,-2.05,0.95,{rng:rng(12345),jitter:0.025,taper:0.14,c:0.10}),'chunkAt slab (pre-loft body)');
// and with jitter removed, to separate pillowing from jitter
flankSpread(chunkAt(-0.80,0.80,0.84,1.92,-2.05,0.95,{rng:rng(12345),jitter:0,taper:0.14,c:0.10}),'chunkAt slab, jitter=0');
flankSpread(loft(SECTIONS,{arc:9,rng:rng(12345),wobble:0,capBack:true,capFront:true,belly:0}),'loft flank, belly=0 wobble=0');
flankSpread(loft(SECTIONS,{arc:9,rng:rng(12345),wobble:0,capBack:true,capFront:true,belly:0.06}),'loft flank, belly=0.06 (SHIPPED)');
flankSpread(loft(SECTIONS,{arc:9,rng:rng(12345),wobble:0.035,capBack:true,capFront:true,belly:0.06}),'loft flank, shipped + wobble');
