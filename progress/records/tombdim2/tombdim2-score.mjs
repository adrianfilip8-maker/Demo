/**
 * PREREG-tombdim2 §6 — the registered scorer. Reads progress/records/tombdim21/ and prints the
 * verdict through tools/gate.mjs (tri-state: VOID is not PASS; ship = every row PASS for a
 * candidate arm AND the binding LOOK gate §8, which a human scores from the frames).
 *
 *   node progress/records/tombdim2/tombdim2-score.mjs
 *
 * TWO SHIP CANDIDATES, ONE BAR SET, ONE PREFERENCE ORDER, all fixed before the capture
 * (§6.1): p30 (tombAmb 0.30 x localToon 6.0) then p45 (0.45 x 4.0). The `amb`, `pool` and
 * `p30hi` arms are CONTROLS/dose arms and are never shipped from this seal — their rows are
 * printed, and two of them are load-bearing: `amb` is registered to FAIL D2/D3 (it reproduces
 * §307's known failure inside this boot) and KO reads the pool axis off `pool`/`p30`/`p30hi`.
 * Exit 0 iff some candidate arm passes every bar.
 */
import {
  ROSTER, manifest, row, img, stats, population, diffPx, bool, rBars, treeBar, DIR,
} from './tombdim2-lib.mjs';
import { shipVerdict, verdictLine } from '../../../tools/gate.mjs';

/* ── the registered arm table (seal §5) ──────────────────────────────────────────────────── */
const ARM = {
  off:   { tomb: 1.00, local: 2.5 },
  amb:   { tomb: 0.30, local: 2.5 },
  pool:  { tomb: 1.00, local: 6.0 },
  p30:   { tomb: 0.30, local: 6.0 },
  p45:   { tomb: 0.45, local: 4.0 },
  p30hi: { tomb: 0.30, local: 8.0 },
  back:  { tomb: 1.00, local: 2.5 },
  xtr:   { tomb: 0.30, local: 8.0 },
};
const CANDIDATES = ['p30', 'p45'];          // preference order, registered
const INTERIOR_ARMS = ['off', 'amb', 'pool', 'p30', 'p45', 'p30hi', 'back'];
const EXPECT_ROWS = 52;
/* uShadowColor luminance ratio vs off — EXACT, from t2model.mjs §(1) (the §261 cap release) */
const SC_RATIO = { 1.00: 1.0, 0.30: 0.40879, 0.45: 0.61319 };

/* ── ROIs (seal §4) ──────────────────────────────────────────────────────────────────────── */
const ROIS = {
  FAR:   [380, 30, 560, 120],    // carried by citation, PREREG-tombdim §4 (ambient-owned, + a small pool leg)
  VAULT: [560, 10, 900, 90],     // carried by citation (the CLEAN ambient-owned rect: no pool leg, no bloom specks)
  POOL:  [292, 432, 392, 490],   // carried by citation (torchlight POOL, pool-owned)
  CTRL:  [150, 560, 520, 700],   // carried by citation (floor between pools — pool+ambient mix)
  SARC:  [600, 120, 840, 300],   // carried by citation (sarcophagus + dais + the wall it sits against)
  GOLD:  [600, 155, 840, 290],   // NEW (seal §4): the treasure itself — mask, chest, gold plinth band
  JARS:  [800, 455, 882, 508],   // NEW: the brightest non-flame population in frame (r12's "jars outshine the treasure")
  JARSL: [437, 362, 495, 458],   // NEW, reported
  JARST: [368, 336, 440, 420],   // NEW, reported
};

const guards = {};
const report = [];

/* R1–R16 — same-boot validity: diff(off, back) == 0 per shot (§302). */
Object.assign(guards, rBars(report));

/* B — protection: diff(off, xtr) == 0 on every NON-interior shot. Above ground the tombAmb
   weight is exactly 0 (factor exactly 1) and every fire is above the shader's y < -0.5 gate
   (exactly x0.0), so the extreme pair bounds every milder one. */
for (const shot of ROSTER) {
  if (shot === 'interior') continue;
  const d = diffPx(img(row(shot, 'off')), img(row(shot, 'xtr')));
  report.push(`B ${shot.padEnd(12)} off-vs-xtr  ${d} px`);
  guards[`B_${shot}`] = guards[`R_${shot}`] !== true ? null : (d === null ? null : d === 0);
}

