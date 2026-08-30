#!/usr/bin/env node
/**
 * kkholdpick.mjs — §738's acceptance scorer: pick and then judge the prop-scoped shade-hold
 * strength PER BODY, SORTED, against the architecture's median. Never pooled.
 *
 * ── Why this is a separate file from kkbleachreport.mjs ─────────────────────────────────────
 *
 * §737's report answers "which term owns the deficit". This one answers a different question —
 * "does this strength land the bodies that were short WITHOUT pushing the bodies that were
 * already fine past the reference" — and that question has TWO populations in it, not one. A
 * single mean cannot fail it: a strength that overshoots four bright bodies by as much as it
 * corrects sixteen dull ones moves the mean to exactly the right place and is not a fix. §737.2
 * is the record of this project's own pooled row hiding the defect it was measuring, so the
 * acceptance criterion here is the DISTRIBUTION and the two subsets are always printed apart.
 *
 * THE SUBSETS ARE FIXED BEFORE ANY ARM IS SCORED, off the pre-§738 arm (H000), for the same
 * reason §736.4 fixed its footprint before its arms ran: if "dull" were re-derived per arm, a
 * strength could shrink its own denominator and score well by moving bodies out of the set it is
 * judged on.
 *
 *   node tools/kkholdpick.mjs shots/kkhold --base H000
 *   node tools/kkholdpick.mjs shots/kkhold --base H000 --arms H015,H025,H035,H050,H070,H100
 */
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { loadMask, score } from './kkbleachmask.mjs';

const argv = process.argv.slice(2);
const opt = (n, d) => { const i = argv.indexOf(`--${n}`); if (i < 0) return d; const v = argv[i + 1]; argv.splice(i, 2); return v; };
const DIR = argv.find((a) => !a.startsWith('--')) || 'shots/kkhold';
const BASE = opt('base', 'H000');
const MINPIX = +opt('minpix', '12');
const PICK = String(opt('arms', '')).split(',').filter(Boolean);
/* §739 — which population is the SUBJECT. `PROP` is §738's imported set, `LIME` the procedural
   canopic jars, `TORCH` the six sconces §739 scoped the hold off. Never more than one at a time:
   they are three different subjects with three different bars, and merging them would be the
   pooling error this whole family of sections exists to record. */
const POP = opt('pop', 'PROP');
/* §740 — WHICH AXIS. Eight rounds scored `sat` against the architecture's median and the owner
   kept saying "washed out", which in ordinary use means PALE: bright AND unsaturated. `val` is
   that second axis and it had never been measured. Both are printed; the bar and the subsets are
   taken on whichever is selected, because a body can be short on one and long on the other and
   pooling the two would be this family of sections' own recorded error in a new costume. */
const AXIS = opt('axis', 'sat');
const A = (r) => (AXIS === 'val' ? r.val : r.sat);
const f3 = (x) => (x == null ? '  —  ' : x.toFixed(3));

const rep = JSON.parse(await readFile(path.join(DIR, 'report.json'), 'utf8'));
console.log(`\n§738 shade-hold acceptance — ${DIR}  (sha ${rep.sha}, ${rep.w}x${rep.h}, stride ${rep.stride})`);

