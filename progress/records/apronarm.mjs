#!/usr/bin/env node
/* apronarm — candidate 1 of the `guard` cyan contact line, isolated to ONE variable.
 *
 * Pre-registered in PREREG-apronarm.md. Read that first: the arm set, the acceptance
 * thresholds and the meaning of a null are all fixed there and duplicated here so the two
 * cannot drift. The ONLY value left open is the ROI, and it is open on purpose (below).
 *
 * ---------------------------------------------------------------------------------------
 * THE VARIABLE
 *
 *   `EgyptLevel.js` courtyard(): the stylobate apron, three chamfered volumes round the
 *   court perimeter, top face at y = −0.07. It shipped at +0.02 until an earlier session
 *   sank it 9 cm, on the reasoning that proud of the paving its chamfered inner arris runs
 *   the whole perimeter as an up-facing sliver — and an up-facing sliver at ndl ≈ 0.62 under
 *   a 40° moon is exactly what a bright contact line is made of.
 *
 *   That fix has never been seen in a frame (§137). This runner puts the apron back where it
 *   was, on a fixed camera, with nothing else touched, and measures the difference.
 *
 * WHY A RIGID TRANSLATION AND NOT A STRETCH
 *
 *   The `hi` arm moves every apron vertex by dy = +0.09 as a body. It does NOT stretch the
 *   box from a pinned base back to the historical (−1.50 … +0.02) extents. Two reasons, and
 *   the first is the one that matters:
 *
 *     1. A rigid translation leaves every normal bit-identical. A stretch would move the
 *        chamfer normals as well as the positions, and the arm would then confound "the
 *        arris is higher" with "the arris faces somewhere else" — two mechanisms, one knob,
 *        which is the failure this whole run exists to avoid.
 *     2. The difference it introduces is at the apron's BOTTOM edge: −1.41 instead of −1.50.
 *        That edge is 1.4 m below the contact, buried in TERRAIN's sand and behind the
 *        paving, and cannot reach the scored ROI.
 *
 *   Stated rather than buried: the `hi` arm therefore reproduces the pre-fix ARRIS exactly
 *   and the pre-fix BOX approximately. The arris is the mechanism under test.
 *
 * WHY THE SCORER IS NOT `kerbline`
 *
 *   `kerbline.mjs` requires a THIN run: a local vertical maximum over ±2 px with ≥12 px of
 *   horizontal continuity. §152.3 established that on the shipped `guard` camera the
 *   plinth-deck band projects 239–265 px wide, and a 240-px band has no local maximum in its
 *   interior — so `kerbline` cannot see one. If the apron toggle were to change the band's
 *   WIDTH rather than its presence, `kerbline` would report a null for exactly the wrong
 *   reason, and the null would look like the informative one.
 *
 *   So this run is scored on width-blind statistics (S1/S2/S3 below), decided before any
 *   frame was opened. `kerbline` is still run over the three arms and REPORTED, because it
 *   is the pass-2 signature of record — but it does not carry the verdict.
 *
 *   The selftest proves this is a real difference and not a story: it synthesises a 2 px
 *   sliver and a 240 px band and requires S1 to register BOTH, while demonstrating inline
 *   that the thin-line predicate fires on the sliver and misses the band.
 *
 * usage:
 *   node progress/records/apronarm.mjs --dry-run     selftest + plan only, no boot, no lock
 *   node progress/records/apronarm.mjs               capture 3 arms, then score
 *   node progress/records/apronarm.mjs --score-only shots/apronarm    re-score existing frames
 */