/* ── ROI statistics on the interior arms ─────────────────────────────────────────────────── */
const S = {}, POP = {};
for (const arm of INTERIOR_ARMS) {
  const im = img(row('interior', arm));
  if (!im) { S[arm] = null; continue; }
  S[arm] = Object.fromEntries(Object.entries(ROIS).map(([k, r]) => [k, stats(im, r)]));
  POP[arm] = population(im);
}
report.push('');
for (const arm of INTERIOR_ARMS) {
  if (!S[arm]) { report.push(`${arm}: MISSING`); continue; }
  const a = ARM[arm];
  report.push(`-- ${arm} (tombAmb ${a.tomb}, localToon ${a.local})`);
  for (const k of Object.keys(ROIS)) {
    const s = S[arm][k];
    report.push(`   ${k.padEnd(6)} L ${s.meanL.toFixed(1).padStart(6)}  R-B ${s.meanRB.toFixed(1).padStart(6)}  hue ${s.hMean.toFixed(0).padStart(3)}  S ${s.meanS.toFixed(3)}  dark ${s.dark.toFixed(3)}`);
  }
  const p = POP[arm];
  report.push(`   FRAME (reported, never barred): meanL ${p.meanL.toFixed(1)} sd ${p.sd.toFixed(1)}  cool(R-B<=-5) ${(p.cool * 100).toFixed(1)}%  warm(R-B>=20) ${(p.warm * 100).toFixed(1)}%  dark(L<40) ${(p.dark * 100).toFixed(1)}%  bright(L>120) ${(p.bright * 100).toFixed(1)}%`);
}
report.push('');

const okBase = guards.R_interior === true && S.off;

/* BG — the diagnosed staging must be present on the off arm (fail-closed). Bands are the
   parent run's measured off values (RESULT-gradetrio / tombdim-score.log) with margin; the
   interior frame was MEASURED byte-identical under both levers that shipped since
   (interior.off vs interior.con vs interior.don, 0 px, same boot), so this base is the same
   picture function as the parent's. */
guards.BG = !S.off ? null : (
  S.off.POOL.meanRB >= 40 && S.off.POOL.meanL >= 80 && S.off.POOL.meanL <= 110
  && S.off.FAR.meanL >= 50 && S.off.FAR.meanL <= 78 && S.off.FAR.meanRB <= -5
  && S.off.VAULT.meanL >= 60 && S.off.VAULT.meanL <= 88 && S.off.VAULT.meanRB <= -8
  && S.off.CTRL.meanL >= 70 && S.off.CTRL.meanL <= 100
  && S.off.GOLD.meanL >= 60 && S.off.GOLD.meanL <= 85
  && S.off.JARS.meanL >= 110 && S.off.JARS.meanL <= 138);

const gated = okBase && guards.BG === true;

/* ── KO — the co-lever's dose axis (shared; not per-candidate) ───────────────────────────── */
if (gated && S.amb && S.pool && S.p30 && S.p30hi) {
  const a = S.amb.POOL.meanL, b = S.p30.POOL.meanL, c = S.p30hi.POOL.meanL;
  const p = S.pool.POOL.meanL, o = S.off.POOL.meanL;
  report.push(`KO  POOL L: amb ${a.toFixed(1)} -> p30 ${b.toFixed(1)} -> p30hi ${c.toFixed(1)} (want +8 then +1.0); pool ${p.toFixed(1)} vs off ${o.toFixed(1)} (want >= off+5)`);
  guards.KO = b >= a + 8 && c >= b + 1.0 && p >= o + 5;
} else guards.KO = null;

