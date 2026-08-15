/**
 * PREREG-litbleach §5-§8 — the registered scorer. Reads progress/records/litbleach1/ and prints
 * the verdict through tools/gate.mjs (VOID is not PASS; ship = every row PASS AND the §9 LOOK).
 *
 *   node progress/records/litbleach/litbleach-score.mjs
 *
 * Every band in this file was fixed in PREREG-litbleach.md before the first frame existed.
 * Nothing here may be re-derived after looking at the capture (§141.1): a mis-aimed bar is a
 * NO-SHIP with the mis-aim recorded, and a re-seal is a NEW file.
 *
 * Fail-closed order (§11): PRE-FLIGHT and validity gate everything. If PF_MASK / PF_STAGE / R /
 * V_ROWS fail, the acceptance and protection rows are VOID and NOTHING is claimed about the
 * candidate in either direction. That is the §328 rule made mechanical — a runner that does not
 * reproduce the defect must not be allowed to produce a verdict about a fix for it.
 */
import { readPNG } from '../../../tools/png.mjs';
import { shipVerdict, verdictLine } from '../../../tools/gate.mjs';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '../../..');
const DIR = process.env.LITBLEACH_DIR || path.join(ROOT, 'progress/records/litbleach1');
const DOSE = ['traversal', 'combat'];
const CONTROL = 'sly-key';
const ROSTER = [...DOSE, CONTROL];
const EXPECT_ROWS = 14;
const REF_HUE = 213.5;                       // §3 — the authored costume hue
const DILATE = 3;                            // px — PROT_ENV's registered halo exclusion

/* ── registered rects (§3; carried over from lithold unchanged, validated against r13) ────── */
const RECT = {
  traversal: [557, 261, 582, 291],
  combat: [520, 468, 566, 522],
  'sly-key': [600, 228, 675, 290],
};

/* ── the sealed bands (§5, §7, §8) ────────────────────────────────────────────────────────── */
const PF_MASK_MIN = 0.60;                    // §5 — fraction of the rect that must be subject
const PF_S_MAX = { traversal: 0.30, combat: 0.18 };
const PF_CTL_MIN = 0.42;
const PF_CTL_RATIO = 2.0;
const E_MIN = { traversal: 0.42, combat: 0.30 };   // §7 E1/E2
const E_HUE_TOL = 25;                              // §7 E3/E4, degrees
const LUM_TOL = 3.0;                               // §7 LUM
const CTL_MIN = 0.42, CTL_DRIFT = 0.06;            // §8 PROT_CTL

/* ── AMENDMENT A1: merge the per-shot chunk manifests ─────────────────────────────────────── */
if (!existsSync(DIR)) { console.error(`no capture dir at ${DIR} — capture first`); process.exit(3); }
const chunkFiles = readdirSync(DIR).filter((f) => /^manifest\.[a-z-]+\.json$/.test(f)).sort();
if (!chunkFiles.length) {
  console.error(`no chunk manifests at ${DIR} — expected manifest.<shot>.json (AMENDMENT A1); capture first`);
  process.exit(3);
}
const chunks = chunkFiles.map((f) => JSON.parse(readFileSync(path.join(DIR, f), 'utf8')));
const manifest = { rows: chunks.flatMap((c) => c.rows) };
const row = (shot, arm) => manifest.rows.find((r) => r.shot === shot && r.arm === arm) || null;
const img = (r) => { try { return r ? readPNG(path.join(DIR, r.file)) : null; } catch { return null; } };

