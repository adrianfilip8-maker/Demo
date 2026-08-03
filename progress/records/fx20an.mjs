/**
 * fx20 scoring — applies the acceptance registered in KNOWN_ISSUES §124.5 and fx20.mjs's own
 * header BEFORE the frames existed. This file decides nothing; it evaluates.
 *
 *   - name the pool whose removal moves |mean ΔL| over DISC above 3.0 while the others stay
 *     under 1.0;
 *   - IF NO POOL CLEARS 3.0 the disc is NOT a batch sprite -> escalate to flames / sparkles /
 *     shafts (the first two are toggled in-run; shafts are counted only);
 *   - `back` must be bit-identical to `base` or EVERY ROW IS VOID — checked first, because a
 *     failed control invalidates the rows rather than ranking them.
 *
 * The "no pool clears 3.0" clause is the difference between an experiment and a ranking: without
 * it this run crowns whichever pool moved most even when the true source is a system it never
 * toggled.
 */
import { readPNG } from '/home/user/Demo/tools/png.mjs';
import { readFileSync, existsSync } from 'node:fs';

const D = '/home/user/Demo/shots/fx20';
const CX = 615, CY = 160, R = 60;              // DISC ROI: 120x120 centred on the reported disc
const X0 = CX - R, Y0 = CY - R, X1 = CX + R, Y1 = CY + R;
const L = (d, o) => 0.2126 * d[o] + 0.7152 * d[o + 1] + 0.0722 * d[o + 2];

if (!existsSync(`${D}/fx20.json`)) { console.log('fx20.json missing — run unfinished'); process.exit(1); }
const J = JSON.parse(readFileSync(`${D}/fx20.json`, 'utf8'));

const load = (n) => existsSync(`${D}/${n}.png`) ? readPNG(`${D}/${n}.png`) : null;
const base = load('temple.base');
if (!base) { console.log('temple.base.png missing'); process.exit(1); }

const roiStats = (im) => {
  let s = 0, n = 0, mn = 255, mx = 0;
  for (let y = Y0; y <= Y1; y++) for (let x = X0; x <= X1; x++) {
    const v = L(im.data, (y * im.w + x) * im.ch);
    s += v; n++; if (v < mn) mn = v; if (v > mx) mx = v;
  }
  return { mean: s / n, min: mn, max: mx, n };
};
const roiDelta = (im) => {
  let s = 0, n = 0, changed = 0;
  for (let y = Y0; y <= Y1; y++) for (let x = X0; x <= X1; x++) {
    const o = (y * im.w + x) * im.ch;
    const g = L(im.data, o) - L(base.data, o);
    s += g; n++;
    const d = Math.abs(im.data[o] - base.data[o]) + Math.abs(im.data[o + 1] - base.data[o + 1]) + Math.abs(im.data[o + 2] - base.data[o + 2]);
    if (d >= 4) changed++;
  }
  return { mean: s / n, changedPct: 100 * changed / n };
};
const framePx = (im) => {
  let n = 0;
  for (let i = 0; i < im.w * im.h; i++) {
    const o = i * im.ch;
    if (Math.abs(im.data[o] - base.data[o]) + Math.abs(im.data[o + 1] - base.data[o + 1]) + Math.abs(im.data[o + 2] - base.data[o + 2]) >= 4) n++;
  }
  return n;
};

console.log('='.repeat(80));
console.log(`fx20 — pink disc pool identification.  DISC ROI (${X0},${Y0})-(${X1},${Y1}), 121x121 px`);
console.log(`base ROI luma: ${JSON.stringify(roiStats(base), (k, v) => typeof v === 'number' ? +v.toFixed(2) : v)}`);

/* ---- control FIRST: a failed back voids every row ---- */
const back = load('temple.back');
let voided = false;
if (!back) { console.log('\n!! temple.back missing — control cannot be evaluated, rows are UNVERIFIED'); voided = true; }
else {
  const bp = framePx(back);
  if (bp === 0) console.log('\nCONTROL: back == base bit-identical (0 px) — rows are scoreable');
  else { console.log(`\n!! CONTROL FAILED: back differs from base by ${bp} px — EVERY ROW BELOW IS VOID`); voided = true; }
}

