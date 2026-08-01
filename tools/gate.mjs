/* Passage/niche leak probe. From inside each opening volume, cast axis rays.
   A sound passage stops a sideways ray at the jamb (<~0.4 m). A leaking one lets it
   run into the hollow shell interior. */
import * as THREE from 'three';
import { buildLevel, trisIn, firstHit } from './lvl.mjs';

const { A } = await buildLevel();

/* name, along-axis, opening volume in WORLD space (the passage interior) */
const CASES = [
  // inner pylon gate: x -3.4..3.4, y 0..8.2, z -55.5..-48.5 (shell d=7 at z=-52)
  { n: 'inner-pylon gate',      ax: 'x', x0: -3.4, x1: 3.4, y0: 0.3, y1: 8.0, z0: -55.3, z1: -48.7 },
  // inner pylon south stage gate: x -3.6..3.6, y 0..8.6, z -51.5..-47.6
  { n: 'stage gate',            ax: 'x', x0: -3.6, x1: 3.6, y0: 0.3, y1: 8.4, z0: -51.3, z1: -47.8 },
  // stage flagstaff niches (through-holes, both faces)
  { n: 'stage niche W',         ax: 'x', x0: -7.4, x1: -6.0, y0: 1.6, y1: 20.8, z0: -51.3, z1: -47.8 },
  // entry pylon E flagstaff niche (face 0 only, +Z at z=34, d=6 -> leaf z 30.95..32.05 approx)
  { n: 'E pylon niche',         ax: 'x', x0: 16.1, x1: 17.1, y0: 1.4, y1: 21.8, z0: 34.0, z1: 36.9 },
  { n: 'E pylon service door',  ax: 'x', x0: 12.4, x1: 15.6, y0: 0.3, y1: 4.0, z0: 31.1, z1: 34.0 },
  // terrace stage-1 south opening (face 0, +Z at z=19.4)
  { n: 'terrace s1 opening',    ax: 'x', x0: -3.2, x1: 3.2, y0: 0.3, y1: 1.9, z0: 15.0, z1: 19.3 },
  // tomb gate (leaves overlap; expect clean)
  { n: 'tomb gate',             ax: 'x', x0: -2.6, x1: 2.6, y0: -11.7, y1: -8.4, z0: -59.3, z1: -58.2 },
  // hall north wall gate (leaves abut; expect clean)
  { n: 'hall N gate',           ax: 'x', x0: -3.4, x1: 3.4, y0: 0.3, y1: 8.0, z0: -52.6, z1: -50.5 },
];

const DIRS = [
  ['-X', [-1, 0, 0]], ['+X', [1, 0, 0]],
  ['-Z', [0, 0, -1]], ['+Z', [0, 0, 1]],
  ['+Y', [0, 1, 0]], ['-Y', [0, -1, 0]],
];
const FAR = 30;

console.log('escape = ray travels >30 m without a hit;  deep = first hit beyond 2.5 m');
console.log('(for a sideways ray inside a passage, anything but a jamb hit under ~0.5 m is a leak)\n');

for (const c of CASES) {
  const pad = 2.0;
  const box = new THREE.Box3(
    new THREE.Vector3(Math.min(c.x0, c.x1) - 14, c.y0 - 3, Math.min(c.z0, c.z1) - 14),
    new THREE.Vector3(Math.max(c.x0, c.x1) + 14, c.y1 + 4, Math.max(c.z0, c.z1) + 14));
  const tris = trisIn(A.root, box);

  const N = 4;
  const res = {};
  for (const [dn] of DIRS) res[dn] = { n: 0, esc: 0, deep: 0, sum: 0 };
  for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) for (let k = 0; k < N; k++) {
    const x = c.x0 + (c.x1 - c.x0) * (i + 0.5) / N;
    const y = c.y0 + (c.y1 - c.y0) * (j + 0.5) / N;
    const z = c.z0 + (c.z1 - c.z0) * (k + 0.5) / N;
    for (const [dn, d] of DIRS) {
      const h = firstHit([x, y, z], d, tris);
      const r = res[dn];
      r.n++;
      if (!isFinite(h.t) || h.t > FAR) { r.esc++; r.deep++; r.sum += FAR; }
      else { r.sum += h.t; if (h.t > 2.5) r.deep++; }
    }
  }
  const parts = DIRS.map(([dn]) => {
    const r = res[dn];
    return `${dn} ${String(r.deep).padStart(2)}/${r.n} d=${(r.sum / r.n).toFixed(1)}m`;
  });
  console.log(`${c.n.padEnd(22)} tris=${String(tris.length).padStart(6)}  ${parts.join('  ')}`);
}