import { withGame, ROOT } from '../../tools/harness.mjs';
import { readPNG } from '../../tools/png.mjs';
import { mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

const argv = process.argv.slice(2);
const DRY = argv.includes('--dry-run');
const SCORE_ONLY = argv.includes('--score-only') ? argv[argv.indexOf('--score-only') + 1] : null;
const OUT = SCORE_ONLY ? path.resolve(ROOT, SCORE_ONLY) : path.join(ROOT, 'shots', 'apronarm');

/* =======================================================================================
 * THE ONE OPEN VALUE — the ROI.
 *
 * The RULE is fixed here and is not up for revision after the frames: the ROI is a swath of
 * half-width PAD px centred on the projected west apron arris, which is the only place the
 * manipulated geometry can appear. The COORDINATES below are an offline projection —
 * three.js PerspectiveCamera + Vector3.project, fov 38, 1280×720, the shipped `guard` camera
 * (−11.5, 2.60, 30.5), against the arris x = −26, y = −0.07, z ∈ [10, 32] (§152.C).
 *
 * `confirmed` stays false until the arris has been located in `shots/propshull/guard-base.png`
 * and found within PAD of this line. That is the ONLY thing the frames are allowed to change,
 * and if they move it, the measured offset gets recorded in PREREG-apronarm.md as an amendment
 * rather than edited in silently.
 * ======================================================================================= */
const ROI = {
  confirmed: false,
  ends: [[1250, 233], [41, 324]],   // projected arris endpoints (px), §152.C
  pad: 40,                          // half-width of the swath, px — covers both arms' arris
};

/* =======================================================================================
 * ACCEPTANCE — fixed before any frame. Duplicated from PREREG-apronarm.md §4.
 * ======================================================================================= */
const ACC = {
  /* validity: the duplicate pair must be quiet, or the run says nothing about anything */
  dupFrameFrac: 0.0005,     // lo vs lo2, whole frame, |dL| >= 2, as a fraction of pixels
  dupRoiMax: 2,             // lo vs lo2, no ROI pixel may move more than this in L
  /* hit: BOTH, because "pixels moved" alone is only "the knob is connected" and says nothing
     about WHICH class of artefact moved. The second term is signed on purpose: the mechanism
     predicts a proud apron ADDS bright cyan arris, so an equal-sized DROP is not a hit.

     A third gate was drafted and REJECTED BEFORE THE RUN: "the peak of the S2 profile
     difference lies within 12 px of the arris". It assumes the effect is narrow, which is the
     exact assumption that makes `kerbline` blind to a wide band — carrying it into the
     acceptance would re-import the confound as a false-negative. S2 is reported, not gated. */
  hitRoiPx: 200,            // ROI pixels with |dL| >= 8 between lo and hi
  hitS1: 150,               // S1(hi) - S1(lo), cyan-excess area, px, SIGNED
  /* null: BOTH */
  nullRoiPx: 50,
  nullS1: 50,
  dL: 8,                    // the "moved" threshold used by S3
};

const APRON = {
  meshName: 'arch:court:sandstone_worn',
  /* Selector for apron vertices inside the merged bucket. The apron is the only thing in
     this zone/material that lives BELOW the paving plane; drifts, stairs and rolls are all
     at y >= 0. Verified in-page against the nominal extents below, and aborts on mismatch. */
  yLo: -1.56, yHi: -0.03,
  xAbsMin: 25.8,            // |x| >= this  OR  z >= zMin  — the perimeter frame band
  zMin: 33.8,
  nominal: { x: [-27.45, 27.45], y: [-1.53, -0.04], z: [-16.05, 35.45] },
  dy: 0.09,                 // -0.07 -> +0.02
};

const L = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

/* ---------------------------------------------------------------------------------------
 * ROI geometry: y of the arris at a given x, and the swath membership test.
 * ------------------------------------------------------------------------------------- */
function roiLine() {
  const [[x1, y1], [x2, y2]] = ROI.ends;
  const m = (y2 - y1) / (x2 - x1);
  return { m, b: y1 - m * x1, x0: Math.min(x1, x2), x1: Math.max(x1, x2) };
}
const roiYAt = (ln, x) => ln.m * x + ln.b;

/* ---------------------------------------------------------------------------------------
 * THE STATISTICS. All three are width-blind by construction.
 *
 *   S1  cyan-excess AREA over the ROI: pixels that are blue-dominant and brighter than the
 *       FRAME's median luma. Area, not run length — a 2 px sliver and a 240 px band both
 *       count, the band simply counts more. This is the statistic `kerbline` cannot express.
 *
 *       The reference is the frame median and NOT the ROI's own median, which is what this
 *       was first written with. The selftest below caught that: a band wider than the ROI
 *       becomes its own reference, the median moves onto the artefact, and S1 reports zero —
 *       kerbline's confound reproduced one level up, in the instrument built to avoid it.
 *       Recorded here rather than quietly corrected, because "the detector was fixed after it
 *       failed its own control" is exactly the provenance a later reader needs.
 *   S2  a profile in d = (y − arris y), averaged across x. A band that gets WIDER shows here
 *       as a broadened hump, not as a disappearance.
 *   S3  the arm-difference map over the ROI. With one variable, every pixel that moves is
 *       downstream of the apron — which is the whole point of spending a boot on this.
 * ------------------------------------------------------------------------------------- */
function frameMedian(img) {
  const { w, h, ch, data } = img;
  const lum = [];
  for (let y = 0; y < h; y += 3) for (let x = 0; x < w; x += 3) {
    const i = (y * w + x) * ch;
    lum.push(L(data[i], data[i + 1], data[i + 2]));
  }
  lum.sort((a, b) => a - b);
  return lum[lum.length >> 1];
}

function s1(img, ln) {
  const { w, h, ch, data } = img;
  const med = frameMedian(img);
  let n = 0, area = 0;
  for (let x = Math.max(0, ln.x0); x <= Math.min(w - 1, ln.x1); x++) {
    const yc = roiYAt(ln, x);
    for (let d = -ROI.pad; d <= ROI.pad; d++) {
      const y = Math.round(yc + d);
      if (y < 0 || y >= h) continue;
      const i = (y * w + x) * ch;
      const r = data[i], g = data[i + 1], b = data[i + 2];
      n++;
      if (b - r >= 12 && L(r, g, b) >= med + 10) area++;
    }
  }
  return { area, median: med, n };
}

function s2(img, ln) {
  const { w, h, ch, data } = img;
  const sumL = new Float64Array(ROI.pad * 2 + 1), sumC = new Float64Array(ROI.pad * 2 + 1);
  const cnt = new Float64Array(ROI.pad * 2 + 1);
  for (let x = Math.max(0, ln.x0); x <= Math.min(w - 1, ln.x1); x++) {
    const yc = roiYAt(ln, x);
    for (let d = -ROI.pad; d <= ROI.pad; d++) {
      const y = Math.round(yc + d);
      if (y < 0 || y >= h) continue;
      const i = (y * w + x) * ch;
      const k = d + ROI.pad;
      sumL[k] += L(data[i], data[i + 1], data[i + 2]);
      sumC[k] += data[i + 2] - data[i];
      cnt[k]++;
    }
  }
  const prof = [];
  for (let k = 0; k < cnt.length; k++) {
    prof.push({ d: k - ROI.pad, L: cnt[k] ? sumL[k] / cnt[k] : 0, C: cnt[k] ? sumC[k] / cnt[k] : 0 });
  }
  return prof;
}

function s3(a, b, ln) {
  if (a.w !== b.w || a.h !== b.h) throw new Error('arm frames differ in size');
  const { w, h, ch } = a;
  let roiMoved = 0, roiMax = 0, frameMoved = 0;
  let bx0 = 1e9, by0 = 1e9, bx1 = -1, by1 = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * ch;
      const dl = Math.abs(L(a.data[i], a.data[i + 1], a.data[i + 2]) - L(b.data[i], b.data[i + 1], b.data[i + 2]));
      if (dl >= 2) frameMoved++;
      if (x < ln.x0 || x > ln.x1) continue;
      if (Math.abs(y - roiYAt(ln, x)) > ROI.pad) continue;
      if (dl > roiMax) roiMax = dl;
      if (dl >= ACC.dL) {
        roiMoved++;
        if (x < bx0) bx0 = x; if (x > bx1) bx1 = x;
        if (y < by0) by0 = y; if (y > by1) by1 = y;
      }
    }
  }
  return {
    roiMoved, roiMax, frameMoved, frameFrac: frameMoved / (w * h),
    bbox: bx1 < 0 ? null : { x0: bx0, y0: by0, x1: bx1, y1: by1 },
  };
}

