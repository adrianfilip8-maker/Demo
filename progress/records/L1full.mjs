/* L1 over the WHOLE FIGURE — the population the recorded 82.1/72.1 pair used.
   Everything except the body is identical across arms, so it is held fixed by
   construction: build the shipped sphinx once, lift out its body part, and
   substitute each variant in turn. */
import { rng } from '/home/user/Demo/src/core/Rand.js';
import { chunkAt, loft } from '/home/user/Demo/src/world/PropKit.js';
import { sphinx } from '/home/user/Demo/src/world/Statues.js';

function normalStats(parts){
  const clusters=[]; let total=0;
  for(const p of parts){ const g=p.geo||p; if(!g?.attributes) continue;
    const pos=g.attributes.position, idx=g.index;
    const nTri=idx?idx.count/3:pos.count/3;
    for(let t=0;t<nTri;t++){
      const a=idx?idx.getX(t*3):t*3,b=idx?idx.getX(t*3+1):t*3+1,c=idx?idx.getX(t*3+2):t*3+2;
      const ax=pos.getX(a),ay=pos.getY(a),az=pos.getZ(a);
      const ux=pos.getX(b)-ax,uy=pos.getY(b)-ay,uz=pos.getZ(b)-az;
      const vx=pos.getX(c)-ax,vy=pos.getY(c)-ay,vz=pos.getZ(c)-az;
      const nx=uy*vz-uz*vy,ny=uz*vx-ux*vz,nz=ux*vy-uy*vx;
      const len=Math.hypot(nx,ny,nz); if(len<1e-12) continue;
      const area=len*0.5; total+=area; const d=[nx/len,ny/len,nz/len];
      let hit=null; for(const cl of clusters){if(cl.n[0]*d[0]+cl.n[1]*d[1]+cl.n[2]*d[2]>0.9998){hit=cl;break;}}
      if(hit)hit.area+=area; else clusters.push({n:d,area});
    }}
  clusters.sort((x,y)=>y.area-x.area);
  const cum=k=>clusters.slice(0,k).reduce((s,c)=>s+c.area,0)/total;
  const tri=parts.reduce((s,p)=>{const g=p.geo||p;return s+(g.index?g.index.count/3:g.attributes.position.count/3);},0);
  return {tri,top6:cum(6)*100,top12:cum(12)*100,top24:cum(24)*100};
}
const SECTIONS=[
  {z:-2.18,w:0.72,y0:0.84,top:1.82,n:2.4},{z:-1.78,w:0.90,y0:0.84,top:2.06,n:2.3},
  {z:-1.12,w:0.87,y0:0.84,top:2.00,n:2.4},{z:-0.42,w:0.79,y0:0.84,top:1.89,n:2.6},
  {z: 0.22,w:0.80,y0:0.84,top:1.93,n:2.6},{z: 0.74,w:0.84,y0:0.84,top:2.16,n:2.7},
  {z: 1.06,w:0.80,y0:0.84,top:2.32,n:3.6,spring:0.55},{z: 1.26,w:0.70,y0:0.84,top:2.36,n:4.2,spring:0.60}];

const bag = sphinx({ rng: rng(12345), worn: 0.5 });
const triOf = p => { const g=p.geo||p; return g.index?g.index.count/3:g.attributes.position.count/3; };
const bodyIdx = bag.parts.findIndex(p => triOf(p) === 240);
console.log(`shipped sphinx: ${bag.parts.length} parts, body part at index ${bodyIdx} (${bodyIdx>=0?240:'NOT FOUND'} tris)`);
const rest = bag.parts.filter((_,i)=>i!==bodyIdx);
const R2=rng(999);
const slabs=[chunkAt(-0.80,0.80,0.84,1.92,-2.05,0.95,{rng:R2,jitter:0.025,taper:0.14,c:0.10}),
             chunkAt(-0.86,0.86,0.84,2.05,-2.15,-0.55,{rng:R2,jitter:0.03,round:0.18,c:0.14})];
const flat=[loft(SECTIONS,{arc:9,rng:rng(12345),wobble:0.035,capBack:true,capFront:true,belly:0})];
const arms={
 'A  full figure, OLD slab body':[...rest,...slabs],
 'B  full figure, SHIPPED belly loft':bag.parts,
 'C  full figure, flat loft (calib)':[...rest,...flat],
};
console.log('\narm                                  tris    top6%   top12%   top24%   swept(100-top6)');
for(const[k,v] of Object.entries(arms)){const s=normalStats(v);
  console.log(`${k.padEnd(36)} ${String(s.tri).padStart(5)}   ${s.top6.toFixed(1).padStart(5)}   ${s.top12.toFixed(1).padStart(6)}   ${s.top24.toFixed(1).padStart(6)}   ${(100-s.top6).toFixed(1).padStart(6)}`);}