const lum = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
function hsv(R, G, B) {
  R /= 255; G /= 255; B /= 255;
  const mx = Math.max(R, G, B), mn = Math.min(R, G, B), d = mx - mn;
  let h = 0;
  if (d > 1e-6) {
    if (mx === R) h = 60 * (((G - B) / d) % 6);
    else if (mx === G) h = 60 * ((B - R) / d + 2);
    else h = 60 * ((R - G) / d + 4);
  }
  if (h < 0) h += 360;
  return { h, s: mx > 1e-6 ? d / mx : 0, v: mx };
}
/** §3 — the brightest half of the rect. */
function litMask(im, [x0, y0, x1, y1]) {
  const px = [];
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
    const o = (y * im.w + x) * im.ch;
    px.push({ i: y * im.w + x, L: lum(im.data[o], im.data[o + 1], im.data[o + 2]) });
  }
  px.sort((a, b) => b.L - a.L);
  return px.slice(0, Math.max(1, Math.round(px.length / 2))).map((p) => p.i);
}
/** §3 — S, chroma-weighted circular H, and L over a pixel set. */
function stats(im, mask) {
  let sS = 0, sL = 0, cx = 0, cy = 0;
  for (const i of mask) {
    const o = i * im.ch;
    const { h, s, v } = hsv(im.data[o], im.data[o + 1], im.data[o + 2]);
    sS += s; sL += lum(im.data[o], im.data[o + 1], im.data[o + 2]);
    const c = s * v; cx += c * Math.cos(h * Math.PI / 180); cy += c * Math.sin(h * Math.PI / 180);
  }
  let H = (Math.atan2(cy, cx) * 180) / Math.PI; if (H < 0) H += 360;
  return { S: sS / mask.length, H, L: sL / mask.length };
}
const hueDelta = (a, b) => { let d = Math.abs(a - b) % 360; return d > 180 ? 360 - d : d; };
function diffPx(a, b) {
  if (!a || !b || a.w !== b.w || a.h !== b.h) return null;
  let n = 0;
  for (let i = 0; i < a.w * a.h; i++) {
    const oa = i * a.ch, ob = i * b.ch;
    if (a.data[oa] !== b.data[ob] || a.data[oa + 1] !== b.data[ob + 1] || a.data[oa + 2] !== b.data[ob + 2]) n++;
  }
  return n;
}
/** §8 PROT_ENV — differing px farther than r (Chebyshev) from any subject pixel. */
function diffOutsideMask(a, b, mk, r) {
  if (!a || !b || !mk) return null;
  const W = a.w, H = a.h;
  const near = new Uint8Array(W * H), tmp = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) if (mk.data[i * mk.ch] >= 128) near[i] = 1;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    let v = 0;
    for (let k = -r; k <= r && !v; k++) { const xx = x + k; if (xx >= 0 && xx < W && near[y * W + xx]) v = 1; }
    tmp[y * W + x] = v;
  }
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    let v = 0;
    for (let k = -r; k <= r && !v; k++) { const yy = y + k; if (yy >= 0 && yy < H && tmp[yy * W + x]) v = 1; }
    near[y * W + x] = v;
  }
  let inside = 0, outside = 0;
  for (let i = 0; i < W * H; i++) {
    const oa = i * a.ch, ob = i * b.ch;
    if (a.data[oa] === b.data[ob] && a.data[oa + 1] === b.data[ob + 1] && a.data[oa + 2] === b.data[ob + 2]) continue;
    if (near[i]) inside++; else outside++;
  }
  return { inside, outside };
}
/** §5 PF_MASK — fraction of the rect the msk arm marks as subject (R = vSlySkin). */
function subjFrac(mk, [x0, y0, x1, y1]) {
  let hit = 0, n = 0;
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
    if (mk.data[(y * mk.w + x) * mk.ch] >= 128) hit++;
    n++;
  }
  return n ? hit / n : null;
}

const guards = {};
const report = [];
const M = {};