/* ---------------------------------------------------------------------------------------
 * SELFTEST. A statistic that has never been shown to fire is worth nothing, and this project
 * has paid for that lesson twice. This one has a second job: it demonstrates the §152.3
 * confound rather than asserting it, by running the thin-line predicate alongside S1 on the
 * same two synthetic cases.
 * ------------------------------------------------------------------------------------- */
function synth(bandH) {
  const w = 1280, h = 720, ch = 4;
  const data = Buffer.alloc(w * h * ch, 255);
  const ln = roiLine();
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * ch;
    data[i] = 90; data[i + 1] = 88; data[i + 2] = 84; data[i + 3] = 255;   // warm dark ground
  }
  for (let x = Math.max(0, ln.x0); x <= Math.min(w - 1, ln.x1); x++) {
    const yc = Math.round(roiYAt(ln, x));
    for (let d = 0; d < bandH; d++) {
      const y = yc + d - (bandH >> 1);
      if (y < 0 || y >= h) continue;
      const i = (y * w + x) * ch;
      data[i] = 0x59; data[i + 1] = 0x8a; data[i + 2] = 0xa2;             // the pass-2 hue
    }
  }
  return { w, h, ch, data };
}

/* kerbline's predicate, reimplemented in six lines purely to show what it cannot see. */
function thinLineHits(img) {
  const { w, h, ch, data } = img;
  const at = (x, y) => { const i = (y * w + x) * ch; return [data[i], data[i + 1], data[i + 2]]; };
  let n = 0;
  for (let y = 2; y < h - 2; y++) for (let x = 0; x < w; x++) {
    const [r, g, b] = at(x, y);
    const lc = L(r, g, b), lu = L(...at(x, y - 2)), ld = L(...at(x, y + 2));
    if (lc - lu >= 18 && lc - ld >= 18 && b > r) n++;
  }
  return n;
}

