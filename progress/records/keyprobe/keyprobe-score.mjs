/**
 * PREREG-keyprobe §4-§6 — the REGISTERED scorer. Every gate and band was fixed before the first
 * frame existed and none of them may move afterwards (§141.1). Fail-closed throughout.
 *
 *   node progress/records/keyprobe/keyprobe-score.mjs [dir]     default progress/records/keyprobe1
 *
 * Written to run against a directory that does not match — no manifest, another seal's manifest,
 * missing arms, wrong-sized frames — and say so plainly rather than throw. A scorer that crashes on
 * the wrong input is a scorer nobody dares point at a real capture.
 *
 * The instrument proves itself on TWO known rects before the unknown one is read (§340): `LIT_R`
 * must carry high key and `CAST_L` must carry none. A one-sided control proves only that a number
 * moves; two-sided proves the channel spans the range the question lives in.
 */
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { readPNG } from '../../../tools/png.mjs';

const ROOT = path.resolve(import.meta.dirname, '../../..');
const DIR = process.argv[2] || process.env.KEYPROBE_DIR || path.join(ROOT, 'progress/records/keyprobe1');

/* ── sealed constants — PREREG-keyprobe §2-§6 ─────────────────────────────────────────────── */
const SEAL = 'PREREG-keyprobe';
const SHOT = 'courtyard';
const ARMS = ['off', 'cal', 'term5', 'term6', 'back'];
const EXPECT_ROWS = 5;
const CAL_U8 = [64, 128, 191];
const CAL_MIN_FRAC = 0.05;
/* §2 — verbatim from shadowtint/roi.json, not re-drawn (§141.1). */
const RECTS = {
  SHADE_R: { roi: [1020, 260, 90, 130], cls: 'shade-terminator', note: "colossus-R shade face — §336's R/G 3.74" },
  CAST_L: { roi: [70, 150, 280, 300], cls: 'shade-cast', note: 'colossus-L cast-shadowed twin — the negative control' },
  LIT_R: { roi: [872, 300, 60, 210], cls: 'lit', note: 'colossus-R lit face — the positive control' },
  GROUND: { roi: [380, 600, 520, 110], cls: 'both', note: 'courtyard ground — descriptive only' },
};
const PF_KEY_HI = 0.50;      // §5 — LIT_R must reach this
const PF_KEY_LO = 0.02;      // §5 — CAST_L must not exceed this
const K1_KEYED = 0.10;       // §6
const K1_DARK = 0.02;        // §6 — deliberately PF_KEY_LO's own bar, not a new constant
const RAMP_FLOOR = 0.02;     // §6 — sh = key/ramp only where ramp exceeds this

const say = console.log;
const n3 = (v) => (v === null || v === undefined || Number.isNaN(v) ? '   —  ' : v.toFixed(4).padStart(6));
const mark = (g) => (g === true ? 'PASS' : g === false ? 'FAIL' : ' — ');

function bail(msg, code = 3) {
  say(`${SEAL} scorer — cannot score ${path.relative(ROOT, DIR) || DIR}`);
  say(`  ${msg}`);
  say('  Nothing is claimed. This is not a VOID (a VOID needs a capture to void).');
  process.exit(code);
}
if (!existsSync(DIR)) bail('directory does not exist.');
const MF = path.join(DIR, 'manifest.json');
if (!existsSync(MF)) {
  const seen = readdirSync(DIR).slice(0, 12);
  bail(`no manifest.json. Directory holds: ${seen.length ? seen.join(', ') : '(empty)'}`);
}
let m;
try { m = JSON.parse(readFileSync(MF, 'utf8')); } catch (e) { bail(`manifest.json is not valid JSON — ${e.message}`); }
if (!Array.isArray(m.rows)) bail(`manifest.json has no \`rows\` array (keys: ${Object.keys(m).join(', ')}).`);
if (m.seal && m.seal !== SEAL) bail(`manifest declares seal "${m.seal}"; this scorer is ${SEAL}. Refusing to score another seal's frames.`);
{
  const seen = new Set(m.rows.map((r) => r.arm));
  if (!ARMS.some((a) => seen.has(a))) {
    bail(`none of this seal's arms (${ARMS.join('/')}) appear — arms present: ${[...seen].join(', ') || '(none)'}.`);
  }
}

