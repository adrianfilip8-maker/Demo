/**
 * guardcone-score.mjs — PREREG-guardcone §3's bar table, verbatim, through tools/gate.mjs.
 *
 * FORK of progress/records/guardpass/guardcone-score.mjs, re-pointed at the cone-only capture
 * per AMENDMENT A1 (§309). Consumes off / bon / blamp / back rows of
 * progress/records/guardcone1/. VOID is not PASS; ship = every gate row PASS + the binding
 * LOOK.
 *
 * Diff against the sealed scorer, exhaustively:
 *   - imports guardcone-lib.mjs (DIR guardcone1/, treeBar census 49) instead of guardpass-lib
 *   - PARK1 added (A1.2) + its fail-closed cascade
 *   - the `abon` LOOK pointer in the verdict line drops (A1.2 — the arm is not captured)
 *   - AMENDMENT A2: the single-process **V-TREE is replaced by V_CHUNK_TREE + V_CHUNKS**
 *     (A2.4), and the frames are merged from sixteen per-shot chunk manifests. Nothing else in
 *     this file moves with it: every band, ROI, hue window, pixel count and share below is the
 *     sealed text. A2.3's audit is why that is possible — TWELVE of the thirteen scored bar
 *     families compare frames WITHIN one shot, therefore within one boot:
 *       R_<shot> · BS1 · BH1 · BF1 · BL1 · PROT-MOON · PROT-LAMPS · PROT-SPARK ·
 *       PROT-B_<shot> · LOOK-B · the report-only ΔL stddev
 *     BV1 and PARK1 do cross boots, and survive because they compare MEASUREMENTS AGAINST
 *     CONSTANTS sealed in §2/§3 — never one row against another row.
 *
 *   node progress/records/guardcone/guardcone-score.mjs [dir]
 *   GUARDCONE_DIR=... node progress/records/guardcone/guardcone-score.mjs
 */
import {
  ROSTER, manifest, row, img, stats, diffPx, diffSplit, lumaOf,
  dilate, intersect, discRect, probeOf, subjectBox, coneContainers,
  rBars, chunkTreeBar, chunksBar, parkBar,
} from './guardcone-lib.mjs';
import { shipVerdict, verdictLine } from '../../../tools/gate.mjs';

const report = [];
const guards = {};
const num = (v, d = 2) => (v === null || v === undefined || Number.isNaN(v) ? 'n/a' : (+v).toFixed(d));
const CAND = { colPatrol: 0xffd9a0, beamBase: 0.26, poolMix: 0.30, coreScale: 0.62, lamp: 1.0, glow: 0.42 };

/* ── shared validity — A2.4: V_CHUNK_TREE + V_CHUNKS in place of the single-process V-TREE ── */
guards.V_CHUNK_TREE = chunkTreeBar(report);
guards.V_CHUNKS = chunksBar(report);
guards.PARK1 = parkBar(report);
Object.assign(guards, rBars(report));

/* ── BV1 structural readbacks ───────────────────────────────────────────────────────────── */
{
  const on = row('guard', 'bon')?.readback, off = row('guard', 'off')?.readback;
  const inte = row('interior', 'bon')?.readback;
  report.push(`BV1 guard.bon: shape=${on?.uConeShape} lampW=${num(on?.uGuardLampW, 3)} colPatrol=0x${(on?.colPatrol ?? 0).toString(16)} `
    + `base=${on?.beamBase} pool=${on?.poolMix} core=${on?.beamCoreScale} glow=${on?.uGlow}; guard.off: shape=${off?.uConeShape} lampW=${num(off?.uGuardLampW, 3)}; `
    + `interior.bon lampW=${num(inte?.uGuardLampW, 4)} (want exactly 0 — the §303 window)`);
  guards.BV1 = (on && off && inte)
    ? (on.uConeShape === 1 && on.uGuardLampW > 0
       && on.colPatrol === CAND.colPatrol && Math.abs(on.beamBase - CAND.beamBase) < 1e-9
       && Math.abs(on.poolMix - CAND.poolMix) < 1e-9 && Math.abs(on.beamCoreScale - CAND.coreScale) < 1e-9
       && Math.abs(on.uGlow - CAND.glow) < 1e-9 && Math.abs(on.lampToon - CAND.lamp) < 1e-9
       && off.uConeShape === 0 && off.uGuardLampW === 0
       && inte.uGuardLampW === 0)
    : null;
}

