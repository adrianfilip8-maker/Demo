import { displayL } from '/home/user/Demo/progress/records/tonecurve.mjs';
const srgb2lin=(c)=>(c<=0.04045?c/12.92:Math.pow((c+0.055)/1.055,2.4));
const hex2lin=(h)=>[srgb2lin(((h>>16)&255)/255),srgb2lin(((h>>8)&255)/255),srgb2lin((h&255)/255)];
const lum=(c)=>0.2126*c[0]+0.7152*c[1]+0.0722*c[2];
const SUN=hex2lin(0xffd9a0), keyRad=SUN.map(v=>v*3.30);
const SPECCOL=hex2lin(0xfffbe8);
let NEED=0; for(let s=0.01;s<40;s*=1.0002){ if(displayL([s,s,s])>=230){NEED=s;break;} }

// material class table: [name, albedoHex, uSpec, uGloss, matRough(scalar), uMetal]
// Architecture.mat() does NOT pass rough -> material roughness = TUNE.rough 0.62, modulated by ORM.g
const TUNE_ROUGH=0.62;
const M=[
 ['sandstone_block',  0xc9915a,0.14, 20, TUNE_ROUGH*0.86, 0],
 ['sandstone_worn',   0xb8845a,0.08, 14, TUNE_ROUGH*0.92, 0],
 ['limestone_polished',0xe0d0a8,0.32,46, TUNE_ROUGH*0.68, 0],
 ['granite_pink',     0xa9705c,0.42, 62, TUNE_ROUGH*0.26, 0],
 ['paving_courtyard', 0xcfa068,0.10, 16, TUNE_ROUGH*0.94, 0],
 ['hieroglyph_wall',  0xd6a874,0.16, 24, TUNE_ROUGH*0.86, 0],
 ['hieroglyph_gilded',0xdcae5e,0.55, 64, TUNE_ROUGH*0.70, 0.85],
 ['gold_leaf',        0xe8b942,0.95,110, TUNE_ROUGH*0.20, 0.85],
 ['bronze_dark',      0x6e5a34,0.62, 72, TUNE_ROUGH*0.28, 0.85],
 ['mudbrick',         0x9a6a44,0.05, 10, TUNE_ROUGH*0.99, 0],
 ['plaster_painted',  0xe4d3ab,0.18, 26, TUNE_ROUGH*0.78, 0],
 ['sly fur body',     0x2c4a7a,0.03,  9, TUNE_ROUGH*0.62, 0],
 ['sly cane gold',    0xe8b942,0.90, 96, TUNE_ROUGH*0.22, 1.0],
 ['sly eyewhite',     0xf2f2f2,0.00, 20, TUNE_ROUGH*0.62, 0],
 ['water(terrain)',   0x2f6f7a,0.06, 12, TUNE_ROUGH*0.09, 0],
];
function specPeak(uSpec,gloss,rough,metal,alb,keyCouple){
  const rgh=Math.min(Math.max(rough,0.03),1.0);
  const specStep=1.35;                       // ceiling of the quantiser
  const specAmt=uSpec*(1-0.75*rgh)*(1+2.4*metal);
  const tintNM=SPECCOL, tintM=[0,1,2].map(i=>alb[i]*2.0+SPECCOL[i]*0.25);
  const tint=[0,1,2].map(i=>tintNM[i]+(tintM[i]-tintNM[i])*metal);
  const L=keyCouple? keyRad : [1,1,1];
  const v=[0,1,2].map(i=>tint[i]*L[i]*specAmt*specStep);
  const glossP=Math.max(gloss*(1-0.6*rgh),4.0);
  return {v,glossP,rgh,specAmt};
}
console.log(`display L 230 needs scene ${NEED.toFixed(3)}; keyRad luma ${lum(keyRad).toFixed(3)}; bloomThreshold 2.20\n`);
console.log('material              rgh   glossP  halfAng(deg@sat)  spec NOW   L    spec xKEY    L    diff(lit)+spec NOW->KEY');
for(const [n,hex,us,g,r,m] of M){
  const alb=hex2lin(hex);
  const a=specPeak(us,g,r,m,alb,false), b=specPeak(us,g,r,m,alb,true);
  const ang=Math.acos(Math.pow(0.52,1/a.glossP))*180/Math.PI;
  const base=[0,1,2].map(i=>alb[i]*keyRad[i]*(m?0.20:1.0));
  const tN=[0,1,2].map(i=>base[i]+a.v[i]), tK=[0,1,2].map(i=>base[i]+b.v[i]);
  console.log(`${n.padEnd(20)} ${a.rgh.toFixed(3)}  ${a.glossP.toFixed(1).padStart(5)}   ${ang.toFixed(1).padStart(5)}   ${lum(a.v).toFixed(3).padStart(7)} ${displayL(a.v).toFixed(0).padStart(4)}  ${lum(b.v).toFixed(3).padStart(8)} ${displayL(b.v).toFixed(0).padStart(4)}   ${displayL(tN).toFixed(1).padStart(5)} -> ${displayL(tK).toFixed(1).padStart(5)}`);
}