function selftest() {
  const ln = roiLine();
  console.log('SELFTEST — the scorer must see the artefact at BOTH widths, and NOT see it when absent:');
  let ok = true;
  for (const [label, bandH, want] of [['none (control)', 0, false], ['2 px sliver', 2, true], ['240 px band', 240, true]]) {
    const img = synth(bandH);
    const { area } = s1(img, ln);
    const thin = thinLineHits(img);
    const seen = area > 500;
    const pass = seen === want;
    ok &&= pass;
    console.log(`  ${label.padEnd(14)}  S1 area ${String(area).padStart(7)} px  ` +
                `${(seen ? 'SEEN' : 'not seen').padEnd(8)} ${pass ? 'ok' : '*** WRONG'}` +
                `   |  thin-line predicate: ${String(thin).padStart(6)} px ${thin > 500 ? 'fires' : 'blind'}`);
  }
  if (!ok) {
    console.error('  *** S1 got a control wrong. Every verdict below would be an artefact of the instrument.');
    process.exit(2);
  }
  console.log('  PASS — S1 fires at both widths and stays silent on the blank control.');
  console.log('  The thin-line column is the §152.3 confound, shown rather than asserted: it fires on the');
  console.log('  sliver and is blind to the band, which is why it does not carry this verdict.\n');
}

/* ---------------------------------------------------------------------------------------
 * SCORING + VERDICT. Thresholds come from ACC, which is sealed.
 * ------------------------------------------------------------------------------------- */
