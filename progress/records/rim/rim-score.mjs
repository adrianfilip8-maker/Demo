/**
 * PREREG-rim §5-§7 — the REGISTERED scorer. Every gate and band was fixed before the first frame
 * existed and none of them may move afterwards (§141.1). Fail-closed throughout: a validity or
 * pre-flight failure VOIDs and the seal claims NOTHING about either rim path.
 *
 *   node progress/records/rim/rim-score.mjs [dir]        default progress/records/rim1
 *   RIM_DIR=... node progress/records/rim/rim-score.mjs
 *
 * It is written to run against a directory that does not match — no manifest, a manifest from a
 * different seal, missing arms, frames of the wrong size — and say so plainly rather than throw.
 * A scorer that crashes on the wrong input is a scorer nobody dares point at a real capture.
 *
 * ── The three measurements, and why each is a route and not a verdict on a candidate ─────────
 *   M1  which path owns the KEY-side band          display space, off vs screenoff
 *   M2  is the shadow-side band PRESENT in LINEAR  the §333 question, on the raw arm
 *   M3  does the screen rim carry the shadow side  display space, off vs screenoff
 * Nothing here scores a fix, because the seal proposes none. See PREREG-rim §8.
 */
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { readPNG } from '../../../tools/png.mjs';
import { EDGES, profile, SPIKE_L, PF_RGBDIST_MIN, PF_NIGHT_SEP_MAX, KEY5_MEAN_R12 } from './rim-edges.mjs';

const ROOT = path.resolve(import.meta.dirname, '../../..');
const DIR = process.argv[2] || process.env.RIM_DIR || path.join(ROOT, 'progress/records/rim1');

/* ── sealed constants — PREREG-rim §4-§7 ───────────────────────────────────────────────────── */
const SEAL = 'PREREG-rim';
const SHOTS = ['night', 'sly-profile', 'hero'];
const ARMS = ['off', 'screenoff', 'raw', 'cal', 'back'];
const EXPECT_ROWS = 15;
const EXPECT_CHUNKS = 3;
const CAL_U8 = [64, 128, 191];         // debugTerm(4) writes (0.25,0.50,0.75); §333 / linchroma §2
const CAL_MIN_FRAC = 0.05;
const CLIP_MAX = 0.05;
const PF_EDGE_MAX_DROP = 3;
const PF_REPRO_KEY_MIN = 4;            // of the 5 registered SPIKE edges
const M1_SPLIT = 0.70;                 // §7 M1
const M2_DOWNSTREAM = 0.112;           // §7 M2 — Path A's own integrated shadow/lit ratio
const M2_UPSTREAM = 0.056;             // §7 M2 — half of it
const M3_INERT = 1.0;                  // §7 M3, display L
const M3_LIVE = 3.0;

const out = [];
const say = (s = '') => out.push(s);
const mean = (a) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : null);
const n1 = (v, w = 6, d = 2) => (v === null || v === undefined || Number.isNaN(v) ? '—' : v.toFixed(d)).padStart(w);
const mark = (g) => (g === true ? 'PASS' : g === false ? 'FAIL' : ' — ');

/* ── load, tolerantly ──────────────────────────────────────────────────────────────────────── */
function bail(msg, code = 3) {
  console.log(`${SEAL} scorer — cannot score ${path.relative(ROOT, DIR) || DIR}`);
  console.log(`  ${msg}`);
  console.log('  Nothing is claimed. This is not a VOID (a VOID needs a capture to void).');
  process.exit(code);
}
if (!existsSync(DIR)) bail('directory does not exist.');
const MF = path.join(DIR, 'manifest.json');
if (!existsSync(MF)) {
  const seen = readdirSync(DIR).slice(0, 12);
  bail(`no manifest.json. Directory holds: ${seen.length ? seen.join(', ') : '(empty)'}${seen.length === 12 ? ' …' : ''}`);
}
let m;
try { m = JSON.parse(readFileSync(MF, 'utf8')); } catch (e) { bail(`manifest.json is not valid JSON — ${e.message}`); }
if (!Array.isArray(m.rows)) bail(`manifest.json has no \`rows\` array (keys: ${Object.keys(m).join(', ')}).`);
if (m.seal && m.seal !== SEAL) {
  bail(`manifest declares seal "${m.seal}", this scorer is ${SEAL}. Refusing to score another seal's frames.`);
}
{
  const armsSeen = new Set(m.rows.map((r) => r.arm));
  const missing = ARMS.filter((a) => !armsSeen.has(a));
  if (missing.length === ARMS.length) {
    bail(`none of this seal's arms (${ARMS.join('/')}) appear in the manifest — arms present: `
      + `${[...armsSeen].join(', ') || '(none)'}. Wrong capture for this scorer.`);
  }
}