const bonIm = img(row('guard', 'bon'));
const offIm = img(row('guard', 'off'));
const bonP = probeOf('guard', 'bon');
const subj = bonP?.guards?.[bonP.subjIdx] || null;

/* ── BS1 the visible source (apex disc r16: any px L>=200 ∧ R−B>=8) ─────────────────────── */
{
  let g = null;
  if (bonIm && subj?.apexS) {
    const [ax, ay] = subj.apexS;
    let hit = 0, best = 0;
    for (let y = Math.max(0, ay - 16); y < Math.min(bonIm.h, ay + 17); y++)
      for (let x = Math.max(0, ax - 16); x < Math.min(bonIm.w, ax + 17); x++) {
        if ((x - ax) ** 2 + (y - ay) ** 2 > 256) continue;
        const o = (y * bonIm.w + x) * bonIm.ch;
        const L = lumaOf(bonIm, o);
        if (L > best) best = L;
        if (L >= 200 && bonIm.data[o] - bonIm.data[o + 2] >= 8) hit++;
      }
    report.push(`BS1 apex ${JSON.stringify(subj.apexS.slice(0, 2))} hot-warm px=${hit} maxL=${num(best, 0)} (want >= 1)`);
    g = hit >= 1;
  } else report.push('BS1 apex/frame missing');
  guards.BS1 = g;
}

/* ── the beam ROI (subject beamRect ∩ frame, minus subject bbox) ────────────────────────── */
function beamRoiPx(im, fn) {
  /* walks the ROI, calls fn(o, x, y, tAlong01) for each px. Returns count. */
  if (!im || !subj?.beamRect) return 0;
  const r = subj.beamRect;
  const bb = subj.bbox;
  const [ax, ay] = subj.apexS, [fx, fy] = subj.farS;
  const dx = fx - ax, dy = fy - ay;
  const len2 = Math.max(1, dx * dx + dy * dy);
  let n = 0;
  for (let y = Math.max(0, r[1]); y < Math.min(im.h, r[3]); y++)
    for (let x = Math.max(0, r[0]); x < Math.min(im.w, r[2]); x++) {
      if (bb && x >= bb[0] && x < bb[2] && y >= bb[1] && y < bb[3]) continue;
      const t = ((x - ax) * dx + (y - ay) * dy) / len2;
      n++;
      fn((y * im.w + x) * im.ch, x, y, t);
    }
  return n;
}

/* ── BH1 colored falloff (near/far hue in warm band; far S >= near S + 0.015) ───────────── */
{
  let g = null;
  if (bonIm && subj?.beamRect && subj?.apexS && subj?.farS) {
    const acc = {
      near: { cx: 0, cy: 0, w: 0, s: 0, n: 0 },
      far: { cx: 0, cy: 0, w: 0, s: 0, n: 0 },
    };
    beamRoiPx(bonIm, (o, x, y, t) => {
      const R = bonIm.data[o] / 255, G = bonIm.data[o + 1] / 255, B = bonIm.data[o + 2] / 255;
      const mx = Math.max(R, G, B), mn = Math.min(R, G, B), d = mx - mn;
      const S = mx > 1e-6 ? d / mx : 0;
      if (S < 0.05) return;
      let h = 0;
      if (d > 1e-6) {
        if (mx === R) h = ((G - B) / d) % 6; else if (mx === G) h = (B - R) / d + 2; else h = (R - G) / d + 4;
        h *= 60; if (h < 0) h += 360;
      }
      const a = t < 0.5 ? acc.near : acc.far;
      a.cx += d * Math.cos(h * Math.PI / 180); a.cy += d * Math.sin(h * Math.PI / 180);
      a.w += d; a.s += S; a.n++;
    });
    const hue = (a) => (a.w > 1e-9 ? ((Math.atan2(a.cy, a.cx) * 180 / Math.PI) + 360) % 360 : NaN);
    const hN = hue(acc.near), hF = hue(acc.far);
    const sN = acc.near.n ? acc.near.s / acc.near.n : NaN;
    const sF = acc.far.n ? acc.far.s / acc.far.n : NaN;
    report.push(`BH1 near hue=${num(hN, 1)} S=${num(sN, 3)} (${acc.near.n}px)  far hue=${num(hF, 1)} S=${num(sF, 3)} (${acc.far.n}px)`);
    g = (acc.near.n > 400 && acc.far.n > 400)
      ? (hN >= 20 && hN <= 60 && hF >= 20 && hF <= 65 && sF >= sN + 0.015)
      : null;
  } else report.push('BH1 beam ROI missing');
  guards.BH1 = g;
}

