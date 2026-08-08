/**
 * shotsee — which prop placements can each canonical shot actually see?
 *
 * Written after placing 30 KayKit props and then spending a 25-minute capture to discover that
 * `temple` sees exactly one of them and `courtyard` sees all thirty at 36–51 m from behind the
 * colossi. Both facts are pure geometry — camera position, aim and field of view are all sitting
 * in `Shots.js`, and the placements in `KayKit.js` — so this costs a second and no capture lock.
 *
 *     node tools/shotsee.mjs            # every shot
 *     node tools/shotsee.mjs temple     # one shot, listing every placement and its distance
 *
 * IT IS AN UPPER BOUND, and saying so is the point. It tests frustum membership only: a prop
 * outside the cone provably cannot be seen, but a prop inside it may still be hidden behind a
 * colossus, and this tool will happily report it as visible. Distance is reported alongside for
 * the same reason — "in frustum at 51 m" is not a claim that anything reads.
 *
 * That caveat is load-bearing here. §203.1 retired a projection instrument for predicting 29x
 * where the render delivered 0.75x, so this one is scoped deliberately narrowly: use it to rule
 * placements OUT before paying for a capture, never to rule them in.
 */
import { readFileSync } from 'node:fs';

const ROOT = new URL('..', import.meta.url);
const ASPECT = 16 / 9;
const EYE = 0.8;              // sample a prop around its middle rather than its foot

const shotsSrc = readFileSync(new URL('src/core/Shots.js', ROOT), 'utf8');
const kaykitSrc = readFileSync(new URL('src/world/KayKit.js', ROOT), 'utf8');

/* Shots.js entries: `name: { pos: [...], target: [...], fov: N`  (quoted names too). */
const SHOTS = [];
for (const m of shotsSrc.matchAll(
  /(?:^|\n)\s*'?([a-zA-Z][\w-]*)'?:\s*\{\s*pos:\s*\[([^\]]+)\],\s*target:\s*\[([^\]]+)\],\s*fov:\s*([\d.]+)/g)) {
  SHOTS.push({ name: m[1], pos: m[2].split(',').map(Number), tgt: m[3].split(',').map(Number), fov: +m[4] });
}

const block = kaykitSrc.slice(kaykitSrc.indexOf('const PLACEMENTS'));
const PLACE = [...block.matchAll(/\['([a-z_]+)',\s*(-?[\d.]+),\s*(-?[\d.]+),\s*(-?[\d.]+),/g)]
  .map((m) => ({ f: m[1], x: +m[2], y: +m[3], z: +m[4] }));

if (!SHOTS.length || !PLACE.length) {
  console.error(`shotsee: parsed ${SHOTS.length} shots and ${PLACE.length} placements — one of the `
    + 'source formats changed, and a silent zero here would look exactly like "nothing is visible".');
  process.exit(1);
}

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const len = (a) => Math.hypot(...a);
const norm = (a) => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

function visible(shot) {
  const f = norm(sub(shot.tgt, shot.pos));
  const r = norm(cross(f, [0, 1, 0]));
  const u = cross(r, f);
  const tv = Math.tan((shot.fov * Math.PI) / 360), th = tv * ASPECT;
  const hits = [];
  for (const p of PLACE) {
    const d = sub([p.x, p.y + EYE, p.z], shot.pos);
    const zc = dot(d, f);
    if (zc <= 0.5) continue;
    if (Math.abs(dot(d, r)) > th * zc || Math.abs(dot(d, u)) > tv * zc) continue;
    hits.push({ ...p, dist: len(d) });
  }
  hits.sort((a, b) => a.dist - b.dist);
  return hits;
}

const only = process.argv[2];
console.log(`shotsee — ${PLACE.length} placements against ${SHOTS.length} shots (frustum only, occlusion ignored)\n`);
for (const s of SHOTS) {
  if (only && s.name !== only) continue;
  const hits = visible(s);
  const near = hits.length ? `nearest ${hits[0].dist.toFixed(0)} m` : '';
  console.log(`${s.name.padEnd(14)} ${String(hits.length).padStart(2)}/${PLACE.length}  ${near}`);
  if (only) for (const h of hits) console.log(`    ${h.f.padEnd(24)} (${h.x}, ${h.z})  ${h.dist.toFixed(1)} m`);
}
if (!only) console.log('\nPass a shot name for the per-placement list. Counts are an upper bound.');