const cache = new Map();
function img(shot, arm) {
  const k = `${shot}.${arm}`;
  if (cache.has(k)) return cache.get(k);
  const r = m.rows.find((q) => q.shot === shot && q.arm === arm);
  let v = null;
  if (r && r.file) { try { v = readPNG(path.join(DIR, r.file)); } catch { v = null; } }
  cache.set(k, v);
  return v;
}

say(`${SEAL} — ${path.relative(ROOT, DIR)}   head ${m.head ? String(m.head).slice(0, 10) : '?'}   `
  + `srcHash ${m.srcHash || '?'}   warmup ${m.warmup ?? '?'}`);
say('');

/* ═══ §6 VALIDITY ══════════════════════════════════════════════════════════════════════════ */
const G = {};
G.V_ROWS = m.rows.length === EXPECT_ROWS;
say(`V_ROWS         ${mark(G.V_ROWS)}   ${m.rows.length} rows (want ${EXPECT_ROWS})`);

const chunks = Array.isArray(m.chunks) ? m.chunks : [];
G.V_CHUNKS = chunks.length === EXPECT_CHUNKS;
const hashes = [...new Set(chunks.map((c) => c.srcHash).filter(Boolean))];
G.V_CHUNK_TREE = chunks.length > 0 && hashes.length === 1 && (!m.srcHash || hashes[0] === m.srcHash);
say(`V_CHUNKS       ${mark(G.V_CHUNKS)}   ${chunks.length} chunks (want ${EXPECT_CHUNKS})`);
say(`V_CHUNK_TREE   ${mark(G.V_CHUNK_TREE)}   src hashes across chunks: ${hashes.join(', ') || '—'}`);

for (const shot of SHOTS) {
  const a = img(shot, 'off'), b = img(shot, 'back');
  let d = null;
  if (a && b && a.w === b.w && a.h === b.h) {
    d = 0;
    for (let i = 0; i < a.w * a.h; i++) {
      const p = i * a.ch, q = i * b.ch;
      if (a.data[p] !== b.data[q] || a.data[p + 1] !== b.data[q + 1] || a.data[p + 2] !== b.data[q + 2]) d++;
    }
  }
  G[`R_${shot}`] = d === null ? null : d === 0;
  say(`${('R_' + shot).padEnd(14)} ${mark(G[`R_${shot}`])}   off-vs-back ${d === null ? '—' : d} px (want 0; §331 warm-up 2)`);
}
for (const shot of SHOTS) {
  const c = img(shot, 'cal');
  let frac = null;
  if (c) {
    let hit = 0;
    for (let i = 0; i < c.w * c.h; i++) {
      const o = i * c.ch;
      if (Math.abs(c.data[o] - CAL_U8[0]) <= 1 && Math.abs(c.data[o + 1] - CAL_U8[1]) <= 1
        && Math.abs(c.data[o + 2] - CAL_U8[2]) <= 1) hit++;
    }
    frac = hit / (c.w * c.h);
  }
  G[`CAL_${shot}`] = frac === null ? null : frac >= CAL_MIN_FRAC;
  say(`${('CAL_' + shot).padEnd(14)} ${mark(G[`CAL_${shot}`])}   (64,128,191)±1 over ${frac === null ? '—' : (100 * frac).toFixed(1) + '%'} (want ≥ ${100 * CAL_MIN_FRAC}%)`);
}

/* ── profile every edge on every arm that carries pixels ───────────────────────────────────── */
const P = {};      // P[arm][shot/id]
for (const arm of ['off', 'screenoff', 'raw']) {
  P[arm] = {};
  for (const e of EDGES) {
    const im = img(e.shot, arm);
    P[arm][`${e.shot}/${e.id}`] = im ? profile(im, e) : null;
  }
}

for (const shot of SHOTS) {
  const raw = img(shot, 'raw');
  let frac = null;
  if (raw) {
    const idx = new Set();
    for (const e of EDGES.filter((q) => q.shot === shot)) {
      const pr = P.off[`${e.shot}/${e.id}`];
      if (pr && !pr.pinned) for (const i of pr.sample) idx.add(i);
    }
    if (idx.size) {
      let clipped = 0;
      for (const i of idx) {
        const o = i * raw.ch;
        if (raw.data[o] >= 255 || raw.data[o + 1] >= 255 || raw.data[o + 2] >= 255) clipped++;
      }
      frac = clipped / idx.size;
    }
  }
  G[`CLIP_${shot}`] = frac === null ? null : frac < CLIP_MAX;
  say(`${('CLIP_' + shot).padEnd(14)} ${mark(G[`CLIP_${shot}`])}   ${frac === null ? '—' : (100 * frac).toFixed(1) + '%'} of measured px at 255 in raw (want < ${100 * CLIP_MAX}%)`);
}

