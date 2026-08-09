/**
 * §269 / PREREG-shadowhold.md §5 — the registered guards, evaluated fail-closed through gate.mjs.
 *
 * Thresholds are transcribed from the PREREG and are NOT re-derived here. Every guard is a
 * boolean or it is VOID; nothing hand-rolls the tri-state (§263.1: a run that did printed
 * "==> SHIP" on a void guard).
 *
 *   node tools/shadowholdscore.mjs shots/shold/scored.json <arm-tag>
 *
 * `scored.json` is the output of `scratchpad/hue/score.py`, the instrument frozen before the
 * candidate existed. This file only compares its numbers to the registered bars.
 */
import { readFileSync } from 'node:fs';
import { shipVerdict, verdictLine, guardState } from './gate.mjs';

const [file, arm] = process.argv.slice(2);
const rows = JSON.parse(readFileSync(file, 'utf8'));
const pick = (shot) => rows.find((r) => r.shot === shot && r.arm === arm);

/* Registered bars — PREREG-shadowhold.md §5, verbatim. */
const BAR = {
  dh: 45.0,
  vratio: [0.20, 0.75],
  sat: { dunes: 0.369, hero: 0.297 },      // baseline - 0.05
  intWarmPct: 6.04, intCoolPct: 56.44,     // 0.75 x baseline
  intWarmHue: 9.4, intCoolHue: 215.3, intHueTol: 15.0, intR: 0.90,
};
const dh = (a, b) => { const d = Math.abs(a - b) % 360; return d <= 180 ? d : 360 - d; };
/** null (=> VOID) when the row or the field is absent; never a silent false. */
const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const cmp = (v, f) => (v === null ? null : f(v));

const d = pick('dunes'), h = pick('hero'), i = pick('interior');
const roi = (r) => (r && r.roi ? r.roi : null);
const dR = roi(d), hR = roi(h), iF = i ? i.frame : null;

const guards = {
  'G1 dunes dh<=45':      cmp(num(dR?.dh), (v) => v <= BAR.dh),
  'G2 hero dh<=45':       cmp(num(hR?.dh), (v) => v <= BAR.dh),
  'G3a dunes V in band':  cmp(num(dR?.vratio), (v) => v >= BAR.vratio[0] && v <= BAR.vratio[1]),
  'G3b hero V in band':   cmp(num(hR?.vratio), (v) => v >= BAR.vratio[0] && v <= BAR.vratio[1]),
  'G4a dunes shade sat':  cmp(num(dR?.sha?.s), (v) => v >= BAR.sat.dunes),
  'G4b hero shade sat':   cmp(num(hR?.sha?.s), (v) => v >= BAR.sat.hero),
  'G5a interior warm%':   cmp(num(iF?.warm_pct), (v) => v >= BAR.intWarmPct),
  'G5b interior cool%':   cmp(num(iF?.cool_pct), (v) => v >= BAR.intCoolPct),
  /* G6 is VOID, not FAIL, when the population is not unimodal: a bimodal circular mean
     describes nothing (ADDENDUM-shadowhue-restate.md §5 hit exactly this). */
  'G6a interior warm hue': (num(iF?.warm_R) === null || iF.warm_R < BAR.intR) ? null
                            : cmp(num(iF?.warm_hue), (v) => dh(v, BAR.intWarmHue) <= BAR.intHueTol),
  'G6b interior cool hue': (num(iF?.cool_R) === null || iF.cool_R < BAR.intR) ? null
                            : cmp(num(iF?.cool_hue), (v) => dh(v, BAR.intCoolHue) <= BAR.intHueTol),
};

const v = shipVerdict(guards);
console.log(`arm: ${arm}`);
for (const [k, s] of Object.entries(v.states)) console.log(`  ${s.padEnd(4)}  ${k}`);
console.log(verdictLine(v, `uShadowHold (${arm})`));
process.exitCode = v.ship ? 0 : 1;
export { guards };