const POOLS = ['no-dust', 'no-smoke', 'no-sandLow', 'no-sandHigh', 'no-airMotes', 'no-shimmer'];
const SYSTEMS = ['no-flames', 'no-sparkles'];

console.log('\n--- batch pools (the registered population) ---');
const res = [];
for (const v of POOLS) {
  const im = load(`temple.${v}`);
  if (!im) { console.log(`  ${v.padEnd(13)} MISSING`); continue; }
  const d = roiDelta(im), f = framePx(im);
  res.push({ v, ...d, frame: f });
  console.log(`  ${v.padEnd(13)} ROI meanΔL ${d.mean >= 0 ? '+' : ''}${d.mean.toFixed(2)}   ROI changed ${d.changedPct.toFixed(1)}%   whole-frame changed ${f} px`);
}
console.log('\n--- systems (escalation targets, toggled in-run) ---');
const sres = [];
for (const v of SYSTEMS) {
  const im = load(`temple.${v}`);
  if (!im) { console.log(`  ${v.padEnd(13)} MISSING`); continue; }
  const d = roiDelta(im), f = framePx(im);
  sres.push({ v, ...d, frame: f });
  console.log(`  ${v.padEnd(13)} ROI meanΔL ${d.mean >= 0 ? '+' : ''}${d.mean.toFixed(2)}   ROI changed ${d.changedPct.toFixed(1)}%   whole-frame changed ${f} px`);
}

console.log('\n' + '='.repeat(80));
if (voided) {
  console.log('VERDICT: VOID — the control failed or is absent. No pool is named. Re-run required.');
} else {
  const over = res.filter((r) => Math.abs(r.mean) > 3.0);
  const under = res.filter((r) => Math.abs(r.mean) < 1.0);
  if (over.length === 1 && under.length === res.length - 1) {
    console.log(`VERDICT: the disc is \`${over[0].v.replace('no-', '')}\` — ROI meanΔL ${over[0].mean.toFixed(2)}, every other pool under 1.0.`);
  } else if (over.length === 0) {
    console.log('VERDICT: NO POOL CLEARS 3.0 — **the disc is not a batch sprite.**');
    console.log('  Registered escalation: flames / sparkles / shafts.');
    for (const s of sres) console.log(`    ${s.v}: ROI meanΔL ${s.mean.toFixed(2)}${Math.abs(s.mean) > 3.0 ? '  <- CLEARS 3.0' : ''}`);
    const sysHit = sres.filter((s) => Math.abs(s.mean) > 3.0);
    if (sysHit.length === 1) console.log(`  => named at system level: ${sysHit[0].v.replace('no-', '')}`);
    else if (sysHit.length === 0) console.log('  => no toggled system clears either; `shafts` is counted but NOT toggled in this run — that is the untested arm and the next capture.');
  } else {
    console.log(`VERDICT: AMBIGUOUS — ${over.length} pools clear 3.0 (${over.map((r) => r.v).join(', ')}).`);
    console.log('  The registered rule names a pool only when the others stay under 1.0. Not met: no pool is named.');
  }
}

/* provenance + staging stamp, per §122.3/§124.4 */
const b = J.jobs?.['temple.base']?.probe;
if (b) {
  console.log(`\nstaging stamp: tod ${b.tod} keyIsMoon ${b.keyIsMoon} campos ${JSON.stringify(b.cam?.pos)} fov ${b.cam?.fov}`);
  console.log(`live at base: ${Object.entries(b.batches || {}).map(([k, v]) => `${k}=${v.live}`).join(' ')}`);
  console.log(`systems at base: ${Object.entries(b.systems || {}).map(([k, v]) => `${k}=${v.count}`).join(' ')}`);
}
