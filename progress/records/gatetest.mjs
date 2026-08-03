/* Does the HULL_KEYS gate actually fire, and only on the intended keys?
 * The offline builders stub `shading` as null, so they cannot answer this; the browser
 * harness can, but only after a 40-minute lock wait. A stub that records its calls answers
 * it in two seconds and de-risks the capture. */
import * as THREE from 'three';
const calls = [];
const shadingStub = {
  toon: (o) => { const m = new THREE.MeshStandardMaterial({ color: o.color }); m.userData.outline = o.outline; return m; },
  outline: (mesh, opts) => {
    calls.push({ host: mesh.name, thickness: opts.thickness });
    const shell = new THREE.Mesh(mesh.geometry, new THREE.MeshBasicMaterial());
    shell.userData.slyOutline = true; shell.name = `${mesh.name}_ink`;
    mesh.add(shell);
    return shell;
  },
};
const warnings = [];
const engine = {
  quality: 'high', scene: new THREE.Scene(), debug: {}, stats: {}, warnings,
  warn: (m) => warnings.push(m), has: () => false,
  get: (k) => (k === 'shading' ? shadingStub : null),
  on: () => () => {}, emit: () => {}, registerCollider: () => {},
};
const { Props } = await import('../../src/world/Props.js');
const P = new Props(engine);
await P.init();

console.log(`outline() called ${calls.length} times:`);
for (const c of calls.sort((a,b)=>a.host.localeCompare(b.host))) {
  console.log(`   ${c.host.padEnd(20)} thickness ${c.thickness}`);
}
const EXPECT = new Set(['props_stone','props_lime','props_gold','props_dark','props_lapis','props_carnelian']);
const got = new Set(calls.map(c => c.host));
const missing = [...EXPECT].filter(k => !got.has(k));
const extra = [...got].filter(k => !EXPECT.has(k));
console.log(`\nexpected ${EXPECT.size}, got ${got.size}`);
if (missing.length) console.log(`  MISSING: ${missing.join(', ')}`);
if (extra.length)   console.log(`  UNEXPECTED (set dress got shelled): ${extra.join(', ')}`);
console.log(missing.length || extra.length ? '\n*** GATE WRONG ***' : '\nGATE CORRECT — exactly the six hero keys, nothing else.');
console.log(`\nProps self-report: draws ${P.stats.draws}, tris ${Math.round(P.stats.tris)}, hulls ${P.stats.hulls ?? 0}`);
if (warnings.length) console.log(`warnings: ${warnings.length}`), warnings.slice(0,5).forEach(w=>console.log('  ! '+w));