/* ── BF1 non-blowout (blown share bon <= 0.08 ∧ <= 0.5 × off) ───────────────────────────── */
{
  let g = null;
  if (bonIm && offIm && subj?.beamRect) {
    let nOn = 0, bOn = 0, nOff = 0, bOff = 0;
    beamRoiPx(bonIm, (o) => { nOn++; if (lumaOf(bonIm, o) >= 235) bOn++; });
    beamRoiPx(offIm, (o) => { nOff++; if (lumaOf(offIm, o) >= 235) bOff++; });
    const shOn = nOn ? bOn / nOn : NaN, shOff = nOff ? bOff / nOff : NaN;
    report.push(`BF1 blown share bon=${num(shOn, 4)} off=${num(shOff, 4)} (want <= 0.08 and <= 0.5×off)`);
    g = nOn > 1000 ? (shOn <= 0.08 && shOn <= 0.5 * shOff) : null;
  } else report.push('BF1 beam ROI/frames missing');
  guards.BF1 = g;
}

/* ── BL1 the lamp lights the guard (bon vs blamp) ───────────────────────────────────────── */
{
  const blampIm = img(row('guard', 'blamp'));
  let g = null;
  if (bonIm && blampIm) {
    const p = probeOf('guard', 'bon');
    const container = [
      dilate(subjectBox('guard', 'bon'), 24), dilate(subjectBox('guard', 'blamp'), 24),
      p?.ahead ? dilate(discRect(p.ahead), 24) : null,
      p?.spill?.rect || null,
    ].filter(Boolean);
    const split = diffSplit(blampIm, bonIm, container);
    let dl = 0, drb = 0, n = 0;
    for (let y = 0; y < bonIm.h; y++) for (let x = 0; x < bonIm.w; x++) {
      const oa = (y * blampIm.w + x) * blampIm.ch, ob = (y * bonIm.w + x) * bonIm.ch;
      if (blampIm.data[oa] === bonIm.data[ob] && blampIm.data[oa + 1] === bonIm.data[ob + 1]
        && blampIm.data[oa + 2] === bonIm.data[ob + 2]) continue;
      n++;
      dl += lumaOf(bonIm, ob) - lumaOf(blampIm, oa);
      drb += (bonIm.data[ob] - bonIm.data[ob + 2]) - (blampIm.data[oa] - blampIm.data[oa + 2]);
    }
    const inShare = split.total ? split.inside / split.total : NaN;
    report.push(`BL1 bon-vs-blamp differing=${split.total} inside=${num(inShare * 100, 1)}% ΔL=${num(n ? dl / n : NaN)} Δ(R−B)=${num(n ? drb / n : NaN)}`);
    g = split.total >= 3000 && inShare >= 0.96 && (dl / n) >= 2 && (drb / n) >= 1.5;
  } else report.push('BL1 frames missing');
  guards.BL1 = g;
}