/* ============================================================================================
 * CORRECTED, after the capture — two model INPUTS above were wrong, and the live material
 * census in shots/hilite2/arms.json is what found them. Recorded rather than silently fixed.
 *
 *  1. `rgh` was too LOW on every mapped material. ToonMaterial.js:1082 sets
 *     `roughness: o.roughnessMap ? 1.0 : o.rough` — three's own convention, material.roughness
 *     goes to 1 and the map carries the value — so `roughnessFactor = 1.0 * ormG`, NOT
 *     `TUNE.rough(0.62) * ormG`. The census confirms it: every architecture material reports
 *     `roughness: 1` with a roughness map, and only the map-less ones (Sly's rig mesh, kaykit
 *     props, sand rings, the pyramids) sit at 0.62. `packORM` writes roughness straight into G
 *     (box-downsampled by 2, no rescale), so ormG is the recipe's own `rough`.
 *     Direction of the error: the table above OVER-states the specular on every mapped
 *     material, because specAmt carries (1 - 0.75*rgh).
 *
 *  2. `sly cane gold` (uSpec 0.90 / gloss 96 / metal 1.0) IS NOT A MATERIAL IN THIS BUILD.
 *     The character in the scene is `slydlrig:mesh`, ONE material at the TUNE defaults
 *     (uSpec 0.25, gloss 32, rough 0.62, metal 0). SlyModel.js's per-part table is not what the
 *     traversed scene holds. So the brightest character row in the table above does not exist,
 *     and `sly-closeup` has no gold on the character to catch a highlight.
 * ========================================================================================== */
console.log('\n\nCORRECTED — rgh = ormG for mapped materials (material.roughness = 1.0), census-verified');
console.log('material              rgh   glossP  halfAng  spec NOW   L    spec x KEY   L    lit total NOW -> KEY');
const M2 = [
  ['sandstone_block',   0xc9915a, 0.14,  20, 0.93, 0],
  ['sandstone_worn',    0xb8845a, 0.08,  14, 0.97, 0],
  ['limestone_polished',0xe0d0a8, 0.32,  46, 0.62, 0],
  ['granite_pink',      0xa9705c, 0.42,  62, 0.48, 0],
  ['paving_courtyard',  0xcfa068, 0.10,  16, 0.95, 0],
  ['hieroglyph_wall',   0xd6a874, 0.16,  24, 0.86, 0],
  ['hieroglyph_gilded', 0xdcae5e, 0.55,  64, 0.55, 0.85],
  ['gold_leaf',         0xe8b942, 0.95, 110, 0.22, 0.85],
  ['bronze_dark',       0x6e5a34, 0.62,  72, 0.42, 0.85],
  ['mudbrick',          0x9a6a44, 0.05,  10, 0.99, 0],
  ['plaster_painted',   0xe4d3ab, 0.18,  26, 0.78, 0],
  ['ceiling_stars',     0x1f4f96, 0.20,  30, 0.80, 0.85],
  ['props gold (coins)',0xe8b942, 0.90,  96, 0.28, 0.85],
  ['slydlrig:mesh',     0x2c4a7a, 0.25,  32, 0.62, 0],
  ['sand_ring (terrain)',0xcfa068,0.06,  12, 0.62, 0],
];
for (const [n, hex, us, g, r, m] of M2) {
  const alb = hex2lin(hex);
  const a = specPeak(us, g, r, m, alb, false), b = specPeak(us, g, r, m, alb, true);
  const ang = Math.acos(Math.pow(0.52, 1 / a.glossP)) * 180 / Math.PI;
  const base = [0, 1, 2].map((i) => alb[i] * keyRad[i] * (m ? 0.20 : 1.0));
  const tN = [0, 1, 2].map((i) => base[i] + a.v[i]), tK = [0, 1, 2].map((i) => base[i] + b.v[i]);
  console.log(`${n.padEnd(20)} ${a.rgh.toFixed(3)}  ${a.glossP.toFixed(1).padStart(5)}   ${ang.toFixed(1).padStart(5)}  ${lum(a.v).toFixed(3).padStart(7)} ${displayL(a.v).toFixed(0).padStart(4)}  ${lum(b.v).toFixed(3).padStart(8)} ${displayL(b.v).toFixed(0).padStart(4)}   ${displayL(tN).toFixed(1).padStart(5)} -> ${displayL(tK).toFixed(1).padStart(5)}`);
}
