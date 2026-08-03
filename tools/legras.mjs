/**
 * Lower-body silhouette metrics, RASTERISED.
 *
 * Supersedes the vertex-binned version (`legsil.mjs`, `bindgap.mjs`), which aliased: it took
 * min/max x over the VERTICES falling in each height band, and the leg loft has only 10 key
 * rings, so a band landing between two rings sampled a handful of interpolated-edge vertices and
 * reported a spuriously narrow leg and a spuriously wide gap. The tell was adjacent bands
 * reading 0.249 / 0.025 / 0.243 m of gap — geometry does not oscillate at 6 cm pitch, an
 * instrument does. Triangles fill the space between rings; vertices do not.
 *
 * Rasterises each part (legL, legR, tail, rest, cane) into its own coverage mask in a common
 * projection, then measures per SCANLINE. This is the same surface the §7.3 silhouette
 * condition is judged on.
 *
 * GAP (§11) — the pipeline suffix NOT implemented here:
 *   - **No foot IK.** freezePose() sets _ikW=1 and Rig.footIK() re-solves both legs before a
 *     frame is drawn. Everything below the knee is the AUTHORED clip pose, not the drawn pose.
 *   - **No ink hull.** The inverted-hull shell adds ~2.5 px per edge in the real frame, which
 *     CLOSES gaps and WIDENS limbs. Every gap here is therefore an UPPER bound and every
 *     leg:tail width ratio a LOWER bound on how thin the legs read.
 *   - No level/occlusion, no shader, no PostFX.
 *
 *   node legras.mjs [clip:shot ...]
 */
import * as THREE from 'three';

const warnings = [];
const engine = {
  quality: 'med', scene: new THREE.Scene(), debug: {}, stats: {}, warnings,
  warn: (m) => warnings.push(m), get: () => null, has: () => false, on: () => () => {}, emit: () => {},
};
const { SlyModel, TUNE } = await import('/home/user/Demo/src/player/SlyModel.js');
const { CLIPS, sampleInto, sampleCane } = await import('/home/user/Demo/src/player/Clips.js');
const { PoseBuffer } = await import('/home/user/Demo/src/player/Rig.js');
const { SHOTS } = await import('/home/user/Demo/src/core/Shots.js');

const sly = new SlyModel(engine);
await sly.init();
const geo = sly.mesh.geometry;
const caneBaseQ = sly._canePivot ? sly._canePivot.quaternion.clone() : null;
const poseBuf = new PoseBuffer(sly.boneNames);

const LEGL = new Set(['upperLegL', 'lowerLegL', 'footL', 'toeL']);
const LEGR = new Set(['upperLegR', 'lowerLegR', 'footR', 'toeR']);
const TAILB = new Set(['tailA', 'tailB', 'tailC', 'tailD']);
const si = geo.attributes.skinIndex, sw = geo.attributes.skinWeight;
const boneNameOf = (i) => sly.mesh.skeleton.bones[i]?.name ?? '';
const vcls = new Uint8Array(si.count);   // 1 legL, 2 legR, 3 tail, 0 rest
for (let i = 0; i < si.count; i++) {
  let best = -1, bw = 0;
  for (let k = 0; k < 4; k++) { const w = sw.getComponent(i, k); if (w > bw) { bw = w; best = si.getComponent(i, k); } }
  const n = boneNameOf(best);
  vcls[i] = LEGL.has(n) ? 1 : LEGR.has(n) ? 2 : TAILB.has(n) ? 3 : 0;
}

