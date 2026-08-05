/**
 * fx22 scoring — candidate 1 (backdrop-conditioned suppression) against PREREG-sandhigh.md
 * Amendment 1, arms D1–D4, in the registered order. Evaluates; decides nothing.
 *
 * REWRITE. The original scorer lived in the scratchpad and was destroyed by the §161 container
 * rollback together with the fx22 frames it had partially scored; that run is VOID. This file
 * lives under progress/records/cand1/ so the next rollback cannot take it (§161.1: the blast
 * radius is fixed by what has been swept, before the capture starts).
 *
 * Inputs: shots/fx22/ — per shot `<shot>.base.png` (uGate.x=0) and `<shot>.gated.png`
 * (uGate.x=1), same boot, same staging, dt-0, ONE compiled program (the gate is a uniform, not
 * a #define — §148.2), plus `temple.back.png` (gate off again, restore control) and fx22.json
 * (per-job probes incl. the CPU reproduction of the gate arithmetic at the two registered
 * component centres).
 *
 * Registered order and letter (PREREG-sandhigh.md A1.3 + §147.2 + the §150 shot list):
 *   D1  selectivity — outside the gated population the frame is bit-identical to base, 0 px,
 *       on hero/dunes/courtyard (which §145.2 showed contain no dark-blue surface class, so
 *       the gated population there is EMPTY and the whole frame must be 0 px), and
 *       temple.back == temple.base. A badly-implemented gate fails D1 too; that is its point.
 *   (pre-D2) classifier verification, §148.3/§150.2 — the shader's own arithmetic, reproduced
 *       on the CPU over the very texels the shader samples, must FIRE at the disc centre
 *       (602,133) and be EXACTLY ZERO at the non-artefact (520,581). The sampled backdrop is
 *       pre-grade and the registered anchors (44.4 / 76.6) are graded-PNG numbers — different
 *       quantities; the anchor comparison is a sanity report, NOT the test. If the sample is
 *       nowhere near the anchor AND the classifier misclassifies, the transform is wrong and
 *       D2 is UNSCOREABLE — reported as that, never repaired by moving a threshold (§141.1).
 *   D2  removal, not thinning — the disc must CEASE TO EXIST as a >=40 px connected component,
 *       not merely fall under a deltaL threshold. Scored structurally: a reference-free disc
 *       detector (local residual vs ring-median background, threshold ΔL 3.0 — the registered
 *       Arm B line, not a new number) is CALIBRATED on temple.base (it must find the disc
 *       there, else the premise is absent, §122.3) and validated on four disc-free control
 *       windows of the same frame (§13/§128.3: a detector that has not seen a control is not
 *       an instrument), then applied UNCHANGED to temple.gated. Any surviving >=40 px
 *       component >= 3.0 residual inside the disc bbox = thinning = FAIL.
 *   D3  the picture, both halves at 4x — disc gone AND the non-gated haze intact. Crops are
 *       written for the disc window, the non-artefact (520,581), the strict-gate collateral
 *       (433,68), and the largest attenuated component of every other shot that has one.
 *       If the picture and the statistic disagree, THE PICTURE IS THE FINDING.
 *   D4  anti-proxy — every component the gate attenuates is enumerated by name, with `night`
 *       and `interior` as the deliberate false-positive population (§150.3). Registered rule:
 *       every component attenuated > 20% must be either the disc or under ΔL 3.0. The
 *       attenuation FRACTION is not measurable from this capture alone (no no-sandHigh arms),
 *       but the removed amount bounds it from below: a non-disc component whose REMOVED mean
 *       |ΔL| >= 3.0 either was attenuated >20% of a >3.0 component (fails the rule as worded)
 *       or is a >=15 ΔL component unknown to the census (worse) — so "removed mean >= 3.0 on a
 *       non-disc component" is scored as a D4 violation, and removed < 3.0 as consistent.
 *
 * Component conventions are fx21an.mjs's, verbatim, so every number here is comparable to the
 * registered baselines: changed = summed RGB channel delta >= 4 (§122.1 — the threshold is
 * stated wherever the count is used), components 4-connected, floor 40 px, means over the
 * component's own pixels (§135.1). D1's bit-identity is STRICTER and is counted separately:
 * ANY byte differing (threshold 1 on any channel), which is what "bit-identical" means.
 *
 * Registered anchors quoted from PREREG-sandhigh.md (frames that no longer exist, fx20/fx21):
 *   disc: bbox (602,133)-(659,193), 2803 px, mean ΔL +17.28, backdrop luma 44.4 R/B 0.13,
 *         total |ΔL| 48,436 of temple's 73,628; non-disc remainder 25,192 (Arm C baseline).
 *   non-artefact (520,581): +8.68 over backdrop luma 76.6 R/B 0.66 — must NOT be gated.
 *   strict-gate collateral (433,68)-(456,118): 646 px, +1.63, backdrop 54.6 / 0.29.
 */