const cache = new Map();
function img(arm) {
  if (cache.has(arm)) return cache.get(arm);
  const r = m.rows.find((q) => q.arm === arm);
  let v = null;
  if (r && r.file) { try { v = readPNG(path.join(DIR, r.file)); } catch { v = null; } }
  cache.set(arm, v);
  return v;
}

/** Mean of each channel over a rect, as byte/255 — UNDECODED (CAL proves that, §333). */
function rectMean(im, [x, y, w, h]) {
  if (!im) return null;
  if (x < 0 || y < 0 || x + w > im.w || y + h > im.h) return null;
  let r = 0, g = 0, b = 0, n = 0;
  for (let j = y; j < y + h; j++) {
    for (let i = x; i < x + w; i++) {
      const o = (j * im.w + i) * im.ch;
      r += im.data[o]; g += im.data[o + 1]; b += im.data[o + 2]; n++;
    }
  }
  return { ramp: r / n / 255, ndl: g / n / 255, key: b / n / 255, n };
}

/** sh = key/ramp, averaged over texels whose ramp clears the floor (§6). */
function shMean(im, [x, y, w, h]) {
  if (!im) return null;
  if (x < 0 || y < 0 || x + w > im.w || y + h > im.h) return null;
  let s = 0, n = 0, skipped = 0;
  for (let j = y; j < y + h; j++) {
    for (let i = x; i < x + w; i++) {
      const o = (j * im.w + i) * im.ch;
      const ramp = im.data[o] / 255, key = im.data[o + 2] / 255;
      if (ramp > RAMP_FLOOR) { s += key / ramp; n++; } else skipped++;
    }
  }
  return { sh: n ? s / n : null, used: n, skipped };
}

say(`${SEAL} — ${path.relative(ROOT, DIR)}   head ${m.head ? String(m.head).slice(0, 10) : '?'}   `
  + `srcHash ${m.srcHash || '?'}   warmup ${m.warmup ?? '?'}`);
say('');

/* ═══ §4 VALIDITY ═════════════════════════════════════════════════════════════════════════ */
const G = {};
G.V_ROWS = m.rows.length === EXPECT_ROWS;
say(`V_ROWS       ${mark(G.V_ROWS)}   ${m.rows.length} rows (want ${EXPECT_ROWS})`);

{
  const a = img('off'), b = img('back');
  let d = null;
  if (a && b && a.w === b.w && a.h === b.h) {
    d = 0;
    for (let i = 0; i < a.w * a.h; i++) {
      const p = i * a.ch, q = i * b.ch;
      if (a.data[p] !== b.data[q] || a.data[p + 1] !== b.data[q + 1] || a.data[p + 2] !== b.data[q + 2]) d++;
    }
  }
  G.R_bracket = d === null ? null : d === 0;
  say(`R_bracket    ${mark(G.R_bracket)}   off-vs-back ${d === null ? '—' : d} px (want 0; §331 warm-up ${m.warmup ?? '?'})`);
}
{
  const c = img('cal');
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
  G.CAL = frac === null ? null : frac >= CAL_MIN_FRAC;
  say(`CAL          ${mark(G.CAL)}   (${CAL_U8.join(',')})±1 over ${frac === null ? '—' : (100 * frac).toFixed(1) + '%'} (want ≥ ${100 * CAL_MIN_FRAC}%)`);
}

const validityOK = G.V_ROWS === true && G.R_bracket === true && G.CAL === true;