function applyClip(name) {
  const clip = CLIPS[name]; if (!clip) return false;
  poseBuf.clear(); sampleInto(clip, clip.hold ?? 0, poseBuf, 1);
  for (const n of sly.boneNames) {
    const b = sly.bones[n]; if (!b) continue;
    if (poseBuf.w[n] > 0) b.quaternion.copy(poseBuf.q[n]); else b.quaternion.identity();
    if (poseBuf.sw[n] > 0) b.scale.copy(poseBuf.s[n]); else b.scale.set(1, 1, 1);
  }
  const base = sly.bp('hips');
  sly.bones.hips.position.set(base.x + poseBuf.pos.x, base.y + poseBuf.pos.y, base.z + poseBuf.pos.z);
  if (caneBaseQ) {
    const d = new THREE.Quaternion();
    if (sampleCane(clip, clip.hold ?? 0, d)) sly._canePivot.quaternion.copy(d).multiply(caneBaseQ);
    else sly._canePivot.quaternion.copy(caneBaseQ);
  }
  sly.root.updateMatrixWorld(true); sly.skeleton.update();
  return true;
}

const _sv = new THREE.Vector3(), _st = new THREE.Vector3(), _sm = new THREE.Matrix4();
function skin() {
  const pos = geo.attributes.position;
  const bones = sly.mesh.skeleton.bones, inv = sly.mesh.skeleton.boneInverses;
  const out = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    _st.set(0, 0, 0);
    for (let k = 0; k < 4; k++) {
      const w = sw.getComponent(i, k); if (w === 0) continue;
      const b = si.getComponent(i, k);
      _sm.multiplyMatrices(bones[b].matrixWorld, inv[b]);
      _sv.fromBufferAttribute(pos, i).applyMatrix4(_sm);
      _st.addScaledVector(_sv, w);
    }
    out[i*3] = _st.x; out[i*3+1] = _st.y; out[i*3+2] = _st.z;
  }
  return out;
}

function shotView(shotName) {
  const shot = SHOTS[shotName]; if (!shot?.player) return { phi: 0, elev: 0.09 };
  const p = shot.player.pos, c = shot.pos, yawW = shot.player.yaw ?? 0;
  const dx = c[0]-p[0], dy = c[1]-p[1], dz = c[2]-p[2];
  return { phi: Math.atan2(dx, dz) - yawW, elev: Math.atan2(dy, Math.hypot(dx, dz)) };
}