/* ── per-candidate bars (seal §6; identical bands for every candidate) ───────────────────── */
function candidateBars(arm) {
  const g = {};
  const rep = [];
  if (!gated || !S[arm]) {
    for (const k of ['D1', 'D2', 'D3', 'H1', 'H2', 'W1', 'W2', 'CT']) g[k] = null;
    return { g, rep };
  }
  const c = S[arm], o = S.off;
  const rF = c.FAR.meanL / o.FAR.meanL, rV = c.VAULT.meanL / o.VAULT.meanL;
  rep.push(`D1  darkness: FAR ratio ${rF.toFixed(3)} (want 0.30-0.85)  VAULT ratio ${rV.toFixed(3)} (want 0.30-0.72)`);
  g.D1 = rF >= 0.30 && rF <= 0.85 && rV >= 0.30 && rV <= 0.72;

  const hP = c.POOL.meanL / o.POOL.meanL;
  rep.push(`D2  POOL absolute hold ${hP.toFixed(3)} (want >= 0.90; §307's ambient-only arm scored 0.797)  ${c.POOL.meanL.toFixed(1)} vs ${o.POOL.meanL.toFixed(1)} L`);
  g.D2 = hP >= 0.90;

  const hS = c.SARC.meanL / o.SARC.meanL, hG = c.GOLD.meanL / o.GOLD.meanL;
  rep.push(`D3  SARC absolute hold ${hS.toFixed(3)} (want >= 0.78; §307 scored 0.702)   GOLD hold ${hG.toFixed(3)} (reported)`);
  g.D3 = hS >= 0.78;

  const fG = c.GOLD.meanL - c.VAULT.meanL, fS = c.SARC.meanL - c.VAULT.meanL;
  rep.push(`H1  focal: GOLD-VAULT ${fG.toFixed(1)} L (want >= +12; off ${(o.GOLD.meanL - o.VAULT.meanL).toFixed(1)})   SARC-VAULT ${fS.toFixed(1)} (want >= +8; off ${(o.SARC.meanL - o.VAULT.meanL).toFixed(1)})`);
  g.H1 = fG >= 12 && fS >= 8;

  const jr = c.JARS.meanL / c.GOLD.meanL, jo = o.JARS.meanL / o.GOLD.meanL;
  rep.push(`H2  hierarchy non-regression: JARS/GOLD ${jr.toFixed(3)} vs off ${jo.toFixed(3)} (want <= ${(1.15 * jo).toFixed(3)})  [inversion is NOT claimed — seal §9]`);
  g.H2 = jr <= 1.15 * jo;

  const W = c.POOL.meanRB - c.VAULT.meanRB, Wo = o.POOL.meanRB - o.VAULT.meanRB;
  rep.push(`W1  warm/cool separation ${W.toFixed(1)} vs off ${Wo.toFixed(1)} (want >= ${(Wo + 30).toFixed(1)})`);
  g.W1 = W >= Wo + 30;

  rep.push(`W2  the dark field stays violet: VAULT R-B ${c.VAULT.meanRB.toFixed(1)} (want <= -8; off ${o.VAULT.meanRB.toFixed(1)})   [FAR R-B ${c.FAR.meanRB.toFixed(1)} reported, not barred — seal §4]`);
  g.W2 = c.VAULT.meanRB <= -8;

  const dC = c.CTRL.meanL - o.CTRL.meanL;
  rep.push(`CT  floor between pools dL ${dC.toFixed(1)} (want -34..-6)`);
  g.CT = dC >= -34 && dC <= -6;
  return { g, rep };
}

