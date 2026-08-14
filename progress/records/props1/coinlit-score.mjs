/**
 * coinlit-score.mjs — scores PREREG-coinlit's registered rows off progress/records/props1run1.
 * FAIL-CLOSED. VOIDs on any per-capture tree-stamp change (§296 finding 2) and on any shot whose
 * same-boot back arm is not [0,0] (§302).
 *
 *   node progress/records/props1/coinlit-score.mjs [outdir]
 */
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { readPNG } from '../../../tools/png.mjs';

const OUT = process.argv[2] || path.resolve(import.meta.dirname, '../props1run1');
if (!existsSync(path.join(OUT, 'manifest.json'))) { console.log(`no manifest at ${OUT} — has the run landed?`); process.exit(2); }
const M = JSON.parse(readFileSync(path.join(OUT, 'manifest.json'), 'utf8'));
const img = (f) => readPNG(path.join(OUT, f));
const L = (r, g, b) => 0.299 * r + 0.587 * g + 0.114 * b;
const S = (r, g, b) => { const mx = Math.max(r, g, b), mn = Math.min(r, g, b); return mx ? (mx - mn) / mx : 0; };

/* ---- tree stamps: one tree, or VOID -------------------------------------------------------- */
const stamps = new Set(M.rows.map((r) => `${r.tree.src}|${r.tree.head}`));
if (stamps.size !== 1) { console.log(`VOID — ${stamps.size} distinct per-capture tree stamps: ${[...stamps].join(' , ')}`); process.exit(1); }
console.log(`tree: one stamp across all ${M.rows.length} captures (${[...stamps][0]})`);

const shots = [...new Set(M.rows.map((r) => r.shot))];
const get = (shot, arm) => M.rows.find((r) => r.shot === shot && r.arm === arm);

/* ---- P1 VALIDITY: same-boot off vs back must be exactly 0 px ------------------------------- */
let validity = true;
const vrows = [];
for (const s of shots) {
  const a = get(s, 'off'), b = get(s, 'back');
  if (!a || !b) { vrows.push([s, 'MISSING']); validity = false; continue; }
  if (a.sha256 === b.sha256) { vrows.push([s, 0]); continue; }
  const A = img(a.file), B = img(b.file);
  let n = 0;
  for (let i = 0; i < A.data.length; i += 4) if (A.data[i] !== B.data[i] || A.data[i + 1] !== B.data[i + 1] || A.data[i + 2] !== B.data[i + 2]) n++;
  vrows.push([s, n]); if (n !== 0) validity = false;
}
console.log(`\nP1 VALIDITY (same-boot off vs back, §302 — [0,0] claimed SAME-BOOT ONLY):`);
for (const [s, n] of vrows) console.log(`   ${String(n).padStart(8)} px  ${s}`);
if (!validity) { console.log('\nVOID — a back arm did not restore. Nothing is scored from this run.'); process.exit(1); }

/* ---- ROI statistics ------------------------------------------------------------------------ */
const statOf = (px, rois) => {
  let n = 0, sl = 0, ss = 0; const vals = [];
  for (const [x0, y0, x1, y1] of rois) for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
    const i = (y * px.width + x) * 4;
    const l = L(px.data[i], px.data[i + 1], px.data[i + 2]);
    sl += l; ss += S(px.data[i], px.data[i + 1], px.data[i + 2]); vals.push(l); n++;
  }
  if (!n) return null;
  const mean = sl / n;
  return { n, meanL: mean, meanS: ss / n, hiFrac: vals.filter((v) => v >= mean + 25).length / n };
};
const outsideStat = (px, all) => {
  const mask = new Uint8Array(px.width * px.height);
  for (const [x0, y0, x1, y1] of all) for (let y = Math.max(0, y0 - 6); y < Math.min(px.height, y1 + 6); y++)
    for (let x = Math.max(0, x0 - 6); x < Math.min(px.width, x1 + 6); x++) mask[y * px.width + x] = 1;
  let n = 0, sl = 0, hi = 0;
  for (let p = 0; p < mask.length; p++) {
    if (mask[p]) continue;
    const i = p * 4, l = L(px.data[i], px.data[i + 1], px.data[i + 2]);
    sl += l; if (l >= 250) hi++; n++;
  }
  return { n, meanL: sl / n, hi };
};