import { readPNG } from '/home/user/Demo/tools/png.mjs';
import { readFileSync, writeFileSync, existsSync, mkdirSync, copyFileSync } from 'node:fs';
import zlib from 'node:zlib';

const D = '/home/user/Demo/shots/fx22';
const REC = '/home/user/Demo/progress/records/cand1';
const CROPS = `${REC}/crops`;
const MINC = 40;              // registered component floor (D2's own wording)
const RESID_T = 3.0;          // registered Arm B "falls below ΔL 3.0" line — not a new number
const DISC = { x0: 602, y0: 133, x1: 659, y1: 193 };   // registered bbox
const NONART = { x: 520, y: 581 };
const COLLAT = { x0: 433, y0: 68, x1: 456, y1: 118 };
const L = (d, o) => 0.2126 * d[o] + 0.7152 * d[o + 1] + 0.0722 * d[o + 2];

if (!existsSync(`${D}/fx22.json`)) { console.log(`${D}/fx22.json missing — run unfinished; not scoring partial frames (§161: a mid-flight run is void, not scoreable)`); process.exit(1); }
const J = JSON.parse(readFileSync(`${D}/fx22.json`, 'utf8'));
const load = (n) => existsSync(`${D}/${n}.png`) ? readPNG(`${D}/${n}.png`) : null;
mkdirSync(CROPS, { recursive: true });
try { copyFileSync(`${D}/fx22.json`, `${REC}/fx22.json`); } catch {}

/* ---------- tiny PNG writer (RGB, filter 0) for the D3 crops ---------- */
function writePNG(file, w, h, rgb) {
  const crcT = []; for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; crcT[n] = c >>> 0; }
  const crc = (b) => { let c = 0xffffffff; for (const v of b) c = crcT[(c ^ v) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (type, body) => { const b = Buffer.concat([Buffer.from(type), body]); const out = Buffer.alloc(b.length + 8);
    out.writeUInt32BE(body.length, 0); b.copy(out, 4); out.writeUInt32BE(crc(b), b.length + 4); return out; };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  const raw = Buffer.alloc(h * (1 + w * 3));
  for (let y = 0; y < h; y++) { raw[y * (1 + w * 3)] = 0; rgb.copy(raw, y * (1 + w * 3) + 1, y * w * 3, (y + 1) * w * 3); }
  writeFileSync(file, Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]));
}
function crop4x(img, x0, y0, x1, y1, file) {
  x0 = Math.max(0, x0); y0 = Math.max(0, y0); x1 = Math.min(img.w - 1, x1); y1 = Math.min(img.h - 1, y1);
  const w = x1 - x0 + 1, h = y1 - y0 + 1, S = 4;
  const out = Buffer.alloc(w * S * h * S * 3);
  for (let y = 0; y < h * S; y++) for (let x = 0; x < w * S; x++) {
    const o = ((y0 + (y / S | 0)) * img.w + x0 + (x / S | 0)) * img.ch, q = (y * w * S + x) * 3;
    out[q] = img.data[o]; out[q + 1] = img.data[o + 1]; out[q + 2] = img.data[o + 2];
  }
  writePNG(file, w * S, h * S, out);
  return file;
}