/* ═══ the rect table, on term5 ════════════════════════════════════════════════════════════ */
const t5 = img('term5');
say('');
say(`term5 = vec3( ramp, ndl, key ), undecoded byte/255   (frame ${t5 ? `${t5.w}x${t5.h}` : 'MISSING'})`);
say(`${'rect'.padEnd(9)}${'class'.padEnd(18)}${'ramp'.padStart(7)}${'ndl'.padStart(7)}${'key'.padStart(7)}${'sh=key/ramp'.padStart(13)}`);
say('-'.repeat(61));
const M = {};
for (const [id, r] of Object.entries(RECTS)) {
  const mm = rectMean(t5, r.roi);
  const sm = shMean(t5, r.roi);
  M[id] = { ...(mm || {}), sh: sm?.sh ?? null, used: sm?.used ?? null, skipped: sm?.skipped ?? null };
  say(`${id.padEnd(9)}${r.cls.padEnd(18)}${n3(mm?.ramp)} ${n3(mm?.ndl)} ${n3(mm?.key)}${n3(sm?.sh).padStart(13)}`);
}

/* ═══ §5 PRE-FLIGHT — the two-sided instrument proof ══════════════════════════════════════ */
say('');
G.PF_KEY_HI = M.LIT_R.key === undefined || M.LIT_R.key === null ? null : M.LIT_R.key >= PF_KEY_HI;
G.PF_KEY_LO = M.CAST_L.key === undefined || M.CAST_L.key === null ? null : M.CAST_L.key <= PF_KEY_LO;
say(`PF_KEY_HI    ${mark(G.PF_KEY_HI)}   LIT_R  key ${n3(M.LIT_R.key)} (want ≥ ${PF_KEY_HI}) — a lit face must carry direct key`);
say(`PF_KEY_LO    ${mark(G.PF_KEY_LO)}   CAST_L key ${n3(M.CAST_L.key)} (want ≤ ${PF_KEY_LO}) — the record states sh=0 here`);

const preflightOK = G.PF_KEY_HI === true && G.PF_KEY_LO === true;

/* ═══ §6 THE MEASUREMENT ══════════════════════════════════════════════════════════════════ */
say('');
if (!validityOK || !preflightOK) {
  const failed = Object.entries(G).filter(([, v]) => v !== true).map(([k]) => k);
  say(`VERDICT: VOID — gate(s) not passed: ${failed.join(', ')}`);
  say('K1 is NOT read. Nothing is claimed about the shade face (§10: any gate FAIL ⇒ VOID).');
  process.exit(1);
}

const K1 = M.SHADE_R.key;
const verdict = K1 >= K1_KEYED ? 'KEYED' : (K1 <= K1_DARK ? 'DARK' : 'INCONCLUSIVE');
say(`K1 = mean key over SHADE_R = ${n3(K1)}   (KEYED ≥ ${K1_KEYED} · DARK ≤ ${K1_DARK})`);
say(`derived sh on SHADE_R = ${n3(M.SHADE_R.sh)}   (forecast §7: 0.3–0.7)`);
say('');
say(`VERDICT: K1 = ${verdict}`);
if (verdict === 'KEYED') {
  say('  The shade face IS still receiving direct key. §342.2\'s corrected reading holds: the redness');
  say('  is a KEY LEAK, the shadow wash never had full authority there, and the successor\'s lever is');
  say('  whatever closes that leak — not the albedo and not shadowHold.');
} else if (verdict === 'DARK') {
  say('  The face is fully shadowed and §342.2\'s corrected reading is REFUTED. The wash had full');
  say('  authority and granite still lands at 3.74, which sends the item back to the ALBEDO (§342)');
  say('  as the only remaining term. This is the condition §7 registered as refuting my reading.');
} else {
  say('  Between the bands. Claim neither, and do not reinterpret them (§10).');
}
say('');
say(`cross-check (NOT load-bearing — term6\'s sh is gated by step(0.02, ndl), §1):`);
{
  const t6 = img('term6');
  for (const id of ['LIT_R', 'CAST_L', 'SHADE_R']) {
    const mm = rectMean(t6, RECTS[id].roi);
    say(`  ${id.padEnd(9)} term6 blue (sh·step) ${n3(mm?.key)}`);
  }
}
say('');
say('§9 BINDING LOOK still owed: term5 must show recognisable structure, and CAST_L must be visibly');
say('darker in blue than LIT_R. A LOOK failure is a NO-CLAIM on the row it touches.');
