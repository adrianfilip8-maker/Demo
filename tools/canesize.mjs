#!/usr/bin/env node
/* canesize — build the real Cane.js geometry in plain node and measure it.
 *
 * `Cane.js` -> `Body.js` -> `three` is all pure geometry: no WebGL, no DOM, no capture lock.
 * So the cane's true extent is measurable exactly rather than derived by hand from CANE_TUNE's
 * constants, which is what the drop-in scale factor has to be computed against.
 *
 * Reports both the authored default and the grip SlyModelDLRig actually solves for.
 */
import * as THREE from 'three';
import { Cane, CANE_TUNE } from '../src/player/Cane.js';

function measure(label, tune) {
  const c = new Cane(null, tune ? { tune } : {});
  c.build([new THREE.MeshBasicMaterial()]);
  const geo = c.mesh.geometry;
  geo.computeBoundingBox();
  const b = geo.boundingBox;
  console.log(`\n${label}`);
  console.log(`  tris ${c.triangles}`);
  console.log(`  bbox min [${b.min.x.toFixed(4)}, ${b.min.y.toFixed(4)}, ${b.min.z.toFixed(4)}]`);
  console.log(`  bbox max [${b.max.x.toFixed(4)}, ${b.max.y.toFixed(4)}, ${b.max.z.toFixed(4)}]`);
  console.log(`  extent  x ${(b.max.x - b.min.x).toFixed(4)}  y ${(b.max.y - b.min.y).toFixed(4)}  z ${(b.max.z - b.min.z).toFixed(4)}`);
  console.log(`  hookPoint ${JSON.stringify(c.hookPoint.toArray().map((v) => +v.toFixed(4)))}  tipPoint ${JSON.stringify(c.tipPoint.toArray().map((v) => +v.toFixed(4)))}`);
  return b;
}

console.log('CANE_TUNE:', JSON.stringify(CANE_TUNE));
const authored = measure('authored default (legacy SlyModel passes no tune)', null);
/* SlyModelDLRig solves gripR/shaftR off the glove; the shipped warn line reports ~ this range.
   Shape terms (dropBelowGrip, hookRadius, hookSweep) are NOT overridden, so length is fixed. */
const solved = measure('with a solved grip (gripR 0.0225, shaftR 0.0156) — DLRig-like', { gripR: 0.0225, shaftR: 0.0156 });

const L = authored.max.y - authored.min.y;
console.log(`\n=== drop-in scale, derived here rather than quoted ===`);
console.log(`  Cane.js y-extent            ${L.toFixed(4)} m`);
const GLB_RAW = 2.0000, GLB_NODE = 1.5904;
console.log(`  glb raw POSITION y-extent   ${GLB_RAW.toFixed(4)}`);
console.log(`  glb after node transform    ${GLB_NODE.toFixed(4)}  (node scale ${(GLB_NODE / GLB_RAW).toFixed(4)})`);
console.log(`  uniform scale needed, from raw   x${(L / GLB_RAW).toFixed(4)}`);
console.log(`  uniform scale needed, post-node  x${(L / GLB_NODE).toFixed(4)}`);
console.log(`  (PROVENANCE.md quotes ~1.30 m for CANE_TUNE and x0.817 post-node)`);
