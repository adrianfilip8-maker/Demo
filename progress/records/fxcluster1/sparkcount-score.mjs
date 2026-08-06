#!/usr/bin/env node
/* sparkcount-score — PREREG-sparkcount §2/§4. Computes SPARKCOUNT offline from the probe dump,
 * so the registered arithmetic is auditable without a second boot. Thresholds TRANSCRIBED from
 * the seal; nothing is chosen here.
 *
 *   SPARKCOUNT = #{ i : pop(i) >= POP_MIN AND inFrustum(i) AND scale(i) > 0 }
 *   pop(i)     = smoothstep(0, 0.22, uTimeFx - aData[4i+2])      (SPARKLE_VERT:728, ported)
 *
 * usage: node sparkcount-score.mjs
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';

const HERE = path.dirname(new URL(import.meta.url).pathname);
/* Optional fixture override so the scorer's own arithmetic can be exercised against dumps whose
 * answer is known by construction (sparkcount-scorer-control.mjs). Defaults are the real files;
 * passing paths changes NOTHING about the arithmetic or the bands. */
const RB = process.argv[2] ? path.resolve(process.argv[2]) : path.join(HERE, 'sparkcount-readback.json');
const OUTPATH = process.argv[3] ? path.resolve(process.argv[3]) : path.join(HERE, 'sparkcount-scores.json');

/* NO-DATA vs FAILED-CONTROLS must never print the same way.
 * The runner writes this file's header BEFORE it takes the capture lock (sparkcount.mjs:35), so
 * the file existing proves only that the runner started — not that it ever booted. Reporting an
 * empty dump as "NOT GRANTED" would let an absence of measurement read as a falsification of the
 * seal, which is §184's own defect (an output that cannot tell measuring zero from measuring
 * nothing). The licence still fails closed in both cases; only the stated REASON differs. */
const noData = (why, extra = {}) => {
  const out = { at: new Date().toISOString(), prereg: 'PREREG-sparkcount.md', popMin: 0.5, arms: {}, state: 'NO DATA', why, licensed: false, ...extra };
  writeFileSync(OUTPATH, JSON.stringify(out, null, 1));
  console.log(`CALIBRATION LICENCE: NOT GRANTED — reason: NO DATA (${why}).`);
  console.log('  This is NOT a falsified control. No falsifier P-S1..P-S5 is adjudicated by this run.');
  console.log('  skyCut remains the registered primary predicate (seal §6 retires it only on KB1+KB2 holding).');
  console.log(`\nwrote ${path.basename(OUTPATH)}`);
  process.exit(0);
};

if (!existsSync(RB)) noData('sparkcount-readback.json absent — the probe never started');
const rb = JSON.parse(readFileSync(RB, 'utf8'));
if (!rb.arms || rb.arms.length === 0) {
  noData(rb.fatal ? `runner recorded fatal: ${rb.fatal}` : 'readback header present but arms[] empty — the runner started and has not yet dumped an arm (it writes the header before taking the capture lock)',
    { startedAt: rb.startedAt ?? null, runnerFatal: rb.fatal ?? null, live: rb.live ?? null, finishedAt: rb.finishedAt ?? null });
}

const POP_MIN = 0.5;                       // seal §2, registered, not a tuning knob
const smoothstep = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a || 1e-6))); return t * t * (3 - 2 * t); };

/* seal §4 predictions, transcribed */
const KB = {
  'traversal-prerollOFF': { name: 'KB1', expect: (v) => v === 0, band: 'SPARKCOUNT == 0 (raw expected ~14-17)' },
  'traversal-prerollON': { name: 'KB2', expect: (v) => v >= 11 && v <= 17, band: 'SPARKCOUNT = 14 +/- 3 (14 committed blobs)' },
  night: { name: 'KB3', expect: (v) => v >= 12 && v <= 20, band: 'SPARKCOUNT = 16 +/- 4, and NOT ~62' },
  interior: { name: 'KB4', expect: (v) => v === 0, band: 'SPARKCOUNT == 0' },
};

