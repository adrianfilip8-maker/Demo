/**
 * guardart-score.mjs — PREREG-guardart §4's bar table, verbatim, through tools/gate.mjs.
 * Consumes off / askin / aon / back rows of progress/records/guardpass1/. VOID is not PASS;
 * ship = every gate row PASS + the binding LOOK (a human step, §9 of the PREREG).
 */
import {
  ROSTER, manifest, row, img, stats, diffPx, diffSplit, lumaOf,
  erode, dilate, intersect, rectArea, probeOf, subjectBox, guardBoxes, anyGuardInFrame,
  rBars, treeBar,
} from './guardpass-lib.mjs';
import { shipVerdict, verdictLine, guardState } from '../../../tools/gate.mjs';

const report = [];
const guards = {};
const num = (v, d = 2) => (v === null || v === undefined || Number.isNaN(v) ? 'n/a' : (+v).toFixed(d));

/* ── shared validity ────────────────────────────────────────────────────────────────────── */
guards['V-TREE'] = treeBar(report);
Object.assign(guards, rBars(report));

/* ── AV1 structural (probe) ─────────────────────────────────────────────────────────────── */
{
  const off = probeOf('guard', 'off'), askin = probeOf('guard', 'askin'), aon = probeOf('guard', 'aon');
  const offCrown = off?.crown?.bone ?? null;
  const skinCrown = askin?.crown?.bone ?? null;
  const aonCrown = aon?.crown?.bone ?? null;
  const humanoids = (aon?.guards || []).filter((g) => g.carm);
  const matsLive = humanoids.length > 0 && humanoids.every((g) => g.mats.length >= 1 && g.mats.every((m) => m.sly && m.vc));
  const shellsOn = humanoids.length > 0 && humanoids.every((g) => g.shell && g.shellVisible);
  const hairOff = probeOf('guard', 'off')?.hair || null;
  const hairOn = aon?.hair || null;
  const hairOffId = !!hairOff && Math.abs(hairOff[0] - 1) < 1e-3 && Math.abs(hairOff[1] - 1) < 1e-3 && Math.abs(hairOff[2] - 1) < 1e-3;
  /* lapis #1f4f96 lands ≈ [0.014, 0.083, 0.303] LINEAR (THREE.Color hex→linear, the same
     convention the procedural PAL paints in), ±5.5% jitter ⇒ b ∈ [0.286, 0.320]. */
  const hairOnLapis = !!hairOn && hairOn[2] > 0.22 && hairOn[2] > hairOn[0] * 2;
  report.push(`AV1 crown off=${offCrown} askin=${skinCrown} aon=${aonCrown} (want neck→head→head); `
    + `mats sly+vc=${matsLive} (${humanoids.length} humanoids); shells=${shellsOn}; hair off=${JSON.stringify(hairOff)} aon=${JSON.stringify(hairOn)}`);
  guards.AV1 = (off && askin && aon)
    ? (offCrown === 'neck' && skinCrown === 'head' && aonCrown === 'head'
       && matsLive && shellsOn && hairOffId && hairOnLapis)
    : null;
}

/* ── the guard-shot subject ROIs ────────────────────────────────────────────────────────── */
const sbOn = subjectBox('guard', 'aon');
const core = erode(sbOn, 0.15);
const aonIm = img(row('guard', 'aon'));
const offIm = img(row('guard', 'off'));

/* ── AP1 palette (core: mean S >= 0.12; warm∪lapis share >= 0.45 among S>=0.06 px) ──────── */
{
  let g = null;
  if (aonIm && core) {
    let n = 0, ssum = 0, fam = 0;
    for (let y = core[1]; y < core[3]; y++) for (let x = core[0]; x < core[2]; x++) {
      const o = (y * aonIm.w + x) * aonIm.ch;
      const R = aonIm.data[o] / 255, G = aonIm.data[o + 1] / 255, B = aonIm.data[o + 2] / 255;
      const mx = Math.max(R, G, B), mn = Math.min(R, G, B), d = mx - mn;
      const S = mx > 1e-6 ? d / mx : 0;
      let h = 0;
      if (d > 1e-6) {
        if (mx === R) h = ((G - B) / d) % 6; else if (mx === G) h = (B - R) / d + 2; else h = (R - G) / d + 4;
        h *= 60; if (h < 0) h += 360;
      }
      n++; ssum += S;
      if (S >= 0.06 && ((h >= 15 && h <= 60) || (h >= 190 && h <= 240))) fam++;
    }
    const meanS = n ? ssum / n : NaN;
    const share = n ? fam / n : NaN;
    const offS = offIm && core ? stats(offIm, core).meanS : NaN;
    report.push(`AP1 core ${JSON.stringify(core)} n=${n} meanS=${num(meanS, 3)} (off ${num(offS, 3)}) famShare=${num(share, 3)}`);
    g = n > 500 ? (meanS >= 0.12 && share >= 0.45) : null;
  } else report.push('AP1 core/frames missing');
  guards.AP1 = g;
}