/* ---------- pixel diffs: strict (any byte) and the fx21an ΣRGB>=4 convention ---------- */
function diffCounts(A, B) {
  const N = A.w * A.h; let strict = 0, sum4 = 0;
  for (let i = 0; i < N; i++) {
    const o = i * A.ch;
    const d0 = Math.abs(A.data[o] - B.data[o]), d1 = Math.abs(A.data[o + 1] - B.data[o + 1]), d2 = Math.abs(A.data[o + 2] - B.data[o + 2]);
    if (d0 | d1 | d2) strict++;
    if (d0 + d1 + d2 >= 4) sum4++;
  }
  return { strict, sum4 };
}

/* ---------- fx21an component machinery, verbatim conventions ---------- */
function components(A, B) {   // components of A-vs-B change (ΣRGB>=4, 4-conn, >=MINC)
  const W = A.w, H = A.h, N = W * H;
  const mask = new Uint8Array(N), lift = new Float32Array(N);
  let changed = 0, absSum = 0;
  for (let i = 0; i < N; i++) {
    const o = i * A.ch;
    const d = Math.abs(A.data[o] - B.data[o]) + Math.abs(A.data[o + 1] - B.data[o + 1]) + Math.abs(A.data[o + 2] - B.data[o + 2]);
    if (d < 4) continue;
    mask[i] = 1; changed++;
    const g = L(A.data, o) - L(B.data, o);
    lift[i] = g; absSum += Math.abs(g);
  }
  const seen = new Uint8Array(N), comps = [];
  for (let i = 0; i < N; i++) {
    if (!mask[i] || seen[i]) continue;
    const st = [i]; seen[i] = 1;
    let c = 0, x0 = 1e9, x1 = -1, y0 = 1e9, y1 = -1, s = 0, as = 0;
    const px = [];
    while (st.length) {
      const j = st.pop(), jx = j % W, jy = (j / W) | 0;
      c++; s += lift[j]; as += Math.abs(lift[j]); if (px.length < 6000) px.push(j);
      if (jx < x0) x0 = jx; if (jx > x1) x1 = jx; if (jy < y0) y0 = jy; if (jy > y1) y1 = jy;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = jx + dx, ny = jy + dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const k = ny * W + nx;
        if (mask[k] && !seen[k]) { seen[k] = 1; st.push(k); }
      }
    }
    if (c < MINC) continue;
    // what is behind the component AFTER attenuation, read off the gated frame (B)
    let br = 0, bg = 0, bb = 0;
    for (const j of px) { const o = j * B.ch; br += B.data[o]; bg += B.data[o + 1]; bb += B.data[o + 2]; }
    const n = px.length, bR = br / n, bG = bg / n, bB = bb / n;
    comps.push({ c, box: [x1 - x0 + 1, y1 - y0 + 1], at: [x0, y0], bb: [x0, y0, x1, y1],
      dL: s / c, absL: as, bd: [Math.round(bR), Math.round(bG), Math.round(bB)],
      bdLuma: 0.2126 * bR + 0.7152 * bG + 0.0722 * bB, bdRB: bB > 0 ? bR / bB : 99 });
  }
  comps.sort((a, b) => b.c - a.c);
  return { comps, changed, absSum };
}
const overlaps = (k, R) => !(k.bb[2] < R.x0 || k.bb[0] > R.x1 || k.bb[3] < R.y0 || k.bb[1] > R.y1);

/* ---------- D2's reference-free disc detector ----------
   Window = bbox padded PAD. Background = median L of the ring (window minus bbox), from the
   SAME frame — no reference needed, so it cannot be circular. Detection = 4-connected
   components >= MINC px of (L - ringMedian) >= RESID_T inside the bbox region.
   Star dots are bright but SMALL (< MINC) and the ring median is robust to them. */
