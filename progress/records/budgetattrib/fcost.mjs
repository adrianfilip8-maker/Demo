/* One-off: what the 12 `frustumCulled = false` meshes cost in the frames that cannot see them. */
import * as THREE from 'three';
import { SHOTS } from '../src/core/Shots.js';
const warnings=[]; const built={};
const texStub={tex:()=>null,get:()=>null,material:()=>null,bundle:()=>null};
const engine={quality:'high',scene:new THREE.Scene(),debug:{},stats:{},warnings,settings:{shadowCascades:3,shadowMap:3072},
 warn:m=>warnings.push(m),has:()=>false,get:k=>(k==='textures'?texStub:built[k]||null),on:()=>()=>{},emit:()=>{},registerCollider:()=>{}};
const roots=[];
async function build(l,p,c,pick){try{const m=await import(p);const C=m[c];const i=new C(engine,built.terrain);await i.init?.();built[l]=i;const r=pick(i);if(r){r.updateMatrixWorld(true);roots.push([l,r]);}}catch(e){console.log(l,'fail',e.message.split('\n')[0]);}}
await build('architecture','../src/world/Architecture.js','Architecture',o=>o.root);
await build('props','../src/world/Props.js','Props',o=>o.group||o.root);
await build('terrain','../src/world/Terrain.js','Terrain',o=>o.group||o.root||o.mesh);
await build('guards','../src/ai/Guard.js','Guards',o=>o.group);
const tri=m=>{const g=m.geometry;if(!g?.attributes?.position)return 0;const n=g.index?g.index.count/3:g.attributes.position.count/3;return n*(m.isInstancedMesh?m.count:1);};
const always=[];
for(const [l,r] of roots) r.traverse(o=>{ if((!o.isMesh&&!o.isSkinnedMesh&&!o.isInstancedMesh)||o.frustumCulled!==false) return;
  const g=o.geometry; if(!g?.attributes?.position) return; if(!g.boundingSphere) g.computeBoundingSphere();
  always.push({name:`${l}/${o.name||'(anon)'}`,tris:tri(o),sphere:g.boundingSphere.clone().applyMatrix4(o.matrixWorld)}); });
console.log(`always-drawn meshes: ${always.length}, total ${Math.round(always.reduce((a,b)=>a+b.tris,0))} tris\n`);
const rows=[];
for(const sn of Object.keys(SHOTS).filter(k=>SHOTS[k]?.pos&&SHOTS[k]?.target)){
  const s=SHOTS[sn];
  const cam=new THREE.PerspectiveCamera(s.fov,1280/720,0.1,2000);
  cam.position.fromArray(s.pos); cam.lookAt(new THREE.Vector3(...s.target)); cam.updateMatrixWorld(true); cam.updateProjectionMatrix();
  const fr=new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(cam.projectionMatrix,cam.matrixWorldInverse));
  let d=0,t=0; for(const a of always) if(!fr.intersectsSphere(a.sphere)){d++;t+=a.tris;}
  rows.push([sn,d,t]);
}
rows.sort((a,b)=>b[2]-a[2]);
for(const [sn,d,t] of rows) console.log(`${sn.padEnd(13)} off-screen but drawn: ${String(d).padStart(2)} draws / ${String(Math.round(t)).padStart(6)} tris`);