/* ── AP2 kaykit distance read ───────────────────────────────────────────────────────────── */
{
  const kOn = img(row('kaykit', 'aon')), kOff = img(row('kaykit', 'off'));
  const boxes = (probeOf('kaykit', 'aon')?.guards || [])
    .map((g) => g.bbox).filter((b) => b && (b[2] - b[0]) >= 6);
  let g = null;
  if (kOn && kOff && boxes.length) {
    let sOn = 0, sOff = 0, n = 0;
    for (const b of boxes) {
      const st1 = stats(kOn, b), st0 = stats(kOff, b);
      sOn += st1.meanS * st1.n; sOff += st0.meanS * st0.n; n += st1.n;
    }
    sOn /= n; sOff /= n;
    report.push(`AP2 kaykit ${boxes.length} guard boxes, ${n} px: meanS on=${num(sOn, 3)} off=${num(sOff, 3)} (want >= off+0.04 and >= 0.10)`);
    g = sOn >= sOff + 0.04 && sOn >= 0.10;
  } else report.push(`AP2 kaykit boxes=${boxes.length} — no scoreable population`);
  guards.AP2 = g;
}

/* ── AC1 cel bands (core luma: flat share >= 0.40; >= 2 modes >=10% mass, >=16L apart) ──── */
{
  let g = null;
  if (aonIm && core && rectArea(core) > 500) {
    const W = core[2] - core[0], H = core[3] - core[1];
    const L = new Float32Array(W * H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++)
      L[y * W + x] = lumaOf(aonIm, ((y + core[1]) * aonIm.w + (x + core[0])) * aonIm.ch);
    let flat = 0, inner = 0;
    const hist = new Array(32).fill(0);
    for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
      const c = L[y * W + x];
      let mx = 0;
      for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, 1], [-1, 1], [1, -1]]) {
        const d = Math.abs(L[(y + dy) * W + (x + dx)] - c);
        if (d > mx) mx = d;
      }
      inner++;
      if (mx < 2.5) flat++;
      hist[Math.min(31, c / 8 | 0)]++;
    }
    const flatShare = flat / inner;
    /* modes: local maxima of the 16-bin (8L) histogram with >= 10% mass */
    const h16 = new Array(32).fill(0);
    hist.forEach((v, i) => { h16[i] = v; });
    const modes = [];
    for (let i = 0; i < 32; i++) {
      const v = h16[i];
      if (v / inner < 0.10) continue;
      if ((i === 0 || h16[i - 1] <= v) && (i === 31 || h16[i + 1] < v)) modes.push({ i, v });
    }
    let apart = false;
    for (let a = 0; a < modes.length; a++) for (let b = a + 1; b < modes.length; b++)
      if (Math.abs(modes[a].i - modes[b].i) * 8 >= 16) apart = true;
    report.push(`AC1 flatShare=${num(flatShare, 3)} modes=${modes.map((m) => `${m.i * 8}L:${num(m.v / inner, 2)}`)} apart=${apart}`);
    g = flatShare >= 0.40 && modes.length >= 2 && apart;
  } else report.push('AC1 core/frames missing');
  guards.AC1 = g;
}

/* ── AI1 ink (shells all + dark ring share >= 0.06 in the outer 12% band) ───────────────── */
{
  const aonP = probeOf('guard', 'aon');
  const humanoids = (aonP?.guards || []).filter((g) => g.carm);
  const shells = humanoids.length > 0 && humanoids.every((g) => g.shell && g.shellVisible);
  let g = null;
  if (aonIm && sbOn) {
    const inner = erode(sbOn, 0.12);
    let n = 0, dark = 0;
    for (let y = sbOn[1]; y < sbOn[3]; y++) for (let x = sbOn[0]; x < sbOn[2]; x++) {
      if (inner && x >= inner[0] && x < inner[2] && y >= inner[1] && y < inner[3]) continue;
      n++;
      if (lumaOf(aonIm, (y * aonIm.w + x) * aonIm.ch) <= 40) dark++;
    }
    const share = n ? dark / n : NaN;
    const offShare = (() => {
      if (!offIm) return NaN;
      let n0 = 0, d0 = 0;
      for (let y = sbOn[1]; y < sbOn[3]; y++) for (let x = sbOn[0]; x < sbOn[2]; x++) {
        if (inner && x >= inner[0] && x < inner[2] && y >= inner[1] && y < inner[3]) continue;
        n0++;
        if (lumaOf(offIm, (y * offIm.w + x) * offIm.ch) <= 40) d0++;
      }
      return n0 ? d0 / n0 : NaN;
    })();
    report.push(`AI1 shells=${shells} ring n=${n} darkShare on=${num(share, 3)} (off ${num(offShare, 3)})`);
    g = n > 300 ? (shells && share >= 0.06) : null;
  } else report.push('AI1 subject bbox/frames missing');
  guards.AI1 = g;
}