const RES = 1400;   // px across the figure's bbox: fine enough that 1 px << any feature
function run(clipName, shotName) {
  if (!applyClip(clipName)) { console.log(`no clip ${clipName}`); return; }
  const V = skin();
  const { phi, elev } = shotView(shotName);
  const yaw = -phi;
  const cy = Math.cos(yaw), sy = Math.sin(yaw), ce = Math.cos(elev), se = Math.sin(elev);
  const N = geo.attributes.position.count;
  const P = new Float64Array(N*2);
  let minX=1e9,maxX=-1e9,minY=1e9,maxY=-1e9;
  for (let i = 0; i < N; i++) {
    const x=V[i*3], y=V[i*3+1], z=V[i*3+2];
    const X = x*cy - z*sy, Z = x*sy + z*cy, Y = y*ce - Z*se;
    P[i*2]=X; P[i*2+1]=Y;
    if(X<minX)minX=X; if(X>maxX)maxX=X; if(Y<minY)minY=Y; if(Y>maxY)maxY=Y;
  }
  // cane verts, projected, for the "does the cane weld to a leg" question
  let caneP = null;
  if (sly.cane?.mesh) {
    const cg = sly.cane.mesh.geometry; sly.cane.mesh.updateMatrixWorld(true);
    const cp = cg.attributes.position, v = new THREE.Vector3();
    caneP = { P: new Float64Array(cp.count*2), idx: cg.index.array };
    for (let i = 0; i < cp.count; i++) {
      v.fromBufferAttribute(cp, i).applyMatrix4(sly.cane.mesh.matrixWorld);
      const X=v.x*cy - v.z*sy, Z=v.x*sy + v.z*cy, Y=v.y*ce - Z*se;
      caneP.P[i*2]=X; caneP.P[i*2+1]=Y;
      if(X<minX)minX=X; if(X>maxX)maxX=X; if(Y<minY)minY=Y; if(Y>maxY)maxY=Y;
    }
  }
  const pad=0.02; minX-=pad;maxX+=pad;minY-=pad;maxY+=pad;
  const W = RES, H = Math.round(RES*(maxY-minY)/(maxX-minX));
  const sx = (X)=> (X-minX)/(maxX-minX)*(W-1);
  const syf= (Y)=> (maxY-Y)/(maxY-minY)*(H-1);
  const mpp = (maxX-minX)/(W-1);   // metres per px

  const masks = { 1:new Uint8Array(W*H), 2:new Uint8Array(W*H), 3:new Uint8Array(W*H), 0:new Uint8Array(W*H), 9:new Uint8Array(W*H) };
  function tri(ax,ay,bx,by,cx2,cy2,m){
    const y0=Math.max(0,Math.floor(Math.min(ay,by,cy2))), y1=Math.min(H-1,Math.ceil(Math.max(ay,by,cy2)));
    const x0=Math.max(0,Math.floor(Math.min(ax,bx,cx2))), x1=Math.min(W-1,Math.ceil(Math.max(ax,bx,cx2)));
    const d=(by-cy2)*(ax-cx2)+(cx2-bx)*(ay-cy2); if(Math.abs(d)<1e-12) return;
    for(let y=y0;y<=y1;y++) for(let x=x0;x<=x1;x++){
      const px=x+0.5,py=y+0.5;
      const l1=((by-cy2)*(px-cx2)+(cx2-bx)*(py-cy2))/d;
      const l2=((cy2-ay)*(px-cx2)+(ax-cx2)*(py-cy2))/d;
      const l3=1-l1-l2;
      if(l1>=-1e-9&&l2>=-1e-9&&l3>=-1e-9) m[y*W+x]=1;
    }
  }
  const idx = geo.index.array;
  for (let i = 0; i < idx.length; i += 3) {
    const a=idx[i],b=idx[i+1],c=idx[i+2];
    // a triangle belongs to the part its majority of vertices belong to
    const cnt={}; for(const v of [a,b,c]) cnt[vcls[v]]=(cnt[vcls[v]]||0)+1;
    let part=0,bestn=0; for(const k in cnt) if(cnt[k]>bestn){bestn=cnt[k];part=+k;}
    tri(sx(P[a*2]),syf(P[a*2+1]),sx(P[b*2]),syf(P[b*2+1]),sx(P[c*2]),syf(P[c*2+1]),masks[part]);
  }
  if (caneP) for (let i=0;i<caneP.idx.length;i+=3){
    const a=caneP.idx[i],b=caneP.idx[i+1],c=caneP.idx[i+2];
    tri(sx(caneP.P[a*2]),syf(caneP.P[a*2+1]),sx(caneP.P[b*2]),syf(caneP.P[b*2+1]),sx(caneP.P[c*2]),syf(caneP.P[c*2+1]),masks[9]);
  }

  console.log(`\n================ ${clipName}  (view of shot ${shotName}) ================`);
  console.log(`raster ${W}x${H}, ${(mpp*1000).toFixed(2)} mm/px`);
  const rowSpan=(m,y)=>{let lo=-1,hi=-1;for(let x=0;x<W;x++)if(m[y*W+x]){if(lo<0)lo=x;hi=x;}return lo<0?null:[lo,hi];};
  const rowCount=(m,y)=>{let n=0;for(let x=0;x<W;x++)if(m[y*W+x])n++;return n;};

  // figure extent for reporting heights in metres
  const yToM=(y)=> maxY - y/(H-1)*(maxY-minY);
  console.log('\n  y(m)   legL_w  legR_w  legs_union  tail_w   gap    leg/tail');
  let gapMax=-1e9,gapAtY=0, sumU=0,sumT=0,nOv=0, maxLegW=0,maxTailW=0;
  for (let y = 0; y < H; y += Math.max(1,Math.round(H/40))) {
    const sL=rowSpan(masks[1],y), sR=rowSpan(masks[2],y), sT=rowSpan(masks[3],y);
    if(!sL&&!sR&&!sT) continue;
    const wL=sL?(sL[1]-sL[0])*mpp:0, wR=sR?(sR[1]-sR[0])*mpp:0, wT=sT?(sT[1]-sT[0])*mpp:0;
    let wU=0,gap=NaN;
    if(sL&&sR){ wU=(Math.max(sL[1],sR[1])-Math.min(sL[0],sR[0]))*mpp; gap=(Math.max(sL[0],sR[0])-Math.min(sL[1],sR[1]))*mpp; }
    else if(sL) wU=wL; else if(sR) wU=wR;
    if(wL>maxLegW)maxLegW=wL; if(wR>maxLegW)maxLegW=wR; if(wT>maxTailW)maxTailW=wT;
    if(sL&&sR&&gap>gapMax){gapMax=gap;gapAtY=yToM(y);}
    if(wU>0&&wT>0){sumU+=wU;sumT+=wT;nOv++;}
    console.log(`  ${yToM(y).toFixed(2).padStart(5)}  ${wL.toFixed(3).padStart(6)}  ${wR.toFixed(3).padStart(6)}    ${wU.toFixed(3).padStart(6)}   ${wT.toFixed(3).padStart(6)}  ${isNaN(gap)?'   -  ':gap.toFixed(3).padStart(6)}   ${wT>1e-6?(wU/wT).toFixed(2):'  -'}`);
  }
  console.log(`\n  widest single leg ${maxLegW.toFixed(3)}m   widest tail ${maxTailW.toFixed(3)}m   single-leg/tail ${(maxLegW/maxTailW).toFixed(2)}`);
  if(nOv) console.log(`  overlap bands ${nOv}: mean legs-union ${(sumU/nOv).toFixed(3)}m  mean tail ${(sumT/nOv).toFixed(3)}m  ratio ${(sumU/sumT).toFixed(2)}`);
  console.log(`  MAX CLEAR INTER-LEG GAP ${gapMax.toFixed(4)}m at y ${gapAtY.toFixed(2)}m` + (gapMax<=0?'   (legs never separate in this view)':''));

  // total silhouette area share
  const areaOf=(m)=>{let n=0;for(let i=0;i<m.length;i++)if(m[i])n++;return n;};
  const aL=areaOf(masks[1]),aR=areaOf(masks[2]),aT=areaOf(masks[3]),aO=areaOf(masks[0]),aC=areaOf(masks[9]);
  const tot=aL+aR+aT+aO;
  console.log(`  silhouette area: legs ${(100*(aL+aR)/tot).toFixed(1)}%  tail ${(100*aT/tot).toFixed(1)}%  rest ${(100*aO/tot).toFixed(1)}%  (cane ${aC}px separate)`);

  // does the cane weld to a leg? count rows where cane mask touches a leg mask with no white between
  let weld=0,caneRows=0;
  for(let y=0;y<H;y++){
    const sC=rowSpan(masks[9],y); if(!sC) continue; caneRows++;
    const sL=rowSpan(masks[1],y), sR=rowSpan(masks[2],y);
    for(const s of [sL,sR]) if(s){ const g=Math.max(sC[0],s[0])-Math.min(sC[1],s[1]); if(g<=1){weld++;break;} }
  }
  if(caneRows) console.log(`  cane rows ${caneRows}, welded to a leg in ${weld} (${(100*weld/caneRows).toFixed(0)}%)`);
}

const ARGS = process.argv.slice(2);
const PAIRS = ARGS.length ? ARGS.map(a=>a.split(':')) : [['idle_confident','sly-closeup'],['perch_idle','hero']];
for (const [c,s] of PAIRS) run(c, s);