function discDetect(img, R, PAD = 40) {
  const wx0 = Math.max(0, R.x0 - PAD), wy0 = Math.max(0, R.y0 - PAD);
  const wx1 = Math.min(img.w - 1, R.x1 + PAD), wy1 = Math.min(img.h - 1, R.y1 + PAD);
  const ring = [];
  for (let y = wy0; y <= wy1; y++) for (let x = wx0; x <= wx1; x++) {
    if (x >= R.x0 && x <= R.x1 && y >= R.y0 && y <= R.y1) continue;
    ring.push(L(img.data, (y * img.w + x) * img.ch));
  }
  ring.sort((a, b) => a - b);
  const bg = ring[ring.length >> 1];
  const W = R.x1 - R.x0 + 1, H = R.y1 - R.y0 + 1, N = W * H;
  const mask = new Uint8Array(N), resid = new Float32Array(N);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const r = L(img.data, ((R.y0 + y) * img.w + R.x0 + x) * img.ch) - bg;
    resid[y * W + x] = r;
    if (r >= RESID_T) mask[y * W + x] = 1;
  }
  const seen = new Uint8Array(N), comps = [];
  for (let i = 0; i < N; i++) {
    if (!mask[i] || seen[i]) continue;
    const st = [i]; seen[i] = 1; let c = 0, s = 0;
    while (st.length) {
      const j = st.pop(), jx = j % W, jy = (j / W) | 0;
      c++; s += resid[j];
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = jx + dx, ny = jy + dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const k = ny * W + nx;
        if (mask[k] && !seen[k]) { seen[k] = 1; st.push(k); }
      }
    }
    if (c >= MINC) comps.push({ c, meanResid: s / c });
  }
  comps.sort((a, b) => b.c - a.c);
  return { bg: +bg.toFixed(1), aboveT: mask.reduce((a, v) => a + v, 0), comps };
}

/* ===================================================================== run */
console.log('='.repeat(88));
console.log('fx22 — candidate 1 scored against PREREG-sandhigh Amendment 1, D1..D4 in registered order');
console.log('='.repeat(88));

const shots = ['temple', 'hero', 'dunes', 'courtyard', 'night', 'interior'];
const IM = {};
for (const s of shots) { IM[`${s}.base`] = load(`${s}.base`); IM[`${s}.gated`] = load(`${s}.gated`); }
IM['temple.back'] = load('temple.back');
for (const [k, v] of Object.entries(IM)) if (!v) { console.log(`MISSING FRAME ${k} — cannot score`); process.exit(1); }

/* per-job gate stamps: the base arms must really be gate-off and the gated arms gate-on */
console.log('\n--- arm stamps (from each job probe; the gate is one uniform on one program) ---');
for (const [k, j] of Object.entries(J.jobs)) {
  const g = j.probe?.gate ?? {};
  console.log(`  ${k.padEnd(18)} uGate.on=${g.on}  lumaMax=${g.lumaMax} rbMax=${g.rbMax} soft=${g.lumaSoft}/${g.rbSoft} min=${g.min}` +
    `  sandHigh live=${j.probe?.sandHigh?.live}  backdropRT=${j.probe?.backdropRT ? `${j.probe.backdropRT.w}x${j.probe.backdropRT.h} bound=${j.probe.backdropRT.bound}` : 'NONE'}`);
}

/* ---------------- D1 ---------------- */
console.log('\n' + '='.repeat(88));
console.log('D1 — selectivity. "Bit-identical, 0 px" = ANY byte differing (threshold stated per §122.1;');
console.log('     the fx21an ΣRGB>=4 count is shown beside it and is NOT the D1 number).');
let d1pass = true;
for (const s of ['hero', 'dunes', 'courtyard']) {
  const d = diffCounts(IM[`${s}.base`], IM[`${s}.gated`]);
  const ok = d.strict === 0;
  d1pass = d1pass && ok;
  console.log(`  ${s.padEnd(10)} base vs gated: strict ${d.strict} px  (ΣRGB>=4: ${d.sum4} px)  ${ok ? 'OK' : '<<< D1 FAIL'}`);
}
{
  const d = diffCounts(IM['temple.base'], IM['temple.back']);
  const ok = d.strict === 0;
  d1pass = d1pass && ok;
  console.log(`  temple     back vs base (restore control): strict ${d.strict} px  (ΣRGB>=4: ${d.sum4} px)  ${ok ? 'OK' : '<<< CONTROL FAIL — temple rows VOID'}`);
}
console.log(`  D1: ${d1pass ? 'PASS' : 'FAIL'}`);