function score(dir) {
  const need = ['guard-lo.png', 'guard-hi.png', 'guard-lo2.png'];
  for (const f of need) if (!existsSync(path.join(dir, f))) throw new Error(`missing arm frame ${f} in ${dir}`);
  const ln = roiLine();
  const lo = readPNG(path.join(dir, 'guard-lo.png'));
  const hi = readPNG(path.join(dir, 'guard-hi.png'));
  const lo2 = readPNG(path.join(dir, 'guard-lo2.png'));

  const dup = s3(lo, lo2, ln);
  const eff = s3(lo, hi, ln);
  const S1lo = s1(lo, ln), S1hi = s1(hi, ln);
  const Plo = s2(lo, ln), Phi = s2(hi, ln);
  let peakD = 0, peakV = 0;
  for (let k = 0; k < Plo.length; k++) {
    const dv = Math.abs(Phi[k].L - Plo[k].L);
    if (dv > peakV) { peakV = dv; peakD = Plo[k].d; }
  }

  console.log(`\nVALIDITY  lo vs lo2 : frame moved ${dup.frameMoved} px (${(dup.frameFrac * 100).toFixed(4)}%), ROI max dL ${dup.roiMax.toFixed(1)}`);
  console.log(`EFFECT    lo vs hi  : ROI moved ${eff.roiMoved} px, ROI max dL ${eff.roiMax.toFixed(1)}, bbox ${JSON.stringify(eff.bbox)}`);
  console.log(`S1        cyan-excess area : lo ${S1lo.area}  hi ${S1hi.area}  delta ${S1hi.area - S1lo.area}` +
              `   (frame median L: lo ${S1lo.median.toFixed(1)} hi ${S1hi.median.toFixed(1)})`);
  console.log(`S2        profile peak |dL| ${peakV.toFixed(2)} at d = ${peakD} px from the arris  [reported, not gated]`);
  if (Math.abs(S1lo.median - S1hi.median) > 2) {
    console.log(`  ! frame medians differ by ${Math.abs(S1lo.median - S1hi.median).toFixed(1)} L — S1's reference moved between arms; treat S1 with caution`);
  }

  const void_ = dup.frameFrac > ACC.dupFrameFrac || dup.roiMax > ACC.dupRoiMax;
  const hit = eff.roiMoved >= ACC.hitRoiPx && (S1hi.area - S1lo.area) >= ACC.hitS1;
  const nul = eff.roiMoved < ACC.nullRoiPx && Math.abs(S1hi.area - S1lo.area) < ACC.nullS1;

  const verdict = void_ ? 'VOID' : hit ? 'HIT' : nul ? 'NULL' : 'AMBIGUOUS';
  console.log(`\nVERDICT: ${verdict}`);
  console.log({
    VOID: '  The duplicate pair moved. This run says nothing about the apron or anything else.',
    HIT: '  A 9 cm apron displacement produces the cyan contact class at the arris. Candidate 1\n' +
         '  is attributed for THIS frame. It does not follow that candidate 2 is wrong — §152.1\'s\n' +
         '  matched coordinate stands and both mechanisms can be live.',
    NULL: '  A 9 cm apron displacement does not produce this class at this camera: the apron was\n' +
          '  never this symptom. This does NOT verify the §137 fix — it retires it as a fix for a\n' +
          '  DIFFERENT (real, measured) defect, and leaves candidate 2 the better-evidenced account\n' +
          '  of the pass-2 line. Cause remains attributed to candidate 2 only by §152.1, not by this.',
    AMBIGUOUS: '  Between thresholds. Reported as ambiguous; not rounded toward either reading.',
  }[verdict]);

  return { verdict, dup, eff, S1: { lo: S1lo, hi: S1hi }, peak: { d: peakD, v: peakV }, roi: { ...ROI, line: ln } };
}

/* ======================================= main ========================================= */
selftest();

if (SCORE_ONLY) {
  const r = score(OUT);
  await writeFile(path.join(OUT, 'apronarm-score.json'), JSON.stringify(r, null, 2));
  process.exit(0);
}

if (!ROI.confirmed) {
  console.error('ROI is not confirmed.\n');
  console.error(`  The rule is sealed (swath of +/-${ROI.pad} px on the projected west apron arris) and the`);
  console.error('  projected endpoints are recorded, but they have not been checked against a frame.');
  console.error('  Fill in from shots/propshull/guard-base.png:');
  console.error('    1. locate the apron arris in the frame;');
  console.error('    2. if it lies within pad of ROI.ends, set confirmed = true and record that it did;');
  console.error('    3. if it does not, amend PREREG-apronarm.md with the measured line and WHY it moved,');
  console.error('       then set confirmed = true. Do not silently edit the coordinates.');
  console.error('\n  Refusing to capture: an ROI chosen after the frames is not a pre-registration.');
  process.exit(3);
}

if (DRY) { console.log('--dry-run: selftest passed, ROI confirmed, no boot taken.'); process.exit(0); }

await mkdir(OUT, { recursive: true });