const FAM = { coins: { dL: 10.0, name: 'COINS' }, rings: { dL: 10.0, name: 'RINGS' } };
const results = { coins: [], rings: [] }, protections = [];
for (const s of shots) {
  const off = get(s, 'off');
  const arms = ['mon', 'non', 'both'].map((a) => get(s, a)).filter(Boolean);
  const offPx = img(off.file);
  for (const fam of ['coins', 'rings']) {
    const rois = off.rois[fam];
    if (rois.length < 3) continue;                       // registered qualifying rule
    const o = statOf(offPx, rois);
    for (const arm of arms) {
      const a = statOf(img(arm.file), arm.rois[fam].length >= 3 ? arm.rois[fam] : rois);
      results[fam].push({ shot: s, arm: arm.arm, n: o.n, dL: a.meanL - o.meanL, dS: a.meanS - o.meanS, hiFrac: a.hiFrac, hiOff: o.hiFrac, offL: o.meanL, candL: a.meanL });
    }
  }
  /* P2/P3 use the `both` arm, or whichever arm ends up being the ship arm — reported for all. */
  for (const arm of arms) {
    const allRois = [...off.rois.coins, ...off.rois.rings, ...off.rois.treasures];
    const tOff = off.rois.treasures.length ? statOf(offPx, off.rois.treasures) : null;
    const tCand = off.rois.treasures.length ? statOf(img(arm.file), off.rois.treasures) : null;
    const oOff = outsideStat(offPx, allRois), oCand = outsideStat(img(arm.file), allRois);
    protections.push({
      shot: s, arm: arm.arm,
      treasureDL: tOff ? tCand.meanL - tOff.meanL : null,
      outDL: oCand.meanL - oOff.meanL,
      outHiFrac: (oCand.hi - oOff.hi) / (offPx.width * offPx.height),
    });
  }
}

const armVerdict = (arm) => {
  const rows = [];
  let ok = true;
  for (const fam of ['coins', 'rings']) {
    const r = results[fam].filter((x) => x.arm === arm);
    const stagings = new Set(r.map((x) => x.shot)).size;
    if (stagings < 2) { rows.push([fam, `only ${stagings} qualifying staging(s) — this family does not ship from this run`, false]); if (fam === 'rings') ok = false; continue; }
    for (const x of r) {
      const b1 = x.dL >= FAM[fam].dL, b2 = x.dS >= 0.04, b3 = x.hiFrac >= 0.05 && x.hiFrac > x.hiOff;
      rows.push([`${fam}/${x.shot}`, `dL ${x.dL.toFixed(2)} (off ${x.offL.toFixed(1)} -> ${x.candL.toFixed(1)}, n=${x.n}) dS ${x.dS.toFixed(3)} hiFrac ${x.hiFrac.toFixed(3)} (off ${x.hiOff.toFixed(3)})`, b1 && b2 && b3]);
      if (!(b1 && b2 && b3)) ok = false;
    }
  }
  for (const p of protections.filter((x) => x.arm === arm)) {
    const p2 = p.treasureDL === null || Math.abs(p.treasureDL) <= 1.0;
    const p3 = Math.abs(p.outDL) <= 0.15 && p.outHiFrac <= 0.002;
    rows.push([`P2/${p.shot}`, `treasure dL ${p.treasureDL === null ? 'n/a' : p.treasureDL.toFixed(3)}`, p2]);
    rows.push([`P3/${p.shot}`, `outside dL ${p.outDL.toFixed(4)} d(px>=250) ${(p.outHiFrac * 100).toFixed(4)}%`, p3]);
    if (!p2 || !p3) ok = false;
  }
  return { ok, rows };
};

let ship = null;
for (const arm of ['both', 'mon', 'non']) {
  const v = armVerdict(arm);
  console.log(`\n=== arm ${arm} ===`);
  for (const [id, txt, ok] of v.rows) console.log(`${ok ? 'PASS' : 'FAIL'}  ${String(id).padEnd(22)} ${txt}`);
  console.log(`arm ${arm}: ${v.ok ? 'PASS' : 'FAIL'}`);
  if (v.ok && !ship) ship = arm;
}
console.log(`\nVERDICT: ${ship ? `PASS — ship arm ${ship} (PREREG-coinlit §6 ship-write)` : 'FAIL — nothing ships, src/** unchanged (fail-closed)'}`);
process.exit(ship ? 0 : 1);