/* ---------------- classifier verification (gates D2) ---------------- */
console.log('\n' + '='.repeat(88));
console.log('CLASSIFIER VERIFICATION (§148.3/§150.2) — must precede D2. The shader arithmetic reproduced');
console.log('on the CPU over the texels the shader samples. Decisive: fires at disc, exactly zero at');
console.log('(520,581). Anchor comparison is a sanity report only — pre-grade vs graded-PNG quantities.');
const probes = ['temple.gated', 'temple.base'].map((k) => [k, J.jobs[k]?.probe?.centres]).filter(([, c]) => c);
let clsOK = null;
for (const [k, c] of probes) {
  for (const [name, v] of Object.entries(c)) {
    if (v.error) { console.log(`  ${k} ${name}: PROBE ERROR ${v.error}`); continue; }
    console.log(`  ${k.padEnd(14)} ${name.padEnd(12)} raw(${v.raw}) enc[${v.enc}] bl=${v.bl} rb=${v.rb} wl=${v.wl} wr=${v.wr} factor=${v.factor} fires=${v.fires}`);
  }
}
const cg = J.jobs['temple.gated']?.probe?.centres;
if (cg?.disc && cg?.nonartefact && !cg.disc.error && !cg.nonartefact.error) {
  const discFires = cg.disc.fires === true && cg.disc.factor === 0;      // backdropMin 0 => full removal at full gate
  const nonZero = cg.nonartefact.wl * cg.nonartefact.wr === 0 && cg.nonartefact.factor === 1;
  clsOK = cg.disc.fires && nonZero;
  console.log(`  disc fires: ${cg.disc.fires} (factor ${cg.disc.factor}${discFires ? ', full' : ', PARTIAL — ramp interior'})   non-artefact weight: ${(cg.nonartefact.wl * cg.nonartefact.wr).toFixed(4)} (must be exactly 0, factor exactly 1: ${nonZero})`);
  console.log(`  anchors (sanity, NOT the test): disc sampled bl=${cg.disc.bl} vs graded-PNG anchor 44.4; non-artefact bl=${cg.nonartefact.bl} vs 76.6`);
  console.log(`  CLASSIFIER: ${clsOK ? 'CORRECT — D2 is scoreable' : 'MISCLASSIFIES'}`);
  if (!clsOK) console.log('  If the sample is also nowhere near the anchor, the transform is wrong and D2 is UNSCOREABLE (registered outcome — not a threshold move).');
} else {
  console.log('  PROBE MISSING/ERRORED at one or both centres — D2 UNSCOREABLE unless the frame evidence is unambiguous; report as registered.');
}

/* ---------------- D2 ---------------- */
console.log('\n' + '='.repeat(88));
console.log(`D2 — removal, not thinning. Detector: residual vs ring-median >= ${RESID_T} (registered Arm B`);
console.log(`     line), components 4-conn >= ${MINC} px, window = registered bbox (602,133)-(659,193) pad 40.`);
const base = IM['temple.base'], gated = IM['temple.gated'];

/* calibration: the detector must find the disc in base (else premise absent, §122.3) */
const calib = discDetect(base, DISC);
console.log(`  calibration on temple.base: ring bg L=${calib.bg}, ${calib.aboveT} px >= +${RESID_T}, components: ` +
  (calib.comps.length ? calib.comps.map((k) => `${k.c}px mean +${k.meanResid.toFixed(2)}`).join(', ') : 'NONE'));
const premise = calib.comps.length > 0;
if (!premise) console.log('  <<< PREMISE ABSENT: the disc is not detectable in temple.base — the artefact is not in this frame (§122.3). D2 cannot be scored on this run.');

