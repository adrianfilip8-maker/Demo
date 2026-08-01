/* Is the documented route (§8.1 step 6: "out of the hall through the inner pylon gate") blocked
   by a collision proxy? Walks the gate centre-line and reports every `wall` proxy containing it. */
import * as THREE from 'three';
import { buildLevel } from './lvl.mjs';

const warnings = [];
const hits = [];
const { A } = await buildLevel();

const inv = new THREE.Matrix4(), lp = new THREE.Vector3();
function contains(mesh, p) {
  const g = mesh.geometry;
  if (!g.boundingBox) g.computeBoundingBox();
  inv.copy(mesh.matrixWorld).invert();
  lp.copy(p).applyMatrix4(inv);
  return g.boundingBox.containsPoint(lp);
}

A.proxyRoot.updateMatrixWorld(true);
const proxies = [];
A.proxyRoot.traverse((o) => { if (o.isMesh) proxies.push(o); });
console.log(`${proxies.length} collision proxies\n`);

const wall = proxies.filter((m) => m.name.startsWith('proxy:wall'));
const at = (x, y, z) => wall.filter((m) => contains(m, new THREE.Vector3(x, y, z))).length;

console.log('A. gate centre-line at y=1.0 (must be CLEAR — route step 6)');
for (let z = -46; z >= -58.01; z -= 1.0) console.log(`   z=${String(z).padStart(6)}  ${at(0,1.0,z) ? 'BLOCKED' : 'clear'}`);

console.log('\nB. inside the mass either side of the gate at y=1.0, z=-52 (must be BLOCKED)');
for (const x of [-10, -8, -6, -4.5, 4.5, 6, 8, 10]) console.log(`   x=${String(x).padStart(5)}  ${at(x,1.0,-52) ? 'BLOCKED' : 'CLEAR  <-- hole'}`);

console.log('\nC. above the gate head on the centre line, z=-52 (must be BLOCKED)');
for (const y of [9, 12, 18, 24, 30]) console.log(`   y=${String(y).padStart(3)}  ${at(0,y,-52) ? 'BLOCKED' : 'CLEAR  <-- hole'}`);

console.log('\nD. stage gate centre-line at y=1.0 (must be CLEAR)');
for (let z = -47.5; z >= -51.6; z -= 0.5) console.log(`   z=${String(z.toFixed(1)).padStart(6)}  ${at(0,1.0,z) ? 'BLOCKED' : 'clear'}`);

console.log('\nE. stage mass either side of its gate, y=1.0, z=-49.55 (must be BLOCKED)');
for (const x of [-9, -6, -4.5, 4.5, 6, 9]) console.log(`   x=${String(x).padStart(5)}  ${at(x,1.0,-49.55) ? 'BLOCKED' : 'CLEAR  <-- hole'}`);

console.log('\nF. outside the mass, must stay CLEAR');
for (const [x,y,z,l] of [[13,1,-52,'east of pylon'],[-13,1,-52,'west of pylon'],[0,1,-44,'south of stage'],[0,35,-52,'above summit']])
  console.log(`   ${l.padEnd(15)} ${at(x,y,z) ? 'BLOCKED <-- over-solid' : 'clear'}`);
