/* Is any canonical camera (or staged player) standing inside a hypostyle column?
   Column layout mirrored from EgyptLevel.hypostyleHall — nave x=±8 z=-22/-30/-38/-46,
   aisle x=±16.5 z=-26/-38. */
import { SHOTS } from '../src/core/Shots.js';

const COLS = [];
for (const cz of [-22, -30, -38, -46]) for (const sx of [-1, 1])
  COLS.push({ x: sx * 8, z: cz, y0: 0.35, hShaft: 12.3, rBase: 1.9, rTop: 1.4, plinth: 2.35, kind: 'nave' });
for (const cz of [-26, -38]) for (const sx of [-1, 1])
  COLS.push({ x: sx * 16.5, z: cz, y0: 0.34, hShaft: 9.5, rBase: 1.62, rTop: 1.2, plinth: 2.0, kind: 'aisle' });

/* The capital is modelled as `plinth` here, which is optimistic: the nave plinth is 2.35 m but
   the real papyrus bell reaches 2.85 m including the rib. No canonical camera currently sits at
   capital height in the hall, so this has never mattered — but it is the check that caught a
   camera standing inside a column shaft, and a check that under-reports is worth less than one
   that over-reports. Widened to 2.9 rather than left as a latent false negative. */
const CAPITAL_R = 2.9;

function radiusAt(c, y) {
  if (y < c.y0) return c.plinth;                       // plinth block, treated as a disc
  const t = Math.min(Math.max((y - c.y0) / c.hShaft, 0), 1);
  if (y > c.y0 + c.hShaft) return CAPITAL_R;           // capital bell, incl. rib
  return c.rBase + (c.rTop - c.rBase) * t;
}

function check(label, x, y, z) {
  let worst = null;
  for (const c of COLS) {
    const d = Math.hypot(x - c.x, z - c.z);
    const r = radiusAt(c, y);
    const clear = d - r;
    if (!worst || clear < worst.clear) worst = { c, d, r, clear };
  }
  const { c, d, r, clear } = worst;
  const flag = clear < 0 ? 'INSIDE COLUMN' : clear < 0.6 ? 'grazing' : 'ok';
  if (flag !== 'ok') {
    console.log(`  ${label.padEnd(24)} nearest ${c.kind} (${c.x}, ${c.z})  dist ${d.toFixed(2)}m  radius@y${y.toFixed(1)} ${r.toFixed(2)}m  clearance ${clear.toFixed(2)}m  ${flag}`);
  }
  return clear;
}

console.log('Hypostyle clearance check (only problems shown):');
let bad = 0;
for (const [name, s] of Object.entries(SHOTS)) {
  // Only meaningful inside the hall footprint.
  const inHall = (x, z) => x > -24 && x < 24 && z > -52 && z < -16;
  if (inHall(s.pos[0], s.pos[2])) { if (check(`${name} camera`, ...s.pos) < 0.6) bad++; }
  if (s.player && inHall(s.player.pos[0], s.player.pos[2])) { if (check(`${name} player`, ...s.player.pos) < 0.6) bad++; }
  if (inHall(s.target[0], s.target[2])) check(`${name} target`, ...s.target);
}
console.log(bad ? `\n${bad} placement(s) need moving.` : '\nAll clear.');
