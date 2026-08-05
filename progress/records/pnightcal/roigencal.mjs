/**
 * ROI generator for PREREG-pnightcal — progress/records/drift/roigen.mjs with THREE changes,
 * enumerated per the pnighthue.mjs precedent (§122.1: instruments differ loudly or not at all):
 *   1. OUT is durable (progress/records/pnightcal/), not the rolled-back scratchpad — §161.1:
 *      the blast radius of a rollback is fixed before the capture starts.
 *   2. The emitted JSON carries `srcTree` — the same `find src -name '*.js'` hash command the
 *      capture harness stamps — so V3 (ROI built at the capture's tree) is checkable from the
 *      artifacts alone rather than from anyone's memory. §158.5: framing shares are not
 *      stable across trees; an ROI without a tree stamp is a number without a denominator.
 *   3. Output filename is roi-night-cal.json so it can never be mistaken for the pnight1 ROI.
 *
 * Everything else — membership rule, populations, stride, the §11 gap (archShade = "on an
 * away-facing architecture surface", NOT "in shadow") — is the sealed generator, verbatim.
 * Run as: node roigencal.mjs night 4   (offline; no renderer, no capture lock — §157.6
 * records the class as CPU-competition only; run under `nice` while a capture holds the lock.)
 */
import * as THREE from 'three';
import { buildLevel } from '/home/user/Demo/tools/lvl.mjs';
import { SHOTS } from '/home/user/Demo/src/core/Shots.js';
import { writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';

const SHOT = process.argv[2] || 'night';
const STRIDE = +(process.argv[3] || 4);
const W = 1280, H = 720;
const OUT = '/home/user/Demo/progress/records/pnightcal';

/* Identical command string to pnightcal.mjs's treeHash — sha256sum hashes the PATHS too
   (§141.5), so the two stamps must be produced by the same absolute-path command. */
const srcTree = execSync(
  `find /home/user/Demo/src -name '*.js' | sort | xargs sha256sum | sha256sum | cut -c1-16`,
  { encoding: 'utf8' },
).trim();

const s = SHOTS[SHOT];
if (!s) throw new Error(`no shot ${SHOT}`);
const tod = s.tod ?? 0.76;
const { evalAtmosphere, createAtmosphereState } = await import('/home/user/Demo/src/render/Atmosphere.js');
const atmState = createAtmosphereState();
evalAtmosphere(tod, atmState);
const sun = atmState.sunDir.clone().normalize();

const cam = new THREE.PerspectiveCamera(s.fov, W / H, 0.1, 3000);
cam.position.fromArray(s.pos); cam.lookAt(new THREE.Vector3(...s.target));
cam.updateMatrixWorld(true); cam.updateProjectionMatrix();

const { root } = await buildLevel({ withProps: true });
root.updateMatrixWorld(true);
const rc = new THREE.Raycaster();
const v2 = new THREE.Vector2();

const out = { shot: SHOT, W, H, STRIDE, tod, sun: sun.toArray(), srcTree, generatedAt: new Date().toISOString(), archShade: [], archLit: [], sphinx: [], sky: [] };
for (let y = 1; y < H; y += STRIDE) {
  for (let x = 1; x < W; x += STRIDE) {
    v2.set((x / W) * 2 - 1, -((y / H) * 2 - 1));
    rc.setFromCamera(v2, cam);
    const hits = rc.intersectObject(root, true);
    const h0 = hits.find((h) => h.object?.isMesh && h.object.visible !== false && h.face && !h.object.userData?.collisionProxy);
    if (!h0) { out.sky.push([x, y]); continue; }
    const p = h0.point, nm = h0.object.name || '';
    const n = h0.face.normal.clone().transformDirection(h0.object.matrixWorld).normalize();
    const ndl = n.dot(sun);
    if (nm === 'props_lime' && Math.abs(Math.abs(p.x) - 7) < 3.0 && p.z > 38 && p.z < 86) out.sphinx.push([x, y]);
    else if (nm.startsWith('arch') || nm.startsWith('paving')) (ndl < -0.05 ? out.archShade : ndl > 0.15 ? out.archLit : null)?.push([x, y]);
  }
}
const bbox = (a) => a.length ? [Math.min(...a.map((q) => q[0])), Math.max(...a.map((q) => q[0])), Math.min(...a.map((q) => q[1])), Math.max(...a.map((q) => q[1]))] : null;
for (const k of ['archShade', 'archLit', 'sphinx', 'sky']) {
  console.log(`${SHOT} ${k.padEnd(10)} ${String(out[k].length).padStart(6)} samples  bbox ${JSON.stringify(bbox(out[k]))}`);
}
console.log(`srcTree ${srcTree}`);
writeFileSync(`${OUT}/roi-${SHOT}-cal.json`, JSON.stringify(out));
console.log(`wrote ${OUT}/roi-${SHOT}-cal.json`);