for (const [shot, rec] of Object.entries(rep.shots)) {
  if (!rec.mask) continue;
  const mask = await loadMask(path.join(DIR, rec.mask));
  for (const [grade, g] of Object.entries(rec.grades || {})) {
    const ids = PICK.length ? [BASE, ...PICK] : Object.keys(g.pngs);
    const arms = {};
    for (const a of ids) {
      if (!g.pngs[a]) continue;
      arms[a] = Object.fromEntries((await score(path.join(DIR, g.pngs[a]), mask, { minPix: MINPIX })).map((r) => [r.id, r]));
    }
    const base = arms[BASE];
    if (!base) { console.log(`  ${shot} ${grade}: no ${BASE} arm`); continue; }

    const props = Object.values(base).filter((r) => r.pop === POP && !r.thin);
    const arch = Object.values(base).filter((r) => r.pop === 'ARCH' && !r.thin);
    if (!props.length || !arch.length) continue;
    /* The BAR: the architecture's median SURFACE saturation in this frame. A median over
       surfaces, not an area-weighted mean, because the owner's reference is "the masonry looks
       right" and one enormous wall should not be the whole bar. */
    const archSats = arch.map((r) => A(r)).sort((a, b) => a - b);
    const BAR = archSats[Math.floor(archSats.length / 2)];
    const dull = props.filter((r) => A(r) < BAR).map((r) => r.id);
    const fine = props.filter((r) => A(r) >= BAR).map((r) => r.id);

    console.log(`\n${'='.repeat(112)}\n${shot} · ${grade}   SUBJECT ${POP}  AXIS ${AXIS}   architecture median surface saturation = ${f3(BAR)}   (${arch.length} surfaces: ${archSats.map(f3).join(' ')})`);
    console.log(`   subsets fixed on ${BASE}:  DULL ${dull.length} bodies (below the bar)   ALREADY-FINE ${fine.length} bodies (at or above it)\n`);

    const stat = (arm, set) => {
      const v = set.map((id) => (arms[arm]?.[id] ? A(arms[arm][id]) : null)).filter((x) => x != null).sort((a, b) => a - b);
      if (!v.length) return null;
      return {
        n: v.length, min: v[0], med: v[Math.floor(v.length / 2)], max: v[v.length - 1],
        below: v.filter((x) => x < BAR).length, over: v.filter((x) => x > BAR).length,
      };
    };
    console.log(`   ${'arm'.padEnd(6)} ${'DULL med'.padStart(9)} ${'vs bar'.padStart(8)} ${'still<bar'.padStart(10)}   ${'FINE med'.padStart(9)} ${'vs bar'.padStart(8)} ${'now>bar'.padStart(8)} ${'FINE max'.padStart(9)}`);
    for (const a of Object.keys(arms)) {
      const d = stat(a, dull), f = stat(a, fine);
      if (!d || !f) continue;
      console.log(`   ${a.padEnd(6)} ${f3(d.med).padStart(9)} ${((d.med - BAR >= 0 ? '+' : '') + (d.med - BAR).toFixed(3)).padStart(8)} ${String(d.below + '/' + d.n).padStart(10)}   ${f3(f.med).padStart(9)} ${((f.med - BAR >= 0 ? '+' : '') + (f.med - BAR).toFixed(3)).padStart(8)} ${String(f.over + '/' + f.n).padStart(8)} ${f3(f.max).padStart(9)}`);
    }

    /* Every body, sorted, base against each arm — the table the acceptance is actually read off. */
    const order = [...dull, ...fine].sort((a, b) => A(base[a]) - A(base[b]));
    const cols = Object.keys(arms).filter((a) => a !== BASE);
    console.log(`\n   PER BODY, sorted by ${BASE} saturation. '*' marks a body above the bar ${f3(BAR)}.`);
    console.log(`   ${'body'.padEnd(20)} ${'n'.padStart(5)} ${(BASE).padStart(7)}  ${cols.map((c) => c.padStart(7)).join(' ')}`);
    for (const id of order) {
      const b = base[id];
      const cells = cols.map((c) => {
        const r = arms[c]?.[id];
        return r == null ? '     — ' : (f3(A(r)) + (A(r) > BAR ? '*' : ' ')).padStart(7);
      });
      /* The OTHER axis is carried alongside, base and best arm, so a change that fixes one by
         wrecking the other cannot be read as a clean win. */
      const other = (r) => (AXIS === 'val' ? r.sat : r.val);
      const last = cols.length ? arms[cols[cols.length - 1]]?.[id] : null;
      console.log(`   ${b.mesh.slice(0, 20).padEnd(20)} ${String(b.n).padStart(5)} ${(f3(A(b)) + (A(b) > BAR ? '*' : ' ')).padStart(7)}  ${cells.join(' ')}   | ${AXIS === 'val' ? 'sat' : 'val'} ${f3(other(b))}${last ? ' -> ' + f3(other(last)) : ''}`);
    }

    /* The populations that must NOT move. Printed as a max absolute delta over bodies, because a
       mean would hide one wall moving a lot inside many that did not. */
    console.log(`\n   MUST NOT MOVE — max |Δ| over bodies vs ${BASE}, worst of the TWO axes:`);
    for (const popName of ['ARCH', 'CHAR', 'OTHER', 'PROP', 'LIME', 'TORCH'].filter((p) => p !== POP)) {
      const set = Object.values(base).filter((r) => r.pop === popName && !r.thin).map((r) => r.id);
      if (!set.length) continue;
      const line = cols.map((c) => {
        let mx = 0, who = '';
        for (const id of set) { const r = arms[c]?.[id]; if (!r) continue; const d = Math.max(Math.abs(r.sat - base[id].sat), Math.abs(r.val - base[id].val)); if (d > mx) { mx = d; who = base[id].mesh; } }
        return `${c} ${mx.toFixed(4)}${mx > 0.0005 ? ` (${who})` : ''}`;
      });
      console.log(`     ${popName.padEnd(6)} ${set.length} bodies:  ${line.join('   ')}`);
    }
  }
}
console.log('');