/* ── VB — readbacks ──────────────────────────────────────────────────────────────────────── */
{
  let ok = true, n = 0;
  const offI = row('interior', 'off')?.readback;
  for (const shot of ROSTER) {
    const arms = shot === 'interior' ? INTERIOR_ARMS : ['off', 'xtr', 'back'];
    const o = row(shot, 'off')?.readback;
    if (!o) { ok = null; break; }
    for (const arm of arms) {
      const r = row(shot, arm)?.readback;
      if (!r) { ok = null; break; }
      n++;
      const a = ARM[arm];
      if (r.tombAmb !== a.tomb || r.localToon !== a.local) { ok = false; report.push(`VB: ${shot}.${arm} echoes ${r.tombAmb}/${r.localToon}, want ${a.tomb}/${a.local}`); break; }
      if (r.uLocalToon !== a.local) { ok = false; report.push(`VB: ${shot}.${arm} uLocalToon ${r.uLocalToon} != ${a.local} — the publish path dropped the poke`); break; }
      if (shot === 'interior') {
        if (!(r.camY < -2.5)) { ok = false; report.push(`VB: interior camY ${r.camY}`); break; }
        if (r.tombF !== a.tomb) { ok = false; report.push(`VB: interior.${arm} tombF ${r.tombF} != ${a.tomb}`); break; }
        if (Math.abs(r.uAmbIntensity - offI.uAmbIntensity * a.tomb) > 1e-12) { ok = false; report.push(`VB: interior.${arm} uAmbIntensity ${r.uAmbIntensity} != off x ${a.tomb}`); break; }
        const lr = (0.2126 * r.uShadowColor.r + 0.7152 * r.uShadowColor.g + 0.0722 * r.uShadowColor.b)
          / (0.2126 * offI.uShadowColor.r + 0.7152 * offI.uShadowColor.g + 0.0722 * offI.uShadowColor.b);
        if (Math.abs(lr - SC_RATIO[a.tomb]) > 5e-4) { ok = false; report.push(`VB: interior.${arm} uShadowColor lum ratio ${lr.toFixed(5)} != ${SC_RATIO[a.tomb]} (cap release)`); break; }
        if (arm === 'p30') report.push(`VB: interior.p30 uShadowColor lum ratio ${lr.toFixed(5)} (model ${SC_RATIO[0.30]}, §261 cap release)`);
      } else {
        if (r.tombF !== 1) { ok = false; report.push(`VB: ${shot}.${arm} tombF ${r.tombF} != 1 though above ground`); break; }
        if (r.uAmbIntensity !== o.uAmbIntensity) { ok = false; report.push(`VB: ${shot}.${arm} uAmbIntensity moved though above ground`); break; }
        const same = r.uShadowColor.r === o.uShadowColor.r && r.uShadowColor.g === o.uShadowColor.g && r.uShadowColor.b === o.uShadowColor.b;
        if (!same) { ok = false; report.push(`VB: ${shot}.${arm} uShadowColor moved though above ground`); break; }
      }
    }
    if (ok !== true) break;
  }
  guards.VB = ok === null ? null : (ok && n === EXPECT_ROWS);
}

/* V4 — row census + one src hash == the launch-derived HEAD archive hash. */
guards.V4 = treeBar(report, EXPECT_ROWS);

/* ── verdicts: one per candidate arm, shared bars + that arm's bars ──────────────────────── */
const shared = {};
for (const k of Object.keys(guards)) shared[k] = bool(guards[k]);

console.log(report.join('\n'));
console.log('');
/* controls: printed for the record; `amb` is registered to FAIL D2/D3 (§307 inside this boot) */
for (const ctrl of ['amb', 'pool', 'p30hi']) {
  const { rep } = candidateBars(ctrl);
  console.log(`== CONTROL ${ctrl} (tombAmb ${ARM[ctrl].tomb} x localToon ${ARM[ctrl].local}) — never shipped from this seal`);
  console.log(rep.map((l) => `   ${l}`).join('\n'));
  console.log('');
}

let shipped = null;
for (const arm of CANDIDATES) {
  const { g, rep } = candidateBars(arm);
  const all = { ...shared };
  for (const [k, v] of Object.entries(g)) all[k] = bool(v);
  const v = shipVerdict(all);
  console.log(`== CANDIDATE ${arm} (tombAmb ${ARM[arm].tomb} x localToon ${ARM[arm].local})`);
  console.log(rep.map((l) => `   ${l}`).join('\n'));
  const order = ['D1', 'D2', 'D3', 'H1', 'H2', 'W1', 'W2', 'CT', 'KO', 'BG', 'VB', 'V4'];
  console.log('   ' + order.map((k) => `${k}:${v.states[k]}`).join('  '));
  const rb = Object.keys(v.states).filter((k) => (k.startsWith('R_') || k.startsWith('B_')) && v.states[k] !== 'PASS');
  console.log(`   R/B bars: ${rb.length ? `NOT PASS -> ${rb.join(', ')}` : 'all 31 PASS'}`);
  console.log('   ' + verdictLine(v, `TUNE.tombAmb = ${ARM[arm].tomb} WITH TUNE.localToon = ${ARM[arm].local} (paired; the LOOK gate §8 still binds before any write)`));
  console.log('');
  if (v.ship && !shipped) shipped = arm;
}

console.log(shipped
  ? `==> registered preference order [${CANDIDATES.join(', ')}] -> the first arm passing every bar is ${shipped}. LOOK gate §8 decides the ship.`
  : '==> DO NOT SHIP — no candidate arm passed every bar (PF1: tombAmb stays 1.0, localToon stays 2.5, finding recorded).');
console.log(`frames: ${DIR}  (manifest head ${manifest.head?.slice(0, 12)})`);
process.exit(shipped ? 0 : 1);
