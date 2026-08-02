// dunes framing for the sphinx avenue flanks — pure math, no lock, no WebGL.
const C = [26.0, 19.5, 84.0], T = [-2.0, 9.0, 18.0], FOV = 42, W = 1280, H = 720;
const sub=(a,b)=>a.map((v,i)=>v-b[i]), len=v=>Math.hypot(...v),
      norm=v=>{const l=len(v);return v.map(x=>x/l)}, dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0),
      cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const fwd = norm(sub(T,C));
const right = norm(cross(fwd,[0,1,0]));
const up = cross(right,fwd);
const vHalf = FOV/2*Math.PI/180, aspect = W/H;
const hHalf = Math.atan(Math.tan(vHalf)*aspect);
const fy = (H/2)/Math.tan(vHalf);           // px per unit at unit depth
const SPH_Z=[40,46.3,52.6,58.9,65.2,71.5,77.8,84], SPH_X=7;
// body: local flank spans z -2.18..1.26 (len 3.44), y0 0.84 -> top ~2.36 (flank+arc 1.52)
const BODY_LEN=3.44, BODY_H=2.36-0.84, TOTAL_H=3.64;
console.log(`fov ${FOV} vert, half-angles: ${(vHalf*180/Math.PI).toFixed(1)}v ${(hHalf*180/Math.PI).toFixed(1)}h  aspect ${aspect.toFixed(3)}`);
console.log('side  z      dist   offax   inFrust  flank_len_px  flank_h_px  belly_band_px');
for (const sx of [1,-1]) for (const z of SPH_Z) {
  const P=[sx*SPH_X, 1.6, z];                     // mid-body height
  const d=sub(P,C), dist=len(d), dn=norm(d);
  const zc=dot(d,fwd);
  if (zc<=0) { console.log(`${sx>0?'+X':'-X'}   ${z}   behind camera`); continue; }
  const xc=dot(d,right), yc=dot(d,up);
  const ax=Math.atan2(xc,zc), ay=Math.atan2(yc,zc);
  const inF = Math.abs(ax)<hHalf && Math.abs(ay)<vHalf;
  const offax=Math.acos(dot(dn,fwd))*180/Math.PI;
  const px=fy/zc;                                  // px per metre at this depth (perp)
  // flank faces world ±Z; camera looks mostly -Z so foreshortening ~ |dot(flankNormal, viewdir)|
  const flankN=[0,0,1];
  const fore=Math.abs(dot(flankN, dn));            // 1 = face-on
  const lenpx=BODY_LEN*px*fore, hpx=BODY_H*px;
  // belly band: shrink = belly*(1-k)^1.7 with belly .06 -> lateral 6% of half-width .8 = .048 m
  // the gradient occupies the whole flank height below the spring line (spring .42)
  const bellyBand=BODY_H*0.42*px;
  console.log(`${sx>0?'+X':'-X'}   ${String(z).padEnd(5)} ${dist.toFixed(1).padStart(5)}  ${offax.toFixed(1).padStart(5)}°  ${inF?'  IN ':' out '}      ${lenpx.toFixed(0).padStart(4)}        ${hpx.toFixed(0).padStart(4)}       ${bellyBand.toFixed(0).padStart(4)}`);
}