/* instrument control: four disc-free windows of the SAME base frame; firing there = invalid instrument */
const CTRL = [[-110, 0], [150, 0], [0, 110], [0, -110]];
let ctrlFired = 0;
for (const [dx, dy] of CTRL) {
  const R = { x0: DISC.x0 + dx, y0: DISC.y0 + dy, x1: DISC.x1 + dx, y1: DISC.y1 + dy };
  if (R.x0 < 0 || R.y0 < 0 || R.x1 >= base.w || R.y1 >= base.h) { console.log(`  control (${dx},${dy}): out of frame, skipped`); continue; }
  const r = discDetect(base, R);
  const fired = r.comps.length > 0;
  ctrlFired += fired ? 1 : 0;
  console.log(`  control (${dx >= 0 ? '+' : ''}${dx},${dy >= 0 ? '+' : ''}${dy}) on base: bg L=${r.bg}, ${r.aboveT} px >= +${RESID_T}, components: ` +
    (fired ? r.comps.map((k) => `${k.c}px +${k.meanResid.toFixed(2)}`).join(', ') + '  <<< FIRED on disc-free region' : 'none'));
}
if (ctrlFired) console.log(`  !! detector fired on ${ctrlFired}/4 disc-free controls — its positive answers are not trustworthy where it fired; adjudicate on the D3 crops (the picture is the finding).`);

/* the test: same detector, unchanged, on gated */
const det = discDetect(gated, DISC);
console.log(`  temple.gated: ring bg L=${det.bg}, ${det.aboveT} px >= +${RESID_T}, components: ` +
  (det.comps.length ? det.comps.map((k) => `${k.c}px mean +${k.meanResid.toFixed(2)}`).join(', ') : 'NONE'));

/* quantitative removal cross-check against the registered anchor (2803 px, +17.28) */
const tComp = components(base, gated);
const discRemoved = tComp.comps.filter((k) => overlaps(k, DISC));
for (const k of discRemoved)
  console.log(`  removed-at-disc component: ${k.c} px ${k.box[0]}x${k.box[1]} at (${k.at[0]},${k.at[1]}) mean ΔL ${k.dL >= 0 ? '+' : ''}${k.dL.toFixed(2)} total|ΔL| ${k.absL.toFixed(0)}   [registered disc: 2803 px, +17.28, 48436]`);
if (!discRemoved.length) console.log('  no removed component overlaps the disc bbox — the gate did not touch the disc.');

const d2pass = premise && det.comps.length === 0 && discRemoved.length > 0;
console.log(`  D2: ${premise ? (d2pass ? 'PASS — the disc has ceased to exist as a >=' + MINC + ' px component' : (det.comps.length ? 'FAIL — residual component(s) survive: thinning, the sandLow failure mode' : 'FAIL — gate did not act on the disc')) : 'UNSCOREABLE (premise absent)'}`);

/* ---------------- D3 ---------------- */
console.log('\n' + '='.repeat(88));
console.log('D3 — the picture, both halves at 4x. Crops written; THE VERDICT IS TAKEN BY LOOKING AT THEM,');
console.log('     and if picture and statistic disagree the picture is the finding.');
const P = 24;
const files = [];
files.push(crop4x(IM['temple.base'], DISC.x0 - P, DISC.y0 - P, DISC.x1 + P, DISC.y1 + P, `${CROPS}/temple-disc-base-4x.png`));
files.push(crop4x(IM['temple.gated'], DISC.x0 - P, DISC.y0 - P, DISC.x1 + P, DISC.y1 + P, `${CROPS}/temple-disc-gated-4x.png`));
files.push(crop4x(IM['temple.base'], NONART.x - 40, NONART.y - 40, NONART.x + 40, NONART.y + 40, `${CROPS}/temple-nonart-base-4x.png`));
files.push(crop4x(IM['temple.gated'], NONART.x - 40, NONART.y - 40, NONART.x + 40, NONART.y + 40, `${CROPS}/temple-nonart-gated-4x.png`));
files.push(crop4x(IM['temple.base'], COLLAT.x0 - P, COLLAT.y0 - P, COLLAT.x1 + P, COLLAT.y1 + P, `${CROPS}/temple-collat-base-4x.png`));
files.push(crop4x(IM['temple.gated'], COLLAT.x0 - P, COLLAT.y0 - P, COLLAT.x1 + P, COLLAT.y1 + P, `${CROPS}/temple-collat-gated-4x.png`));
for (const f of files) console.log(`  wrote ${f}`);

