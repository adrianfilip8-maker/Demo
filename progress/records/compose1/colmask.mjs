/**
 * Column-band mask for the §128.5 cel-ramp secondary (PREREG-compose1 §E).
 *
 * Emits, for the `temple` camera, dense horizontal runs of pixels that provably sit on a nave
 * COLUMN — membership by raycast against the real level, never by pixel colour.
 *
 * Why not a colour mask: loftscore2.mjs's header states the reason and it applies verbatim here.
 * A cel terminator's dark band is both darker and bluer, so any value- or hue-gated mask deletes
 * the very band the test is looking for and can only ever report "no transition". The mask must
 * be neutral with respect to value, so it is geometric.
 *
 * Rows are sampled densely in x (stride 2) because the statistic is a profile ACROSS the column's
 * width; y is sampled sparsely because each row is an independent replicate.
 *
 * GAP (§11) — the suffix between this and the renderer: no shadow map, no ink hull, no bloom, no
 * PostFX, and the level comes from tools/lvl.mjs rather than the live page. It says "this pixel is
 * on a column". It does not say what shade that pixel is, which is the frames' job.
 */
import * as THREE from 'three';
import { buildLevel } from '/home/user/Demo/tools/lvl.mjs';
import { SHOTS } from '/home/user/Demo/src/core/Shots.js';
import { writeFileSync } from 'node:fs';

const SHOT = process.argv[2] || 'temple';
const W = 1280, H = 720;
const XSTRIDE = 2;
const ROWS = 48;                      // replicates, spread over the frame's vertical extent
const OUT = '/tmp/claude-0/-home-user-Demo/94022f73-a328-5e86-b2ec-031aa9c720ce/scratchpad/compose1';

const s = SHOTS[SHOT];
if (!s) throw new Error(`no shot ${SHOT}`);

const cam = new THREE.PerspectiveCamera(s.fov, W / H, 0.1, 3000);
cam.position.fromArray(s.pos); cam.lookAt(new THREE.Vector3(...s.target));
cam.updateMatrixWorld(true); cam.updateProjectionMatrix();

const { root } = await buildLevel({ withProps: true });
root.updateMatrixWorld(true);
const rc = new THREE.Raycaster();
const v2 = new THREE.Vector2();

const isColumn = (n) => /column/i.test(n || '');

const rows = [];
const names = new Map();
for (let k = 0; k < ROWS; k++) {
  const y = Math.round(((k + 0.5) / ROWS) * H);
  const hits = [];
  for (let x = 1; x < W; x += XSTRIDE) {
    v2.set((x / W) * 2 - 1, -((y / H) * 2 - 1));
    rc.setFromCamera(v2, cam);
    const hs = rc.intersectObject(root, true);
    const h0 = hs.find((h) => h.object?.isMesh && h.object.visible !== false && h.face
      && !h.object.userData?.collisionProxy);
    const nm = h0?.object?.name || '';
    if (nm) names.set(nm, (names.get(nm) || 0) + 1);
    hits.push(isColumn(nm) ? 1 : 0);
  }
  /* Contiguous runs of column pixels; keep only runs wide enough to carry a profile. */
  const runs = [];
  let st = -1;
  for (let i = 0; i <= hits.length; i++) {
    if (hits[i] === 1 && st < 0) st = i;
    else if (hits[i] !== 1 && st >= 0) {
      const x0 = 1 + st * XSTRIDE, x1 = 1 + (i - 1) * XSTRIDE;
      if (x1 - x0 >= 40) runs.push([x0, x1]);
      st = -1;
    }
  }
  if (runs.length) rows.push({ y, runs });
}

console.log(`${SHOT}: ${rows.length} rows carry a column run >= 40 px wide`);
const widest = rows.flatMap((r) => r.runs.map((q) => q[1] - q[0])).sort((a, b) => b - a).slice(0, 6);
console.log(`widest runs: ${widest.join(', ')} px`);
console.log('top hit objects:', [...names.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8)
  .map(([n, c]) => `${n}=${c}`).join('  '));
writeFileSync(`${OUT}/colmask-${SHOT}.json`, JSON.stringify({ shot: SHOT, W, H, XSTRIDE, rows }));
console.log(`wrote colmask-${SHOT}.json`);