/* ── measure every arm over its registered rect (mask taken from the OFF arm, per §3) ─────── */
for (const shot of ROSTER) {
  const off = img(row(shot, 'off'));
  if (!off) { M[shot] = null; continue; }
  const mask = litMask(off, RECT[shot]);
  M[shot] = {};
  for (const arm of ['off', 'on', 'ko', 'back']) {
    const im = img(row(shot, arm));
    if (im) M[shot][arm] = stats(im, mask);
  }
  const m = M[shot];
  report.push(`M  ${shot.padEnd(11)} off S ${m.off.S.toFixed(3)} H ${m.off.H.toFixed(1)} L ${m.off.L.toFixed(1)}  |  on S ${m.on?.S.toFixed(3)} H ${m.on?.H.toFixed(1)} L ${m.on?.L.toFixed(1)}  |  ko S ${m.ko?.S.toFixed(3)}`);
}

/* ── V_ROWS ───────────────────────────────────────────────────────────────────────────────── */
guards.V_ROWS = manifest.rows.length === EXPECT_ROWS;
report.push(`V_ROWS  ${manifest.rows.length} rows (want ${EXPECT_ROWS})`);

/* ── V_CHUNKS / V_CHUNK_TREE — AMENDMENT A1's replacement for single-process V-TREE ────────── */
{
  const have = chunks.map((c) => c.shot).sort();
  const wantChunks = [...ROSTER].sort();
  guards.V_CHUNKS = JSON.stringify(have) === JSON.stringify(wantChunks);
  report.push(`V_CHUNKS  chunks present [${have.join(', ')}] (want [${wantChunks.join(', ')}])`);

  const hashes = [...new Set(chunks.map((c) => c.srcHash))];
  guards.V_CHUNK_TREE = hashes.length === 1;
  report.push(`V_CHUNK_TREE  ${hashes.length} distinct src hash(es) across ${chunks.length} chunk(s): ${hashes.join(', ')} (want exactly 1)`);
  for (const c of chunks) report.push(`   chunk ${String(c.shot).padEnd(11)} head ${String(c.head).slice(0, 12)} src ${c.srcHash} at ${c.capturedAt}`);
}

/* ── R — same-boot bracket (§6) ───────────────────────────────────────────────────────────── */
for (const shot of ROSTER) {
  const d = diffPx(img(row(shot, 'off')), img(row(shot, 'back')));
  report.push(`R  ${shot.padEnd(11)} off-vs-back ${d} px (want 0)`);
  guards[`R_${shot}`] = d === null ? null : d === 0;
}

/* ── PF_MASK (§5) — is the rect actually on Sly in THIS boot? ─────────────────────────────── */
for (const shot of DOSE) {
  const mk = img(row(shot, 'msk'));
  const f = mk ? subjFrac(mk, RECT[shot]) : null;
  report.push(`PF_MASK ${shot.padEnd(10)} rect is ${f === null ? '—' : (100 * f).toFixed(1) + '%'} subject (want >= ${100 * PF_MASK_MIN}%)`);
  guards[`PF_MASK_${shot}`] = f === null ? null : f >= PF_MASK_MIN;
}

/* ── PF_STAGE (§5) — does this staging CONTAIN the diagnosed defect? ──────────────────────── */
{
  const t = M.traversal?.off, c = M.combat?.off, k = M[CONTROL]?.off;
  const ok = t && c && k
    ? (t.S <= PF_S_MAX.traversal && c.S <= PF_S_MAX.combat && k.S >= PF_CTL_MIN && k.S >= PF_CTL_RATIO * t.S)
    : null;
  report.push(`PF_STAGE  traversal ${t ? t.S.toFixed(3) : '—'} <= ${PF_S_MAX.traversal} · combat ${c ? c.S.toFixed(3) : '—'} <= ${PF_S_MAX.combat} · ctl ${k ? k.S.toFixed(3) : '—'} >= ${PF_CTL_MIN} and >= ${PF_CTL_RATIO}x traversal`);
  guards.PF_STAGE = ok;
}

const PREFLIGHT_OK = guards.PF_STAGE === true
  && DOSE.every((s) => guards[`PF_MASK_${s}`] === true)
  && ROSTER.every((s) => guards[`R_${s}`] === true)
  && guards.V_ROWS === true
  && guards.V_CHUNKS === true
  && guards.V_CHUNK_TREE === true;