function project(P, cam, W = 1280, H = 720) {
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const norm = (a) => { const l = Math.hypot(...a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
  const f = norm(cam.fwd), r = norm(cross(f, [0, 1, 0])), u = cross(r, f);
  const tanV = Math.tan((cam.fov * 0.5 * Math.PI) / 180), tanH = tanV * (cam.aspect || W / H);
  const rel = sub(P, cam.pos), z = dot(rel, f);
  if (z <= 0.01) return null;
  return { x: (W / 2) * (1 + (dot(rel, r) / z) / tanH), y: (H / 2) * (1 - (dot(rel, u) / z) / tanV), z };
}

const OUT = { at: new Date().toISOString(), prereg: 'PREREG-sparkcount.md', popMin: POP_MIN, arms: {} };
console.log(`SPARKCOUNT (POP_MIN ${POP_MIN}) — seal §2/§4\n`);
console.log(` ${'arm'.padEnd(24)} ${'raw'.padStart(5)} ${'popOpen'.padStart(8)} ${'inFrust'.padStart(8)} ${'SPARKCOUNT'.padStart(11)}  gate`);
for (const a of rb.arms ?? []) {
  const d = a.dump;
  if (!d || d.fatal) { console.log(` ${a.arm.padEnd(24)}  (no dump: ${d?.fatal ?? 'missing'})`); continue; }
  let popOpen = 0, inFrust = 0, sc = 0;
  for (let i = 0; i < d.rawCount; i++) {
    const pop = smoothstep(0, 0.22, d.uTimeFx - d.aData[i][2]);
    const scale = d.aData[i][1];
    const p = project(d.aPos[i], d.camera);
    const vis = !!p && p.x >= 0 && p.x < 1280 && p.y >= 0 && p.y < 720;
    if (pop >= POP_MIN) popOpen++;
    if (vis) inFrust++;
    if (pop >= POP_MIN && vis && scale > 0) sc++;
  }
  const k = KB[a.arm];
  const pass = k ? k.expect(sc) : null;
  OUT.arms[a.arm] = { rawCount: d.rawCount, popOpen, inFrustum: inFrust, SPARKCOUNT: sc, uTimeFx: d.uTimeFx, meshVisible: d.meshVisible, control: k?.name ?? null, band: k?.band ?? null, pass };
  console.log(` ${a.arm.padEnd(24)} ${String(d.rawCount).padStart(5)} ${String(popOpen).padStart(8)} ${String(inFrust).padStart(8)} ${String(sc).padStart(11)}  ${k ? `${k.name} ${pass ? 'PASS' : 'FAIL'} — ${k.band}` : ''}`);
}
const kb1 = OUT.arms['traversal-prerollOFF'], kb2 = OUT.arms['traversal-prerollON'];
OUT.licensed = !!(kb1?.pass && kb2?.pass);
/* Arms exist but none carried a readable dump => P-S5 (fx.sparkles / aData unreadable), which is
 * a FATAL of the probe, not a failed control. Kept distinct for the same reason as NO DATA.
 * A control that is ABSENT is likewise not a control that FAILED — the runner writes arms one at a
 * time, so a mid-flight read has fewer arms than shots. Saying "control(s) failed" there would
 * repeat, one layer down, the exact conflation this scorer was corrected to stop making. */
const missing = Object.keys(KB).filter((k) => !(k in OUT.arms));
OUT.missingArms = missing;
OUT.state = Object.keys(OUT.arms).length === 0 ? 'P-S5 FATAL (arms present, no readable dump)'
  : missing.length ? `SCORED — PARTIAL (${Object.keys(OUT.arms).length}/${Object.keys(KB).length} arms; not yet run: ${missing.join(', ')})`
    : OUT.licensed ? 'SCORED — licensed' : 'SCORED — control(s) failed';
if (missing.length) console.log(`\nPARTIAL RUN — arms not yet dumped: ${missing.join(', ')}. Absent is NOT failed.`);
console.log(`\nSTATE: ${OUT.state}`);
console.log(`CALIBRATION LICENCE (seal §4: KB1 AND KB2 must both hold): ${OUT.licensed ? 'GRANTED' : 'NOT GRANTED'}`);
if (!OUT.licensed && Object.keys(OUT.arms).length === 0) console.log('  P-S5: record and stop — no claim may rest on this run.');
if (kb1 && kb1.rawCount > 0 && kb1.SPARKCOUNT === 0) {
  console.log(`  -> KB1 is the decisive one and it discriminates: raw ${kb1.rawCount} markers latched, SPARKCOUNT 0.`);
  console.log('     A raw count would have certified the grammar on a frame whose strict pixel count is 0.');
}
writeFileSync(OUTPATH, JSON.stringify(OUT, null, 1));
console.log(`\nwrote ${path.basename(OUTPATH)}`);