/* ---------------- D4 ---------------- */
console.log('\n' + '='.repeat(88));
console.log('D4 — anti-proxy: every attenuated component, named. night/interior are the deliberate');
console.log('     false-positive population (§150.3). Registered rule: attenuated >20% => must be the');
console.log('     disc or under ΔL 3.0. Attenuation fraction is unmeasurable without no-sandHigh arms;');
console.log('     removed mean |ΔL| >= 3.0 on a non-disc component is a violation either way (see header).');
let d4viol = 0;
const perShot = {};
for (const s of shots) {
  const r = (s === 'temple') ? tComp : components(IM[`${s}.base`], IM[`${s}.gated`]);
  perShot[s] = r;
  const n = r.comps.length;
  console.log(`\n  ${s}: changed(ΣRGB>=4) ${r.changed} px, total|ΔL| removed ${r.absSum.toFixed(0)}, components >=${MINC}px: ${n}`);
  for (const k of r.comps) {
    const isDisc = s === 'temple' && overlaps(k, DISC);
    const bad = !isDisc && Math.abs(k.dL) >= 3.0;
    if (bad) d4viol++;
    console.log(`    ${String(k.c).padStart(6)} px ${String(k.box[0] + 'x' + k.box[1]).padStart(9)} at (${k.at[0]},${k.at[1]})  removed ΔL ${k.dL >= 0 ? '+' : ''}${k.dL.toFixed(2)}  behind-after rgb(${k.bd.join(',')}) luma ${k.bdLuma.toFixed(1)} R/B ${k.bdRB.toFixed(2)}` +
      (isDisc ? '   = THE DISC' : bad ? '   <<< D4 VIOLATION (non-disc, removed >= 3.0)' : ''));
  }
  if (n) {
    const k = r.comps[0];
    const f = crop4x(IM[`${s}.base`], k.bb[0] - P, k.bb[1] - P, k.bb[2] + P, k.bb[3] + P, `${CROPS}/${s}-biggest-base-4x.png`);
    const g = crop4x(IM[`${s}.gated`], k.bb[0] - P, k.bb[1] - P, k.bb[2] + P, k.bb[3] + P, `${CROPS}/${s}-biggest-gated-4x.png`);
    console.log(`    crops of largest: ${f} / ${g}`);
  }
}
console.log(`\n  D4: ${d4viol === 0 ? 'PASS — every non-disc attenuated component is under removed ΔL 3.0' : `FAIL — ${d4viol} non-disc component(s) with removed mean |ΔL| >= 3.0, named above`}`);

/* ---------------- Arm C (supplementary, cross-boot caveat) ---------------- */
console.log('\n' + '='.repeat(88));
console.log('Arm C (supplementary — registered against fx21-boot baselines that no longer exist as');
console.log('frames; scored here as removed-amount bounds, cross-boot, and labelled as such):');
{
  const nonDiscRemoved = tComp.comps.filter((k) => !overlaps(k, DISC)).reduce((a, k) => a + k.absL, 0);
  const below = tComp.comps.filter((k) => !overlaps(k, DISC));
  console.log(`  temple non-disc removed total |ΔL| = ${nonDiscRemoved.toFixed(0)} across ${below.length} components.`);
  console.log(`  Arm C baseline (non-disc field) 25,192; 15% budget = 3,779. Estimated surviving field`);
  console.log(`  = 25,192 - ${nonDiscRemoved.toFixed(0)} = ${(25192 - nonDiscRemoved).toFixed(0)} (band 21,413..28,971) — ${nonDiscRemoved <= 3779 ? 'INSIDE' : 'OUTSIDE'} the band, cross-boot estimate.`);
  const collat = tComp.comps.filter((k) => overlaps(k, COLLAT) && !overlaps(k, DISC));
  const collatRemoved = collat.reduce((a, k) => a + k.absL, 0);
  console.log(`  per-component clause at the strict-gate collateral (433,68) [baseline 646 px x 1.63 ~= 1053]:`);
  console.log(`    removed there ${collatRemoved.toFixed(0)} — ${collatRemoved <= 0.5 * 1053 ? 'under' : 'OVER'} 50% of its own baseline |ΔL| (cross-boot).`);
}

console.log('\nDone. This file evaluates; the RESULT decides, after the crops have been looked at.');