/* ── AR1 rim (bbox px with B−R >= 10 ∧ L >= 96: count >= 200) ───────────────────────────── */
{
  let g = null;
  if (aonIm && sbOn) {
    let cnt = 0, cntOff = 0;
    for (let y = sbOn[1]; y < sbOn[3]; y++) for (let x = sbOn[0]; x < sbOn[2]; x++) {
      const o = (y * aonIm.w + x) * aonIm.ch;
      if (aonIm.data[o + 2] - aonIm.data[o] >= 10 && lumaOf(aonIm, o) >= 96) cnt++;
      if (offIm) {
        const q = (y * offIm.w + x) * offIm.ch;
        if (offIm.data[q + 2] - offIm.data[q] >= 10 && lumaOf(offIm, q) >= 96) cntOff++;
      }
    }
    report.push(`AR1 rim px on=${cnt} (off ${cntOff}) want >= 200`);
    g = cnt >= 200;
  } else report.push('AR1 subject bbox/frames missing');
  guards.AR1 = g;
}

/* ── AS1 skin attribution (guard: off vs askin) ─────────────────────────────────────────── */
{
  const askinIm = img(row('guard', 'askin'));
  const b0 = subjectBox('guard', 'off'), b1 = subjectBox('guard', 'askin');
  let g = null;
  if (askinIm && offIm && (b0 || b1)) {
    const container = [b0, b1].filter(Boolean).map((b) => dilate(b, 32));
    const split = diffSplit(offIm, askinIm, container);
    report.push(`AS1 off-vs-askin inside=${split.inside} outside=${split.outside} (want >=4000 inside, <=900 outside)`);
    g = split.inside >= 4000 && split.outside <= 900;
  } else report.push('AS1 frames/boxes missing');
  guards.AS1 = g;
}

/* ── PROT-A per shot (PREREG-guardart §5's registered rule) ─────────────────────────────── */
for (const shot of ROSTER) {
  if (shot === 'guard') continue;
  const a = img(row(shot, 'off')), b = img(row(shot, 'aon'));
  const clean = !anyGuardInFrame(shot, 'off');
  let g = null;
  if (a && b) {
    if (clean) {
      const d = diffPx(a, b);
      report.push(`PROT-A ${shot.padEnd(12)} CLEAN  off-vs-aon ${d} px (want 0)`);
      g = d === 0;
    } else {
      const container = [...guardBoxes(shot, 'off'), ...guardBoxes(shot, 'aon')];
      const split = diffSplit(a, b, container);
      report.push(`PROT-A ${shot.padEnd(12)} AFFECT inside=${split.inside} outside=${split.outside} (want outside <= 900)`);
      g = split.outside <= 900;
    }
  } else report.push(`PROT-A ${shot} frames missing`);
  guards[`PROT-A_${shot}`] = g;
}

/* fail-closed gating: A bars are VOID unless R_guard passed; PROT rows unless their own R. */
if (guards.R_guard !== true) for (const k of ['AV1', 'AP1', 'AC1', 'AI1', 'AR1', 'AS1']) guards[k] = null;
if (guards.R_kaykit !== true) guards.AP2 = null;
for (const shot of ROSTER) if (shot !== 'guard' && guards[`R_${shot}`] !== true) guards[`PROT-A_${shot}`] = null;

/* ── verdict ────────────────────────────────────────────────────────────────────────────── */
console.log('── guardart-score — PREREG-guardart §4 ──');
for (const line of report) console.log('  ' + line);
const v = shipVerdict(guards);
console.log('\nbars:');
for (const [k, s] of Object.entries(v.states)) console.log(`  ${k.padEnd(20)} ${s}`);
console.log('\n' + verdictLine(v, 'guardArt 1 + guardSkin 1 (LOOK gate still binding — PREREG-guardart §9.4)'));
process.exit(v.ship ? 0 : 1);