/* ── the three named ROIs (rule §4: [0,0] if probe-disjoint from every beam rect, else <=400) ── */
const NAMED = [
  ['PROT-MOON', 'night', [300, 20, 480, 140]],
  ['PROT-LAMPS', 'night', [640, 0, 1140, 130]],
  ['PROT-SPARK', 'traversal', [430, 190, 620, 280]],
];
for (const [name, shot, roi] of NAMED) {
  const a = img(row(shot, 'off')), b = img(row(shot, 'bon'));
  let g = null;
  if (a && b) {
    const p = probeOf(shot, 'off');
    const touches = (p?.guards || []).some((gg) =>
      [gg.beamRect, gg.poolRect, gg.bbox].some((r) => r && intersect(dilate(r, 24), roi)))
      || (p?.spill?.rect && intersect(p.spill.rect, roi));
    const d = diffPx(a, b, roi);
    report.push(`${name} ${shot} ${JSON.stringify(roi)} diff=${d}px probe-touches=${!!touches} (rule: disjoint→0, else <=400)`);
    g = touches ? d <= 400 : d === 0;
  } else report.push(`${name} frames missing`);
  guards[name] = g;
}

/* ── PROT-B per shot (rule §4) ──────────────────────────────────────────────────────────── */
for (const shot of ROSTER) {
  if (shot === 'guard') continue;
  const a = img(row(shot, 'off')), b = img(row(shot, 'bon'));
  let g = null;
  if (a && b) {
    const cOff = coneContainers(shot, 'off'), cOn = coneContainers(shot, 'bon');
    const clean = cOff.length === 0 && cOn.length === 0;
    if (clean) {
      const d = diffPx(a, b);
      report.push(`PROT-B ${shot.padEnd(12)} CLEAN  off-vs-bon ${d} px (want 0)`);
      g = d === 0;
    } else {
      const split = diffSplit(a, b, [...cOff, ...cOn]);
      report.push(`PROT-B ${shot.padEnd(12)} AFFECT inside=${split.inside} outside=${split.outside} (want outside <= 900)`);
      g = split.outside <= 900;
    }
  } else report.push(`PROT-B ${shot} frames missing`);
  guards[`PROT-B_${shot}`] = g;
}

/* ── report-only numbers for LOOK (edge presence + dust structure) ──────────────────────── */
if (bonIm && offIm && subj?.beamRect) {
  let sum = 0, sum2 = 0, n = 0;
  beamRoiPx(bonIm, (o, x, y) => {
    const q = (y * offIm.w + x) * offIm.ch;
    const d = lumaOf(bonIm, o) - lumaOf(offIm, q);
    sum += d; sum2 += d * d; n++;
  });
  const sd = n ? Math.sqrt(Math.max(0, sum2 / n - (sum / n) ** 2)) : NaN;
  report.push(`(report) beam-ROI ΔL stddev=${num(sd)} n=${n} — dust/structure texture for LOOK`);
}

/* fail-closed gating */
if (guards.R_guard !== true) for (const k of ['BV1', 'BS1', 'BH1', 'BF1', 'BL1']) guards[k] = null;
if (guards.R_night !== true) { guards['PROT-MOON'] = null; guards['PROT-LAMPS'] = null; }
if (guards.R_traversal !== true) guards['PROT-SPARK'] = null;
for (const shot of ROSTER) if (shot !== 'guard' && guards[`R_${shot}`] !== true) guards[`PROT-B_${shot}`] = null;
/* A1.2 PARK1: a §309 violation voids the RUN, not just its own row — every scored bar goes
   VOID so nothing can ship out of a capture taken with the guard model unparked. */
if (guards.PARK1 !== true) {
  for (const k of Object.keys(guards)) if (k !== 'PARK1') guards[k] = null;
}

/* ── verdict ────────────────────────────────────────────────────────────────────────────── */
console.log('── guardcone-score — PREREG-guardcone §3 + AMENDMENT A1 ──');
for (const line of report) console.log('  ' + line);
const v = shipVerdict(guards);
console.log('\nbars:');
for (const [k, s] of Object.entries(v.states)) console.log(`  ${k.padEnd(20)} ${s}`);
console.log('\n' + verdictLine(v, 'the cone tuple (coneShape 1 + colPatrol #ffd9a0 + core 0.62 + lampToon 1.0 …) — LOOK gate still binding (PREREG-guardcone §8.3 as reduced by A1.2: guard.bon vs guard.off, night.bon vs night.off)'));
process.exit(v.ship ? 0 : 1);