/* ═══ §5 PRE-FLIGHT ════════════════════════════════════════════════════════════════════════ */
say('');
say('edge                          face    BODY     BG    RIM   spike  rgbDst     kept');
const kept = [], dropped = [];
for (const e of EDGES) {
  const k = `${e.shot}/${e.id}`, r = P.off[k];
  let why = null;
  if (!r) why = 'no off frame';
  else if (r.pinned) why = 'PINNED (ink not found in ±6)';
  else if (r.sepRGB < PF_RGBDIST_MIN) why = `BODY↔BG rgb distance ${r.sepRGB.toFixed(1)} < ${PF_RGBDIST_MIN}`;
  if (why) dropped.push({ e, k, why }); else kept.push({ e, k, r });
  say(`  ${k.padEnd(28)}${e.face.padEnd(8)}`
    + `${r ? n1(r.BODY) + n1(r.BG) + n1(r.RIM) + n1(r.spike, 8) + n1(r.sepRGB, 8, 1) : '     —     —     —       —       —'}`
    + `   ${why ? 'DROP  ' + why : 'yes'}`);
}
G.PF_EDGE = dropped.length <= PF_EDGE_MAX_DROP && kept.length > 0;
say('');
say(`PF_EDGE        ${mark(G.PF_EDGE)}   ${dropped.length} dropped (allow ≤ ${PF_EDGE_MAX_DROP}), ${kept.length} kept`);

const key5 = kept.filter((q) => q.e.spike5);
const shadowE = kept.filter((q) => q.e.face === 'SHADOW');
const key5Hit = key5.filter((q) => q.r.spike >= SPIKE_L).length;
/* `key5.length >= PF_REPRO_KEY_MIN` too, or PF_EDGE dropping SPIKE edges could satisfy this
   gate with fewer edges than it was sized for — a gate that gets easier as the data gets worse. */
G.PF_REPRO_KEY = key5.length ? (key5Hit >= PF_REPRO_KEY_MIN && key5.length >= PF_REPRO_KEY_MIN) : null;
say(`PF_REPRO_KEY   ${mark(G.PF_REPRO_KEY)}   ${key5Hit}/${key5.length} SPIKE edges ≥ ${SPIKE_L.toFixed(1)} L (want ≥ ${PF_REPRO_KEY_MIN} of ≥ ${PF_REPRO_KEY_MIN} kept) — §328: prove the runner reproduces the defect`);
const shadowHit = shadowE.filter((q) => q.r.spike >= SPIKE_L).length;
G.PF_REPRO_SHADOW = shadowE.length ? shadowHit === 0 : null;
say(`PF_REPRO_SHAD  ${mark(G.PF_REPRO_SHADOW)}   ${shadowHit}/${shadowE.length} SHADOW edges ≥ ${SPIKE_L.toFixed(1)} L (want 0); mean shadow spike ${n1(mean(shadowE.map((q) => q.r.spike)), 5)} L`);
const nightE = kept.filter((q) => q.e.shot === 'night');
G.PF_NIGHT = nightE.length
  ? nightE.every((q) => q.r.spike < SPIKE_L && Math.abs(q.r.BODY - q.r.BG) <= PF_NIGHT_SEP_MAX) : null;
say(`PF_NIGHT       ${mark(G.PF_NIGHT)}   night |BODY−BG| ${nightE.map((q) => Math.abs(q.r.BODY - q.r.BG).toFixed(1)).join(' / ') || '—'} L (want ≤ ${PF_NIGHT_SEP_MAX})`);

const VALID = Object.entries(G).every(([, v]) => v === true);

/* ═══ §7 THE MEASUREMENTS ══════════════════════════════════════════════════════════════════ */
const sp = (arm, k) => { const r = P[arm][k]; return r && !r.pinned ? r.spike : null; };
const defined = (a) => a.filter((v) => v !== null && v !== undefined && !Number.isNaN(v));