if (!PREFLIGHT_OK) {
  report.push('!! PRE-FLIGHT/VALIDITY not satisfied — every acceptance and protection row below is VOID by construction (§11).');
}
/* Fail-closed: null (not false) marks VOID so the gate cannot read it as a refutation. */
const gated = (v) => (PREFLIGHT_OK ? v : null);

/* ── ACCEPTANCE (§7) ──────────────────────────────────────────────────────────────────────── */
for (const shot of DOSE) {
  const m = M[shot];
  const sOK = m?.on ? m.on.S >= E_MIN[shot] : null;
  const hOK = m?.on ? hueDelta(m.on.H, REF_HUE) <= E_HUE_TOL : null;
  report.push(`E_S_${shot.padEnd(9)} on S ${m?.on ? m.on.S.toFixed(3) : '—'} >= ${E_MIN[shot]}`);
  report.push(`E_H_${shot.padEnd(9)} on H ${m?.on ? m.on.H.toFixed(1) : '—'}  |dH| ${m?.on ? hueDelta(m.on.H, REF_HUE).toFixed(1) : '—'} <= ${E_HUE_TOL}`);
  guards[`E_S_${shot}`] = gated(sOK);
  guards[`E_H_${shot}`] = gated(hOK);

  const lOK = m?.on ? Math.abs(m.on.L - m.off.L) <= LUM_TOL : null;
  report.push(`LUM_${shot.padEnd(11)} |dL| ${m?.on ? Math.abs(m.on.L - m.off.L).toFixed(2) : '—'} <= ${LUM_TOL}`);
  guards[`LUM_${shot}`] = gated(lOK);
}
{
  const m = M.traversal;
  const ok = m?.ko && m?.on ? (m.off.S < m.ko.S && m.ko.S < m.on.S) : null;
  report.push(`KO  traversal off ${m?.off.S.toFixed(3)} < ko ${m?.ko ? m.ko.S.toFixed(3) : '—'} < on ${m?.on ? m.on.S.toFixed(3) : '—'} (strict)`);
  guards.KO = gated(ok);
}

/* ── PROTECTION (§8) ──────────────────────────────────────────────────────────────────────── */
{
  const k = M[CONTROL];
  const ok = k?.on ? (k.on.S >= CTL_MIN && Math.abs(k.on.S - k.off.S) <= CTL_DRIFT) : null;
  report.push(`PROT_CTL  ${CONTROL} on S ${k?.on ? k.on.S.toFixed(3) : '—'} >= ${CTL_MIN}, drift ${k?.on ? Math.abs(k.on.S - k.off.S).toFixed(3) : '—'} <= ${CTL_DRIFT}`);
  guards.PROT_CTL = gated(ok);
}
for (const shot of DOSE) {
  const d = diffOutsideMask(img(row(shot, 'off')), img(row(shot, 'on')), img(row(shot, 'msk')), DILATE);
  report.push(`PROT_ENV ${shot.padEnd(10)} ${d ? d.inside : '—'} px inside mask+${DILATE}, ${d ? d.outside : '—'} px BEYOND (want 0)`);
  guards[`PROT_ENV_${shot}`] = gated(d ? d.outside === 0 : null);
}

for (const line of report) console.log(line);
console.log('');
const v = shipVerdict(guards);
for (const [k, s] of Object.entries(v.states)) console.log(`  ${k.padEnd(20)} ${s}`);
console.log('');
console.log(verdictLine(v, `TUNE.subjLitHold = 0.70 (litbleach — roster-staged one-boot poke A/B; PREREG-litbleach §9's BINDING LOOK still gates any write: traversal.on and combat.on must read unmistakably blue, nothing outside Sly may move, and the costume must keep its shading bands — a flat blue silhouette FAILS the look at any S)`));
process.exit(v.ship ? 0 : 1);
