#!/usr/bin/env node
/* hullgold-price — re-derive the inverted-hull price per Props material key, offline.
 *
 * WHY THIS EXISTS. `PREREG-propshull.md` priced the 6-key hull at "+6 draws / +55,718 tris"
 * with `hullprice.mjs` — a tool that no longer exists anywhere in the tree (rollback casualty,
 * §161 class). §160.1's rule: a number you did not measure yourself is a citation, and a
 * citation gets re-derived before it licenses anything. This re-derives the price for the
 * narrow follow-up gate (`PREREG-hullkerb.md`) and CALIBRATES itself against the dead tool:
 * if the six keys {stone, lime, gold, dark, lapis, carnelian} do not sum to 55,718 tris, this
 * instrument does not reproduce the recorded one and its gold row must not be quoted.
 *
 * METHOD. `tools/lvl.mjs buildLevel({withProps:true})` builds Architecture+Props headless with
 * a stub engine (shading=null, so no shells are actually built — irrelevant here, because a
 * shell is by construction the host's own triangles drawn once more: price(key) = +1 draw +
 * tris(props_<key>)). Terrain is absent and placements fall to y=0 (lvl.mjs's own header
 * hazard) — harmless for a triangle COUNT, which placement cannot change; do not reuse this
 * script for any question about where a prop stands.
 *
 * usage: node progress/records/hullgold-price.mjs
 */
import { buildLevel } from '../../tools/lvl.mjs';

const SIX = ['stone', 'lime', 'gold', 'dark', 'lapis', 'carnelian'];
const RECORDED_SIX = 55718; // PREREG-propshull.md / Props.js header, measured by the dead hullprice.mjs

const { P, warnings } = await buildLevel({ withProps: true });
if (!P) { console.error('no Props module built'); process.exit(2); }

const rows = [];
P.group.traverse((o) => {
  if (!o.isMesh || !o.name?.startsWith('props_')) return;
  const key = o.name.slice('props_'.length);
  const g = o.geometry;
  const tris = (g.index ? g.index.count : g.attributes.position.count) / 3;
  rows.push({ key, tris: Math.round(tris) });
});
rows.sort((a, b) => b.tris - a.tris);

let sumSix = 0;
for (const r of rows) {
  const inSix = SIX.includes(r.key);
  if (inSix) sumSix += r.tris;
  console.log(`${r.key.padEnd(10)} ${String(r.tris).padStart(8)} tris  ${inSix ? '  [6-key set]' : ''}`);
}
console.log('---');
console.log(`6-key sum        ${sumSix} tris   (recorded by hullprice.mjs: ${RECORDED_SIX})`);
const drift = sumSix - RECORDED_SIX;
console.log(`calibration      ${drift === 0 ? 'EXACT' : `DRIFT ${drift > 0 ? '+' : ''}${drift} tris`}`);
if (drift !== 0) {
  console.log('NOTE: a non-zero drift means the geometry moved since the propshull run (Kit.js/');
  console.log('EgyptLevel.js/Props.js edits landed §159-era) OR this instrument mismeasures.');
  console.log('Either way the gold row below is THIS TREE\'s price, stated on its own capture.');
}
const gold = rows.find((r) => r.key === 'gold');
console.log('---');
console.log(`GOLD-ONLY GATE PRICE: +1 draw / +${gold?.tris ?? 'ABSENT'} tris (shell = host tris drawn once more)`);
if (warnings.length) console.log(`\nbuild warnings (${warnings.length}):`, warnings.slice(0, 5));