const res = await withGame({ width: 1280, height: 720, quality: 'high' }, async ({ page, info }) => {
  /* ---- locate the apron vertices and PROVE they are the apron before moving anything ---- */
  const sel = await page.evaluate((A) => {
    const mesh = window.__ENGINE.scene.getObjectByName(A.meshName);
    if (!mesh) return { error: `no mesh named ${A.meshName}` };
    const pos = mesh.geometry.attributes.position;
    const idx = [];
    let x0 = 1e9, y0 = 1e9, z0 = 1e9, x1 = -1e9, y1 = -1e9, z1 = -1e9;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
      if (y < A.yLo || y > A.yHi) continue;
      if (!(Math.abs(x) >= A.xAbsMin || z >= A.zMin)) continue;
      idx.push(i);
      if (x < x0) x0 = x; if (x > x1) x1 = x;
      if (y < y0) y0 = y; if (y > y1) y1 = y;
      if (z < z0) z0 = z; if (z > z1) z1 = z;
    }
    window.__apron = { mesh, idx, applied: 0 };
    return { n: idx.length, total: pos.count, bbox: { x: [x0, x1], y: [y0, y1], z: [z0, z1] } };
  }, APRON);

  if (sel.error) throw new Error(sel.error);
  console.log(`\napron selection: ${sel.n} of ${sel.total} vertices in ${APRON.meshName}`);
  console.log(`  bbox x ${sel.bbox.x.map((v) => v.toFixed(2))}  y ${sel.bbox.y.map((v) => v.toFixed(3))}  z ${sel.bbox.z.map((v) => v.toFixed(2))}`);
  const N = APRON.nominal;
  const within = (got, want, tol) => got[0] >= want[0] - tol && got[1] <= want[1] + tol;
  if (!sel.n) throw new Error('selector matched nothing — the apron is not where the selector says');
  if (!within(sel.bbox.x, N.x, 0.15) || !within(sel.bbox.y, N.y, 0.15) || !within(sel.bbox.z, N.z, 0.15)) {
    throw new Error(`selection bbox is outside the apron's nominal extents — it is catching something else:\n` +
                    `  got  ${JSON.stringify(sel.bbox)}\n  want ${JSON.stringify(N)}`);
  }
  console.log('  bbox is inside the apron nominal extents — selection accepted.');

  /* Absolute offset, so an arm can never depend on how many times it has been applied. */
  const setDy = (want) => page.evaluate((w) => {
    const a = window.__apron;
    const d = w - a.applied;
    if (d !== 0) {
      const pos = a.mesh.geometry.attributes.position;
      for (const i of a.idx) pos.setY(i, pos.getY(i) + d);
      pos.needsUpdate = true;
      a.mesh.geometry.computeBoundingSphere();
      a.mesh.geometry.computeBoundingBox();
      a.applied = w;
    }
    let lo = 1e9, hi = -1e9;
    const pos = a.mesh.geometry.attributes.position;
    for (const i of a.idx) { const y = pos.getY(i); if (y < lo) lo = y; if (y > hi) hi = y; }
    return { applied: a.applied, moved: d, top: hi, bottom: lo, n: a.idx.length };
  }, want);

  const arms = [];
  const shoot = async (label, dy) => {
    const t = await setDy(dy);
    if (Math.abs(t.applied - dy) > 1e-9) throw new Error(`${label}: offset is ${t.applied}, wanted ${dy}`);
    await page.evaluate(async () => { await window.__GAME.step(3, 0); });
    const r = await page.evaluate(() => ({ png: window.__GAME.capture(), stats: { ...window.__ENGINE.stats } }));
    const file = path.join(OUT, `guard-${label}.png`);
    await writeFile(file, Buffer.from(r.png.split(',')[1], 'base64'));
    console.log(`  ✓ ${label.padEnd(4)} dy ${dy.toFixed(2)}  apron top ${t.top.toFixed(3)}  ` +
                `draws ${r.stats.drawCalls}  -> ${path.relative(ROOT, file)}`);
    arms.push({ label, dy, top: t.top, bottom: t.bottom, moved: t.moved, file });
  };

  console.log('\ncapturing guard [lo hi lo2] — fixed camera, dt pinned to 0, apron y the only variable:');
  await page.evaluate(async () => { await window.__GAME.setShot('guard'); });
  await page.evaluate(async () => { await window.__GAME.step(6, 0); });
  await shoot('lo', 0);              // shipped: apron top -0.07
  await shoot('hi', APRON.dy);       // counterfactual: apron top +0.02
  await shoot('lo2', 0);             // duplicate of lo — the validity gate

  return { arms, selection: sel, warnings: info.warnings, consoleErrors: info.consoleErrors };
});

await writeFile(path.join(OUT, 'arms.json'), JSON.stringify(res, null, 2));
const sc = score(OUT);
await writeFile(path.join(OUT, 'apronarm-score.json'), JSON.stringify({ ...sc, arms: res.arms }, null, 2));
console.log(`\n→ ${path.relative(ROOT, OUT)}/`);
