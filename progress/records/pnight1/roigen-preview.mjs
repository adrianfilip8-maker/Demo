/**
 * Spatial ROI generator. Membership is decided by WHERE THE SURFACE IS and WHICH WAY IT FACES
 * in the world — never by pixel colour, because §104.2 is the standing proof that hue and
 * saturation cannot separate "turquoise statue" from "dusk sky over blue-grey sand".
 *
 *   node roigen.mjs <shot> [stride]
 *
 * Emits roi-<shot>.json with four populations:
 *   archShade  architecture whose normal faces away from the sun  (the ledger line's subject:
 *              "shadowed architecture hue <= 226 at comparable saturation")
 *   archLit    architecture facing the sun                        (the "day mood preserved" half)
 *   sphinx     avenue animals per AGENTS §8.1, x = +-7, z 38..86  (§104's teal sphinxes)
 *   sky        no hit                                             (control: must not move)
 *
 * GAP (§11) — the suffix between this and the renderer: no shadow map (so `archLit` includes
 * faces the sun geometrically reaches but a cast shadow occludes), no ink hull, no bloom bleed,
 * no PostFX widening, and the level is built by tools/lvl.mjs rather than by the live page. It
 * says "this pixel is on an away-facing architecture surface". It does NOT say "this pixel is
 * in shadow" and it must not be quoted as if it did.
 */
import * as THREE from 'three';
import { buildLevel } from '/home/user/Demo/tools/lvl.mjs';
import { SHOTS } from '/home/user/Demo/src/core/Shots.js';
import { writeFileSync } from 'node:fs';

const SHOT = process.argv[2] || 'hero';
const STRIDE = +(process.argv[3] || 4);
const W = 1280, H = 720;
const OUT = '/tmp/claude-0/-home-user-Demo/94022f73-a328-5e86-b2ec-031aa9c720ce/scratchpad/drift';

const s = SHOTS[SHOT];
if (!s) throw new Error(`no shot ${SHOT}`);
/* Sun from the shot's own time of day, not a fixed vector — KNOWN_ISSUES §8 records a
   band-crossing measurement that was 4.7x wrong precisely for using one fixed light vector
   across shots whose keys sit in opposite quadrants. */
const tod = s.tod ?? 0.76;
/* evalAtmosphere MUTATES a state object and returns nothing useful — KNOWN_ISSUES §8's
   `evalAtmosphere(0.76).sunDir` shorthand throws. Verified against that note's own value:
   tod 0.76 gives (-0.899, 0.438, 0.000), which is what §8 quotes. */
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

const out = { shot: SHOT, W, H, STRIDE, tod, sun: sun.toArray(), archShade: [], archLit: [], sphinx: [], sky: [] };
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
writeFileSync(`${OUT}/roi-${SHOT}-preview.json`, JSON.stringify(out));
