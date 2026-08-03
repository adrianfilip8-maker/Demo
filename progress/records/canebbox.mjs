/* Print the cane's rasterised screen bbox per shot, so crops can be aimed at it. */
import * as THREE from 'three';
import { SHOTS } from '/home/user/Demo/src/core/Shots.js';
import { readPNG } from '/home/user/Demo/tools/png.mjs';
import fs from 'node:fs';
const warnings=[];
const engine={quality:'med',scene:new THREE.Scene(),debug:{},stats:{},warnings,warn:m=>warnings.push(m),get:()=>null,has:()=>false,on:()=>()=>{},emit:()=>{},registerCollider:()=>{}};
const {SlyModel}=await import('/home/user/Demo/src/player/SlyModel.js');
const {CLIPS,sampleInto,sampleCane}=await import('/home/user/Demo/src/player/Clips.js');
const {PoseBuffer}=await import('/home/user/Demo/src/player/Rig.js');
const sly=new SlyModel(engine); await sly.init();
const cane=sly.cane, caneBase=sly._canePivot.quaternion.clone();
const FRAMES=JSON.parse(fs.readFileSync('caneframes.json','utf8'));
for(const [name,info] of Object.entries(FRAMES)){
  const shot=SHOTS[name]; if(!shot||!fs.existsSync(info.file)) continue;
  const im=readPNG(info.file), W=im.w,H=im.h;
  const clip=CLIPS[shot.player.pose], t=clip.hold??0;
  const pb=new PoseBuffer(sly.boneNames).clear(); sampleInto(clip,t,pb,1);
  for(const n of sly.boneNames){const b=sly.bones[n];if(!b)continue;
    if(pb.w[n]>0)b.quaternion.copy(pb.q[n]);else b.quaternion.identity();
    if(pb.sw[n]>0)b.scale.copy(pb.s[n]);else b.scale.set(1,1,1);}
  const hb=sly.bp('hips'); sly.bones.hips.position.set(hb.x+pb.pos.x,hb.y+pb.pos.y,hb.z+pb.pos.z);
  const q=new THREE.Quaternion(); if(!sampleCane(clip,t,q))q.identity();
  sly._canePivot.quaternion.copy(q).multiply(caneBase);
  sly.root.updateMatrixWorld(true);
  const cam=new THREE.PerspectiveCamera(shot.fov??50,W/H,0.1,2000);
  cam.position.fromArray(shot.pos); cam.up.set(0,1,0);
  cam.lookAt(new THREE.Vector3().fromArray(shot.target));
  if(shot.roll)cam.rotateZ(THREE.MathUtils.degToRad(shot.roll));
  cam.updateMatrixWorld(true); cam.updateProjectionMatrix();
  const vp=new THREE.Matrix4().multiplyMatrices(cam.projectionMatrix,cam.matrixWorldInverse);
  const pos=cane.mesh.geometry.attributes.position, mw=cane.mesh.matrixWorld;
  const yaw=shot.player.yaw??0,cy=Math.cos(yaw),sy=Math.sin(yaw),[px,py,pz]=shot.player.pos;
  const v=new THREE.Vector3(),p=new THREE.Vector4();
  let x0=1e9,y0=1e9,x1=-1e9,y1=-1e9,nb=0,nf=0;
  for(let i=0;i<pos.count;i++){
    v.fromBufferAttribute(pos,i).applyMatrix4(mw);
    const wx=px+v.x*cy+v.z*sy, wy=py+v.y, wz=pz-v.x*sy+v.z*cy;
    p.set(wx,wy,wz,1).applyMatrix4(vp);
    if(p.w<=1e-6){nb++;continue;} nf++;
    const sx=(p.x/p.w*0.5+0.5)*W, syy=(1-(p.y/p.w*0.5+0.5))*H;
    x0=Math.min(x0,sx);x1=Math.max(x1,sx);y0=Math.min(y0,syy);y1=Math.max(y1,syy);
  }
  if(!nf){console.log(`${name.padEnd(13)} ALL ${nb} verts BEHIND LENS`);continue;}
  const inFrame = x1>0&&y1>0&&x0<W&&y0<H;
  console.log(`${name.padEnd(13)} ${String(W)}x${H}  bbox x[${x0.toFixed(0)},${x1.toFixed(0)}] y[${y0.toFixed(0)},${y1.toFixed(0)}]  ${(x1-x0).toFixed(0)}x${(y1-y0).toFixed(0)}px  behind=${nb}  ${inFrame?'':'OFF-FRAME'}`);
}