/* M1 — who owns the key-side band (display space) */
const offKey = defined(key5.map((q) => sp('off', q.k)));
const surfKey = defined(key5.map((q) => sp('screenoff', q.k)));
const scrKey = defined(key5.map((q) => {
  const a = sp('off', q.k), b = sp('screenoff', q.k);
  return a === null || b === null ? null : a - b;
}));
const mOff = mean(offKey), mSurf = mean(surfKey), mScr = mean(scrKey);
const M1 = (mOff === null || mSurf === null || mScr === null) ? null
  : (mSurf >= M1_SPLIT * mOff ? 'SURFACE-OWNED' : mScr >= M1_SPLIT * mOff ? 'SCREEN-OWNED' : 'SHARED');

/* M2 — is the shadow-side band present in LINEAR (per shot, then averaged; §4) */
const perShot = [];
for (const shot of ['hero', 'sly-profile']) {
  const k5 = defined(key5.filter((q) => q.e.shot === shot).map((q) => sp('raw', q.k)));
  const sh = defined(shadowE.filter((q) => q.e.shot === shot).map((q) => sp('raw', q.k)));
  const a = mean(k5), b = mean(sh);
  perShot.push({ shot, key: a, shadow: b, r: (a !== null && b !== null && a > 1e-9) ? b / a : null });
}
const Rlin = mean(defined(perShot.map((q) => q.r)));
const M2 = Rlin === null ? null
  : (Rlin >= M2_DOWNSTREAM ? 'DOWNSTREAM' : Rlin <= M2_UPSTREAM ? 'UPSTREAM' : 'INCONCLUSIVE');

/* M3 — does the screen rim carry the shadow side (display space) */
const scrShadow = defined(shadowE.map((q) => {
  const a = sp('off', q.k), b = sp('screenoff', q.k);
  return a === null || b === null ? null : a - b;
}));
const Sscreen = mean(scrShadow);
const M3 = Sscreen === null ? null
  : (Sscreen <= M3_INERT ? 'SCREEN-RIM-INERT' : Sscreen >= M3_LIVE ? 'SCREEN-RIM-LIVE' : 'INCONCLUSIVE');

say('');
say('── §7 MEASUREMENTS ────────────────────────────────────────────────────────────────────');
say(`KEY5 mean spike(off)      ${n1(mOff, 7)} L      (r12 reference ${KEY5_MEAN_R12.toFixed(2)} L)`);
say(`  share_surf   (screenoff) ${n1(mSurf, 6)} L      bar for SURFACE-OWNED ≥ ${n1(mOff === null ? null : M1_SPLIT * mOff, 5)}`);
say(`  share_screen (off−scr.)  ${n1(mScr, 6)} L      bar for SCREEN-OWNED  ≥ ${n1(mOff === null ? null : M1_SPLIT * mOff, 5)}`);
say(`M1  ${M1 || '—'}`);
say('');
for (const q of perShot) say(`  raw linear spike  ${q.shot.padEnd(12)} KEY ${n1(q.key, 7)}   SHADOW ${n1(q.shadow, 7)}   ratio ${n1(q.r, 7, 3)}`);
say(`Rlin (mean of per-shot ratios)   ${n1(Rlin, 6, 3)}      DOWNSTREAM ≥ ${M2_DOWNSTREAM}  ·  UPSTREAM ≤ ${M2_UPSTREAM}`);
say(`M2  ${M2 || '—'}   (night carries no key-side reference and is excluded by §4)`);
say('');
say(`Sscreen  mean over SHADOW edges of spike(off) − spike(screenoff)   ${n1(Sscreen, 6)} L`);
say(`         INERT ≤ ${M3_INERT.toFixed(1)}  ·  LIVE ≥ ${M3_LIVE.toFixed(1)}   (Path B's own contract owes 0.45 × ${n1(mOff, 5)} = ${n1(mOff === null ? null : 0.45 * mOff, 5)} L)`);
say(`M3  ${M3 || '—'}`);

for (const l of out) console.log(l);
console.log('');
if (!VALID) {
  console.log('==> VOID — a validity or pre-flight gate failed; NOTHING is claimed about either rim path.');
  console.log('    ' + Object.entries(G).map(([k, v]) => `${k} ${v === true ? 'ok' : v === false ? 'FAIL' : '—'}`).join(' · '));
  process.exit(1);
}
console.log(`==> VALID.  M1 ${M1}  ·  M2 ${M2}  ·  M3 ${M3}`);
console.log('    §9 BINDING LOOK is not scoreable here and is NOT satisfied by this exit code:');
console.log('      1. night.off vs night.screenoff at 1× and 6× — indistinguishable overrules SCREEN-RIM-LIVE');
console.log('      2. hero.off / sly-profile.off shadow-side silhouette against §7.3 by eye');
console.log('      3. hero.raw must be a recognisable scene, or M2 is VOID');
console.log('    This seal proposes no candidate and ships nothing (§8). Its product is the route.');
